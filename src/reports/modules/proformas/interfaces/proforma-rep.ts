export interface ProformaRepCabecera {
    ide_cccpr: number;
    secuencial_cccpr: string;
    fecha_cccpr: Date | string;
    solicitante_cccpr?: string;
    correo_cccpr?: string;
    telefono_cccpr?: string;
    contacto_cccpr?: string;
    direccion_cccpr?: string;
    base_grabada_cccpr: number;
    base_tarifa0_cccpr: number;
    valor_iva_cccpr: number;
    total_cccpr: number;
    tarifa_iva_cccpr: number;
    observacion_cccpr?: string;
    referencia_cccpr?: string;
    anulado_cccpr?: boolean;
    enviado_cccpr?: boolean;
    ide_getid?: number;
    nombre_getid?: string;
    identificac_cccpr?: string;
    ide_vgven?: number;
    nombre_vgven?: string;
    ide_ccten?: number;
    nombre_ccten?: string;
    ide_ccvap?: number;
    nombre_ccvap?: string;
    ide_cctpr?: number;
    nombre_cctpr?: string;
    utilidad_cccpr?: number;
    ide_usua?: number;
    nom_usua?: string;
    fecha_ingre?: Date | string;
    hora_ingre?: string;
    usuario_ingre?: string;
    fecha_actua?: Date | string;
    hora_actua?: string;
    usuario_actua?: string;
}

export interface ProformaRepDetalle {
    ide_ccdpr: number;
    ide_inarti: number;
    observacion_ccdpr?: string;
    cantidad_ccdpr: number;
    precio_ccdpr: number;
    total_ccdpr: number;
    iva_inarti_ccdpr: number;
    ide_inuni?: number;
    siglas_inuni?: string;
    codigo_inarti?: string;
    nombre_inarti?: string;
    uuid?: string;
    precio_compra_ccdpr?: number;
    porcentaje_util_ccdpr?: number;
    utilidad_ccdpr?: number;
}

export interface ProformaRepFactura {
    ide_cccfa: number;
    secuencial_cccfa: string;
    fecha_emision_cccfa: Date | string;
    base_grabada_cccfa: number;
    base_tarifa0_cccfa: number;
    valor_iva_cccfa: number;
    total_cccfa: number;
    ide_geper?: number;
    cliente?: string;
    identificacion_cliente?: string;
}

export interface ProformaRep {
    cabecera: ProformaRepCabecera;
    detalles: ProformaRepDetalle[];
    factura: ProformaRepFactura | null;
}