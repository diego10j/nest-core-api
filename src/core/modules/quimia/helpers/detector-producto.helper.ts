import { normalizarTexto } from '../../base-tecnica/helpers/normalizar.helper';

/** Un nombre (del ERP o sinónimo detectado en documentos) que identifica a un producto. */
export interface EntradaIndiceProducto {
  ide_inarti: number;
  nombre: string;
  texto: string;
  documentos: number;
}

export interface CandidatoDetectado {
  ide_inarti: number;
  nombre: string;
  coincidencia: string;
  /** Peso de las palabras de la pregunta que este producto cubre (ranking entre productos). */
  cobertura: number;
  /** 0..1 — qué parte (ponderada) del nombre del producto aparece en la pregunta. */
  similitud: number;
  documentos: number;
}

// Palabras de la pregunta que nunca identifican un producto.
const IGNORADAS = new Set([
  'DAME', 'CUAL', 'CUALES', 'COMO', 'TIENE', 'TIENEN', 'PARA', 'CON', 'POR', 'QUE', 'DEL', 'LOS', 'LAS',
  'UNA', 'UNO', 'SUS', 'ESTE', 'ESTA', 'ESE', 'ESA', 'PRODUCTO', 'PRODUCTOS', 'SIRVE', 'SIRVEN',
  'PUREZA', 'CONCENTRACION', 'LOTE', 'LOTES', 'ULTIMO', 'ULTIMOS', 'FICHA', 'TECNICA', 'HOJA', 'SEGURIDAD',
  'CERTIFICADO', 'ANALISIS', 'THE', 'AND', 'FOR', 'WHAT', 'WITH',
]);

/** Máximo de productos que se ofrecen para elegir cuando la pregunta es ambigua. */
export const MAX_OPCIONES_PRODUCTO = 10;

/** Palabras normalizadas (mayúsculas, sin tildes) de un nombre o pregunta. */
function palabras(texto: string): string[] {
  return [
    ...new Set(
      normalizarTexto(texto)
        .replace(/[^A-Z0-9 ]/g, ' ')
        .split(' ')
        .filter((t) => t.length >= 3 && !IGNORADAS.has(t)),
    ),
  ];
}

/**
 * Raíces de 6 letras: tolera plural y español/inglés ("VITAMINA ACETATO" ↔ "Vitamin E Acetate",
 * "CÍTRICO" ↔ "Citric"). Se usan para el peso (IDF) de cada palabra.
 */
export function tokensProducto(texto: string): string[] {
  return [...new Set(palabras(texto).map((t) => t.slice(0, 6)))];
}

