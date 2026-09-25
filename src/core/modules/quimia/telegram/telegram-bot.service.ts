import { randomUUID } from 'crypto';

import { Injectable, Logger } from '@nestjs/common';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { QuimiaAgenteService } from '../quimia-agente.service';
import { QuimiaProductosService } from '../quimia-productos.service';
import { ProductoCandidato, ProductoQuimia, RespuestaQuimia, UsuarioQuimia } from '../quimia.types';

import { TelegramApiService, TelegramMensaje, TelegramUpdate, TelegramUsuario } from './telegram-api.service';
import { CuentaTelegram } from './telegram-cuenta.service';
import { dividir, mismoTelefono, normalizarTelefono, respuestaATelegram } from './telegram-formato.helper';

interface NumeroAutorizado {
  ide_tlusu: number;
  telefono_tlusu: string;
  alias_tlusu: string;
  activo_tlusu: boolean;
}

interface Conversacion {
  sesion: string;
  producto: ProductoQuimia | null;
  historial: { role: 'user' | 'assistant'; contenido: string }[];
  pendiente: { pregunta: string; opciones?: ProductoCandidato[]; sinRespuesta?: boolean } | null;
}

const TECLADO_CONTACTO = {
  keyboard: [[{ text: '📱 Compartir mi número', request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};

const AYUDA = [
  '<b>QuimIA · DIQUIMEC</b>',
  'Escríbeme tu pregunta, por ejemplo:',
  '• ¿Cuánto stock hay de ácido cítrico anhidro?',
  '• Dame los últimos 3 COA del colágeno Novaprot',
  '• ¿A qué precio cotizo 25 kg de vitamina E acetato?',
  '• ¿Cuánto debe Laboratorios ABC y cada cuánto compra?',
  '• ¿Qué transporte lleva a Loja? ¿Cuánto cuesta enviar 5 kg?',
  '',
  'Comandos:',
  '/producto &lt;nombre&gt; — fijar el producto de la conversación',
  '/nuevo — empezar una conversación nueva',
  '/ayuda — ver esta ayuda',
].join('\n');

/**
 * Bot de Telegram de QuimIA: autoriza por número de teléfono (tlg_usuario), mantiene el estado de
 * cada chat (tlg_conversacion) y responde con el mismo núcleo que el chat del ERP
 * (QuimiaAgenteService.preguntar), registrando el teléfono de quien pregunta.
 */
@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger(TelegramBotService.name);

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly api: TelegramApiService,
    private readonly agente: QuimiaAgenteService,
    private readonly productos: QuimiaProductosService,
  ) {}

  async procesarUpdate(cuenta: CuentaTelegram, update: TelegramUpdate): Promise<void> {
    try {
      if (update.callback_query) {
        await this.procesarBoton(cuenta, update.callback_query);
      } else if (update.message) {
        await this.procesarMensaje(cuenta, update.message);
      }
    } catch (error) {
      this.logger.error(`Telegram update ${update.update_id}: ${(error as Error).message}`, (error as Error).stack);
      const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
      if (chatId) {
        await this.api
          .enviarMensaje(cuenta.token, chatId, 'Ocurrió un error al procesar tu consulta. Intenta nuevamente.')
          .catch(() => undefined);
      }
    }
  }

  // ------------------------------------------------------------------ mensajes

  private async procesarMensaje(cuenta: CuentaTelegram, msg: TelegramMensaje) {
    if (msg.chat.type !== 'private' || !msg.from) return; // solo chats privados
    const chatId = msg.chat.id;

    if (msg.contact) {
      await this.vincular(cuenta, msg);
      return;
    }

    const numero = await this.getNumeroVinculado(cuenta, msg.from.id);
    if (!numero) {
      await this.api.enviarMensaje(
        cuenta.token,
        chatId,
        '👋 Hola. Para usar QuimIA necesito verificar tu número.\nToca <b>Compartir mi número</b> abajo.',
        { html: true, teclado: TECLADO_CONTACTO },
      );
      return;
    }
    if (!numero.activo_tlusu) {
      await this.api.enviarMensaje(cuenta.token, chatId, '⛔ Tu acceso a QuimIA está desactivado. Consulta con el administrador.');
      return;
    }

    const texto = (msg.text ?? '').trim();
    if (!texto) {
      await this.api.enviarMensaje(cuenta.token, chatId, 'Por ahora solo respondo mensajes de texto.');
      return;
    }

    const conv = await this.getConversacion(cuenta, chatId, numero.ide_tlusu);

    // ---- comandos
    const comando = texto.match(/^\/(\w+)(?:@\w+)?\s*(.*)$/s);
    if (comando) {
      const [, nombre, arg] = comando;
      switch (nombre.toLowerCase()) {
        case 'start':
        case 'ayuda':
        case 'help':
          await this.api.enviarMensaje(cuenta.token, chatId, cuenta.mensaje_bienvenida_tlcue || AYUDA, { html: true });
          return;
        case 'nuevo':
          await this.guardarConversacion(cuenta, chatId, numero.ide_tlusu, { sesion: randomUUID(), producto: null, historial: [], pendiente: null });
          await this.api.enviarMensaje(cuenta.token, chatId, '🆕 Conversación nueva. ¿Qué necesitas saber?');
          return;
        case 'producto':
          await this.fijarProducto(cuenta, chatId, numero, conv, arg.trim());
          return;
        default:
          await this.api.enviarMensaje(cuenta.token, chatId, AYUDA, { html: true });
          return;
      }
    }

    // ---- respuestas cortas a lo que quedó pendiente (alternativa a los botones)
    const opciones = conv.pendiente?.opciones ?? [];
    if (opciones.length && /^\d{1,2}$/.test(texto) && opciones[Number(texto) - 1]) {
      const o = opciones[Number(texto) - 1];
      await this.preguntar(cuenta, chatId, numero, conv, conv.pendiente.pregunta, { producto: { ide_inarti: o.ide_inarti, nombre: o.nombre } });
      return;
    }
    if (conv.pendiente?.sinRespuesta && /^(ia|si|sí)$/i.test(texto)) {
      await this.preguntar(cuenta, chatId, numero, conv, conv.pendiente.pregunta, { modo: 'IA_GENERAL' });
      return;
    }

    await this.preguntar(cuenta, chatId, numero, conv, texto);
  }

  /** Botones en línea: p:<ide_inarti> (elegir/cambiar producto) · ia (responder con IA general). */
  private async procesarBoton(cuenta: CuentaTelegram, cb: NonNullable<TelegramUpdate['callback_query']>) {
    await this.api.responderCallback(cuenta.token, cb.id);
    const chatId = cb.message?.chat.id;
    if (!chatId) return;
    const numero = await this.getNumeroVinculado(cuenta, cb.from.id);
    if (!numero?.activo_tlusu) return;

    const conv = await this.getConversacion(cuenta, chatId, numero.ide_tlusu);
    const pregunta = conv.pendiente?.pregunta;
    const data = cb.data ?? '';

    if (data.startsWith('p:')) {
      const producto = await this.productos.getProducto(Number(data.slice(2)), cuenta.ide_empr);
      if (!producto) return;
      if (!pregunta) {
        conv.producto = producto;
        await this.guardarConversacion(cuenta, chatId, numero.ide_tlusu, conv);
        await this.api.enviarMensaje(cuenta.token, chatId, `🧪 Producto: ${producto.nombre}. ¿Qué quieres saber?`);
        return;
      }
      await this.preguntar(cuenta, chatId, numero, conv, pregunta, { producto });
    } else if (data === 'ia' && pregunta) {
      await this.preguntar(cuenta, chatId, numero, conv, pregunta, { modo: 'IA_GENERAL' });
    }
  }

  // ------------------------------------------------------------------ QuimIA

  private async preguntar(
    cuenta: CuentaTelegram,
    chatId: number,
    numero: NumeroAutorizado,
    conv: Conversacion,
    pregunta: string,
    opciones: { producto?: ProductoQuimia; modo?: 'AGENTE' | 'IA_GENERAL' } = {},
  ) {
    await this.api.escribiendo(cuenta.token, chatId);
    const producto = opciones.producto ?? conv.producto;
    const usuario: UsuarioQuimia = {
      ideEmpr: cuenta.ide_empr,
      ideSucu: cuenta.ide_sucu ?? 0,
      ideUsua: 0,
      idePerf: 0,
      login: (cuenta.usuario_erp_tlcue || 'TELEGRAM').slice(0, 30),
    };

    const r: RespuestaQuimia = await this.agente.preguntar(
      {
        sesion: conv.sesion,
        pregunta: pregunta.slice(0, 1000),
        ide_inarti: producto?.ide_inarti,
        modo: opciones.modo ?? 'AGENTE',
        historial: conv.historial,
      },
      usuario,
      'TELEGRAM',
      { telefono: numero.telefono_tlusu, ide_tlusu: numero.ide_tlusu },
    );

    // Estado para la siguiente pregunta: producto activo, historial y lo pendiente (botones).
    const textoLimpio = r.texto.replace(/\s?\[[^\]]*\]\(#cita-[\d-]+\)/g, '').slice(0, 3000);
    conv.producto = r.producto ?? producto ?? null;
    conv.historial = [...conv.historial, { role: 'user' as const, contenido: pregunta }, { role: 'assistant' as const, contenido: textoLimpio }].slice(-10);
    conv.pendiente =
      r.opciones.length || r.sinRespuesta || r.sugerirCambio
        ? { pregunta, opciones: r.opciones.length ? r.opciones : r.sugerirCambio ? [r.sugerirCambio] : undefined, sinRespuesta: r.sinRespuesta }
        : null;
    await this.guardarConversacion(cuenta, chatId, numero.ide_tlusu, conv);

    const { mensajes, botones } = respuestaATelegram(r);
    for (let i = 0; i < mensajes.length; i++) {
      const ultimo = i === mensajes.length - 1;
      await this.enviarHtml(cuenta, chatId, mensajes[i], ultimo ? botones : []);
    }

    await this.dataSource.pool.query(
      `UPDATE tlg_usuario SET ultimo_acceso_tlusu = NOW(), total_consultas_tlusu = total_consultas_tlusu + 1 WHERE ide_tlusu = $1`,
      [numero.ide_tlusu],
    );
  }

  /** HTML con respaldo en texto plano si Telegram rechaza el formato (etiqueta mal cerrada). */
  private async enviarHtml(cuenta: CuentaTelegram, chatId: number, html: string, botones: { text: string; url?: string; callback_data?: string }[][]) {
    try {
      await this.api.enviarMensaje(cuenta.token, chatId, html, { html: true, botones });
    } catch (error) {
      this.logger.warn(`HTML rechazado por Telegram (${(error as Error).message}); se envía como texto`);
      const plano = html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      for (const parte of dividir(plano)) {
        await this.api.enviarMensaje(cuenta.token, chatId, parte, { botones });
      }
    }
  }

  private async fijarProducto(cuenta: CuentaTelegram, chatId: number, numero: NumeroAutorizado, conv: Conversacion, texto: string) {
    if (!texto) {
      await this.api.enviarMensaje(
        cuenta.token,
        chatId,
        conv.producto ? `🧪 Producto actual: ${conv.producto.nombre}\nUsa /producto <nombre> para cambiarlo.` : 'Usa /producto <nombre>, por ejemplo: /producto acido citrico',
      );
      return;
    }
    const usuario = { ideEmpr: cuenta.ide_empr, ideSucu: cuenta.ide_sucu ?? 0, ideUsua: 0, idePerf: 0, login: 'TELEGRAM' };
    const encontrados = await this.productos.buscar(texto, usuario, 8);
    if (!encontrados.length) {
      await this.api.enviarMensaje(cuenta.token, chatId, `No encontré productos con "${texto}".`);
      return;
    }
    if (encontrados.length === 1) {
      conv.producto = { ide_inarti: encontrados[0].ide_inarti, nombre: encontrados[0].nombre };
      conv.pendiente = null;
      await this.guardarConversacion(cuenta, chatId, numero.ide_tlusu, conv);
      await this.api.enviarMensaje(cuenta.token, chatId, `🧪 Producto: ${encontrados[0].nombre}. ¿Qué quieres saber?`);
      return;
    }
    conv.pendiente = null;
    await this.guardarConversacion(cuenta, chatId, numero.ide_tlusu, conv);
    await this.api.enviarMensaje(cuenta.token, chatId, '¿Cuál producto?', {
      botones: encontrados.map((p) => [{ text: `🧪 ${p.nombre}`.slice(0, 60), callback_data: `p:${p.ide_inarti}` }]),
    });
  }

  // ------------------------------------------------------------------ autorización por número

  /**
   * El usuario compartió su contacto. Solo se acepta su PROPIO número (contact.user_id = from.id) y
   * debe estar registrado y activo en tlg_usuario para esta cuenta.
   */
  private async vincular(cuenta: CuentaTelegram, msg: TelegramMensaje) {
    const chatId = msg.chat.id;
    const from = msg.from as TelegramUsuario;
    if (msg.contact.user_id !== from.id) {
      await this.api.enviarMensaje(cuenta.token, chatId, 'Comparte tu propio número con el botón de abajo.', { teclado: TECLADO_CONTACTO });
      return;
    }
    const telefono = normalizarTelefono(msg.contact.phone_number);
    const r = await this.dataSource.pool.query<NumeroAutorizado>(
      `SELECT ide_tlusu, telefono_tlusu, alias_tlusu, activo_tlusu FROM tlg_usuario WHERE ide_tlcue = $1`,
      [cuenta.ide_tlcue],
    );
    const numero = r.rows.find((n) => mismoTelefono(n.telefono_tlusu, telefono));
    const quitarTeclado = { remove_keyboard: true };

    if (!numero || !numero.activo_tlusu) {
      this.logger.warn(`Telegram: número no autorizado ${telefono} (user ${from.id})`);
      await this.api.enviarMensaje(
        cuenta.token,
        chatId,
        `⛔ El número ${telefono} no está autorizado para usar QuimIA. Pide al administrador que lo registre.`,
        { teclado: quitarTeclado },
      );
      return;
    }

    await this.dataSource.pool.query(
      `UPDATE tlg_usuario SET chat_id_tlusu = $2, telegram_user_id_tlusu = $3, telegram_username_tlusu = $4,
              fecha_vinculacion_tlusu = NOW(), ultimo_acceso_tlusu = NOW()
        WHERE ide_tlusu = $1`,
      [numero.ide_tlusu, chatId, from.id, from.username ?? null],
    );
    await this.api.enviarMensaje(cuenta.token, chatId, `✅ Listo, ${numero.alias_tlusu}. Tu número quedó verificado.`, {
      teclado: quitarTeclado,
    });
    await this.api.enviarMensaje(cuenta.token, chatId, cuenta.mensaje_bienvenida_tlcue || AYUDA, { html: true });
  }

  private async getNumeroVinculado(cuenta: CuentaTelegram, telegramUserId: number): Promise<NumeroAutorizado | null> {
    const r = await this.dataSource.pool.query<NumeroAutorizado>(
      `SELECT ide_tlusu, telefono_tlusu, alias_tlusu, activo_tlusu
         FROM tlg_usuario WHERE ide_tlcue = $1 AND telegram_user_id_tlusu = $2
        ORDER BY activo_tlusu DESC LIMIT 1`,
      [cuenta.ide_tlcue, telegramUserId],
    );
    return r.rows[0] ?? null;
  }

  // ------------------------------------------------------------------ estado del chat

  private async getConversacion(cuenta: CuentaTelegram, chatId: number, ideTlusu: number): Promise<Conversacion> {
    const r = await this.dataSource.pool.query(
      `SELECT sesion_tlcon, ide_inarti, nombre_producto_tlcon, historial_tlcon, pendiente_tlcon
         FROM tlg_conversacion WHERE ide_tlcue = $1 AND chat_id_tlcon = $2`,
      [cuenta.ide_tlcue, chatId],
    );
    const c = r.rows[0];
    if (!c) {
      const nueva: Conversacion = { sesion: randomUUID(), producto: null, historial: [], pendiente: null };
      await this.guardarConversacion(cuenta, chatId, ideTlusu, nueva);
      return nueva;
    }
    return {
      sesion: c.sesion_tlcon,
      producto: c.ide_inarti ? { ide_inarti: c.ide_inarti, nombre: c.nombre_producto_tlcon } : null,
      historial: c.historial_tlcon ?? [],
      pendiente: c.pendiente_tlcon ?? null,
    };
  }

  private async guardarConversacion(cuenta: CuentaTelegram, chatId: number, ideTlusu: number, conv: Conversacion) {
    await this.dataSource.pool.query(
      `INSERT INTO tlg_conversacion (ide_tlcue, chat_id_tlcon, ide_tlusu, sesion_tlcon, ide_inarti, nombre_producto_tlcon,
                                     historial_tlcon, pendiente_tlcon, fecha_actua)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (ide_tlcue, chat_id_tlcon) DO UPDATE SET
         ide_tlusu = EXCLUDED.ide_tlusu, sesion_tlcon = EXCLUDED.sesion_tlcon, ide_inarti = EXCLUDED.ide_inarti,
         nombre_producto_tlcon = EXCLUDED.nombre_producto_tlcon, historial_tlcon = EXCLUDED.historial_tlcon,
         pendiente_tlcon = EXCLUDED.pendiente_tlcon, fecha_actua = NOW()`,
      [
        cuenta.ide_tlcue,
        chatId,
        ideTlusu,
        conv.sesion,
        conv.producto?.ide_inarti ?? null,
        conv.producto?.nombre ?? null,
        JSON.stringify(conv.historial),
        conv.pendiente ? JSON.stringify(conv.pendiente) : null,
      ],
    );
  }
}
