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
  /**
   * La pregunta nombra OTRO producto que comparte palabras con este: al nombre le falta una palabra
   * y la pregunta trae otra del catálogo que este no cubre ("hidróxido de SODIO" ≠ "hidróxido de
   * CALCIO"). No se elige solo: el agente decide con buscar_producto y las notas.
   */
  conflicto?: boolean;
  /** Palabras del nombre que están en la pregunta (sin números ni empaques/unidades). */
  palabras?: number;
  /** Raíces de esas palabras (para saber si dos productos nombran cosas distintas). */
  cubiertas?: string[];
  /** Palabras del nombre que están en la pregunta tal cual (no solo por raíz): desempata el orden. */
  exactas?: number;
  /** La pregunta trae el nombre entero, códigos y cantidades incluidos. */
  completo?: boolean;
}

// Palabras de la pregunta que nunca identifican un producto.
const IGNORADAS = new Set([
  'DAME', 'CUAL', 'CUALES', 'COMO', 'TIENE', 'TIENEN', 'PARA', 'CON', 'POR', 'QUE', 'DEL', 'LOS', 'LAS',
  'UNA', 'UNO', 'SUS', 'ESTE', 'ESTA', 'ESE', 'ESA', 'PRODUCTO', 'PRODUCTOS', 'SIRVE', 'SIRVEN',
  'PUREZA', 'CONCENTRACION', 'LOTE', 'LOTES', 'ULTIMO', 'ULTIMOS', 'FICHA', 'TECNICA', 'HOJA', 'SEGURIDAD',
  'CERTIFICADO', 'ANALISIS', 'THE', 'AND', 'FOR', 'WHAT', 'WITH', 'FACTURA', 'FACTURAS', 'PROFORMA',
  'PROFORMAS', 'PDF', 'QUIERO', 'ENVIAME', 'MANDAME', 'NECESITO', 'PRECIO', 'PRECIOS', 'CUANTO', 'CUANTOS',
  'CUANTA', 'CUESTA', 'COTIZA', 'COTIZAR', 'COTIZAME', 'VENDER',
  // Preguntas de clientes / proveedores / cartera: nunca identifican un producto ("CLIENTE" ≈ "CALIENTE").
  'CLIENTE', 'CLIENTES', 'PROVEEDOR', 'PROVEEDORES', 'DEBE', 'DEBEN', 'DEBO', 'DEBEMOS', 'SALDO', 'SALDOS', 'CARTERA',
  'COMPRA', 'COMPRAS', 'COMPRAN', 'COMPRO', 'COMPRAMOS', 'COMPRADO', 'CADA', 'PAGO', 'PAGOS', 'VENCE', 'VENCEN', 'VENCIDO', 'VENCIDAS', 'ENVIOS', 'VENDO', 'VENDEMOS', 'VENDEN', 'VENDE', 'PUEDO', 'STOCK', 'SIGO', 'HAY',
  // Conversación / preguntas de conocimiento general ("¿qué otros nombres tiene…?", "sí, pero…").
  'PERO', 'OTRO', 'OTRA', 'OTROS', 'OTRAS', 'NOMBRE', 'NOMBRES', 'SINONIMO', 'SINONIMOS', 'MATERIA', 'MATERIAS',
  'PRIMA', 'PRIMAS', 'USO', 'USOS', 'TIPO', 'TIPOS',
]);

/**
 * Empaques y unidades ("¿a cuánto vendo el SACO?", "60 KILOS"): como los números, ayudan a desempatar
 * pero no identifican un producto por sí solas. Por raíz de 6 letras.
 */
const GENERICAS = new Set(
  ['SACO', 'SACOS', 'KILO', 'KILOS', 'KILOGRAMO', 'KILOGRAMOS', 'KGS', 'GRAMO', 'GRAMOS', 'LITRO', 'LITROS',
    'GALON', 'GALONES', 'CANECA', 'CANECAS', 'TAMBOR', 'TAMBORES', 'BIDON', 'BIDONES', 'FUNDA', 'FUNDAS',
    'CAJA', 'CAJAS', 'UNIDAD', 'UNIDADES', 'PRESENTACION',
    // Grado / calidad: distinguen variantes de un producto ya nombrado ("glicerina USP" vs "glicerina grado
    // alimenticio"), pero solos no nombran ninguno: "sí, pero grado alimenticio" listaba 10 sabores.
    'GRADO', 'ALIMENTICIO', 'ALIMENTARIO', 'FARMACEUTICO', 'COSMETICO', 'INDUSTRIAL', 'TECNICO', 'CALIDAD',
    'USP', 'FCC', 'REACTIVO', 'ANALITICO'].map((w) => w.slice(0, 6)),
);
// Números y cantidades pegadas a su unidad ("5KG", "250ML", "20LT") tampoco identifican: son la cantidad
// pedida ("cotiza 5kg"), no el nombre del producto.
const CANTIDAD = /^\d+(?:KGS?|GRS?|G|LTS?|L|ML|CC|GL|GAL|LB)?$/;
// Códigos de presentación / modelo pegados al nombre ("GLUCOSA TG X300", "SC X15KG", "X25"): son raros en el
// catálogo (IDF alto) y, contados como palabra del nombre, hundían la similitud del producto que sí se nombró.
const CODIGO = /^[A-Z]{1,3}\d+[A-Z]*$/;
const noIdentifica = (w: string) => CANTIDAD.test(w) || CODIGO.test(w) || GENERICAS.has(w.slice(0, 6));

