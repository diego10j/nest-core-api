import { RespuestaQuimia } from '../quimia.types';

import { citasATextoPlano, notasATextoPlano } from './citas-en-linea.helper';

/**
 * Convierte la respuesta en texto listo para un chat de texto (Telegram/WhatsApp): quita el markdown
 * que esos clientes no muestran bien (tablas, **negritas** dobles) y agrega fuentes, documentos
 * con sus links y las opciones de producto numeradas.
 */
export function formatearTextoPlano(r: RespuestaQuimia): string {
  const partes: string[] = [];

  const texto = notasATextoPlano(citasATextoPlano(r.texto))
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/^\|?\s*-{3,}.*$/gm, '')
    .replace(/^\|(.+)\|$/gm, (_m, fila: string) =>
      fila
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean)
        .join(' · '),
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (texto) partes.push(texto);

  if (r.documentos.length) {
    partes.push(
      '📎 Documentos:\n' +
        r.documentos
          .map((d) => `• ${d.tipo_etiqueta}${d.lote ? ` lote ${d.lote}` : ''}${d.fecha ? ` (${d.fecha})` : ''}: ${d.url}`)
          .join('\n'),
    );
  }

  if (r.citas.length) {
    partes.push(
      '📄 Fuentes:\n' +
        r.citas.map((c, i) => `[${i + 1}] ${c.referencia}\n  ${c.url}${c.pagina ? `#page=${c.pagina}` : ''}`).join('\n'),
    );
  }

  if (r.archivos.length) {
    partes.push('📄 PDF:\n' + r.archivos.map((a) => `• ${a.titulo} (${a.detalle})`).join('\n'));
  }

  if (r.opcionesArchivo.length) {
    partes.push('Elige el documento:\n' + r.opcionesArchivo.map((a, i) => `${i + 1}. ${a.titulo} (${a.detalle})`).join('\n'));
  }

  if (r.notas.length) {
    partes.push('📝 Notas relacionadas:\n' + r.notas.map((n, i) => `${i + 1}. ${n.titulo}`).join('\n'));
  }

  if (r.opciones.length) {
    partes.push('Responde con el número del producto:\n' + r.opciones.map((o, i) => `${i + 1}. ${o.nombre}`).join('\n'));
  }
  if (r.sugerirCambio) {
    partes.push(`Responde "sí" para cambiar a ${r.sugerirCambio.nombre}.`);
  }
  if (r.sinRespuesta && !r.esIa && !r.opciones.length) {
    partes.push('Responde "IA" para obtener una respuesta general generada con IA.');
  }
  return partes.join('\n\n');
}
