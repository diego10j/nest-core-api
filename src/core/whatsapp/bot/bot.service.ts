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


// ─── Mensaje de pregunta si es cliente ───────────────────────────────────────
const MSG_ES_CLIENTE_BODY = `Para brindarte una atención personalizada 😊\n\n¿Has realizado alguna compra con nosotros anteriormente?`;
const BTN_ES_CLIENTE = [
  { id: 'SI_CLIENTE', title: '✅ Sí, soy cliente' },
  { id: 'NO_CLIENTE', title: '❌ No' },
];

// ─── Mensaje de inicio de cotización ─────────────────────────────────────────
const MSG_INICIO_COTIZACION = `Con mucho gusto te ayudo con tu cotización 😊

Cuéntame, ¿qué producto necesitas? Escríbeme solo el nombre.

_Ejemplo: *Cera de palma*_

Cuando hayas terminado de agregar todos los productos, escribe *FIN*.`;

@Injectable()
export class BotService implements OnModuleInit {
  private readonly logger = new Logger(BotService.name);

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
    this.logger.log(`[Bot] processMessage waId=${waId} ideWhcha=${ideWhcha} ideWhcue=${ideWhcue} botActivoWhcha=${botActivoWhcha} texto="${texto}"`);

    if (!botActivoWhcha) { this.logger.warn(`[Bot] Chat ${ideWhcha} en modo ASESOR — bot no responde`); return; }

    const botActivo = await this.botConfig.isBotActive(ideWhcue);
    if (!botActivo && !botActivoWhcha) { this.logger.warn(`[Bot] Bot global INACTIVO y chat sin override`); return; }

    this.logger.log(`[Bot] isBotActive(${ideWhcue})=${botActivo} | override por chat=${botActivoWhcha}`);

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
      ? `¡Hola de nuevo, *${nombreCliente}*! 😊 Soy *${nombreBot}* de *${nombreEmpresa}*.\n\n¿En qué puedo ayudarte hoy?`
      : `¡Hola! Soy *${nombreBot}*, la asistente virtual de *${nombreEmpresa}* ✨\n\nEstoy aquí para ayudarte con cotizaciones, precios, ubicación y más.\n\n¿Deseas continuar con el asistente o prefieres atención personalizada?`;

