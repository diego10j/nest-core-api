export class EmisorDto {
  codigoEmisor: number;
  ruc: string;
  razonSocial: string;
  nombreComercial: string;
  dirMatriz: string;
  contribuyenteEspecial?: string;
  obligadoContabilidad: string;
  tiempoMaxEspera?: number;
  ambiente: number;
  wsdlRecepcion: string;
  wsdlAutorizacion: string;
  /** RUC Proveedor para Información Adicional (variable p_gen_ruc_proveedor_sri); no se cachea con el emisor. */
  rucProveedor?: string;
}
