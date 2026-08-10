/**
 * Estructuras de respuesta del parseo de un XML de comprobante de retención (codDoc=07)
 * recibido de un tercero (ej. Bendo, como agente de retención sobre pagos con tarjeta).
 * Data lista para poblar el resumen/confirmación en el frontend. NO persiste nada.
 */

export interface DetalleXmlRetencion {
    /** con_cabece_impues.ide_cncim resuelto desde <codigoRetencion> */
    ide_cncim: number;
    nombre_cncim: string | null;
    casillero_cncim: string | null;
    /** <codigoRetencion> tal como viene en el XML, para mostrarlo si no hay nombre */
    codigo_retencion_xml: string;
    base_cndre: number;
    porcentaje_cndre: number;
    valor_cndre: number;
}

export interface ImportarXmlRetencionResult {
    // Emisor del comprobante de retención (ej. Bendo)
    ruc_emisor: string;
    razon_social_emisor: string;
    // Cabecera del comprobante de retención
    numero_cncre: string;
    autorizacion_cncre: string;
    fecha_emisi_cncre: string;
    // Sujeto retenido (debería ser la propia empresa)
    identificacion_sujeto_retenido: string;
    razon_social_sujeto_retenido: string;
    // Detalle
    detalles: DetalleXmlRetencion[];
    total_retencion: number;
}
