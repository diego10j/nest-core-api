// tabla: cxp_cabece_factur / cxp_detall_factur
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsDateString,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';

/**
 * Detalle del documento CxP (cxp_detall_factur)
 */
export class DetalleDocumentoCxPDto {
    @IsOptional()
    @IsInt()
    ide_cpdfa?: number;

    /** FK → inv_articulo */
    @IsInt()
    @IsNotEmpty()
    ide_inarti: number;

    /** FK → inv_unidad */
    @IsInt()
    @IsOptional()
    ide_inuni?: number;

    @IsNumber()
    @Min(0)
    @IsNotEmpty()
    cantidad_cpdfa: number;

    @IsNumber()
    @Min(0)
    @IsNotEmpty()
    precio_cpdfa: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    valor_cpdfa?: number;

    /** 1=SI IVA, -1=NO IVA, 0=NO OBJETO */
    @IsString()
    @IsNotEmpty()
    iva_inarti_cpdfa: string;

    @IsString()
    @IsOptional()
    observacion_cpdfa?: string;

    @IsString()
    @IsOptional()
    secuencial_cpdfa?: string;

    @IsString()
    @IsOptional()
    alter_tribu_cpdfa?: string;
}

/**
 * Cabecera del documento CxP (cxp_cabece_factur)
 */
export class CabDocumentoCxPDto {
    @IsOptional()
    @IsInt()
    ide_cpcfa?: number;

    /** FK → con_tipo_document */
    @IsInt()
    @IsNotEmpty()
    ide_cntdo: number;

    /** FK → gen_persona */
    @IsInt()
    @IsNotEmpty()
    ide_geper: number;

    /** Obligatorio salvo Liquidación de Compra electrónica (se genera al guardar). */
    @IsString()
    @IsOptional()
    numero_cpcfa?: string;

    /** Obligatorio salvo Liquidación de Compra electrónica (se genera al guardar). */
    @IsString()
    @IsOptional()
    autorizacio_cpcfa?: string;

    @IsDateString()
    @IsNotEmpty()
    fecha_emisi_cpcfa: string;

    /** FK → con_deta_forma_pago */
    @IsInt()
    @IsNotEmpty()
    ide_cndfp: number;

    /** FK → con_deta_forma_pago (dias credito) */
    @IsInt()
    @IsNotEmpty()
    ide_cndfp1: number;

    @IsString()
    @IsNotEmpty()
    observacion_cpcfa: string;

    @IsNumber()
    @Min(0)
    @IsOptional()
    base_grabada_cpcfa?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    base_no_objeto_iva_cpcfa?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    base_tarifa0_cpcfa?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    valor_iva_cpcfa?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    total_cpcfa?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    descuento_cpcfa?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    porcen_desc_cpcfa?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    otros_cpcfa?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    valor_ice_cpcfa?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    tarifa_iva_cpcfa?: number;

    /** dias_credito_cpcfa - calculado del ide_cndfp1 */
    @IsInt()
    @IsOptional()
    dias_credito_cpcfa?: number;

    /** FK → sri_tipo_sustento_tributario */
    @IsInt()
    @IsOptional()
    ide_srtst?: number;

    // Nota de Crédito – campos opcionales
    @IsInt()
    @IsOptional()
    ide_cntdo_nc_cpcfa?: number;

    @IsDateString()
    @IsOptional()
    fecha_emision_nc_cpcfa?: string;

    @IsString()
    @IsOptional()
    numero_nc_cpcfa?: string;

    @IsString()
    @IsOptional()
    autorizacio_nc_cpcfa?: string;

    @IsString()
    @IsOptional()
    motivo_nc_cpcfa?: string;
}

/**
 * Comprobante de reembolso (fila hija en cxp_cabece_factur enlazada por ide_rem_cpcfa),
 * usado únicamente por el tipo de documento REEMBOLSOS (mandatorio) del Anexo
 * Transaccional — excluye estas sub-facturas de ATS/Formulario 103/104 (paridad legacy,
 * componentes/DocumentoCxP.java). NO se usa para Liquidación de Compra: ver
 * ReembolsoLiquidacionCompraDto para el Anexo 17 SRI (tabla cxp_datos_com_reembolso).
 *
 * Dos modos:
 *  - Referenciado (ide_cpcfa_referencia): el documento sustento ya existe como su
 *    propio documento CxP (cxp_cabece_factur) — proveedor, número, fecha,
 *    autorización e impuestos se copian de ahí, el resto de campos se ignora.
 *  - Manual (sin ide_cpcfa_referencia): comportamiento original, se ingresan los
 *    campos a mano.
 */
export class ReembolsoDocumentoCxPDto {
    /** Documento de compra ya registrado que se está reembolsando (cxp_cabece_factur.ide_cpcfa) */
    @IsInt()
    @IsOptional()
    ide_cpcfa_referencia?: number;