/**
 * Pedido de un documento del ERP por número ("quiero factura 1000", "pdf de la proforma 350"): no se
 * busca producto en la pregunta (el número se confundía con "FRASCO CILINDRICO 1000 CC").
 */
export function esPedidoDocumentoErp(pregunta: string): boolean {
  const t = normalizarTexto(pregunta);
  return /\b(FACTURAS?|PROFORMAS?|FACT|PROF)\b[^0-9]{0,25}\d/.test(t);
}

/**
 * Pedido de proforma / cotización / presupuesto ("cotiza 5 kg de cera de palma y 5 kg de cera de coco a
 * consumidor final", "dame el presupuesto de…"): puede nombrar varios productos a propósito, así que no se
 * ofrece "¿cambio de producto?": el agente busca cada producto y cotiza o prepara el borrador.
 */
export function esPedidoProforma(pregunta: string): boolean {
  return /\b(PROFORMAS?|COTIZ[A-Z]*|PRESUPUESTOS?)\b/.test(normalizarTexto(pregunta));
}

/**
 * Pregunta de FORMULACIÓN: cuánto poner de uno o varios ingredientes, cómo combinarlos con una base, dosis,
 * receta ("¿qué porcentaje de aceite de jojoba y extracto de avena le puedo poner a mi jabón con mi base?").
 * Nombra ingredientes a propósito: no es un cambio de producto, y el producto activo (la base) sigue en contexto.
 */
export function esPreguntaFormulacion(pregunta: string): boolean {
  return /\b(FORMUL[A-Z]*|PORCENTAJES?|DOSIS|DOSIFIC[A-Z]*|RECETAS?|CUANTO\s+(?:DE\s+[A-Z ]{0,40})?(?:LE\s+|SE\s+)?(?:PUEDO|DEBO|PODRIA|HAY\s+QUE)\s+(?:PONER|AGREGAR|ANADIR|USAR|ECHAR|INCORPORAR)|COMBINAR|MEZCLAR|INCORPORAR|CONCENTRACION\s+DE\s+USO|NIVEL\s+DE\s+USO)\b/.test(
    normalizarTexto(pregunta),
  );
}

/**
 * La pregunta nombra VARIOS productos distintos ("5 kg de cera de palma y 5 kg de cera de coco"): hay dos
 * coincidencias fuertes y cada una cubre una palabra propia que la otra no (PALMA / COCO). No es lo mismo
 * que la ambigüedad de "ácido cítrico" (anhidro y monohidratado cubren las mismas palabras).
 */
export function mencionaVariosProductos(candidatos: CandidatoDetectado[]): boolean {
  const fuertes = candidatos.filter((c) => !c.conflicto && esCoincidenciaFuerte(c) && c.cubiertas?.length);
  return fuertes.some((a, i) =>
    fuertes.slice(i + 1).some((b) => a.cubiertas!.some((w) => !b.cubiertas!.includes(w)) && b.cubiertas!.some((w) => !a.cubiertas!.includes(w))),
  );
}

/**
 * La pregunta es sobre un cliente o proveedor ("¿cuánto me debe el cliente X?", "¿cuánto le debo a Y?",
 * "saldo de X", "¿cada cuánto compra?"): no se usa la detección tolerante de productos (un nombre de
 * cliente parecido a una palabra de un producto fijaba un producto sin sentido).
 */
export function esPreguntaDePersona(pregunta: string): boolean {
  return /\b(CLIENTES?|PROVEEDOR(ES)?|ME DEBE|NOS DEBE|LE DEBO|LE DEBEMOS|SALDOS?|CARTERA|CADA CUANTO|LE COMPRAMOS|LE COMPRO|COMPRAS A)\b/.test(
    normalizarTexto(pregunta),
  );
}

/**
 * En preguntas de cliente / proveedor el nombre de la persona suele coincidir con una palabra de un
 * producto (el proveedor QUIMPAC y el producto "QUIMPAC CLORO"). Solo cuentan los productos nombrados de
 * verdad: 2+ palabras propias o el nombre completo. Para ellos no aplica el conflicto (la palabra que
 * "sobra" en la pregunta es el nombre del cliente / proveedor).
 */
