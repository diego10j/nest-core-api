import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { envs } from 'src/config/envs';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { FileTempService } from 'src/core/modules/sistema/files/file-temp.service';
import { NotificacionesService } from 'src/core/modules/sistema/notificaciones/notificaciones.service';

import { ChatLockService } from '../chat-lock.service';
import { WhatsappGateway } from '../whatsapp.gateway';
import { YcloudWindowService } from '../ycloud/ycloud-window.service';
import { YcloudService } from '../ycloud/ycloud.service';

import { BotConfigService } from './bot-config.service';
import { BotDebounceService } from './bot-debounce.service';
import { BotGptService } from './bot-gpt.service';
import { BotNoDisponibleService } from './bot-no-disponible.service';
import { BotProformaService, ResultadoProforma } from './bot-proforma.service';
import { BotSessionService } from './bot-session.service';
import { BotToolsService } from './bot-tools.service';
import {
  ClienteSesion, DatosSesion, ItemCotizacionRapida, OpcionProducto, PendienteCantidad, PendienteUso, ProductoSesion,
} from './interfaces/bot-session.interface';
import { BotState } from './interfaces/bot-state.enum';
import { matchProvinciaEcuador } from './provincias-ecuador';

// ─── Constantes de negocio ────────────────────────────────────────────────────
// Con plural incluido (ASESOR/ASESORES, AGENTE/AGENTES, etc.) — antes solo matcheaba la
// forma singular exacta, así que "hay asesores humanos?" no disparaba nada (caso real
// detectado 2026-09-17: un proveedor preguntó eso y el bot igual le pidió cotizar).
const PALABRAS_ASESOR = /\bASESOR(ES)?\b|\bAGENTES?\b|\bHUMANOS?\b|\bPERSONAS?\b|\bVENDEDOR(ES)?\b/i;
const REGEX_SALIR = /^SALIR$/i;
const REGEX_SALUDO = /^(hola|buenas?|buenos?\s*(d[ií]as?|tardes?|noches?)|saludos?|hey)[\s!.,]*$/i;

// Categorías que casi nunca están en el catálogo de materias primas (sabor/color/fragancia/aceite).
// Cuando la búsqueda coincide con esto, se evita el fallback difuso (evita falsos positivos tipo
// "de mango" → "MANTECA DE MANGO") y, si no hay match exacto, se ofrece cotizar como ítem genérico.
const REGEX_PRODUCTO_GENERICO = /\b(sabor(?:es|izantes?)?|colorantes?|colores?|fragancias?|aceites?|esencias?)\b/i;
const PRODUCTO_GENERICO_IDE_INARTI = 2102;
const LIMITE_COINCIDENCIAS = 3;

// Turnos máximos del modo mensajes reducidos sin concretar (ni cotización automática ni
// catálogo resuelto) antes de derivar a un asesor humano — evita que el bot insista
// indefinidamente en una conversación que ya debería atender una persona.
const LIMITE_MENSAJES_REDUCIDO = 10;

// IDs de todos los botones interactivos usados en el flujo. WhatsApp no invalida un
// botón viejo cuando la conversación avanza — sigue siendo tocable en el historial del
// chat indefinidamente. Si el cliente toca uno de un paso anterior mientras el bot ya
// está en otro estado esperando texto libre (nombre, dirección), el payload llega tal
// cual (ej. "NO_CLIENTE") y sin este chequeo se aceptaba como si fuera la respuesta real
// (caso real: "¡Gracias, NO_CLIENTE! 😊" — el ID del botón "❌ No" quedó guardado como
// nombre del cliente). Se usa como red de seguridad en los campos de texto libre que no
// tienen otra forma de validación (nombre, dirección — cantidad/provincia ya son seguros
// por otras vías: no traen dígitos/no matchean ninguna provincia).
const IDS_BOTONES_CONOCIDOS = new Set([
  'SI', 'NO', 'SI_CLIENTE', 'NO_CLIENTE', 'CONF_SI', 'CONF_NO',
  'DIR_TEXTO', 'DIR_UBICACION', 'ENV_MISMO', 'ENV_CAMBIAR',
  'PAGO_EFECTIVO', 'PAGO_TARJETA',
  'PROD_SI', 'PROD_NO', 'LOTE_MAS', 'LOTE_FIN',
  'MOD_QUITAR', 'MOD_CANTIDAD', 'MOD_AGREGAR',
  'NUEVA_COTIZACION', 'HABLAR_ASESOR',
]);

function esIdBotonConocido(texto: string): boolean {
  return IDS_BOTONES_CONOCIDOS.has(texto.trim().toUpperCase());
}


// ─── Mensaje de pregunta si es cliente ───────────────────────────────────────
const MSG_ES_CLIENTE_BODY = `Para brindarte una atención personalizada 😊\n\n¿Has realizado alguna compra con nosotros anteriormente?`;
const BTN_ES_CLIENTE = [
  { id: 'SI_CLIENTE', title: '✅ Sí, soy cliente' },
  { id: 'NO_CLIENTE', title: '❌ No' },
];

// ─── Mensaje de inicio de cotización ─────────────────────────────────────────
const MSG_INICIO_COTIZACION = `¡Vamos a cotizar! 🧪 Dime los productos y cantidades que necesitas, todos juntos o uno por uno.

_Ejemplo: "3kg cera de palma, 5kg cera de soya"_

Cuando termines, escribe *FIN*.`;

// "Anotado ✅" daba una falsa sensación de progreso validado (el ✅ sugiere que el
// producto ya fue encontrado/confirmado, cuando en realidad el texto solo se acumuló
// en espera de que el cliente cierre la lista) y no dejaba claro que hacía falta un
// paso explícito (FIN o el botón) para que el bot revise lo mencionado.
const MSG_ACUSE_LOTE = `Recibido 📝 ¿Necesitas algún otro producto?\n\nCuando termines, escribe *FIN* o toca "Finalizar" para que revise tu cotización 👇`;
const BTN_ACUSE_LOTE = [
  { id: 'LOTE_MAS', title: '➕ Agregar más' },
  { id: 'LOTE_FIN', title: '✅ Finalizar' },
];

// ─── Modificar lista sin perder lo ya ingresado ──────────────────────────────
const BTN_MODIFICAR_LISTA = [
  { id: 'MOD_QUITAR', title: '➖ Quitar productos' },
  { id: 'MOD_CANTIDAD', title: '🔢 Cambiar cantidad' },
  { id: 'MOD_AGREGAR', title: '➕ Agregar más' },
];

// ─── Confirmación de cotización (antes decía "pedido" — confundía al cliente,
// sonaba a compra ya realizada en vez de una cotización por confirmar) ────────
// ⚠️ LÍMITE DE META: el título de un botón interactivo admite MÁXIMO 20 caracteres.
// "✅ Confirmar cotización" (22) hacía que Meta rechazara el mensaje COMPLETO en
// silencio — YCloud aceptaba el envío, el dashboard lo mostraba (se guarda en BD
// local), pero al teléfono nunca llegaba: los clientes quedaban esperando en el
// resumen sin saber que faltaba confirmar (regresión del 2026-07-06, detectada por
// simulación del usuario el 07-07). El body del mensaje ya dice "cotización".
const BTN_CONFIRMACION_COTIZACION = [
  { id: 'CONF_SI', title: '✅ Confirmar' },
  { id: 'CONF_NO', title: '✏️ Modificar lista' },
];

// ─── Forma de pago (dato solo de referencia, NO implica pago inmediato) ──────
const MSG_FORMA_PAGO = `Para completar tu cotización, ¿cuál es tu forma de pago de preferencia? 💳\n\n_Es solo un dato de referencia — aquí no se realiza ningún cobro, un asesor lo coordinará contigo más adelante_ 😊`;
const BTN_FORMA_PAGO = [
  { id: 'PAGO_EFECTIVO', title: '💵 Efectivo' },
  { id: 'PAGO_TARJETA', title: '💳 Tarjeta de crédito' },
];

