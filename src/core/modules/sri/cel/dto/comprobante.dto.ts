import { ReembolsoLineaDto } from 'src/core/modules/sri/xml/dto/reembolso-linea.dto';

import { ClienteDto } from './cliente.dto';
import { DestinatarioDto } from './destinatario.dto';
import { DetalleComprobanteDto } from './detalle-comprobante.dto';
import { DetalleImpuestoDto } from './detalle-impuesto.dto';
import { FirmaDto } from './firma.dto';
import { TransportistaDto } from './transportista.dto';

export class ComprobanteDto {
  codigocomprobante: number;
  tipoemision: string;
  claveacceso: string;
  coddoc: string;
  estab: string;
  ptoemi: string;
  secuencial: string;
  fechaemision: string;
  direstablecimiento?: string; // Dirección de la oficina
  guiaremision?: string;
  numAutorizacion: string;
  totalsinimpuestos?: number;
  totaldescuento?: number;
  propina?: number;
  importetotal?: number;
  moneda?: string;
  periodofiscal?: string;
  rise?: string;
  coddocmodificado?: string;
  numdocmodificado?: string;
  fechaemisiondocsustento?: string;
  valormodificacion?: number;
  codigofirma?: FirmaDto;
  codigoestado?: number;
  oficina?: string;
  fechaautoriza?: string;
  cliente?: ClienteDto;
  subtotal0?: number;
  subtotal?: number;
  iva?: number;
  detalle?: DetalleComprobanteDto[];
  enNube?: boolean; // Por defecto es false
  impuesto?: DetalleImpuestoDto[];
  formaCobro?: string; // Por defecto "01" (efectivo)
  motivo?: string;
  diasCredito?: number;
  numOrdenCompra?: string;
  infoAdicional1?: string;
  infoAdicional2?: string;
  infoAdicional3?: string;
  agenteRetencion?: string; // 01-10/2020
  correo?: string;
  // Campos para guías de remisión
  dirPartida?: string;
  fechaIniTransporte?: string;
  fechaFinTransporte?: string;
  placa?: string;
  transportista?: TransportistaDto;
  destinatario?: DestinatarioDto;
  codigoComprobanteFactura?: number;
  telefonos?: string;
  rucEmpresa?: string;
  correoEmpresa?: string;
  // Reembolso de gastos (Anexo 17 SRI), solo Liquidación de Compra
  reembolsos?: ReembolsoLineaDto[];
}
