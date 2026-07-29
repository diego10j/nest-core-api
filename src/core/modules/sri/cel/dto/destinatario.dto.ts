export class DestinatarioDto {
  identificacionDestinatario: string;
  razonSocialDestinatario: string;
  dirDestinatario: string;
  motivoTraslado: string;
  docAduaneroUnico?: string = '000';
  codEstabDestino: string;
  ruta?: string = 'RUTA';
  codDocSustento: string;
  numDocSustento: string;
  numAutDocSustento: string;
  fechaEmisionDocSustento: string;
  telefono?: string;
  correo?: string;
}
