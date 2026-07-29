export interface RetencionCabecera {
    ide_cncre: number;
    numero_cncre: string;
    fecha_emisi_cncre: Date | string;
    observacion_cncre?: string;

    // Sujeto retenido (proveedor)
    nom_geper: string;
    identificac_geper: string;
    direccion_geper?: string;
    telefono_geper?: string;
    correo_geper?: string;

    // Documento sustento (compra a la que se retiene)
    numero_cpcfa: string;
    fecha_emisi_cpcfa: Date | string;
    nombre_cntdo: string;

    // Comprobante electrónico SRI
    claveacceso_srcom?: string;
    autorizacion_srcomn?: string;
    fechaautoriza_srcom?: Date | string;
    periodo_fiscal_srcom?: string;
}

export interface RetencionDetalle {
    ide_cndre: number;
    nombre_cncim: string;
    casillero_cncim: string;
    porcentaje_cndre: number;
    base_cndre: number;
    valor_cndre: number;
}

export interface ComprobanteRetencionRep {
    cabecera: RetencionCabecera;
    detalles: RetencionDetalle[];
    total: number;
}