    /** FK → con_tipo_document (tipo de comprobante del reembolso). Requerido en modo manual. */
    @IsInt()
    @IsOptional()
    ide_cntdo?: number;

    /** Identificación del emisor del comprobante (se persiste en motivo_nc_cpcfa). Requerido en modo manual. */
    @IsString()
    @IsOptional()
    identificacion?: string;

    @IsString()
    @IsOptional()
    numero_cpcfa?: string;

    @IsDateString()
    @IsOptional()
    fecha_emisi_cpcfa?: string;

    @IsString()
    @IsOptional()
    autorizacio_cpcfa?: string;

    @IsNumber()
    @Min(0)
    @IsOptional()
    base_no_objeto_iva_cpcfa?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    base_tarifa0_cpcfa?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    base_grabada_cpcfa?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    valor_iva_cpcfa?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    valor_ice_cpcfa?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    total_cpcfa?: number;
}

/**
 * Línea de reembolso de gastos de una Liquidación de Compra (Anexo 17 SRI: codDocReemb=41
 * + <reembolsos>). Persiste en cxp_datos_com_reembolso — tabla ya existente en el core,
 * usada activamente por el legacy (pkg_cuentas_x_pagar/pre_factura_cxp.java) para este
 * mismo propósito.
 *
 * Dos modos:
 *  - Referenciado (ide_cpcfa_sustento): el documento sustento ya existe como su propio
 *    documento CxP — proveedor, número, fecha, autorización e impuestos se copian de ahí.
 *  - Manual (sin ide_cpcfa_sustento): comportamiento original del legacy, se ingresan los
 *    campos a mano.
 */
export class ReembolsoLiquidacionCompraDto {
    /** Documento de compra ya registrado que sustenta el reembolso (cxp_cabece_factur.ide_cpcfa) */
    @IsInt()
    @IsOptional()
    ide_cpcfa_sustento?: number;

    /** FK → con_tipo_document (tipo del comprobante reembolsado). Requerido en modo manual. */
    @IsInt()
    @IsOptional()
    ide_cntdo?: number;

    /** FK → gen_tipo_identifi (tipo de identificación del proveedor reembolsado). Requerido en modo manual. */
    @IsInt()
    @IsOptional()
    ide_getid?: number;

    /** Identificación del proveedor reembolsado. Requerido en modo manual. */
    @IsString()
    @IsOptional()
    identificacion?: string;

    /** Establecimiento + punto de emisión del comprobante reembolsado, 6 caracteres. Requerido en modo manual. */
    @IsString()
    @IsOptional()
    serie?: string;

    @IsString()
    @IsOptional()
    secuencial?: string;

    @IsString()
    @IsOptional()
    autorizacion?: string;

    @IsDateString()
    @IsOptional()
    fecha?: string;

    @IsNumber()
    @Min(0)
    @IsOptional()
    base_no_objeto?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    base_tarifa0?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    base_imponible?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    valor_iva?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    valor_ice?: number;

    /** Código de país de pago (Tabla 25 SRI). Default: 593 (Ecuador). */
    @IsInt()
    @IsOptional()
    cod_pais_pago?: number = 593;
}

/**
 * DTO completo para guardar un documento CxP con sus detalles
 */
export class SaveDocumentoCxPDto {
    @ValidateNested()
    @Type(() => CabDocumentoCxPDto)
    @IsNotEmpty()
    cabecera: CabDocumentoCxPDto;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DetalleDocumentoCxPDto)
    @IsNotEmpty()
    detalles: DetalleDocumentoCxPDto[];

    /** Comprobantes de reembolso (solo cuando el tipo de documento es REEMBOLSOS del ATS) */
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ReembolsoDocumentoCxPDto)
    reembolsos?: ReembolsoDocumentoCxPDto[];

    /** Líneas de reembolso de gastos (solo cuando el tipo de documento es Liquidación de Compra, Anexo 17 SRI) */
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ReembolsoLiquidacionCompraDto)
    reembolsosLiquidacion?: ReembolsoLiquidacionCompraDto[];

    /** Cabecera de transacción del anticipo del proveedor (cxp_cabece_transa) */
    @IsOptional()
    @IsInt()
    ide_cpctr_anticipo?: number;

    /**
     * FK → cxc_datos_fac (punto de emisión). Requerido solo para Liquidación de
     * Compra electrónica (cuando numero_cpcfa/autorizacio_cpcfa no se ingresan
     * a mano): de aquí se toman estab/ptoEmi para generar el comprobante SRI.
     */
    @IsOptional()
    @IsInt()
    ide_ccdaf?: number;

    /**
     * FK → cxc_transporte_factura (envío del Reporte de Envío de Facturas). Cuando se
     * provee (solo en creación), enlaza el envío con la factura recién creada y
     * actualiza sus valores reales de flete (base/IVA/total) en la misma transacción.
     */
    @IsOptional()
    @IsInt()
    ide_cctfa?: number;

    @IsOptional()
    @IsBoolean()
    isUpdate?: boolean;
}
