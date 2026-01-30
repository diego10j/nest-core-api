export interface ConteoFisicoInvRep {
    // Cabecera del conteo
    ide_inccf: number;
    secuencial_inccf: number;
    fecha_corte_inccf: Date | string;
    fecha_corte_desde_inccf: Date | string;
    productos_estimados_inccf: number;
    fecha_ingre: Date | string;
    // Bodega
    nombre_inbod: string;

    // Tipo de conteo
    nombre_intc: string;
    tolerancia_porcentaje_intc: number;

    // Estado
    codigo_inec: string;
    nombre_inec: string;

    // Detalles de artículos
    ide_indcf: number;
    codigo_inarti: string;
    nombre_inarti: string;
    nombre_incate: string;
    decim_stock_inarti: number;
    siglas_inuni: string;
    saldo_corte_indcf: number;
    cantidad_fisica_indcf: number;

    // Reconteo (si aplica)
    cantidad_reconteo_indcf?: number;
    observacion_indcf?: string;
    nom_usua: string;
}
