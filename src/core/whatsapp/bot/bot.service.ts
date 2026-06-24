import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { YcloudService } from '../ycloud/ycloud.service';
import { WhatsappGateway } from '../whatsapp.gateway';

import { BotConfigService } from './bot-config.service';
import { BotGptService } from './bot-gpt.service';
import { BotProformaService } from './bot-proforma.service';
import { BotSessionService } from './bot-session.service';
import { BotToolsService } from './bot-tools.service';
import { ProductoInfo } from './bot-tools.service';
import { BotState } from './interfaces/bot-state.enum';
import { ClienteSesion, DatosSesion, OpcionProducto, ProductoSesion } from './interfaces/bot-session.interface';

// ─── Constantes de negocio ────────────────────────────────────────────────────
const PALABRAS_ASESOR = /\bASESOR\b|\bAGENTE\b|\bHUMANO\b|\bPERSONA\b|\bVENDEDOR\b/i;
const REGEX_SALIR     = /^SALIR$/i;
const REGEX_SALUDO    = /^(hola|buenas?|buenos?\s*(d[ií]as?|tardes?|noches?)|saludos?|hey)[\s!.,]*$/i;

// ─── Respuestas informativas ──────────────────────────────────────────────────
const INFO = {
  ubicacion: `📍 *¡Con gusto te indico cómo llegar!*

Estamos en el *Valle de los Chillos*:
📌 Calles Jacinto Jijón y Caamaño & Paseo 7
   _(Sector Chillo Jijón)_

🏟️ Referencia: *Estadio del Independiente del Valle*

🗺️ Ver en Google Maps:
https://www.google.com/maps/place/PRODUQUIMIC+DEL+VALLE-DIQUIMEC/@-0.346593,-78.482222,15z/data=!4m6!3m5!1s0x91d5a3368a9f1d6d:0xf5556b94b44591d1!8m2!3d-0.3465918!4d-78.4822285!16s%2Fg%2F11gbk4_nbw

Si eres de otra ciudad o provincia, no te preocupes, *realizamos envíos a nivel nacional* 🚚

¿Puedo ayudarte con algo más?`,

  horario: `🕒 *Nuestros horarios de atención son:*

📅 *Lunes a Viernes*
   🕗 08:00 — 17:00

📅 *Sábados*
   🕘 09:00 — 13:00

_Si nos escribes fuera de este horario, con gusto te respondemos en el próximo día hábil 😊_

¿Hay algo más en que pueda ayudarte?`,

  envios: `🚚 *¡Sí realizamos envíos a nivel nacional!*

Trabajamos con el transporte de tu preferencia para que recibas tus productos cómodamente donde estés.

¿Te interesa cotizar algún producto? 🧪`,

  catalogo: `📦 *Explora nuestros productos:*

🔹 *Catálogos de precios* (por sector):
   👉 https://diquimec.com.ec/catalogo

🔹 *Listado completo de productos:*
   👉 https://diquimec.com.ec/product

Puedes buscar lo que necesitas y solicitar tu cotización directamente.

¿Te gustaría que te ayude con una cotización personalizada? 🧪`,
};

// ─── Mensaje de pregunta si es cliente ───────────────────────────────────────
const MSG_ES_CLIENTE_BODY = `Para ayudarte de la mejor manera 😊\n\n¿Has realizado alguna compra con nosotros anteriormente?`;
const BTN_ES_CLIENTE = [
  { id: 'SI_CLIENTE', title: '✅ Sí, soy cliente' },
  { id: 'NO_CLIENTE', title: '❌ No' },
];

// ─── Mensaje de inicio de cotización ─────────────────────────────────────────
const MSG_INICIO_COTIZACION = `¡Perfecto! Vamos a preparar tu cotización 📋

Por favor dime el *nombre del producto* que necesitas cotizar.
_(Puedes agregar varios productos uno por uno)_
Cuando termines de agregar todos, escribe *FIN*.`;

