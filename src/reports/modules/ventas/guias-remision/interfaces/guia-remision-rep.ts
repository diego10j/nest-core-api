export interface GuiaRemisionCabecera {
    ide_ccgui: number;
    ide_cccfa: number;
    fecha_emision_ccgui: Date | string;
    fecha_ini_trasla_ccgui: Date | string;
    fecha_fin_trasla_ccgui: Date | string;
    punto_partida_ccgui?: string;
    punto_llegada_ccgui?: string;
    nombre_cctgi?: string;

    // Destinatario
    destinatario_ccgui: string;
    destinatario_identificacion?: string;
    destinatario_direccion?: string;

    // Comprobante de venta relacionado (factura)
    secuencial_cccfa: string;
    fecha_emisi_cccfa: Date | string;
    establecimiento_ccdfa: string;
    pto_emision_ccdfa: string;
    factura_autorizacion?: string;

    // Transporte
    es_transporte_propio_cctfa?: boolean;
    placa_gecam?: string;
    vehiculo?: string;
    nombre_vgtra?: string;
    chofer?: string;

    // Comprobante electrónico SRI (guía propia)
    claveacceso_srcom?: string;
    autorizacion_srcomn?: string;
    fechaautoriza_srcom?: Date | string;
    estab_srcom?: string;
    ptoemi_srcom?: string;
    secuencial_srcom?: string;
}

export interface GuiaRemisionDetalle {
    ide_ccdfa: number;
    ide_inarti: number;
    codigo_inarti: string;
    nombre_inarti: string;
    cantidad_ccdfa: number;
    observacion_ccdfa?: string;
    siglas_inuni?: string;
}

export interface GuiaRemisionRep {
    cabecera: GuiaRemisionCabecera;
    detalles: GuiaRemisionDetalle[];
}
