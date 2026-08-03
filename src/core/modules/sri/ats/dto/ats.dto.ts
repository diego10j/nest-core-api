import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Query para generar el Anexo Transaccional Simplificado (ATS) de un período. */
export class AtsQueryDto {
    /** Año calendario, 4 dígitos (ej. '2026') */
    @IsString()
    @IsNotEmpty()
    anio: string;

    /** Mes calendario, 1 o 2 dígitos (ej. '7', '07') */
    @IsString()
    @IsNotEmpty()
    mes: string;

    /**
     * '1' compras+ventas (único usado por "ATS Comprobantes Electrónicos" del legacy),
     * '2' solo compras, '3' solo ventas. Default '1'.
     */
    @IsIn(['1', '2', '3'])
    @IsOptional()
    opcionAnexo?: string;
}

export interface AtsAirDetalleDto {
    codRetAir: string;
    baseImpAir: number;
    porcentajeAir: number;
    valRetAir: number;
    /** con_cabece_impues.nombre_cncim — solo para el resumen/talón, no viaja en el XML del ATS. */
    nombreConcepto?: string;
}

export interface AtsReembolsoDto {
    tipoComprobanteReemb: string;
    tpIdProvReemb: string;
    idProvReemb: string;
    establecimientoReemb: string;
    puntoEmisionReemb: string;
    secuencialReemb: string;
    fechaEmisionReemb: string;
    autorizacionReemb: string;
    baseImponibleReemb: number;
    baseImpGravReemb: number;
    baseNoGraIvaReemb: number;
    baseImpExeReemb: number;
    montoIceRemb: number;
    montoIvaRemb: number;
}

export interface AtsRetencionAsociadaDto {
    estabRetencion1: string;
    ptoEmiRetencion1: string;
    secRetencion1: string;
    autRetencion1: string;
    fechaEmiRet1: string;
}

export interface AtsDocModificadoDto {
    docModificado: string;
    estabModificado: string;
    ptoEmiModificado: string;
    secModificado: string;
    autModificado: string;
}

export interface AtsPagoExteriorDto {
    pagoLocExt: string;
    tipoRegi?: string;
    paisEfecPagoGen?: string;
    paisEfecPago: string;
    aplicConvDobTrib: string;
    pagExtSujRetNorLeg: string;
}

/** Una línea de <detalleCompras> del ATS (documento de compra CxP del período). */
export interface AtsCompraDto {
    codSustento: string;
    tpIdProv: string;
    idProv: string;
    tipoComprobante: string;
    /** con_tipo_document.nombre_cntdo — solo para el resumen/talón, no viaja en el XML del ATS. */
    nombreTipoComprobante?: string;
    parteRel: string;
    fechaRegistro: string;
    establecimiento: string;
    puntoEmision: string;
    secuencial: string;
    fechaEmision: string;
    autorizacion: string;
    baseNoGraIva: number;
    baseImponible: number;
    baseImpGrav: number;
    baseImpExe: number;
    montoIce: number;
    montoIva: number;
    valorRetBienes: number;
    valorRetServicios: number;
    valRetServ100: number;
    totBasesImpReemb: number;
    pagoExterior: AtsPagoExteriorDto;
    /** Solo si total_cpcfa >= 500 (umbral heredado del legacy) */
    formaPago?: string;
    /** true si ide_cntdo = tipo documento REEMBOLSOS (ATS): usa <reembolsos>, no <air> */
    esReembolso: boolean;
    reembolsos: AtsReembolsoDto[];
    retencionAsociada?: AtsRetencionAsociadaDto;
    air: AtsAirDetalleDto[];
    docModificado?: AtsDocModificadoDto;
}

/** Una línea de <detalleVentas> del ATS (agregado por cliente + tipo de comprobante). */
export interface AtsVentaDto {
    tpIdCliente: string;
    idCliente: string;
    parteRelVtas?: string;
    tipoCliente?: string;
    denoCli?: string;
    tipoComprobante: string;
    tipoEmision: string;
    numeroComprobantes: number;
    baseNoGraIva: number;
    baseImponible: number;
    baseImpGrav: number;
    montoIva: number;
    montoIce: number;
    valorRetIva: number;
    valorRetRenta: number;
    /** Solo ventas (no notas de crédito) */
    formaPago?: string;
}

export interface AtsVentaEstablecimientoDto {
    codEstab: string;
    ventasEstab: number;
    ivaComp: number;
}

export interface AtsAnuladoDto {
    tipoComprobante: string;
    establecimiento: string;
    puntoEmision: string;
    secuencialInicio: string;
    secuencialFin: string;
    autorizacion: string;
}

/**
 * Una línea de retención de IVA por concepto/porcentaje (con_cabece_impues.casillero_cncim/
 * nombre_cncim, filtrado por con_impuesto.codigo_fe_cnimp = IVA), agregada para todo el período —
 * solo para el Talón Resumen (no viaja en el XML del ATS, que ya reporta esto vía valorRetBienes/
 * valorRetServicios/valRetServ100 por comprobante).
 */
export interface AtsRetencionIvaConceptoDto {
    codigo: string;
    nombre: string;
    valor: number;
}

/** Anexo Transaccional Simplificado completo, listo para armar el XML. */
export interface AtsAnexoDto {
    anio: string;
    mes: string;
    ruc: string;
    razonSocial: string;
    numEstabRuc: string;
    /** '1' compras+ventas, '2' solo compras, '3' solo ventas: determina qué tags de nivel raíz se emiten. */
    opcionAnexo: string;
    compras: AtsCompraDto[];
    ventas: AtsVentaDto[];
    ventasEstablecimiento: AtsVentaEstablecimientoDto[];
    anulados: AtsAnuladoDto[];
    retencionIvaCompras: AtsRetencionIvaConceptoDto[];
}
