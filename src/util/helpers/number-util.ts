import { isDefined } from './common-util';

/**
 * Redondea a dos decimales un numero
 */
export function fNumber(value: number, decimals: number = 2): string {
  // console.log(new Intl.NumberFormat().format(number));
  if (!isDefined(value)) {
    value = 0;
  }
  if (isNaN(value)) {
    value = 0;
  }
  return Number(Math.round(parseFloat(value + 'e' + decimals)) + 'e-' + decimals).toFixed(decimals);
}
