import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { envs } from 'src/config/envs';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { FileTempService } from 'src/core/modules/sistema/files/file-temp.service';
import { NotificacionesService } from 'src/core/modules/sistema/notificaciones/notificaciones.service';

import { WhatsappGateway } from '../whatsapp.gateway';
import { YcloudWindowService } from '../ycloud/ycloud-window.service';
import { YcloudService } from '../ycloud/ycloud.service';

import { BotConfigService } from './bot-config.service';
import { BotGptService } from './bot-gpt.service';
import { BotProformaService } from './bot-proforma.service';
import { BotSessionService } from './bot-session.service';
import { BotToolsService } from './bot-tools.service';
import { ClienteSesion, DatosSesion, OpcionProducto, ProductoSesion } from './interfaces/bot-session.interface';
import { BotState } from './interfaces/bot-state.enum';

// ─── Constantes de negocio ────────────────────────────────────────────────────
const PALABRAS_ASESOR = /\bASESOR\b|\bAGENTE\b|\bHUMANO\b|\bPERSONA\b|\bVENDEDOR\b/i;
const REGEX_SALIR     = /^SALIR$/i;
const REGEX_SALUDO    = /^(hola|buenas?|buenos?\s*(d[ií]as?|tardes?|noches?)|saludos?|hey)[\s!.,]*$/i;

// Categorías que casi nunca están en el catálogo de materias primas (sabor/color/fragancia/aceite).
// Cuando la búsqueda coincide con esto, se evita el fallback difuso (evita falsos positivos tipo
// "de mango" → "MANTECA DE MANGO") y, si no hay match exacto, se ofrece cotizar como ítem genérico.
const REGEX_PRODUCTO_GENERICO = /\b(sabor(?:es|izantes?)?|colorantes?|colores?|fragancias?|aceites?|esencias?)\b/i;
const PRODUCTO_GENERICO_IDE_INARTI = 2102;


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

const MSG_ACUSE_LOTE = `Anotado ✅ Sigue agregando o escribe *FIN* cuando termines.`;

@Injectable()
export class BotService implements OnModuleInit {
  private readonly logger = new Logger(BotService.name);

