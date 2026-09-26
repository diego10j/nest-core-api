import { createHash } from 'crypto';

import { Injectable, Logger } from '@nestjs/common';
import OpenAI, { toFile } from 'openai';
import { envs } from 'src/config/envs';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { TRANSCRIPCION_CONFIG, evaluarTranscripcion } from './transcripcion.helper';

export interface SolicitudTranscripcion {
  audio: Buffer;
  mime: string;
  /** Duración informada por el canal (Telegram la envía); se usa para costo y validaciones. */
  duracionSeg?: number | null;
  origen: 'TELEGRAM';
  ideEmpr: number;
  usuario: string;
  telefono?: string | null;
  /** API key de Groq (la de la cuenta de Telegram). Obligatoria: sin ella no se transcribe. */
  groqApiKey?: string | null;
  /** Usar OpenAI si Groq falla o no entiende el audio. */
  respaldoOpenai: boolean;
  /** Términos propios que mejoran la transcripción (nombres de productos, marcas…). */
  vocabulario?: string | null;
}

export interface ResultadoTranscripcion {
  /** null = no se entendió el audio (silencio, ruido, idioma incomprensible). */
  texto: string | null;
  proveedor: 'GROQ' | 'OPENAI' | null;
  modelo: string | null;
  duracionSeg: number | null;
  costoUsd: number;
  desdeCache: boolean;
  respaldo: boolean;
  motivoRespaldo: string | null;
  ide_qmtra: number | null;
}

interface Intento {
  texto: string | null;
  motivo: string | null;
  duracion: number | null;
}

/**
 * Transcripción de notas de voz para QuimIA (hoy solo Telegram):
 * 1. Groq whisper-large-v3-turbo (~$0.04/hora) — principal.
 * 2. OpenAI gpt-4o-mini-transcribe (~$0.003/min) — solo como respaldo cuando Groq falla o el
 *    resultado no es confiable (vacío, silencio, frase alucinada, baja confianza). Sin API key de
 *    Groq no se transcribe (no se usa OpenAI en su lugar).
 * El mismo audio (misma huella sha256) no se vuelve a pagar: se devuelve desde qmi_transcripcion.
 */
@Injectable()
export class TranscripcionService {
  private readonly logger = new Logger(TranscripcionService.name);
  private readonly openai = new OpenAI({ apiKey: envs.openaiApiKey });

  constructor(private readonly dataSource: DataSourceService) {}

  async transcribir(s: SolicitudTranscripcion): Promise<ResultadoTranscripcion> {
    const inicio = Date.now();
    const hash = createHash('sha256').update(s.audio).digest('hex');

    const cache = await this.dataSource.pool.query(
      `SELECT ide_qmtra, texto_qmtra, proveedor_qmtra, modelo_qmtra, duracion_seg_qmtra
         FROM qmi_transcripcion
        WHERE ide_empr = $1 AND hash_qmtra = $2 AND texto_qmtra IS NOT NULL
        ORDER BY ide_qmtra DESC LIMIT 1`,
      [s.ideEmpr, hash],
    );
    if (cache.rows.length) {
      const c = cache.rows[0];
      return {
        texto: c.texto_qmtra,
        proveedor: c.proveedor_qmtra,
        modelo: c.modelo_qmtra,
        duracionSeg: c.duracion_seg_qmtra !== null ? Number(c.duracion_seg_qmtra) : s.duracionSeg ?? null,
        costoUsd: 0,
        desdeCache: true,
        respaldo: false,
        motivoRespaldo: null,
        ide_qmtra: c.ide_qmtra,
      };
    }

    const prompt = this.promptVocabulario(s.vocabulario);
    let proveedor: 'GROQ' | 'OPENAI' | null = null;
    let modelo: string | null = null;
    let costo = 0;
    let motivoRespaldo: string | null = null;
    let resultado: Intento = { texto: null, motivo: null, duracion: s.duracionSeg ?? null };

    // ---- 1. Groq
    if (s.groqApiKey) {
      try {
        resultado = await this.transcribirGroq(s, prompt);
        proveedor = 'GROQ';
        modelo = TRANSCRIPCION_CONFIG.MODELO_GROQ;
        // Groq factura mínimo 10 s por solicitud.
        costo += (Math.max(resultado.duracion ?? s.duracionSeg ?? 10, 10) / 3600) * TRANSCRIPCION_CONFIG.COSTO_GROQ_HORA;
        motivoRespaldo = resultado.texto ? null : resultado.motivo;
      } catch (error) {
        motivoRespaldo = `ERROR_GROQ: ${(error as Error).message}`.slice(0, 200);
        this.logger.warn(`Groq no transcribió: ${(error as Error).message}`);
      }
    } else {
      // Sin Groq no se transcribe: OpenAI es solo respaldo de Groq, no reemplazo.
      motivoRespaldo = 'SIN_GROQ_API_KEY';
    }

    // ---- 2. OpenAI (respaldo)
    let respaldo = false;
    if (!resultado.texto && s.respaldoOpenai && s.groqApiKey) {
      respaldo = true;
      try {
        const r = await this.transcribirOpenai(s, prompt);
        proveedor = 'OPENAI';
        modelo = TRANSCRIPCION_CONFIG.MODELO_OPENAI;
        costo += ((r.duracion ?? s.duracionSeg ?? 10) / 60) * TRANSCRIPCION_CONFIG.COSTO_OPENAI_MIN;
        resultado = { ...r, duracion: resultado.duracion ?? r.duracion };
      } catch (error) {
        this.logger.error(`OpenAI no transcribió: ${(error as Error).message}`);
        resultado = { texto: null, motivo: 'ERROR_OPENAI', duracion: resultado.duracion };
      }
    }

    const texto = resultado.texto;
    let ide: number | null = null;
    try {
      const r = await this.dataSource.pool.query(
        `INSERT INTO qmi_transcripcion (hash_qmtra, origen_qmtra, mime_qmtra, peso_qmtra, duracion_seg_qmtra, texto_qmtra,
                                        proveedor_qmtra, modelo_qmtra, respaldo_qmtra, motivo_respaldo_qmtra, costo_usd_qmtra,
                                        ms_qmtra, telefono_qmtra, ide_empr, usuario_ingre)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING ide_qmtra`,
        [
          hash,
          s.origen,
          s.mime?.slice(0, 60) ?? null,
          s.audio.length,
          resultado.duracion ?? s.duracionSeg ?? null,
          texto,
          proveedor,
          modelo,
          respaldo,
          respaldo || !texto ? (motivoRespaldo ?? resultado.motivo) : null,
          Number(costo.toFixed(6)),
          Date.now() - inicio,
          s.telefono ?? null,
          s.ideEmpr,
          s.usuario,
        ],
      );
      ide = r.rows[0].ide_qmtra;
    } catch (error) {
      this.logger.warn(`No se registró la transcripción: ${(error as Error).message}`);
    }

    return {
      texto,
      proveedor,
      modelo,
      duracionSeg: resultado.duracion ?? s.duracionSeg ?? null,
      costoUsd: Number(costo.toFixed(6)),
      desdeCache: false,
      respaldo,
      motivoRespaldo: respaldo ? motivoRespaldo : null,
      ide_qmtra: ide,
    };
  }

