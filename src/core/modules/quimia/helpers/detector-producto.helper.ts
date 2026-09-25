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

/**
 * Palabras normalizadas y recortadas a 6 letras: tolera tildes, plural y español/inglés
 * ("VITAMINA ACETATO" ↔ "Vitamin E Acetate", "CÍTRICO" ↔ "Citric").
 */
export function tokensProducto(texto: string): string[] {
  return [
    ...new Set(
      normalizarTexto(texto)
        .replace(/[^A-Z0-9 ]/g, ' ')
        .split(' ')
        .filter((t) => t.length >= 3 && !IGNORADAS.has(t))
        .map((t) => t.slice(0, 6)),
    ),
  ];
}

/**
 * Detecta qué productos menciona la pregunta.
 *
 * Cada palabra pesa según qué tan distintiva es en el catálogo técnico (IDF): "ÁCIDO" aparece en
 * muchos productos y pesa poco; "CÍTRICO" pesa mucho. El ranking es por las palabras DE LA
 * PREGUNTA que cubre cada producto — así "ácido cítrico" empata entre "Ácido cítrico anhidro" y
 * "Ácido cítrico monohidratado" (ambos cubren lo mismo → hay que preguntar), mientras que
 * "ácido cítrico anhidro" solo lo cubre por completo el anhidro.
 */
export function detectarProductos(pregunta: string, indice: EntradaIndiceProducto[]): CandidatoDetectado[] {
  const tokensPregunta = new Set(tokensProducto(pregunta));
  if (!tokensPregunta.size || !indice.length) return [];

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
  const idf = (t: string) => Math.log(1 + totalProductos / (df.get(t) ?? 1));

  const mejores = new Map<number, CandidatoDetectado>();
  for (const e of indice) {
    const tokens = tokensProducto(e.texto);
    const coinciden = tokens.filter((t) => tokensPregunta.has(t));
    if (!coinciden.length) continue;
    const cobertura = coinciden.reduce((s, t) => s + idf(t), 0);
    const similitud = cobertura / tokens.reduce((s, t) => s + idf(t), 0);
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

  return { tipo: 'varios', opciones: empatados.slice(0, 6) };
}
