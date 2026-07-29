/**
 * Sustento tributario permitido por tipo de comprobante (Tabla 4: TIPOS
 * COMPROBANTES AUTORIZADOS, columna "Sustento tributario", Ficha Técnica
 * Anexo Transaccional Simplificado — SRI). Códigos de sri_tipo_sustento_tributario
 * (alterno_srtst) válidos para cada tipo de documento CxP que usa ide_srtst.
 *
 * Código ATS del tipo de comprobante (referencia, no se usa directamente):
 *  1 Factura | 3 Liquidación de compra de bienes o prestación de servicios |
 *  4 Nota de crédito | 41 Comprobante de venta emitido por reembolso
 */
export const SUSTENTO_FACTURA = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '14', '15', '00'];
export const SUSTENTO_LIQUIDACION_COMPRA = ['01', '02', '03', '04', '05', '06', '07', '08', '14', '15'];
export const SUSTENTO_NOTA_CREDITO = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '14', '15', '00'];
export const SUSTENTO_REEMBOLSO = ['01', '02', '03', '04', '05', '06', '07'];
