/** Línea de factura del producto ya depurada (precio neto sin IVA y costo promedio de la fecha). */
export type Linea = {
  tipo: number | null;
  nombreTipo: string;
  /** Medio de pago (detalle de la forma de pago): id y nombre. */
  ideMedio: number | null;
  medio: string;
  cantidad: number;
  precio: number;
  costo: number;
  valida: boolean;
};

export const r2 = (v: number) => Math.round(v * 100) / 100;
export const r4 = (v: number) => Math.round(v * 10000) / 10000;

export function mediana(valores: number[]): number {
  const s = [...valores].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function percentil(valores: number[], p: number): number {
  const s = [...valores].sort((a, b) => a - b);
  if (s.length === 0) return 0;
  return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))];
}

export const margenLinea = (l: Linea) => ((l.precio - l.costo) / l.costo) * 100;

/**
 * Margen típico del conjunto: mediana de los márgenes de cada línea. No se pondera por cantidad: una venta grande
 * a margen bajo no debe arrastrar al resto (en productos caros las cantidades pequeñas son las de mayor utilidad).
 */
export function margenPonderado(lineas: Linea[]): number {
  return lineas.length > 0 ? mediana(lineas.map(margenLinea)) : 0;
}
