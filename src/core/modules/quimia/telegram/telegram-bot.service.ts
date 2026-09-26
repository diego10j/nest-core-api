import { randomUUID } from 'crypto';

import { Injectable, Logger } from '@nestjs/common';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { HOST_API } from 'src/util/helpers/common-util';

import { ImagenNota } from '../conocimiento/conocimiento-quimia.helper';
import { QuimiaConocimientoService } from '../conocimiento/quimia-conocimiento.service';
import { QuimiaDocumentosErpService } from '../erp/quimia-documentos-erp.service';
import { QuimiaAgenteService } from '../quimia-agente.service';
import { QuimiaProductosService } from '../quimia-productos.service';
import { ProductoCandidato, ProductoQuimia, RespuestaQuimia, UsuarioQuimia } from '../quimia.types';
import { TRANSCRIPCION_CONFIG } from '../transcripcion/transcripcion.helper';
import { TranscripcionService } from '../transcripcion/transcripcion.service';

import { ArchivoAudioTelegram, TelegramApiService, TelegramMensaje, TelegramUpdate, TelegramUsuario } from './telegram-api.service';
import { CuentaTelegram, basePublica } from './telegram-cuenta.service';
import { dividir, mismoTelefono, normalizarTelefono, notaATelegram, respuestaATelegram } from './telegram-formato.helper';

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
  pendiente: {
    pregunta: string;
    opciones?: ProductoCandidato[];
    sinRespuesta?: boolean;
    /** Notas ofrecidas ("Ver nota") con los términos a resaltar. */
    notas?: NotaPendiente[];
  } | null;
}

interface NotaPendiente {
  ide_cono: number;
  titulo: string;
  terminos: string[];
}

