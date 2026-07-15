import { isDefined } from './common-util';

/**
 * Redondea a dos decimales un numero
 */
export function fNumber(value: number, decimals: number = 2): string {
  if (!isDefined(value)) {
    value = 0;
  }
  if (isNaN(value)) {
    value = 0;
  }
  return Number(Math.round(parseFloat(value + 'e' + decimals)) + 'e-' + decimals).toFixed(decimals);
}

// ─── Helpers de redondeo para cálculo de proformas ────────────────────────────
// Modelo idéntico al frontend — usado por ProformasService y BotProformaService.

/** Redondea `value` a exactamente `decimals` lugares. */
export function roundTo(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}

/**
 * Determina 2 o 4 decimales para precio_ccdpr.
 * Usa 4 dec si los últimos 2 son significativos, de lo contrario 2.
 */
export function getPrecioDecimals(precio: number): number {
  const dec = Math.abs(precio).toFixed(4).split('.')[1] ?? '0000';
  return (dec[2] === '0' && dec[3] === '0') ? 2 : 4;
}

/** Redondea un precio usando 2 o 4 decimales según la regla del frontend. */
export function roundPrecio(precio: number): number {
  return roundTo(precio, getPrecioDecimals(precio));
}
