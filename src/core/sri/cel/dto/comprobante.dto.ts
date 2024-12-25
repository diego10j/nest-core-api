import { ClienteDto } from "./cliente.dto";
import { DetalleComprobanteDto } from "./detalle-comprobante.dto";


export class ComprobanteDto {
    codigocomprobante: number;
    tipoemision: string;
    claveacceso: string;
    coddoc: string;
    estab: string;
    ptoemi: string;
    secuencial: string;
    fechaemision: Date;
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
    fechaemisiondocsustento?: Date;
    valormodificacion?: number;
    codigofirma?: any; // Define correctamente según tu implementación para "Firma"
    codigoestado?: number;
    oficina?: string;
    fechaautoriza?: Date;
    cliente?: ClienteDto;
    subtotal0?: number;
    subtotal?: number;
    iva?: number;
    detalle?: DetalleComprobanteDto[];
    enNube?: boolean; // Por defecto es false
    impuesto?: any[]; // Define correctamente según tu implementación para "DetalleImpuesto"
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
    fechaIniTransporte?: Date;
    fechaFinTransporte?: Date;
    placa?: string;
    destinatario?: any; // Define correctamente según tu implementación para "Destinatario"
    codigoComprobanteFactura?: number;
    telefonos?: string;
    rucEmpresa?: string;
    correoEmpresa?: string;
}