/** Máximo de imágenes de una nota que se envían como fotos. */
const MAX_FOTOS_NOTA = 10;

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
  '• Envíame la factura 1029 · Dame la proforma 350 (llega el PDF)',
  '• Fotos del ácido cítrico anhidro',
  '• ¿Cuál es la cuenta del Banco Pichincha? (notas de la base de conocimiento)',
  '',
  'Comandos:',
  '/producto &lt;nombre&gt; — fijar el producto de la conversación',
  '/nuevo o /salir — empezar una conversación nueva',
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
    private readonly transcripcion: TranscripcionService,
    private readonly conocimiento: QuimiaConocimientoService,
    private readonly documentosErp: QuimiaDocumentosErpService,
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

    let texto = (msg.text ?? '').trim();
    // Nota de voz / audio: se transcribe y sigue el mismo camino que un mensaje escrito.
    let audio: { ide_qmtra: number | null } | undefined;
    const archivoAudio = msg.voice ?? msg.audio;
    if (archivoAudio) {
      const transcrito = await this.transcribirAudio(cuenta, chatId, numero, archivoAudio);
      if (!transcrito) return;
      texto = transcrito.texto;
      audio = { ide_qmtra: transcrito.ide_qmtra };
    }
    if (!texto) {
      await this.api.enviarMensaje(
        cuenta.token,
        chatId,
        this.audiosHabilitados(cuenta) ? 'Envíame tu pregunta por texto o nota de voz.' : 'Por ahora solo respondo mensajes de texto.',
      );
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
          await this.api.enviarMensaje(cuenta.token, chatId, cuenta.mensaje_bienvenida_tlcue || this.ayuda(cuenta), { html: true });
          return;
        case 'nuevo':
        case 'salir':
          await this.nuevaConversacion(cuenta, chatId, numero);
          return;
        case 'producto':
          await this.fijarProducto(cuenta, chatId, numero, conv, arg.trim());
          return;
        default:
          await this.api.enviarMensaje(cuenta.token, chatId, this.ayuda(cuenta), { html: true });
          return;
      }
    }

    // "salir" / "nueva conversación" escritos sin barra también reinician.
    if (/^(salir|nuevo|nueva conversaci[oó]n|reiniciar)[.!]?$/i.test(texto)) {
      await this.nuevaConversacion(cuenta, chatId, numero);
      return;
    }

    // ---- respuestas cortas a lo que quedó pendiente (alternativa a los botones)
    const opciones = conv.pendiente?.opciones ?? [];
    if (opciones.length && /^\d{1,2}$/.test(texto) && opciones[Number(texto) - 1]) {
      const o = opciones[Number(texto) - 1];
      await this.preguntar(cuenta, chatId, numero, conv, conv.pendiente.pregunta, { producto: { ide_inarti: o.ide_inarti, nombre: o.nombre }, audio });
      return;
    }
    const notas = conv.pendiente?.notas ?? [];
    const pideNota = texto.match(/^(?:ver\s+)?nota\s*(\d)$/i) ?? (!opciones.length ? texto.match(/^(\d)$/) : null);
    if (notas.length && pideNota && notas[Number(pideNota[1]) - 1]) {
      const n = notas[Number(pideNota[1]) - 1];
      await this.mostrarNota(cuenta, chatId, n.ide_cono, n.terminos);
      return;
    }
    if (conv.pendiente?.sinRespuesta && /^(ia|si|sí)[.!]?$/i.test(texto)) {
      await this.preguntar(cuenta, chatId, numero, conv, conv.pendiente.pregunta, { modo: 'IA_GENERAL', audio });
      return;
    }
    if (conv.pendiente && /^(no|no gracias|no, gracias)[.!]?$/i.test(texto)) {
      conv.pendiente = null;
      await this.guardarConversacion(cuenta, chatId, numero.ide_tlusu, conv);
      await this.api.enviarMensaje(cuenta.token, chatId, 'Entendido 👍 ¿Algo más?');
      return;
    }

    await this.preguntar(cuenta, chatId, numero, conv, texto, { audio });
  }

  /**
   * Botones en línea: p:<ide_inarti> (elegir/cambiar producto) · ia (responder con IA general) · no.
   * Al tocar uno se quitan los botones de elección de ese mensaje (se conservan los links a
   * documentos) y se deja constancia de lo elegido, porque tocar un botón no aparece en el chat.
   */
  private async procesarBoton(cuenta: CuentaTelegram, cb: NonNullable<TelegramUpdate['callback_query']>) {
    await this.api.responderCallback(cuenta.token, cb.id);
    const chatId = cb.message?.chat.id;
    if (!chatId) return;
    const numero = await this.getNumeroVinculado(cuenta, cb.from.id);
    if (!numero?.activo_tlusu) return;
    const data = cb.data ?? '';

    // Ver nota: se quita solo ese botón (se pueden abrir las demás notas después).
    if (data.startsWith('k:')) {
      const ideCono = Number(data.slice(2));
      const filas = (cb.message?.reply_markup?.inline_keyboard ?? [])
        .map((fila) => fila.filter((b) => b.callback_data !== data))
        .filter((fila) => fila.length);
      const quedanNotas = filas.some((f) => f.some((b) => b.callback_data?.startsWith('k:')));
      const otras = filas.some((f) => f.some((b) => b.callback_data && !b.callback_data.startsWith('k:') && b.callback_data !== 'no'));
      // Si ya no quedan notas ni otras opciones, el "No, gracias" sobra.
      await this.api.editarBotones(
        cuenta.token,
        chatId,
        cb.message.message_id,
        quedanNotas || otras ? filas : filas.map((f) => f.filter((b) => b.url)).filter((f) => f.length),
      );
      const conv = await this.getConversacion(cuenta, chatId, numero.ide_tlusu);
      const terminos = conv.pendiente?.notas?.find((n) => n.ide_cono === ideCono)?.terminos ?? [];
      await this.mostrarNota(cuenta, chatId, ideCono, terminos);
      return;
    }

    const soloLinks = (cb.message?.reply_markup?.inline_keyboard ?? [])
      .map((fila) => fila.filter((b) => b.url))
      .filter((fila) => fila.length);
    await this.api.editarBotones(cuenta.token, chatId, cb.message.message_id, soloLinks);

    const conv = await this.getConversacion(cuenta, chatId, numero.ide_tlusu);
    const pregunta = conv.pendiente?.pregunta;

    if (data.startsWith('p:')) {
      const producto = await this.productos.getProducto(Number(data.slice(2)), cuenta.ide_empr);
      if (!producto) return;
      await this.api.enviarMensaje(cuenta.token, chatId, `✅ ${producto.nombre}`);
      if (!pregunta) {
        conv.producto = producto;
        await this.guardarConversacion(cuenta, chatId, numero.ide_tlusu, conv);
        await this.api.enviarMensaje(cuenta.token, chatId, '¿Qué quieres saber de este producto?');
        return;
      }
      await this.preguntar(cuenta, chatId, numero, conv, pregunta, { producto });
    } else if (data === 'ia' && pregunta) {
      await this.api.enviarMensaje(cuenta.token, chatId, '✨ Respondiendo con IA general…');
      await this.preguntar(cuenta, chatId, numero, conv, pregunta, { modo: 'IA_GENERAL' });
    } else if (data === 'no') {
      conv.pendiente = null;
      await this.guardarConversacion(cuenta, chatId, numero.ide_tlusu, conv);
      await this.api.enviarMensaje(cuenta.token, chatId, 'Entendido 👍 ¿Algo más?');
    }
  }

  /**
   * Nota de voz → texto (Groq y, si no entiende, OpenAI). Devuelve null si no se pudo usar el audio
   * (deshabilitado, muy largo, no entendido); en ese caso ya se respondió al usuario.
   */
  private async transcribirAudio(
    cuenta: CuentaTelegram,
    chatId: number,
    numero: NumeroAutorizado,
    archivo: ArchivoAudioTelegram,
  ): Promise<{ texto: string; ide_qmtra: number | null } | null> {
    if (!this.audiosHabilitados(cuenta)) {
      await this.api.enviarMensaje(cuenta.token, chatId, '🎙️ Las notas de voz no están habilitadas. Escríbeme tu pregunta, por favor.');
      return null;
    }
    const maxSeg = cuenta.audio_max_seg_tlcue || 180;
    if (archivo.duration > maxSeg) {
      await this.api.enviarMensaje(
        cuenta.token,
        chatId,
        `🎙️ El audio dura ${Math.round(archivo.duration)} s. Envía uno de hasta ${maxSeg} s o escribe tu pregunta.`,
      );
      return null;
    }
    if ((archivo.file_size ?? 0) > TRANSCRIPCION_CONFIG.MAX_BYTES_TELEGRAM) {
      await this.api.enviarMensaje(cuenta.token, chatId, '🎙️ El audio es demasiado grande (máximo 20 MB).');
      return null;
    }

    await this.api.escribiendo(cuenta.token, chatId);
    const buffer = await this.api.descargarArchivo(cuenta.token, archivo.file_id);
    const r = await this.transcripcion.transcribir({
      audio: buffer,
      mime: archivo.mime_type || 'audio/ogg',
      duracionSeg: archivo.duration,
      origen: 'TELEGRAM',
      ideEmpr: cuenta.ide_empr,
      usuario: (cuenta.usuario_erp_tlcue || 'TELEGRAM').slice(0, 50),
      telefono: numero.telefono_tlusu,
      groqApiKey: cuenta.groq_api_key || null,
      respaldoOpenai: cuenta.audio_respaldo_openai_tlcue !== false,
      vocabulario: cuenta.audio_vocabulario_tlcue,
    });
    if (!r.texto) {
      await this.api.enviarMensaje(
        cuenta.token,
        chatId,
        '🎙️ No pude entender el audio. ¿Puedes repetirlo con menos ruido o escribir tu pregunta?',
      );
      return null;
    }
    if (cuenta.audio_mostrar_texto_tlcue !== false) {
      await this.api.enviarMensaje(cuenta.token, chatId, `🎙️ Entendí: «${r.texto}»`);
    }
    return { texto: r.texto.slice(0, 1000), ide_qmtra: r.ide_qmtra };
  }

  private ayuda(cuenta: CuentaTelegram): string {
    return this.audiosHabilitados(cuenta) ? `${AYUDA}\n\n🎙️ También puedes enviarme notas de voz.` : AYUDA;
  }

  /** Notas de voz: activadas en la cuenta Y con API key de Groq configurada (sin Groq no se admiten). */
  private audiosHabilitados(cuenta: CuentaTelegram): boolean {
    return !!cuenta.audio_activo_tlcue && !!cuenta.groq_api_key;
  }

  private async nuevaConversacion(cuenta: CuentaTelegram, chatId: number, numero: NumeroAutorizado) {
    await this.guardarConversacion(cuenta, chatId, numero.ide_tlusu, {
      sesion: randomUUID(),
      producto: null,
      historial: [],
      pendiente: null,
    });
    await this.api.enviarMensaje(cuenta.token, chatId, '🆕 Conversación nueva: olvidé el producto y el historial. ¿Qué necesitas saber?');
  }

  // ------------------------------------------------------------------ QuimIA

  private async preguntar(
    cuenta: CuentaTelegram,
    chatId: number,
    numero: NumeroAutorizado,
    conv: Conversacion,
    pregunta: string,
    opciones: { producto?: ProductoQuimia; modo?: 'AGENTE' | 'IA_GENERAL'; audio?: { ide_qmtra: number | null } } = {},
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
      {
        telefono: numero.telefono_tlusu,
        ide_tlusu: numero.ide_tlusu,
        entrada: opciones.audio ? 'AUDIO' : 'TEXTO',
        ide_qmtra: opciones.audio?.ide_qmtra ?? null,
      },
    );

    // Estado para la siguiente pregunta: producto activo, historial y lo pendiente (botones).
    const textoLimpio = r.texto.replace(/\s?\[[^\]]*\]\(#cita-[\d-]+\)/g, '').slice(0, 3000);
    conv.producto = r.producto ?? producto ?? null;
    conv.historial = [...conv.historial, { role: 'user' as const, contenido: pregunta }, { role: 'assistant' as const, contenido: textoLimpio }].slice(-10);
    conv.pendiente =
      r.opciones.length || r.sinRespuesta || r.sugerirCambio || r.notas.length
        ? {
            pregunta,
            opciones: r.opciones.length ? r.opciones : r.sugerirCambio ? [r.sugerirCambio] : undefined,
            sinRespuesta: r.sinRespuesta,
            notas: r.notas.length ? r.notas.map((n) => ({ ide_cono: n.ide_cono, titulo: n.titulo, terminos: n.terminos })) : undefined,
          }
        : null;
    await this.guardarConversacion(cuenta, chatId, numero.ide_tlusu, conv);

    const { mensajes, botones } = respuestaATelegram(r, (url) => this.urlPublica(cuenta, url));
    for (let i = 0; i < mensajes.length; i++) {
      const ultimo = i === mensajes.length - 1;
      await this.enviarHtml(cuenta, chatId, mensajes[i], ultimo ? botones : []);
    }
    await this.enviarAdjuntos(cuenta, chatId, r, usuario);

    await this.dataSource.pool.query(
      `UPDATE tlg_usuario SET ultimo_acceso_tlusu = NOW(), total_consultas_tlusu = total_consultas_tlusu + 1 WHERE ide_tlusu = $1`,
      [numero.ide_tlusu],
    );
  }

  /** PDFs de factura/proforma como documentos y fotos del producto como fotos normales. */
  private async enviarAdjuntos(cuenta: CuentaTelegram, chatId: number, r: RespuestaQuimia, usuario: UsuarioQuimia) {
    for (const a of r.archivos) {
      try {
        await this.api.escribiendo(cuenta.token, chatId);
        const pdf = await this.documentosErp.generarPdf(a, usuario);
        await this.api.enviarDocumento(cuenta.token, chatId, { buffer: pdf, nombre: a.nombreArchivo, mime: 'application/pdf' }, `${a.titulo}\n${a.detalle}`);
      } catch (error) {
        this.logger.warn(`PDF ${a.titulo}: ${(error as Error).message}`);
        await this.api.enviarMensaje(cuenta.token, chatId, `📄 No se pudo generar el PDF de ${a.titulo}.`).catch(() => undefined);
      }
    }
    for (const img of r.imagenes) {
      const foto = this.documentosErp.leerFoto(img.archivo);
      if (!foto) continue;
      await this.api.enviarFoto(cuenta.token, chatId, foto, img.producto).catch((error) => {
        this.logger.warn(`Foto ${img.archivo}: ${(error as Error).message}`);
      });
    }
  }

  /**
   * Muestra una nota de la base de conocimiento: texto con las coincidencias en negrilla y luego sus
   * imágenes como fotos normales (se suben desde el disco; si es una URL externa la descarga Telegram).
   */
  private async mostrarNota(cuenta: CuentaTelegram, chatId: number, ideCono: number, terminos: string[]) {
    await this.api.escribiendo(cuenta.token, chatId);
    const nota = await this.conocimiento.obtener({ ide_cono: ideCono }, cuenta.ide_empr);
    if (!nota) {
      await this.api.enviarMensaje(cuenta.token, chatId, 'La nota ya no existe o fue archivada.');
      return;
    }
    for (const html of notaATelegram(nota, terminos)) {
      await this.enviarHtml(cuenta, chatId, html, []);
    }
    for (const img of nota.imagenes.slice(0, MAX_FOTOS_NOTA)) {
      await this.enviarImagen(cuenta, chatId, img);
    }
    if (nota.imagenes.length > MAX_FOTOS_NOTA) {
      await this.api.enviarMensaje(cuenta.token, chatId, `La nota tiene ${nota.imagenes.length} imágenes; se enviaron las primeras ${MAX_FOTOS_NOTA}.`);
    }
  }

  private async enviarImagen(cuenta: CuentaTelegram, chatId: number, img: ImagenNota) {
    try {
      const archivo = await this.conocimiento.leerImagen(img);
      if (archivo) {
        await this.api.enviarFoto(cuenta.token, chatId, archivo, img.pie);
        return;
      }
      if (/^https?:\/\//i.test(img.url)) {
        await this.api.enviarFoto(cuenta.token, chatId, this.urlPublica(cuenta, img.url), img.pie);
      }
    } catch (error) {
      this.logger.warn(`Imagen de nota (${img.url}): ${(error as Error).message}`);
      await this.api
        .enviarMensaje(cuenta.token, chatId, `🖼️ No se pudo enviar una imagen${img.pie ? ` (${img.pie})` : ''} de la nota.`)
        .catch(() => undefined);
    }
  }

  /**
   * Los links a PDFs se arman con HOST_API (puede ser una IP interna). Para Telegram se reemplaza
   * esa base por la URL pública de la cuenta, así abren desde cualquier celular.
   */
  private urlPublica(cuenta: CuentaTelegram, url: string): string {
    const interna = HOST_API().replace(/\/+$/, '');
    const publica = basePublica(cuenta.url_publica_tlcue);
    return url.startsWith(interna) ? publica + url.slice(interna.length) : url;
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
    const encontrados = await this.productos.buscar(texto, usuario);
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
    await this.api.enviarMensaje(cuenta.token, chatId, cuenta.mensaje_bienvenida_tlcue || this.ayuda(cuenta), { html: true });
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
