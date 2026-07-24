/**
 * Estructuras de respuesta del parseo de un XML de factura electrónica SRI.
 * Data lista para poblar el formulario del documento CxP (no se persiste nada).
 */

export interface DetalleXmlCxP {
    cantidad_cpdfa: number;
    observacion_cpdfa: string;
    precio_cpdfa: number;
    valor_cpdfa: number;
    /** '1' = grava IVA, '-1' = tarifa 0, '0' = no objeto */
    iva_inarti_cpdfa: '1' | '-1' | '0';
    codigo_principal?: string;
}

export interface TotalesXmlCxP {
    base_grabada: number;
    base_tarifa0: number;
    base_no_objeto_iva: number;
    valor_iva: number;
    total: number;
    tarifa_iva: number;
}

export interface ImportarXmlCxPResult {
    // Proveedor
    ide_geper: number;
    nom_geper: string;
    identificac_geper: string;
    // Cabecera del documento
    ide_cntdo: number;
    numero_cpcfa: string;
    autorizacio_cpcfa: string;
    fecha_emisi_cpcfa: string;
    /** Forma de pago mapeada por código SRI (con_deta_forma_pago.alterno_ats) */
    ide_cndfp: number | null;
    /** Forma de pago de días de crédito configurada en el proveedor */
    ide_cndfp1: number | null;
    dias_credito_cpcfa: number;
    // Detalles
    detalles: DetalleXmlCxP[];
    totales: TotalesXmlCxP;
}