@Injectable()
export class BotService implements OnModuleInit {
  private readonly logger = new Logger(BotService.name);

  constructor(
    private readonly botConfig: BotConfigService,
    private readonly botSession: BotSessionService,
    private readonly botGpt: BotGptService,
    private readonly botTools: BotToolsService,
    private readonly botProforma: BotProformaService,
    private readonly ycloudService: YcloudService,
    private readonly gateway: WhatsappGateway,
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

    let sesion = await this.botSession.getOrCreate(ideWhcha, ideWhcue);
    this.logger.log(`[Bot] sesion.estado=${sesion?.estado} ide_whbse=${sesion?.ide_whbse}`);
    const config = await this.botConfig.getConfig(ideWhcue);
    this.logger.log(`[Bot] config=${config ? 'OK nombre_bot=' + config.nombre_bot : 'NULL'}`);
    if (!config) {
      this.logger.warn(`[Bot] Sin configuración en wha_bot_config para ideWhcue=${ideWhcue} — creando config mínima`);
      // Config mínima por defecto para no perder el mensaje
      await this.botConfig.crearConfigMinima(ideWhcue);
      const configCreada = await this.botConfig.getConfig(ideWhcue);
      if (!configCreada) {
        await this.sendText(ideEmpr, waId,
          `Hola 😊 Soy tu asistente virtual de DIQUIMEC. En este momento estoy siendo configurado, pronto podré ayudarte mejor. Por favor escribe *SALIR* para hablar con un asesor.`
        );
        return;
      }
    }

    const nombreBot = config.nombre_bot || 'QuimIA';

    // Si llega un saludo en un estado distinto de INICIO → resetear sesión
    const estadosQueReinician = [
      BotState.SELECCION_PRODUCTOS, BotState.SELECCION_MULTIPLE, BotState.ESPERANDO_CANTIDAD,
      BotState.CONFIRMACION_PRODUCTOS, BotState.DATOS_ENVIO, BotState.DATOS_PAGO,
      BotState.PREGUNTA_ES_CLIENTE, BotState.IDENTIFICACION, BotState.DATOS_NUEVO_CLIENTE,
      BotState.ATENCION_LIBRE,
    ];
    if (REGEX_SALUDO.test(texto.trim()) && estadosQueReinician.includes(sesion.estado as BotState)) {
      await this.botSession.cerrar(sesion.ide_whbse, BotState.CANCELADO);
      sesion = await this.botSession.getOrCreate(ideWhcha, ideWhcue);
      this.logger.log(`[Bot] Saludo detectado en estado ${sesion.estado} → sesión reiniciada`);
    }

    try {
      switch (sesion.estado as BotState) {
        case BotState.INICIO:
          await this.handleInicio(waId, ideWhcue, ideEmpr, sesion.ide_whbse, texto, nombreBot, sesion.datos_sesion as DatosSesion);
          break;
        case BotState.ESPERANDO_CONFIRMACION:
          await this.handleConfirmacion(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, nombreBot);
          break;
        case BotState.ATENCION_LIBRE:
          await this.handleAtencionLibre(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, nombreBot, config);
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
          await this.handleSeleccionProductos(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, config);
          break;
        case BotState.SELECCION_MULTIPLE:
          await this.handleSeleccionMultiple(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto);
          break;
        case BotState.ESPERANDO_CANTIDAD:
          await this.handleEsperandoCantidad(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto);
          break;
        case BotState.CONFIRMACION_PRODUCTOS:
          await this.handleConfirmacionProductos(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, config);
          break;
        case BotState.DATOS_ENVIO:
          await this.handleDatosEnvio(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, config);
          break;
        case BotState.DATOS_PAGO:
          await this.handleDatosPago(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, nombreBot);
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
    ideWhbse: number, texto: string, nombreBot: string, datosSesion: DatosSesion,
  ): Promise<void> {
    await this.botSession.update(ideWhbse, BotState.ESPERANDO_CONFIRMACION, {
      ...datosSesion,
      productos: datosSesion?.productos ?? [],
      texto_inicial: texto,
    });

    await this.sendButtons(ideEmpr, waId,
      `¡Hola! Soy *${nombreBot}*, la asistente virtual de *DIQUIMEC* ✨\n\n` +
      `Estoy aquí para ayudarte con:\n` +
      `🧪 Catálogos y precios de productos\n` +
      `📋 Solicitudes de cotización\n` +
      `📍 Información de ubicación y horarios\n` +
      `🚚 Consultas sobre envíos\n\n` +
      `¿Deseas continuar con el asistente virtual o prefieres atención personalizada?`,
      [
        { id: 'SI', title: '✅ Continuar con bot' },
        { id: 'NO', title: '👤 Hablar con asesor' },
      ],
    );
  }

  private async handleConfirmacion(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, nombreBot: string,
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
        await this.sendButtons(ideEmpr, waId, MSG_ES_CLIENTE_BODY, BTN_ES_CLIENTE);
        await this.botSession.update(sesion.ide_whbse, BotState.PREGUNTA_ES_CLIENTE, datos);
        return;
      }

      if (['UBICACION', 'HORARIO', 'ENVIO', 'CATALOGO'].includes(tipoConsulta)) {
        await this.responderInfo(ideEmpr, waId, tipoConsulta as any);
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
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, nombreBot: string, config: any,
  ): Promise<void> {
    this.logger.log(`[Bot] handleAtencionLibre texto="${texto}"`);
    const datos = sesion.datos_sesion as DatosSesion;
    const tipoConsulta = await this.botGpt.clasificarConsulta(texto);
    this.logger.log(`[Bot] tipoConsulta="${tipoConsulta}"`);

    if (['UBICACION', 'HORARIO', 'ENVIO', 'CATALOGO'].includes(tipoConsulta)) {
      await this.responderInfo(ideEmpr, waId, tipoConsulta as any);
      return;
    }

    if (tipoConsulta === 'PRODUCTO') {
      this.logger.log(`[Bot] Llamando sendButtons ideEmpr=${ideEmpr} waId=${waId}`);
      try {
        await this.sendButtons(ideEmpr, waId, MSG_ES_CLIENTE_BODY, BTN_ES_CLIENTE);
        this.logger.log(`[Bot] sendButtons completado OK`);
      } catch (e) {
        this.logger.error(`[Bot] sendButtons lanzó excepción: ${e.message}`);
        throw e;
      }
      await this.botSession.update(sesion.ide_whbse, BotState.PREGUNTA_ES_CLIENTE, datos);
      return;
    }

    const historial = await this.botSession.getHistorialMensajes(ideWhcha, 6);
    const respuesta = await this.botGpt.generateResponse(
      config.prompt_sistema || this.getPromptSistema(nombreBot),
      historial,
      texto,
      `Empresa: DIQUIMEC - Materias primas y productos químicos.`,
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
        `Perfecto 👍 Por favor dime tu *número de cédula o RUC* para buscarte en nuestro sistema 🔍`,
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
        `¡Con mucho gusto te atendemos! 😊\n\n¿Cuál es tu nombre?`,
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
          correo: cliente.correo,
          telefono: cliente.telefono,
          es_cliente_registrado: true,
        },
      };
      await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS, nuevosDatos);
      await this.sendText(ideEmpr, waId,
        `¡Qué gusto verte de nuevo, *${cliente.nombres.split(' ')[0]}*! 😊\n\n${MSG_INICIO_COTIZACION}`,
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
        `Perfecto, *${nombres.split(' ')[0]}* 😊\n\nAhora dime tu *correo electrónico* para enviarte la cotización 📧`,
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
        `¡Listo, *${cliente.nombres.split(' ')[0]}*! Ya tengo tus datos 😊\n\n${MSG_INICIO_COTIZACION}`,
      );
      return;
    }
  }

  private async handleSeleccionProductos(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, config: any,
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

    const nombreBuscado = texto.trim();
    const resultados = await this.botTools.buscarProductos(nombreBuscado, ideEmpr);

    if (!resultados.length) {
      await this.sendText(ideEmpr, waId,
        `No encontré ningún producto con ese nombre 🤔\n\nPuedes buscar nuestros productos en:\n👉 https://diquimec.com.ec/product\n\nO escribe el nombre de otra forma e intento buscarlo nuevamente.`,
      );
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
        `Encontré: *${prod.nombre}* ✅\n\n` +
        `¿Qué cantidad necesitas? _(Ejemplo: 5 ${prod.nombre_unidad}s / 2.5 ${prod.siglas_unidad})_`,
      );
      return;
    }

    const opciones: OpcionProducto[] = resultados.map((p, i) => ({
      numero: i + 1,
      ide_inarti: p.ide_inarti,
      nombre: p.nombre,
      siglas_unidad: p.siglas_unidad,
      nombre_unidad: p.nombre_unidad,
      en_catalogo: p.en_catalogo,
    }));

    const nuevosDatos: DatosSesion = { ...datos, opciones_producto: opciones };
    await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_MULTIPLE, nuevosDatos);

    const listaTexto = opciones.map((o) => `*${o.numero}.* ${o.nombre}`).join('\n');
    await this.sendText(ideEmpr, waId,
      `Encontré varios productos que coinciden 🔍 Selecciona el número que corresponde al que necesitas:\n\n${listaTexto}\n\n_Responde con el número de la opción_`,
    );
  }

  private async handleSeleccionMultiple(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string,
  ): Promise<void> {
    const datos = sesion.datos_sesion as DatosSesion;
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
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string,
  ): Promise<void> {
    const datos = sesion.datos_sesion as DatosSesion;
    const prod = datos.producto_pendiente;

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
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, config: any,
  ): Promise<void> {
    const datos = sesion.datos_sesion as DatosSesion;
    const t = texto.trim().toUpperCase();

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
      await this.sendText(ideEmpr, waId, `Entendido, empecemos de nuevo 😊\n\n${MSG_INICIO_COTIZACION}`);
      return;
    }

    if (confirma) {
      const nuevosDatos: DatosSesion = { ...datos, envio: { pendiente_campo: 'tipo_direccion' } };
      await this.botSession.update(sesion.ide_whbse, BotState.DATOS_ENVIO, nuevosDatos);
      await this.sendButtons(ideEmpr, waId,
        `Perfecto 👍 Ahora necesito la dirección de entrega.\n\n¿Cómo prefieres indicarla?`,
        [
          { id: 'DIR_TEXTO',     title: '📝 Escribir dirección' },
          { id: 'DIR_UBICACION', title: '📍 Mi ubicación' },
        ],
      );
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
        const direccionFormateada = direccionMapa?.trim() || nombre?.trim()
          || `Coordenadas: ${lat}, ${lng}`;
        await this.botSession.update(sesion.ide_whbse, BotState.DATOS_ENVIO, {
          ...datos,
          envio: {
            ...envio,
            direccion: direccionFormateada,
            latitud: parseFloat(lat),
            longitud: parseFloat(lng),
            pendiente_campo: 'provincia',
          },
        });
        await this.sendText(ideEmpr, waId,
          `📍 Ubicación recibida ✅\n\n¿En qué *provincia* te encuentras? 🗺️`,
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
    ideWhcue: number, ideEmpr: number, sesion: any, texto: string, nombreBot: string,
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
        // ── CASO 1: Todos con precio + en catálogo → enviar PDF desde nuestro servidor ──
        let pdfEnviado = false;
        try {
          const { mediaId } = await this.ycloudService.uploadMedia(
            ideEmpr, resultado.pdfBuffer, 'application/pdf',
            `Cotizacion_${resultado.secuencial}.pdf`,
          );
          await this.ycloudService.sendDocument(
            ideEmpr, `+${waId}`, mediaId,
            `Cotizacion_${resultado.secuencial}.pdf`,
            `📄 Tu cotización #${resultado.secuencial} de DIQUIMEC`,
            undefined,   // ideUsua
          );
          pdfEnviado = true;
        } catch (pdfErr) {
          this.logger.error(`Error enviando PDF: ${pdfErr.message}`);
        }

        await this.sendText(ideEmpr, waId,
          `✅ *¡Tu cotización #${resultado.secuencial} está lista!*\n\n` +
          `📋 *Detalle:*\n` +
          resultado.productosConPrecio.map(
            (p) => `• ${p.nombre} — ${p.cantidad} ${p.siglas_unidad || p.unidad} — $${p.precio_total?.toFixed(2)}`,
          ).join('\n') +
          `\n\n${pdfEnviado ? '📄 Te hemos enviado el PDF arriba.\n\n' : ''}` +
          `Un asesor confirmará disponibilidad y coordinará el pago y envío.\n\n` +
          `*¡Gracias por confiar en DIQUIMEC!* 🧪✨`,
        );

      } else if (resultado.conPrecio) {
        // ── CASO 2: Todos tienen precio pero alguno no está en catálogo ──
        await this.sendText(ideEmpr, waId,
          `✅ *Cotización #${resultado.secuencial} registrada*\n\n` +
          `📋 *Productos cotizados:*\n` +
          resultado.productosConPrecio.map(
            (p) => `• ${p.nombre} — ${p.cantidad} ${p.siglas_unidad || p.unidad} — $${p.precio_total?.toFixed(2)}`,
          ).join('\n') +
          `\n\n🔔 Tu cotización ha sido asignada a uno de nuestros asesores comerciales, quien se comunicará contigo en la brevedad posible con todos los detalles.\n\n` +
          `*¡Gracias por contactarnos!* 🧪`,
        );
        await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr,
          `Cotización #${resultado.secuencial} generada. Cliente tiene precios pero productos fuera de catálogo — revisar y enviar proforma.`,
        );

      } else {
        // ── CASO 3: Algunos productos sin precio configurado ──
        let msg = `✅ *Cotización #${resultado.secuencial} registrada*\n\n`;

        if (resultado.productosConPrecio.length) {
          msg += `📋 *Productos con precio:*\n`;
          msg += resultado.productosConPrecio.map(
            (p) => `• ${p.nombre} — ${p.cantidad} ${p.siglas_unidad || p.unidad} — $${p.precio_total?.toFixed(2)}`,
          ).join('\n') + '\n\n';
        }

        if (resultado.productosSinPrecio.length) {
          msg += `⏳ *Productos pendientes de precio:*\n`;
          msg += resultado.productosSinPrecio.map((p) => `• ${p.nombre}`).join('\n') + '\n\n';
        }

        msg += `🔔 Uno de nuestros asesores revisará los precios pendientes y te enviará la cotización completa en el menor tiempo posible.\n\n*¡Gracias por contactarnos!* 🧪`;

        await this.sendText(ideEmpr, waId, msg);
        await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr,
          `Cotización #${resultado.secuencial} — hay ${resultado.productosSinPrecio.length} producto(s) sin precio configurado. Completar y enviar proforma al cliente.`,
        );
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

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async responderInfo(ideEmpr: number, waId: string, tipo: 'UBICACION' | 'HORARIO' | 'ENVIO' | 'CATALOGO'): Promise<void> {
    const mapa = {
      UBICACION: INFO.ubicacion,
      HORARIO: INFO.horario,
      ENVIO: INFO.envios,
      CATALOGO: INFO.catalogo,
    };
    await this.sendText(ideEmpr, waId, mapa[tipo]);
  }

  private buildResumenProductos(productos: ProductoSesion[]): string {
    const lista = productos.map(
      (p, i) => `${i + 1}. *${p.nombre}* — ${p.cantidad} ${p.siglas_unidad || p.unidad || ''}`,
    ).join('\n');

    return `📋 *Resumen de tu pedido:*\n\n${lista}\n\n¿Confirmamos estos productos?`;
  }

  private getPromptSistema(nombreBot: string): string {
    return `Eres ${nombreBot}, asesora comercial experta de DIQUIMEC, empresa especializada en materias primas y productos químicos para industria, cosmética, limpieza y más.
Tu estilo es amable, confiable, profesional y conciso. Nunca eres condescendiente ni repetitiva.
Respondes en español, con emojis moderados para dar cercanía.
Información clave:
- Ubicación: Valle de los Chillos, Calles Jacinto Jijón y Caamaño & Paseo 7
- Horario: L-V 08:00-17:00, Sábados 09:00-13:00
- Envíos nacionales disponibles
- Web productos: https://diquimec.com.ec/product
- Catálogos: https://diquimec.com.ec/catalogo
Si el cliente pregunta algo que no puedes responder, invítale a contactar a un asesor escribiendo SALIR.`;
  }

  async derivarAsesor(
    waId: string, phoneNumberId: string, ideWhcha: number,
    ideWhcue: number, ideEmpr: number,
    mensaje?: string,
  ): Promise<void> {
    await this.ycloudService.dataSource.pool.query(
      `UPDATE wha_chat SET bot_activo_whcha = FALSE, bot_modo_whcha = 'ASESOR' WHERE ide_whcha = $1`,
      [ideWhcha],
    );

    const config = await this.botConfig.getConfig(ideWhcue);
    const horario = config?.horario_atencion ?? 'Lunes a Viernes de 08:00 a 17:00';

    await this.sendText(ideEmpr, waId,
      mensaje ||
      `Enseguida te comunico con uno de nuestros asesores comerciales 👤\n\n` +
      `*Horario de atención:* ${horario}\n\n` +
      `_Si nos escribes fuera de este horario, te respondemos al siguiente día hábil 😊_`,
    );

    this.gateway.emitChatEsperandoAsesor(ideWhcue, waId, ideWhcha);
    this.logger.log(`Chat ${waId} derivado a asesor`);
  }

  async liberarChat(ideWhcha: number): Promise<void> {
    await this.ycloudService.dataSource.pool.query(
      `UPDATE wha_chat SET bot_activo_whcha = TRUE, bot_modo_whcha = 'BOT' WHERE ide_whcha = $1`,
      [ideWhcha],
    );
  }

  private async sendText(ideEmpr: number, waId: string, texto: string): Promise<void> {
    const result = await this.ycloudService.sendText(ideEmpr, `+${waId}`, texto);
    if (result?.messageId) {
      await this.ycloudService.dataSource.pool.query(
        `UPDATE wha_mensaje SET es_bot_whmem = TRUE WHERE id_whmem = $1`,
        [result.messageId],
      );
    }
  }

  private async sendButtons(
    ideEmpr: number, waId: string, body: string,
    buttons: { id: string; title: string }[],
  ): Promise<void> {
    this.logger.log(`[Bot] sendButtons ENTER ideEmpr=${ideEmpr} waId=${waId} buttons=${buttons.length}`);
    try {
      this.logger.log(`[Bot] llamando sendInteractiveButtons...`);
      const result = await this.ycloudService.sendInteractiveButtons(ideEmpr, `+${waId}`, body, buttons);
      this.logger.log(`[Bot] sendInteractiveButtons OK messageId=${result?.messageId}`);
      if (result?.messageId) {
        await this.ycloudService.dataSource.pool.query(
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
    this.logger.log(`[Bot] sendButtons EXIT`);
  }
}
