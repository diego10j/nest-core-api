import { BDT_CONFIG } from '../constants/base-tecnica.constants';

import { limpiarTextoBd } from './normalizar.helper';

export interface PaginaTexto {
  numero: number;
  texto: string;
}

export interface ResultadoTextoPdf {
  totalPaginas: number;
  paginas: PaginaTexto[];
  /** true si la mayoría de páginas no tiene capa de texto (PDF escaneado / imágenes). */
  escaneado: boolean;
}

interface TextItem {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
}

export interface OpcionesTextoPdf {
  /** Aplica la rotación de la página (para documentos apaisados/rotados como comprobantes de pago). */
  rotarPagina?: boolean;
}

/** Lleva un punto del espacio del PDF al espacio VISUAL de la página (con su rotación aplicada). */
interface Orientador {
  punto: (x: number, y: number) => { x: number; y: number };
  /** true = las filas se ordenan de arriba a abajo por Y visual (que crece hacia abajo). */
  ascendente: boolean;
}

function orientadorPagina(page: any): Orientador {
  const viewport = page.getViewport({ scale: 1 });
  return {
    punto: (x, y) => {
      const [vx, vy] = viewport.convertToViewportPoint(x, y);
      return { x: vx, y: vy };
    },
    ascendente: true,
  };
}

/** Separación horizontal (pt) a partir de la cual dos fragmentos de una fila son celdas distintas. */
const ESPACIO_ENTRE_CELDAS = 12;

// unpdf es ESM-only y el proyecto compila a CommonJS: un `import()` literal lo transformaría TS
// a require(). Node >= 22.12 soporta require(esm), pero así funciona en cualquier versión.
const importEsm = new Function('specifier', 'return import(specifier)') as (s: string) => Promise<any>;

/**
 * Extrae el texto de un PDF página por página reconstruyendo las FILAS a partir de las
 * coordenadas de cada fragmento. La extracción lineal de pdf.js desordena las tablas (en un COA
 * el resultado "5,61" quedaba separado de "pH ... 5,00 - 6,00"); agrupando por coordenada Y y
 * ordenando por X, cada fila de la tabla sale junta: "pH (Directo, 25°C) | 5,00 - 6,00 | 5,61".
 */
export async function extraerTextoPdf(
  buffer: Buffer,
  opciones?: OpcionesTextoPdf,
): Promise<ResultadoTextoPdf> {
  const { getDocumentProxy } = await importEsm('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const paginas: PaginaTexto[] = [];

  const coberturas: number[] = [];

  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const { items } = await page.getTextContent();
    // Documentos con rotación de página (ej. comprobantes en apaisado): las coordenadas del texto
    // vienen en el espacio SIN rotar y la tabla sale desordenada. Con `rotarPagina` se lleva cada
    // fragmento al espacio visual con el viewport y las filas se ordenan de arriba a abajo. Por
    // defecto (base tecnica: COAs/SDS sin rotar) el comportamiento no cambia.
    const orientar = opciones?.rotarPagina ? orientadorPagina(page) : undefined;
    paginas.push({ numero: n, texto: limpiarTextoBd(reconstruirFilas(items as TextItem[], orientar)) });
    coberturas.push(await coberturaImagenes(page).catch(() => 0));
  }

  const limpias = quitarLineasRepetidas(paginas);
  // Página sin texto (escaneada) o con el contenido en una IMAGEN y apenas algo de texto (membrete,
  // pie, disclaimer): ej. una ficha con la tabla pegada como imagen. Leerla como texto dejaría a la
  // IA solo con el pie de página; se lee como escaneado (la IA ve la imagen de cada página).
  const paginasSinTexto = limpias.filter((p, i) => {
    const caracteres = p.texto.replace(/\s+/g, '').length;
    if (caracteres < BDT_CONFIG.MIN_CARACTERES_POR_PAGINA) return true;
    return coberturas[i] >= BDT_CONFIG.MIN_COBERTURA_IMAGEN && caracteres < BDT_CONFIG.MAX_CARACTERES_PAGINA_IMAGEN;
  }).length;

  return {
    totalPaginas: pdf.numPages,
    paginas: limpias,
    escaneado: pdf.numPages > 0 && paginasSinTexto / pdf.numPages > 0.5,
  };
}

// Operaciones de pdf.js (OPS): save, restore, transform y las que pintan una imagen.
const OP_SAVE = 10;
const OP_RESTORE = 11;
const OP_TRANSFORM = 12;
const OPS_IMAGEN = new Set([85, 86, 87, 88]); // paintImageXObject, paintInlineImageXObject(Group), paintImageXObjectRepeat

/**
 * Fracción de la página cubierta por imágenes (0..1+; puede pasar de 1 si se superponen). Sigue la
 * matriz de transformación del operator list: una imagen se dibuja en el cuadrado unitario escalado
 * por la matriz vigente, así que su área es |det(matriz)|.
 */
