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
export async function extraerTextoPdf(buffer: Buffer): Promise<ResultadoTextoPdf> {
  const { getDocumentProxy } = await importEsm('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const paginas: PaginaTexto[] = [];

  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const { items } = await page.getTextContent();
    paginas.push({ numero: n, texto: limpiarTextoBd(reconstruirFilas(items as TextItem[])) });
  }

  const limpias = quitarLineasRepetidas(paginas);
  const paginasSinTexto = limpias.filter(
    (p) => p.texto.replace(/\s+/g, '').length < BDT_CONFIG.MIN_CARACTERES_POR_PAGINA,
  ).length;

  return {
    totalPaginas: pdf.numPages,
    paginas: limpias,
    escaneado: pdf.numPages > 0 && paginasSinTexto / pdf.numPages > 0.5,
  };
}

function reconstruirFilas(items: TextItem[]): string {
  const filas: { y: number; celdas: { x: number; w: number; s: string }[] }[] = [];

  for (const it of items) {
    const s = (it.str ?? '').trim();
    if (!s || !it.transform) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    const tolerancia = Math.max(2, (it.height || 10) * 0.4);
    let fila = filas.find((f) => Math.abs(f.y - y) <= tolerancia);
    if (!fila) {
      fila = { y, celdas: [] };
      filas.push(fila);
    }
    fila.celdas.push({ x, w: it.width ?? 0, s });
  }

  return filas
    .sort((a, b) => b.y - a.y)
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
