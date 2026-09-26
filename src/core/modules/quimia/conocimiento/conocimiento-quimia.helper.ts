/**
 * Utilidades para usar la base de conocimiento (sis_conocimiento) en QuimIA: términos de búsqueda,
 * resaltado de coincidencias y conversión del contenido (bloques BlockNote o HTML) a texto e imágenes.
 */

/** Palabras que no ayudan a encontrar una nota. */
const VACIAS = new Set([
  'que', 'cual', 'cuales', 'como', 'cuanto', 'cuanta', 'cuantos', 'cuantas', 'donde', 'cuando', 'quien', 'para', 'por',
  'con', 'sin', 'del', 'las', 'los', 'una', 'uno', 'unos', 'unas', 'sus', 'mis', 'tus', 'este', 'esta', 'estos',
  'estas', 'ese', 'esa', 'eso', 'hay', 'tiene', 'tienen', 'tenemos', 'dame', 'dime', 'quiero', 'necesito', 'puedo',
  'podemos', 'favor', 'mas', 'muy', 'todo', 'todos', 'toda', 'todas', 'algun', 'alguna', 'sobre', 'entre', 'hasta',
  'desde', 'the', 'and', 'for', 'nota', 'notas',
]);

/** Minúsculas sin tildes, carácter por carácter (misma longitud que el texto original). */
function sinTildes(texto: string): string {
  let out = '';
  for (const ch of texto) {
    const base = ch.normalize('NFD')[0];
    out += (base.length === ch.length ? base : ch).toLowerCase();
  }
  return out;
}

/** Términos de búsqueda de una pregunta: sin tildes, sin palabras vacías, raíz de hasta 6 letras. */
export function terminosBusqueda(pregunta: string): string[] {
  const palabras = sinTildes(pregunta)
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length >= 3 && !VACIAS.has(p));
  return [...new Set(palabras.map((p) => p.slice(0, 6)))].slice(0, 12);
}

/** tsquery para to_tsquery('spanish', …): términos por prefijo unidos con OR. */
export function tsqueryDeTerminos(terminos: string[]): string | null {
  const limpios = terminos.map((t) => t.replace(/[^a-z0-9ñ]/g, '')).filter((t) => t.length >= 3);
  return limpios.length ? limpios.map((t) => `${t}:*`).join(' | ') : null;
}

/**
 * Marca en el texto las palabras que empiezan con alguno de los términos (sin importar tildes ni
 * mayúsculas). Devuelve el texto marcado y qué términos coincidieron.
 */
export function resaltar(
  texto: string,
  terminos: string[],
  abrir = '**',
  cerrar = '**',
): { texto: string; coincidencias: string[] } {
  if (!texto || !terminos.length) return { texto, coincidencias: [] };
  const plano = sinTildes(texto);
  const encontrados = new Set<string>();
  const regex = /[a-z0-9ñ]+/g;
  const tramos: [number, number][] = [];
  let m: RegExpExecArray | null;
   
  while ((m = regex.exec(plano))) {
    const palabra = m[0];
    const termino = terminos.find((t) => palabra.startsWith(t));
    if (termino && palabra.length >= 3) {
      encontrados.add(termino);
      tramos.push([m.index, m.index + palabra.length]);
    }
  }
  if (!tramos.length) return { texto, coincidencias: [] };
  let out = '';
  let pos = 0;
  for (const [ini, fin] of tramos) {
    out += texto.slice(pos, ini) + abrir + texto.slice(ini, fin) + cerrar;
    pos = fin;
  }
  return { texto: out + texto.slice(pos), coincidencias: [...encontrados] };
}

/**
 * Fragmentos del texto alrededor de las coincidencias (para el contexto de la IA y la vista previa).
 * Si el texto es corto se devuelve completo.
 */
export function fragmentos(texto: string, terminos: string[], max = 1500): string {
  if (texto.length <= max) return texto;
  const plano = sinTildes(texto);
  const posiciones: number[] = [];
  for (const t of terminos) {
    const i = plano.search(new RegExp(`\\b${t}`));
    if (i >= 0) posiciones.push(i);
  }
  if (!posiciones.length) return `${texto.slice(0, max)}…`;
  const partes: string[] = [];
  const ventana = Math.floor(max / Math.min(posiciones.length, 3) / 2);
  const usados: [number, number][] = [];
  for (const p of posiciones.sort((a, b) => a - b).slice(0, 3)) {
    const ini = Math.max(0, p - ventana);
    const fin = Math.min(texto.length, p + ventana);
    if (usados.some(([a, b]) => ini < b && fin > a)) continue;
    usados.push([ini, fin]);
    partes.push(`${ini > 0 ? '…' : ''}${texto.slice(ini, fin).trim()}${fin < texto.length ? '…' : ''}`);
  }
  return partes.join('\n');
}

