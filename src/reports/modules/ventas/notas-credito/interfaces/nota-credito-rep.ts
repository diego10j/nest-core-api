export interface NotaCreditoCabecera {
    ide_cpcno: number;
    numero_cpcno: string;
    fecha_emisi_cpcno: Date | string;
    observacion_cpcno?: string;

    // Cliente
    nom_geper: string;
    identificac_geper: string;
    direccion_geper?: string;
    telefono_geper?: string;
    correo_geper?: string;

    // Comprobante que se modifica
    num_doc_mod_cpcno: string;
    fecha_emision_mod_cpcno: Date | string;
    valor_mod_cpcno: number;
    nombre_cpmno: string;

    // Totales
    base_grabada_cpcno: number;
    base_tarifa0_cpcno: number;
    base_no_objeto_iva_cpcno: number;
    valor_iva_cpcno: number;
    tarifa_iva_cpcno: number;
    total_cpcno: number;

    // Comprobante electrónico SRI
    claveacceso_srcom?: string;
    autorizacion_srcomn?: string;
    fechaautoriza_srcom?: Date | string;
}

export interface NotaCreditoDetalle {
    ide_cpdno: number;
    ide_inarti: number;
    codigo_inarti: string;
    nombre_inarti: string;
    cantidad_cpdno: number;
    precio_cpdno: number;
    valor_cpdno: number;
    observacion_cpdno?: string;
    iva_inarti_cpdno: string;
    siglas_inuni?: string;
}

export interface NotaCreditoRep {
    cabecera: NotaCreditoCabecera;
    detalles: NotaCreditoDetalle[];
}