@Injectable()
export class BotService implements OnModuleInit {
  private readonly logger = new Logger(BotService.name);

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly botConfig: BotConfigService,
    private readonly botDebounce: BotDebounceService,
    private readonly botSession: BotSessionService,
    private readonly botGpt: BotGptService,
    private readonly botTools: BotToolsService,
    private readonly botProforma: BotProformaService,
    private readonly botNoDisponible: BotNoDisponibleService,
    private readonly ycloudService: YcloudService,
    private readonly ycloudWindowService: YcloudWindowService,
    private readonly gateway: WhatsappGateway,
    private readonly fileTempService: FileTempService,
    private readonly notificaciones: NotificacionesService,
    // Serializa el procesamiento por chat (ide_whcha) — compartido con YcloudService
    // para que un mensaje del bot y un hand-off a un agente humano (WhatsApp Web/
    // teléfono o API) nunca se procesen en paralelo y se pisen (sesión de bot,
    // banderas de wha_chat). Si dos mensajes del mismo chat llegan casi al mismo
    // tiempo (doble tap del cliente, reintento de webhook, etc.), la cola también
    // evita que ambos lean la sesión antes de que el primero termine de guardarla.
    private readonly chatLock: ChatLockService,
  ) { }

  onModuleInit() {
    this.ycloudService.setMessageHandler(
      (waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, texto, botActivo) =>
        this.processMessage(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, texto, botActivo),
    );
  }

  // ─── Punto de entrada ─────────────────────────────────────────────────────

  async processMessage(
    waId: string,
    phoneNumberId: string,
    ideWhcha: number,
    ideWhcue: number,
    ideEmpr: number,
    texto: string,
    botActivoWhcha: boolean,
  ): Promise<void> {
    await this.chatLock.runExclusive(ideWhcha, () =>
      this.processMessageInternal(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, texto, botActivoWhcha),
    );
  }

  private async processMessageInternal(
    waId: string,
    phoneNumberId: string,
    ideWhcha: number,
    ideWhcue: number,
    ideEmpr: number,
    texto: string,
    botActivoWhcha: boolean,
  ): Promise<void> {
    this.logger.log(`[Bot] processMessage waId=${waId} ideWhcha=${ideWhcha} ideWhcue=${ideWhcue} botActivoWhcha(snapshot)=${botActivoWhcha} texto="${texto}"`);

    // Releer bot_activo_whcha FRESCO de la BD, ya adentro del lock exclusivo por chat —
    // el valor que llega por parámetro es una foto tomada en YcloudService ANTES de este
    // lock (fire-and-forget, sin await sobre el handler), así que si dos mensajes del
    // mismo chat llegan casi juntos (ej. un video + su caption como mensajes separados),
    // el segundo puede traer un snapshot desactualizado de ANTES de que el primero ya
    // haya derivado el chat a asesor (bot_activo_whcha=FALSE) dentro de este mismo lock.
    // Caso real: video → "no puedo revisar archivos" + deriva a asesor → el mensaje
    // siguiente (con el snapshot viejo en TRUE) igual entraba como si el bot siguiera
    // activo y saludaba de nuevo, aunque el chat ya estaba en modo ASESOR.
    try {
      const freshRow = await this.dataSource.pool.query<{ bot_activo_whcha: boolean }>(
        `SELECT bot_activo_whcha FROM wha_chat WHERE ide_whcha = $1`,
        [ideWhcha],
      );
      if (freshRow.rowCount > 0) {
        botActivoWhcha = freshRow.rows[0].bot_activo_whcha !== false;
      }
    } catch (err) {
      this.logger.warn(`[Bot] No se pudo releer bot_activo_whcha fresco para chat ${ideWhcha}: ${err.message}`);
    }
    this.logger.log(`[Bot] processMessage ideWhcha=${ideWhcha} botActivoWhcha(fresco)=${botActivoWhcha}`);

    // ── Chat NUEVO (primer mensaje real, verificado en 2 capas: sesión local +
    // API de YCloud como fuente de verdad): en PROD el bot SIEMPRE responde, sin
    // importar el toggle global (activo_manual) ni el horario — es el primer contacto
    // real de esa persona con la empresa y no debe perderse. En DEV, en cambio, NUNCA
    // se auto-activa (ver gate de MODE más abajo) — ahí el único modo de que un chat
    // responda es activarlo manualmente por chat desde el front. La confiabilidad de
    // esto depende de que hasPriorMessages() detecte bien el historial (ver fix de
    // formato +E.164 más abajo) — un falso "no tiene historial" activaría el bot
    // indebidamente, así que ante cualquier duda/error de la API se asume que SÍ tiene
    // historial (conservador).
    //
    // Esta detección SOLO corre si el chat todavía NO está activo (botActivoWhcha
    // false) — existe para decidir si auto-activar un chat que llega inactivo. Si el
    // chat YA está activo (bot_activo_whcha=TRUE, ya sea por auto-activación previa o
    // por reactivación manual desde el front), no tiene sentido evaluarla: un chat sin
    // wha_bot_sesion previa activado manualmente también calificaría como "esChatNuevo"
    // y el freno de MODE=DEV lo bloquearía, pisando la activación manual explícita.
    let esChatNuevo = false;

    if (!botActivoWhcha) {
      // Capa 1: ¿hay sesiones previas de bot para este chat?
      const sesionesPrevias = await this.dataSource.pool.query(
        `SELECT 1 FROM wha_bot_sesion WHERE ide_whcha = $1 LIMIT 1`,
        [ideWhcha],
      );
      if (sesionesPrevias.rowCount === 0) {
        // Capa 2a (local) + Capa 2b (remota) se consultan SIEMPRE las dos, en paralelo,
        // y se combinan con OR — ninguna reemplaza a la otra:
        // - La BD local (wha_mensaje) detecta un mensaje saliente humano (agente o "echo"
        //   de WhatsApp nativo) sin depender de que YCloud lo haya indexado a tiempo en su
        //   API (causa raíz del bug real: el bot respondió a un proveedor porque
        //   hasPriorMessages() no reflejó a tiempo un echo ya guardado localmente).
        // - La API de YCloud sigue siendo necesaria porque puede tener historial de chats
        //   que NO están en nuestra BD local (BD purgada, migración, mensajes de antes de
        //   que este backend existiera, etc.) — omitirla perdería esos casos.
        const [mensajeSalienteHumano, yaEscribioAntes] = await Promise.all([
          this.dataSource.pool.query(
            `SELECT 1 FROM wha_mensaje
             WHERE ide_whcha = $1
               AND direction_whmem = '1'
               AND (es_bot_whmem IS NULL OR es_bot_whmem = FALSE)
             LIMIT 1`,
            [ideWhcha],
          ),
          this.ycloudService.hasPriorMessages(waId),
        ]);
        const tieneHistorialLocal = mensajeSalienteHumano.rowCount > 0;
        esChatNuevo = !(tieneHistorialLocal || yaEscribioAntes);
        this.logger.log(`[Bot] historialLocal(${ideWhcha})=${tieneHistorialLocal} | YCloud hasPriorMessages(${waId})=${yaEscribioAntes} → esChatNuevo=${esChatNuevo}`);
      }
    }

    if (esChatNuevo) {
      // En DEV nunca se auto-activa un chat nuevo, sin importar el estado global del
      // bot — en DEV la única forma de que un chat responda es activarlo manualmente
      // por chat desde el front (bot/toggle-chat). Evita que pruebas disparen el bot
      // a números reales. Este freno NO aplica en PROD (ver comentario arriba).
      if (envs.mode !== 'PROD') {
        this.logger.log(`[Bot] Chat nuevo ${ideWhcha} en MODE=${envs.mode} — no se auto-activa (requiere activación manual)`);
        return;
      }

      // Anti-duplicado: si ya existe una sesión activa para este chat,
      // es un webhook retransmitido y el bot ya respondió → no responder de nuevo.
      const sesionDuplicada = await this.dataSource.pool.query(
        `SELECT 1 FROM wha_bot_sesion WHERE ide_whcha = $1 AND activa = TRUE LIMIT 1`,
        [ideWhcha],
      );
      if (sesionDuplicada.rowCount > 0) {
        this.logger.warn(`[Bot] Chat ${ideWhcha} nuevo pero ya tiene sesión activa — webhook duplicado, se omite`);
        return;
      }

      // Forzar chat en modo BOT para que el flujo continúe en los siguientes mensajes
      await this.dataSource.pool.query(
        `UPDATE wha_chat SET bot_activo_whcha = TRUE, bot_modo_whcha = 'BOT' WHERE ide_whcha = $1`,
        [ideWhcha],
      );
      this.logger.log(`[Bot] Chat nuevo ${ideWhcha} → forzado a modo BOT`);
    }

    // NOTA: acá existía un "opt-out permanente" (si ALGUNA VEZ hubo un mensaje de
    // agente humano en el chat, el bot no respondía nunca más). Quedó obsoleto y
    // dañino desde el hand-off automático (derivarPorAgenteHumano): hoy, cuando un
    // humano escribe (WhatsApp Web/teléfono o API), el chat pasa a ASESOR al instante
    // — así que bot_activo_whcha=TRUE ya garantiza que ningún humano intervino desde
    // la última activación. El chequeo viejo, en cambio, anulaba la activación MANUAL:
    // un agente devolvía el chat al bot y el bot igual se negaba a responder por un
    // mensaje humano de semanas atrás (caso real: el propio dueño activó su chat de
    // pruebas en PROD y el bot no respondió).
    if (!esChatNuevo && !botActivoWhcha) {
      // Reactivación automática de chats viejos (opt-in por cuenta, umbral en horas) —
      // ver intentarReactivarChatViejo. Si no aplica (config sin umbral/null, cliente
      // desconocido, todavía no pasó el umbral, o el mensaje no es de venta nueva), el
      // chat se queda en ASESOR igual que siempre.
      const reactivado = await this.intentarReactivarChatViejo(waId, ideWhcha, ideWhcue, ideEmpr);
      if (!reactivado) {
        this.logger.warn(`[Bot] Chat ${ideWhcha} en modo ASESOR — bot no responde`);
        return;
      }
      botActivoWhcha = true;
      this.logger.log(`[Bot] Chat ${ideWhcha} reactivado automáticamente — continúa el procesamiento normal del mensaje`);
    }

    const botActivo = await this.botConfig.isBotActive(ideWhcue);
    if (!esChatNuevo && !botActivo && !botActivoWhcha) { this.logger.warn(`[Bot] Bot global INACTIVO y chat sin override`); return; }

    this.logger.log(`[Bot] isBotActive(${ideWhcue})=${botActivo} | esChatNuevo=${esChatNuevo} | override por chat=${botActivoWhcha}`);

    // Detección global: audio no transcribible / imagen / archivo-video (en cualquier
    // estado) — el bot no puede leerlos, se deriva a un asesor humano de inmediato.
    // Sentinels seteados en YcloudService.processInboundMessage (mismo patrón que
    // __LOCATION__: para ubicación).
    if (texto === '__AUDIO_NO_ENTENDIDO__') {
      await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr,
        'Lo siento, no pude entender el audio 🎙️. Te comunico con un asesor para que te ayude 👤\n\n⏰ *Horario de atención:* Lunes a viernes de 08:00 a 17:00 y sábados de 09:00 a 13:00. Fuera de este horario te responderemos el próximo día hábil. ¡Gracias!');
      return;
    }
    if (texto === '__IMAGEN_RECIBIDA__') {
      await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr,
        'Por el momento no puedo leer imágenes 📷. Te comunico con un asesor para que te ayude 👤\n\n⏰ *Horario de atención:* Lunes a viernes de 08:00 a 17:00 y sábados de 09:00 a 13:00. Fuera de este horario te responderemos el próximo día hábil. ¡Gracias!');
      return;
    }
    if (texto === '__ARCHIVO_RECIBIDO__') {
      await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr,
        'Por el momento no puedo revisar archivos o videos por este medio 📎. Te comunico con un asesor para que te ayude 👤\n\n⏰ *Horario de atención:* Lunes a viernes de 08:00 a 17:00 y sábados de 09:00 a 13:00. Fuera de este horario te responderemos el próximo día hábil. ¡Gracias!');
      return;
    }

    // Detección global: SALIR (en cualquier estado)
    if (REGEX_SALIR.test(texto.trim())) {
      await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr,
        'Enseguida te comunico con uno de nuestros asesores comerciales 👤\nEspera un momento por favor 😊\n\n⏰ *Horario de atención:* Lunes a viernes de 08:00 a 17:00 y sábados de 09:00 a 13:00. Fuera de este horario te responderemos el próximo día hábil. ¡Gracias!');
      return;
    }

    // Detección global: ASESOR (en cualquier estado)
    if (PALABRAS_ASESOR.test(texto)) {
      await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr);
      return;
    }

    const { sesion: sesionInicial, expirada } = await this.botSession.getOrCreate(ideWhcha, ideWhcue);
    let sesion = sesionInicial;

    // Sesión expirada por inactividad → la nueva sesión ya fue creada en INICIO,
    // se procesa el mensaje normalmente (transparente para el usuario).
    // this.logger.log(`[Bot] sesion.estado=${sesion?.estado} ide_whbse=${sesion?.ide_whbse}`);
    const config = await this.botConfig.getConfig(ideWhcue);
    this.logger.debug(`[Bot] config=${config ? 'OK nombre_bot=' + config.nombre_bot : 'NULL'}`);
    if (!config) {
      this.logger.warn(`[Bot] Sin configuración en wha_bot_config para ideWhcue=${ideWhcue} — creando config mínima`);
      // Config mínima por defecto para no perder el mensaje
      await this.botConfig.crearConfigMinima(ideWhcue);
      const configCreada = await this.botConfig.getConfig(ideWhcue);
      if (!configCreada) {
        await this.sendText(ideEmpr, waId,
          `Hola 😊 Soy tu asistente virtual. En este momento estoy siendo configurado, pronto podré ayudarte mejor. Por favor escribe *SALIR* para hablar con un asesor.`
        );
        return;
      }
    }

    const nombreBot = config.nombre_bot || 'QuimIA';
    const nombreEmpresa = config.nombre_empresa || 'DIQUIMEC';

    // Cargar memoria de sesiones anteriores en sesiones nuevas (INICIO)
    if (sesion.estado === BotState.INICIO && !sesion.datos_sesion?.memoria_cargada) {
      const memoria = await this.botSession.getMemoriaCliente(ideWhcha);
      if (memoria?.cliente) {
        const datosConMemoria: DatosSesion = {
          ...sesion.datos_sesion,
          productos: [],
          cliente: { ...memoria.cliente, pendiente_campo: undefined },
          memoria_cargada: true,
        };
        if (memoria.provincia) {
          datosConMemoria.envio = { provincia: memoria.provincia };
        }
        await this.botSession.update(sesion.ide_whbse, BotState.INICIO, datosConMemoria);
        sesion = { ...sesion, datos_sesion: datosConMemoria };
        this.logger.log(`[Bot] Memoria cargada para ideWhcha=${ideWhcha}: ${memoria.cliente.nombres}`);
      }
    }

    // Si llega un saludo en un estado distinto de INICIO → resetear sesión
    const estadosQueReinician = [
      BotState.SELECCION_PRODUCTOS, BotState.SELECCION_MULTIPLE, BotState.CONFIRMANDO_PRODUCTO_LOTE,
      BotState.ESPERANDO_CANTIDAD_LOTE, BotState.ESPERANDO_USO_LOTE,
      BotState.CONFIRMACION_PRODUCTOS, BotState.MODIFICANDO_LISTA, BotState.DATOS_ENVIO, BotState.DATOS_PAGO,
      BotState.PREGUNTA_ES_CLIENTE, BotState.IDENTIFICACION, BotState.DATOS_NUEVO_CLIENTE,
      BotState.ATENCION_LIBRE,
    ];
    if (REGEX_SALUDO.test(texto.trim()) && estadosQueReinician.includes(sesion.estado as BotState)) {
      // Si el cliente ya lleva progreso (productos, pendientes, datos de envío...), un
      // saludo suelto suele ser un ping de impaciencia, NO un pedido de empezar de cero
      // — resetear acá le borraba toda la lista (misma familia del bug de "Modificar
      // lista"). Se saluda de vuelta y se repite la pregunta del estado actual.
      const d = sesion.datos_sesion as DatosSesion;
      const hayProgreso = (d?.productos?.length ?? 0) > 0
        || (d?.cola_productos?.length ?? 0) > 0
        || (d?.pendientes_uso?.length ?? 0) > 0
        || (d?.pendientes_cantidad?.length ?? 0) > 0
        || !!d?.pendiente_confirmacion
        || (d?.opciones_producto?.length ?? 0) > 0
        || !!d?.texto_acumulado
        || !!d?.envio?.pendiente_campo
        // Producto que el cliente ya mencionó y quedó en espera de su nombre (flujo
        // liviano: manejarConsultaProductoClasica / handlePostCotizacion) — sin este
        // chequeo, un "hola" suelto mientras se esperaba el nombre cerraba la sesión y
        // perdía la pregunta original, obligando al cliente a repetirla desde cero
        // (caso detectado 2026-09-13 al auditar el flujo integral).
        || !!d?.producto_texto_pendiente
        || d?.cliente?.pendiente_campo === 'nombres';
      if (hayProgreso) {
        this.logger.log(`[Bot] Saludo en estado ${sesion.estado} con progreso → se repite el prompt sin resetear`);
        await this.reenviarPromptEstado(ideEmpr, waId, sesion.estado as BotState, d);
        return;
      }
      await this.botSession.cerrar(sesion.ide_whbse, BotState.CANCELADO);
      const { sesion: sesionNueva } = await this.botSession.getOrCreate(ideWhcha, ideWhcue);
      sesion = sesionNueva;
      this.logger.log(`[Bot] Saludo detectado en estado ${sesion.estado} → sesión reiniciada`);
    }

    // ─── Espera de mensajes (wha_bot_config.reduce_mensajes_whbco) ─────────────
    // En vez de responder de inmediato, se buferiza el mensaje y se espera
    // `segundos_espera_whbco` de silencio del cliente antes de procesarlo — agrupa
    // ráfagas de mensajes seguidos en una sola respuesta (ver BotDebounceService y
    // BotScheduleService.procesarBufferReducido, que llama a procesarBufferReducido()
    // más abajo con el texto ya concatenado). A PROPÓSITO no se toca el switch de acá
    // abajo ni ninguno de los handlers que llama — este `if` es la ÚNICA diferencia con
    // `reduce_mensajes_whbco=false`: con el flag apagado, nunca entra acá y la ejecución
    // cae directo al switch de siempre, sin ninguna línea nueva de por medio (garantiza
    // que el comportamiento en `false` queda exactamente igual al de antes de este
    // cambio — plan acordado 2026-09-17: un solo flujo, la espera es aditiva).
    // Estos son los únicos 4 estados que hoy pisa una conversación real (sin botones de
    // confirmación tipo SI/FIN, el resto de la máquina de estados no se transita) —
    // procesarBufferReducidoInternal despacha a los MISMOS handlers de siempre
    // (handleInicio/handleConfirmacion/handleAtencionLibre/handleRecopilandoCotizacion
    // Rapida) una vez pasada la espera, con el texto ya concatenado.
    const ESTADOS_CON_ESPERA = [
      BotState.INICIO, BotState.ESPERANDO_CONFIRMACION, BotState.ATENCION_LIBRE, BotState.RECOPILANDO_COTIZACION_RAPIDA,
    ];
    if (config.reduce_mensajes_whbco && ESTADOS_CON_ESPERA.includes(sesion.estado as BotState)) {
      await this.botDebounce.encolarMensaje(ideWhcha, texto);
      return;
    }

    // Frustración/enojo semántico (no depende de palabras clave como "asesor"/"salir",
    // que ya se filtran arriba de forma global) → derivar de inmediato en vez de seguir
    // intentando resolverlo con el bot. El modo reducido ya tenía este chequeo
    // (procesarBufferReducidoInternal) pero el flujo clásico no, así que un cliente
    // frustrado sin usar esas palabras seguía atrapado en el flujo normal (gap detectado
    // 2026-09-13 al auditar el flujo integral). Se omite en INICIO: es el primer mensaje
    // del chat, no tiene sentido gastar una llamada a GPT ahí.
    if (sesion.estado !== BotState.INICIO && await this.botGpt.detectarFrustracion(texto)) {
      await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr);
      return;
    }

    try {
      switch (sesion.estado as BotState) {
        case BotState.INICIO:
          await this.handleInicio(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, texto, nombreBot, nombreEmpresa, sesion, config);
          break;
        case BotState.ESPERANDO_CONFIRMACION:
          await this.handleConfirmacion(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, nombreBot, nombreEmpresa, config);
          break;
        case BotState.ATENCION_LIBRE:
          await this.handleAtencionLibre(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, nombreBot, nombreEmpresa, config);
          break;
        case BotState.PREGUNTA_ES_CLIENTE:
          await this.handlePreguntaEsCliente(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto);
          break;
        case BotState.IDENTIFICACION:
          await this.handleIdentificacion(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, config);
          break;
        case BotState.DATOS_NUEVO_CLIENTE:
          await this.handleDatosNuevoCliente(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, config);
          break;
        case BotState.SELECCION_PRODUCTOS:
          await this.handleSeleccionProductos(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, nombreEmpresa, config);
          break;
        case BotState.SELECCION_MULTIPLE:
          await this.handleSeleccionMultiple(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, nombreEmpresa, config);
          break;
        case BotState.CONFIRMANDO_PRODUCTO_LOTE:
          await this.handleConfirmandoProductoLote(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, nombreEmpresa, config);
          break;
        case BotState.ESPERANDO_CANTIDAD_LOTE:
          await this.handleEsperandoCantidadLote(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, nombreEmpresa, config);
          break;
        case BotState.ESPERANDO_USO_LOTE:
          await this.handleEsperandoUsoLote(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, nombreEmpresa, config);
          break;
        case BotState.CONFIRMACION_PRODUCTOS:
          await this.handleConfirmacionProductos(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, nombreEmpresa, config);
          break;
        case BotState.MODIFICANDO_LISTA:
          await this.handleModificandoLista(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, nombreEmpresa, config);
          break;
        case BotState.DATOS_ENVIO:
          await this.handleDatosEnvio(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, config);
          break;
        case BotState.DATOS_PAGO:
          await this.handleDatosPago(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, nombreBot, nombreEmpresa);
          break;
        case BotState.FINALIZADO:
          await this.handlePostCotizacion(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, nombreBot, nombreEmpresa, config);
          break;
        // ATENCION_LIBRE_REDUCIDA: código legacy del viejo flujo "reducido" paralelo
        // (retirado 2026-09-17, ver ESTADOS_CON_ESPERA más arriba) — nada nuevo entra acá,
        // se deja solo como red de seguridad si quedara alguna sesión vieja en ese estado.
        // RECOPILANDO_COTIZACION_RAPIDA sigue siendo un estado real y compartido por
        // ambos flujos; si llega por acá (sin buffer) es porque reduce_mensajes_whbco
        // estaba apagado o se desactivó a mitad de camino — se atiende igual, sin buffer.
        case BotState.ATENCION_LIBRE_REDUCIDA:
          await this.handleAtencionLibreReducida(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, nombreBot, nombreEmpresa, config);
          break;
        case BotState.RECOPILANDO_COTIZACION_RAPIDA:
          await this.handleRecopilandoCotizacionRapida(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, nombreBot, nombreEmpresa, config);
          break;
      }
    } catch (error) {
      this.logger.error(`BotService error [${sesion.estado}]: ${error.message}`, error.stack);
      const fallos = await this.botSession.incrementarFallo(sesion.ide_whbse);
      const maxFallos = config?.max_intentos_fallo ?? 3;
      if (fallos >= maxFallos) {
        await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr,
          'Tuve algunos inconvenientes procesando tu solicitud. Te comunico con un asesor para que te ayude 😊\n\n⏰ *Horario de atención:* Lunes a viernes de 08:00 a 17:00 y sábados de 09:00 a 13:00. Fuera de este horario te responderemos el próximo día hábil. ¡Gracias!');
      } else {
        // Antes el cliente no recibía NADA hasta acumular maxFallos errores — el chat
        // simplemente se quedaba mudo (caso real: clic en un botón → excepción → silencio
        // total). Ahora siempre se le responde algo para que pueda reintentar.
        try {
          await this.sendText(ideEmpr, waId,
            `Disculpa, tuve un inconveniente procesando tu mensaje 😅 ¿Me lo repites, por favor?`,
          );
        } catch (notifyErr) {
          this.logger.error(`BotService: tampoco se pudo notificar el error al cliente: ${notifyErr.message}`);
        }
      }
    }
  }

  // ─── Modo mensajes reducidos: entrypoint del buffer de debounce ────────────
  // Llamado por BotScheduleService.procesarBufferReducido() cuando un chat lleva
  // `segundos_espera_whbco` sin mensajes nuevos, con el texto de todos los mensajes
  // acumulados ya concatenado.

  async procesarBufferReducido(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, textoConcatenado: string,
  ): Promise<void> {
    await this.chatLock.runExclusive(ideWhcha, () =>
      this.procesarBufferReducidoInternal(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, textoConcatenado),
    );
  }

  private async procesarBufferReducidoInternal(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, textoConcatenado: string,
  ): Promise<void> {
    const { sesion } = await this.botSession.getOrCreate(ideWhcha, ideWhcue);
    const config = await this.botConfig.getConfig(ideWhcue);
    if (!config) return;

    const nombreBot = config.nombre_bot || 'QuimIA';
    const nombreEmpresa = config.nombre_empresa || 'DIQUIMEC';

    try {
      // Frustración/enojo en cualquier punto del flujo reducido → derivar de inmediato,
      // sin seguir intentando resolverlo con el bot (mensaje de horario por defecto).
      if (await this.botGpt.detectarFrustracion(textoConcatenado)) {
        await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr);
        return;
      }

      // Más de LIMITE_MENSAJES_REDUCIDO turnos sin concretar (ni cotización automática
      // ni catálogo resuelto): un asesor humano ya habría tomado la conversación en vez
      // de seguir dando vueltas — se deriva en vez de insistir indefinidamente.
      const datosActuales = sesion.datos_sesion as DatosSesion;
      const turnos = (datosActuales?.mensajes_reducido ?? 0) + 1;
      if (turnos > LIMITE_MENSAJES_REDUCIDO) {
        await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr,
          `¡Gracias por tu paciencia! 😊 Te voy a comunicar con un asesor comercial para darte una atención más completa.\n\n⏰ *Horario de atención:* Lunes a viernes de 08:00 a 17:00 y sábados de 09:00 a 13:00. Fuera de este horario te responderemos el próximo día hábil. ¡Gracias!`,
          `Chat con más de ${LIMITE_MENSAJES_REDUCIDO} mensajes en modo reducido sin concretar cotización ni resolver por catálogo.`,
        );
        return;
      }
      // Se actualiza también la copia en memoria de `sesion` (no solo la fila en BD):
      // los handlers de abajo leen `sesion.datos_sesion` y hacen su propio `update()`
      // sobre esa misma base — si no se sincroniza acá, su próximo `update()` pisaría
      // este incremento con la versión vieja del contador.
      sesion.datos_sesion = { ...datosActuales, mensajes_reducido: turnos };
      await this.botSession.update(sesion.ide_whbse, sesion.estado as BotState, sesion.datos_sesion);

      // Despacha a los MISMOS handlers que usa el camino inmediato (reduce_mensajes_
      // whbco=false) — nada de lógica de respuesta duplicada, solo llega tarde (después
      // de la espera) y con el texto de varios mensajes ya concatenado.
      switch (sesion.estado as BotState) {
        case BotState.INICIO:
          await this.handleInicio(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, textoConcatenado, nombreBot, nombreEmpresa, sesion, config);
          break;
        case BotState.ESPERANDO_CONFIRMACION:
          await this.handleConfirmacion(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, textoConcatenado, nombreBot, nombreEmpresa, config);
          break;
        case BotState.ATENCION_LIBRE:
          await this.handleAtencionLibre(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, textoConcatenado, nombreBot, nombreEmpresa, config);
          break;
        case BotState.RECOPILANDO_COTIZACION_RAPIDA:
          await this.handleRecopilandoCotizacionRapida(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, textoConcatenado, nombreBot, nombreEmpresa, config);
          break;
        default:
          // La sesión avanzó a un estado sin espera (ej. un agente la reactivó en medio
          // del flujo completo) mientras el mensaje esperaba en el buffer — no aplica.
          break;
      }
    } catch (error) {
      this.logger.error(`[Bot][Reducido] Error [${sesion.estado}] chat=${ideWhcha}: ${error.message}`, error.stack);
      try {
        await this.sendText(ideEmpr, waId, `Disculpa, tuve un inconveniente procesando tu mensaje 😅 ¿Me lo repites, por favor?`);
      } catch (notifyErr) {
        this.logger.error(`[Bot][Reducido]: tampoco se pudo notificar el error al cliente: ${notifyErr.message}`);
      }
    }
  }

  /**
   * Clasifica el mensaje y responde con el flujo simplificado. UBICACION/HORARIO/ENVIO/
   * CATALOGO usan las mismas plantillas configurables que el flujo completo. PRODUCTO
   * intenta primero dirigir al catálogo público (manejarConsultaProductoReducida); si no
   * aplica, toma el pedido para generar una solicitud de cotización simplificada.
   * GENERAL usa GPT con `prompt_sistema`, derivando a asesor si detecta que necesita un
   * dato específico que no puede responder con certeza — nunca inventa.
   */
  private async handleAtencionLibreReducida(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string,
    nombreBot: string, nombreEmpresa: string, config: any,
  ): Promise<void> {
    let datos = sesion.datos_sesion as DatosSesion;

    // Primer mensaje de la sesión: si ya conocemos al cliente (memoria de una sesión
    // anterior) se le saluda por su nombre y se responde de una vez lo que haya
    // preguntado. Si no lo conocemos, se le pregunta el nombre ANTES de responder —
    // se guarda lo que preguntó para contestarlo apenas lo sepamos, en vez de pedirle
    // que lo repita.
    if (!datos.saludo_reducido_enviado) {
      datos = { ...datos, saludo_reducido_enviado: true };
      if (datos.cliente?.nombres) {
        await this.sendText(ideEmpr, waId, `¡Hola de nuevo, *${datos.cliente.nombres}*! 😊`);
        await this.botSession.update(sesion.ide_whbse, BotState.ATENCION_LIBRE_REDUCIDA, datos);
      } else {
        // Chat nuevo sin memoria previa: mismo chequeo de "oferta de proveedor" que
        // handleInicio — con reduce_mensajes_whbco activo, el primer mensaje de un chat
        // nunca pasaba por handleInicio (se desviaba directo al buffer reducido antes de
        // llegar ahí), así que este bypass quedaba inactivo en cualquier cuenta con
        // mensajes reducidos habilitado (gap detectado 2026-09-13 al auditar el flujo
        // integral).
        if (await this.botGpt.esProveedorNoCliente(texto)) {
          await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr,
            `¡Gracias por escribirnos! 😊 Para temas de proveedores, un asesor comercial revisará tu propuesta en nuestro horario de atención.\n\n⏰ *Horario de atención:* Lunes a viernes de 08:00 a 17:00 y sábados de 09:00 a 13:00.`,
            `Mensaje de chat nuevo (modo reducido) clasificado como oferta de proveedor, no consulta de cliente: "${texto}"`,
          );
          return;
        }

        // Se intenta extraer el nombre del mismo mensaje antes de preguntarlo — mismo
        // criterio que handleInicio: "Hola mi nombre es Diego, busco Peg600" ya trae la
        // respuesta, no tiene sentido volver a pedirla (gap detectado 2026-09-13 al
        // trazar este caso).
        const { nombre: nombreEnSaludo } = await this.botGpt.extraerNombreYCiudad(texto, true, false);
        if (nombreEnSaludo) {
          datos = {
            ...datos,
            cliente: { nombres: nombreEnSaludo, correo: '', es_cliente_registrado: false },
          };
          // Se presenta (nombre del bot + empresa) igual que en la rama de abajo cuando
          // todavía no sabíamos el nombre — antes esta rama saltaba directo a "Mucho
          // gusto" sin decir quién es ni de qué empresa, aunque fuera el primer contacto
          // real del cliente con el bot (caso real detectado 2026-09-16).
          await this.sendText(ideEmpr, waId,
            `¡Hola, *${nombreEnSaludo}*! Mucho gusto 😊 Soy *${nombreBot}*, asistente de *${nombreEmpresa}*.`,
          );
          await this.botSession.update(sesion.ide_whbse, BotState.ATENCION_LIBRE_REDUCIDA, datos);
          // No se guarda texto_inicial ni se retorna: el resto de la función procesa
          // este mismo mensaje más abajo (detectarRequerimientos), igual que si ya
          // conociéramos al cliente de una sesión anterior.
        } else {
          datos = { ...datos, texto_inicial: texto, intentosNombre: 1 };
          await this.botSession.update(sesion.ide_whbse, BotState.ATENCION_LIBRE_REDUCIDA, datos);
          await this.sendText(ideEmpr, waId,
            `¡Hola! Soy *${nombreBot}*, asistente de *${nombreEmpresa}* 😊 ¿Cuál es tu nombre?`,
          );
          return;
        }
      }
    }

    // Todavía no tenemos el nombre (ya se le preguntó en un mensaje anterior): se
    // interpreta este mensaje como la respuesta — GPT lo extrae del texto libre (no
    // heurísticas de patrón: "soy Diego", "me llamo Diego" o solo "Diego" son todas
    // respuestas válidas) para que la conversación se sienta natural y no como un
    // formulario. Los pedidos explícitos de salir/hablar con un asesor tienen prioridad
    // aunque todavía no haya dado su nombre.
    if (!datos.cliente?.nombres) {
      if (REGEX_SALIR.test(texto.trim()) || PALABRAS_ASESOR.test(texto)) {
        await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr);
        return;
      }

      const { nombre, restoTexto } = await this.botGpt.extraerNombreYCiudad(texto, true, false);
      const intentosPrevios = datos.intentosNombre ?? 1;
      if (!nombre) {
        // Mismo fix que handleConfirmacion (flujo clásico): este mensaje tampoco traía
        // el nombre, pero puede traer lo que el cliente necesita — se acumula en
        // texto_inicial en vez de perderlo cuando finalmente dé su nombre.
        const textoAcumulado = [datos.texto_inicial, texto].filter(Boolean).join('\n');
        if (intentosPrevios >= 2) {
          // 2 intentos sin lograr extraer el nombre — se deja de insistir (evita el loop
          // "¿cómo te llamas?" indefinido, caso real detectado 2026-09-16) y se sigue con
          // CONSUMIDOR FINAL. El resto de la función procesa este mismo mensaje más abajo.
          // OJO: se sigue con `datos.texto_inicial` (lo acumulado ANTES de este último
          // intento), NO con `textoAcumulado` — mismo fix que handleConfirmacion (caso
          // real detectado 2026-09-17: "Sol", probablemente el nombre real de la clienta
          // sin reconocer con certeza, se coló como un segundo producto de la cotización).
          const textoSinUltimoIntento = datos.texto_inicial || texto;
          datos = {
            ...datos,
            texto_inicial: undefined,
            cliente: { nombres: 'CONSUMIDOR FINAL', correo: '', es_cliente_registrado: false },
          };
          await this.botSession.update(sesion.ide_whbse, BotState.ATENCION_LIBRE_REDUCIDA, datos);
          texto = textoSinUltimoIntento;
        } else {
          if (textoAcumulado !== datos.texto_inicial) {
            datos = { ...datos, texto_inicial: textoAcumulado };
          }
          datos = { ...datos, intentosNombre: intentosPrevios + 1 };
          await this.botSession.update(sesion.ide_whbse, BotState.ATENCION_LIBRE_REDUCIDA, datos);
          // Segundo pedido — tono cordial pero más directo que el saludo inicial, no la
          // misma pregunta repetida (caso real detectado 2026-09-16: el cliente escribió
          // mal su nombre, GPT no lo reconoció, y el bot insistía con el mismo texto).
          await this.sendText(ideEmpr, waId, `Para poder continuar, ¿me facilitas tu nombre por favor? 😊`);
          return;
        }
      } else {
        datos = {
          ...datos,
          cliente: {
            ...(datos.cliente ?? {}),
            nombres: nombre,
            correo: datos.cliente?.correo || '',
            es_cliente_registrado: datos.cliente?.es_cliente_registrado ?? false,
          },
        };
        await this.botSession.update(sesion.ide_whbse, BotState.ATENCION_LIBRE_REDUCIDA, datos);
        await this.sendText(ideEmpr, waId, `¡Mucho gusto, *${nombre}*! 😊`);
        // Se combina lo que había preguntado en el primer mensaje (ej. "Hola, tienen cera
        // de coco") CON el resto de esta respuesta, SIN el nombre ya extraído (ej.
        // "Janneth Pachacama quiero la ubicación" → restoTexto="quiero la ubicación") —
        // antes se usaba el mensaje CRUDO completo, así que si el cliente respondía
        // ÚNICAMENTE con su nombre/empresa (ej. "Laboratorio DOC"), ese texto se
        // reinyectaba en el análisis de productos y GPT lo interpretaba como un segundo
        // producto de la lista (caso real detectado 2026-09-15: cotización con "TWEEN DE
        // 20" real + "LABORATORIO DOC" inventado). Si el primer mensaje no traía nada
        // (solo "Hola") ni esta respuesta traía nada más que el nombre, queda vacío.
        texto = [datos.texto_inicial, restoTexto].filter(Boolean).join('\n');
      }
    }

    // El debounce existe justo para esto: juntar todo lo que el cliente escribió (uno o
    // varios mensajes seguidos) y responderlo COMPLETO en la menor cantidad de mensajes
    // posible — no solo lo primero que se detecte. detectarRequerimientos (a diferencia
    // de clasificarConsulta) marca TODAS las categorías presentes, no una sola, para no
    // perder en silencio el resto de lo que pidió (caso real: "dónde están ubicados,
    // disponen percarbonato de sodio" solo respondía la ubicación).
    const requerimientos = await this.botGpt.detectarRequerimientos(texto);
    this.logger.debug(`[Bot][Reducido] requerimientos=${JSON.stringify(requerimientos)}`);

    const partesInfo: string[] = [];
    if (requerimientos.ubicacion) {
      const t = this.construirTextoInfo('UBICACION', nombreEmpresa, config);
      if (t) partesInfo.push(t);
    }
    if (requerimientos.horario) {
      const t = this.construirTextoInfo('HORARIO', nombreEmpresa, config);
      if (t) partesInfo.push(t);
    }
    if (requerimientos.envio) {
      const t = this.construirTextoInfo('ENVIO', nombreEmpresa, config);
      if (t) partesInfo.push(t);
    }
    if (requerimientos.catalogo) {
      partesInfo.push(
        `¡Claro que sí! 📋 Aquí tienes nuestros catálogos:\n` +
        `🔹 Catálogo general: https://diquimec.com.ec/product\n` +
        `🔹 Catálogo para emprendedores (con precios): https://diquimec.com.ec/catalogo`,
      );
    }

    if (partesInfo.length) {
      await this.sendText(ideEmpr, waId, partesInfo.join('\n\n'));
      // El pin de ubicación es un tipo de mensaje de WhatsApp aparte (no se puede fundir
      // con el texto) — se manda igual que en responderInfo, después del texto combinado.
      if (requerimientos.ubicacion && config?.lat_empresa && config?.lng_empresa) {
        try {
          await this.ycloudService.sendLocation(
            ideEmpr, `+${waId}`, config.lat_empresa, config.lng_empresa, nombreEmpresa, '', true,
          );
        } catch (err) {
          this.logger.warn(`[Bot][Reducido] No se pudo enviar pin de ubicación: ${err.message}`);
        }
      }
    }

    if (requerimientos.producto) {
      await this.manejarConsultaProductoReducida(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, datos, texto, nombreBot, nombreEmpresa);
      return;
    }

    if (partesInfo.length) {
      await this.botSession.update(sesion.ide_whbse, BotState.ATENCION_LIBRE_REDUCIDA, datos);
      return;
    }

    // GENERAL: ninguna categoría específica aplicó — GPT responde con el prompt de la
    // empresa; si necesita un dato específico que no tiene, deriva a asesor en vez de
    // inventar.
    const historial = await this.botSession.getHistorialMensajes(ideWhcha, 6);
    const promptBase = (config.prompt_sistema || this.getPromptSistema(nombreBot, nombreEmpresa))
      .replace(/{BOT_NOMBRE}/g, nombreBot)
      .replace(/{NOMBRE_EMPRESA}/g, nombreEmpresa);
    // Mismo fix que handleAtencionLibre (flujo clásico): no re-saludar con un nombre
    // distinto al ya guardado en sesión si el mensaje menciona otro nombre.
    // Mismo refuerzo que handleAtencionLibre (flujo clásico) — ver comentario ahí para el
    // detalle completo: el prompt configurado por la cuenta puede traer instrucciones
    // desactualizadas (pedir correo/dirección exacta) que esta regla anula siempre.
    const nombreConocidoReducido = datos.cliente?.nombres;
    const resultado = await this.botGpt.generateResponseConEscalamiento(
      promptBase, historial, texto,
      `Empresa: ${nombreEmpresa}. Responde de forma breve, cordial y precisa. ` +
      `REGLA FIJA que prevalece sobre cualquier instrucción de cotización del prompt: NUNCA pidas correo ` +
      `electrónico ni dirección exacta de entrega — el sistema ya usa el correo de la empresa por defecto y solo ` +
      `pregunta la ciudad al final, en un paso aparte que el sistema maneja solo. Si hace falta pedir algo para ` +
      `avanzar con una cotización, pedí SOLO el producto y la cantidad.` +
      (nombreConocidoReducido
        ? ` El cliente ya se identificó como "${nombreConocidoReducido}" — NO le vuelvas a pedir el nombre, no lo ` +
          `saludes de nuevo como si fuera alguien nuevo, ni cambies ese nombre aunque el mensaje mencione uno ` +
          `distinto; seguí usando "${nombreConocidoReducido}" salvo que el cliente pida explícitamente corregirlo.`
        : ''),
    );
    if (resultado.interesGenerico) {
      // Interés general en una actividad/manualidad (ej. "quiero aprender a hacer
      // jabones") sin producto puntual — no se responde con conocimiento general
      // inventado (ver generateResponseConEscalamiento), se envía el catálogo real y se
      // deriva a un asesor para una recomendación personalizada.
      await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr,
        `¡Con gusto! 📋 Aquí tienes nuestros catálogos:\n` +
        `🔹 Catálogo general: https://diquimec.com.ec/product\n` +
        `🔹 Catálogo para emprendedores (con precios): https://diquimec.com.ec/catalogo\n\n` +
        `Un asesor comercial 👤 te va a contactar para darte una atención más personalizada 😊`,
        `Cliente mostró interés general en una actividad/manualidad sin nombrar producto puntual: "${texto}"`,
      );
      return;
    }
    if (resultado.requiereAsesor) {
      await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, resultado.respuesta);
      return;
    }
    await this.sendText(ideEmpr, waId, resultado.respuesta);
    await this.botSession.update(sesion.ide_whbse, BotState.ATENCION_LIBRE_REDUCIDA, datos);
  }

  /**
   * PRODUCTO en modo reducido: si el cliente ya dio cantidad en el mismo mensaje (pedido
   * directo, ej. "necesito 10kg de cera de soya"), se toma el pedido de una vez — mostrar
   * el catálogo ahí sería un mensaje de más. Si NO dio cantidad (solo pregunta si hay tal
   * producto), primero se intenta dirigir al catálogo público con stock; solo si no hay
   * match se levanta la solicitud de cotización. Antes de todo eso se chequea existencia
   * (evaluarExistenciaProductos) — este modo no lo hacía, así que un producto ya
   * registrado como "no disponible" (ej. sosa cáustica) pasaba de largo pidiendo
   * cantidad en vez de responder directo (mismo bug ya corregido en el flujo clásico,
   * caso real detectado 2026-09-13).
   */
  private async manejarConsultaProductoReducida(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, datos: DatosSesion, texto: string,
    nombreBot: string, nombreEmpresa: string,
  ): Promise<void> {
    // Se pasa el historial reciente del chat para que GPT pueda resolver mensajes de
    // seguimiento que no repiten el producto (ej. el cliente pregunta "tienen cera de
    // coco", el bot responde, y el cliente solo contesta "necesito 2kg") — igual que lo
    // haría un asesor leyendo la conversación completa, en vez de analizar cada mensaje
    // aislado (caso real detectado 2026-09-13: la cotización terminaba con un ítem
    // genérico en vez de "cera de coco").
    const historial = await this.botSession.getHistorialMensajes(ideWhcha, 6);
    const { items: itemsCrudos } = await this.botGpt.analizarLoteProductos(texto, [], historial);

    // Defensa adicional (no depender solo del prompt de analizarLoteProductos): si el
    // "producto" extraído es en realidad una palabra genérica del propio pedido (caso
    // real: "cotización de 100 litros" → GPT devolvía producto="Cotización", cantidad=100),
    // se normaliza al mismo sentinel de "producto sin identificar" (string vacío) que ya
    // usa el prompt cuando el cliente no nombra nada — NO se descarta: se pregunta
    // puntualmente qué producto es (como haría un asesor), sin perder la cantidad ya dada.
    const REGEX_PRODUCTO_GENERICO_INVALIDO = /^(cotizaci[oó]n|pedido|presupuesto|producto|art[ií]culo|orden|compra)$/i;
    const itemsNormalizados = itemsCrudos.map((i) =>
      REGEX_PRODUCTO_GENERICO_INVALIDO.test(i.producto.trim()) ? { ...i, producto: '' } : i,
    );

    // detectarRequerimientos ya clasificó el mensaje como PRODUCTO (por eso se llegó
    // acá), pero eso solo detecta INTENCIÓN por palabras clave ("quiero", "disponen") —
    // no garantiza que se haya nombrado un producto puntual. Si analizarLoteProductos no
    // extrajo NADA (ej. "quiero saber los productos que disponen", sin cantidad ni
    // producto), NO se debe usar el mensaje completo como si fuera el nombre de un
    // producto — eso generaba respuestas sin sentido como "cuéntame qué cantidad
    // necesitas de quiero saber los productos que disponen" (caso real 2026-09-13).
    if (!itemsNormalizados.length) {
      await this.sendText(ideEmpr, waId, `¡Con gusto! 😊 Cuéntame qué productos necesitas cotizar y en qué cantidades, y te preparo la cotización.`);
      await this.botSession.update(sesion.ide_whbse, BotState.ATENCION_LIBRE_REDUCIDA, datos);
      return;
    }

    // Ítems con cantidad/unidad pero sin nombre de producto (ej. "cotización de 100
    // litros") — se pregunta puntualmente, citando lo que ya dijo el cliente, en vez de
    // perder esa cantidad con un mensaje genérico. Queda en el historial de la
    // conversación para que analizarLoteProductos la retome cuando el cliente responda
    // solo el nombre del producto (mismo mecanismo que ya resuelve "necesito 2kg" después
    // de "tienen cera de coco").
    const itemsSinProducto = itemsNormalizados.filter((i) => !i.producto);
    if (itemsSinProducto.length) {
      const citas = itemsSinProducto.map((i) => i.cantidadTexto || (i.cantidad != null ? String(i.cantidad) : null)).filter(Boolean);
      const pregunta = citas.length
        ? citas.length === 1
          ? `¡Con gusto! 😊 ¿De qué producto necesitas los ${citas[0]}?`
          : `¡Con gusto! 😊 Mencionaste ${citas.join(' y ')} — ¿de qué producto se trata cada cantidad?`
        : `¡Con gusto! 😊 Cuéntame de qué producto se trata para poder cotizarte.`;
      await this.sendText(ideEmpr, waId, pregunta);
      await this.botSession.update(sesion.ide_whbse, BotState.ATENCION_LIBRE_REDUCIDA, datos);
      return;
    }

    const items = itemsNormalizados;

    let pedirUso = false;
    {
      const estadoProducto = await this.evaluarExistenciaProductos(items.map((i) => i.producto), ideEmpr);

      if (estadoProducto.estado === 'NO_VENDEMOS') {
        const mensaje = estadoProducto.observacion?.trim() || 'Por el momento no comercializamos ese producto 😔';
        await this.sendText(ideEmpr, waId, `${mensaje} ¿Te ayudo con algo más?`);
        await this.botSession.update(sesion.ide_whbse, BotState.ATENCION_LIBRE_REDUCIDA, datos);
        return;
      }

      // SIN_MATCH: mismo criterio que el flujo clásico — puede tener otro nombre o
      // conseguirse con un proveedor aliado, así que no se asume "no lo vendemos"; se
      // pide también el uso para que un asesor la complete con contexto real.
      if (estadoProducto.estado === 'SIN_MATCH') pedirUso = true;
    }

    const hayItemConCantidad = items.some((i) => i.cantidad !== null);
    let itemsPendientes: ItemCotizacionRapida[] = items;
    if (!pedirUso && items.length && !hayItemConCantidad) {
      const catalogos = await this.botProforma.obtenerCatalogosDisponibles(ideEmpr);
      if (catalogos.length) {
        // Chequeo POR PRODUCTO, no contra el mensaje completo — mismo fix que el flujo
        // clásico: un solo match contra todo el texto le daba el link de UN catálogo
        // como si respondiera por TODOS los productos mencionados.
        const matches = await Promise.all(
          items.map((item) => this.botGpt.matchCatalogoProducto(item.producto, catalogos)),
        );
        const conCatalogo = items.filter((_, i) => matches[i]?.ide_cata);
        itemsPendientes = items.filter((_, i) => !matches[i]?.ide_cata);

        if (conCatalogo.length) {
          const idsUnicos = [...new Set(matches.map((m) => m?.ide_cata).filter((id): id is number => !!id))];
          const links = idsUnicos.map((id) => {
            const c = catalogos.find((cat) => cat.ide_cata === id);
            return c?.path_cata ? `https://diquimec.com.ec/catalogo/${c.path_cata}` : 'https://diquimec.com.ec/catalogo';
          });
          const nombres = conCatalogo.map((i) => `*${i.producto}*`).join(', ');
          // "Dime la cantidad..." solo tiene sentido cuando el match fue a un producto
          // PUNTUAL — si solo matcheó el tema/título del catálogo (ej. "esencias para
          // velas" → catálogo con varios productos), no se sabe cuál puntual quiere el
          // cliente, así que no tiene sentido pedirle cantidad todavía.
          const todosEspecificos = matches
            .filter((m): m is { ide_cata: number; matchEspecifico: boolean } => !!m?.ide_cata)
            .every((m) => m.matchEspecifico);
          await this.sendText(ideEmpr, waId,
            `¡Sí, disponemos de ${nombres}! 😊 Lo puedes encontrar en nuestro catálogo de emprendedores, con precios incluidos: ${links.join(' | ')} — ahí mismo puedes generar tu cotización.` +
            (itemsPendientes.length || !todosEspecificos ? '' : ' Si prefieres, dime la cantidad que necesitas y la generamos por aquí.'),
          );
          // Se guardan aunque no sigan en itemsPendientes — nunca van a entrar a
          // cotizacion_rapida.items, así que sin esto el asesor nunca se entera de que el
          // cliente también preguntó por estos (ver DatosSesion.productosEnCatalogoPublico).
          datos = {
            ...datos,
            productosEnCatalogoPublico: [
              ...(datos.productosEnCatalogoPublico ?? []),
              ...conCatalogo.map((i) => i.producto),
            ],
          };
          if (!itemsPendientes.length) {
            await this.botSession.update(sesion.ide_whbse, BotState.ATENCION_LIBRE_REDUCIDA, datos);
            return;
          }
        }
      }
    }

    // itemsPendientes nunca queda vacío acá: si el chequeo de catálogo de arriba cubrió
    // TODOS los ítems detectados, ya se retornó antes.
    await this.iniciarRecopilacionCotizacionRapida(
      waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, datos, itemsPendientes, nombreBot, nombreEmpresa, pedirUso,
    );
  }

  /**
   * Guarda los productos detectados y calcula qué falta (cantidad, nombre, ciudad — la
   * ciudad se pide para poder dejar la dirección/provincia real en la cotización, no un
   * dato en blanco que un asesor tenga que salir a buscar). Si el cliente ya dio todo en
   * el mismo mensaje (ej. ya teníamos nombre y ciudad de una sesión anterior, y dio
   * cantidad ahora), no tiene sentido preguntarle "cuéntame: " con la lista vacía — se
   * genera de una vez.
   */
  /**
   * Arma la lista de "qué falta preguntar" para la cotización rápida (cantidad, uso,
   * nombre) en frases naturales que nombran el/los producto(s) puntualmente — compartida
   * entre iniciarRecopilacionCotizacionRapida (primera vez) y handleRecopilandoCotizacion
   * Rapida (reintento tras la respuesta del cliente) para no duplicar la redacción en dos
   * lugares. `pedirUso` viene de evaluarExistenciaProductos → SIN_MATCH: ningún ítem
   * matcheó con confianza en catálogo interno ni catálogo público, así que además de la
   * cantidad se necesita saber para qué lo va a usar, para que el asesor tenga contexto
   * real y decida (confirmar disponibilidad, sugerir alternativa, conseguirlo con un
   * proveedor aliado) en vez de que el bot responda "no disponemos" por su cuenta.
   *
   * No incluye la ciudad: esa se pregunta como mensaje INDEPENDIENTE recién cuando
   * cantidad/uso/nombre ya están completos (ver preguntarCiudadOFinalizar), no mezclada
   * con esta pregunta — y solo una vez, nunca bloquea.
   */
  private construirFaltantesCotizacionRapida(
    items: ItemCotizacionRapida[], pedirUso: boolean, tieneNombre: boolean,
  ): string[] {
    const itemsAmbos = items.filter((i) => i.cantidad === null && pedirUso && !i.uso);
    const itemsSoloCantidad = items.filter((i) => i.cantidad === null && !(pedirUso && !i.uso));
    const itemsSoloUso = items.filter((i) => i.cantidad !== null && pedirUso && !i.uso);

    // Con un solo producto, el nombre entra en la misma frase ("...de *X*"); con varios,
    // se listan en líneas numeradas en vez de un "X, Y, Z" corrido — más fácil de leer en
    // WhatsApp, sobre todo con 3+ productos (caso real detectado 2026-09-16: el texto
    // llegaba todo unido, pidieron formato de lista).
    const listar = (its: ItemCotizacionRapida[]) =>
      its.length === 1
        ? `*${its[0].producto}*`
        : its.map((i, idx) => `${idx + 1}. *${i.producto}*`).join('\n');

    const faltantes: string[] = [];
    if (itemsAmbos.length) {
      faltantes.push(
        itemsAmbos.length === 1
          ? `qué cantidad necesitas de ${listar(itemsAmbos)} y para qué uso lo necesitas`
          : `qué cantidad necesitas de cada uno y para qué uso:\n${listar(itemsAmbos)}`,
      );
    }
    if (itemsSoloCantidad.length) {
      // Se ofrece la cantidad mínima como alternativa (ya soportada:
      // analizarLoteProductos/extraerCantidadesPorProducto reconocen "cantidad mínima"
      // como cantidad=0).
      faltantes.push(
        itemsSoloCantidad.length === 1
          ? `qué cantidad necesitas de ${listar(itemsSoloCantidad)} (o si prefieres la cantidad mínima)`
          : `qué cantidad necesitas de cada uno (o si prefieres la cantidad mínima):\n${listar(itemsSoloCantidad)}`,
      );
    }
    if (itemsSoloUso.length) {
      faltantes.push(
        itemsSoloUso.length === 1
          ? `para qué uso necesitas ${listar(itemsSoloUso)}`
          : `para qué uso necesitas cada uno:\n${listar(itemsSoloUso)}`,
      );
    }
    if (!tieneNombre) faltantes.push('tu nombre');
    return faltantes;
  }

  private async iniciarRecopilacionCotizacionRapida(
    waId: string, phoneNumberId: string, ideWhcha: number, ideWhcue: number, ideEmpr: number,
    sesion: any, datos: DatosSesion, items: ItemCotizacionRapida[],
    nombreBot: string, nombreEmpresa: string, pedirUso = false,
  ): Promise<void> {
    const nuevosDatos: DatosSesion = { ...datos, cotizacion_rapida: { items, pedirUso } };

    const faltantes = this.construirFaltantesCotizacionRapida(items, pedirUso, !!nuevosDatos.cliente?.nombres);

    if (faltantes.length) {
      await this.botSession.update(sesion.ide_whbse, BotState.RECOPILANDO_COTIZACION_RAPIDA, nuevosDatos);
      // Cuando el producto no matcheó en ninguna fuente, antes se le decía explícitamente
      // "no lo tengo identificado en nuestro catálogo" — sonaba a que no lo vendemos o a
      // que el bot está perdido, restándole confianza al cliente sin necesidad (puede ser
      // solo un problema de nombre, no de disponibilidad real; el asesor lo evalúa
      // internamente de todas formas). Ahora el mensaje es el mismo para ambos casos —
      // no expone la incertidumbre interna del bot (caso real detectado 2026-09-18).
      const intro = pedirUso
        ? '¡Con gusto te ayudo a levantar tu solicitud! 😊 Cuéntame'
        : '¡Claro que sí! Cuéntame';
      // Separador '\n\n' entre cada "falta" (no ', ') — cuando alguna trae una lista
      // numerada de productos embebida, una coma la partía a mitad de línea.
      await this.sendText(ideEmpr, waId, `${intro} 😊\n\n${faltantes.join('\n\n')}`);
      return;
    }

    // Cantidad/uso/nombre ya completos (pudo venir todo en el mismo mensaje, ej. cliente
    // conocido que ya dio cantidad) — la ciudad se pregunta en un mensaje INDEPENDIENTE
    // (no mezclada con la de cantidad), y solo una vez: si el cliente no la reconoce en
    // su respuesta no bloquea, se genera la cotización igual.
    await this.preguntarCiudadOFinalizar(
      waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, nuevosDatos, items, nombreBot, nombreEmpresa,
    );
  }

  /**
   * Último paso antes de generar la cotización: si ya sabemos la ciudad (de memoria o de
   * una respuesta anterior), finaliza directo. Si no, la pregunta como mensaje propio
   * ("¡Perfecto! Una última cosa...") — antes se mezclaba con la pregunta de cantidad
   * desde el primer mensaje, lo que sonaba a formulario largo en vez de una conversación
   * (caso real detectado 2026-09-13: pedía cantidad Y ciudad en la misma frase, incluso
   * antes de saber si el producto existía). Solo se pregunta una vez — la siguiente
   * respuesta del cliente cierra la cotización sin importar si trajo o no una ciudad.
   */
  private async preguntarCiudadOFinalizar(
    waId: string, phoneNumberId: string, ideWhcha: number, ideWhcue: number, ideEmpr: number,
    sesion: any, datos: DatosSesion, items: ItemCotizacionRapida[],
    nombreBot: string, nombreEmpresa: string,
  ): Promise<void> {
    if (datos.envio?.provincia) {
      await this.finalizarCotizacionRapida(
        waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, datos, items, nombreBot, nombreEmpresa,
      );
      return;
    }

    const nuevosDatos: DatosSesion = {
      ...datos,
      cotizacion_rapida: { ...datos.cotizacion_rapida, items, ciudadPreguntada: true },
    };
    await this.botSession.update(sesion.ide_whbse, BotState.RECOPILANDO_COTIZACION_RAPIDA, nuevosDatos);
    await this.sendText(ideEmpr, waId, `¡Perfecto! Una última cosa 😊 ¿Desde qué ciudad nos escribes?`);
  }

  /**
   * Resuelve los productos contra el catálogo interno (genérico si no matchea ninguno o
   * el match es ambiguo — nada se pierde, el asesor lo revisa) y genera la cotización con
   * procesarProforma() — sin forma de pago (siempre efectivo por defecto); la ciudad ya
   * se resolvió (con dato o sin él, nunca bloquea) antes de llegar acá — ver
   * preguntarCiudadOFinalizar. Dos
   * escenarios, ambos terminan derivando a un asesor humano (la filosofía del bot es
   * preparar la venta, no cerrarla solo):
   *   - Match EXACTO de producto y precio en TODOS los ítems (`resultado.automatica`):
   *     se asigna vendedor, se genera el PDF y se le responde al cliente con el PDF
   *     adjunto — luego se deriva quedando disponible para lo que necesite, sin
   *     presionarlo con un seguimiento que no pidió (es solo una cotización, puede o no
   *     concretarse).
   *   - Si no (algún producto sin precio, fuera de catálogo o con match ambiguo): queda
   *     registrada con su N° de cotización y se deriva para que un asesor la complete.
   */
  private async finalizarCotizacionRapida(
    waId: string, phoneNumberId: string, ideWhcha: number, ideWhcue: number, ideEmpr: number,
    sesion: any, datos: DatosSesion, items: ItemCotizacionRapida[],
    nombreBot: string, nombreEmpresa: string,
    notaExtra?: string,
  ): Promise<void> {
    // Productos que matchearon un catálogo público (se les mandó el link con precios en
    // vez de cotizarlos acá) nunca entran a `items` — sin esto, el asesor no se enteraba
    // de que el cliente también preguntó por ellos (caso real detectado 2026-09-18: "cera
    // de abejas" desapareció de la cotización, solo quedó "manteca de karité").
    const notaCatalogoPublico = datos.productosEnCatalogoPublico?.length
      ? `El cliente también preguntó por: ${datos.productosEnCatalogoPublico.join(', ')} — se le compartió el link del catálogo público con precios, no está en esta cotización.`
      : null;
    const notaCompleta = [notaExtra, notaCatalogoPublico].filter(Boolean).join('\n') || undefined;

    const productosResueltos = await this.resolverProductosSimple(items, ideEmpr);
    const datosFinales: DatosSesion = { ...datos, productos: productosResueltos };

    let resultado: ResultadoProforma | null = null;
    try {
      resultado = await this.botProforma.procesarProforma(datosFinales, `+${waId}`, ideEmpr, 0, nombreBot);
    } catch (err) {
      // No se le comunica el error al cliente: igual se cierra con el mensaje de asesor
      // de abajo — mejor que un pedido con datos completos no se pierda en silencio, un
      // humano lo revisa desde los logs.
      this.logger.error(`[Bot][Reducido] Error generando cotización rápida chat=${ideWhcha}: ${err.message}`, err.stack);
    }

    if (resultado?.automatica && resultado.pdfBuffer) {
      let pdfEnviado = false;
      try {
        const filename = await this.fileTempService.saveWhatsAppMedia(
          resultado.pdfBuffer, 'pdf', `Cotizacion_${resultado.secuencial}.pdf`,
        );
        const pdfUrl = `${envs.hostApi}/api/whatsapp/media/${filename}`;
        await this.ycloudService.sendDocument(
          ideEmpr, `+${waId}`, null,
          `Cotizacion_${resultado.secuencial}.pdf`,
          `📄 Cotización #${resultado.secuencial} — ${nombreEmpresa}`,
          undefined, pdfUrl, true,
        );
        pdfEnviado = true;
        this.gateway.emitNuevaProformaBot(ideWhcue, resultado.secuencial, datosFinales.cliente?.nombres || waId);
      } catch (pdfErr) {
        this.logger.error(`[Bot][Reducido] Error enviando PDF cotización #${resultado.secuencial}: ${pdfErr.message}`);
        try {
          await this.notificaciones.enviarSistema(
            'WHATSAPP_PDF_FALLIDO',
            `⚠️ PDF no enviado — Cotización #${resultado.secuencial}`,
            `Falló el envío automático del PDF de la cotización #${resultado.secuencial} a ${waId} (modo reducido). Reenviar manualmente.`,
            { tipo: 'text', botones: [{ texto: 'Ver Chat', accion: 'navigate', estilo: 'primary', url: '/dashboard/whatsapp' }] },
            ideEmpr, 'bot',
          );
        } catch (notifErr) {
          this.logger.error(`[Notif] Error notificando fallo de envío de PDF: ${notifErr.message}`);
        }
      }

      const totalFinal = resultado.total ?? 0;
      await this.sendText(ideEmpr, waId,
        `✅ *¡Tu cotización #${resultado.secuencial} está lista!* 🎉\n\n💰 *Total: $${totalFinal.toFixed(2)}*\n\n` +
        (pdfEnviado
          ? `📄 Adjuntamos el PDF con el detalle completo.`
          : `📄 En un momento te enviamos el PDF con el detalle completo.`) +
        `\n\nSi necesitas algo más, un asesor comercial está disponible para ayudarte 😊\n\n` +
        `⏰ *Horario de atención:* Lunes a viernes de 08:00 a 17:00 y sábados de 09:00 a 13:00. Fuera de este horario te responderemos el próximo día hábil.`,
      );
      // null = ya se le avisó al cliente arriba; nota interna solo para el asesor/log.
      await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr,
        null,
        `Cotización #${resultado.secuencial} generada automáticamente (match exacto de producto y precio) — PDF ya enviado al cliente.`
        + (notaCompleta ? `\n${notaCompleta}` : ''),
      );
      return;
    }

    const referencia = resultado?.secuencial ? ` *N° ${resultado.secuencial}*` : '';
    // Detalle de productos en el mensaje: antes solo confirmaba el número de cotización
    // sin decir qué se registró — el cliente no tenía forma de verificar que el bot
    // entendió bien su pedido hasta que un asesor le respondiera.
    // Igual que buildListaProductos: si la cantidad vino de convertir una expresión
    // coloquial (caneca, galón, etc.), se le muestra al cliente lo que ÉL escribió —
    // el número ya convertido a kg queda solo para uso interno de la proforma.
    const detalleProductos = productosResueltos
      .map((p) => `- ${p.nombre.toUpperCase()} ${
        p.cantidadTexto || (p.cantidad === 0 ? '(cantidad mínima)' : `${p.cantidad}${p.siglas_unidad || ''}`)
      }`)
      .join('\n');
    await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr,
      `¡Perfecto! 😊 Ya registré tu cotización${referencia} ✅ con los siguientes detalles:\n${detalleProductos}\n\nUn asesor comercial 👤 la va a completar y te responderá lo antes posible.\n\n⏰ *Horario de atención:* Lunes a viernes de 08:00 a 17:00 y sábados de 09:00 a 13:00. Fuera de este horario te responderemos el próximo día hábil. ¡Gracias!`,
      notaCompleta,
    );
  }

  /**
   * Recibe la respuesta con los datos de producto pedidos (cantidad/uso/nombre, lo que
   * faltara) y extrae lo que el cliente indicó. Si `ciudadPreguntada` ya está activo,
   * en cambio, esta respuesta es la contestación a la pregunta de ciudad (mensaje
   * independiente, ver preguntarCiudadOFinalizar) y finaliza directo. Cuando cantidad/
   * uso/nombre quedan completos, resuelve los productos contra el catálogo interno (sin
   * disambiguación multi-turno) y genera la cotización con procesarProforma() — sin
   * forma de pago (efectivo por defecto). Si el match fue exacto se le responde con el
   * PDF (ver finalizarCotizacionRapida); si no, queda para que un asesor la complete. Si
   * todavía falta algo, vuelve a preguntar solo lo que falta.
   */
  private async handleRecopilandoCotizacionRapida(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string,
    nombreBot: string, nombreEmpresa: string, config: any,
  ): Promise<void> {
    let datos = sesion.datos_sesion as DatosSesion;
    const cot = datos.cotizacion_rapida;
    if (!cot) {
      // Estado inconsistente (no debería pasar) — vuelve a atención libre reducida.
      await this.botSession.update(sesion.ide_whbse, BotState.ATENCION_LIBRE_REDUCIDA, datos);
      await this.handleAtencionLibreReducida(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, nombreBot, nombreEmpresa, config);
      return;
    }

    // El cliente puede dar su nombre "tarde" — después de que ya se dejó de insistir y se
    // asignó CONSUMIDOR FINAL (ver handleAtencionLibreReducida). Sin este chequeo quedaba
    // sordo para siempre: "Soy Mafer" se colaba como respuesta de cantidad/uso (caso real
    // detectado 2026-09-17). Se usa GPT (extraerNombreYCiudad), NO un regex tipo /^soy\s+.../
    // — un regex así también matchea "Soy de Quito" y lo hubiera tomado como si el nombre
    // fuera "de Quito" (gap detectado 2026-09-17 al revisar este mismo fix): GPT ya sabe
    // distinguir nombre de ciudad. Se aprovecha la misma llamada para adelantar la ciudad
    // si la dio y todavía no la teníamos — evita preguntarla de nuevo más adelante.
    if (datos.cliente?.nombres === 'CONSUMIDOR FINAL') {
      const { nombre: nombreTardio, ciudad: ciudadTardia } = await this.botGpt.extraerNombreYCiudad(texto, true, true);
      if (nombreTardio) {
        datos = {
          ...datos,
          cliente: {
            ...(datos.cliente ?? { correo: '', es_cliente_registrado: false }),
            nombres: nombreTardio,
          },
          envio: ciudadTardia && !datos.envio?.provincia
            ? { ...(datos.envio ?? {}), provincia: ciudadTardia }
            : datos.envio,
        };
        await this.botSession.update(sesion.ide_whbse, BotState.RECOPILANDO_COTIZACION_RAPIDA, datos);
        await this.sendText(ideEmpr, waId, `¡Mucho gusto, *${nombreTardio}*! 😊`);
      }
    }

    // La ciudad ya se preguntó como mensaje independiente (ver preguntarCiudadOFinalizar)
    // — esta respuesta es la contestación a esa pregunta puntual. Se intenta extraer la
    // ciudad, pero no bloquea: se finaliza la cotización de una vez, la haya reconocido
    // o no (ya se preguntó una vez, no tiene sentido insistir).
    if (cot.ciudadPreguntada) {
      const { ciudad, restoTexto } = await this.botGpt.extraerNombreYCiudad(texto, false, true);
      const datosConCiudad: DatosSesion = {
        ...datos,
        envio: {
          ...(datos.envio ?? {}),
          // direccion_cccpr de la proforma debe reflejar textualmente lo que el cliente
          // escribió (ver bot-proforma.service.ts) — provincia guarda el nombre de
          // ciudad/provincia ya normalizado por GPT, usado solo para el match contra
          // gen_canton/gen_provincia.
          direccion: datos.envio?.direccion || texto.trim(),
          provincia: datos.envio?.provincia || ciudad || texto.trim() || undefined,
        },
      };
      // Este es el ÚLTIMO mensaje del flujo — si el cliente aprovecha para pedir algo más
      // junto con la ciudad (ej. "también de Propilenglicol, desde Quito"), ya no hay otro
      // paso donde el bot lo vaya a preguntar: sin esto, "Propilenglicol" se perdía
      // silenciosamente, la cotización cerraba solo con el producto original (caso real
      // detectado 2026-09-17). No se reabre todo el flujo de cantidad/uso acá (agregaría
      // riesgo a un paso ya delicado) — se deja como nota interna para que el asesor lo
      // vea y lo agregue él mismo a la cotización.
      await this.finalizarCotizacionRapida(
        waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, datosConCiudad, cot.items, nombreBot, nombreEmpresa,
        restoTexto ? `El cliente mencionó algo más junto con la ciudad: "${restoTexto}" — revisar si debe agregarse a la cotización.` : undefined,
      );
      return;
    }

    const nombreFaltante = !datos.cliente?.nombres;
    const pedirUso = cot.pedirUso ?? false;
    const itemsSinCantidad = cot.items.filter((i) => i.cantidad === null);
    const itemsSinUso = pedirUso ? cot.items.filter((i) => !i.uso) : [];

    // Ciudad NO se pide acá: es un mensaje independiente aparte, después de que cantidad/
    // uso/nombre estén completos (ver preguntarCiudadOFinalizar) — antes se mezclaba con
    // esta pregunta desde el primer mensaje, lo que sonaba a formulario largo en vez de
    // una conversación (caso real detectado 2026-09-13).
    const [datosPersona, cantidadesExtraidas, usosExtraidos] = await Promise.all([
      nombreFaltante
        ? this.botGpt.extraerNombreYCiudad(texto, true, false)
        : Promise.resolve({ nombre: null, ciudad: null }),
      itemsSinCantidad.length
        ? this.botGpt.extraerCantidadesPorProducto(
            itemsSinCantidad.map((i) => ({ nombre: i.producto, siglas_unidad: 'KG', nombre_unidad: 'Kilogramos' })),
            texto,
          )
        : Promise.resolve([] as { cantidad: number | null; cantidadTexto?: string | null }[]),
      itemsSinUso.length
        ? this.botGpt.extraerUsosPorProducto(itemsSinUso.map((i) => i.producto), texto)
        : Promise.resolve([] as (string | null)[]),
    ]);

    let cursorCantidad = 0;
    let cursorUso = 0;
    const itemsActualizados = cot.items.map((i) => {
      let actualizado = i;
      if (actualizado.cantidad === null) {
        const nueva = cantidadesExtraidas[cursorCantidad];
        cursorCantidad += 1;
        if (nueva?.cantidad != null) {
          actualizado = { ...actualizado, cantidad: nueva.cantidad, cantidadTexto: nueva.cantidadTexto ?? undefined };
        }
      }
      if (pedirUso && !actualizado.uso) {
        const nuevo = usosExtraidos[cursorUso];
        cursorUso += 1;
        if (nuevo) actualizado = { ...actualizado, uso: nuevo };
      }
      return actualizado;
    });

    const nuevosDatos: DatosSesion = {
      ...datos,
      cotizacion_rapida: { items: itemsActualizados, pedirUso },
      cliente: {
        ...(datos.cliente ?? { correo: '', es_cliente_registrado: false }),
        nombres: datos.cliente?.nombres || datosPersona.nombre || '',
      },
    };

    const faltantes = this.construirFaltantesCotizacionRapida(
      itemsActualizados, pedirUso, !!nuevosDatos.cliente?.nombres,
    );

    if (faltantes.length) {
      await this.botSession.update(sesion.ide_whbse, BotState.RECOPILANDO_COTIZACION_RAPIDA, nuevosDatos);
      await this.sendText(ideEmpr, waId, `Gracias 🙌 Solo me falta:\n\n${faltantes.join('\n\n')}`);
      return;
    }

    // Cantidad/uso/nombre completos recién ahora — la ciudad se pregunta como mensaje
    // aparte (o se finaliza directo si ya la teníamos de memoria).
    await this.preguntarCiudadOFinalizar(
      waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, nuevosDatos, itemsActualizados, nombreBot, nombreEmpresa,
    );
  }

  /**
   * Resuelve cada producto contra el catálogo interno SIN disambiguación multi-turno
   * (a diferencia de resolverColaProductos, usado por el flujo completo): con 1 resultado
   * lo usa directo, con varios toma el primero (mejor ranking), y sin resultados cae al
   * artículo genérico con el texto literal del cliente — mismo fallback ya usado en
   * resolverColaProductos para "nada matcheó". El asesor humano confirma el detalle exacto
   * al completar la cotización, así que no vale la pena gastar mensajes desambiguando acá.
   */
  private async resolverProductosSimple(
    items: ItemCotizacionRapida[],
    ideEmpr: number,
  ): Promise<ProductoSesion[]> {
    const generico = await this.botTools.obtenerProductoPorId(PRODUCTO_GENERICO_IDE_INARTI, ideEmpr);
    const resultado: ProductoSesion[] = [];

    for (const item of items) {
      const cantidad = item.cantidad ?? 0;
      const nombreLimpio = item.producto
        .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|kilo[s]?|lb[s]?|gr[s]?|g\b|litro[s]?|lt[s]?|ml|und[s]?|unidad[s]?|galon[s]?|gal[s]?|lb)\b/gi, '')
        .replace(/\b\d+\b/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim() || item.producto;

      let candidatos = await this.botTools.buscarProductos(nombreLimpio, ideEmpr);
      // Confiable = sin ambigüedad: un único candidato, o alguno matchea el nombre EXACTO
      // entre varios. El fallback difuso por palabras sueltas nunca es confiable — solo
      // sirve para no perder el ide_inarti (y así el precio) si nada más apareció.
      let confiable = candidatos.length === 1 || candidatos.some((c) => c.matched_exacto);
      if (!candidatos.length) {
        candidatos = await this.botTools.buscarProductosPorPalabras(nombreLimpio, ideEmpr);
        confiable = false;
      }

      if (candidatos.length) {
        const prod = confiable ? candidatos[0] : (candidatos.find((c) => c.matched_exacto) ?? candidatos[0]);
        resultado.push({
          ide_inarti: prod.ide_inarti,
          nombre: item.producto,
          cantidad,
          cantidadTexto: item.cantidadTexto ?? undefined,
          unidad: prod.nombre_unidad,
          siglas_unidad: prod.siglas_unidad,
          // en_catalogo solo si el match es confiable: evita que una coincidencia
          // ambigua o difusa dispare la cotización 100% automática (sin revisión
          // humana) — igual se deja el ide_inarti real para que el precio se cargue
          // y el asesor solo tenga que confirmar el producto, no armarlo desde cero.
          en_catalogo: confiable && prod.en_catalogo,
          uso_generico: item.uso ?? undefined,
        });
      } else {
        resultado.push({
          ide_inarti: generico?.ide_inarti ?? PRODUCTO_GENERICO_IDE_INARTI,
          nombre: item.producto,
          cantidad,
          cantidadTexto: item.cantidadTexto ?? undefined,
          unidad: generico?.nombre_unidad ?? 'Unidad',
          siglas_unidad: generico?.siglas_unidad ?? 'UND',
          en_catalogo: generico?.en_catalogo ?? false,
          uso_generico: item.uso ?? undefined,
        });
      }
    }
    return resultado;
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────

  private async handleInicio(
    waId: string, phoneNumberId: string, ideWhcha: number, ideWhcue: number, ideEmpr: number,
    texto: string, nombreBot: string, nombreEmpresa: string, sesion: any, config: any,
  ): Promise<void> {
    const datosSesion = sesion.datos_sesion as DatosSesion;
    const nombreCliente = datosSesion?.cliente?.nombres;

    if (nombreCliente) {
      // Ya lo conocemos (memoria de una sesión anterior) — se saluda por su nombre y
      // se responde de una vez a lo que haya escrito, sin gates de confirmación.
      await this.sendText(ideEmpr, waId, `¡Hola de nuevo, *${nombreCliente}*! 😊`);
      const datosActualizados: DatosSesion = { ...datosSesion, productos: datosSesion?.productos ?? [] };
      await this.responderConsultaInicial(
        waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, datosActualizados, texto, nombreEmpresa, config,
      );
      return;
    }

    // Chat nuevo (sin memoria previa): puede ser un proveedor ofreciendo VENDERnos algo,
    // no un cliente buscando comprar — el bot existe para cotizar y captar clientes
    // rápido, no para gestionar ofertas de proveedores. Se deriva directo, sin la
    // fricción del saludo/identificación de venta.
    if (await this.botGpt.esProveedorNoCliente(texto)) {
      await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr,
        `¡Gracias por escribirnos! 😊 Para temas de proveedores, un asesor comercial revisará tu propuesta en nuestro horario de atención.\n\n⏰ *Horario de atención:* Lunes a viernes de 08:00 a 17:00 y sábados de 09:00 a 13:00.`,
        `Mensaje de chat nuevo clasificado como oferta de proveedor, no consulta de cliente: "${texto}"`,
      );
      return;
    }

    // No lo conocemos: antes de preguntar el nombre, se intenta extraerlo del mismo
    // mensaje — un saludo típico ya lo trae junto con lo que necesita (ej. "Hola mi
    // nombre es Diego, busco Peg600"). Sin este chequeo el bot ignoraba el nombre que
    // el cliente ya dio y se lo volvía a preguntar, una redundancia que suena a
    // formulario, no a conversación (gap detectado 2026-09-13 al trazar este caso).
    const { nombre: nombreEnSaludo } = await this.botGpt.extraerNombreYCiudad(texto, true, false);
    if (nombreEnSaludo) {
      const datosConNombre: DatosSesion = {
        ...datosSesion,
        productos: datosSesion?.productos ?? [],
        cliente: { nombres: nombreEnSaludo, correo: '', es_cliente_registrado: false },
      };
      // Mismo criterio que handleAtencionLibreReducida: se presenta (nombre del bot +
      // empresa) aunque el cliente ya haya dado su nombre en el mismo mensaje — es el
      // primer contacto real, no tiene por qué saber con quién/qué empresa está hablando.
      await this.sendText(ideEmpr, waId,
        `¡Hola, *${nombreEnSaludo}*! Mucho gusto 😊 Soy *${nombreBot}*, asistente de *${nombreEmpresa}*.`,
      );
      await this.responderConsultaInicial(
        waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, datosConNombre, texto, nombreEmpresa, config,
      );
      return;
    }

    // No dio su nombre en este mensaje: se pregunta antes de responder — se guarda lo
    // que preguntó para contestarlo apenas lo sepamos, en vez de pedirle que lo repita.
    const datosActualizados: DatosSesion = {
      ...datosSesion, productos: datosSesion?.productos ?? [], texto_inicial: texto, intentosNombre: 1,
    };
    await this.botSession.update(sesion.ide_whbse, BotState.ESPERANDO_CONFIRMACION, datosActualizados);
    await this.sendText(ideEmpr, waId, `¡Hola! Soy *${nombreBot}*, asistente de *${nombreEmpresa}* 😊 ¿Cuál es tu nombre?`);
  }

  private async handleConfirmacion(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, nombreBot: string, nombreEmpresa: string, config: any,
  ): Promise<void> {
    const datos = sesion.datos_sesion as DatosSesion;
    const t = texto.trim();

    // Salidas explícitas tienen prioridad, incluso mientras se espera el nombre.
    if (REGEX_SALIR.test(t) || PALABRAS_ASESOR.test(t)) {
      await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr);
      await this.botSession.cerrar(sesion.ide_whbse, BotState.CANCELADO);
      return;
    }

    if (!datos.cliente?.nombres) {
      // Todavía no sabemos su nombre — se interpreta este mensaje como la respuesta a
      // "¿cuál es tu nombre?" del saludo. GPT lo extrae del texto libre (no heurísticas
      // de patrón: "soy Diego", "me llamo Diego" o solo "Diego" son todas válidas) para
      // que la conversación se sienta natural, no como un formulario.
      const { nombre, restoTexto } = await this.botGpt.extraerNombreYCiudad(texto, true, false);
      const intentosPrevios = datos.intentosNombre ?? 1;
      if (!nombre) {
        // Este mensaje tampoco traía el nombre — puede traer, en cambio, lo que el
        // cliente necesita (ej. "Dispone de yoduro de potasio"). Se acumula en
        // texto_inicial en vez de descartarlo: sin esto, cuando el cliente por fin da su
        // nombre en un mensaje posterior, solo se combina con el saludo original y este
        // mensaje intermedio se pierde en silencio — el bot termina mostrando el menú
        // genérico en vez de la cotización que ya había pedido (caso real: "Buenos dias"
        // → "Dispone de yoduro de potasio" → "Ashly" → el bot ignoró el producto).
        const textoAcumulado = [datos.texto_inicial, texto].filter(Boolean).join('\n');
        if (intentosPrevios >= 2) {
          // 2 intentos sin lograr extraer el nombre — se deja de insistir (mismo criterio
          // que handleAtencionLibreReducida, caso real detectado 2026-09-16) y se sigue
          // con CONSUMIDOR FINAL en vez de repreguntar indefinidamente. OJO: se sigue con
          // `datos.texto_inicial` (lo acumulado ANTES de este último intento), NO con
          // `textoAcumulado` — este último mensaje falló específicamente el chequeo de
          // "¿es un nombre?", y textos cortos así (ej. "Sol") son justo el tipo de texto
          // que analizarLoteProductos puede malinterpretar como un producto más si se le
          // reinyecta sin filtrar (caso real detectado 2026-09-17: "Sol" — probablemente
          // el nombre real de la clienta, que GPT no reconoció con certeza — terminó listado
          // como segundo producto de la cotización junto a "percarbonato").
          const datosConsumidorFinal: DatosSesion = {
            ...datos,
            texto_inicial: undefined,
            cliente: { nombres: 'CONSUMIDOR FINAL', correo: '', es_cliente_registrado: false },
          };
          await this.responderConsultaInicial(
            waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, datosConsumidorFinal,
            datos.texto_inicial || texto, nombreEmpresa, config,
          );
          return;
        }
        if (textoAcumulado !== datos.texto_inicial) {
          await this.botSession.update(sesion.ide_whbse, BotState.ESPERANDO_CONFIRMACION,
            { ...datos, texto_inicial: textoAcumulado, intentosNombre: intentosPrevios + 1 });
        } else {
          await this.botSession.update(sesion.ide_whbse, BotState.ESPERANDO_CONFIRMACION,
            { ...datos, intentosNombre: intentosPrevios + 1 });
        }
        // Segundo pedido — tono cordial pero más directo que el saludo inicial, no la
        // misma pregunta repetida (caso real detectado 2026-09-16).
        await this.sendText(ideEmpr, waId, `Para poder continuar, ¿me facilitas tu nombre por favor? 😊`);
        return;
      }

      const datosConNombre: DatosSesion = {
        ...datos,
        cliente: {
          ...(datos.cliente ?? {}),
          nombres: nombre,
          correo: datos.cliente?.correo || '',
          es_cliente_registrado: datos.cliente?.es_cliente_registrado ?? false,
        },
      };
      await this.sendText(ideEmpr, waId, `¡Mucho gusto, *${nombre}*! 😊`);
      // Se combina lo que había preguntado en el saludo (ej. "Hola, tienen cera de
      // coco") CON el resto de esta respuesta, SIN el nombre ya extraído (ej. "Janneth
      // Pachacama quiero la ubicación" → restoTexto="quiero la ubicación") — antes se
      // reinyectaba el mensaje CRUDO completo, así que si el cliente respondía
      // ÚNICAMENTE con su nombre/empresa (ej. "Laboratorio DOC"), ese texto se colaba en
      // el análisis de productos y GPT lo tomaba como un segundo producto de la lista
      // (mismo bug del flujo reducido, ver handleAtencionLibreReducida — caso real
      // detectado 2026-09-15). Si el saludo original no traía nada (solo "Hola") ni esta
      // respuesta traía nada más que el nombre, queda vacío.
      const textoParaResponder = [datosConNombre.texto_inicial, restoTexto].filter(Boolean).join('\n');
      await this.responderConsultaInicial(
        waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, datosConNombre, textoParaResponder, nombreEmpresa, config,
      );
      return;
    }

    // Nombre ya conocido — no debería llegar normalmente (handleInicio ya responde de
    // una vez cuando lo conoce), cubre el caso borde de un mensaje que llegó mientras
    // se procesaba el anterior. Se combina con texto_inicial (si quedó algo pendiente
    // sin responder) en vez de reemplazar este mensaje nuevo por uno viejo.
    const textoParaResponder = [datos.texto_inicial, texto].filter(Boolean).join('\n');
    await this.responderConsultaInicial(
      waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, datos, textoParaResponder, nombreEmpresa, config,
    );
  }

  /**
   * Clasifica el mensaje inicial (o el que quedó pendiente mientras se preguntaba el
   * nombre) y lo responde — misma lógica para un cliente ya conocido (handleInicio) o
   * uno que recién dio su nombre (handleConfirmacion).
   */
  private async responderConsultaInicial(
    waId: string, phoneNumberId: string, ideWhcha: number, ideWhcue: number, ideEmpr: number,
    sesion: any, datos: DatosSesion, textoInicial: string, nombreEmpresa: string, config: any,
  ): Promise<void> {
    const tipoConsulta = await this.botGpt.clasificarConsulta(textoInicial);

    if (tipoConsulta === 'PRODUCTO') {
      await this.manejarConsultaProductoClasica(
        waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, datos, textoInicial, nombreEmpresa, config,
      );
      return;
    }

    if (['UBICACION', 'HORARIO', 'ENVIO', 'CATALOGO'].includes(tipoConsulta)) {
      await this.responderInfo(ideEmpr, waId, tipoConsulta as any, nombreEmpresa, config);

      // El mensaje puede combinar la pregunta informativa con una consulta de producto en
      // el mismo texto (ej. "dónde están ubicados y disponen percarbonato de sodio") —
      // clasificarConsulta solo devuelve UNA categoría, así que sin este chequeo la mitad
      // del mensaje (el producto) se perdía en silencio (caso real detectado 2026-09-13).
      const { items: itemsExtra } = await this.botGpt.analizarLoteProductos(textoInicial, []);
      if (itemsExtra.length) {
        await this.manejarConsultaProductoClasica(
          waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, datos, textoInicial, nombreEmpresa, config,
        );
        return;
      }

      await this.botSession.update(sesion.ide_whbse, BotState.ATENCION_LIBRE, datos);
      return;
    }

    await this.botSession.update(sesion.ide_whbse, BotState.ATENCION_LIBRE, datos);
    await this.sendText(ideEmpr, waId,
      `¡Perfecto! 😊 ¿En qué te puedo ayudar hoy?\n\n` +
      `🧪 Cotización de productos\n` +
      `📍 Ubicación y cómo llegar\n` +
      `🕒 Horarios de atención\n` +
      `🚚 Información de envíos\n` +
      `📦 Catálogos y precios\n\n` +
      `_Escribe lo que necesitas o *SALIR* para hablar con un asesor_`,
    );
  }

  /**
   * Lógica de "el cliente quiere un producto" compartida entre responderConsultaInicial
   * (cuando esa es la única intención del mensaje) y handleAtencionLibre (mismo caso, más
   * adelante en la conversación) — extraída para poder invocarla también cuando el
   * mensaje combina una pregunta informativa (ubicación/horario/envío/catálogo) CON una
   * consulta de producto en el mismo texto, algo que clasificarConsulta no puede reflejar
   * al devolver una sola categoría.
   */
  private async manejarConsultaProductoClasica(
    waId: string, phoneNumberId: string, ideWhcha: number, ideWhcue: number, ideEmpr: number,
    sesion: any, datos: DatosSesion, textoProducto: string, nombreEmpresa: string, config: any,
  ): Promise<void> {
    // Antes de arrastrar al cliente por todo el flujo (identificación, dirección, forma
    // de pago) se verifica que AL MENOS UNO de los productos mencionados tenga algún
    // candidato en el catálogo interno — nada exige que sea el match correcto, solo que
    // exista algo remotamente parecido. Si NINGUNO existe, no tiene sentido pedirle
    // nombre/cédula/dirección para algo que de todas formas va a terminar en "no
    // disponemos" (patrón real detectado: clientes esperando horas a que un asesor
    // confirme que no hay stock, después de completar todo el formulario). Se deriva de
    // una vez, sin gastarle el tiempo.
    // Se pasa historial reciente para que GPT resuelva mensajes de seguimiento que no
    // repiten el producto (ej. el cliente pregunta por dos productos, el bot responde, y
    // el cliente solo contesta "1kg de cada uno") — mismo fix ya aplicado en el modo
    // reducido (manejarConsultaProductoReducida); sin esto, "1kg de cada uno" llegaba sin
    // ningún producto detectado y el chequeo de catálogo de abajo terminaba adivinando
    // un producto de una conversación vieja (caso real detectado 2026-09-13).
    const historialProducto = await this.botSession.getHistorialMensajes(ideWhcha, 6);
    const { items: itemsDetectados } = await this.botGpt.analizarLoteProductos(textoProducto, [], historialProducto);

    // Si GPT no logró extraer ningún nombre de producto puntual (ej. "quiero saber los
    // productos que disponen", "necesito una cotización" sin decir de qué), NO se debe
    // seguir el flujo de cotización usando el mensaje completo como si fuera el nombre
    // de un producto — eso generaba respuestas sin sentido como "cuéntame qué cantidad
    // necesitas de quiero saber los productos que disponen" (caso real detectado
    // 2026-09-13). Se le pide que precise qué producto le interesa, sin arrastrar el
    // mensaje vago a ningún lado.
    if (!itemsDetectados.length) {
      await this.sendText(ideEmpr, waId, `¡Con gusto! 😊 Cuéntame qué productos necesitas cotizar y en qué cantidades, y te preparo la cotización.`);
      await this.botSession.update(sesion.ide_whbse, BotState.ATENCION_LIBRE, datos);
      return;
    }

    let pedirUso = false;
    {
      const estadoProducto = await this.evaluarExistenciaProductos(
        itemsDetectados.map((i) => i.producto), ideEmpr,
      );

      if (estadoProducto.estado === 'NO_VENDEMOS') {
        const mensaje = estadoProducto.observacion?.trim() || 'Por el momento no comercializamos ese producto 😔';
        await this.sendText(ideEmpr, waId, `${mensaje} ¿Te ayudo con algo más?`);
        await this.botSession.update(sesion.ide_whbse, BotState.ATENCION_LIBRE, datos);
        return;
      }

      // SIN_MATCH: no matcheó con confianza en catálogo interno, catálogo público, por
      // palabras, NI con el registro de no-disponibles — puede tener otro nombre o
      // conseguirse con un proveedor aliado, así que el bot no asume "no lo vendemos"
      // acá. Se levanta la solicitud igual pidiendo también el USO de cada producto,
      // para que un asesor la complete con contexto real.
      if (estadoProducto.estado === 'SIN_MATCH') pedirUso = true;
    }

    // Si NO dio cantidad todavía (solo pregunta si hay tal producto) y sí sabemos que
    // existe, primero se intenta dirigir al catálogo público con stock — mismo criterio
    // que el modo reducido (manejarConsultaProductoReducida), que esta función no tenía:
    // sin esto, "tiene fragancias para velas" saltaba directo a "cuéntame la cantidad"
    // sin haberle confirmado el producto ni mostrado el catálogo, aunque sí existiera
    // (caso real detectado 2026-09-13). Se omite cuando pedirUso es true: evaluar
    // Existencia ya intentó este mismo match de catálogo como parte del chequeo y no
    // encontró nada, repetirlo sería una llamada a GPT de más para el mismo resultado.
    const hayItemConCantidad = itemsDetectados.some((i) => i.cantidad !== null);
    let itemsPendientes: ItemCotizacionRapida[] = itemsDetectados;
    if (!pedirUso && itemsDetectados.length && !hayItemConCantidad) {
      const catalogos = await this.botProforma.obtenerCatalogosDisponibles(ideEmpr);
      if (catalogos.length) {
        // Chequeo POR PRODUCTO, no contra el mensaje completo — antes un solo match de
        // GPT sobre todo el texto devolvía UN catálogo y el bot respondía "¡Sí,
        // disponemos!" como si hubiera confirmado TODOS los productos mencionados (caso
        // real: "manteca de karité y cera de coco" → solo "cera de coco" está en el
        // catálogo de Ceras, pero el bot dio ese link como si también cubriera la
        // manteca de karité, que puede estar en otro catálogo o en ninguno).
        const matches = await Promise.all(
          itemsDetectados.map((item) => this.botGpt.matchCatalogoProducto(item.producto, catalogos)),
        );
        const conCatalogo = itemsDetectados.filter((_, i) => matches[i]?.ide_cata);
        itemsPendientes = itemsDetectados.filter((_, i) => !matches[i]?.ide_cata);

        if (conCatalogo.length) {
          const idsUnicos = [...new Set(matches.map((m) => m?.ide_cata).filter((id): id is number => !!id))];
          const links = idsUnicos.map((id) => {
            const c = catalogos.find((cat) => cat.ide_cata === id);
            return c?.path_cata ? `https://diquimec.com.ec/catalogo/${c.path_cata}` : 'https://diquimec.com.ec/catalogo';
          });
          const nombres = conCatalogo.map((i) => `*${i.producto}*`).join(', ');
          // "Dime la cantidad..." solo tiene sentido cuando el match fue a un producto
          // PUNTUAL — si solo matcheó el tema/título del catálogo (ej. "esencias para
          // velas" → catálogo con varios productos), no se sabe cuál puntual quiere el
          // cliente, así que no tiene sentido pedirle cantidad todavía.
          const todosEspecificos = matches
            .filter((m): m is { ide_cata: number; matchEspecifico: boolean } => !!m?.ide_cata)
            .every((m) => m.matchEspecifico);
          await this.sendText(ideEmpr, waId,
            `¡Sí, disponemos de ${nombres}! 😊 Lo puedes encontrar en nuestro catálogo de emprendedores, con precios incluidos: ${links.join(' | ')} — ahí mismo puedes generar tu cotización.` +
            (itemsPendientes.length || !todosEspecificos ? '' : ' Si prefieres, dime la cantidad que necesitas y la generamos por aquí.'),
          );
          // Se guardan aunque no sigan en itemsPendientes — nunca van a entrar a
          // cotizacion_rapida.items, así que sin esto el asesor nunca se entera de que el
          // cliente también preguntó por estos (mismo criterio que manejarConsultaProducto
          // Reducida — ver DatosSesion.productosEnCatalogoPublico).
          datos = {
            ...datos,
            productosEnCatalogoPublico: [
              ...(datos.productosEnCatalogoPublico ?? []),
              ...conCatalogo.map((i) => i.producto),
            ],
          };
          if (!itemsPendientes.length) {
            await this.botSession.update(sesion.ide_whbse, BotState.ATENCION_LIBRE, datos);
            return;
          }
          // Quedan productos sin catálogo público (itemsPendientes) — se sigue el flujo
          // normal para pedir su cantidad, sin cortar la conversación acá.
        }
      }
    }

    if (datos.cliente?.nombres) {
      // Consulta puntual (una pregunta aislada, no una sesión de armar un carrito largo)
      // — se usa el mismo flujo liviano del modo reducido: pide solo lo que falte
      // (la cantidad, y el uso si el producto no matcheó en ninguna fuente) y, apenas
      // está completo, genera la proforma directo y deriva a un asesor. El flujo de
      // "agregar más/escribe FIN" (procesarTextoProductos) quedó en desuso — es una
      // ceremonia pensada para carritos largos que solo suma mensajes de más para una
      // pregunta puntual (caso real: "tiene cera de palma" terminaba en "¿necesitas
      // algún otro producto?").
      // itemsPendientes nunca queda vacío acá: si el chequeo de catálogo de arriba
      // cubrió TODOS los ítems detectados, ya se retornó antes.
      await this.iniciarRecopilacionCotizacionRapida(
        waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, datos, itemsPendientes,
        config?.nombre_bot || 'QuimIA', nombreEmpresa, pedirUso,
      );
    } else {
      // No sabemos su nombre: se pide directo, sin preguntar antes "¿ya compraste con
      // nosotros?" — la gran mayoría de los chats nuevos que llegan al bot nunca
      // compraron antes, así que esa pregunta casi siempre era un mensaje de más. El
      // texto con el producto se guarda para procesarlo automáticamente en cuanto
      // tengamos el nombre (handleDatosNuevoCliente), sin que lo repita.
      await this.sendText(ideEmpr, waId, `Para brindarte una atención más personalizada 😊 ¿Me podrías indicar tu nombre?`);
      await this.botSession.update(sesion.ide_whbse, BotState.DATOS_NUEVO_CLIENTE, {
        ...datos,
        cliente: { nombres: '', correo: '', es_cliente_registrado: false, pendiente_campo: 'nombres' },
        producto_texto_pendiente: textoProducto || undefined,
      });
    }
  }

  /**
   * Chequeo rápido de EXISTENCIA (sin precio, sin desambiguar) antes de arrastrar al
   * cliente por identificación/dirección — no resuelve cuál es el producto correcto
   * (eso lo hace resolverColaProductos/resolverProductosSimple más adelante, con más
   * cuidado), solo decide cómo seguir:
   *   - NO_VENDEMOS: coincide con un registro CONFIRMADO en `wha_bot_no_disponible`
   *     (cargado a mano por un asesor) → se responde directo con la observación (texto
   *     de cara al cliente, ej. "Es un producto restringido, no lo comercializamos").
   *   - EXISTE: al menos un producto mencionado tiene algún candidato remoto en
   *     `inv_articulo`, o matchea una categoría del catálogo público.
   *   - SIN_MATCH: no matcheó con confianza en ninguna fuente (ni siquiera el registro
   *     de no-disponibles) → caso incierto, puede tener otro nombre o conseguirse con
   *     un proveedor aliado — el bot NO asume "no lo vendemos" acá, toma el pedido
   *     igual (cantidad + uso) para que un asesor decida con contexto real.
   */
  private async evaluarExistenciaProductos(
    nombresProducto: string[], ideEmpr: number,
  ): Promise<
    { estado: 'EXISTE' } | { estado: 'NO_VENDEMOS'; observacion: string | null } | { estado: 'SIN_MATCH' }
  > {
    // Orden de confianza: registro curado de "no disponibles" (alta precisión,
    // confirmado a mano por un asesor) PRIMERO, antes que el catálogo — antes iba
    // después del catálogo, así que un producto que SÍ existe como artículo interno
    // (ej. para formulación/uso interno) pero está marcado como no disponible para
    // venta nunca llegaba a chequearse: el match del catálogo cortaba antes (caso real
    // detectado 2026-09-17: "ácido nítrico" tenía un registro de no-disponible, pero el
    // bot igual generó la cotización porque el artículo existe en inv_articulo).
    // Después: match en catálogo (alta precisión) → fallback difuso por palabras
    // sueltas (baja precisión) → categoría del catálogo público (mismo criterio ya
    // usado para dar el link de catálogo, sirve también como red de contención antes de
    // rendirse: cubre nombres que no aparecen literalmente en `inv_articulo` pero sí
    // caen dentro de una categoría pública, ej. "fragancias para velas").
    for (const nombre of nombresProducto) {
      const noDisponible = await this.botNoDisponible.buscar(nombre, ideEmpr);
      if (noDisponible) return { estado: 'NO_VENDEMOS', observacion: noDisponible.observacion_whbnd };
    }
    for (const nombre of nombresProducto) {
      const candidatos = await this.botTools.buscarProductos(nombre, ideEmpr);
      if (candidatos.length) return { estado: 'EXISTE' };
    }
    // El fallback difuso por palabras sueltas se omite para categorías genéricas
    // (sabor/color/fragancia/aceite/esencia): una sola palabra como "miel" o "vainilla"
    // matchea fácil productos no relacionados (ej. "sabor miel" → "CERA DE ABEJA MIEL
    // X"), y como esta categoría suele venir en decenas de variantes, es más probable
    // que el match sea el producto equivocado que el correcto. Mejor tratarlo como
    // SIN_MATCH (pide cantidad + uso) que arriesgar una cotización con el ítem que no
    // era.
    const esGenerico = nombresProducto.some((n) => REGEX_PRODUCTO_GENERICO.test(n));
    if (!esGenerico) {
      for (const nombre of nombresProducto) {
        const porPalabras = await this.botTools.buscarProductosPorPalabras(nombre, ideEmpr);
        if (porPalabras.length) return { estado: 'EXISTE' };
      }
    }
    // Una sola llamada a GPT con todos los nombres juntos (no una por producto) — el
    // mismo criterio que ya usa el link de catálogo (le pasa el mensaje completo del
    // cliente, no producto por producto). Evita N llamadas secuenciales a OpenAI cuando
    // el cliente menciona varios productos desconocidos a la vez, que sumaría segundos
    // de latencia a una respuesta de chat.
    const catalogos = await this.botProforma.obtenerCatalogosDisponibles(ideEmpr);
    if (catalogos.length) {
      const match = await this.botGpt.matchCatalogoProducto(nombresProducto.join(', '), catalogos);
      if (match?.ide_cata) return { estado: 'EXISTE' };
    }
    return { estado: 'SIN_MATCH' };
  }

  private async handleAtencionLibre(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, nombreBot: string, nombreEmpresa: string, config: any,
  ): Promise<void> {
    this.logger.debug(`[Bot] handleAtencionLibre texto="${texto}"`);
    const datos = sesion.datos_sesion as DatosSesion;

    // Afirmación corta después de respuesta informativa → interpretar como querer cotizar
    const esAfirmacion = /^(si|sí|s[ií]|si!|sí!|claro|ok|okey|dale|quiero|me interesa|adelante|por favor|porfa)[\s!.,]*$/i.test(texto.trim());
    const tipoConsulta = esAfirmacion ? 'PRODUCTO' : await this.botGpt.clasificarConsulta(texto);
    this.logger.debug(`[Bot] tipoConsulta="${tipoConsulta}"`);

    if (['UBICACION', 'HORARIO', 'ENVIO', 'CATALOGO'].includes(tipoConsulta)) {
      await this.responderInfo(ideEmpr, waId, tipoConsulta as any, nombreEmpresa, config);

      // El mensaje puede combinar la pregunta informativa con una consulta de producto
      // en el mismo texto (ej. "dónde están ubicados y disponen percarbonato de
      // sodio") — clasificarConsulta solo devuelve UNA categoría, así que sin este
      // chequeo la mitad del mensaje (el producto) se perdía en silencio.
      const { items: itemsExtra } = await this.botGpt.analizarLoteProductos(texto, []);
      if (itemsExtra.length) {
        await this.manejarConsultaProductoClasica(
          waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, datos, texto, nombreEmpresa, config,
        );
      }
      return;
    }

    if (tipoConsulta === 'PRODUCTO') {
      await this.manejarConsultaProductoClasica(
        waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, datos, texto, nombreEmpresa, config,
      );
      return;
    }

    // GENERAL: ninguna categoría específica aplicó — GPT responde con el prompt de la
    // empresa; si necesita un dato específico que no tiene, deriva a asesor en vez de
    // inventar (generateResponseConEscalamiento, antes solo lo tenía el flujo reducido —
    // portado acá 2026-09-17 para que el freno de "no inventes" aplique parejo en toda
    // la cuenta, sin importar reduce_mensajes_whbco).
    const historial = await this.botSession.getHistorialMensajes(ideWhcha, 6);
    const promptBase = (config.prompt_sistema || this.getPromptSistema(nombreBot, nombreEmpresa))
      .replace(/{BOT_NOMBRE}/g, nombreBot)
      .replace(/{NOMBRE_EMPRESA}/g, nombreEmpresa);
    // Refuerzo de contexto — el prompt configurado por la cuenta (`config.prompt_sistema`)
    // puede traer instrucciones desactualizadas ("pide correo y dirección de entrega") que
    // ya no aplican al flujo simplificado actual (correo por defecto de la empresa, solo
    // se pregunta la CIUDAD, nunca dirección exacta) — GPT las sigue al pie de la letra si
    // no se le dice lo contrario. Esto va SIEMPRE, sin importar el contenido del prompt de
    // la cuenta (casos reales detectados 2026-09-17: "Hola, Sara... necesitaría tu nombre
    // completo, correo electrónico... dirección de entrega" pese a que el cliente ya se
    // había identificado). Además: sin esto, GPT podía re-saludar con un nombre distinto
    // al ya guardado en sesión si el mensaje mencionaba otro nombre (ej. cliente ya
    // identificado como "Hunas" escribe "Andres le saluda" y el bot respondía "¡Hola,
    // Andrés!", como si fuera alguien nuevo) — caso real detectado 2026-09-15.
    const nombreConocido = datos.cliente?.nombres;
    const resultado = await this.botGpt.generateResponseConEscalamiento(
      promptBase, historial, texto,
      `Empresa: ${nombreEmpresa}. Responde de forma breve, cordial y precisa. ` +
      `REGLA FIJA que prevalece sobre cualquier instrucción de cotización del prompt: NUNCA pidas correo ` +
      `electrónico ni dirección exacta de entrega — el sistema ya usa el correo de la empresa por defecto y solo ` +
      `pregunta la ciudad al final, en un paso aparte que el sistema maneja solo. Si hace falta pedir algo para ` +
      `avanzar con una cotización, pedí SOLO el producto y la cantidad.` +
      (nombreConocido
        ? ` El cliente ya se identificó como "${nombreConocido}" — NO le vuelvas a pedir el nombre, no lo saludes ` +
          `de nuevo como si fuera alguien nuevo, ni cambies ese nombre aunque el mensaje mencione uno distinto ` +
          `(puede ser otra persona escribiendo desde el mismo número); seguí usando "${nombreConocido}" salvo que ` +
          `el cliente pida explícitamente corregirlo.`
        : ''),
    );
    if (resultado.interesGenerico) {
      // Interés general en una actividad/manualidad (ej. "quiero aprender a hacer
      // jabones") sin producto puntual — no se responde con conocimiento general
      // inventado, se envía el catálogo real y se deriva a un asesor para una
      // recomendación personalizada (mismo criterio que handleAtencionLibreReducida).
      await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr,
        `¡Con gusto! 📋 Aquí tienes nuestros catálogos:\n` +
        `🔹 Catálogo general: https://diquimec.com.ec/product\n` +
        `🔹 Catálogo para emprendedores (con precios): https://diquimec.com.ec/catalogo\n\n` +
        `Un asesor comercial 👤 te va a contactar para darte una atención más personalizada 😊`,
        `Cliente mostró interés general en una actividad/manualidad sin nombrar producto puntual: "${texto}"`,
      );
      return;
    }
    if (resultado.requiereAsesor) {
      await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, resultado.respuesta);
      return;
    }
    await this.sendText(ideEmpr, waId, resultado.respuesta);
  }

  private async handlePreguntaEsCliente(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string,
  ): Promise<void> {
    const datos = sesion.datos_sesion as DatosSesion;

    // Los botones devuelven el ID directamente
    const t = texto.trim().toUpperCase();
    let esCliente = t === 'SI_CLIENTE' || /^(SI|SÍ|S[Ii]|YES|YA|YA COMPRÉ)$/i.test(t);
    let esNuevo = t === 'NO_CLIENTE' || /^(NO|NUNCA|NUEVO|PRIMERA)$/i.test(t);

    // Si no hay match directo, GPT interpreta el texto libre
    if (!esCliente && !esNuevo) {
      const intencion = await this.botGpt.detectarIntencion(texto);
      if (intencion === 'CONFIRMAR') esCliente = true;
      else if (intencion === 'CANCELAR') esNuevo = true;
    }

    if (esCliente) {
      await this.botSession.update(sesion.ide_whbse, BotState.IDENTIFICACION, datos);
      await this.sendText(ideEmpr, waId,
        `¡Qué bueno tenerte de nuevo! 😊 Por favor dime tu *número de cédula o RUC* para ubicar tu información.`,
      );
      return;
    }

    if (esNuevo) {
      const nuevosDatos: DatosSesion = {
        ...datos,
        cliente: { nombres: '', correo: '', es_cliente_registrado: false, pendiente_campo: 'nombres' },
      };
      await this.botSession.update(sesion.ide_whbse, BotState.DATOS_NUEVO_CLIENTE, nuevosDatos);
      await this.sendText(ideEmpr, waId,
        `Es un placer atenderte 😊 Para comenzar, ¿me podrías indicar tu nombre?`,
      );
      return;
    }

    // GPT aún no detectó intención → re-enviar botones (pregunta binaria, no hay alternativa)
    await this.sendButtons(ideEmpr, waId, MSG_ES_CLIENTE_BODY, BTN_ES_CLIENTE);
  }

  private async handleIdentificacion(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, config: any,
  ): Promise<void> {
    const datos = sesion.datos_sesion as DatosSesion;
    const identificacion = texto.trim().replace(/[^0-9]/g, '');

    if (identificacion.length < 10) {
      await this.sendText(ideEmpr, waId,
        `Hmm, esa identificación no parece correcta 🤔\nPor favor ingresa tu *cédula* (10 dígitos) o *RUC* (13 dígitos).`,
      );
      return;
    }

    const cliente = await this.botTools.buscarClientePorIdentificacion(identificacion, ideEmpr);

    if (cliente) {
      const nuevosDatos: DatosSesion = {
        ...datos,
        productos: datos.productos ?? [],
        cliente: {
          ide_geper: cliente.ide_geper,
          identificacion: cliente.identificacion,
          nombres: cliente.nombres,
          correo: cliente.correo || 'info@diquimec.com.ec',
          telefono: cliente.telefono || waId,
          direccion_registrada: cliente.direccion || '',
          ide_getid: cliente.ide_getid,
          ide_vgven: cliente.ide_vgven,
          es_cliente_registrado: true,
        },
      };
      if (nuevosDatos.productos?.length > 0) {
        // Tenía productos acumulados antes de identificarse → ir directo a confirmación
        await this.botSession.update(sesion.ide_whbse, BotState.CONFIRMACION_PRODUCTOS, nuevosDatos);
        await this.sendButtons(ideEmpr, waId,
          `¡Qué gusto verte de nuevo, *${cliente.nombres}*! 😊\n\n${this.buildResumenProductos(nuevosDatos.productos)}`,
          BTN_CONFIRMACION_COTIZACION,
        );
      } else if (nuevosDatos.producto_texto_pendiente) {
        // El cliente ya había dicho qué producto quería ANTES de identificarse
        // (ej. "¿cuál es el precio del sorbitol?") — se procesa de inmediato en vez
        // de pedirle que lo escriba de nuevo.
        const textoProducto = nuevosDatos.producto_texto_pendiente;
        const datosSinPendiente: DatosSesion = { ...nuevosDatos, producto_texto_pendiente: undefined };
        await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS, datosSinPendiente);
        await this.sendText(ideEmpr, waId, `¡Qué gusto verte de nuevo, *${cliente.nombres}*! 😊`);
        await this.procesarTextoProductos(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, datosSinPendiente, textoProducto, config?.nombre_empresa || 'DIQUIMEC', config);
      } else {
        await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS, nuevosDatos);
        await this.sendText(ideEmpr, waId,
          `¡Qué gusto verte de nuevo, *${cliente.nombres}*! 😊\n\n${MSG_INICIO_COTIZACION}`,
        );
      }
      return;
    }

    await this.sendText(ideEmpr, waId,
      `Hmm, no encontré tu información con esa identificación 🤔\n\n¿Podrías verificar el número? Si es primera vez que compras, responde *No* para registrarte.`,
    );
    const nuevosDatos: DatosSesion = {
      ...datos,
      cliente: { nombres: '', correo: '', es_cliente_registrado: false, pendiente_campo: 'nombres' },
    };
    await this.botSession.update(sesion.ide_whbse, BotState.DATOS_NUEVO_CLIENTE, nuevosDatos);
    await this.sendText(ideEmpr, waId, `¿Cuál es tu *nombre completo*? 😊`);
  }

  private async handleDatosNuevoCliente(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, config: any,
  ): Promise<void> {
    const datos = sesion.datos_sesion as DatosSesion;
    const cliente: ClienteSesion = datos.cliente ?? { nombres: '', correo: '', es_cliente_registrado: false };

    if (cliente.pendiente_campo === 'nombres') {
      // GPT extrae el nombre del texto libre (no heurística de longitud) — así "me llamo
      // Diego Jácome" guarda "Diego Jácome", no la frase completa. esIdBotonConocido queda
      // como red de seguridad extra ante un ID de botón viejo (ver comentario junto a
      // IDS_BOTONES_CONOCIDOS).
      const { nombre } = await this.botGpt.extraerNombreYCiudad(texto, true, false);
      if (!nombre || esIdBotonConocido(nombre)) {
        await this.sendText(ideEmpr, waId, `Por favor, ayúdame con tu nombre para continuar 😊`);
        return;
      }
      const nombres = nombre;
      // Ya no se pide correo — se usa el correo general de la empresa por defecto
      // (mismo criterio que un cliente existente sin correo registrado).
      const nuevosDatos: DatosSesion = {
        ...datos,
        productos: datos.productos ?? [],
        cliente: { ...cliente, nombres, correo: 'info@diquimec.com.ec', pendiente_campo: undefined },
      };
      if (nuevosDatos.productos?.length > 0) {
        // Tenía productos acumulados antes de registrarse → ir directo a confirmación
        await this.botSession.update(sesion.ide_whbse, BotState.CONFIRMACION_PRODUCTOS, nuevosDatos);
        await this.sendButtons(ideEmpr, waId,
          `¡Gracias, *${nombres}*! 😊\n\n${this.buildResumenProductos(nuevosDatos.productos)}`,
          BTN_CONFIRMACION_COTIZACION,
        );
      } else if (nuevosDatos.producto_texto_pendiente) {
        // El cliente ya había dicho qué producto quería ANTES de registrarse — se
        // procesa de inmediato con el flujo liviano (pide solo la cantidad si falta y
        // genera la proforma directo, ver manejarConsultaProductoClasica) en vez de
        // pedirle que lo escriba de nuevo o arrastrarlo por el flujo de lista/FIN.
        const textoProducto = nuevosDatos.producto_texto_pendiente;
        const datosSinPendiente: DatosSesion = { ...nuevosDatos, producto_texto_pendiente: undefined };
        await this.sendText(ideEmpr, waId, `¡Gracias, *${nombres}*! 😊`);
        const { items } = await this.botGpt.analizarLoteProductos(textoProducto, []);

        // Igual que en manejarConsultaProductoClasica: si GPT no logró extraer ningún
        // producto puntual del texto pendiente, no se debe usar ese texto vago como si
        // fuera el nombre de un producto — se le pregunta directo.
        if (!items.length) {
          await this.sendText(ideEmpr, waId, `Cuéntame qué productos necesitas cotizar y en qué cantidades, y con gusto te preparo la cotización 😊`);
          await this.botSession.update(sesion.ide_whbse, BotState.ATENCION_LIBRE, datosSinPendiente);
          return;
        }

        let pedirUso = false;
        {
          const estadoProducto = await this.evaluarExistenciaProductos(items.map((i) => i.producto), ideEmpr);
          if (estadoProducto.estado === 'NO_VENDEMOS') {
            const mensaje = estadoProducto.observacion?.trim() || 'Por el momento no comercializamos ese producto 😔';
            await this.sendText(ideEmpr, waId, `${mensaje} ¿Te ayudo con algo más?`);
            await this.botSession.update(sesion.ide_whbse, BotState.ATENCION_LIBRE, datosSinPendiente);
            return;
          }
          if (estadoProducto.estado === 'SIN_MATCH') pedirUso = true;
        }

        await this.iniciarRecopilacionCotizacionRapida(
          waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, datosSinPendiente, items,
          config?.nombre_bot || 'QuimIA', config?.nombre_empresa || 'DIQUIMEC', pedirUso,
        );
      } else {
        // Todavía no mencionó ningún producto — se queda en ATENCION_LIBRE para que el
        // siguiente mensaje se clasifique normalmente (si nombra un producto, entra por
        // el mismo flujo liviano de manejarConsultaProductoClasica).
        await this.botSession.update(sesion.ide_whbse, BotState.ATENCION_LIBRE, nuevosDatos);
        await this.sendText(ideEmpr, waId, `¡Gracias, *${nombres}*! 😊 Cuéntame qué productos necesitas cotizar y en qué cantidades, y con gusto te preparo la cotización.`);
      }
      return;
    }

    // No debería ocurrir (todo setter de DATOS_NUEVO_CLIENTE fija pendiente_campo:
    // 'nombres'), pero si pasara, el cliente se quedaría sin respuesta en vez de que el
    // bot se caiga con un error visible — se re-pregunta el nombre en vez de quedar mudo.
    this.logger.warn(`[Bot] handleDatosNuevoCliente: estado sin pendiente_campo='nombres' (chat=${ideWhcha})`);
    await this.sendText(ideEmpr, waId, `¿Me podrías indicar tu *nombre completo*, por favor? 😊`);
  }

  private async handleSeleccionProductos(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, nombreEmpresa: string, config: any,
  ): Promise<void> {
    const datos = sesion.datos_sesion as DatosSesion;
    await this.procesarTextoProductos(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, datos, texto, nombreEmpresa, config);
  }

  /**
   * Lógica central de captura de productos en lote — extraída de handleSeleccionProductos
   * para poder invocarla de inmediato con el mensaje actual desde otros estados
   * (ATENCION_LIBRE, ESPERANDO_CONFIRMACION) cuando GPT ya detectó que el cliente pidió
   * un producto en ese mismo mensaje (ej. "quiero 5kg cera de palma"). Antes, esos estados
   * solo cambiaban a SELECCION_PRODUCTOS y mandaban el mensaje genérico "dime los
   * productos...", descartando el contenido que el cliente ya había escrito.
   */
  private async procesarTextoProductos(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, datos: DatosSesion, texto: string, nombreEmpresa: string, config: any,
  ): Promise<void> {
    // Botones de la Fase de acuse ("Recibido 📝..."): "Agregar más" no aporta texto de
    // producto, solo confirma que el cliente va a seguir escribiendo — no se toca
    // texto_acumulado ni se llama a GPT. "Finalizar" equivale a que el cliente hubiera
    // escrito la palabra FIN — se reusa el mismo detector semántico de cierre de
    // analizarLoteProductos en vez de duplicar esa lógica acá.
    const idBoton = texto.trim().toUpperCase();
    if (idBoton === 'LOTE_MAS') {
      await this.sendText(ideEmpr, waId, `Dime el producto que quieras agregar 😊`);
      return;
    }
    if (idBoton === 'LOTE_FIN') {
      texto = 'FIN';
    }
    // ID de un botón viejo tocado por error (de un mensaje anterior, ver
    // IDS_BOTONES_CONOCIDOS) — no es texto de producto, no se llama a GPT.
    if (idBoton !== 'LOTE_FIN' && esIdBotonConocido(idBoton)) {
      await this.sendText(ideEmpr, waId, `Dime el producto que quieras agregar 😊`);
      return;
    }

    // Extrae primero el/los producto(s) del mensaje — se prioriza sobre la detección de
    // consulta informativa para que líneas como "cera de coco 10kg, cera en gel 20kg" no
    // se malinterpreten como pregunta de catálogo/ubicación/horario/envío.
    const textoAcumulado = [datos.texto_acumulado, texto.trim()].filter(Boolean).join('\n');
    const nombresYa = (datos.productos ?? []).map((p) => p.nombre);
    const { completo, items } = await this.botGpt.analizarLoteProductos(textoAcumulado, nombresYa);
    this.logger.debug(`[Bot] procesarTextoProductos chat=${ideWhcha} textoAcumulado="${textoAcumulado}" → completo=${completo} items=${JSON.stringify(items)}`);

    // ── Solo si NO se detectó ningún producto en el mensaje: puede ser una consulta
    //    informativa mid-cotización (ubicación, horario, envíos, catálogo) ──
    if (!items.length) {
      const tipoInfoPre = await this.botGpt.clasificarConsulta(texto);
      if (['UBICACION', 'HORARIO', 'ENVIO', 'CATALOGO'].includes(tipoInfoPre)) {
        await this.responderInfo(ideEmpr, waId, tipoInfoPre as any, nombreEmpresa, config);
        await this.sendText(ideEmpr, waId,
          `Espero haber resuelto tu consulta 😊\n\n¿Continuamos? Dime el producto o escribe *FIN* para revisar tu cotización.`,
        );
        return;
      }
    }

    if (!completo) {
      const nuevosDatos: DatosSesion = { ...datos, texto_acumulado: textoAcumulado };
      await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS, nuevosDatos);
      await this.sendButtons(ideEmpr, waId, MSG_ACUSE_LOTE, BTN_ACUSE_LOTE);
      return;
    }

    if (!items.length && !datos.productos?.length) {
      const nuevosDatos: DatosSesion = { ...datos, texto_acumulado: undefined };
      await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS, nuevosDatos);
      await this.sendText(ideEmpr, waId,
        `Aún no has agregado ningún producto 😊\nDime el nombre del producto que necesitas cotizar, o escribe *SALIR* para hablar con un asesor.`,
      );
      return;
    }

    const datosConCola: DatosSesion = {
      ...datos,
      texto_acumulado: undefined,
      cola_productos: [...(datos.cola_productos ?? []), ...items],
    };
    await this.resolverColaProductos(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, datosConCola, nombreEmpresa, config);
  }

  /**
   * Resuelve la cola de productos extraídos en lote contra el catálogo, en 2 fases:
   *
   * Fase 1 — resolución silenciosa: recorre TODA la cola sin preguntar nada.
   *   - 1 match por búsqueda EXACTA + cantidad ya conocida → se agrega directo.
   *   - 1 match por búsqueda EXACTA + cantidad desconocida → se guarda en
   *     `pendientes_cantidad` (se pregunta después, junto con los demás).
   *   - 1 match SOLO por fallback difuso (reducción progresiva / por palabras) → no es
   *     confiable (puede ser falso positivo) → bloquea de inmediato pidiendo que el
   *     cliente confirme sí/no que es el producto correcto.
   *   - 0 matches (sea o no categoría genérica sabor/color/fragancia/aceite, sea o no
   *     un simple error de tipeo) → se guarda en `pendientes_uso` asociado al ítem
   *     genérico (ide_inarti=2102): nada se pierde en silencio, todo termina en la
   *     proforma para que un asesor lo revise.
   *   - Varios matches → SÍ bloquea de inmediato (necesita que el cliente vea la
   *     lista numerada para elegir; no tiene sentido diferir esto).
   *
   * Fase 2 — preguntas agrupadas: si quedaron `pendientes_uso` y/o `pendientes_cantidad`,
   * se pregunta TODO en un solo mensaje por tipo de pregunta (uso primero, cantidad
   * después) en vez de uno a la vez — un asesor ágil no hace 5 preguntas cuando puede
   * hacer 2. Solo cuando no queda nada pendiente se cierra la captura de productos.
   */
  private async resolverColaProductos(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, datos: DatosSesion, nombreEmpresa: string, config: any,
  ): Promise<void> {
    const cola = [...(datos.cola_productos ?? [])];
    const productosNuevos: ProductoSesion[] = [...(datos.productos ?? [])];
    const pendientesUso: PendienteUso[] = [...(datos.pendientes_uso ?? [])];
    const pendientesCantidad: PendienteCantidad[] = [...(datos.pendientes_cantidad ?? [])];

    if (cola.length > LIMITE_COINCIDENCIAS) {
      const totalItems = cola.length;
      const generico = await this.botTools.obtenerProductoPorId(PRODUCTO_GENERICO_IDE_INARTI, ideEmpr);
      const baseGenerico = {
        ide_inarti: generico?.ide_inarti ?? PRODUCTO_GENERICO_IDE_INARTI,
        nombre: '',
        siglas_unidad: generico?.siglas_unidad ?? 'UND',
        nombre_unidad: generico?.nombre_unidad ?? 'Unidad',
        en_catalogo: generico?.en_catalogo ?? false,
      };

      for (const item of cola) {
        const nombreItem = item.producto.trim();
        if (!nombreItem) continue;

        if (item.cantidad !== null && item.cantidad !== undefined) {
          productosNuevos.push({
            ide_inarti: baseGenerico.ide_inarti,
            nombre: nombreItem,
            cantidad: item.cantidad,
            unidad: baseGenerico.nombre_unidad,
            siglas_unidad: baseGenerico.siglas_unidad,
            en_catalogo: baseGenerico.en_catalogo,
          });
        } else {
          pendientesCantidad.push({ ...baseGenerico, nombre: nombreItem });
        }
      }

      cola.length = 0;
      this.logger.log(`[Bot] Fast-path: ${totalItems} productos > ${LIMITE_COINCIDENCIAS}, se omite matching`);
    }

    while (cola.length > 0) {
      const item = cola.shift()!;
      const nombreItem = item.producto.trim();
      if (!nombreItem) continue;

      const nombreLimpio = nombreItem
        .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|kilo[s]?|lb[s]?|gr[s]?|g\b|litro[s]?|lt[s]?|ml|und[s]?|unidad[s]?|galon[s]?|gal[s]?|lb)\b/gi, '')
        .replace(/\b\d+\b/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim() || nombreItem;

      const esGenerico = REGEX_PRODUCTO_GENERICO.test(nombreItem);
      let resultados = await this.botTools.buscarProductos(nombreLimpio, ideEmpr);
      let matchExacto = resultados.length > 0;

      // Los fallbacks difusos (reducción progresiva y por palabras) solo se intentan
      // cuando NO es una categoría genérica — para sabor/color/aceite/etc. queremos
      // una búsqueda estricta: si no matchea exacto, se trata como no encontrado.
      // Un match encontrado solo por estos fallbacks es de baja confianza (puede ser
      // falso positivo por substring, ej. "Jabón de" → "MOLDE ... JABON DE MASAJES")
      // y no se agrega directo — ver bloque `!matchExacto` más abajo.
      if (!resultados.length && !esGenerico) {
        const palabras = nombreLimpio.split(/\s+/).filter(Boolean);
        for (let n = palabras.length - 1; n >= 2; n--) {
          const subTexto = palabras.slice(0, n).join(' ');
          resultados = await this.botTools.buscarProductos(subTexto, ideEmpr);
          if (resultados.length > 0) {
            this.logger.log(`[Bot] Búsqueda reducida → "${subTexto}" → ${resultados.length}`);
            break;
          }
        }
        if (!resultados.length) {
          resultados = await this.botTools.buscarProductosPorPalabras(nombreLimpio, ideEmpr);
        }
      }

      if (!resultados.length) {
        // Nada matcheó (ni exacto ni fallbacks difusos). En ambos casos el ítem se
        // asocia al artículo genérico (ide_inarti=2102) con el texto literal del
        // cliente, para que termine en la proforma y el asesor lo resuelva — nada se
        // pierde. La diferencia está en si se pregunta el "uso":
        // - Categoría genérica (fragancia/sabor/color/aceite/esencia): SÍ — el uso
        //   determina qué producto recomendar ("fragancia de vainilla ¿para velas o
        //   repostería?").
        // - Cualquier otro producto ("Bentonita blanca", "Bicarbonato de sodio"...):
        //   NO — el nombre ya es autodescriptivo y la pregunta era fricción pura
        //   (caso real: 5 químicos sin match generaron 5 preguntas de uso confusas).
        //   Va directo con su cantidad, o a la pregunta agrupada de cantidad.
        const generico = await this.botTools.obtenerProductoPorId(PRODUCTO_GENERICO_IDE_INARTI, ideEmpr);
        const baseGenerico = {
          ide_inarti: generico?.ide_inarti ?? PRODUCTO_GENERICO_IDE_INARTI,
          nombre: nombreItem,
          siglas_unidad: generico?.siglas_unidad ?? 'UND',
          nombre_unidad: generico?.nombre_unidad ?? 'Unidad',
          en_catalogo: generico?.en_catalogo ?? false,
        };
        if (esGenerico) {
          pendientesUso.push({ ...baseGenerico, cantidad_conocida: item.cantidad });
        } else if (item.cantidad !== null && item.cantidad !== undefined) {
          productosNuevos.push({
            ide_inarti: baseGenerico.ide_inarti,
            nombre: baseGenerico.nombre,
            cantidad: item.cantidad,
            unidad: baseGenerico.nombre_unidad,
            siglas_unidad: baseGenerico.siglas_unidad,
            en_catalogo: baseGenerico.en_catalogo,
          });
        } else {
          pendientesCantidad.push(baseGenerico);
        }
        continue;
      }

      if (resultados.length === 1) {
        const prod = resultados[0];

        if (!matchExacto) {
          // Match de baja confianza (solo por fallback difuso) — se pausa a confirmar
          // con el cliente antes de darlo por bueno, en vez de asumirlo y preguntar
          // directo la cantidad (lo que generaba un producto equivocado en el pedido).
          const nuevosDatos: DatosSesion = {
            ...datos,
            productos: productosNuevos,
            cola_productos: cola,
            pendientes_uso: pendientesUso,
            pendientes_cantidad: pendientesCantidad,
            pendiente_confirmacion: {
              ide_inarti: prod.ide_inarti,
              nombre: this.displayNombreProducto(prod),
              siglas_unidad: prod.siglas_unidad,
              nombre_unidad: prod.nombre_unidad,
              en_catalogo: prod.en_catalogo,
              texto_original: nombreItem,
              cantidad_conocida: item.cantidad,
            },
          };
          await this.botSession.update(sesion.ide_whbse, BotState.CONFIRMANDO_PRODUCTO_LOTE, nuevosDatos);
          await this.sendButtons(ideEmpr, waId,
            `Para *"${nombreItem}"* encontré: *${this.displayNombreProducto(prod)}*. ¿Es este el producto? 🤔`,
            [{ id: 'PROD_SI', title: '✅ Sí, es este' }, { id: 'PROD_NO', title: '❌ No es este' }],
          );
          return;
        }

        if (item.cantidad !== null && item.cantidad !== undefined) {
          productosNuevos.push({
            ide_inarti: prod.ide_inarti,
            nombre: this.displayNombreProducto(prod),
            cantidad: item.cantidad,
            unidad: prod.nombre_unidad,
            siglas_unidad: prod.siglas_unidad,
            en_catalogo: prod.en_catalogo,
          });
          continue;
        }
        pendientesCantidad.push({
          ide_inarti: prod.ide_inarti,
          nombre: this.displayNombreProducto(prod),
          siglas_unidad: prod.siglas_unidad,
          nombre_unidad: prod.nombre_unidad,
          en_catalogo: prod.en_catalogo,
        });
        continue;
      }

      // Varios resultados → desambiguar con lista numerada (esto sí bloquea de inmediato,
      // no se difiere: el cliente necesita ver la lista para poder elegir).
      const opciones: OpcionProducto[] = resultados.map((p, i) => ({
        numero: i + 1,
        ide_inarti: p.ide_inarti,
        nombre: p.nombre,
        otro_nombre: p.otro_nombre,
        matched_by_otro_nombre: p.matched_by_otro_nombre,
        siglas_unidad: p.siglas_unidad,
        nombre_unidad: p.nombre_unidad,
        en_catalogo: p.en_catalogo,
      }));
      const nuevosDatos: DatosSesion = {
        ...datos,
        productos: productosNuevos,
        cola_productos: cola,
        opciones_producto: opciones,
        item_cantidad_conocida: item.cantidad,
        pendientes_uso: pendientesUso,
        pendientes_cantidad: pendientesCantidad,
      };
      await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_MULTIPLE, nuevosDatos);
      const listaTexto = opciones.map(
        (o) => `*${o.numero}.* ${this.displayNombreProducto(o)}`,
      ).join('\n');
      await this.sendText(ideEmpr, waId,
        `Para *"${nombreItem}"* encontré ${opciones.length} productos que coinciden 🔍\n\n${listaTexto}\n\n_Responde solo con el número (1 al ${opciones.length})._`,
      );
      return;
    }

    // Fase 2a — uso de productos genéricos, todos juntos en un solo mensaje.
    if (pendientesUso.length > 0) {
      const nuevosDatos: DatosSesion = {
        ...datos,
        productos: productosNuevos,
        cola_productos: undefined,
        pendientes_uso: pendientesUso,
        pendientes_cantidad: pendientesCantidad,
      };
      await this.botSession.update(sesion.ide_whbse, BotState.ESPERANDO_USO_LOTE, nuevosDatos);
      if (pendientesUso.length === 1) {
        await this.sendText(ideEmpr, waId,
          `Para cotizar *${pendientesUso[0].nombre}*, cuéntame ¿para qué uso lo necesitas? 😊`,
        );
      } else {
        const lista = pendientesUso.map((p, i) => `${i + 1}. ${p.nombre}`).join('\n');
        await this.sendText(ideEmpr, waId,
          `Para recomendarte la mejor opción, cuéntame brevemente para qué uso necesitas cada uno 😊\n\n${lista}\n\n` +
          `_Ejemplo: "1. repostería, 2. ambiental"_`,
        );
      }
      return;
    }

    // Fase 2b — cantidad de productos ya identificados, todos juntos en un solo mensaje.
    if (pendientesCantidad.length > 0) {
      const nuevosDatos: DatosSesion = {
        ...datos,
        productos: productosNuevos,
        cola_productos: undefined,
        pendientes_cantidad: pendientesCantidad,
      };
      await this.botSession.update(sesion.ide_whbse, BotState.ESPERANDO_CANTIDAD_LOTE, nuevosDatos);
      if (pendientesCantidad.length === 1) {
        const p = pendientesCantidad[0];
        await this.sendText(ideEmpr, waId,
          `¿Qué cantidad de *${p.nombre}* necesitas? _(Ejemplo: 5 ${p.nombre_unidad}, o "cantidad mínima")_`,
        );
      } else {
        const lista = pendientesCantidad.map((p, i) => `${i + 1}. ${p.nombre}`).join('\n');
        await this.sendText(ideEmpr, waId,
          `¿Qué cantidad necesitas de cada uno? 😊\n\n${lista}\n\n_Ejemplo: "1. 10kg, 2. cantidad mínima"_`,
        );
      }
      return;
    }

    // Sin nada pendiente → cerrar la captura de productos
    const nuevosDatos: DatosSesion = {
      ...datos,
      productos: productosNuevos,
      cola_productos: undefined,
      item_cantidad_conocida: undefined,
      pendientes_uso: undefined,
      pendientes_cantidad: undefined,
    };
    await this.finalizarColeccionProductos(ideEmpr, waId, sesion, nuevosDatos);
  }

  /**
   * Respuesta a la confirmación sí/no de un match de baja confianza (encontrado solo
   * por fallback difuso). Sí → se trata como match normal (agrega directo o pasa a
   * pendientes_cantidad). No → se asocia al ítem genérico (ide_inarti=2102) con el
   * texto literal del cliente, igual que un producto no encontrado — no se descarta.
   */
  private async handleConfirmandoProductoLote(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, nombreEmpresa: string, config: any,
  ): Promise<void> {
    const datos = sesion.datos_sesion as DatosSesion;
    const pendiente = datos.pendiente_confirmacion;

    if (!pendiente) {
      await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS, { ...datos, pendiente_confirmacion: undefined });
      await this.sendText(ideEmpr, waId, MSG_INICIO_COTIZACION);
      return;
    }

    const t = texto.trim().toUpperCase();
    let esSi = t === 'PROD_SI';
    let esNo = t === 'PROD_NO';
    if (!esSi && !esNo) {
      const intencion = await this.botGpt.detectarIntencion(texto);
      esSi = intencion === 'CONFIRMAR';
      esNo = intencion === 'CANCELAR';
    }

    if (!esSi && !esNo) {
      await this.sendButtons(ideEmpr, waId,
        `Disculpa, ¿*${pendiente.nombre}* es el producto que buscas? 🤔`,
        [{ id: 'PROD_SI', title: '✅ Sí, es este' }, { id: 'PROD_NO', title: '❌ No es este' }],
      );
      return;
    }

    if (esSi) {
      const nuevosDatos: DatosSesion = { ...datos, pendiente_confirmacion: undefined };
      if (pendiente.cantidad_conocida !== null && pendiente.cantidad_conocida !== undefined) {
        nuevosDatos.productos = [...(datos.productos ?? []), {
          ide_inarti: pendiente.ide_inarti,
          nombre: pendiente.nombre,
          cantidad: pendiente.cantidad_conocida,
          unidad: pendiente.nombre_unidad,
          siglas_unidad: pendiente.siglas_unidad,
          en_catalogo: pendiente.en_catalogo,
        }];
      } else {
        nuevosDatos.pendientes_cantidad = [...(datos.pendientes_cantidad ?? []), {
          ide_inarti: pendiente.ide_inarti,
          nombre: pendiente.nombre,
          siglas_unidad: pendiente.siglas_unidad,
          nombre_unidad: pendiente.nombre_unidad,
          en_catalogo: pendiente.en_catalogo,
        }];
      }
      await this.resolverColaProductos(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, nuevosDatos, nombreEmpresa, config);
      return;
    }

    // No es el producto → se asocia al ítem genérico con el texto literal del cliente,
    // para no perder el pedido. El "uso" solo se pregunta si es una categoría genérica
    // (fragancia/sabor/color/aceite/esencia) — mismo criterio que resolverColaProductos;
    // para cualquier otro producto el nombre ya es autodescriptivo y va directo con su
    // cantidad (o a la pregunta agrupada de cantidad).
    const generico = await this.botTools.obtenerProductoPorId(PRODUCTO_GENERICO_IDE_INARTI, ideEmpr);
    const baseGenerico = {
      ide_inarti: generico?.ide_inarti ?? PRODUCTO_GENERICO_IDE_INARTI,
      nombre: pendiente.texto_original,
      siglas_unidad: generico?.siglas_unidad ?? 'UND',
      nombre_unidad: generico?.nombre_unidad ?? 'Unidad',
      en_catalogo: generico?.en_catalogo ?? false,
    };
    const nuevosDatos: DatosSesion = { ...datos, pendiente_confirmacion: undefined };
    if (REGEX_PRODUCTO_GENERICO.test(pendiente.texto_original)) {
      nuevosDatos.pendientes_uso = [...(datos.pendientes_uso ?? []), {
        ...baseGenerico, cantidad_conocida: pendiente.cantidad_conocida,
      }];
    } else if (pendiente.cantidad_conocida !== null && pendiente.cantidad_conocida !== undefined) {
      nuevosDatos.productos = [...(datos.productos ?? []), {
        ide_inarti: baseGenerico.ide_inarti,
        nombre: baseGenerico.nombre,
        cantidad: pendiente.cantidad_conocida,
        unidad: baseGenerico.nombre_unidad,
        siglas_unidad: baseGenerico.siglas_unidad,
        en_catalogo: baseGenerico.en_catalogo,
      }];
    } else {
      nuevosDatos.pendientes_cantidad = [...(datos.pendientes_cantidad ?? []), baseGenerico];
    }
    await this.resolverColaProductos(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, nuevosDatos, nombreEmpresa, config);
  }

  /** Cierra la etapa de captura de productos: pide datos del cliente si faltan, o pasa a confirmación. */
  private async finalizarColeccionProductos(
    ideEmpr: number, waId: string, sesion: any, datos: DatosSesion,
  ): Promise<void> {
    if (!datos.cliente?.nombres) {
      // No preguntamos "¿ya compraste con nosotros?" — se pide el nombre directo (ver
      // responderConsultaInicial, mismo criterio: la mayoría de los chats nuevos nunca
      // compraron antes, así que esa pregunta era casi siempre un mensaje de más).
      await this.botSession.update(sesion.ide_whbse, BotState.DATOS_NUEVO_CLIENTE, {
        ...datos,
        cliente: { nombres: '', correo: '', es_cliente_registrado: false, pendiente_campo: 'nombres' },
      });
      await this.sendText(ideEmpr, waId,
        `${this.buildResumenProductos(datos.productos)}\n\nPara preparar tu cotización, ¿me podrías indicar tu nombre? 😊`,
      );
      return;
    }
    await this.botSession.update(sesion.ide_whbse, BotState.CONFIRMACION_PRODUCTOS, datos);
    await this.sendButtons(ideEmpr, waId, this.buildResumenProductos(datos.productos), BTN_CONFIRMACION_COTIZACION);
  }

  private async handleSeleccionMultiple(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, nombreEmpresa: string, config: any,
  ): Promise<void> {
    const datos = sesion.datos_sesion as DatosSesion;

    // El número de la lista primero — es la respuesta esperada y no necesita GPT
    // (antes cada "4" pagaba una llamada a clasificarConsulta innecesaria).
    const num = parseInt(texto.trim(), 10);
    const numValido = !isNaN(num) && num >= 1 && num <= (datos.opciones_producto?.length ?? 0);

    if (!numValido) {
      // Consulta informativa mid-cotización
      const tipoInfo = await this.botGpt.clasificarConsulta(texto);
      if (['UBICACION', 'HORARIO', 'ENVIO', 'CATALOGO'].includes(tipoInfo)) {
        await this.responderInfo(ideEmpr, waId, tipoInfo as any, nombreEmpresa, config);
        await this.sendText(ideEmpr, waId, `¿Continuamos? Responde con el *número* del producto que necesitas.`);
        return;
      }

      const listaOpciones = (datos.opciones_producto ?? [])
        .map((o, i) => `${i + 1}. ${o.nombre}`).join('\n');
      await this.responderFallback(
        ideEmpr, waId, texto,
        `El cliente está seleccionando entre estas opciones de producto:\n${listaOpciones}\n` +
        `Debe responder solo con el número (1 al ${datos.opciones_producto?.length ?? '?'}) de la opción que desea.`,
        config, config?.nombre_bot || 'Asistente', nombreEmpresa,
      );
      return;
    }

    const opcion = datos.opciones_producto[num - 1];
    const cantidadConocida = datos.item_cantidad_conocida;

    // Si GPT ya había detectado la cantidad de este ítem, no se vuelve a preguntar.
    if (cantidadConocida !== null && cantidadConocida !== undefined) {
      const nuevosDatos: DatosSesion = {
        ...datos,
        opciones_producto: undefined,
        item_cantidad_conocida: undefined,
        productos: [...(datos.productos ?? []), {
          ide_inarti: opcion.ide_inarti,
          nombre: this.displayNombreProducto(opcion),
          cantidad: cantidadConocida,
          unidad: opcion.nombre_unidad,
          siglas_unidad: opcion.siglas_unidad,
          en_catalogo: opcion.en_catalogo,
        }],
      };
      await this.resolverColaProductos(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, nuevosDatos, nombreEmpresa, config);
      return;
    }

    // Cantidad desconocida: se agrega a las preguntas agrupadas (pendientes_cantidad)
    // en vez de preguntar ya mismo — así, si quedan más ítems en la cola original o
    // más productos por desambiguar, todas las preguntas de cantidad se juntan en un
    // solo mensaje al final en vez de una por una.
    const nuevosDatos: DatosSesion = {
      ...datos,
      opciones_producto: undefined,
      item_cantidad_conocida: undefined,
      pendientes_cantidad: [...(datos.pendientes_cantidad ?? []), {
        ide_inarti: opcion.ide_inarti,
        nombre: this.displayNombreProducto(opcion),
        siglas_unidad: opcion.siglas_unidad,
        nombre_unidad: opcion.nombre_unidad,
        en_catalogo: opcion.en_catalogo,
      }],
    };
    await this.resolverColaProductos(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, nuevosDatos, nombreEmpresa, config);
  }

  /**
   * Respuesta a la pregunta agrupada de "uso" (uno o varios productos genéricos a la
   * vez). Usa GPT para mapear la respuesta libre del cliente a cada producto en orden;
   * los que ya tenían cantidad conocida se agregan directo, el resto pasa a
   * `pendientes_cantidad` para preguntarse junto con las demás cantidades pendientes.
   */
  private async handleEsperandoUsoLote(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, nombreEmpresa: string, config: any,
  ): Promise<void> {
    const datos = sesion.datos_sesion as DatosSesion;
    const pendientes = datos.pendientes_uso ?? [];

    if (!pendientes.length) {
      await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS, { ...datos, pendientes_uso: undefined });
      await this.sendText(ideEmpr, waId, MSG_INICIO_COTIZACION);
      return;
    }

    // Extraer los usos PRIMERO; la consulta informativa solo se evalúa si no se logró
    // mapear ninguno — clasificar antes malinterpreta respuestas con formato de lista
    // ("1. repostería 2. ambiental") como CATALOGO (misma familia del bug ya corregido
    // en procesarTextoProductos).
    const nombres = pendientes.map((p) => p.nombre);
    const usos = await this.botGpt.extraerUsosPorProducto(nombres, texto);

    if (usos.every((u) => !u)) {
      const tipoInfo = await this.botGpt.clasificarConsulta(texto);
      if (['UBICACION', 'HORARIO', 'ENVIO', 'CATALOGO'].includes(tipoInfo)) {
        await this.responderInfo(ideEmpr, waId, tipoInfo as any, nombreEmpresa, config);
        const lista = pendientes.map((p, i) => `${i + 1}. ${p.nombre}`).join('\n');
        await this.sendText(ideEmpr, waId,
          pendientes.length === 1
            ? `¿Continuamos? Cuéntame para qué uso necesitas *${pendientes[0].nombre}*.`
            : `¿Continuamos? Cuéntame para qué uso necesitas cada uno:\n\n${lista}`,
        );
        return;
      }
    }

    const productosNuevos = [...(datos.productos ?? [])];
    const pendientesCantidad = [...(datos.pendientes_cantidad ?? [])];
    const siguenPendientes: typeof pendientes = [];

    pendientes.forEach((p, i) => {
      const uso = usos[i];
      if (!uso) { siguenPendientes.push(p); return; }
      if (p.cantidad_conocida !== null && p.cantidad_conocida !== undefined) {
        productosNuevos.push({
          ide_inarti: p.ide_inarti, nombre: p.nombre, cantidad: p.cantidad_conocida,
          unidad: p.nombre_unidad, siglas_unidad: p.siglas_unidad, en_catalogo: p.en_catalogo, uso_generico: uso,
        });
      } else {
        pendientesCantidad.push({
          ide_inarti: p.ide_inarti, nombre: p.nombre, siglas_unidad: p.siglas_unidad,
          nombre_unidad: p.nombre_unidad, en_catalogo: p.en_catalogo, uso_generico: uso,
        });
      }
    });

    if (siguenPendientes.length > 0) {
      const nuevosDatos: DatosSesion = {
        ...datos, productos: productosNuevos,
        pendientes_uso: siguenPendientes, pendientes_cantidad: pendientesCantidad,
      };
      await this.botSession.update(sesion.ide_whbse, BotState.ESPERANDO_USO_LOTE, nuevosDatos);
      const lista = siguenPendientes.map((p, i) => `${i + 1}. ${p.nombre}`).join('\n');
      await this.sendText(ideEmpr, waId, `No logré identificar el uso de estos, ¿me confirmas? 😊\n\n${lista}`);
      return;
    }

    const nuevosDatos: DatosSesion = {
      ...datos, productos: productosNuevos, pendientes_uso: undefined, pendientes_cantidad: pendientesCantidad,
    };
    await this.resolverColaProductos(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, nuevosDatos, nombreEmpresa, config);
  }

  /**
   * Respuesta a la pregunta agrupada de "cantidad" (uno o varios productos a la vez,
   * ya sea porque el catálogo los encontró sin cantidad conocida, o porque venían de
   * una desambiguación). Igual mecánica que handleEsperandoUsoLote pero con cantidades.
   */
  private async handleEsperandoCantidadLote(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, nombreEmpresa: string, config: any,
  ): Promise<void> {
    const datos = sesion.datos_sesion as DatosSesion;
    const pendientes = datos.pendientes_cantidad ?? [];

    if (!pendientes.length) {
      await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS, { ...datos, pendientes_cantidad: undefined });
      await this.sendText(ideEmpr, waId, MSG_INICIO_COTIZACION);
      return;
    }

    // Extraer las cantidades PRIMERO; la consulta informativa solo se evalúa si no se
    // logró mapear ninguna — clasificar antes malinterpreta respuestas con formato de
    // lista ("1. 10kg 2. mínimo") como CATALOGO (misma familia del bug ya corregido en
    // procesarTextoProductos).
    const cantidades = await this.botGpt.extraerCantidadesPorProducto(pendientes, texto);

    if (cantidades.every((c) => c.cantidad === null || c.cantidad === undefined)) {
      const tipoInfo = await this.botGpt.clasificarConsulta(texto);
      if (['UBICACION', 'HORARIO', 'ENVIO', 'CATALOGO'].includes(tipoInfo)) {
        await this.responderInfo(ideEmpr, waId, tipoInfo as any, nombreEmpresa, config);
        const lista = pendientes.map((p, i) => `${i + 1}. ${p.nombre}`).join('\n');
        await this.sendText(ideEmpr, waId,
          pendientes.length === 1
            ? `¿Continuamos? Indica la cantidad de *${pendientes[0].nombre}* que necesitas.`
            : `¿Continuamos? Indica la cantidad que necesitas de cada uno:\n\n${lista}`,
        );
        return;
      }
    }

    const productosNuevos = [...(datos.productos ?? [])];
    const siguenPendientes: typeof pendientes = [];

    pendientes.forEach((p, i) => {
      const cant = cantidades[i]?.cantidad;
      if (cant === null || cant === undefined) { siguenPendientes.push(p); return; }
      productosNuevos.push({
        ide_inarti: p.ide_inarti, nombre: p.nombre, cantidad: cant,
        cantidadTexto: cantidades[i]?.cantidadTexto ?? undefined,
        unidad: p.nombre_unidad, siglas_unidad: p.siglas_unidad, en_catalogo: p.en_catalogo, uso_generico: p.uso_generico,
      });
    });

    if (siguenPendientes.length > 0) {
      const nuevosDatos: DatosSesion = { ...datos, productos: productosNuevos, pendientes_cantidad: siguenPendientes };
      await this.botSession.update(sesion.ide_whbse, BotState.ESPERANDO_CANTIDAD_LOTE, nuevosDatos);
      const lista = siguenPendientes.map((p, i) => `${i + 1}. ${p.nombre}`).join('\n');
      await this.sendText(ideEmpr, waId, `No logré identificar la cantidad de estos, ¿me confirmas? 😊\n\n${lista}`);
      return;
    }

    const nuevosDatos: DatosSesion = { ...datos, productos: productosNuevos, pendientes_cantidad: undefined };
    await this.resolverColaProductos(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, nuevosDatos, nombreEmpresa, config);
  }

  private async handleConfirmacionProductos(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, nombreEmpresa: string, config: any,
  ): Promise<void> {
    const datos = sesion.datos_sesion as DatosSesion;
    const t = texto.trim().toUpperCase();

    // IDs de botón primero — son respuestas exactas de WhatsApp, no necesitan GPT
    // (antes cada clic pagaba una llamada a clasificarConsulta innecesaria, con riesgo
    // de clasificación errónea de por medio).
    let confirma = t === 'CONF_SI';
    let modifica = t === 'CONF_NO';

    if (!confirma && !modifica) {
      // Consulta informativa mid-cotización
      const tipoInfoConf = await this.botGpt.clasificarConsulta(texto);
      if (['UBICACION', 'HORARIO', 'ENVIO', 'CATALOGO'].includes(tipoInfoConf)) {
        await this.responderInfo(ideEmpr, waId, tipoInfoConf as any, nombreEmpresa, config);
        await this.sendButtons(ideEmpr, waId, `¿Confirmamos tu cotización?`, BTN_CONFIRMACION_COTIZACION);
        return;
      }

      const intencion = await this.botGpt.detectarIntencion(texto);
      confirma = intencion === 'CONFIRMAR';
      modifica = intencion === 'CANCELAR';
    }

    if (PALABRAS_ASESOR.test(texto)) {
      await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr);
      await this.botSession.cerrar(sesion.ide_whbse, BotState.CANCELADO);
      return;
    }

    if (modifica) {
      // NO vaciar la lista: antes esto reiniciaba la captura desde cero y el cliente
      // perdía todo lo ya ingresado (caso real: 9 productos con uso/cantidad resueltos,
      // el cliente quería ajustar 1 y abandonó frustrado). Ahora se pasa a un modo de
      // edición que conserva la lista y permite quitar/cambiar/agregar.
      await this.botSession.update(sesion.ide_whbse, BotState.MODIFICANDO_LISTA, datos);
      await this.sendButtons(ideEmpr, waId,
        `Claro, ajustemos tu lista 😊 ¿Qué deseas hacer?\n\n_También puedes escribirlo directo. Ejemplo: "quita el 2" o "cambia el 3 a 5kg"_`,
        BTN_MODIFICAR_LISTA);
      return;
    }

    if (confirma) {
      const provinciaMemoria = datos.envio?.provincia;
      const dirRegistrada = datos.cliente?.direccion_registrada;

      // Si tiene dirección O provincia guardada → confirmar todo en un solo mensaje
      if (dirRegistrada || provinciaMemoria) {
        const partes: string[] = [];
        if (dirRegistrada) partes.push(`📌 *Dirección:* ${dirRegistrada}`);
        if (provinciaMemoria) partes.push(`🗺️ *Provincia:* ${provinciaMemoria}`);
        const resumen = partes.join('\n');
        const nuevosDatos: DatosSesion = { ...datos, envio: { ...datos.envio, pendiente_campo: 'confirmar_envio_guardado' } };
        await this.botSession.update(sesion.ide_whbse, BotState.DATOS_ENVIO, nuevosDatos);
        await this.sendButtons(ideEmpr, waId,
          `Para el envío, tengo registrada la siguiente información:\n\n${resumen}\n\n¿La utilizamos para esta cotización?`,
          [
            { id: 'ENV_MISMO', title: '✅ Sí, son correctos' },
            { id: 'ENV_CAMBIAR', title: '📝 Cambiar dirección' },
          ],
        );
      } else {
        const nuevosDatos: DatosSesion = { ...datos, envio: { pendiente_campo: 'tipo_direccion' } };
        await this.botSession.update(sesion.ide_whbse, BotState.DATOS_ENVIO, nuevosDatos);
        await this.sendButtons(ideEmpr, waId,
          `Necesito la dirección de entrega. ¿Cómo prefieres indicármela?`,
          [
            { id: 'DIR_TEXTO', title: '📝 Escribir dirección' },
            { id: 'DIR_UBICACION', title: '📍 Mi ubicación' },
          ],
        );
      }
      return;
    }

    await this.sendButtons(ideEmpr, waId, this.buildResumenProductos(datos.productos), BTN_CONFIRMACION_COTIZACION);
  }

  /**
   * Modo de edición de la lista de productos (botón "✏️ Modificar lista") — conserva
   * todo lo ya ingresado. El cliente puede tocar un botón (quitar/cambiar cantidad/
   * agregar) o escribir directo lo que quiere ("quita el 2", "cambia el karité a 2kg",
   * "agrega 5kg cera de soya"); GPT interpreta y las operaciones se aplican sobre la
   * lista actual. Al terminar, se vuelve a mostrar el resumen para confirmar.
   */
  private async handleModificandoLista(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, nombreEmpresa: string, config: any,
  ): Promise<void> {
    const datos = sesion.datos_sesion as DatosSesion;
    const productos = datos.productos || [];
    const t = texto.trim().toUpperCase();

    if (t === 'MOD_QUITAR') {
      await this.sendText(ideEmpr, waId,
        `${this.buildListaProductos(productos)}\n\n¿Cuáles quito? 😊\n\n_Ejemplo: "el 2" o "quita el alcanfor"_`);
      return; // sigue en MODIFICANDO_LISTA, el próximo mensaje lo interpreta GPT
    }
    if (t === 'MOD_CANTIDAD') {
      await this.sendText(ideEmpr, waId,
        `${this.buildListaProductos(productos)}\n\nDime las nuevas cantidades 😊\n\n_Ejemplo: "1. 5kg, 3. 2kg"_`);
      return;
    }
    if (t === 'MOD_AGREGAR') {
      // Volver a la captura en lote SIN tocar los productos ya resueltos — el pipeline
      // existente agrega sobre datos.productos y al finalizar muestra el resumen completo.
      const nuevosDatos: DatosSesion = { ...datos, texto_acumulado: undefined, cola_productos: undefined };
      await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS, nuevosDatos);
      await this.sendText(ideEmpr, waId, `Dime el producto que quieras agregar 😊`);
      return;
    }

    // Texto libre → GPT interpreta las operaciones sobre la lista actual
    const ops = await this.botGpt.analizarModificacionLista(
      productos.map((p) => ({
        nombre: p.nombre, cantidad: p.cantidad,
        siglas_unidad: p.siglas_unidad, nombre_unidad: p.unidad,
      })),
      texto,
    );

    let nuevos = [...productos];
    let huboCambios = false;

    // Cambios de cantidad primero (los índices siguen siendo válidos), luego quitar.
    for (const c of ops.cambiar) {
      nuevos[c.indice - 1] = { ...nuevos[c.indice - 1], cantidad: c.cantidad };
      huboCambios = true;
    }
    if (ops.quitar.length > 0) {
      const aQuitar = new Set(ops.quitar);
      nuevos = nuevos.filter((_, i) => !aQuitar.has(i + 1));
      huboCambios = true;
    }

    if (ops.agregar) {
      // Guardar quitar/cambiar ya aplicados y delegar los productos nuevos al pipeline
      // de captura en lote (misma ruta que la escritura normal de productos).
      const nuevosDatos: DatosSesion = { ...datos, productos: nuevos, texto_acumulado: undefined, cola_productos: undefined };
      await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS, nuevosDatos);
      const sesionAct = { ...sesion, datos_sesion: nuevosDatos };
      await this.procesarTextoProductos(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesionAct, nuevosDatos, ops.agregar, nombreEmpresa, config);
      return;
    }

    if (!huboCambios) {
      // Solo cuando NO se reconoció ninguna operación se evalúa si era una consulta
      // informativa — el orden inverso (clasificar primero) clasifica mal líneas de
      // edición con cantidades ("1. 5kg, 3. 2kg") como CATALOGO, mismo bug ya corregido
      // en handleSeleccionProductos.
      const tipoInfo = await this.botGpt.clasificarConsulta(texto);
      if (['UBICACION', 'HORARIO', 'ENVIO', 'CATALOGO'].includes(tipoInfo)) {
        await this.responderInfo(ideEmpr, waId, tipoInfo as any, nombreEmpresa, config);
        await this.sendButtons(ideEmpr, waId, `Seguimos con tu lista 😊 ¿Qué deseas hacer?`, BTN_MODIFICAR_LISTA);
        return;
      }

      // ¿El cliente en realidad dijo que la lista ya está bien?
      const intencion = await this.botGpt.detectarIntencion(texto);
      if (intencion === 'CONFIRMAR' || intencion === 'LISTO') {
        await this.botSession.update(sesion.ide_whbse, BotState.CONFIRMACION_PRODUCTOS, datos);
        await this.sendButtons(ideEmpr, waId, this.buildResumenProductos(productos), BTN_CONFIRMACION_COTIZACION);
        return;
      }
      // No se entendió → volver a preguntar mostrando la lista, sin adivinar
      await this.sendButtons(ideEmpr, waId,
        `${this.buildListaProductos(productos)}\n\nNo logré identificar el cambio 🤔 ¿Qué deseas hacer?\n\n_Ejemplo: "quita el 2" o "cambia el 3 a 5kg"_`,
        BTN_MODIFICAR_LISTA);
      return;
    }

    if (nuevos.length === 0) {
      // Quitó todo → reiniciar la captura de productos
      const nuevosDatos: DatosSesion = { ...datos, productos: [], texto_acumulado: undefined, cola_productos: undefined };
      await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS, nuevosDatos);
      await this.sendText(ideEmpr, waId, `Listo, quité todos los productos ✅\n\n${MSG_INICIO_COTIZACION}`);
      return;
    }

    // Cambios aplicados → resumen actualizado y de vuelta a confirmación
    const nuevosDatos: DatosSesion = { ...datos, productos: nuevos };
    await this.botSession.update(sesion.ide_whbse, BotState.CONFIRMACION_PRODUCTOS, nuevosDatos);
    await this.sendButtons(ideEmpr, waId, `¡Listo! ✅\n\n${this.buildResumenProductos(nuevos)}`, BTN_CONFIRMACION_COTIZACION);
  }

  private async handleDatosEnvio(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, config: any,
  ): Promise<void> {
    const datos = sesion.datos_sesion as DatosSesion;
    const envio = datos.envio ?? {};
    this.logger.debug(`[Bot] handleDatosEnvio pendiente_campo=${envio.pendiente_campo ?? 'N/A'} texto="${texto}"`);

    // Paso -1 — confirmación de datos de envío guardados (provincia + dirección)
    if (envio.pendiente_campo === 'confirmar_envio_guardado') {
      const t = texto.trim().toUpperCase();
      // Botones primero; si el cliente escribe texto (ej. "si" porque el botón ya no
      // se puede volver a tocar tras un webhook perdido), se interpreta la intención —
      // antes CUALQUIER texto que no fuera el botón se trataba como "cambiar dirección".
      let usarGuardado = t === 'ENV_MISMO';
      let cambiar = t === 'ENV_CAMBIAR';
      if (!usarGuardado && !cambiar) {
        const intencion = await this.botGpt.detectarIntencion(texto);
        usarGuardado = intencion === 'CONFIRMAR';
        cambiar = intencion === 'CANCELAR';
      }

      if (usarGuardado) {
        // Usar provincia y dirección guardadas → ir directo a pago
        const dir = datos.cliente?.direccion_registrada || envio.direccion || '';
        await this.botSession.update(sesion.ide_whbse, BotState.DATOS_PAGO,
          { ...datos, envio: { ...envio, direccion: dir || undefined, pendiente_campo: undefined } });
        await this.sendButtons(ideEmpr, waId, MSG_FORMA_PAGO, BTN_FORMA_PAGO);
        return;
      }
      if (cambiar) {
        await this.botSession.update(sesion.ide_whbse, BotState.DATOS_ENVIO,
          { ...datos, envio: { pendiente_campo: 'tipo_direccion' } });
        await this.sendButtons(ideEmpr, waId,
          `¿Cómo prefieres indicar la nueva dirección?`,
          [
            { id: 'DIR_TEXTO', title: '📝 Escribir dirección' },
            { id: 'DIR_UBICACION', title: '📍 Mi ubicación' },
          ],
        );
        return;
      }
      // Ambiguo → repetir la pregunta con los botones (no adivinar)
      await this.sendButtons(ideEmpr, waId,
        `¿Utilizamos la dirección registrada para esta cotización?`,
        [
          { id: 'ENV_MISMO', title: '✅ Sí, son correctos' },
          { id: 'ENV_CAMBIAR', title: '📝 Cambiar dirección' },
        ],
      );
      return;
    }

    // Paso 1 — elegir cómo indicar la dirección
    if (envio.pendiente_campo === 'tipo_direccion') {
      const t = texto.trim().toUpperCase();
      if (t === 'DIR_TEXTO') {
        await this.botSession.update(sesion.ide_whbse, BotState.DATOS_ENVIO,
          { ...datos, envio: { ...envio, pendiente_campo: 'direccion_texto' } });
        await this.sendText(ideEmpr, waId,
          `Cuéntame tu dirección o algún punto de referencia donde podamos ubicarte 📝\n\n_Ejemplo: Av. Los Shyris y Suecia, Quito — cerca del Parque del Arbolito_\n\nEs solo para tu cotización, un asesor confirmará el detalle exacto de entrega más adelante 😊`,
        );
        return;
      }
      if (t === 'DIR_UBICACION') {
        await this.botSession.update(sesion.ide_whbse, BotState.DATOS_ENVIO,
          { ...datos, envio: { ...envio, pendiente_campo: 'esperar_ubicacion' } });
        await this.sendText(ideEmpr, waId,
          `📍 Comparte tu ubicación desde WhatsApp:\n_Adjuntar → Ubicación → Enviar ubicación actual_`,
        );
        return;
      }
      // Si escribió algo libre, tomarlo como dirección directamente — salvo que sea el
      // ID de un botón viejo tocado por error (ver IDS_BOTONES_CONOCIDOS).
      if (esIdBotonConocido(texto)) {
        await this.sendButtons(ideEmpr, waId,
          `¿Cómo prefieres indicar tu dirección de entrega?`,
          [
            { id: 'DIR_TEXTO',     title: '📝 Escribir dirección' },
            { id: 'DIR_UBICACION', title: '📍 Mi ubicación' },
          ],
        );
        return;
      }
      await this.botSession.update(sesion.ide_whbse, BotState.DATOS_ENVIO,
        { ...datos, envio: { ...envio, direccion: texto.trim(), pendiente_campo: 'provincia' } });
      await this.sendText(ideEmpr, waId, `¿En qué *provincia* te encuentras? 🗺️`);
      return;
    }

    // Paso 2a — dirección escrita
    if (envio.pendiente_campo === 'direccion_texto') {
      if (esIdBotonConocido(texto)) {
        await this.sendText(ideEmpr, waId,
          `Cuéntame tu dirección o algún punto de referencia 📝`,
        );
        return;
      }
      await this.botSession.update(sesion.ide_whbse, BotState.DATOS_ENVIO,
        { ...datos, envio: { ...envio, direccion: texto.trim(), pendiente_campo: 'provincia' } });
      await this.sendText(ideEmpr, waId, `¿En qué *provincia* te encuentras? 🗺️`);
      return;
    }

    // Paso 2b — ubicación compartida de WhatsApp
    if (envio.pendiente_campo === 'esperar_ubicacion') {
      if (texto.startsWith('__LOCATION__:')) {
        const [, coordPart] = texto.split(':');
        const [lat, lng, nombre, direccionMapa] = coordPart.split(',');
        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lng);

        // Geocodificación inversa con Nominatim
        let direccionFormateada = direccionMapa?.trim() || nombre?.trim() || null;
        if (!direccionFormateada) {
          const geocoded = await this.ycloudService.getAddressFromCoords(latNum, lngNum);
          direccionFormateada = geocoded || `Coordenadas: ${lat}, ${lng}`;
        }

        await this.botSession.update(sesion.ide_whbse, BotState.DATOS_ENVIO, {
          ...datos,
          envio: {
            ...envio,
            direccion: direccionFormateada,
            latitud: latNum,
            longitud: lngNum,
            pendiente_campo: 'provincia',
          },
        });
        await this.sendText(ideEmpr, waId,
          `📍 Ubicación recibida ✅\n_${direccionFormateada}_\n\n¿En qué *provincia* te encuentras? 🗺️`,
        );
        return;
      }
      // Si escribió texto en lugar de compartir ubicación, tomarlo como dirección —
      // salvo que sea el ID de un botón viejo tocado por error.
      if (esIdBotonConocido(texto)) {
        await this.sendText(ideEmpr, waId,
          `📍 Comparte tu ubicación desde WhatsApp:\n_Adjuntar → Ubicación → Enviar ubicación actual_\n\n_O escribe tu dirección directamente_`,
        );
        return;
      }
      await this.botSession.update(sesion.ide_whbse, BotState.DATOS_ENVIO,
        { ...datos, envio: { ...envio, direccion: texto.trim(), pendiente_campo: 'provincia' } });
      await this.sendText(ideEmpr, waId, `¿En qué *provincia* te encuentras? 🗺️`);
      return;
    }

    // Paso 3 — provincia → directo a pago (sin transporte)
    if (envio.pendiente_campo === 'provincia') {
      // Matching tolerante (tildes, typos leves, ciudades conocidas) — antes se
      // guardaba CUALQUIER texto como provincia, incluidas preguntas del cliente.
      const provincia = matchProvinciaEcuador(texto);
      if (!provincia) {
        const tipoInfo = await this.botGpt.clasificarConsulta(texto);
        if (['UBICACION', 'HORARIO', 'ENVIO', 'CATALOGO'].includes(tipoInfo)) {
          await this.responderInfo(ideEmpr, waId, tipoInfo as any, config?.nombre_empresa || 'DIQUIMEC', config);
        }
        await this.sendText(ideEmpr, waId,
          `¿En qué *provincia* te encuentras? 🗺️\n\n_Ejemplo: Pichincha, Guayas, Azuay... (también puedes decirme tu ciudad)_`,
        );
        return;
      }
      await this.botSession.update(sesion.ide_whbse, BotState.DATOS_PAGO,
        { ...datos, envio: { ...envio, provincia, pendiente_campo: undefined } });
      await this.sendButtons(ideEmpr, waId, MSG_FORMA_PAGO, BTN_FORMA_PAGO);
      return;
    }
  }

  private async handleDatosPago(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, nombreBot: string, nombreEmpresa: string,
  ): Promise<void> {
    const datos = sesion.datos_sesion as DatosSesion;
    const t = texto.trim().toUpperCase();
    let formaPago: 'cash' | 'credit' | null = null;

    if (t === 'PAGO_EFECTIVO') formaPago = 'cash';
    else if (t === 'PAGO_TARJETA') formaPago = 'credit';
    else {
      // En texto libre, una negación invalida el match por palabra clave — sin esto,
      // "no quiero tarjeta" matcheaba TARJETA por substring y se registraba como crédito.
      const hayNegacion = /\b(NO|SIN|NI|TAMPOCO|NADA)\b/.test(t);
      if (!hayNegacion) {
        if (/EFECTIVO|CASH|\bEFE\b|BILLETES?|DINERO\s*EN\s*EFECTIVO/.test(t)) formaPago = 'cash';
        else if (/TARJETA|CR[EÉ]DITO|D[EÉ]BITO|CARD|VISA|MASTERCARD/.test(t)) formaPago = 'credit';
        // Casos comunes: transferencia / depósito → tratados como efectivo (coordinan aparte)
        else if (/TRANSFER|DEP[OÓ]SITO|DEPOSITO|BANCO|CHEQUE/.test(t)) formaPago = 'cash';
      }
    }

    if (!formaPago) {
      await this.sendButtons(ideEmpr, waId, MSG_FORMA_PAGO, BTN_FORMA_PAGO);
      return;
    }

    const nuevosDatos: DatosSesion = { ...datos, forma_pago: formaPago };
    await this.botSession.update(sesion.ide_whbse, BotState.FINALIZADO, nuevosDatos);

    await this.sendText(ideEmpr, waId,
      `⏳ *Espera un momento*, estoy generando tu cotización...\n_Esto puede tardar unos segundos_ 😊`,
    );

    try {
      const resultado = await this.botProforma.procesarProforma(
        nuevosDatos, `+${waId}`, ideEmpr, 0, nombreBot,
      );

      if (resultado.automatica && resultado.pdfBuffer) {
        // ── CASO 1: Automático — mostrar resumen financiero ──
        const baseSinIva = resultado.baseGrabada ?? 0;
        const tarifa0 = resultado.baseTarifa0 ?? 0;
        const iva = resultado.valorIva ?? 0;
        const totalFinal = resultado.total ?? 0;
        const pctIva = resultado.tarifaIva ?? 15;

        // Enviar PDF como documento usando link público (evita upload a YCloud que falla)
        let pdfEnviado = false;
        try {
          const filename = await this.fileTempService.saveWhatsAppMedia(
            resultado.pdfBuffer, 'pdf', `Cotizacion_${resultado.secuencial}.pdf`,
          );
          const pdfUrl = `${envs.hostApi}/api/whatsapp/media/${filename}`;
          await this.ycloudService.sendDocument(
            ideEmpr, `+${waId}`, null,
            `Cotizacion_${resultado.secuencial}.pdf`,
            `📄 Cotización #${resultado.secuencial} — ${nombreEmpresa}`,
            undefined,
            pdfUrl,
            true,
          );
          this.logger.log(`[Bot] PDF enviado como documento link: ${pdfUrl}`);
          pdfEnviado = true;
          // Notificar a agentes via socket que se generó una proforma automática
          this.gateway.emitNuevaProformaBot(
            ideWhcue, resultado.secuencial, nuevosDatos.cliente?.nombres || waId,
          );
        } catch (pdfErr) {
          // Antes, si esto fallaba, igual se le decía al cliente "Adjuntamos tu
          // cotización en PDF" — mensaje falso, sin adjunto real, y nadie del equipo se
          // enteraba. Ahora el texto al cliente cambia (ver `lineas` abajo) y se avisa
          // al equipo para que la reenvíen manualmente.
          this.logger.error(`Error enviando PDF: ${pdfErr.message}`);
          try {
            await this.notificaciones.enviarSistema(
              'WHATSAPP_PDF_FALLIDO',
              `⚠️ PDF no enviado — Cotización #${resultado.secuencial}`,
              `Falló el envío automático del PDF de la cotización #${resultado.secuencial} a ${waId}. El cliente ya recibió el resumen de totales pero no el PDF — reenviar manualmente.`,
              {
                tipo: 'text',
                botones: [{ texto: 'Ver Chat', accion: 'navigate', estilo: 'primary', url: '/dashboard/whatsapp' }],
              },
              ideEmpr, 'bot',
            );
          } catch (notifErr) {
            this.logger.error(`[Notif] Error notificando fallo de envío de PDF: ${notifErr.message}`);
          }
        }

        const lineas = [
          `✅ *¡Tu cotización #${resultado.secuencial} está lista!* 🎉\n`,
          ...(tarifa0 > 0 ? [`📋 Subtotal tarifa 0%:  *$${tarifa0.toFixed(2)}*`] : []),
          `📋 Subtotal gravado:    *$${baseSinIva.toFixed(2)}*`,
          `📋 IVA ${pctIva}%:             *$${iva.toFixed(2)}*`,
          `💰 *Total:               $${totalFinal.toFixed(2)}*`,
          ``,
          pdfEnviado
            ? `📄 Adjuntamos tu cotización en PDF con el detalle completo.`
            : `📄 En un momento te enviamos tu cotización en PDF con el detalle completo.`,
          ``,
          `Uno de nuestros asesores confirmará disponibilidad y coordinará el pago y envío 😊`,
        ];

        await this.sendText(ideEmpr, waId, lineas.join('\n'));

        // Esperar 5s para que el PDF llegue antes que el mensaje de seguimiento
        await new Promise((r) => setTimeout(r, 5000));
        await this.sendText(ideEmpr, waId,
          `Tu cotización ya está lista para revisarla 📄\n\n` +
          `Si tienes alguna consulta, necesitas ajustar algún detalle o deseas hacer algún cambio, no dudes en escribirnos — con gusto te atendemos 😊`,
        );
        await new Promise((r) => setTimeout(r, 5000));
        await this.sendButtons(ideEmpr, waId,
          `¿Hay algo más en que pueda ayudarte? 🧪`,
          [
            { id: 'NUEVA_COTIZACION', title: '🛒 Nueva cotización' },
            { id: 'HABLAR_ASESOR', title: '👤 Hablar con asesor' },
          ],
        );

      } else {
        // ── CASO 2 y 3: algún producto sin precio o fuera de catálogo ──
        const msgAsesor = resultado.conPrecio
          ? `Cotización #${resultado.secuencial} — precios cargados pero productos fuera de catálogo. Revisar y enviar proforma al cliente.`
          : `Cotización #${resultado.secuencial} — ${resultado.productosSinPrecio.length} producto(s) sin precio. Completar y enviar proforma al cliente.`;

        await this.sendText(ideEmpr, waId,
          `✅ *Cotización #${resultado.secuencial} registrada* 😊\n\n` +
          `Uno de nuestros asesores comerciales será asignado para completar tu cotización.\n` +
          `En cuanto esté lista te notificaremos.\n\n` +
          `⏰ *Horario de atención:* Lunes a viernes de 08:00 a 17:00 y sábados de 09:00 a 13:00. Fuera de este horario te responderemos el próximo día hábil. ¡Gracias!\n\n` +
          `*¡Gracias por contactarnos!* 🧪`,
        );
        // null = ya se envió mensaje al cliente; msgAsesor = nota interna solo para log/asesor
        await this.botSession.cerrar(sesion.ide_whbse, BotState.FINALIZADO);
        await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, null, msgAsesor);
      }
    } catch (err) {
      this.logger.error(`Error creando proforma: ${err.message}`);
      await this.sendText(ideEmpr, waId,
        `Hubo un inconveniente al generar tu cotización 😔\nUn asesor te contactará en breve para ayudarte.\n\n⏰ *Horario de atención:* Lunes a viernes de 08:00 a 17:00 y sábados de 09:00 a 13:00. Fuera de este horario te responderemos el próximo día hábil. ¡Gracias!`,
      );
      await this.botSession.cerrar(sesion.ide_whbse, BotState.FINALIZADO);
      await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr);
    }
    // CASO 1 (automático): la sesión queda ACTIVA+FINALIZADO para que handlePostCotizacion
    // recoja el siguiente mensaje (HABLAR_ASESOR / NUEVA_COTIZACION) sin crear una sesión nueva.
  }

  private async handlePostCotizacion(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, nombreBot: string, nombreEmpresa: string, config: any,
  ): Promise<void> {
    const t = texto.trim().toUpperCase();

    if (t === 'HABLAR_ASESOR' || PALABRAS_ASESOR.test(texto)) {
      // Cerrar sesión antes de derivar para evitar re-procesos
      await this.botSession.cerrar(sesion.ide_whbse, BotState.FINALIZADO);
      await this.sendText(ideEmpr, waId,
        `Con mucho gusto 😊 En breve uno de nuestros asesores comerciales se pondrá en contacto contigo.\n\n⏰ *Horario de atención:* Lunes a viernes de 08:00 a 17:00 y sábados de 09:00 a 13:00. Fuera de este horario te responderemos el próximo día hábil. ¡Gracias!\n\n¡Que tengas un excelente día! 🌟`,
      );
      // null = no enviar mensaje adicional al cliente (ya lo enviamos arriba)
      await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr,
        null, `Cliente solicitó asesor tras recibir cotización.`,
      );
      return;
    }

    // El clic del botón evita una llamada a GPT innecesaria; cualquier otro texto se
    // clasifica con el mismo detector que usa el resto del flujo (más robusto que un
    // regex propio — antes /NUEVA|COTIZAR|OTRO PRODUCTO|OTRA COTIZ/i disparaba con
    // falsos positivos tipo "ya no quiero cotizar más", y esta pantalla era la única
    // del flujo sin chequeo de consulta informativa).
    const esBotonNueva = t === 'NUEVA_COTIZACION';
    const tipoConsulta = esBotonNueva ? 'PRODUCTO' : await this.botGpt.clasificarConsulta(texto);

    if (tipoConsulta === 'PRODUCTO') {
      // El cliente ya se identificó en la sesión que se está cerrando (se acaba de
      // generar una cotización con sus datos) — se conserva para no volver a preguntar.
      const datosAnteriores = sesion.datos_sesion as DatosSesion;
      const clienteConocido = datosAnteriores?.cliente;

      // handlePostCotizacion solo se llama con sesion.estado === FINALIZADO (cotización
      // ya generada con éxito) — cerrarla como CANCELADO la volvía inelegible para
      // getMemoriaCliente() (excluye CANCELADO/EXPIRADO), así que después de pedir una
      // "Nueva cotización" el bot dejaba de reconocer al cliente en futuras conversaciones.
      await this.botSession.cerrar(sesion.ide_whbse, BotState.FINALIZADO);
      const { sesion: nuevaSesion } = await this.botSession.getOrCreate(ideWhcha, ideWhcue);

      if (clienteConocido?.nombres) {
        const nuevosDatos: DatosSesion = {
          productos: [],
          cliente: { ...clienteConocido, pendiente_campo: undefined },
          memoria_cargada: true,
          envio: datosAnteriores.envio?.provincia ? { provincia: datosAnteriores.envio.provincia } : undefined,
        };
        if (esBotonNueva) {
          // Solo el clic del botón, sin producto mencionado — se queda esperando que
          // diga qué necesita (el siguiente mensaje ya entra por el flujo liviano).
          await this.botSession.update(nuevaSesion.ide_whbse, BotState.ATENCION_LIBRE, nuevosDatos);
          await this.sendText(ideEmpr, waId, `¡Con gusto! 😊 Cuéntame qué productos necesitas cotizar y en qué cantidades, y te preparo la cotización.`);
        } else {
          // El mensaje ya traía el producto (ej. "otra cotización: 5kg cera de soya") —
          // se procesa de inmediato con el flujo liviano (pide solo la cantidad si falta
          // y genera la proforma directo) en vez del de lista/FIN.
          const { items } = await this.botGpt.analizarLoteProductos(texto, []);

          // Igual que en manejarConsultaProductoClasica: sin producto puntual detectado,
          // no se arrastra el mensaje vago a la cotización.
          if (!items.length) {
            await this.sendText(ideEmpr, waId, `Cuéntame qué productos necesitas cotizar y en qué cantidades, y con gusto te preparo la cotización 😊`);
            await this.botSession.update(nuevaSesion.ide_whbse, BotState.ATENCION_LIBRE, nuevosDatos);
            return;
          }

          let pedirUso = false;
          {
            const estadoProducto = await this.evaluarExistenciaProductos(items.map((i) => i.producto), ideEmpr);
            if (estadoProducto.estado === 'NO_VENDEMOS') {
              const mensaje = estadoProducto.observacion?.trim() || 'Por el momento no comercializamos ese producto 😔';
              await this.sendText(ideEmpr, waId, `${mensaje} ¿Te ayudo con algo más?`);
              await this.botSession.update(nuevaSesion.ide_whbse, BotState.ATENCION_LIBRE, nuevosDatos);
              return;
            }
            if (estadoProducto.estado === 'SIN_MATCH') pedirUso = true;
          }

          await this.iniciarRecopilacionCotizacionRapida(
            waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, nuevaSesion, nuevosDatos, items, nombreBot, nombreEmpresa, pedirUso,
          );
        }
        return;
      }

      // No preguntamos "¿eres cliente registrado?" — se pide el nombre directo (mismo
      // criterio que responderConsultaInicial/handleAtencionLibre/finalizarColeccion
      // Productos: la gran mayoría de los chats nuevos nunca compraron antes).
      await this.botSession.update(nuevaSesion.ide_whbse, BotState.DATOS_NUEVO_CLIENTE, {
        productos: [],
        cliente: { nombres: '', correo: '', es_cliente_registrado: false, pendiente_campo: 'nombres' },
        producto_texto_pendiente: esBotonNueva ? undefined : texto,
      });
      await this.sendText(ideEmpr, waId, `¡Con gusto! 😊 ¿Me podrías indicar tu nombre?`);
      return;
    }

    if (['UBICACION', 'HORARIO', 'ENVIO', 'CATALOGO'].includes(tipoConsulta)) {
      await this.responderInfo(ideEmpr, waId, tipoConsulta as any, nombreEmpresa, config);
      await this.sendButtons(ideEmpr, waId,
        `¿Puedo ayudarte con algo más? 😊`,
        [
          { id: 'NUEVA_COTIZACION', title: '🛒 Nueva cotización' },
          { id: 'HABLAR_ASESOR', title: '👤 Hablar con asesor' },
        ],
      );
      return;
    }

    // Cualquier otro mensaje → responder amablemente y repetir opciones
    await this.sendButtons(ideEmpr, waId,
      `¡Gracias por tu mensaje! 😊 ¿Puedo ayudarte con algo más?`,
      [
        { id: 'NUEVA_COTIZACION', title: '🛒 Nueva cotización' },
        { id: 'HABLAR_ASESOR', title: '👤 Hablar con asesor' },
      ],
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Responde preguntas de info (ubicación, horario, envíos, catálogo).
   *
   * Para preguntas de ubicación contextuales (ej: "¿tienen sucursal en Cuenca?"),
   * usa GPT con el contenido del template como contexto para una respuesta personalizada.
   * Para preguntas genéricas usa el template directamente (determinista, sin costo GPT).
   * Si no existe el template, fallback a GPT.
   */
  /**
   * Solo arma el texto de la plantilla configurada (columnas dedicadas en DB, fuente de
   * verdad, sin parseo) — no envía nada. Separado de responderInfo para poder combinar
   * varias respuestas informativas en un solo mensaje (ver handleAtencionLibreReducida).
   */
  private construirTextoInfo(
    tipo: 'UBICACION' | 'HORARIO' | 'ENVIO' | 'CATALOGO',
    nombreEmpresa: string,
    config: any,
  ): string | null {
    const nombreBot = config?.nombre_bot || 'Asistente';
    const colMap: Record<string, string | null> = {
      UBICACION: config?.resp_ubicacion ?? null,
      HORARIO: config?.resp_horario ?? null,
      ENVIO: config?.resp_envio ?? null,
      CATALOGO: config?.resp_catalogo ?? null,
    };
    const template = colMap[tipo] ?? null;
    if (!template) {
      this.logger.warn(`[construirTextoInfo] tipo=${tipo} sin template configurado en resp_${tipo.toLowerCase()} — omitiendo respuesta`);
      return null;
    }
    return template
      .replace(/{BOT_NOMBRE}/g, nombreBot)
      .replace(/{NOMBRE_EMPRESA}/g, nombreEmpresa);
  }

  private async responderInfo(
    ideEmpr: number, waId: string,
    tipo: 'UBICACION' | 'HORARIO' | 'ENVIO' | 'CATALOGO',
    nombreEmpresa: string,
    config: any,
  ): Promise<void> {
    const respuesta = this.construirTextoInfo(tipo, nombreEmpresa, config);
    if (!respuesta) return;

    await this.sendText(ideEmpr, waId, respuesta);

    if (tipo === 'UBICACION' && config?.lat_empresa && config?.lng_empresa) {
      try {
        await this.ycloudService.sendLocation(
          ideEmpr, `+${waId}`, config.lat_empresa, config.lng_empresa, nombreEmpresa, '', true,
        );
      } catch (err) {
        this.logger.warn(`[Bot] No se pudo enviar pin de ubicación: ${err.message}`);
      }
    }
  }

  /**
   * Parser línea a línea: extrae solo el contenido de la sección indicada.
   * Detecta como marcador cualquier línea cuyo trim comience Y termine con ===,
   * por lo que es robusto frente a: saltos \r\n, espacios extras, nombres con/sin _,
   * o cualquier variación de formato que tenga el prompt en la DB.
   */
  private extraerSeccionPrompt(prompt: string, nombreSeccion: string): string | null {
    const norm = prompt.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = norm.split('\n');

    let inSection = false;
    const content: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Cualquier línea que empiece Y termine con === es un marcador de sección
      if (trimmed.startsWith('===') && trimmed.endsWith('===') && trimmed.length > 6) {
        if (inSection) break; // siguiente sección → detenerse

        // Extraer el nombre quitando los === y espacios/tabs de los extremos
        const markerName = trimmed.replace(/^===[ \t]*/, '').replace(/[ \t]*===[ \t]*$/, '').trim();

        // Coincidencia exacta o sin guiones (por si DB usa RESPUESTAHORARIO en vez de RESPUESTA_HORARIO)
        if (markerName === nombreSeccion || markerName.replace(/_/g, '') === nombreSeccion.replace(/_/g, '')) {
          inSection = true;
        }
        continue;
      }

      if (inSection) content.push(line);
    }

    if (!inSection) return null;
    return content.join('\n').trim() || null;
  }

  private displayNombreProducto(prod: { nombre: string; otro_nombre?: string; matched_by_otro_nombre?: boolean }): string {
    if (prod.matched_by_otro_nombre && prod.otro_nombre) {
      return `${prod.nombre} / ${prod.otro_nombre}`;
    }
    return prod.nombre;
  }

  /**
   * Repite la pregunta pendiente del estado actual, precedida de un saludo — se usa
   * cuando el cliente manda un saludo suelto a mitad de flujo con progreso acumulado
   * (en vez de resetear la sesión y borrarle todo, ver processMessageInternal).
   */
  private async reenviarPromptEstado(
    ideEmpr: number, waId: string, estado: BotState, datos: DatosSesion,
  ): Promise<void> {
    const saludo = `¡Hola! 😊 Seguimos con tu cotización.`;
    const productos = datos.productos ?? [];

    switch (estado) {
      case BotState.SELECCION_PRODUCTOS:
        await this.sendButtons(ideEmpr, waId, `${saludo}\n\n${MSG_ACUSE_LOTE}`, BTN_ACUSE_LOTE);
        return;
      case BotState.SELECCION_MULTIPLE: {
        const lista = (datos.opciones_producto ?? [])
          .map((o) => `*${o.numero}.* ${this.displayNombreProducto(o)}`).join('\n');
        await this.sendText(ideEmpr, waId,
          `${saludo}\n\n${lista}\n\n_Responde solo con el número de la opción que necesitas._`);
        return;
      }
      case BotState.CONFIRMANDO_PRODUCTO_LOTE: {
        const p = datos.pendiente_confirmacion;
        if (p) {
          await this.sendButtons(ideEmpr, waId,
            `${saludo}\n\n¿*${p.nombre}* es el producto que buscas? 🤔`,
            [{ id: 'PROD_SI', title: '✅ Sí, es este' }, { id: 'PROD_NO', title: '❌ No es este' }]);
          return;
        }
        break;
      }
      case BotState.ESPERANDO_USO_LOTE: {
        const pend = datos.pendientes_uso ?? [];
        const lista = pend.map((p, i) => `${i + 1}. ${p.nombre}`).join('\n');
        await this.sendText(ideEmpr, waId,
          pend.length === 1
            ? `${saludo}\n\nCuéntame ¿para qué uso necesitas *${pend[0]?.nombre}*?`
            : `${saludo}\n\nCuéntame para qué uso necesitas cada uno:\n\n${lista}`);
        return;
      }
      case BotState.ESPERANDO_CANTIDAD_LOTE: {
        const pend = datos.pendientes_cantidad ?? [];
        const lista = pend.map((p, i) => `${i + 1}. ${p.nombre}`).join('\n');
        await this.sendText(ideEmpr, waId,
          pend.length === 1
            ? `${saludo}\n\n¿Qué cantidad de *${pend[0]?.nombre}* necesitas?`
            : `${saludo}\n\n¿Qué cantidad necesitas de cada uno?\n\n${lista}`);
        return;
      }
      case BotState.CONFIRMACION_PRODUCTOS:
        await this.sendButtons(ideEmpr, waId, `${saludo}\n\n${this.buildResumenProductos(productos)}`, BTN_CONFIRMACION_COTIZACION);
        return;
      case BotState.MODIFICANDO_LISTA:
        await this.sendButtons(ideEmpr, waId,
          `${saludo}\n\n${this.buildListaProductos(productos)}\n\n¿Qué deseas cambiar?`,
          BTN_MODIFICAR_LISTA);
        return;
      case BotState.PREGUNTA_ES_CLIENTE:
        await this.sendButtons(ideEmpr, waId, `${saludo}\n\n${MSG_ES_CLIENTE_BODY}`, BTN_ES_CLIENTE);
        return;
      case BotState.IDENTIFICACION:
        await this.sendText(ideEmpr, waId,
          `${saludo}\n\nPor favor dime tu *número de cédula o RUC* para ubicar tu información.`);
        return;
      case BotState.DATOS_NUEVO_CLIENTE:
        await this.sendText(ideEmpr, waId, `${saludo}\n\n¿Me podrías indicar tu *nombre completo*?`);
        return;
      case BotState.DATOS_ENVIO: {
        const campo = datos.envio?.pendiente_campo;
        if (campo === 'provincia') {
          await this.sendText(ideEmpr, waId, `${saludo}\n\n¿En qué *provincia* te encuentras? 🗺️`);
        } else if (campo === 'direccion_texto') {
          await this.sendText(ideEmpr, waId, `${saludo}\n\nCuéntame tu dirección o algún punto de referencia 📝`);
        } else if (campo === 'esperar_ubicacion') {
          await this.sendText(ideEmpr, waId, `${saludo}\n\n📍 Comparte tu ubicación desde WhatsApp:\n_Adjuntar → Ubicación → Enviar ubicación actual_`);
        } else {
          await this.sendText(ideEmpr, waId, `${saludo}\n\nContinuemos con la dirección de entrega 📍`);
        }
        return;
      }
      case BotState.DATOS_PAGO:
        await this.sendButtons(ideEmpr, waId, `${saludo}\n\n${MSG_FORMA_PAGO}`, BTN_FORMA_PAGO);
        return;
      default:
        break;
    }
    await this.sendText(ideEmpr, waId, `${saludo} Continuemos donde quedamos 👇`);
  }

  private buildListaProductos(productos: ProductoSesion[]): string {
    return productos.map((p, i) => {
      // Si la cantidad vino de convertir una expresión coloquial (caneca, galón, etc.),
      // se le muestra al cliente lo que ÉL escribió (ver ProductoSesion.cantidadTexto) —
      // el número ya convertido a kg queda solo para uso interno de la proforma.
      const cantidadTexto = p.cantidadTexto
        ? p.cantidadTexto
        : p.cantidad === 0
          ? '(cantidad mínima disponible)'
          : `${p.cantidad} ${p.siglas_unidad || p.unidad || ''}`;
      return `${i + 1}. *${p.nombre}* — ${cantidadTexto}`;
    }).join('\n');
  }

  private buildResumenProductos(productos: ProductoSesion[]): string {
    return `📋 *Resumen de tu cotización:*\n\n${this.buildListaProductos(productos)}\n\n¿Confirmamos tu cotización?`;
  }

  private getPromptSistema(nombreBot: string, nombreEmpresa: string): string {
    return `Eres ${nombreBot}, asesora comercial virtual de ${nombreEmpresa}.

=== ESTILO DE RESPUESTA ===
- Eres mujer, cálida, amable y profesional. Tus mensajes transmiten confianza.
- SIEMPRE usa emojis relevantes (📍 🕒 🚚 📦 🌐 ✅ 😊).
- Usa *negrita de WhatsApp* (*texto*) para datos clave.
- Usa _cursiva de WhatsApp_ (_texto_) para referencias secundarias.
- Empieza con un encabezado cálido SOLO en el primer mensaje. En mensajes siguientes NO repitas el saludo ni te presentes de nuevo.
- Responde en español. Si no tienes información, invita al cliente a escribir SALIR para hablar con un asesor.
- NUNCA inventas precios ni información que no tengas.
- NUNCA asumas que el cliente está insatisfecho o molesto a menos que lo diga explícitamente. No te disculpes sin motivo.`;
  }

  async derivarAsesor(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number,
    mensajeCliente?: string | null,   // mensaje visible al cliente (undefined = default, null = ninguno)
    notaAsesor?: string,              // nota interna para el asesor (NO se envía al cliente)
  ): Promise<void> {
    await this.dataSource.pool.query(
      `UPDATE wha_chat SET bot_activo_whcha = FALSE, bot_modo_whcha = 'ASESOR' WHERE ide_whcha = $1`,
      [ideWhcha],
    );

    // Cierra cualquier sesión de bot que haya quedado activa a medio flujo (ej. el
    // cliente escribió "ASESOR"/"SALIR" en medio de DATOS_ENVIO). Sin esto, la sesión
    // quedaba "colgada" en un estado no terminal, y al reactivar el chat más tarde
    // `iniciarConContextoChat` la encontraba y trataba de "adivinar" el contexto con
    // GPT usando historial viejo en vez de saludar limpio — generando respuestas
    // confusas mezclando datos de la conversación abandonada.
    try {
      const activa = await this.dataSource.pool.query<{ ide_whbse: number }>(
        `SELECT ide_whbse FROM wha_bot_sesion WHERE ide_whcha = $1 AND activa = TRUE LIMIT 1`,
        [ideWhcha],
      );
      if (activa.rowCount > 0) {
        await this.botSession.cerrar(activa.rows[0].ide_whbse, BotState.CANCELADO);
      }
    } catch (err) {
      this.logger.warn(`[Bot] derivarAsesor: no se pudo cerrar sesión activa de chat ${ideWhcha}: ${err.message}`);
    }

    if (mensajeCliente !== null) {
      await this.sendText(ideEmpr, waId,
        mensajeCliente ||
        `Enseguida te comunico con uno de nuestros asesores comerciales 👤\nEspera un momento por favor 😊\n\n⏰ *Horario de atención:* Lunes a viernes de 08:00 a 17:00 y sábados de 09:00 a 13:00. Fuera de este horario te responderemos el próximo día hábil. ¡Gracias!`,
      );
    }

    if (notaAsesor) {
      this.logger.log(`[Asesor] Nota interna para chat ${ideWhcha}: ${notaAsesor}`);
    }

    this.gateway.emitChatEsperandoAsesor(ideWhcue, waId, ideWhcha);
    this.logger.log(`Chat ${waId} derivado a asesor`);

    // ─── Notificación push a los asesores asignados ─────────────────────────
    try {
      const chatInfo = await this.dataSource.pool.query(
        `SELECT nombre_whcha FROM wha_chat WHERE ide_whcha = $1`,
        [ideWhcha],
      );
      const nombreCliente = chatInfo.rows[0]?.nombre_whcha || waId;

      await this.notificaciones.enviarSistema(
        'WHATSAPP_SOLICITA_ASESOR',
        `💬 ${waId} ${nombreCliente} solicita asesor`,
        `El cliente ${nombreCliente} (${waId}) quiere contactarse con un asesor humano.`,
        {
          tipo: 'text',
          botones: [
            { texto: 'Ver Chat', accion: 'navigate', estilo: 'primary', url: '/dashboard/whatsapp' },
          ],
        },
        ideEmpr,
        'bot',
      );
    } catch (err) {
      this.logger.error(`[Notif] Error al enviar notificación WhatsApp: ${err.message}`);
    }
  }

  /**
   * Reactivación automática de un chat VIEJO (no nuevo) que está en modo ASESOR — feature
   * opt-in por cuenta vía wha_bot_config.tiempo_reactiva_chats_viejos (horas; `null` =
   * desactivada, sin umbral quemado en el código). Todas las condiciones deben cumplirse:
   *   1. La cuenta tiene un umbral configurado (no null).
   *   2. El cliente ya escribió antes hace más horas que ese umbral — se usa
   *      wha_chat.ultimo_ingreso_cliente_whcha (timestamptz, mantenida por
   *      YcloudWindowService.registerInboundMessage en cada mensaje entrante) y NO
   *      columnas `timestamp` sin zona (fecha_msg_whcha/wha_mensaje.fecha_whmem) — esas
   *      guardan UTC "disfrazado" de naive y darían un cálculo incorrecto si se restan
   *      con NOW() en SQL (ver investigación de zona horaria 2026-09-15 en el vault).
   *   3. El cliente es "conocido" — BotSessionService.esClienteConocido (memoria del bot
   *      o cruce por teléfono contra proformas ya generadas).
   * A propósito NO hay un cuarto filtro de "intención de venta" sobre el contenido del
   * mensaje (existió como BotGptService.puedeBotAtenderReactivacion, quitado 2026-09-16):
   * un cliente conocido que vuelve a escribir pasado el umbral se trata EXACTAMENTE igual
   * que un chat nuevo — un chat nuevo activa el bot con cualquier primer mensaje, sin
   * filtrar por contenido (ver processMessageInternal), así que reactivar un chat viejo no
   * debía ser más exigente que eso. Con el filtro de intención, un simple "Hola" (la forma
   * más común de reabrir una conversación) casi nunca calificaba como "venta nueva
   * explícita" y el chat se quedaba mudo — igual de silencioso que el bug de
   * isBotActive() de abajo, solo que este habría seguido fallando incluso después de
   * arreglar ese otro.
   * A propósito NO depende de BotConfigService.isBotActive() (activo_manual/horario) —
   * este bot siempre se maneja con activo_manual=FALSE y sin horario, igual que la
   * activación de chats NUEVOS (ver comentario en processMessageInternal): el toggle
   * global nunca estuvo pensado para gatear la auto-activación, solo para forzar el bot
   * ON/OFF a mano. Agregar ese chequeo acá bloqueaba la reactivación por completo en la
   * configuración real de la cuenta (caso real detectado 2026-09-16: un cliente conocido
   * escribió "Hola" pasadas las horas del umbral y el chat se quedó mudo, aunque cumplía
   * las otras 3 condiciones, porque este chequeo cortaba antes de evaluarlas).
   * Si reactiva, solo cambia los flags del chat — el resto de processMessageInternal
   * sigue su curso normal con este mismo mensaje (misma sesión fresca en INICIO, mismo
   * saludo por nombre si hay memoria, mismo debounce de modo reducido si la cuenta lo
   * usa): no hay ningún motor de respuesta paralelo que pueda desalinearse de la lógica
   * en vivo actual.
   */
  private async intentarReactivarChatViejo(
    waId: string, ideWhcha: number, ideWhcue: number, ideEmpr: number,
  ): Promise<boolean> {
    // Mismo freno que la activación de chats nuevos: en DEV nunca se auto-activa nada,
    // para no disparar mensajes reales a números de producción durante pruebas locales.
    if (envs.mode !== 'PROD') return false;
    try {
      const cfg = await this.dataSource.pool.query<{ tiempo_reactiva_chats_viejos: number | null }>(
        `SELECT tiempo_reactiva_chats_viejos FROM wha_bot_config WHERE ide_whcue = $1 LIMIT 1`,
        [ideWhcue],
      );
      const umbralHoras = cfg.rows[0]?.tiempo_reactiva_chats_viejos;
      if (umbralHoras == null) return false;

      const chatRow = await this.dataSource.pool.query<{ ultimo_ingreso_cliente_whcha: Date | null }>(
        `SELECT ultimo_ingreso_cliente_whcha FROM wha_chat WHERE ide_whcha = $1 LIMIT 1`,
        [ideWhcha],
      );
      const ultimoIngreso = chatRow.rows[0]?.ultimo_ingreso_cliente_whcha;
      if (!ultimoIngreso) return false;
      const horasSinMensaje = (Date.now() - new Date(ultimoIngreso).getTime()) / (1000 * 60 * 60);
      if (horasSinMensaje < umbralHoras) return false;

      const conocido = await this.botSession.esClienteConocido(ideWhcha, waId, ideEmpr);
      if (!conocido) return false;

      await this.dataSource.pool.query(
        `UPDATE wha_chat SET bot_activo_whcha = TRUE, bot_modo_whcha = 'BOT' WHERE ide_whcha = $1`,
        [ideWhcha],
      );
      this.logger.log(
        `[Bot] Reactivación automática chat=${ideWhcha}: cliente conocido, ${horasSinMensaje.toFixed(1)}h sin mensajes (umbral ${umbralHoras}h)`,
      );
      return true;
    } catch (err) {
      this.logger.warn(`[Bot] intentarReactivarChatViejo error chat=${ideWhcha}: ${err.message}`);
      return false;
    }
  }

  /**
   * Pausa el bot en un chat porque un asesor lo tomó MANUALMENTE desde el front (toggle
   * BOT/ASESOR del chat) — distinto de derivarAsesor(), que es cuando el propio bot
   * decide derivar. Cierra cualquier sesión de bot que haya quedado activa, igual que
   * derivarAsesor(), para que no se quede colgada con datos a medio completar (ej. una
   * cotización rápida con cantidad/uso pendiente) mientras el asesor atiende — antes esto
   * solo se limpiaba al derivar automáticamente o, como red de seguridad tardía, recién
   * al reactivar el bot vía liberarChat() (caso real detectado 2026-09-13: un admin
   * cambió a asesor a mitad de una cotización de prueba y, al volver a activar el bot,
   * una conversación nueva arrastró referencias a esa cotización vieja).
   */
  async pausarChatManual(ideWhcha: number): Promise<void> {
    await this.dataSource.pool.query(
      `UPDATE wha_chat SET bot_activo_whcha = FALSE, bot_modo_whcha = 'ASESOR' WHERE ide_whcha = $1`,
      [ideWhcha],
    );

    try {
      const activa = await this.dataSource.pool.query<{ ide_whbse: number }>(
        `SELECT ide_whbse FROM wha_bot_sesion WHERE ide_whcha = $1 AND activa = TRUE LIMIT 1`,
        [ideWhcha],
      );
      if (activa.rowCount > 0) {
        await this.botSession.cerrar(activa.rows[0].ide_whbse, BotState.CANCELADO);
      }
    } catch (err) {
      this.logger.warn(`[Bot] pausarChatManual: no se pudo cerrar sesión activa de chat ${ideWhcha}: ${err.message}`);
    }
  }

  async liberarChat(ideWhcha: number): Promise<void> {
    // Se lee el estado ANTES de tocarlo: la limpieza de sesión colgada de abajo solo
    // tiene sentido si el chat estaba en ASESOR — si ya estaba en BOT (llamada
    // redundante: doble clic, botón del front desactualizado, etc.) puede haber una
    // conversación real en curso, y cancelarla le borraría el progreso al cliente.
    const previo = await this.dataSource.pool.query<{ bot_activo_whcha: boolean }>(
      `SELECT bot_activo_whcha FROM wha_chat WHERE ide_whcha = $1`,
      [ideWhcha],
    );
    const estabaEnAsesor = previo.rows[0]?.bot_activo_whcha === false;

    await this.dataSource.pool.query(
      `UPDATE wha_chat SET bot_activo_whcha = TRUE, bot_modo_whcha = 'BOT' WHERE ide_whcha = $1`,
      [ideWhcha],
    );

    if (!estabaEnAsesor) return;

    // Red de seguridad: si quedó una sesión activa colgada en un estado no terminal
    // (de antes del fix en derivarAsesor, o de cualquier otro caso no previsto), se
    // cierra aquí también. Sin esto, iniciarConContextoChat() la encuentra y trata de
    // "adivinar" el contexto con GPT sobre una conversación abandonada en vez de
    // esperar en silencio el próximo mensaje real del cliente.
    try {
      const activa = await this.dataSource.pool.query<{ ide_whbse: number; estado: string }>(
        `SELECT ide_whbse, estado FROM wha_bot_sesion WHERE ide_whcha = $1 AND activa = TRUE LIMIT 1`,
        [ideWhcha],
      );
      if (activa.rowCount > 0) {
        this.logger.warn(`[Bot] liberarChat: sesión activa colgada (ide_whbse=${activa.rows[0].ide_whbse}, estado=${activa.rows[0].estado}) en chat ${ideWhcha} — se cierra`);
        await this.botSession.cerrar(activa.rows[0].ide_whbse, BotState.CANCELADO);
      }
    } catch (err) {
      this.logger.warn(`[Bot] liberarChat: no se pudo verificar/cerrar sesión colgada de chat ${ideWhcha}: ${err.message}`);
    }
  }

  /**
   * Al liberar un chat de vuelta al bot, lee los últimos mensajes del cliente,
   * analiza el contexto con GPT y envía una respuesta inteligente que retoma
   * la conversación donde quedó — sin mencionar que hubo un asesor.
   * Deja la sesión en ATENCION_LIBRE para responder mensajes siguientes normalmente.
   */
  async iniciarConContextoChat(ideWhcha: number): Promise<void> {
    try {
      // 1. Obtener datos del chat y la cuenta
      const chatRow = await this.dataSource.pool.query<{
        wa_id_whcha: string;
        phone_number_id_whcha: string;
        ide_whcue: number;
        ide_empr: number;
      }>(
        `SELECT c.wa_id_whcha, c.phone_number_id_whcha, cu.ide_whcue, cu.ide_empr
         FROM wha_chat c
         INNER JOIN wha_cuenta cu
           ON REPLACE(cu.id_telefono_whcue, '+', '') = c.phone_number_id_whcha
           AND cu.activo_whcue = TRUE
         WHERE c.ide_whcha = $1 LIMIT 1`,
        [ideWhcha],
      );
      if (!chatRow.rowCount) return;
      const { wa_id_whcha: waId, phone_number_id_whcha, ide_whcue: ideWhcue, ide_empr: ideEmpr } = chatRow.rows[0];

      // 2. Verificar ventana de 24h antes de intentar enviar
      const windowCheck = await this.ycloudWindowService.canSendFreeMessage(phone_number_id_whcha, waId);
      if (!windowCheck.allowed) {
        this.logger.log(`[Bot] iniciarConContextoChat: chat ${ideWhcha} fuera de ventana 24h — sin respuesta`);
        return;
      }

      // 3. Obtener últimos mensajes de texto del chat (más recientes primero, luego invertir)
      const msgResult = await this.dataSource.pool.query<{
        body_whmem: string;
        direction_whmem: string;
      }>(
        `SELECT body_whmem, direction_whmem
         FROM wha_mensaje
         WHERE ide_whcha = $1
           AND content_type_whmem = 'text'
           AND body_whmem IS NOT NULL
           AND TRIM(body_whmem) <> ''
         ORDER BY ide_whmem DESC
         LIMIT 15`,
        [ideWhcha],
      );
      if (!msgResult.rowCount) return;

      const msgs = msgResult.rows.reverse(); // orden cronológico: más antiguo primero

      // 4. Encontrar el último mensaje del cliente (direction_whmem = '0' → inbound)
      let lastClientIdx = -1;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (String(msgs[i].direction_whmem) === '0') { lastClientIdx = i; break; }
      }
      if (lastClientIdx === -1) return; // no hay mensajes del cliente

      const lastClientMsg = msgs[lastClientIdx].body_whmem;

      // Si la última sesión del chat terminó en FINALIZADO o CANCELADO, el bot no
      // debe re-saludar. El asesor estaba atendiendo; si lo libera, el bot simplemente
      // espera el próximo mensaje del cliente sin enviar nada.
      const lastSesionRow = await this.dataSource.pool.query<{ estado: string }>(
        `SELECT estado FROM wha_bot_sesion WHERE ide_whcha = $1 ORDER BY ide_whbse DESC LIMIT 1`,
        [ideWhcha],
      );
      const ultimoEstado = lastSesionRow.rows[0]?.estado;

      // Chat sin historial de bot → presentar el asistente
      if (!ultimoEstado) {
        const cfg = await this.botConfig.getConfig(ideWhcue);
        if (!cfg) return;
        const { sesion } = await this.botSession.getOrCreate(ideWhcha, ideWhcue);
        await this.handleInicio(
          waId, phone_number_id_whcha, ideWhcha, ideWhcue, ideEmpr, lastClientMsg,
          cfg.nombre_bot || 'QuimIA', cfg.nombre_empresa || 'la empresa',
          sesion, cfg,
        );
        return;
      }

      // Sesión anterior completada, cancelada o EXPIRADA por inactividad → el bot espera
      // el próximo mensaje sin re-saludar. EXPIRADO faltaba en esta lista: al reactivar
      // el bot horas después, el flujo caía al "retomar contexto" y resucitaba una
      // cotización abandonada a partir del último mensaje viejo del cliente (caso real:
      // preguntó la cantidad de CERA DE COCO de una sesión expirada 5 horas antes).
      if (ultimoEstado === BotState.FINALIZADO || ultimoEstado === BotState.CANCELADO || ultimoEstado === 'EXPIRADO') {
        this.logger.log(`[Bot] iniciarConContextoChat chat=${ideWhcha} — sesión anterior ${ultimoEstado}, sin re-saludo`);
        return;
      }

      // 5. Historial previo al último mensaje del cliente → contexto para GPT
      const historial: { role: 'user' | 'assistant'; content: string }[] = msgs
        .slice(0, lastClientIdx)
        .map((m) => ({
          role: (String(m.direction_whmem) === '0' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.body_whmem,
        }));

      // 6. Configuración del bot
      const config = await this.botConfig.getConfig(ideWhcue);
      const nombreBot = config?.nombre_bot || 'QuimIA';
      const nombreEmpresa = config?.nombre_empresa || 'la empresa';

      const promptBase = (config?.prompt_sistema || this.getPromptSistema(nombreBot, nombreEmpresa))
        .replace(/{BOT_NOMBRE}/g, nombreBot)
        .replace(/{NOMBRE_EMPRESA}/g, nombreEmpresa);

      // 7. Clasificar el último mensaje para dar respuesta inteligente
      const tipoConsulta = await this.botGpt.clasificarConsulta(lastClientMsg);

      // 7a. Preguntas de info: responder con template/GPT y liberar en ATENCION_LIBRE
      if (['UBICACION', 'HORARIO', 'ENVIO', 'CATALOGO'].includes(tipoConsulta)) {
        await this.responderInfo(ideEmpr, waId, tipoConsulta as any, nombreEmpresa, config);
        const { sesion } = await this.botSession.getOrCreate(ideWhcha, ideWhcue);
        if ([BotState.INICIO, BotState.ESPERANDO_CONFIRMACION].includes(sesion.estado as BotState)) {
          await this.botSession.update(sesion.ide_whbse, BotState.ATENCION_LIBRE, { ...sesion.datos_sesion, productos: [] });
        }
        this.logger.log(`[Bot] iniciarConContextoChat chat=${ideWhcha} — info ${tipoConsulta}`);
        return;
      }

      // 7b. Pregunta de producto: delega en manejarConsultaProductoClasica — el MISMO
      // flujo liviano que usa cualquier chat activo (chequeo de existencia/no-disponible,
      // link de catálogo público, cotización rápida sin la ceremonia de "agregar más/
      // FIN"). Antes este bloque delegaba en resolverColaProductos (la cadena del flujo
      // completo viejo: SELECCION_PRODUCTOS → posible CONFIRMACION_PRODUCTOS →
      // DATOS_ENVIO/DATOS_PAGO pidiendo dirección y forma de pago), así que un chat
      // reactivado después de 24h+ de silencio recibía una experiencia bastante más
      // pesada y distinta que un chat activo con el mismo mensaje — inconsistencia
      // detectada 2026-09-13 al auditar el flujo completo.
      if (tipoConsulta === 'PRODUCTO') {
        const { sesion } = await this.botSession.getOrCreate(ideWhcha, ideWhcue);
        const memoria = await this.botSession.getMemoriaCliente(ideWhcha);
        const tieneMemoria = !!(memoria?.cliente?.nombres);

        if (tieneMemoria) {
          // Nombre completo — la BD guarda "APELLIDOS NOMBRES", así que el primer token
          // es un apellido ("¡Hola de nuevo, JACOME!" sonaba mal).
          await this.sendText(ideEmpr, waId, `¡Hola de nuevo, *${memoria.cliente.nombres}*! 😊`);
        }

        const datosSesion: DatosSesion = {
          productos: [],
          ...(tieneMemoria ? { cliente: memoria.cliente as ClienteSesion, memoria_cargada: true } : {}),
          // Ciudad ya conocida de una sesión anterior — se lleva para no volver a
          // pedirla (mismo criterio de "una sola vez" ya aplicado en el resto del flujo
          // liviano; se había quedado afuera acá, a diferencia de la carga de memoria en
          // INICIO más arriba, que sí la copia).
          ...(memoria?.provincia ? { envio: { provincia: memoria.provincia } } : {}),
        };
        await this.botSession.update(sesion.ide_whbse, BotState.ATENCION_LIBRE, datosSesion);
        await this.manejarConsultaProductoClasica(
          waId, phone_number_id_whcha, ideWhcha, ideWhcue, ideEmpr, sesion, datosSesion, lastClientMsg, nombreEmpresa, config,
        );
        this.logger.log(`[Bot] iniciarConContextoChat chat=${ideWhcha} — PRODUCTO delegado a manejarConsultaProductoClasica`);
        return;
      }

      // 7c. GENERAL o producto no encontrado: GPT analiza historial y retoma conversación
      const respuesta = await this.botGpt.generateResponse(
        promptBase,
        historial,
        lastClientMsg,
        `Eres ${nombreBot} y acabas de retomar la atención de este chat. ` +
        `Responde al último mensaje del cliente de forma natural y cálida, basándote en el historial. ` +
        `Si el cliente hacía consultas, respóndelas. Si iniciaba una cotización, ofrece continuar. ` +
        `No menciones que hubo un asesor ni que hubo una pausa en la conversación. ` +
        `REGLA FIJA que prevalece sobre cualquier instrucción de cotización del prompt: NUNCA pidas correo ` +
        `electrónico ni dirección exacta de entrega — el sistema ya usa el correo de la empresa por defecto y solo ` +
        `pregunta la ciudad al final. Si hace falta pedir algo, pedí SOLO el producto y la cantidad. ` +
        `Al final recuerda amablemente: "_Puedes escribir *SALIR* en cualquier momento para hablar con un asesor 😊_"`,
      );

      await this.sendText(ideEmpr, waId, respuesta);

      // 8. Actualizar sesión a ATENCION_LIBRE para responder los siguientes mensajes normalmente
      const { sesion } = await this.botSession.getOrCreate(ideWhcha, ideWhcue);
      if ([BotState.INICIO, BotState.ESPERANDO_CONFIRMACION].includes(sesion.estado as BotState)) {
        await this.botSession.update(
          sesion.ide_whbse, BotState.ATENCION_LIBRE,
          { ...(sesion.datos_sesion || {}), productos: [] },
        );
      }

      this.logger.log(`[Bot] iniciarConContextoChat chat=${ideWhcha} — respuesta contextual enviada`);
    } catch (err) {
      this.logger.error(`[Bot] iniciarConContextoChat error chat=${ideWhcha}: ${err.message}`);
    }
  }

  /**
   * Feature "Responder con Bot" (chat en modo ASESOR): compone UNA respuesta propuesta
   * al último mensaje del cliente, para que un agente la revise antes de enviarla —
   * SIN ningún efecto secundario (no cambia bot_activo_whcha/bot_modo_whcha, no toca
   * wha_bot_sesion, no genera proformas). Reusa la misma clasificación que
   * iniciarConContextoChat, pero incluso para PRODUCTO responde en texto libre por GPT
   * en vez de correr manejarConsultaProductoClasica — ese flujo SÍ tiene efectos
   * secundarios reales (crea proformas, puede enviar un PDF), inapropiados para algo que
   * todavía es solo una propuesta de texto que el agente puede descartar.
   */
  async componerRespuestaAsistida(ideWhcha: number): Promise<
    { ok: true; respuesta: string; tipo: string } | { ok: false; motivo: string }
  > {
    const chatRow = await this.dataSource.pool.query<{
      wa_id_whcha: string; phone_number_id_whcha: string; ide_whcue: number; ide_empr: number;
    }>(
      `SELECT c.wa_id_whcha, c.phone_number_id_whcha, cu.ide_whcue, cu.ide_empr
       FROM wha_chat c
       INNER JOIN wha_cuenta cu
         ON REPLACE(cu.id_telefono_whcue, '+', '') = c.phone_number_id_whcha
         AND cu.activo_whcue = TRUE
       WHERE c.ide_whcha = $1 LIMIT 1`,
      [ideWhcha],
    );
    if (!chatRow.rowCount) return { ok: false, motivo: 'Chat no encontrado.' };
    const { wa_id_whcha: waId, phone_number_id_whcha, ide_whcue: ideWhcue, ide_empr: ideEmpr } = chatRow.rows[0];

    const windowCheck = await this.ycloudWindowService.canSendFreeMessage(phone_number_id_whcha, waId);
    if (!windowCheck.allowed) {
      return { ok: false, motivo: windowCheck.reason || 'Fuera de la ventana de 24h de WhatsApp — no se puede enviar texto libre.' };
    }

    const msgResult = await this.dataSource.pool.query<{ body_whmem: string; direction_whmem: string }>(
      `SELECT body_whmem, direction_whmem
       FROM wha_mensaje
       WHERE ide_whcha = $1
         AND content_type_whmem = 'text'
         AND body_whmem IS NOT NULL
         AND TRIM(body_whmem) <> ''
       ORDER BY ide_whmem DESC
       LIMIT 15`,
      [ideWhcha],
    );
    if (!msgResult.rowCount) return { ok: false, motivo: 'No hay mensajes de texto en este chat.' };
    const msgs = msgResult.rows.reverse();

    let lastClientIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (String(msgs[i].direction_whmem) === '0') { lastClientIdx = i; break; }
    }
    if (lastClientIdx === -1) return { ok: false, motivo: 'El cliente no tiene mensajes en este chat.' };
    const lastClientMsg = msgs[lastClientIdx].body_whmem;

    const config = await this.botConfig.getConfig(ideWhcue);
    const nombreBot = config?.nombre_bot || 'QuimIA';
    const nombreEmpresa = config?.nombre_empresa || 'la empresa';

    const tipoConsulta = await this.botGpt.clasificarConsulta(lastClientMsg);

    if (['UBICACION', 'HORARIO', 'ENVIO', 'CATALOGO'].includes(tipoConsulta)) {
      const texto = this.construirTextoInfo(tipoConsulta as any, nombreEmpresa, config);
      if (texto) return { ok: true, respuesta: texto, tipo: tipoConsulta };
    }

    const historial: { role: 'user' | 'assistant'; content: string }[] = msgs
      .slice(0, lastClientIdx)
      .map((m) => ({
        role: (String(m.direction_whmem) === '0' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.body_whmem,
      }));

    const promptBase = (config?.prompt_sistema || this.getPromptSistema(nombreBot, nombreEmpresa))
      .replace(/{BOT_NOMBRE}/g, nombreBot)
      .replace(/{NOMBRE_EMPRESA}/g, nombreEmpresa);

    const respuesta = await this.botGpt.generateResponse(
      promptBase,
      historial,
      lastClientMsg,
      `Eres ${nombreBot}. Un asesor humano te pidió ayuda para responder el último mensaje del cliente — vas a ` +
      `PROPONER una respuesta que el asesor va a revisar antes de enviarla, no la enviás vos directamente. ` +
      `Responde de forma natural y cálida, basándote en el historial. No inventes precios, stock ni datos de ` +
      `pedidos/trámites que no tengas — si el mensaje depende de eso, proponé una respuesta honesta que lo reconozca. ` +
      `No pidas correo electrónico ni dirección exacta de entrega — el sistema ya usa el correo de la empresa por ` +
      `defecto y solo pregunta la ciudad al final.`,
    );

    return { ok: true, respuesta, tipo: tipoConsulta };
  }

  /**
   * Envía la respuesta propuesta por componerRespuestaAsistida (o editada por el agente)
   * — sin tocar bot_activo_whcha/bot_modo_whcha, el chat se queda en ASESOR. Guardado:
   * solo funciona si el chat SIGUE en modo ASESOR al momento de enviar (pudo cambiar
   * entre que se generó el preview y que el agente confirma).
   */
  async enviarRespuestaAsistida(ideWhcha: number, mensaje: string): Promise<void> {
    const chatRow = await this.dataSource.pool.query<{
      wa_id_whcha: string; ide_empr: number; bot_modo_whcha: string;
    }>(
      `SELECT c.wa_id_whcha, cu.ide_empr, c.bot_modo_whcha
       FROM wha_chat c
       INNER JOIN wha_cuenta cu
         ON REPLACE(cu.id_telefono_whcue, '+', '') = c.phone_number_id_whcha
         AND cu.activo_whcue = TRUE
       WHERE c.ide_whcha = $1 LIMIT 1`,
      [ideWhcha],
    );
    if (!chatRow.rowCount) {
      throw new BadRequestException('Chat no encontrado.');
    }
    const { wa_id_whcha: waId, ide_empr: ideEmpr, bot_modo_whcha: botModo } = chatRow.rows[0];
    if (botModo !== 'ASESOR') {
      throw new BadRequestException('Este chat ya no está en modo ASESOR — la respuesta asistida solo aplica ahí.');
    }
    await this.sendText(ideEmpr, waId, mensaje);
  }

  /**
   * Responde cuando el bot no entiende el mensaje del usuario.
   * GPT analiza el texto en contexto y genera una respuesta natural
   * recordando al cliente que puede escribir SALIR para un asesor.
   */
  private async responderFallback(
    ideEmpr: number, waId: string,
    textoCliente: string,
    contextoFlujo: string,
    config: any,
    nombreBot: string,
    nombreEmpresa: string,
  ): Promise<void> {
    const promptBase = (config?.prompt_sistema || this.getPromptSistema(nombreBot, nombreEmpresa))
      .replace(/{BOT_NOMBRE}/g, nombreBot)
      .replace(/{NOMBRE_EMPRESA}/g, nombreEmpresa);

    const respuesta = await this.botGpt.generateResponse(
      promptBase, [], textoCliente,
      `${contextoFlujo} ` +
      `Responde de forma natural y cálida al mensaje del cliente. ` +
      `Si no puedes procesar su solicitud en este momento, guíalo de vuelta al flujo. ` +
      `No pidas correo electrónico ni dirección exacta de entrega — el sistema ya usa el correo de la empresa por ` +
      `defecto y solo pregunta la ciudad al final. ` +
      `Al final de tu respuesta agrega una línea: "_Recuerda que puedes escribir *SALIR* en cualquier momento para hablar con un asesor 😊_"`,
    );
    await this.sendText(ideEmpr, waId, respuesta);
  }

  private async sendText(ideEmpr: number, waId: string, texto: string): Promise<void> {
    // esBot=true → saveMessageSent marca es_bot_whmem=TRUE en el INSERT y no dispara
    // el hand-off a ASESOR (ese chequeo es solo para mensajes humanos).
    await this.ycloudService.sendText(ideEmpr, `+${waId}`, texto, undefined, undefined, true);
  }

  private async sendButtons(
    ideEmpr: number, waId: string, body: string,
    buttons: { id: string; title: string }[],
  ): Promise<void> {
    try {
      await this.ycloudService.sendInteractiveButtons(ideEmpr, `+${waId}`, body, buttons, true);
    } catch (btnErr) {
      this.logger.warn(`[Bot] sendInteractiveButtons falló: ${btnErr.message} — usando texto plano`);
      try {
        const opciones = buttons.map((b) => `*${b.title}*`).join(' o ');
        await this.sendText(ideEmpr, waId, `${body}\n\nResponde: ${opciones}`);
      } catch (txtErr) {
        this.logger.error(`[Bot] sendButtons fallback texto también falló: ${txtErr.message}`);
        throw txtErr;
      }
    }
  }
}
