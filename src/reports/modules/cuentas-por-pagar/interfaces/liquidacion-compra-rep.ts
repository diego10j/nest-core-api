export interface LiquidacionCompraCabecera {
    ide_cpcfa: number;
    numero_cpcfa: string;
    fecha_emisi_cpcfa: Date | string;
    observacion_cpcfa?: string;

    // Proveedor (vendedor / sujeto a quien se liquida la compra)
    nom_geper: string;
    identificac_geper: string;
    direccion_geper?: string;
    telefono_geper?: string;
    correo_geper?: string;

    // Totales
    base_grabada_cpcfa: number;
    base_tarifa0_cpcfa: number;
    base_no_objeto_iva_cpcfa: number;
    valor_iva_cpcfa: number;
    valor_ice_cpcfa: number;
    tarifa_iva_cpcfa: number;
    descuento_cpcfa?: number;
    total_cpcfa: number;

    // Forma de pago
    nombre_cndfp?: string;

    // Comprobante electrónico SRI
    claveacceso_srcom?: string;
    autorizacion_srcomn?: string;
    fechaautoriza_srcom?: Date | string;
}

export interface LiquidacionCompraDetalle {
    ide_cpdfa: number;
    ide_inarti: number;
    codigo_inarti: string;
    nombre_inarti: string;
    cantidad_cpdfa: number;
    precio_cpdfa: number;
    valor_cpdfa: number;
    observacion_cpdfa?: string;
    iva_inarti_cpdfa: string;
    siglas_inuni?: string;
}

/** Línea de cxp_datos_com_reembolso (Anexo 17 SRI). */
export interface LiquidacionCompraReembolso {
    identificacion_cpdcr: string;
    serie_cpdcr: string;
    secuencial_cpdcr: string;
    base_no_objeto_cpdcr: number;
    base_tarifa0_cpdcr: number;
    base_imponible_cpdcr: number;
    valor_iva_cpdcr: number;
    valor_ice_cpdcr: number;
}

export interface LiquidacionCompraRep {
    cabecera: LiquidacionCompraCabecera;
    detalles: LiquidacionCompraDetalle[];
    reembolsos: LiquidacionCompraReembolso[];
}
