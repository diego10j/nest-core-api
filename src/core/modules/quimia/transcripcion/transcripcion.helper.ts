export const TRANSCRIPCION_CONFIG = {
  URL_GROQ: 'https://api.groq.com/openai/v1',
  MODELO_GROQ: 'whisper-large-v3-turbo',
  MODELO_OPENAI: 'gpt-4o-mini-transcribe',
  /** Precios de referencia (USD) para estimar el costo de cada transcripción. */
  COSTO_GROQ_HORA: 0.04,
  COSTO_OPENAI_MIN: 0.003,
  /** Límite de tamaño de la Bot API de Telegram para descargar archivos. */
  MAX_BYTES_TELEGRAM: 20 * 1024 * 1024,
  /** Segmento con probabilidad de "no voz" mayor a esto se considera silencio/ruido. */
  UMBRAL_NO_VOZ: 0.6,
  /** avg_logprob promedio menor a esto = baja confianza (Whisper: ~-0.3 claro, < -1 dudoso). */
  UMBRAL_CONFIANZA: -1.0,
  /** Mínimo de caracteres por segundo de audio (20 s que devuelven una palabra = dudoso). */
  MIN_CARACTERES_POR_SEG: 0.8,
  VOCABULARIO_BASE:
    'DIQUIMEC, QuimIA, stock, COA, certificado de análisis, ficha técnica, hoja de seguridad, CAS, lote, ' +
    'ácido cítrico, anhidro, monohidratado, colágeno hidrolizado, vitamina E acetato, kilos, kg, cotizar',
};

/**
 * Frases que Whisper "inventa" cuando el audio es silencio, música o ruido (vienen de subtítulos
 * de videos con los que fue entrenado). Si el texto es solo eso, el audio no se entendió.
 */
const ALUCINACIONES = [
  /gracias por ver/i,
  /suscr[ií]bete/i,
  /subt[ií]tulos? (realizados|creados|por)/i,
  /amara\.org/i,
  /^\W*(m[uú]sica|\[m[uú]sica\]|aplausos|risas)\W*$/i,
  /^\W*(gracias|ok|okay|eh|mm+|ah+)\W*$/i,
  /^\W*$/,
];

const palabras = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length >= 3);

/**
 * true si el "texto" es en realidad la pista de vocabulario devuelta por el modelo (pasa con audio
 * sin voz): un tramo literal largo de la pista, o una lista separada por comas hecha de sus términos.
 * Una pregunta real que solo usa términos del vocabulario ("ficha técnica del ácido cítrico
 * anhidro") no es eco: no es una lista ni un tramo largo copiado.
 */
export function repiteLaPista(texto: string, prompt: string): boolean {
  const delTexto = palabras(texto);
  if (delTexto.length >= 8 && palabras(prompt).join(' ').includes(delTexto.join(' '))) return true;
  const comas = (texto.match(/,/g) ?? []).length;
  if (comas < 3) return false;
  const deLaPista = new Set(palabras(prompt));
  const coinciden = delTexto.filter((p) => deLaPista.has(p)).length;
  return delTexto.length >= 4 && coinciden / delTexto.length >= 0.8;
}

export interface SegmentoWhisper {
  no_speech_prob: number;
  avg_logprob: number;
  start: number;
  end: number;
}

/**
 * ¿La transcripción es confiable? Motivos de rechazo (se registran en qmi_transcripcion):
 * VACIO, ALUCINACION, ECO_PISTA, SILENCIO (mayoría del audio sin voz), BAJA_CONFIANZA, MUY_CORTO.
 */
export function evaluarTranscripcion(
  texto: string | null | undefined,
  duracionSeg: number | null,
  segmentos?: SegmentoWhisper[],
  prompt?: string,
): { ok: boolean; motivo: string | null } {
  const t = (texto ?? '').trim();
  if (!t) return { ok: false, motivo: 'VACIO' };
  if (ALUCINACIONES.some((r) => r.test(t)) && t.length < 60) return { ok: false, motivo: 'ALUCINACION' };
  // Con audio sin voz el modelo a veces "transcribe" la pista de vocabulario que se le envió.
  if (prompt && repiteLaPista(t, prompt)) return { ok: false, motivo: 'ECO_PISTA' };

  if (segmentos?.length) {
    const total = segmentos.reduce((a, s) => a + Math.max(0, s.end - s.start), 0) || 1;
    const sinVoz = segmentos
      .filter((s) => s.no_speech_prob > TRANSCRIPCION_CONFIG.UMBRAL_NO_VOZ)
      .reduce((a, s) => a + Math.max(0, s.end - s.start), 0);
    if (sinVoz / total > 0.6) return { ok: false, motivo: 'SILENCIO' };

    const confianza = segmentos.reduce((a, s) => a + s.avg_logprob * Math.max(0.1, s.end - s.start), 0) /
      segmentos.reduce((a, s) => a + Math.max(0.1, s.end - s.start), 0);
    if (confianza < TRANSCRIPCION_CONFIG.UMBRAL_CONFIANZA) return { ok: false, motivo: 'BAJA_CONFIANZA' };
  }

  if (duracionSeg && duracionSeg >= 8 && t.length / duracionSeg < TRANSCRIPCION_CONFIG.MIN_CARACTERES_POR_SEG) {
    return { ok: false, motivo: 'MUY_CORTO' };
  }
  return { ok: true, motivo: null };
}