    await this.sendButtons(ideEmpr, waId, saludo, [
      { id: 'SI', title: '✅ Continuar con bot' },
      { id: 'NO', title: '👤 Hablar con asesor' },
    ]);
  }

  private async handleConfirmacion(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, nombreBot: string, nombreEmpresa: string, config: any,
  ): Promise<void> {
    const intencion = await this.botGpt.detectarIntencion(texto);
    const datos = sesion.datos_sesion as DatosSesion;

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
          // Tiene memoria → saltar pregunta de cliente
          await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS,
            { ...datos, productos: [] });
          await this.sendText(ideEmpr, waId,
            MSG_INICIO_COTIZACION,
          );
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

    await this.sendText(ideEmpr, waId,
      `Disculpa, no entendí bien tu respuesta 😊\n\nResponde *Sí* para continuar con el asistente o *No* para hablar con un asesor.`,
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
        await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS,
          { ...datos, productos: [] });
        await this.sendText(ideEmpr, waId,
          MSG_INICIO_COTIZACION,
        );
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

    const historial = await this.botSession.getHistorialMensajes(ideWhcha, 6);
    const promptBase = (config.prompt_sistema || this.getPromptSistema(nombreBot, nombreEmpresa))
      .replace(/{BOT_NOMBRE}/g, nombreBot)
      .replace(/{NOMBRE_EMPRESA}/g, nombreEmpresa);
    const respuesta = await this.botGpt.generateResponse(
      promptBase,
      historial,
      texto,
      `Empresa: ${nombreEmpresa}`,
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
    const esCliente = t === 'SI_CLIENTE' || /^(SI|SÍ|S[Ii]|YES|YA|YA COMPRÉ)$/i.test(t);
    const esNuevo   = t === 'NO_CLIENTE' || /^(NO|NUNCA|NUEVO|PRIMERA)$/i.test(t);

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

    // Si no se detectó ninguna opción, volver a mostrar botones
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
      await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS, nuevosDatos);
      await this.sendText(ideEmpr, waId,
        `¡Qué gusto verte de nuevo, *${cliente.nombres}*! 😊\n\n${MSG_INICIO_COTIZACION}`,
      );
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
      await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS, nuevosDatos);
      await this.sendText(ideEmpr, waId,
        `¡Todo listo, *${cliente.nombres.split(' ')[0]}*! 😊\n\n${MSG_INICIO_COTIZACION}`,
      );
      return;
    }
  }

  private async handleSeleccionProductos(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, nombreEmpresa: string, config: any,
  ): Promise<void> {
    const datos = sesion.datos_sesion as DatosSesion;
    const intencion = await this.botGpt.detectarIntencion(texto);

    if (intencion === 'LISTO' || intencion === 'CANCELAR') {
      if (!datos.productos?.length) {
        await this.sendText(ideEmpr, waId,
          `Aún no has agregado ningún producto 😊\nDime el nombre del producto que necesitas cotizar, o escribe *SALIR* para hablar con un asesor.`,
        );
        return;
      }
      await this.botSession.update(sesion.ide_whbse, BotState.CONFIRMACION_PRODUCTOS, datos);
      await this.sendButtons(ideEmpr, waId, this.buildResumenProductos(datos.productos), [
        { id: 'CONF_SI', title: '✅ Confirmar pedido' },
        { id: 'CONF_NO', title: '✏️ Modificar lista' },
      ]);
      return;
    }

    // ── PRE-CHECK: consulta informativa mid-cotización (ubicación, horario, envíos, catálogo) ──
    const tipoInfoPre = await this.botGpt.clasificarConsulta(texto);
    if (['UBICACION', 'HORARIO', 'ENVIO', 'CATALOGO'].includes(tipoInfoPre)) {
      await this.responderInfo(ideEmpr, waId, tipoInfoPre as any, nombreEmpresa, config);
      await this.sendText(ideEmpr, waId,
        `Espero haber resuelto tu consulta 😊\n\n¿Continuamos con la cotización? Dime el nombre del siguiente producto o escribe *FIN* para revisar tu pedido.`,
      );
      return;
    }

    // Limpiar el texto: extraer solo el nombre del producto (quitar cantidades como "25kg", "5 litros")
    const textoOriginal = texto.trim();
    const nombreBuscado = textoOriginal
      .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|kilo[s]?|lb[s]?|gr[s]?|g\b|litro[s]?|lt[s]?|ml|und[s]?|unidad[s]?|galon[s]?|gal[s]?|lb)\b/gi, '')
      .replace(/\b\d+\b/g, '')       // quitar números sueltos
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (nombreBuscado !== textoOriginal) {
      this.logger.log(`[Bot] Nombre limpiado: "${textoOriginal}" → "${nombreBuscado}"`);
    }

    let resultados = await this.botTools.buscarProductos(nombreBuscado || textoOriginal, ideEmpr);

    // Fallback 1: reducir palabras progresivamente
    if (!resultados.length) {
      const palabras = (nombreBuscado || textoOriginal).split(/\s+/).filter(Boolean);
      for (let n = palabras.length - 1; n >= 2; n--) {
        const subTexto = palabras.slice(0, n).join(' ');
        resultados = await this.botTools.buscarProductos(subTexto, ideEmpr);
        if (resultados.length > 0) {
          this.logger.log(`[Bot] Búsqueda reducida → "${subTexto}" → ${resultados.length}`);
          break;
        }
      }
    }

    // Fallback 2: palabras significativas
    if (!resultados.length) {
      resultados = await this.botTools.buscarProductosPorPalabras(nombreBuscado || textoOriginal, ideEmpr);
    }

    if (!resultados.length) {
      // GPT analiza qué quiso decir el cliente (info, reformulación, irrelevante)
      const nombresYa = (datos.productos ?? []).map((p) => p.nombre);
      const analisis = await this.botGpt.analizarProductoNoEncontrado(textoOriginal, nombresYa, config?.nombre_bot, nombreEmpresa, config?.prompt_sistema);
      await this.sendText(ideEmpr, waId, analisis.respuesta);
      return;
    }

    if (resultados.length === 1) {
      const prod = resultados[0];
      const nuevosDatos: DatosSesion = {
        ...datos,
        producto_pendiente: {
          ide_inarti: prod.ide_inarti,
          nombre: prod.nombre,
          siglas_unidad: prod.siglas_unidad,
          nombre_unidad: prod.nombre_unidad,
          en_catalogo: prod.en_catalogo,
        },
      };
      await this.botSession.update(sesion.ide_whbse, BotState.ESPERANDO_CANTIDAD, nuevosDatos);
      await this.sendText(ideEmpr, waId,
        `Encontré: *${this.displayNombreProducto(prod)}* ✅\n\n` +
        `¿Qué cantidad necesitas? _(Ejemplo: 5 ${prod.nombre_unidad}s / 2.5 ${prod.siglas_unidad})_`,
      );
      return;
    }

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

    const nuevosDatos: DatosSesion = { ...datos, opciones_producto: opciones };
    await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_MULTIPLE, nuevosDatos);

    // Lista numerada en texto — sin límite de caracteres (ideal para nombres químicos largos)
    const listaTexto = opciones.map(
      (o) => `*${o.numero}.* ${this.displayNombreProducto(o)} _(${o.nombre_unidad})_`,
    ).join('\n');
    await this.sendText(ideEmpr, waId,
      `Encontré ${opciones.length} productos que coinciden 🔍\n\n${listaTexto}\n\n_Responde con el *número* del producto que necesitas._`,
    );
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
      await this.sendText(ideEmpr, waId,
        `Por favor responde con el *número* de la opción que necesitas 😊`,
      );
      return;
    }

    const opcion = datos.opciones_producto[num - 1];
    const nuevosDatos: DatosSesion = {
      ...datos,
      opciones_producto: undefined,
      producto_pendiente: {
        ide_inarti: opcion.ide_inarti,
        nombre: opcion.nombre,
        siglas_unidad: opcion.siglas_unidad,
        nombre_unidad: opcion.nombre_unidad,
        en_catalogo: opcion.en_catalogo,
      },
    };
    await this.botSession.update(sesion.ide_whbse, BotState.ESPERANDO_CANTIDAD, nuevosDatos);
    await this.sendText(ideEmpr, waId,
      `¡Seleccionaste: *${opcion.nombre}*! ✅\n\n` +
      `¿Qué cantidad necesitas? _(Ejemplo: 5 ${opcion.nombre_unidad}s / 2.5 ${opcion.siglas_unidad})_`,
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

    const cantidadMatch = texto.trim().match(/^(\d+(?:[.,]\d+)?)/);
    if (!cantidadMatch) {
      await this.sendText(ideEmpr, waId,
        `Por favor indica la cantidad con un número. Ejemplo: *5* o *2.5* 😊`,
      );
      return;
    }

    const cantidad = parseFloat(cantidadMatch[1].replace(',', '.'));
    if (cantidad <= 0) {
      await this.sendText(ideEmpr, waId, `La cantidad debe ser mayor a 0 😊`);
      return;
    }

    const nuevoProducto: ProductoSesion = {
      ide_inarti: prod.ide_inarti,
      nombre: prod.nombre,
      cantidad,
      unidad: prod.nombre_unidad,
      siglas_unidad: prod.siglas_unidad,
      en_catalogo: prod.en_catalogo,
    };

    const nuevosDatos: DatosSesion = {
      ...datos,
      productos: [...(datos.productos ?? []), nuevoProducto],
      producto_pendiente: undefined,
    };

    await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS, nuevosDatos);
    await this.sendText(ideEmpr, waId,
      `✅ Agregado: *${prod.nombre}* — ${cantidad} ${prod.nombre_unidad}\n\n` +
      `¿Deseas agregar otro producto o ya terminaste?\n\n_Escribe el nombre del siguiente producto o *FIN* para continuar_`,
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

    if (t === 'PAGO_EFECTIVO' || /^(EFECTIVO|CASH|E)$/i.test(t)) formaPago = 'cash';
    else if (t === 'PAGO_TARJETA' || /^(TARJETA|CREDITO|CR[EÉ]DITO|CARD)$/i.test(t))   formaPago = 'credit';

    if (!formaPago) {
      await this.sendButtons(ideEmpr, waId, `Por favor selecciona tu forma de pago 💳`, [
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
        nuevosDatos, `+${waId}`, ideEmpr, nombreBot,
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
        await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, null, msgAsesor);
      }
    } catch (err) {
      this.logger.error(`Error creando proforma: ${err.message}`);
      await this.sendText(ideEmpr, waId,
        `Hubo un inconveniente al generar tu cotización 😔\nUn asesor te contactará en breve para ayudarte.`,
      );
      await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr);
    }

    await this.botSession.cerrar(sesion.ide_whbse, BotState.FINALIZADO);
  }

  private async handlePostCotizacion(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, nombreBot: string,
  ): Promise<void> {
    const t = texto.trim().toUpperCase();

    if (t === 'NUEVA_COTIZACION' || /NUEVA|COTIZAR|OTRO PRODUCTO|OTRA COTIZ/i.test(texto)) {
      // Cerrar la sesión actual y crear una nueva para empezar de cero
      await this.botSession.cerrar(sesion.ide_whbse, BotState.CANCELADO);
      const { sesion: nuevaSesion } = await this.botSession.getOrCreate(ideWhcha, ideWhcue);
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

  private async responderInfo(
    ideEmpr: number, waId: string,
    tipo: 'UBICACION' | 'HORARIO' | 'ENVIO' | 'CATALOGO',
    nombreEmpresa: string,
    config: any,
  ): Promise<void> {
    const preguntas: Record<string, string> = {
      UBICACION: '¿Cuál es la dirección y cómo puedo llegar?',
      HORARIO:   '¿Cuáles son los horarios de atención?',
      ENVIO:     '¿Realizan envíos a otras ciudades? ¿Cuál es la política de envíos y costos?',
      CATALOGO:  '¿Dónde puedo ver el catálogo de productos y precios?',
    };
    const promptBase = (config?.prompt_sistema || this.getPromptSistema(config?.nombre_bot || 'Asistente', nombreEmpresa))
      .replace(/{BOT_NOMBRE}/g, config?.nombre_bot || 'Asistente')
      .replace(/{NOMBRE_EMPRESA}/g, nombreEmpresa);

    const respuesta = await this.botGpt.generateResponse(promptBase, [], preguntas[tipo]);
    await this.sendText(ideEmpr, waId, respuesta);

    if (tipo === 'UBICACION') {
      try {
        await this.ycloudService.sendLocation(
          ideEmpr, `+${waId}`, -0.3465918, -78.4822285, nombreEmpresa, '',
        );
      } catch (err) {
        this.logger.warn(`[Bot] No se pudo enviar pin de ubicación: ${err.message}`);
      }
    }
  }

  private displayNombreProducto(prod: { nombre: string; otro_nombre?: string; matched_by_otro_nombre?: boolean }): string {
    if (prod.matched_by_otro_nombre && prod.otro_nombre) {
      return `${prod.nombre} / ${prod.otro_nombre}`;
    }
    return prod.nombre;
  }

  private buildResumenProductos(productos: ProductoSesion[]): string {
    const lista = productos.map(
      (p, i) => `${i + 1}. *${p.nombre}* — ${p.cantidad} ${p.siglas_unidad || p.unidad || ''}`,
    ).join('\n');

    return `📋 *Resumen de tu pedido:*\n\n${lista}\n\n¿Confirmamos estos productos?`;
  }

  private getPromptSistema(nombreBot: string, nombreEmpresa: string): string {
    return `Eres ${nombreBot}, asesora comercial experta de ${nombreEmpresa}.
Tu estilo es amable, confiable, profesional y conciso. Nunca eres condescendiente ni repetitiva.
Respondes en español, con emojis moderados para dar cercanía.
Si el cliente pregunta algo que no puedes responder, invítale a contactar a un asesor escribiendo SALIR.`;
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

    if (mensajeCliente !== null) {
      const config = await this.botConfig.getConfig(ideWhcue);
      const horario = config?.horario_atencion ?? 'Lunes a Viernes de 08:00 a 17:00';
      await this.sendText(ideEmpr, waId,
        mensajeCliente ||
        `Enseguida te comunico con uno de nuestros asesores comerciales 👤\n\n` +
        `*Horario de atención:* ${horario}\n\n` +
        `_Si nos escribes fuera de este horario, te respondemos al siguiente día hábil 😊_`,
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
