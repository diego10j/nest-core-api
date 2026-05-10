export interface ComprobanteCabecera {
    ide_cnccc: number;
    fecha_trans_cnccc: string;
    numero_cnccc: string;
    observacion_cnccc: string;
    fecha_siste_cnccc: string;
    hora_sistem_cnccc: string;
    automatico_cnccc: boolean;
    ide_empr: number;
    ide_sucu: number;
    ide_cneco: number;
    nombre_cneco: string;
    ide_cntcm: number;
    nombre_cntcm: string;
    ide_geper: number | null;
    nom_geper: string | null;
    ide_modu: number | null;
    nom_modu: string | null;
    ide_usua: number | null;
    nom_usua: string | null;
}

export interface ComprobanteDetalle {
    ide_cndcc: number;
    ide_cnccc: number;
    ide_cnlap: number;
    ide_cndpc: number;
    codig_recur_cndpc: string;
    nombre_cndpc: string;
    valor_cndcc: number;
    debe: number | null;
    haber: number | null;
    observacion_cndcc: string | null;
    referencia_cndcc: string | null;
}

export interface ComprobanteContabilidadData {
    cabecera: ComprobanteCabecera;
    detalle: ComprobanteDetalle[];
}