/** Distancia de edición (Levenshtein) con corte temprano: devuelve > max si la supera. */
function distancia(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previa = Array.from({ length: b.length + 1 }, (_v, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    let minFila = i;
    for (let k = 1; k <= b.length; k++) {
      actual[k] = Math.min(previa[k] + 1, actual[k - 1] + 1, previa[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1));
      minFila = Math.min(minFila, actual[k]);
    }
    if (minFila > max) return max + 1;
    previa = actual;
  }
  return previa[b.length];
}

/** Coincidencia exacta por raíz de 6 letras (filtro original). */
function coincidenciaExacta(palabra: string, pregunta: string[]): number {
  const raiz = palabra.slice(0, 6);
  return pregunta.some((q) => q.slice(0, 6) === raiz) ? 1 : 0;
}

/**
 * Coincidencia tolerante a errores de escritura o de transcripción de voz ("ESTIARICO" ↔
 * "ESTEARICO"): 1 letra distinta en palabras de 5-7 letras, 2 en palabras de 8+. Pesa menos que
 * una coincidencia exacta.
 */
function coincidenciaTolerante(palabra: string, pregunta: string[]): number {
  if (coincidenciaExacta(palabra, pregunta)) return 1;
  for (const q of pregunta) {
    if (palabra.length >= 5 && q.length >= 5 && palabra[0] === q[0]) {
      const max = Math.max(palabra.length, q.length) >= 8 ? 2 : 1;
      if (distancia(palabra, q, max) <= max) return 0.75;
    }
  }
  return 0;
}

/**
 * Detecta qué productos menciona la pregunta.
 *
 * Cada palabra pesa según qué tan distintiva es en el catálogo (IDF): "ÁCIDO" aparece en muchos
 * productos y pesa poco; "CÍTRICO" pesa mucho. El ranking es por las palabras DE LA PREGUNTA que
 * cubre cada producto — así "ácido cítrico" empata entre "Ácido cítrico anhidro" y "Ácido cítrico
 * monohidratado" (hay que preguntar), mientras que "ácido cítrico anhidro" solo lo cubre el anhidro.
 */
export function detectarProductos(pregunta: string, indice: EntradaIndiceProducto[]): CandidatoDetectado[] {
  return detectar(pregunta, indice, coincidenciaExacta);
}

/**
 * Respaldo tolerante: SOLO se usa cuando detectarProductos no encuentra ningún producto. Misma
 * lógica, pero acepta palabras con 1-2 letras distintas ("ácido estiárico" → "ÁCIDO ESTEÁRICO").
 */
export function detectarProductosTolerante(pregunta: string, indice: EntradaIndiceProducto[]): CandidatoDetectado[] {
  return detectar(pregunta, indice, coincidenciaTolerante);
}

function detectar(
  pregunta: string,
  indice: EntradaIndiceProducto[],
  coincide: (palabra: string, pregunta: string[]) => number,
): CandidatoDetectado[] {
  const palabrasPregunta = palabras(pregunta);
  if (!palabrasPregunta.length || !indice.length) return [];

  // df por producto (no por entrada): un sinónimo repetido no debe abaratar la palabra.
  const tokensPorProducto = new Map<number, Set<string>>();
  for (const e of indice) {
    const set = tokensPorProducto.get(e.ide_inarti) ?? new Set<string>();
    tokensProducto(e.texto).forEach((t) => set.add(t));
    tokensPorProducto.set(e.ide_inarti, set);
  }
  const totalProductos = tokensPorProducto.size;
  const df = new Map<string, number>();
  tokensPorProducto.forEach((set) => set.forEach((t) => df.set(t, (df.get(t) ?? 0) + 1)));
  const idf = (t: string) => Math.log(1 + totalProductos / (df.get(t.slice(0, 6)) ?? 1));

  const mejores = new Map<number, CandidatoDetectado>();
  for (const e of indice) {
    // Una palabra por raíz (evita contar dos veces "ACIDO"/"ACIDOS").
    const porRaiz = new Map<string, string>();
    palabras(e.texto).forEach((w) => porRaiz.has(w.slice(0, 6)) || porRaiz.set(w.slice(0, 6), w));
    const lista = [...porRaiz.values()];
    let cobertura = 0;
    for (const w of lista) {
      const peso = coincide(w, palabrasPregunta);
      if (peso) cobertura += idf(w) * peso;
    }
    if (!cobertura) continue;
    const similitud = cobertura / lista.reduce((acc, w) => acc + idf(w), 0);
    const previo = mejores.get(e.ide_inarti);
    if (!previo || cobertura > previo.cobertura || (cobertura === previo.cobertura && similitud > previo.similitud)) {
      mejores.set(e.ide_inarti, {
        ide_inarti: e.ide_inarti,
        nombre: e.nombre,
        coincidencia: e.texto,
        cobertura,
        similitud: Math.round(similitud * 100) / 100,
        documentos: e.documentos,
      });
    }
  }

  return [...mejores.values()].sort((a, b) => b.cobertura - a.cobertura || b.similitud - a.similitud);
}

/**
 * - ninguno: la pregunta no menciona ningún producto con base técnica.
 * - uno: un único producto cubre claramente más de la pregunta que los demás.
 * - varios: empate (ej. "ácido cítrico" → anhidro y monohidratado) → preguntar al usuario.
 */
export function elegirProductoDetectado(
  candidatos: CandidatoDetectado[],
): { tipo: 'ninguno' } | { tipo: 'uno'; producto: CandidatoDetectado } | { tipo: 'varios'; opciones: CandidatoDetectado[] } {
  const [top] = candidatos;
  if (!top) return { tipo: 'ninguno' };
  const empatados = candidatos.filter((c) => c.cobertura >= top.cobertura * 0.9);
  if (empatados.length === 1) return { tipo: 'uno', producto: top };

  // Si la pregunta contiene el nombre completo de uno solo de los empatados, es ese.
  const completos = empatados.filter((c) => c.similitud >= 0.99);
  if (completos.length === 1) return { tipo: 'uno', producto: completos[0] };

  return { tipo: 'varios', opciones: empatados.slice(0, MAX_OPCIONES_PRODUCTO) };
}
