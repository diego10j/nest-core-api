export interface FacturaCabecera {
    ide_cccfa: number;
    ide_ccdaf: number;
    fecha_emisi_cccfa: Date | string;
    secuencial_cccfa: string;
    dias_credito_cccfa: number;
    observacion_cccfa?: string;

    // Punto de emisión
    serie_ccdaf: string;
    establecimiento_ccdfa: string;
    pto_emision_ccdfa: string;
    observacion_ccdaf?: string;

    // Cliente
    nom_geper: string;
    identificac_geper: string;
    direccion_geper?: string;
    telefono_geper?: string;
    correo_geper?: string;

    // Totales
    base_grabada_cccfa: number;
    base_tarifa0_cccfa: number;
    base_no_objeto_iva_cccfa: number;
    valor_iva_cccfa: number;
    tarifa_iva_cccfa: number;
    total_cccfa: number;

    // Comprobante electrónico SRI
    claveacceso_srcom?: string;
    autorizacion_srcomn?: string;
    fechaautoriza_srcom?: Date | string;
    ide_sresc?: number;
    nombre_sresc?: string;
    icono_sresc?: string;
    color_sresc?: string;

    // Vendedor y forma de pago
    nombre_vgven?: string;
    nombre_cndfp?: string;

    // Retención
    ide_cncre?: number;
    numero_retencion?: string;

    // Auditoría
    usuario_ingre?: string;
    fecha_ingre?: Date | string;
    hora_ingre?: string;
}

export interface FacturaDetalle {
    ide_ccdfa: number;
    ide_inarti: number;
    cantidad_ccdfa: number;
    precio_ccdfa: number;
    total_ccdfa: number;
    observacion_ccdfa?: string;
    iva_inarti_ccdfa: number;
    codigo_inarti: string;
    nombre_inarti: string;
    otro_nombre_inarti?: string;
    siglas_inuni?: string;
    nombre_incate?: string;
}

export interface FacturaPago {
    pagada: boolean;
    estado: string;
    color: string;
    detalles: FacturaPagoDetalle[];
    total: number;
}

export interface FacturaPagoDetalle {
    ide_ccdtr: number;
    fecha_trans_ccdtr: Date | string;
    docum_relac_ccdtr?: string;
    nombre_tettb?: string;
    valor_ccdtr: number;
    nombre_teban?: string;
    cuenta?: string;
    observacion?: string;
}

export interface FacturaRetencion {
    cabecera: {
        ide_cncre: number;
        fecha_emisi_cncre: Date | string;
        numero_cncre: string;
        observacion_cncre?: string;
        autorizacion_cncre?: string;
    };
    detalles: FacturaRetencionDetalle[];
    total: number;
}

export interface FacturaRetencionDetalle {
    nombre_cncim: string;
    casillero_cncim: string;
    porcentaje_cndre: number;
    base_cndre: number;
    valor_cndre: number;
}

export interface FacturaRep {
    cabecera: FacturaCabecera;
    detalles: FacturaDetalle[];
    pagos: FacturaPago;
    retencion: FacturaRetencion | null;
    guiaremision?: any | null;
}
