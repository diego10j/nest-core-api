/**
 * Formatea una fecha proveniente de la BD (string 'YYYY-MM-DD[...]' o Date) a 'dd/MM/yyyy'
 * para los XML de comprobantes SRI. Se opera sobre los componentes literales del string ISO
 * cuando es posible, para no arrastrar corrimientos de zona horaria al convertir a Date.
 */
export function formatFechaSri(fecha: string | Date | null | undefined): string {
  if (!fecha) return '';
  if (typeof fecha === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
    if (match) {
      const [, yyyy, mm, dd] = match;
      return `${dd}/${mm}/${yyyy}`;
    }
    fecha = new Date(fecha);
  }
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const yyyy = fecha.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