  // Serializa el procesamiento de mensajes por chat: si dos mensajes del mismo
  // ideWhcha llegan casi al mismo tiempo (doble tap del cliente, reintento de
  // webhook, etc.), sin esto podían procesarse en paralelo — ambos leen la sesión
  // ANTES de que el primero termine de guardarla, y el segundo pisa el progreso
  // del primero (ej. texto_acumulado con el producto se perdía al mandar "FIN"
  // justo después). Con la cola, cada mensaje espera a que el anterior del mismo
  // chat termine de leer+procesar+guardar antes de empezar.
  private readonly chatLocks = new Map<number, Promise<void>>();

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly botConfig: BotConfigService,
    private readonly botSession: BotSessionService,
    private readonly botGpt: BotGptService,
    private readonly botTools: BotToolsService,
    private readonly botProforma: BotProformaService,
    private readonly ycloudService: YcloudService,
    private readonly ycloudWindowService: YcloudWindowService,
    private readonly gateway: WhatsappGateway,
    private readonly fileTempService: FileTempService,
    private readonly notificaciones: NotificacionesService,
  ) {}

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
    const anterior = this.chatLocks.get(ideWhcha) ?? Promise.resolve();
    const actual = anterior
      .catch(() => { /* un error en el mensaje anterior no debe bloquear la cola */ })
      .then(() => this.processMessageInternal(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, texto, botActivoWhcha));
    this.chatLocks.set(ideWhcha, actual);
    try {
      await actual;
    } finally {
      if (this.chatLocks.get(ideWhcha) === actual) {
        this.chatLocks.delete(ideWhcha);
      }
    }
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
    this.logger.log(`[Bot] processMessage waId=${waId} ideWhcha=${ideWhcha} ideWhcue=${ideWhcue} botActivoWhcha=${botActivoWhcha} texto="${texto}"`);

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
    let esChatNuevo = false;

    // Capa 1: ¿hay sesiones previas de bot para este chat?
    const sesionesPrevias = await this.dataSource.pool.query(
      `SELECT 1 FROM wha_bot_sesion WHERE ide_whcha = $1 LIMIT 1`,
      [ideWhcha],
    );
    if (sesionesPrevias.rowCount === 0) {
      // Capa 2: YCloud como fuente de verdad — ¿el número ha escrito antes?
      const yaEscribioAntes = await this.ycloudService.hasPriorMessages(waId);
      esChatNuevo = !yaEscribioAntes;
      this.logger.log(`[Bot] YCloud hasPriorMessages(${waId})=${yaEscribioAntes} → esChatNuevo=${esChatNuevo}`);
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

    if (!esChatNuevo) {
      if (!botActivoWhcha) { this.logger.warn(`[Bot] Chat ${ideWhcha} en modo ASESOR — bot no responde`); return; }

      const tieneAgenteHumano = await this.dataSource.pool.query(
        `SELECT 1 FROM wha_mensaje
         WHERE ide_whcha = $1
           AND direction_whmem = '1'
           AND (es_bot_whmem IS NULL OR es_bot_whmem = FALSE)
         LIMIT 1`,
        [ideWhcha],
      );
      if (tieneAgenteHumano.rowCount > 0) {
        this.logger.warn(`[Bot] Chat ${ideWhcha} tiene historial con agente humano — bot no responde`);
        return;
      }
    }

    const botActivo = await this.botConfig.isBotActive(ideWhcue);
    if (!esChatNuevo && !botActivo && !botActivoWhcha) { this.logger.warn(`[Bot] Bot global INACTIVO y chat sin override`); return; }

    this.logger.log(`[Bot] isBotActive(${ideWhcue})=${botActivo} | esChatNuevo=${esChatNuevo} | override por chat=${botActivoWhcha}`);

    // Detección global: SALIR (en cualquier estado)
    if (REGEX_SALIR.test(texto.trim())) {
      await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr,
        'Enseguida te comunico con uno de nuestros asesores comerciales 👤\nEspera un momento por favor 😊');
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
      BotState.SELECCION_PRODUCTOS, BotState.SELECCION_MULTIPLE, BotState.ESPERANDO_CANTIDAD,
      BotState.ESPERANDO_USO_PRODUCTO,
      BotState.CONFIRMACION_PRODUCTOS, BotState.DATOS_ENVIO, BotState.DATOS_PAGO,
      BotState.PREGUNTA_ES_CLIENTE, BotState.IDENTIFICACION, BotState.DATOS_NUEVO_CLIENTE,
      BotState.ATENCION_LIBRE,
    ];
    if (REGEX_SALUDO.test(texto.trim()) && estadosQueReinician.includes(sesion.estado as BotState)) {
      await this.botSession.cerrar(sesion.ide_whbse, BotState.CANCELADO);
      const { sesion: sesionNueva } = await this.botSession.getOrCreate(ideWhcha, ideWhcue);
      sesion = sesionNueva;
      this.logger.log(`[Bot] Saludo detectado en estado ${sesion.estado} → sesión reiniciada`);
    }

    try {
      switch (sesion.estado as BotState) {
        case BotState.INICIO:
          await this.handleInicio(waId, ideWhcue, ideEmpr, sesion.ide_whbse, texto, nombreBot, nombreEmpresa, sesion.datos_sesion as DatosSesion);
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
        case BotState.ESPERANDO_CANTIDAD:
          await this.handleEsperandoCantidad(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, nombreEmpresa, config);
          break;
        case BotState.ESPERANDO_USO_PRODUCTO:
          await this.handleEsperandoUsoProducto(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, nombreEmpresa, config);
          break;
        case BotState.CONFIRMACION_PRODUCTOS:
          await this.handleConfirmacionProductos(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, nombreEmpresa, config);
          break;
        case BotState.DATOS_ENVIO:
          await this.handleDatosEnvio(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, config);
          break;
        case BotState.DATOS_PAGO:
          await this.handleDatosPago(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, nombreBot, nombreEmpresa);
          break;
        case BotState.FINALIZADO:
          await this.handlePostCotizacion(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, nombreBot);
          break;
      }
    } catch (error) {
      this.logger.error(`BotService error [${sesion.estado}]: ${error.message}`, error.stack);
      const fallos = await this.botSession.incrementarFallo(sesion.ide_whbse);
      const maxFallos = config?.max_intentos_fallo ?? 3;
      if (fallos >= maxFallos) {
        await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr,
          'Tuve algunos inconvenientes procesando tu solicitud. Te comunico con un asesor para que te ayude 😊');
      }
    }
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────

  private async handleInicio(
    waId: string, ideWhcue: number, ideEmpr: number,
    ideWhbse: number, texto: string, nombreBot: string, nombreEmpresa: string, datosSesion: DatosSesion,
  ): Promise<void> {
    const datosActualizados: DatosSesion = {
      ...datosSesion,
      productos: datosSesion?.productos ?? [],
      texto_inicial: texto,
    };
    await this.botSession.update(ideWhbse, BotState.ESPERANDO_CONFIRMACION, datosActualizados);

    const nombreCliente = datosSesion?.cliente?.nombres;
    const saludo = nombreCliente
      ? `¡Hola de nuevo, *${nombreCliente}*! 😊 Soy *${nombreBot}* de *${nombreEmpresa}*.\n\n¿En qué te ayudo hoy?`
      : `¡Hola! Soy *${nombreBot}* 🤖, tu asistente en *${nombreEmpresa}*.\n\nCon gusto te ayudo con: 🧪 cotizaciones, 📦 catálogo y precios, 📍 ubicación y 🚚 envíos.\n\n¿Empezamos?`;

    await this.sendButtons(ideEmpr, waId, saludo, [
      { id: 'SI', title: '⚡ Continuar' },
      { id: 'NO', title: '👤 Hablar con asesor' },
    ]);
  }

  private async handleConfirmacion(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, nombreBot: string, nombreEmpresa: string, config: any,
  ): Promise<void> {
    const datos = sesion.datos_sesion as DatosSesion;

    // Detección por IDs de botón (respuestas exactas de WhatsApp) — sin GPT en este estado
    const t = texto.trim();
    const tUpper = t.toUpperCase();
    let intencion: string | null = null;

    if (tUpper === 'SI' || tUpper === 'NO') {
      intencion = tUpper === 'SI' ? 'CONFIRMAR' : 'CANCELAR';
    } else if (REGEX_SALIR.test(t)) {
      intencion = 'SALIR';
    } else if (PALABRAS_ASESOR.test(t)) {
      intencion = 'ASESOR';
    }

    // Solo usar GPT si no se detectó por botón/regex
    if (!intencion) {
      intencion = await this.botGpt.detectarIntencion(texto);
    }

    if (intencion === 'CANCELAR' || intencion === 'ASESOR') {
      await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr);
      await this.botSession.cerrar(sesion.ide_whbse, BotState.CANCELADO);
      return;
    }

    if (intencion === 'CONFIRMAR') {
      const textoInicial = datos?.texto_inicial || '';
      const tipoConsulta = await this.botGpt.clasificarConsulta(textoInicial);

      if (tipoConsulta === 'PRODUCTO') {
        if (datos.cliente?.nombres && datos.memoria_cargada) {
          const datosNuevos: DatosSesion = { ...datos, productos: [] };
          await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS, datosNuevos);
          // El mensaje inicial ya traía el producto (ej. "quiero 5kg cera de palma") —
          // se procesa de inmediato en vez de pedirlo de nuevo con el mensaje genérico.
          await this.procesarTextoProductos(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, datosNuevos, textoInicial, nombreEmpresa, config);
        } else {
          await this.sendButtons(ideEmpr, waId, MSG_ES_CLIENTE_BODY, BTN_ES_CLIENTE);
          await this.botSession.update(sesion.ide_whbse, BotState.PREGUNTA_ES_CLIENTE, datos);
        }
        return;
      }

      if (['UBICACION', 'HORARIO', 'ENVIO', 'CATALOGO'].includes(tipoConsulta)) {
        await this.responderInfo(ideEmpr, waId, tipoConsulta as any, nombreEmpresa, config);
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
      return;
    }

    // Cualquier otra respuesta → re-enviar los botones de elección
    await this.sendButtons(ideEmpr, waId,
      `Para poder ayudarte, primero selecciona una opción por favor 😊`,
      [
        { id: 'SI', title: '✅ Continuar con bot' },
        { id: 'NO', title: '👤 Hablar con asesor' },
      ],
    );
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
      return;
    }

    if (tipoConsulta === 'PRODUCTO') {
      if (datos.cliente?.nombres && datos.memoria_cargada) {
        const datosNuevos: DatosSesion = { ...datos, productos: [] };
        await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS, datosNuevos);
        // El mensaje ya traía el producto (ej. "quiero 5kg cera de palma") — se procesa
        // de inmediato en vez de pedirlo de nuevo con el mensaje genérico.
        await this.procesarTextoProductos(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, datosNuevos, texto, nombreEmpresa, config);
      } else {
        try {
          await this.sendButtons(ideEmpr, waId, MSG_ES_CLIENTE_BODY, BTN_ES_CLIENTE);
        } catch (e) {
          this.logger.error(`[Bot] sendButtons lanzó excepción: ${e.message}`);
          throw e;
        }
        await this.botSession.update(sesion.ide_whbse, BotState.PREGUNTA_ES_CLIENTE, datos);
      }
      return;
    }

    // GENERAL: GPT responde con el contexto completo de la empresa
    const historial = await this.botSession.getHistorialMensajes(ideWhcha, 6);
    const promptBase = (config.prompt_sistema || this.getPromptSistema(nombreBot, nombreEmpresa))
      .replace(/{BOT_NOMBRE}/g, nombreBot)
      .replace(/{NOMBRE_EMPRESA}/g, nombreEmpresa);
    const respuesta = await this.botGpt.generateResponse(
      promptBase,
      historial,
      texto,
      `Empresa: ${nombreEmpresa}. Usa la información del sistema para responder. ` +
      `Si la pregunta es sobre ubicación, sucursales, horarios o envíos, responde basándote en los datos del prompt.`,
    );
    await this.sendText(ideEmpr, waId, respuesta);
  }

  private async handlePreguntaEsCliente(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string,
  ): Promise<void> {
    const datos = sesion.datos_sesion as DatosSesion;

    // Los botones devuelven el ID directamente
    const t = texto.trim().toUpperCase();
    let esCliente = t === 'SI_CLIENTE' || /^(SI|SÍ|S[Ii]|YES|YA|YA COMPRÉ)$/i.test(t);
    let esNuevo   = t === 'NO_CLIENTE' || /^(NO|NUNCA|NUEVO|PRIMERA)$/i.test(t);

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
      if (nuevosDatos.producto_pendiente) {
        const prod = nuevosDatos.producto_pendiente;
        await this.botSession.update(sesion.ide_whbse, BotState.ESPERANDO_CANTIDAD, nuevosDatos);
        await this.sendText(ideEmpr, waId,
          `¡Qué gusto verte de nuevo, *${cliente.nombres}*! 😊\n\n` +
          `Encontré: *${prod.nombre}* ✅\n\n` +
          `¿Qué cantidad necesitas? _(Ejemplo: 5 ${prod.nombre_unidad} / 2.5 ${prod.siglas_unidad})_`,
        );
      } else if (nuevosDatos.productos?.length > 0) {
        // Tenía productos acumulados antes de identificarse → ir directo a confirmación
        await this.botSession.update(sesion.ide_whbse, BotState.CONFIRMACION_PRODUCTOS, nuevosDatos);
        await this.sendButtons(ideEmpr, waId,
          `¡Qué gusto verte de nuevo, *${cliente.nombres}*! 😊\n\n${this.buildResumenProductos(nuevosDatos.productos)}`,
          [{ id: 'CONF_SI', title: '✅ Confirmar pedido' }, { id: 'CONF_NO', title: '✏️ Modificar lista' }],
        );
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
      const nombres = texto.trim();
      if (nombres.length < 3) {
        await this.sendText(ideEmpr, waId, `Por favor ingresa tu nombre completo 😊`);
        return;
      }
      const nuevosDatos: DatosSesion = {
        ...datos,
        productos: datos.productos ?? [],
        cliente: { ...cliente, nombres, pendiente_campo: 'correo' },
      };
      await this.botSession.update(sesion.ide_whbse, BotState.DATOS_NUEVO_CLIENTE, nuevosDatos);
      await this.sendText(ideEmpr, waId,
        `Gracias, *${nombres.split(' ')[0]}* 😊 ¿Cuál es tu *correo electrónico* para enviarte la cotización? 📧`,
      );
      return;
    }

    if (cliente.pendiente_campo === 'correo') {
      const correo = texto.trim().toLowerCase();
      if (!correo.includes('@') || !correo.includes('.')) {
        await this.sendText(ideEmpr, waId, `Ese correo no parece válido 🤔 Por favor ingresa un correo electrónico correcto.`);
        return;
      }
      const nuevosDatos: DatosSesion = {
        ...datos,
        productos: datos.productos ?? [],
        cliente: { ...cliente, correo, pendiente_campo: undefined },
      };
      if (nuevosDatos.producto_pendiente) {
        const prod = nuevosDatos.producto_pendiente;
        await this.botSession.update(sesion.ide_whbse, BotState.ESPERANDO_CANTIDAD, nuevosDatos);
        await this.sendText(ideEmpr, waId,
          `¡Todo listo, *${cliente.nombres.split(' ')[0]}*! 😊\n\n` +
          `Encontré: *${prod.nombre}* ✅\n\n` +
          `¿Qué cantidad necesitas? _(Ejemplo: 5 ${prod.nombre_unidad} / 2.5 ${prod.siglas_unidad})_`,
        );
      } else if (nuevosDatos.productos?.length > 0) {
        // Tenía productos acumulados antes de registrarse → ir directo a confirmación
        await this.botSession.update(sesion.ide_whbse, BotState.CONFIRMACION_PRODUCTOS, nuevosDatos);
        await this.sendButtons(ideEmpr, waId,
          `¡Todo listo, *${cliente.nombres.split(' ')[0]}*! 😊\n\n${this.buildResumenProductos(nuevosDatos.productos)}`,
          [{ id: 'CONF_SI', title: '✅ Confirmar pedido' }, { id: 'CONF_NO', title: '✏️ Modificar lista' }],
        );
      } else {
        await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS, nuevosDatos);
        await this.sendText(ideEmpr, waId,
          `¡Todo listo, *${cliente.nombres.split(' ')[0]}*! 😊\n\n${MSG_INICIO_COTIZACION}`,
        );
      }
      return;
    }
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
          `Espero haber resuelto tu consulta 😊\n\n¿Continuamos? Dime el producto o escribe *FIN* para revisar tu pedido.`,
        );
        return;
      }
    }

    if (!completo) {
      const nuevosDatos: DatosSesion = { ...datos, texto_acumulado: textoAcumulado };
      await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS, nuevosDatos);
      await this.sendText(ideEmpr, waId, MSG_ACUSE_LOTE);
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
   * Drena la cola de productos extraídos en lote: busca cada ítem en catálogo y
   * lo agrega directo cuando hay match único + cantidad conocida (sin preguntar nada).
   * Se detiene y pide al cliente solo cuando algo realmente lo requiere
   * (desambiguar entre varios productos, pedir cantidad, o preguntar el uso de un
   * producto de categoría genérica no catalogada).
   */
  private async resolverColaProductos(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, datos: DatosSesion, nombreEmpresa: string, config: any,
  ): Promise<void> {
    const cola = [...(datos.cola_productos ?? [])];
    const productosNuevos: ProductoSesion[] = [...(datos.productos ?? [])];
    const noEncontrados: string[] = [];

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

      // Los fallbacks difusos (reducción progresiva y por palabras) solo se intentan
      // cuando NO es una categoría genérica — para sabor/color/aceite/etc. queremos
      // una búsqueda estricta: si no matchea exacto, se trata como no encontrado.
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
        if (esGenerico) {
          const generico = await this.botTools.obtenerProductoPorId(PRODUCTO_GENERICO_IDE_INARTI, ideEmpr);
          const nuevosDatos: DatosSesion = {
            ...datos,
            productos: productosNuevos,
            cola_productos: cola,
            item_cantidad_conocida: item.cantidad,
            producto_pendiente: {
              ide_inarti: generico?.ide_inarti ?? PRODUCTO_GENERICO_IDE_INARTI,
              nombre: nombreItem,
              siglas_unidad: generico?.siglas_unidad ?? 'UND',
              nombre_unidad: generico?.nombre_unidad ?? 'Unidad',
              en_catalogo: generico?.en_catalogo ?? false,
              es_generico: true,
            },
          };
          await this.botSession.update(sesion.ide_whbse, BotState.ESPERANDO_USO_PRODUCTO, nuevosDatos);
          await this.sendText(ideEmpr, waId,
            `Para cotizar *${nombreItem}*, cuéntame ¿para qué uso lo necesitas? 😊`,
          );
          return;
        }
        this.logger.log(`[Bot] No encontrado en cola: "${nombreItem}"`);
        noEncontrados.push(nombreItem);
        continue;
      }

      if (resultados.length === 1) {
        const prod = resultados[0];
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
        const nuevosDatos: DatosSesion = {
          ...datos,
          productos: productosNuevos,
          cola_productos: cola,
          producto_pendiente: {
            ide_inarti: prod.ide_inarti,
            nombre: this.displayNombreProducto(prod),
            siglas_unidad: prod.siglas_unidad,
            nombre_unidad: prod.nombre_unidad,
            en_catalogo: prod.en_catalogo,
          },
        };
        await this.botSession.update(sesion.ide_whbse, BotState.ESPERANDO_CANTIDAD, nuevosDatos);
        await this.sendText(ideEmpr, waId,
          `Encontré: *${this.displayNombreProducto(prod)}* ✅\n\n` +
          `¿Qué cantidad necesitas? _(Ejemplo: 5 ${prod.nombre_unidad} / 2.5 ${prod.siglas_unidad})_`,
        );
        return;
      }

      // Varios resultados → desambiguar con lista numerada
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
      };
      await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_MULTIPLE, nuevosDatos);
      const listaTexto = opciones.map(
        (o) => `*${o.numero}.* ${this.displayNombreProducto(o)}`,
      ).join('\n');
      await this.sendText(ideEmpr, waId,
        `Encontré ${opciones.length} productos que coinciden 🔍\n\n${listaTexto}\n\n_Responde solo con el número (1 al ${opciones.length})._`,
      );
      return;
    }

    // Cola vacía → cerrar la captura de productos
    const nuevosDatos: DatosSesion = {
      ...datos,
      productos: productosNuevos,
      cola_productos: undefined,
      item_cantidad_conocida: undefined,
    };
    if (noEncontrados.length) {
      await this.sendText(ideEmpr, waId,
        `No encontré en catálogo: ${noEncontrados.join(', ')} — nuestro asesor puede confirmarte disponibilidad 😊`,
      );
    }
    await this.finalizarColeccionProductos(ideEmpr, waId, sesion, nuevosDatos);
  }

  /** Cierra la etapa de captura de productos: pide datos del cliente si faltan, o pasa a confirmación. */
  private async finalizarColeccionProductos(
    ideEmpr: number, waId: string, sesion: any, datos: DatosSesion,
  ): Promise<void> {
    if (!datos.cliente?.nombres) {
      await this.botSession.update(sesion.ide_whbse, BotState.PREGUNTA_ES_CLIENTE, datos);
      await this.sendButtons(ideEmpr, waId,
        `${this.buildResumenProductos(datos.productos)}\n\nPara preparar tu cotización, necesito unos datos rápidos 😊\n\n${MSG_ES_CLIENTE_BODY}`,
        BTN_ES_CLIENTE,
      );
      return;
    }
    await this.botSession.update(sesion.ide_whbse, BotState.CONFIRMACION_PRODUCTOS, datos);
    await this.sendButtons(ideEmpr, waId, this.buildResumenProductos(datos.productos), [
      { id: 'CONF_SI', title: '✅ Confirmar pedido' },
      { id: 'CONF_NO', title: '✏️ Modificar lista' },
    ]);
  }

  private async handleSeleccionMultiple(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, nombreEmpresa: string, config: any,
  ): Promise<void> {
    const datos = sesion.datos_sesion as DatosSesion;

    // Consulta informativa mid-cotización
    const tipoInfo = await this.botGpt.clasificarConsulta(texto);
    if (['UBICACION', 'HORARIO', 'ENVIO', 'CATALOGO'].includes(tipoInfo)) {
      await this.responderInfo(ideEmpr, waId, tipoInfo as any, nombreEmpresa, config);
      await this.sendText(ideEmpr, waId, `¿Continuamos? Responde con el *número* del producto que necesitas.`);
      return;
    }

    const num = parseInt(texto.trim(), 10);

    if (isNaN(num) || num < 1 || num > (datos.opciones_producto?.length ?? 0)) {
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

    const nuevosDatos: DatosSesion = {
      ...datos,
      opciones_producto: undefined,
      producto_pendiente: {
        ide_inarti: opcion.ide_inarti,
        nombre: this.displayNombreProducto(opcion),
        siglas_unidad: opcion.siglas_unidad,
        nombre_unidad: opcion.nombre_unidad,
        en_catalogo: opcion.en_catalogo,
      },
    };
    await this.botSession.update(sesion.ide_whbse, BotState.ESPERANDO_CANTIDAD, nuevosDatos);
    await this.sendText(ideEmpr, waId,
      `¡Seleccionaste: *${this.displayNombreProducto(opcion)}*! ✅\n\n` +
      `¿Qué cantidad necesitas? _(Ejemplo: 5 ${opcion.nombre_unidad} / 2.5 ${opcion.siglas_unidad})_`,
    );
  }

  private async handleEsperandoCantidad(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, nombreEmpresa: string, config: any,
  ): Promise<void> {
    const datos = sesion.datos_sesion as DatosSesion;
    const prod = datos.producto_pendiente;

    // Consulta informativa mid-cotización
    const tipoInfo = await this.botGpt.clasificarConsulta(texto);
    if (['UBICACION', 'HORARIO', 'ENVIO', 'CATALOGO'].includes(tipoInfo)) {
      await this.responderInfo(ideEmpr, waId, tipoInfo as any, nombreEmpresa, config);
      await this.sendText(ideEmpr, waId,
        `¿Continuamos? Indica la cantidad de *${prod?.nombre}* que necesitas.`,
      );
      return;
    }

    // Intenta extraer número con regex; si falla, GPT intenta interpretar lenguaje natural
    const cantidadMatch = texto.trim().match(/(\d+(?:[.,]\d+)?)/);
    let cantidad: number | null = cantidadMatch ? parseFloat(cantidadMatch[1].replace(',', '.')) : null;

    if (!cantidad || cantidad <= 0) {
      cantidad = await this.botGpt.extraerCantidad(texto);
    }

    if (!cantidad || cantidad <= 0) {
      await this.responderFallback(
        ideEmpr, waId, texto,
        `El cliente está cotizando *${prod?.nombre}*. Debe indicar la cantidad que necesita (número). ` +
        `Pídele amablemente la cantidad con un ejemplo concreto según la unidad: ${prod?.nombre_unidad}.`,
        config, config?.nombre_bot || 'Asistente', nombreEmpresa,
      );
      return;
    }

    const nuevoProducto: ProductoSesion = {
      ide_inarti: prod.ide_inarti,
      nombre: prod.nombre,
      cantidad,
      unidad: prod.nombre_unidad,
      siglas_unidad: prod.siglas_unidad,
      en_catalogo: prod.en_catalogo,
      uso_generico: prod.uso_generico,
    };

    const nuevosDatos: DatosSesion = {
      ...datos,
      productos: [...(datos.productos ?? []), nuevoProducto],
      producto_pendiente: undefined,
      item_cantidad_conocida: undefined,
    };

    await this.resolverColaProductos(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, nuevosDatos, nombreEmpresa, config);
  }

  private async handleEsperandoUsoProducto(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, nombreEmpresa: string, config: any,
  ): Promise<void> {
    const datos = sesion.datos_sesion as DatosSesion;
    const prod = datos.producto_pendiente;

    if (!prod) {
      await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS, { ...datos, producto_pendiente: undefined });
      await this.sendText(ideEmpr, waId, MSG_INICIO_COTIZACION);
      return;
    }

    const prodConUso = { ...prod, uso_generico: texto.trim() };
    const cantidadConocida = datos.item_cantidad_conocida;

    // Si GPT ya había detectado la cantidad, se agrega directo sin volver a preguntar.
    if (cantidadConocida !== null && cantidadConocida !== undefined) {
      const nuevosDatos: DatosSesion = {
        ...datos,
        producto_pendiente: undefined,
        item_cantidad_conocida: undefined,
        productos: [...(datos.productos ?? []), {
          ide_inarti: prodConUso.ide_inarti,
          nombre: prodConUso.nombre,
          cantidad: cantidadConocida,
          unidad: prodConUso.nombre_unidad,
          siglas_unidad: prodConUso.siglas_unidad,
          en_catalogo: prodConUso.en_catalogo,
          uso_generico: prodConUso.uso_generico,
        }],
      };
      await this.resolverColaProductos(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, nuevosDatos, nombreEmpresa, config);
      return;
    }

    const nuevosDatos: DatosSesion = { ...datos, producto_pendiente: prodConUso };
    await this.botSession.update(sesion.ide_whbse, BotState.ESPERANDO_CANTIDAD, nuevosDatos);
    await this.sendText(ideEmpr, waId,
      `¿Qué cantidad de *${prodConUso.nombre}* necesitas? _(Ejemplo: 5 KG, o escribe "cantidad mínima")_`,
    );
  }

  private async handleConfirmacionProductos(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, nombreEmpresa: string, config: any,
  ): Promise<void> {
    const datos = sesion.datos_sesion as DatosSesion;
    const t = texto.trim().toUpperCase();

    // Consulta informativa mid-cotización
    const tipoInfoConf = await this.botGpt.clasificarConsulta(texto);
    if (['UBICACION', 'HORARIO', 'ENVIO', 'CATALOGO'].includes(tipoInfoConf)) {
      await this.responderInfo(ideEmpr, waId, tipoInfoConf as any, nombreEmpresa, config);
      await this.sendButtons(ideEmpr, waId, `¿Confirmamos tu pedido?`, [
        { id: 'CONF_SI', title: '✅ Confirmar pedido' },
        { id: 'CONF_NO', title: '✏️ Modificar lista' },
      ]);
      return;
    }

    const confirma = t === 'CONF_SI' || (await this.botGpt.detectarIntencion(texto)) === 'CONFIRMAR';
    const modifica = t === 'CONF_NO' || (await this.botGpt.detectarIntencion(texto)) === 'CANCELAR';

    if (PALABRAS_ASESOR.test(texto)) {
      await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr);
      await this.botSession.cerrar(sesion.ide_whbse, BotState.CANCELADO);
      return;
    }

    if (modifica) {
      const nuevosDatos: DatosSesion = { ...datos, productos: [] };
      await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS, nuevosDatos);
      await this.sendText(ideEmpr, waId, `Por supuesto, empecemos de nuevo 😊\n\n${MSG_INICIO_COTIZACION}`);
      return;
    }

    if (confirma) {
      const provinciaMemoria  = datos.envio?.provincia;
      const dirRegistrada     = datos.cliente?.direccion_registrada;

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
            { id: 'ENV_MISMO',   title: '✅ Sí, son correctos' },
            { id: 'ENV_CAMBIAR', title: '📝 Cambiar dirección' },
          ],
        );
      } else {
        const nuevosDatos: DatosSesion = { ...datos, envio: { pendiente_campo: 'tipo_direccion' } };
        await this.botSession.update(sesion.ide_whbse, BotState.DATOS_ENVIO, nuevosDatos);
        await this.sendButtons(ideEmpr, waId,
          `Necesito la dirección de entrega. ¿Cómo prefieres indicármela?`,
          [
            { id: 'DIR_TEXTO',     title: '📝 Escribir dirección' },
            { id: 'DIR_UBICACION', title: '📍 Mi ubicación' },
          ],
        );
      }
      return;
    }

    await this.sendButtons(ideEmpr, waId, this.buildResumenProductos(datos.productos), [
      { id: 'CONF_SI', title: '✅ Confirmar pedido' },
      { id: 'CONF_NO', title: '✏️ Modificar lista' },
    ]);
  }

  private async handleDatosEnvio(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, config: any,
  ): Promise<void> {
    const datos = sesion.datos_sesion as DatosSesion;
    const envio = datos.envio ?? {};

    // Paso -1 — confirmación de datos de envío guardados (provincia + dirección)
    if (envio.pendiente_campo === 'confirmar_envio_guardado') {
      const t = texto.trim().toUpperCase();
      if (t === 'ENV_MISMO') {
        // Usar provincia y dirección guardadas → ir directo a pago
        const dir = datos.cliente?.direccion_registrada || envio.direccion || '';
        await this.botSession.update(sesion.ide_whbse, BotState.DATOS_PAGO,
          { ...datos, envio: { ...envio, direccion: dir || undefined, pendiente_campo: undefined } });
        await this.sendButtons(ideEmpr, waId, `¿Cuál es tu forma de pago preferida? 💳`, [
          { id: 'PAGO_EFECTIVO', title: '💵 Efectivo' },
          { id: 'PAGO_TARJETA',  title: '💳 Tarjeta de crédito' },
        ]);
        return;
      }
      // Quiere cambiar → flujo normal
      await this.botSession.update(sesion.ide_whbse, BotState.DATOS_ENVIO,
        { ...datos, envio: { pendiente_campo: 'tipo_direccion' } });
      await this.sendButtons(ideEmpr, waId,
        `¿Cómo prefieres indicar la nueva dirección?`,
        [
          { id: 'DIR_TEXTO',     title: '📝 Escribir dirección' },
          { id: 'DIR_UBICACION', title: '📍 Mi ubicación' },
        ],
      );
      return;
    }

    // Paso 0 — cliente con dirección registrada: ¿usarla o no?
    if (envio.pendiente_campo === 'usar_direccion_existente') {
      const t = texto.trim().toUpperCase();
      if (t === 'USAR_DIR_SI') {
        const dir = datos.cliente?.direccion_registrada || '';
        await this.botSession.update(sesion.ide_whbse, BotState.DATOS_ENVIO,
          { ...datos, envio: { ...envio, direccion: dir, pendiente_campo: 'provincia' } });
        await this.sendText(ideEmpr, waId, `Perfecto, usaremos esa dirección 📍\n\n¿En qué *provincia* te encuentras? 🗺️`);
        return;
      }
      if (t === 'USAR_DIR_NO') {
        await this.botSession.update(sesion.ide_whbse, BotState.DATOS_ENVIO,
          { ...datos, envio: { ...envio, pendiente_campo: 'tipo_direccion' } });
        await this.sendButtons(ideEmpr, waId,
          `¿Cómo prefieres indicar la nueva dirección de entrega?`,
          [
            { id: 'DIR_TEXTO',     title: '📝 Escribir dirección' },
            { id: 'DIR_UBICACION', title: '📍 Mi ubicación' },
          ],
        );
        return;
      }
      // Respuesta no reconocida → repetir
      await this.sendButtons(ideEmpr, waId,
        `Por favor selecciona una opción 😊`,
        [
          { id: 'USAR_DIR_SI',  title: '✅ Sí, usar esta' },
          { id: 'USAR_DIR_NO',  title: '📝 Ingresar otra' },
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
          `Por favor escribe tu *dirección completa* y un *punto de referencia* 📝\n\n_Ejemplo: Av. Los Shyris N35-150 y Suecia, Quito. Referencia: frente al Parque del Arbolito_`,
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
      // Si escribió algo libre, tomarlo como dirección directamente
      await this.botSession.update(sesion.ide_whbse, BotState.DATOS_ENVIO,
        { ...datos, envio: { ...envio, direccion: texto.trim(), pendiente_campo: 'provincia' } });
      await this.sendText(ideEmpr, waId, `¿En qué *provincia* te encuentras? 🗺️`);
      return;
    }

    // Paso 2a — dirección escrita
    if (envio.pendiente_campo === 'direccion_texto') {
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
      // Si escribió texto en lugar de compartir ubicación, tomarlo como dirección
      await this.botSession.update(sesion.ide_whbse, BotState.DATOS_ENVIO,
        { ...datos, envio: { ...envio, direccion: texto.trim(), pendiente_campo: 'provincia' } });
      await this.sendText(ideEmpr, waId, `¿En qué *provincia* te encuentras? 🗺️`);
      return;
    }

    // Paso 3 — provincia → directo a pago (sin transporte)
    if (envio.pendiente_campo === 'provincia') {
      await this.botSession.update(sesion.ide_whbse, BotState.DATOS_PAGO,
        { ...datos, envio: { ...envio, provincia: texto.trim(), pendiente_campo: undefined } });
      await this.sendButtons(ideEmpr, waId, `¿Cuál es tu forma de pago preferida? 💳`, [
        { id: 'PAGO_EFECTIVO', title: '💵 Efectivo' },
        { id: 'PAGO_TARJETA',  title: '💳 Tarjeta de crédito' },
      ]);
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

    if (t === 'PAGO_EFECTIVO' || /EFECTIVO|CASH|\bEFE\b|BILLETES?|DINERO\s*EN\s*EFECTIVO/.test(t)) formaPago = 'cash';
    else if (t === 'PAGO_TARJETA' || /TARJETA|CR[EÉ]DITO|D[EÉ]BITO|CARD|VISA|MASTERCARD/.test(t)) formaPago = 'credit';
    // Casos comunes: transferencia / depósito → tratados como efectivo (coordinan aparte)
    else if (/TRANSFER|DEP[OÓ]SITO|DEPOSITO|BANCO|CHEQUE/.test(t)) formaPago = 'cash';

    if (!formaPago) {
      await this.sendButtons(ideEmpr, waId, `💳 ¿Cuál es tu forma de pago preferida?`, [
        { id: 'PAGO_EFECTIVO', title: '💵 Efectivo' },
        { id: 'PAGO_TARJETA',  title: '💳 Tarjeta de crédito' },
      ]);
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
        const tarifa0    = resultado.baseTarifa0  ?? 0;
        const iva        = resultado.valorIva     ?? 0;
        const totalFinal = resultado.total        ?? 0;
        const pctIva     = resultado.tarifaIva    ?? 15;

        // Enviar PDF como documento usando link público (evita upload a YCloud que falla)
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
          );
          this.logger.log(`[Bot] PDF enviado como documento link: ${pdfUrl}`);
          // Notificar a agentes via socket que se generó una proforma automática
          this.gateway.emitNuevaProformaBot(
            ideWhcue, resultado.secuencial, nuevosDatos.cliente?.nombres || waId,
          );
        } catch (pdfErr) {
          this.logger.error(`Error enviando PDF: ${pdfErr.message}`);
        }

        const lineas = [
          `✅ *¡Tu cotización #${resultado.secuencial} está lista!* 🎉\n`,
          ...(tarifa0 > 0 ? [`📋 Subtotal tarifa 0%:  *$${tarifa0.toFixed(2)}*`] : []),
          `📋 Subtotal gravado:    *$${baseSinIva.toFixed(2)}*`,
          `📋 IVA ${pctIva}%:             *$${iva.toFixed(2)}*`,
          `💰 *Total:               $${totalFinal.toFixed(2)}*`,
          ``,
          `📄 Adjuntamos tu cotización en PDF con el detalle completo.`,
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
            { id: 'HABLAR_ASESOR',    title: '👤 Hablar con asesor' },
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
          `*¡Gracias por contactarnos!* 🧪`,
        );
        // null = ya se envió mensaje al cliente; msgAsesor = nota interna solo para log/asesor
        await this.botSession.cerrar(sesion.ide_whbse, BotState.FINALIZADO);
        await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, null, msgAsesor);
      }
    } catch (err) {
      this.logger.error(`Error creando proforma: ${err.message}`);
      await this.sendText(ideEmpr, waId,
        `Hubo un inconveniente al generar tu cotización 😔\nUn asesor te contactará en breve para ayudarte.`,
      );
      await this.botSession.cerrar(sesion.ide_whbse, BotState.FINALIZADO);
      await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr);
    }
    // CASO 1 (automático): la sesión queda ACTIVA+FINALIZADO para que handlePostCotizacion
    // recoja el siguiente mensaje (HABLAR_ASESOR / NUEVA_COTIZACION) sin crear una sesión nueva.
  }

  private async handlePostCotizacion(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, nombreBot: string,
  ): Promise<void> {
    const t = texto.trim().toUpperCase();

    if (t === 'NUEVA_COTIZACION' || /NUEVA|COTIZAR|OTRO PRODUCTO|OTRA COTIZ/i.test(texto)) {
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
        await this.botSession.update(nuevaSesion.ide_whbse, BotState.SELECCION_PRODUCTOS, nuevosDatos);
        await this.sendText(ideEmpr, waId,
          `¡Con gusto! 😊\n\n${MSG_INICIO_COTIZACION}`,
        );
        return;
      }

      await this.botSession.update(nuevaSesion.ide_whbse, BotState.PREGUNTA_ES_CLIENTE,
        { productos: [], texto_inicial: '' });
      await this.sendButtons(ideEmpr, waId, `¡Con gusto! 😊 ¿Eres cliente registrado con nosotros?`, [
        { id: 'SI_CLIENTE', title: '✅ Sí, soy cliente' },
        { id: 'NO_CLIENTE', title: '❌ No' },
      ]);
      return;
    }

    if (t === 'HABLAR_ASESOR' || PALABRAS_ASESOR.test(texto)) {
      // Cerrar sesión antes de derivar para evitar re-procesos
      await this.botSession.cerrar(sesion.ide_whbse, BotState.FINALIZADO);
      await this.sendText(ideEmpr, waId,
        `Con mucho gusto 😊 En breve uno de nuestros asesores comerciales se pondrá en contacto contigo.\n\n¡Que tengas un excelente día! 🌟`,
      );
      // null = no enviar mensaje adicional al cliente (ya lo enviamos arriba)
      await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr,
        null, `Cliente solicitó asesor tras recibir cotización.`,
      );
      return;
    }

    // Cualquier otro mensaje → responder amablemente y repetir opciones
    await this.sendButtons(ideEmpr, waId,
      `¡Gracias por tu mensaje! 😊 ¿Puedo ayudarte con algo más?`,
      [
        { id: 'NUEVA_COTIZACION', title: '🛒 Nueva cotización' },
        { id: 'HABLAR_ASESOR',    title: '👤 Hablar con asesor' },
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
  private async responderInfo(
    ideEmpr: number, waId: string,
    tipo: 'UBICACION' | 'HORARIO' | 'ENVIO' | 'CATALOGO',
    nombreEmpresa: string,
    config: any,
  ): Promise<void> {
    const nombreBot = config?.nombre_bot || 'Asistente';

    // Columnas dedicadas en DB — fuente de verdad, sin parseo de texto
    const colMap: Record<string, string | null> = {
      UBICACION: config?.resp_ubicacion ?? null,
      HORARIO:   config?.resp_horario   ?? null,
      ENVIO:     config?.resp_envio     ?? null,
      CATALOGO:  config?.resp_catalogo  ?? null,
    };
    const template = colMap[tipo] ?? null;

    if (!template) {
      this.logger.warn(`[responderInfo] tipo=${tipo} sin template configurado en resp_${tipo.toLowerCase()} — omitiendo respuesta`);
      return;
    }

    const respuesta = template
      .replace(/{BOT_NOMBRE}/g, nombreBot)
      .replace(/{NOMBRE_EMPRESA}/g, nombreEmpresa);

    await this.sendText(ideEmpr, waId, respuesta);

    if (tipo === 'UBICACION' && config?.lat_empresa && config?.lng_empresa) {
      try {
        await this.ycloudService.sendLocation(
          ideEmpr, `+${waId}`, config.lat_empresa, config.lng_empresa, nombreEmpresa, '',
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

  private buildResumenProductos(productos: ProductoSesion[]): string {
    const lista = productos.map((p, i) => {
      const cantidadTexto = p.cantidad === 0
        ? '(cantidad mínima disponible)'
        : `${p.cantidad} ${p.siglas_unidad || p.unidad || ''}`;
      return `${i + 1}. *${p.nombre}* — ${cantidadTexto}`;
    }).join('\n');

    return `📋 *Resumen de tu pedido:*\n\n${lista}\n\n¿Confirmamos estos productos?`;
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

  /** Procesa mensajes pendientes de un chat específico al liberarlo */
  async procesarPendientesChat(ideWhcha: number): Promise<void> {
    try {
      const chatRow = await this.dataSource.pool.query<{
        wa_id_whcha: string; phone_number_id_whcha: string;
        no_leidos_whcha: number; ide_whcue: number; ide_empr: number;
      }>(
        `SELECT c.wa_id_whcha, c.phone_number_id_whcha, c.no_leidos_whcha,
                cu.ide_whcue, cu.ide_empr
         FROM wha_chat c
         INNER JOIN wha_cuenta cu
           ON REPLACE(cu.id_telefono_whcue, '+', '') = c.phone_number_id_whcha
           AND cu.activo_whcue = TRUE
         WHERE c.ide_whcha = $1 LIMIT 1`,
        [ideWhcha],
      );
      if (!chatRow.rowCount) return;
      const chat = chatRow.rows[0];
      if (!chat.no_leidos_whcha || chat.no_leidos_whcha <= 0) return;

      const windowCheck = await this.ycloudWindowService.canSendFreeMessage(
        chat.phone_number_id_whcha, chat.wa_id_whcha,
      );
      if (!windowCheck.allowed) {
        this.logger.log(`[Bot] Chat ${ideWhcha} fuera de ventana 24h — no se procesan pendientes`);
        return;
      }

      const msgRow = await this.dataSource.pool.query<{ body_whmem: string }>(
        `SELECT body_whmem FROM wha_mensaje
         WHERE ide_whcha = $1 AND direction_whmem = '0'
           AND body_whmem IS NOT NULL AND content_type_whmem = 'text'
         ORDER BY ide_whmem DESC LIMIT 1`,
        [ideWhcha],
      );
      if (!msgRow.rowCount || !msgRow.rows[0].body_whmem) return;

      const texto = msgRow.rows[0].body_whmem;
      this.logger.log(`[Bot] Procesando pendiente chat=${ideWhcha} texto="${texto}"`);
      await this.processMessage(
        chat.wa_id_whcha, chat.phone_number_id_whcha,
        ideWhcha, chat.ide_whcue, chat.ide_empr, texto, true,
      );
    } catch (err) {
      this.logger.error(`[Bot] procesarPendientesChat error chat=${ideWhcha}: ${err.message}`);
    }
  }

  /** Procesa mensajes pendientes de todos los chats del bot al activarlo globalmente */
  async procesarPendientesGlobal(ideWhcue: number, ideEmpr: number): Promise<void> {
    try {
      const result = await this.dataSource.pool.query<{
        ide_whcha: number; wa_id_whcha: string; phone_number_id_whcha: string;
      }>(
        `SELECT c.ide_whcha, c.wa_id_whcha, c.phone_number_id_whcha
         FROM wha_chat c
         INNER JOIN wha_cuenta cu
           ON REPLACE(cu.id_telefono_whcue, '+', '') = c.phone_number_id_whcha
           AND cu.ide_whcue = $1 AND cu.activo_whcue = TRUE
         WHERE c.no_leidos_whcha > 0
           AND c.bot_activo_whcha = TRUE
           AND c.ultimo_ingreso_cliente_whcha IS NOT NULL
           AND (NOW() - c.ultimo_ingreso_cliente_whcha) < INTERVAL '24 hours'
           AND c.eliminado_whcha = FALSE
         ORDER BY c.ultimo_ingreso_cliente_whcha DESC
         LIMIT 20`,
        [ideWhcue],
      );
      if (!result.rowCount) return;
      this.logger.log(`[Bot] procesarPendientesGlobal: ${result.rowCount} chats pendientes`);

      for (const chat of result.rows) {
        try {
          const windowCheck = await this.ycloudWindowService.canSendFreeMessage(
            chat.phone_number_id_whcha, chat.wa_id_whcha,
          );
          if (!windowCheck.allowed) continue;

          const msgRow = await this.dataSource.pool.query<{ body_whmem: string }>(
            `SELECT body_whmem FROM wha_mensaje
             WHERE ide_whcha = $1 AND direction_whmem = '0'
               AND body_whmem IS NOT NULL AND content_type_whmem = 'text'
             ORDER BY ide_whmem DESC LIMIT 1`,
            [chat.ide_whcha],
          );
          if (!msgRow.rowCount || !msgRow.rows[0].body_whmem) continue;

          this.logger.log(`[Bot] Pendiente global chat=${chat.ide_whcha} texto="${msgRow.rows[0].body_whmem}"`);
          await this.processMessage(
            chat.wa_id_whcha, chat.phone_number_id_whcha,
            chat.ide_whcha, ideWhcue, ideEmpr, msgRow.rows[0].body_whmem, true,
          );
          await new Promise((r) => setTimeout(r, 500));
        } catch (chatErr) {
          this.logger.error(`[Bot] pendiente global chat=${chat.ide_whcha}: ${chatErr.message}`);
        }
      }
    } catch (err) {
      this.logger.error(`[Bot] procesarPendientesGlobal error: ${err.message}`);
    }
  }

  async derivarAsesor(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number,
    mensajeCliente?: string,   // mensaje visible al cliente (undefined = mensaje default)
    notaAsesor?: string,       // nota interna para el asesor (NO se envía al cliente)
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
        `Enseguida te comunico con uno de nuestros asesores comerciales 👤\nEspera un momento por favor 😊`,
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

  async liberarChat(ideWhcha: number): Promise<void> {
    await this.dataSource.pool.query(
      `UPDATE wha_chat SET bot_activo_whcha = TRUE, bot_modo_whcha = 'BOT' WHERE ide_whcha = $1`,
      [ideWhcha],
    );
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

      // Chat sin historial de bot → presentar el asistente con los botones estándar
      if (!ultimoEstado) {
        const cfg = await this.botConfig.getConfig(ideWhcue);
        const { sesion } = await this.botSession.getOrCreate(ideWhcha, ideWhcue);
        await this.handleInicio(
          waId, ideWhcue, ideEmpr, sesion.ide_whbse, lastClientMsg,
          cfg?.nombre_bot || 'QuimIA', cfg?.nombre_empresa || 'la empresa',
          sesion.datos_sesion as DatosSesion,
        );
        return;
      }

      // Sesión anterior completada o cancelada → el bot espera el próximo mensaje sin re-saludar
      if (ultimoEstado === BotState.FINALIZADO || ultimoEstado === BotState.CANCELADO) {
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

      // 7b. Pregunta de producto: buscar en catálogo y usar la unidad real (siglas_unidad)
      if (tipoConsulta === 'PRODUCTO') {
        const extracted = await this.botGpt.extractProductoCantidad(lastClientMsg).catch(() => null);
        const textoBase = extracted?.producto || lastClientMsg;
        const nombreBuscado = textoBase
          .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|kilo[s]?|lb[s]?|gr[s]?|g\b|litro[s]?|lt[s]?|ml|und[s]?|galon[s]?|gal[s]?)\b/gi, '')
          .replace(/\b\d+\b/g, '').replace(/\s{2,}/g, ' ').trim() || textoBase;

        let resultados = await this.botTools.buscarProductos(nombreBuscado, ideEmpr);

        if (!resultados.length) {
          const palabras = nombreBuscado.split(/\s+/).filter(Boolean);
          for (let n = palabras.length - 1; n >= 2; n--) {
            resultados = await this.botTools.buscarProductos(palabras.slice(0, n).join(' '), ideEmpr);
            if (resultados.length) break;
          }
        }
        if (!resultados.length) {
          resultados = await this.botTools.buscarProductosPorPalabras(nombreBuscado, ideEmpr);
        }

        if (resultados.length > 0) {
          const { sesion } = await this.botSession.getOrCreate(ideWhcha, ideWhcue);
          const memoria = await this.botSession.getMemoriaCliente(ideWhcha);
          const tieneMemoria = !!(memoria?.cliente?.nombres);

          if (resultados.length === 1) {
            const prod = resultados[0];
            const productoPendiente = {
              ide_inarti: prod.ide_inarti,
              nombre: prod.nombre,
              siglas_unidad: prod.siglas_unidad,
              nombre_unidad: prod.nombre_unidad,
              en_catalogo: prod.en_catalogo,
            };

            if (tieneMemoria) {
              // Cliente conocido → ir directamente a pedir cantidad con unidad real
              const datosSesion: DatosSesion = {
                productos: [],
                producto_pendiente: productoPendiente,
                cliente: { ...memoria.cliente } as ClienteSesion,
                memoria_cargada: true,
              };
              await this.botSession.update(sesion.ide_whbse, BotState.ESPERANDO_CANTIDAD, datosSesion);
              await this.sendText(ideEmpr, waId,
                `¡Hola de nuevo, *${memoria.cliente.nombres.split(' ')[0]}*! 😊\n\n` +
                `Encontré: *${this.displayNombreProducto(prod)}* ✅\n\n` +
                `¿Qué cantidad necesitas? _(Ejemplo: 5 ${prod.nombre_unidad} / 2.5 ${prod.siglas_unidad})_\n\n` +
                `_Puedes escribir *SALIR* en cualquier momento para hablar con un asesor 😊_`,
              );
            } else {
              // Cliente desconocido → identificar primero; conservar producto_pendiente
              const datosSesion: DatosSesion = { productos: [], producto_pendiente: productoPendiente };
              await this.botSession.update(sesion.ide_whbse, BotState.PREGUNTA_ES_CLIENTE, datosSesion);
              await this.sendButtons(ideEmpr, waId,
                `Encontré *${this.displayNombreProducto(prod)}* en nuestro catálogo 🧪\n\n` +
                `Para preparar tu cotización necesito unos datos. ${MSG_ES_CLIENTE_BODY}`,
                BTN_ES_CLIENTE,
              );
            }
            this.logger.log(`[Bot] iniciarConContextoChat chat=${ideWhcha} — PRODUCTO encontrado (1), unidad=${prod.siglas_unidad}`);
            return;
          }

          // Múltiples resultados → mostrar lista numerada
          const opciones: OpcionProducto[] = resultados.slice(0, 5).map((p, i) => ({
            numero: i + 1,
            ide_inarti: p.ide_inarti,
            nombre: p.nombre,
            otro_nombre: p.otro_nombre,
            matched_by_otro_nombre: p.matched_by_otro_nombre,
            siglas_unidad: p.siglas_unidad,
            nombre_unidad: p.nombre_unidad,
            en_catalogo: p.en_catalogo,
          }));
          const datosSesion: DatosSesion = {
            productos: [],
            opciones_producto: opciones,
            ...(tieneMemoria ? { cliente: memoria.cliente as ClienteSesion, memoria_cargada: true } : {}),
          };
          await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_MULTIPLE, datosSesion);
          const listaTexto = opciones.map(
            (o) => `*${o.numero}.* ${this.displayNombreProducto(o)}`,
          ).join('\n');
          await this.sendText(ideEmpr, waId,
            `Encontré ${opciones.length} productos que coinciden 🔍\n\n${listaTexto}\n\n` +
            `_Responde con el *número* del producto que necesitas._`,
          );
          this.logger.log(`[Bot] iniciarConContextoChat chat=${ideWhcha} — PRODUCTO múltiple (${opciones.length})`);
          return;
        }
        // Producto no encontrado → cae a respuesta GPT general
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
      `Al final de tu respuesta agrega una línea: "_Recuerda que puedes escribir *SALIR* en cualquier momento para hablar con un asesor 😊_"`,
    );
    await this.sendText(ideEmpr, waId, respuesta);
  }

  private async sendText(ideEmpr: number, waId: string, texto: string): Promise<void> {
    const result = await this.ycloudService.sendText(ideEmpr, `+${waId}`, texto);
    if (result?.messageId) {
      await this.dataSource.pool.query(
        `UPDATE wha_mensaje SET es_bot_whmem = TRUE WHERE id_whmem = $1`,
        [result.messageId],
      );
    }
  }

  private async sendButtons(
    ideEmpr: number, waId: string, body: string,
    buttons: { id: string; title: string }[],
  ): Promise<void> {
    try {
      const result = await this.ycloudService.sendInteractiveButtons(ideEmpr, `+${waId}`, body, buttons);
      if (result?.messageId) {
        await this.dataSource.pool.query(
          `UPDATE wha_mensaje SET es_bot_whmem = TRUE WHERE id_whmem = $1`,
          [result.messageId],
        );
      }
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
