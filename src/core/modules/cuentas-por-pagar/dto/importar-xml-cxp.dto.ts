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
    /** <detalle><codigoAuxiliar> - solo para mostrar en el RIDE, no se persiste. */
    codigo_auxiliar?: string;
    /** <detalle><descuento> de esa línea - solo para mostrar en el RIDE, no se persiste
     * (los detalles ya llegan netos en valor_cpdfa, ver nota de totalDescuento abajo). */
    descuento_cpdfa?: number;
}

export interface TotalesXmlCxP {
    base_grabada: number;
    base_tarifa0: number;
    base_no_objeto_iva: number;
    valor_iva: number;
    total: number;
    tarifa_iva: number;
    /** <infoFactura><totalDescuento> del XML - suma de los <descuento> de cada línea. */
    descuento: number;
}

/** Datos del emisor (proveedor) tal como vienen en el propio XML - solo para el RIDE, ya que
 * el proveedor real a usar en el documento CxP es el que ya existe en gen_persona (ver
 * getProveedorPorRuc). */
export interface EmisorXmlCxP {
    ruc: string;
    razonSocial: string;
    nombreComercial?: string;
    direccionMatriz?: string;
    direccionEstablecimiento?: string;
}

/** Metadatos del comprobante electrónico para el RIDE (clave de acceso, autorización,
 * ambiente) - autorizacio_cpcfa (el campo que sí se persiste) puede ser la clave de acceso o
 * el número de autorización corto según lo que traiga el XML; acá se separan para mostrar
 * ambos si están disponibles. */
export interface ComprobanteXmlCxP {
    tipo: string;
    numero: string;
    claveAcceso: string;
    autorizacion: string;
    fechaEmision: string;
    fechaAutorizacion?: string;
    ambiente?: string;
    /** 'NORMAL' | 'INDISPONIBILIDAD DEL SISTEMA' (<tipoEmision> del XML, normalizado a texto) */
    emision?: string;
}

/** Comprador tal como viene en el XML (no necesariamente el mismo "cliente" del envío en el
 * flujo de Registrar Envíos) - puramente informativo para el RIDE. */
export interface CompradorXmlCxP {
    razonSocial?: string;
    identificacion?: string;
}

/** <infoAdicional><campoAdicional nombre="..."> - campos libres que cada emisor define a su
 * gusto (local, vendedor, zona, etc). Puramente informativo para el RIDE. */
export interface InfoAdicionalXmlCxP {
    nombre: string;
    valor: string;
}

/** Datos del "documento modificado" que trae un XML de Nota de Crédito (<infoNotaCredito>),
 * resueltos contra la factura real del proveedor en cxp_cabece_factur (ver
 * DocumentosCxPXmlService.resolverFacturaModificada). El XML de NC del SRI no trae la
 * autorización/clave de acceso de la factura original, solo su número (numDocModificado) y
 * fecha - por eso la autorización se resuelve buscando en la BD, no se lee del XML. */
export interface NotaCreditoXmlCxP {
    /** <infoNotaCredito><numDocModificado> (estab-ptoEmi-secuencial) */
    numDocModificado: string;
    /** <infoNotaCredito><fechaEmisionDocSustento> */
    fechaEmisionDocSustento?: string;
    /** <infoNotaCredito><motivo> */
    motivo?: string;
    /** true si se encontró una factura del proveedor con ese número en el sistema */
    facturaEncontrada: boolean;
    /** autorizacio_cpcfa de la factura encontrada (solo si facturaEncontrada=true) */
    autorizacioFacturaOriginal?: string;
    ideCntdoFacturaOriginal?: number;
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
    // Solo para el RIDE (vista previa) - no se usan al guardar el documento
    emisor: EmisorXmlCxP;
    comprobante: ComprobanteXmlCxP;
    comprador: CompradorXmlCxP;
    infoAdicional: InfoAdicionalXmlCxP[];
    /** Solo presente cuando el XML importado es una Nota de Crédito (codDoc=04) */
    notaCredito?: NotaCreditoXmlCxP;
    /** Aviso no bloqueante para el usuario (ej. no se encontró la factura referenciada, debe
     * seleccionarla manualmente) */
    advertencia?: string;
}
