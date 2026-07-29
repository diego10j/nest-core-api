export interface DetalleImpuestoReembolsoDto {
  codigo: number;
  codigoPorcentaje: string;
  tarifa: number;
  baseImponibleReembolso: number;
  impuestoReembolso: number;
}

/**
 * Línea de reembolso ya resuelta y lista para el XML (Anexo 17 SRI,
 * Liquidación de Compra). Producida por cuentas-por-pagar/documentos-cxp.
 */
export interface ReembolsoLineaDto {
  tipoIdentificacionProveedorReembolso: string;
  identificacionProveedorReembolso: string;
  codPaisPagoProveedorReembolso: number;
  tipoProveedorReembolso: string;
  codDocReembolso: string;
  estabDocReembolso: string;
  ptoEmiDocReembolso: string;
  secuencialDocReembolso: string;
  fechaEmisionDocReembolso: string;
  numeroautorizacionDocReemb: string;
  detalleImpuestos: DetalleImpuestoReembolsoDto[];
}
