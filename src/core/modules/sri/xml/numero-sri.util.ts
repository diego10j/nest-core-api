/**
 * Formato numérico para los XML de comprobantes electrónicos SRI.
 * Puerto de UtilitarioCeo.java (getFormatoNumero/getFormatoPrecio) del legacy sigafi-ceo,
 * manteniendo el mismo redondeo (Math.round half-up) y separador decimal '.'.
 */

/** Redondea a `decimales` posiciones y formatea con punto decimal, sin separador de miles. Default 2 decimales (monto). */
export function fNumero(numero: number | string | null | undefined, decimales = 2): string {
    const valor = toNumber(numero);
    const factor = Math.pow(10, decimales);
    const redondeado = Math.round(valor * factor) / factor;
    return redondeado.toFixed(decimales);
}

/**
 * Puerto de getFormatoPrecio: número de decimales dinámico según los decimales
 * significativos del valor original (precios unitarios con más de 2 decimales, ej. 10.2500 -> 10.25, 10.12345 -> 10.1235).
 *  - sin decimales o <=2 decimales significativos -> 2
 *  - 3 decimales significativos -> 3
 *  - más de 3 -> 4
 */
export function fPrecio(numero: number | string | null | undefined): string {
    if (numero === null || numero === undefined) return '';
    const cadena = String(numero);
    const puntoIdx = cadena.indexOf('.');
    if (puntoIdx === -1) {
        return fNumero(numero, 2);
    }
    const parteDecimal = cadena.slice(puntoIdx + 1).replace(/0+$/, '');
    const escalaSinCeros = parteDecimal.length;
    let decimalesAMostrar: number;
    if (escalaSinCeros <= 2) {
        decimalesAMostrar = 2;
    } else if (escalaSinCeros === 3) {
        decimalesAMostrar = 3;
    } else {
        decimalesAMostrar = 4;
    }
    return fNumero(numero, decimalesAMostrar);
}

function toNumber(valor: number | string | null | undefined): number {
    if (valor === null || valor === undefined || valor === '') return 0;
    const n = typeof valor === 'number' ? valor : Number(valor);
    return Number.isFinite(n) ? n : 0;
}
