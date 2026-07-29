/**
 * Puerto de TipoImpuestoEnum.java / TipoImpuestoIvaEnum.java (dj.comprobantes.offline.enums).
 * Códigos de catálogo del SRI para impuestos y porcentajes de IVA en los XML de comprobantes.
 */

/** Código de impuesto SRI (catálogo <impuesto><codigo>). */
export const TipoImpuestoCodigo = {
    RENTA: 1,
    IVA: 2,
    ICE: 3,
    IRBPNR: 5,
} as const;

const IVA_0 = { codigo: '0', porcentaje: 0 };
const IVA_12 = { codigo: '2', porcentaje: 12 };
const IVA_NO_OBJETO = { codigo: '6' };
const IVA_EXENTO = { codigo: '7' };

/** Código SRI de <codigoPorcentaje> a partir del porcentaje de IVA (por defecto 15% si no coincide con 0/12). */
export function getCodigoPorcentajeIva(porcentaje: number | string | null | undefined): string {
    const valor = Math.trunc(Number(porcentaje ?? 0));
    if (valor === IVA_0.porcentaje) return IVA_0.codigo;
    if (valor === IVA_12.porcentaje) return IVA_12.codigo;
    return '4'; // IVA_VENTA_15, valor por defecto (paridad con TipoImpuestoIvaEnum.getCodigo del legacy)
}

export const CODIGO_PORCENTAJE_IVA_0 = IVA_0.codigo;
export const CODIGO_PORCENTAJE_IVA_NO_OBJETO = IVA_NO_OBJETO.codigo;
export const CODIGO_PORCENTAJE_IVA_EXENTO = IVA_EXENTO.codigo;