  /** Valida una API key de Groq (lista de modelos). */
  async validarGroqKey(apiKey: string): Promise<void> {
    const res = await fetch(`${TRANSCRIPCION_CONFIG.URL_GROQ}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(body?.error?.message || `Groq respondió ${res.status}`);
    }
  }

  private async transcribirGroq(s: SolicitudTranscripcion, prompt: string): Promise<Intento> {
    const groq = new OpenAI({ apiKey: s.groqApiKey, baseURL: TRANSCRIPCION_CONFIG.URL_GROQ, timeout: 60_000, maxRetries: 1 });
    // verbose_json trae por segmento la probabilidad de "no voz" y la confianza (avg_logprob).
    const r = (await groq.audio.transcriptions.create({
      model: TRANSCRIPCION_CONFIG.MODELO_GROQ,
      file: await toFile(s.audio, `audio.${this.extension(s.mime)}`, { type: s.mime }),
      language: 'es',
      prompt,
      temperature: 0,
      response_format: 'verbose_json',
    })) as unknown as { text: string; duration?: number; segments?: { no_speech_prob: number; avg_logprob: number; start: number; end: number }[] };

    const duracion = r.duration ?? s.duracionSeg ?? null;
    const evaluacion = evaluarTranscripcion(r.text, duracion, r.segments, prompt);
    return { texto: evaluacion.ok ? r.text.trim() : null, motivo: evaluacion.motivo, duracion };
  }

  private async transcribirOpenai(s: SolicitudTranscripcion, prompt: string): Promise<Intento> {
    const r = await this.openai.audio.transcriptions.create({
      model: TRANSCRIPCION_CONFIG.MODELO_OPENAI,
      file: await toFile(s.audio, `audio.${this.extension(s.mime)}`, { type: s.mime }),
      language: 'es',
      prompt,
    });
    const duracion = s.duracionSeg ?? null;
    // gpt-4o-mini-transcribe no entrega segmentos: se evalúa solo el texto.
    const evaluacion = evaluarTranscripcion(r.text, duracion, undefined, prompt);
    return { texto: evaluacion.ok ? r.text.trim() : null, motivo: evaluacion.motivo, duracion };
  }

  /** Pista para el modelo: vocabulario del dominio + términos propios de la cuenta (máx ~800 caracteres). */
  private promptVocabulario(extra?: string | null): string {
    const base = TRANSCRIPCION_CONFIG.VOCABULARIO_BASE;
    const propio = (extra ?? '')
      .split(/[\n,;]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .join(', ');
    return `Consulta de un asesor comercial de DIQUIMEC. Términos: ${[base, propio].filter(Boolean).join(', ')}.`.slice(0, 800);
  }

  private extension(mime: string): string {
    const m = (mime || '').toLowerCase();
    if (m.includes('ogg') || m.includes('opus')) return 'ogg';
    if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
    if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
    if (m.includes('wav')) return 'wav';
    if (m.includes('webm')) return 'webm';
    if (m.includes('flac')) return 'flac';
    return 'ogg';
  }
}