// ---------------------------------------------------------------- contenido de la nota

export interface ImagenNota {
  url: string;
  pie: string | null;
  /** uuid del adjunto (sis_conocimiento_archivo) si la URL es de downloadArchivo. */
  uuid: string | null;
}

type Nodo = { type?: string; text?: string; content?: unknown; props?: Record<string, unknown>; children?: Nodo[]; styles?: unknown };

const UUID_ARCHIVO = /downloadArchivo\/([0-9a-f-]{36})/i;

function textoInline(content: unknown): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((n: Nodo) => (typeof n?.text === 'string' ? n.text : textoInline(n?.content))).join('');
  }
  const tabla = content as { type?: string; rows?: { cells?: unknown[] }[] };
  if (tabla?.type === 'tableContent') {
    return (tabla.rows ?? [])
      .map((r) =>
        (r.cells ?? [])
          .map((c) => textoInline((c as { content?: unknown })?.content ?? c).trim())
          .filter(Boolean)
          .join(' · '),
      )
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/** Bloques BlockNote → texto con estructura (títulos, listas, tablas en líneas) + imágenes. */
function desdeBloques(bloques: Nodo[], nivel = 0): { lineas: string[]; imagenes: ImagenNota[] } {
  const lineas: string[] = [];
  const imagenes: ImagenNota[] = [];
  let numero = 0;
  const sangria = '  '.repeat(nivel);
  for (const b of bloques ?? []) {
    const texto = textoInline(b.content).trim();
    switch (b.type) {
      case 'heading':
        if (texto) lineas.push('', `### ${texto}`);
        break;
      case 'bulletListItem':
      case 'checkListItem':
        if (texto) lineas.push(`${sangria}• ${texto}`);
        break;
      case 'numberedListItem':
        numero++;
        if (texto) lineas.push(`${sangria}${numero}. ${texto}`);
        break;
      case 'table':
        if (texto) lineas.push('', texto, '');
        break;
      case 'image': {
        const url = typeof b.props?.url === 'string' ? (b.props.url as string) : '';
        const pie = typeof b.props?.caption === 'string' && b.props.caption ? (b.props.caption as string) : null;
        if (url) imagenes.push({ url, pie, uuid: url.match(UUID_ARCHIVO)?.[1] ?? null });
        lineas.push(`[imagen${pie ? `: ${pie}` : ''}]`);
        break;
      }
      default:
        if (texto) lineas.push(`${sangria}${texto}`);
    }
    if (b.type !== 'numberedListItem') numero = 0;
    if (b.children?.length) {
      const hijos = desdeBloques(b.children, nivel + 1);
      lineas.push(...hijos.lineas);
      imagenes.push(...hijos.imagenes);
    }
  }
  return { lineas, imagenes };
}

/** HTML (editor anterior) → texto con saltos de línea + imágenes <img>. */
function desdeHtml(html: string): { lineas: string[]; imagenes: ImagenNota[] } {
  const imagenes: ImagenNota[] = [];
  const reImg = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
   
  while ((m = reImg.exec(html))) {
    const alt = m[0].match(/alt=["']([^"']*)["']/i)?.[1] || null;
    imagenes.push({ url: m[1], pie: alt, uuid: m[1].match(UUID_ARCHIVO)?.[1] ?? null });
  }
  const texto = html
    .replace(/<img[^>]*>/gi, '[imagen]')
    .replace(/<\/(p|div|h[1-6]|tr|li|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/t[dh]>/gi, ' · ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
  return { lineas: texto.split('\n').map((l) => l.replace(/\s+·\s*$/, '').trim()), imagenes };
}

/** Contenido de una nota (según modo_editor_cono) → texto legible y lista de imágenes. */
export function contenidoNota(contenido: string | null, modo: string | null): { texto: string; imagenes: ImagenNota[] } {
  if (!contenido) return { texto: '', imagenes: [] };
  let r: { lineas: string[]; imagenes: ImagenNota[] } | null = null;
  if (modo === 'BLOCKS') {
    try {
      const parsed = JSON.parse(contenido);
      if (Array.isArray(parsed)) r = desdeBloques(parsed as Nodo[]);
    } catch {
      r = null;
    }
  }
  r ??= desdeHtml(contenido);
  const texto = r.lineas
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { texto, imagenes: r.imagenes };
}