export function soloProductosNombrados<T extends Pick<CandidatoDetectado, 'palabras' | 'similitud' | 'conflicto' | 'completo'>>(
  candidatos: T[],
): T[] {
  return candidatos
    .filter((c) => (c.palabras ?? 0) >= 2 || (c.completo ?? c.similitud >= 0.99))
    .map((c) => ({ ...c, conflicto: false }));
}

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
    let coinciden = 0;
    let exactas = 0;
    let pesoNombre = 0;
    const cubiertas: string[] = [];
    let faltaEnPregunta = false;
    for (const w of lista) {
      const peso = coincide(w, palabrasPregunta);
      if (peso) {
        cobertura += idf(w) * peso;
        pesoNombre += idf(w);
        if (!noIdentifica(w)) {
          coinciden++;
          cubiertas.push(w.slice(0, 6));
          if (palabrasPregunta.includes(w)) exactas++;
        }
      } else if (!noIdentifica(w)) {
        faltaEnPregunta = true;
        pesoNombre += idf(w);
      }
    }
    // Un número o un empaque sueltos ("1000", "saco") no identifican un producto: solo ayudan a
    // desempatar cuando también coincide alguna palabra del nombre.
    if (!cobertura || !coinciden) continue;
    // Cantidades, empaques y códigos que NO están en la pregunta no restan similitud: "glucosa" nombra
    // por completo a "GLUCOSA TG X300".
    const similitud = cobertura / pesoNombre;
    // Nombre completo en la pregunta, códigos incluidos: solo así se elige sin preguntar entre empatados
    // ("glucosa" no elige GLUCOSA TG X300 frente a GLUCOSA EN POLVO; "glucosa tg x300" sí).
    const completo = cobertura / lista.reduce((acc, w) => acc + idf(w), 0) >= 0.99;
    // Palabra de la pregunta que existe en el catálogo pero no en este nombre (ej. "SODIO").
    const sobraEnPregunta = palabrasPregunta.some(
      (q) => !noIdentifica(q) && df.has(q.slice(0, 6)) && !lista.some((w) => coincide(w, [q])),
    );
    const conflicto = faltaEnPregunta && sobraEnPregunta;
    const previo = mejores.get(e.ide_inarti);
    if (!previo || cobertura > previo.cobertura || (cobertura === previo.cobertura && similitud > previo.similitud)) {
      mejores.set(e.ide_inarti, {
        ide_inarti: e.ide_inarti,
        nombre: e.nombre,
        coincidencia: e.texto,
        cobertura,
        similitud: Math.round(similitud * 100) / 100,
        documentos: e.documentos,
        conflicto,
        palabras: coinciden,
        cubiertas,
        exactas,
        completo,
      });
    }
  }

  // A igual cobertura, primero los que tienen la palabra tal cual ("GLUCOSA") y después los que solo
  // comparten la raíz de 6 letras ("GLUCOSIDE").
  return [...mejores.values()].sort(
    (a, b) => b.cobertura - a.cobertura || (b.exactas ?? 0) - (a.exactas ?? 0) || b.similitud - a.similitud,
  );
}

/**
 * - ninguno: la pregunta no menciona ningún producto con base técnica.
 * - uno: un único producto cubre claramente más de la pregunta que los demás.
 * - varios: empate (ej. "ácido cítrico" → anhidro y monohidratado) → preguntar al usuario.
 */
export function elegirProductoDetectado(
  todos: CandidatoDetectado[],
): { tipo: 'ninguno' } | { tipo: 'uno'; producto: CandidatoDetectado } | { tipo: 'varios'; opciones: CandidatoDetectado[] } {
  // Un producto que solo se parece (nombra otra sustancia) nunca se elige ni se ofrece por sí solo.
  const candidatos = todos.filter((c) => !c.conflicto);
  const [top] = candidatos;
  if (!top) return { tipo: 'ninguno' };
  const empatados = candidatos.filter((c) => c.cobertura >= top.cobertura * 0.9);
  if (empatados.length === 1) return { tipo: 'uno', producto: top };

  // Si la pregunta contiene el nombre completo de uno solo de los empatados, es ese.
  const completos = empatados.filter((c) => c.completo ?? c.similitud >= 0.99);
  if (completos.length === 1) return { tipo: 'uno', producto: completos[0] };

  return { tipo: 'varios', opciones: empatados.slice(0, MAX_OPCIONES_PRODUCTO) };
}

/**
 * Coincidencia suficiente para interrumpir una conversación con otro producto activo: la mitad del
 * nombre, o dos palabras propias ("detergente polvo" → DETERGENTE INDUSTRIAL EN POLVO AZUL).
 */
export function esCoincidenciaFuerte(c: Pick<CandidatoDetectado, 'similitud' | 'palabras'>): boolean {
  return c.similitud >= 0.5 || (c.palabras ?? 0) >= 2;
}
