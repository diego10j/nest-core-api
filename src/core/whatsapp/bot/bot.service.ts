import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { getCurrentDate } from 'src/util/helpers/date-util';

import { YcloudService } from '../ycloud/ycloud.service';
import { WhatsappGateway } from '../whatsapp.gateway';

import { BotConfigService } from './bot-config.service';
import { BotGptService } from './bot-gpt.service';
import { BotProformaService } from './bot-proforma.service';
import { BotSessionService } from './bot-session.service';
import { BotToolsService } from './bot-tools.service';
import { BotState } from './interfaces/bot-state.enum';
import { ClienteSesion, DatosSesion, ProductoSesion } from './interfaces/bot-session.interface';

const PALABRAS_ASESOR = /\bASESOR\b|\bAGENTE\b|\bHUMANO\b|\bPERSONA\b|\bVENDEDOR\b/i;

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

  /**
   * Punto de entrada desde el webhook. Decide si el bot responde.
   */
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

    // 1. ¿El bot global está activo para esta cuenta?
    const botActivo = await this.botConfig.isBotActive(ideWhcue);
    this.logger.log(`[Bot] isBotActive(${ideWhcue})=${botActivo}`);
    if (!botActivo) { this.logger.warn(`[Bot] Bot global INACTIVO para ideWhcue=${ideWhcue}`); return; }

    // 2. ¿El chat está en modo ASESOR?
    if (!botActivoWhcha) { this.logger.warn(`[Bot] Chat ${ideWhcha} en modo ASESOR — bot no responde`); return; }

    // 3. Detección de "Asesor" en CUALQUIER estado (override universal)
    if (PALABRAS_ASESOR.test(texto)) {
      await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr);
      return;
    }

    // 4. Cargar o crear sesión activa
    const sesion = await this.botSession.getOrCreate(ideWhcha, ideWhcue);
    const config = await this.botConfig.getConfig(ideWhcue);
    if (!config) return;

    // 5. Despachar según estado
    try {
      switch (sesion.estado as BotState) {
        case BotState.INICIO:
          await this.handleInicio(waId, phoneNumberId, ideWhcue, ideEmpr, config.template_saludo, config.nombre_bot);
          await this.botSession.update(sesion.ide_whbse, BotState.ESPERANDO_CONFIRMACION, sesion.datos_sesion);
          break;

        case BotState.ESPERANDO_CONFIRMACION:
          await this.handleConfirmacion(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion.ide_whbse, texto, config);
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

        case BotState.CONFIRMACION_PRODUCTOS:
          await this.handleConfirmacionProductos(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, config);
          break;

        case BotState.DATOS_ENVIO:
          await this.handleDatosEnvio(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, sesion, texto, config);
          break;
      }
    } catch (error) {
      this.logger.error(`BotService error [${sesion.estado}]: ${error.message}`, error.stack);
      const fallos = await this.botSession.incrementarFallo(sesion.ide_whbse);
      const maxFallos = config?.max_intentos_fallo ?? 3;
      if (fallos >= maxFallos) {
        await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr,
          'Tuve problemas procesando tu solicitud. Te transfiero con un asesor.');
      }
    }
  }

  // ─── Handlers ────────────────────────────────────────────────────────────

  private async handleInicio(
    waId: string, phoneNumberId: string, ideWhcue: number, ideEmpr: number,
    templateSaludo: string, nombreBot: string,
  ): Promise<void> {
    // TODO: reemplazar por template aprobado cuando esté disponible
    // await this.ycloudService.sendTemplate(ideEmpr, `+${waId}`, templateSaludo, 'es', []);
    await this.sendText(ideEmpr, waId,
      `¡Hola! Soy *${nombreBot}*, la asistente virtual de DIQUIMEC ✨\n\n` +
      `Estoy aquí para ayudarte con información de nuestros productos, como catálogos de precios, dirección, horarios de atención y también para gestionar tu solicitud de cotización.\n\n` +
      `¿Deseas continuar con la atención a través de este asistente virtual o prefieres recibir atención personalizada de uno de nuestros asesores comerciales?\n\n` +
      `Por favor responde *Sí* para continuar con el asistente o *No* para hablar con un asesor.`,
    );
  }

  private async handleConfirmacion(
    waId: string, phoneNumberId: string, ideWhcha: number, ideWhcue: number, ideEmpr: number,
    ideWhbse: number, texto: string, config: any,
  ): Promise<void> {
    const intencion = await this.botGpt.detectarIntencion(texto);

    if (intencion === 'ASESOR' || intencion === 'CANCELAR') {
      await this.derivarAsesor(waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr);
      await this.botSession.cerrar(ideWhbse, BotState.CANCELADO);
      return;
    }

    if (intencion === 'CONFIRMAR') {
      await this.sendText(ideEmpr, waId,
        `¡Perfecto! Soy *${config.nombre_bot}* 😊, tu asistente virtual.\n\n` +
        `Para preparar tu cotización necesito algunos datos.\n\n` +
        `¿Podrías indicarme tu número de *cédula o RUC*?`
      );
      const sesion = await this.botSession.getActiva(ideWhcha);
      await this.botSession.update(sesion.ide_whbse, BotState.IDENTIFICACION, sesion.datos_sesion);
      return;
    }

    // Mensaje ambiguo — pedir confirmación de nuevo (sin incrementar fallo)
    await this.sendText(ideEmpr, waId,
      `Por favor, ¿deseas continuar con el *asistente virtual* o prefieres hablar con un *asesor comercial*?`
    );
  }

  private async handleIdentificacion(
    waId: string, phoneNumberId: string, ideWhcha: number, ideWhcue: number, ideEmpr: number,
    sesion: any, texto: string, config: any,
  ): Promise<void> {
    const identificacion = texto.replace(/\D/g, '').trim();

    if (identificacion.length < 8) {
      await this.sendText(ideEmpr, waId,
        `No reconocí ese número. Por favor ingresa tu *cédula* (10 dígitos) o *RUC* (13 dígitos).`
      );
      return;
    }

    const clienteDb = await this.botTools.buscarClientePorIdentificacion(identificacion, ideEmpr);
    const datos: DatosSesion = { ...sesion.datos_sesion, productos: sesion.datos_sesion.productos || [] };

    if (clienteDb) {
      datos.cliente = {
        ide_geper: clienteDb.ide_geper,
        identificacion: clienteDb.identificacion,
        nombres: clienteDb.nombres,
        correo: clienteDb.correo,
        telefono: clienteDb.telefono,
        es_cliente_registrado: true,
      };
      await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS, datos);
      await this.sendText(ideEmpr, waId,
        `¡Hola *${clienteDb.nombres}*! Te encontramos como cliente registrado 🎉\n\n` +
        `Ahora dime, ¿qué productos necesitas cotizar?\n` +
        `Escribe el *nombre del producto y la cantidad*. Cuando termines escribe *LISTO* ✅`
      );
    } else {
      datos.cliente = {
        identificacion,
        nombres: '',
        correo: '',
        es_cliente_registrado: false,
        pendiente_campo: 'nombres',
      };
      await this.botSession.update(sesion.ide_whbse, BotState.DATOS_NUEVO_CLIENTE, datos);
      await this.sendText(ideEmpr, waId,
        `No encontré tu registro en nuestro sistema.\n\n¿Cuál es tu *nombre completo*?`
      );
    }
  }

  private async handleDatosNuevoCliente(
    waId: string, phoneNumberId: string, ideWhcha: number, ideWhcue: number, ideEmpr: number,
    sesion: any, texto: string, config: any,
  ): Promise<void> {
    const datos: DatosSesion = { ...sesion.datos_sesion, productos: sesion.datos_sesion.productos || [] };
    const cliente: ClienteSesion = datos.cliente || { nombres: '', correo: '', es_cliente_registrado: false };

    if (cliente.pendiente_campo === 'nombres') {
      cliente.nombres = texto.trim();
      cliente.pendiente_campo = 'correo';
      datos.cliente = cliente;
      await this.botSession.update(sesion.ide_whbse, BotState.DATOS_NUEVO_CLIENTE, datos);
      await this.sendText(ideEmpr, waId,
        `Gracias, *${cliente.nombres}* 😊\n\n¿Cuál es tu *correo electrónico*? Lo usaremos para enviarte la cotización.`
      );
      return;
    }

    if (cliente.pendiente_campo === 'correo') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(texto.trim())) {
        await this.sendText(ideEmpr, waId,
          `Ese correo no parece válido. Por favor ingresa un *correo electrónico* correcto.`
        );
        return;
      }
      cliente.correo = texto.trim();
      delete cliente.pendiente_campo;
      datos.cliente = cliente;
      await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS, datos);
      await this.sendText(ideEmpr, waId,
        `Perfecto ✅\n\nAhora dime, ¿qué productos necesitas cotizar?\n` +
        `Escribe el *nombre del producto y la cantidad*. Cuando termines escribe *LISTO* ✅`
      );
    }
  }

  private async handleSeleccionProductos(
    waId: string, phoneNumberId: string, ideWhcha: number, ideWhcue: number, ideEmpr: number,
    sesion: any, texto: string, config: any,
  ): Promise<void> {
    const intencion = await this.botGpt.detectarIntencion(texto);
    const datos: DatosSesion = { ...sesion.datos_sesion, productos: sesion.datos_sesion.productos || [] };

    // Cliente terminó de listar
    if (intencion === 'LISTO') {
      if (datos.productos.length === 0) {
        await this.sendText(ideEmpr, waId, `Aún no has agregado ningún producto. Por favor indícame qué necesitas cotizar.`);
        return;
      }
      await this.botSession.update(sesion.ide_whbse, BotState.CONFIRMACION_PRODUCTOS, datos);
      await this.enviarResumenProductos(ideEmpr, waId, datos);
      return;
    }

    // Extraer producto y cantidad con GPT
    const extraccion = await this.botGpt.extractProductoCantidad(texto);
    if (!extraccion?.producto) {
      await this.sendText(ideEmpr, waId,
        `No entendí bien. Por favor dime el *nombre del producto* y la *cantidad*. Ej: "50 tubos de PVC 1 pulgada"\n\nCuando termines escribe *LISTO* ✅`
      );
      return;
    }

    // Buscar en BD
    const encontrados = await this.botTools.buscarProductos(extraccion.producto, ideEmpr);

    if (encontrados.length === 0) {
      datos.ultimo_producto_texto = texto;
      await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS, datos);
      await this.sendText(ideEmpr, waId,
        `No encontré el producto "*${extraccion.producto}*" en nuestro catálogo 🔍\n\n` +
        `¿Podrías describirlo de otra forma, indicar su uso o algún nombre alternativo?`
      );
      return;
    }

    if (encontrados.length === 1) {
      await this.agregarProducto(ideEmpr, waId, sesion, datos, encontrados[0], extraccion.cantidad);
    } else {
      // Múltiples resultados — mostrar lista
      const lista = encontrados
        .map((p, i) => `  ${i + 1}. ${p.nombre}${p.otro_nombre ? ` _(${p.otro_nombre})_` : ''}`)
        .join('\n');
      datos.ultimo_producto_texto = texto;
      await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS, datos);
      await this.sendText(ideEmpr, waId,
        `Encontré varios productos similares. ¿A cuál te refieres?\n\n${lista}\n\nResponde con el número.`
      );
    }
  }

  private async agregarProducto(
    ideEmpr: number, waId: string, sesion: any, datos: DatosSesion,
    producto: any, cantidad: number,
  ): Promise<void> {
    const cantidades = await this.botTools.buscarCantidadesMinimas(producto.ide_inarti, ideEmpr);
    let cantFinal = cantidad;
    let avisoMin = '';

    if (cantidades.length > 0) {
      const minimo = cantidades[0];
      if (cantidad < minimo.cantidad) {
        cantFinal = minimo.cantidad;
        avisoMin = `\n⚠️ La cantidad mínima de venta es *${minimo.cantidad} ${minimo.unidad_medida || ''}*. Se ajustó automáticamente.`;
      }
    }

    const item: ProductoSesion = {
      ide_inarti: producto.ide_inarti,
      nombre: producto.nombre,
      cantidad: cantFinal,
      unidad: producto.unidad,
    };
    datos.productos.push(item);
    await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS, datos);

    await this.sendText(ideEmpr, waId,
      `✅ Agregado: *${producto.nombre}* x *${cantFinal}${producto.unidad ? ' ' + producto.unidad : ''}*${avisoMin}\n\n` +
      `¿Deseas agregar otro producto o escribes *LISTO* para continuar?`
    );
  }

  private async enviarResumenProductos(ideEmpr: number, waId: string, datos: DatosSesion): Promise<void> {
    const lista = datos.productos
      .map((p, i) => `  ${i + 1}. ${p.nombre} — *${p.cantidad}${p.unidad ? ' ' + p.unidad : ''}*`)
      .join('\n');

    await this.sendText(ideEmpr, waId,
      `📋 *Resumen de tu cotización:*\n\n${lista}\n\n¿Confirmamos estos productos? Responde *Sí* para continuar o *No* para modificar.`
    );
  }

  private async handleConfirmacionProductos(
    waId: string, phoneNumberId: string, ideWhcha: number, ideWhcue: number, ideEmpr: number,
    sesion: any, texto: string, config: any,
  ): Promise<void> {
    const intencion = await this.botGpt.detectarIntencion(texto);
    const datos: DatosSesion = { ...sesion.datos_sesion, productos: sesion.datos_sesion.productos || [] };

    if (intencion === 'CONFIRMAR') {
      datos.envio = { pendiente_campo: 'direccion' };
      await this.botSession.update(sesion.ide_whbse, BotState.DATOS_ENVIO, datos);
      await this.sendText(ideEmpr, waId,
        `¡Perfecto! 🎉\n\nAhora necesito el *domicilio de entrega*. ¿A qué dirección enviamos? _(calle, sector, ciudad)_`
      );
      return;
    }

    if (intencion === 'CANCELAR') {
      datos.productos = [];
      await this.botSession.update(sesion.ide_whbse, BotState.SELECCION_PRODUCTOS, datos);
      await this.sendText(ideEmpr, waId,
        `De acuerdo, empecemos de nuevo. ¿Qué productos necesitas cotizar? Escribe el nombre y la cantidad.`
      );
      return;
    }

    await this.enviarResumenProductos(ideEmpr, waId, datos);
  }

  private async handleDatosEnvio(
    waId: string, phoneNumberId: string, ideWhcha: number, ideWhcue: number, ideEmpr: number,
    sesion: any, texto: string, config: any,
  ): Promise<void> {
    const datos: DatosSesion = { ...sesion.datos_sesion, productos: sesion.datos_sesion.productos || [] };
    const envio = datos.envio || {};

    if (envio.pendiente_campo === 'direccion') {
      envio.direccion = texto.trim();
      envio.pendiente_campo = 'provincia';
      datos.envio = envio;
      await this.botSession.update(sesion.ide_whbse, BotState.DATOS_ENVIO, datos);
      await this.sendText(ideEmpr, waId, `¿En qué *provincia* se realizará la entrega?`);
      return;
    }

    if (envio.pendiente_campo === 'provincia') {
      envio.provincia = texto.trim();
      envio.pendiente_campo = 'transporte';
      datos.envio = envio;
      await this.botSession.update(sesion.ide_whbse, BotState.DATOS_ENVIO, datos);
      await this.sendText(ideEmpr, waId,
        `¿Tienes preferencia de *empresa de transporte*? _(Servientrega, Laar, Speed, etc.)_\n` +
        `Si no tienes preferencia escribe *cualquiera*.`
      );
      return;
    }

    if (envio.pendiente_campo === 'transporte') {
      envio.transporte = /cualquiera|no\s*s[eé]|indiferente/i.test(texto) ? null : texto.trim();
      delete envio.pendiente_campo;

      // Verificar envío gratis
      const montoMin = config.monto_envio_gratis ?? 100;
      const esPichincha = /pichincha|quito|valles|sangolquí|machachi/i.test(envio.provincia || '');
      envio.envio_gratis = esPichincha; // el monto real lo calcula el vendedor al generar precio

      datos.envio = envio;

      // Crear proforma borrador
      const resultado = await this.botProforma.crearProformaBorrador(datos, `+${waId}`, ideEmpr, config.nombre_bot);
      datos.proforma_secuencial = resultado.secuencial;
      await this.botSession.update(sesion.ide_whbse, BotState.DATOS_ENVIO, datos);
      await this.botSession.cerrar(sesion.ide_whbse, BotState.FINALIZADO);

      // Mensaje final
      let msgEnvio = envio.envio_gratis
        ? `\n🚚 ¡Si tu pedido supera $${montoMin}, el *envío es GRATUITO* en Quito y Valles!`
        : `\n🚚 Coordinaremos el envío a *${envio.provincia}*${envio.transporte ? ` por ${envio.transporte}` : ''}.`;

      await this.sendText(ideEmpr, waId,
        `¡Listo, *${datos.cliente?.nombres}*! 🎉\n\n` +
        `Hemos registrado tu solicitud de cotización *#${resultado.secuencial}*.\n` +
        `Nuestro equipo la procesará y te enviaremos los precios a la brevedad.${msgEnvio}\n\n` +
        `📧 También recibirás una copia en *${datos.cliente?.correo}*.\n\n` +
        `¡Gracias por contactarnos! 😊`
      );

      // Notificar a agentes vía socket
      this.gateway.emitNuevaProformaBot(ideWhcue, resultado.secuencial, datos.cliente?.nombres);
    }
  }

  // ─── Derivar a asesor ─────────────────────────────────────────────────────

  async derivarAsesor(
    waId: string, phoneNumberId: string, ideWhcha: number, ideWhcue: number, ideEmpr: number,
    mensaje?: string,
  ): Promise<void> {
    // Marcar chat como modo ASESOR (el bot no volverá a responder hasta que un agente lo libere)
    await this.dataSource_silenciarChat(ideWhcha);

    const config = await this.botConfig.getConfig(ideWhcue);
    const horario = config?.horario_atencion ?? 'Lunes a Viernes de 08:00 a 17:00';

    await this.sendText(ideEmpr, waId,
      mensaje ||
      `Entendido 👍 Un asesor comercial te atenderá pronto.\n\n` +
      `*Horario de atención:* ${horario}\n\n` +
      `Si escribes fuera de ese horario, te responderemos al siguiente día hábil.`
    );

    // Notificar a agentes disponibles
    this.gateway.emitChatEsperandoAsesor(ideWhcue, waId, ideWhcha);
    this.logger.log(`Chat ${waId} derivado a asesor`);
  }

  /** Libera un chat — el bot puede responder de nuevo (llamado por el agente) */
  async liberarChat(ideWhcha: number): Promise<void> {
    await this.ycloudService.dataSource.pool.query(
      `UPDATE wha_chat SET bot_activo_whcha = TRUE, bot_modo_whcha = 'BOT' WHERE ide_whcha = $1`,
      [ideWhcha],
    );
  }

  /** Silencia el bot para un chat específico */
  private async dataSource_silenciarChat(ideWhcha: number): Promise<void> {
    await this.ycloudService.dataSource.pool.query(
      `UPDATE wha_chat SET bot_activo_whcha = FALSE, bot_modo_whcha = 'ASESOR'
       WHERE ide_whcha = $1`,
      [ideWhcha],
    );
  }

  private async sendText(ideEmpr: number, waId: string, texto: string): Promise<void> {
    const result = await this.ycloudService.sendText(ideEmpr, `+${waId}`, texto);
    // Marcar el mensaje como enviado por el bot
    if (result?.messageId) {
      await this.ycloudService.dataSource.pool.query(
        `UPDATE wha_mensaje SET es_bot_whmem = TRUE WHERE id_whmem = $1`,
        [result.messageId],
      );
    }
  }
}
