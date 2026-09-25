import { CitaDocumento, CitaIa } from '../../base-tecnica/bdt-consulta.service';

/** Grupo de etiquetas contiguas: "[D1 p.2]", "[D1 p.2][D3]", "[D1, D2 p.4]"… + puntuación siguiente. */
const GRUPO_CITAS = /[ \t]*(\[D\d+[^\]\n]{0,40}\](?:[ \t,;]*\[D\d+[^\]\n]{0,40}\])*)([.,;:])?/gi;
const ETIQUETA = /D(\d+)(?:\s*(?:p\.|pág\.?|pag\.?)\s*(\d+))?/gi;

/** Prefijo del href que el chat reconoce como cita en línea: "#cita-0-2" → citas 0 y 2. */
export const PREFIJO_CITA = '#cita-';

/**
 * Convierte las etiquetas [D1 p.2] que escribe la IA en citas en línea: un link markdown
 * `[nombre del documento +N](#cita-0-2)` en el mismo lugar del texto, que el chat web dibuja como
 * chip con ícono de documento. Las etiquetas que no corresponden a un documento consultado se
 * descartan (la IA no puede inventar fuentes). La puntuación que seguía a la etiqueta se mueve antes
 * del chip: "a 25 °C [D1]." → "a 25 °C. [chip]".
 */
export function convertirCitasEnLinea(
  texto: string,
  resolver: (etiquetas: CitaIa[]) => CitaDocumento[],
): { texto: string; citas: CitaDocumento[] } {
  const citas: CitaDocumento[] = [];
  const indiceDe = (c: CitaDocumento) => {
    const i = citas.findIndex((x) => x.ide_bddoc === c.ide_bddoc && x.pagina === c.pagina);
    if (i >= 0) return i;
    citas.push(c);
    return citas.length - 1;
  };

  const resultado = texto.replace(GRUPO_CITAS, (_m, grupo: string, puntuacion?: string) => {
    const etiquetas: CitaIa[] = [];
    for (const e of grupo.matchAll(ETIQUETA)) {
      etiquetas.push({ doc: `D${e[1]}`, pagina: e[2] ? Number(e[2]) : null });
    }
    const resueltas = resolver(etiquetas);
    const p = puntuacion ?? '';
    if (!resueltas.length) return p;

    const indices = [...new Set(resueltas.map(indiceDe))];
    const primera = citas[indices[0]];
    const nombre = primera.archivo.replace(/\.[a-z0-9]{2,4}$/i, '');
    const etiqueta = `${nombre.length > 28 ? `${nombre.slice(0, 27)}…` : nombre}${indices.length > 1 ? ` +${indices.length - 1}` : ''}`;
    // Corchetes del nombre escapados para no romper el link markdown.
    return `${p} [${etiqueta.replace(/[[\]]/g, '')}](${PREFIJO_CITA}${indices.join('-')})`;
  });

  return { texto: resultado.replace(/[ \t]+\n/g, '\n').trim(), citas };
}

/** Para canales de texto (Telegram): el chip se reemplaza por "[1]" numerado según las fuentes. */
export function citasATextoPlano(texto: string): string {
  return texto.replace(/\s?\[[^\]]*\]\(#cita-([\d-]+)\)/g, (_m, ids: string) =>
    ` [${ids
      .split('-')
      .map((i) => Number(i) + 1)
      .join(',')}]`,
  );
}
