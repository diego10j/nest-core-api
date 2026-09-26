import { resaltar } from '../conocimiento/conocimiento-quimia.helper';
import { NotaCompleta } from '../conocimiento/quimia-conocimiento.service';
import { RespuestaQuimia } from '../quimia.types';

import { BotonTelegram } from './telegram-api.service';

/** Límite de Telegram por mensaje (4096) con margen para las etiquetas HTML. */
const MAX_MENSAJE = 3800;

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Markdown de QuimIA → HTML soportado por Telegram (<b>, <i>, <a>, <code>). Las tablas se aplanan
 * a líneas "a · b · c" y los chips de cita "[nombre](#cita-0-2)" quedan como [1,3].
 */
export function markdownATelegramHtml(markdown: string): string {
  const lineas = markdown.replace(/\r/g, '').split('\n');
  const salida: string[] = [];
  for (const linea of lineas) {
    if (/^\s*\|?\s*:?-{3,}/.test(linea)) continue; // separador de tabla
    let l = linea;
    if (/^\s*\|.*\|\s*$/.test(l)) {
      l = l
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean)
        .join(' · ');
    }
    l = escapar(l);
    // notas de la base de conocimiento en línea → 📝 título
    l = l.replace(/\s?\[([^\]]*)\]\(#nota-[0-9a-f-]+\)/gi, ' 📝 <i>$1</i>');
    // citas en línea → [n]
    l = l.replace(/\s?\[[^\]]*\]\(#cita-([\d-]+)\)/g, (_m, ids: string) =>
      ` [${ids
        .split('-')
        .map((i) => Number(i) + 1)
        .join(',')}]`,
    );
    l = l
      .replace(/^#{1,6}\s+(.+)$/, '<b>$1</b>')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<i>$2</i>')
      .replace(/_(.+?)_/g, '<i>$1</i>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
      .replace(/^(\s*)[-*]\s+/, '$1• ');
    salida.push(l);
  }
  return salida.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Mensaje(s) HTML + botones para responder en Telegram. */
export function respuestaATelegram(
  r: RespuestaQuimia,
  url: (u: string) => string = (u) => u,
): { mensajes: string[]; botones: BotonTelegram[][] } {
  const partes: string[] = [];
  partes.push(markdownATelegramHtml(r.texto || r.error || 'Sin respuesta'));

  if (r.citas.length) {
    partes.push(
      '📄 <b>Fuentes</b>\n' +
        r.citas
          .map((c, i) => {
            const enlace = url(c.pagina ? `${c.url}#page=${c.pagina}` : c.url);
            return `[${i + 1}] <a href="${escapar(enlace)}">${escapar(c.archivo)}</a> · ${escapar(
              [c.tipo_etiqueta, c.seccion, c.pagina ? `pág. ${c.pagina}` : null].filter(Boolean).join(' · '),
            )}`;
          })
          .join('\n'),
    );
  }

  const botones: BotonTelegram[][] = [];
  // Documentos pedidos: un botón por documento que abre el PDF.
  r.documentos.slice(0, 6).forEach((d) => {
    // Sin lote ni fecha (ej. adjunto aún sin procesar) se muestra el nombre del archivo.
    const detalle = [d.lote ? `lote ${d.lote}` : null, d.fecha].filter(Boolean);
    const etiqueta = [d.tipo_etiqueta, ...(detalle.length ? detalle : [d.archivo.replace(/\.[a-z0-9]{2,4}$/i, '')])].join(' · ');
    botones.push([{ text: `📎 ${etiqueta}`.slice(0, 60), url: url(d.url) }]);
  });
  // Elegir producto / cambiar de producto / respuesta de IA.
  r.opciones.slice(0, 10).forEach((o) => botones.push([{ text: `🧪 ${o.nombre}`.slice(0, 60), callback_data: `p:${o.ide_inarti}` }]));
  if (r.sugerirCambio) {
    botones.push([{ text: `Cambiar a ${r.sugerirCambio.nombre}`.slice(0, 60), callback_data: `p:${r.sugerirCambio.ide_inarti}` }]);
  }
  // Varias facturas/proformas con el mismo número: un botón por documento (envía el PDF).
  r.opcionesArchivo.slice(0, 10).forEach((a) =>
    botones.push([
      { text: `📄 ${a.numero} · ${a.detalle}`.slice(0, 64), callback_data: `d:${a.tipo === 'FACTURA' ? 'F' : 'P'}:${a.id}` },
    ]),
  );
  // Notas de la base de conocimiento: "📝 título" (máximo 5) + "No, gracias".
  r.notas.slice(0, 5).forEach((n) => botones.push([{ text: `📝 ${n.titulo}`.slice(0, 60), callback_data: `k:${n.ide_cono}` }]));
  const ofrecerIa = r.sinRespuesta && !r.esIa && !r.opciones.length;
  if (ofrecerIa) {
    botones.push([
      { text: '✨ Sí, responder con IA', callback_data: 'ia' },
      { text: 'No, gracias', callback_data: 'no' },
    ]);
  } else if (r.notas.length) {
    botones.push([{ text: 'No, gracias', callback_data: 'no' }]);
  }

  return { mensajes: dividir(partes.join('\n\n')), botones };
}

/** Divide un texto largo en mensajes de hasta MAX_MENSAJE caracteres, cortando por párrafos. */
export function dividir(texto: string): string[] {
  if (texto.length <= MAX_MENSAJE) return [texto];
  const mensajes: string[] = [];
  let actual = '';
  for (const parrafo of texto.split('\n\n')) {
    if ((actual + '\n\n' + parrafo).length > MAX_MENSAJE && actual) {
      mensajes.push(actual);
      actual = parrafo;
    } else {
      actual = actual ? `${actual}\n\n${parrafo}` : parrafo;
    }
  }
  if (actual) mensajes.push(actual.slice(0, MAX_MENSAJE));
  return mensajes;
}

/**
 * Teléfono solo con dígitos y código de país. Números locales de Ecuador (09XXXXXXXX) → 5939XXXXXXXX.
 * Telegram entrega el número del contacto con código de país (a veces con "+").
 */
export function normalizarTelefono(telefono: string | null | undefined): string {
  let t = (telefono ?? '').replace(/\D/g, '');
  if (t.length === 10 && t.startsWith('0')) t = `593${t.slice(1)}`;
  if (t.length === 9 && t.startsWith('9')) t = `593${t}`;
  return t;
}

/** Compara por los últimos 9 dígitos (tolera diferencias de prefijo país / cero inicial). */
export function mismoTelefono(a: string, b: string): boolean {
  const x = normalizarTelefono(a);
  const y = normalizarTelefono(b);
  return x.length >= 9 && y.length >= 9 && x.slice(-9) === y.slice(-9);
}

/**
 * Nota de la base de conocimiento → mensaje(s) HTML de Telegram: título, categoría/tags, contenido con
 * los términos de la búsqueda en negrilla. Las imágenes se envían aparte como fotos.
 */
export function notaATelegram(nota: NotaCompleta, terminos: string[]): string[] {
  const meta = [nota.categoria, nota.tags.length ? nota.tags.map((t) => `#${t.replace(/\s+/g, '_')}`).join(' ') : null, nota.fecha]
    .filter(Boolean)
    .join(' · ');
  const cuerpo = nota.texto
    .split('\n')
    .map((linea) => {
      const titulo = linea.match(/^#{1,6}\s+(.+)$/);
      const html = resaltar(escapar(titulo ? titulo[1] : linea), terminos, '<b>', '</b>').texto;
      return titulo ? `<b><u>${html.replace(/<\/?b>/g, '')}</u></b>` : html;
    })
    .join('\n')
    // Las imágenes llegan como fotos después del texto.
    .replace(/\[imagen(?::\s*([^\]]*))?\]/g, (_m, pie?: string) => `🖼️ <i>${pie ? `${pie} (imagen abajo)` : 'imagen abajo'}</i>`)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const cabecera = `📝 <b>${escapar(nota.titulo)}</b>${meta ? `\n<i>${escapar(meta)}</i>` : ''}`;
  return dividir(`${cabecera}\n\n${cuerpo || '<i>(sin texto)</i>'}`);
}
