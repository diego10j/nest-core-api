/** Mayúsculas sin tildes ni espacios repetidos (misma normalización que bdt_f_unaccent + UPPER). */
export function normalizarTexto(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * "1,105" → 1.105 · "16,50%" → 16.5 · "1.234,56" → 1234.56 · "1,234.56" → 1234.56 · "<100" → 100.
 * Devuelve null si no hay un número claro (texto, "Conforme", etc.).
 */
export function parseNumero(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== 'string') return null;
  const match = valor.replace(/\s/g, '').match(/-?\d[\d.,]*/);
  if (!match) return null;
  let s = match[0];
  const ultimaComa = s.lastIndexOf(',');
  const ultimoPunto = s.lastIndexOf('.');
  if (ultimaComa > -1 && ultimoPunto > -1) {
    // el separador que aparece último es el decimal
    s = ultimaComa > ultimoPunto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (ultimaComa > -1) {
    // "1,105" (decimal latino) vs "1,000,000" (miles): con varias comas son miles
    s = (s.match(/,/g)?.length ?? 0) > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * true si el texto ES un valor numérico ("5,61", "472.8 g/mol", "≤ 0.5 %", "<100 ufc/g") y no un
 * código que contiene números ("7695-91-2", "C31H52O3", "Lote 2025-01").
 */
export function esValorNumerico(valor: string | null | undefined): boolean {
  return /^\s*(?:[<>≤≥=~±]|min\.?|max\.?)?\s*-?\d+(?:[.,]\d+)*\s*[%a-zA-Zµ°º/·\s.]*$/i.test(valor ?? '');
}

/** Acepta solo YYYY-MM-DD válido (la IA ya convierte el formato del documento). */
export function parseFecha(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const m = valor.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return null;
  if (anio < 1970 || anio > 2100) return null;
  return m[0];
}

/** "92113 - 31 - 0" → "92113-31-0"; null si no tiene forma de CAS. */
export function normalizarCas(cas: string | null | undefined): string | null {
  const limpio = (cas ?? '').replace(/\s+/g, '').replace(/[‐‑–—]/g, '-');
  return /^\d{2,7}-\d{2}-\d$/.test(limpio) ? limpio : null;
}

/** Valida un número CAS con su dígito verificador (ej. 77-92-9). */
export function esCasValido(cas: string | null | undefined): boolean {
  const m = (normalizarCas(cas) ?? '').match(/^(\d{2,7})-(\d{2})-(\d)$/);
  if (!m) return false;
  const digitos = (m[1] + m[2]).split('').reverse();
  const suma = digitos.reduce((acc, d, i) => acc + Number(d) * (i + 1), 0);
  return suma % 10 === Number(m[3]);
}

const SUFIJOS_EMPRESA =
  /\b(S\.?\s?A\.?\s?U\.?|S\.?\s?A\.?|S\.?\s?R\.?\s?L\.?|S\.?\s?A\.?\s?S\.?|C\.?\s?A\.?|CIA\.?|LTDA\.?|LTD\.?|LIMITED|INC\.?|CORP\.?|CORPORATION|CO\.?|GMBH|AG|AKTIENGESELLSCHAFT|LLC|PLC|BV|NV|SPA|SL)\b/g;

/**
 * Clave para reconocer a la misma empresa con distinta razón social en distintos documentos:
 * "Novachem SRL" y "NOVACHEM SAU" → "NOVACHEM"; "BASF Aktiengesellschaft" → "BASF".
 */
export function claveEmpresa(nombre: string | null | undefined): string {
  return normalizarTexto(nombre)
    .replace(/[.,]/g, ' ')
    .replace(SUFIJOS_EMPRESA, ' ')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Recorta un texto a un máximo de caracteres (para columnas VARCHAR). */
export function recortar(valor: unknown, max: number): string | null {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Similitud simple por palabras (0..1) entre el nombre del producto del ERP y el detectado en
 * el documento. Solo es una señal para la confianza — los nombres comerciales suelen diferir
 * ("NOVAPROT™ COLÁGENO" vs "COLAGENO HIDROLIZADO LIQUIDO"), por eso penaliza poco.
 */
export function similitudPalabras(a: string, b: string): number {
  // Se comparan los primeros 5 caracteres de cada palabra: tolera español/inglés
  // ("VITAMINA ACETATO" ↔ "Vitamin E Acetate") y plurales.
  const palabras = (s: string) =>
    new Set(
      normalizarTexto(s)
        .replace(/[^A-Z0-9 ]/g, ' ')
        .split(' ')
        .filter((p) => p.length >= 3)
        .map((p) => p.slice(0, 5)),
    );
  const pa = palabras(a);
  const pb = palabras(b);
  if (!pa.size || !pb.size) return 0;
  let comunes = 0;
  pa.forEach((p) => {
    if (pb.has(p)) comunes++;
  });
  return comunes / Math.min(pa.size, pb.size);
}