async function coberturaImagenes(page: any): Promise<number> {
  const ops = await page.getOperatorList();
  const { width, height } = page.getViewport({ scale: 1 });
  let ctm = [1, 0, 0, 1, 0, 0];
  const pila: number[][] = [];
  let area = 0;
  ops.fnArray.forEach((fn: number, i: number) => {
    if (fn === OP_SAVE) pila.push(ctm.slice());
    else if (fn === OP_RESTORE) ctm = pila.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (fn === OP_TRANSFORM) {
      const [a, b, c, d, e, f] = ops.argsArray[i];
      ctm = [
        ctm[0] * a + ctm[2] * b,
        ctm[1] * a + ctm[3] * b,
        ctm[0] * c + ctm[2] * d,
        ctm[1] * c + ctm[3] * d,
        ctm[0] * e + ctm[2] * f + ctm[4],
        ctm[1] * e + ctm[3] * f + ctm[5],
      ];
    } else if (OPS_IMAGEN.has(fn)) area += Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]);
  });
  return width * height ? area / (width * height) : 0;
}

function reconstruirFilas(items: TextItem[], orientar?: Orientador): string {
  const filas: { y: number; celdas: { x: number; w: number; s: string }[] }[] = [];

  for (const it of items) {
    const s = (it.str ?? '').trim();
    if (!s || !it.transform) continue;
    const { x, y } = orientar
      ? orientar.punto(it.transform[4], it.transform[5])
      : { x: it.transform[4], y: it.transform[5] };
    const tolerancia = Math.max(2, (it.height || 10) * 0.4);
    let fila = filas.find((f) => Math.abs(f.y - y) <= tolerancia);
    if (!fila) {
      fila = { y, celdas: [] };
      filas.push(fila);
    }
    fila.celdas.push({ x, w: it.width ?? 0, s });
  }

  return filas
    .sort((a, b) => (orientar?.ascendente ? a.y - b.y : b.y - a.y))
    .map((f) => {
      const celdas = f.celdas.sort((a, b) => a.x - b.x);
      let linea = '';
      celdas.forEach((c, i) => {
        if (i > 0) {
          const previa = celdas[i - 1];
          linea += c.x - (previa.x + previa.w) > ESPACIO_ENTRE_CELDAS ? ' | ' : ' ';
        }
        linea += c.s;
      });
      return compactarEspaciado(linea);
    })
    .join('\n');
}

/** "D A R R A G U E I R A" (texto con letter-spacing, típico en membretes) → "DARRAGUEIRA". */
function compactarEspaciado(linea: string): string {
  const tokens = linea.split(' ').filter(Boolean);
  if (tokens.length >= 4 && tokens.every((t) => t.length === 1)) {
    return tokens.join('');
  }
  return linea;
}

/**
 * Encabezados/pies repetidos en cada página ("CREATION DATE: September 2012", "Page 3 of 16")
 * solo gastan tokens y confunden la extracción. Se eliminan las líneas que aparecen en >= 60%
 * de las páginas (solo con 3+ páginas, en documentos cortos no hay patrón fiable).
 * En la PRIMERA página se conservan: el encabezado suele traer la única fecha/revisión del
 * documento ("CREATION DATE: September 2012") y quitarlo dejaba la SDS sin fecha.
 */
function quitarLineasRepetidas(paginas: PaginaTexto[]): PaginaTexto[] {
  if (paginas.length < 3) return paginas;

  const clave = (l: string) => l.replace(/\d+/g, '#').trim().toUpperCase();
  const conteo = new Map<string, number>();
  for (const p of paginas) {
    const unicas = new Set(p.texto.split('\n').map(clave).filter(Boolean));
    unicas.forEach((k) => conteo.set(k, (conteo.get(k) ?? 0) + 1));
  }
  const minimo = Math.ceil(paginas.length * 0.6);
  const repetidas = new Set([...conteo].filter(([k, c]) => c >= minimo && k.length > 2).map(([k]) => k));

  return paginas.map((p, i) => ({
    numero: p.numero,
    texto: i === 0 ? p.texto : p.texto
      .split('\n')
      .filter((l) => !repetidas.has(clave(l)))
      .join('\n')
      .trim(),
  }));
}

/** Texto con marcas de página, que es lo que recibe la IA (para que pueda citar la página). */
export function textoConPaginas(paginas: PaginaTexto[]): string {
  return paginas.map((p) => `<<<PÁGINA ${p.numero}>>>\n${p.texto}`).join('\n\n');
}

/** Texto original de un rango de páginas (para guardar junto a la sección traducida). */
export function textoDeRango(paginas: PaginaTexto[], desde?: number | null, hasta?: number | null): string | null {
  if (!desde) return null;
  const fin = hasta && hasta >= desde ? hasta : desde;
  const texto = paginas
    .filter((p) => p.numero >= desde && p.numero <= fin)
    .map((p) => p.texto)
    .join('\n');
  return texto || null;
}
