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
}
