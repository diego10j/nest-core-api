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

    @IsString()
    @IsNotEmpty()
    numero_cpcfa: string;

    @IsString()
    @IsNotEmpty()
    autorizacio_cpcfa: string;

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
 * Comprobante de reembolso (fila hija en cxp_cabece_factur enlazada por ide_rem_cpcfa)
 */
export class ReembolsoDocumentoCxPDto {
    /** FK → con_tipo_document (tipo de comprobante del reembolso) */
    @IsInt()
    @IsNotEmpty()
    ide_cntdo: number;

    /** Identificación del emisor del comprobante (se persiste en motivo_nc_cpcfa) */
    @IsString()
    @IsNotEmpty()
    identificacion: string;

    @IsString()
    @IsNotEmpty()
    numero_cpcfa: string;

    @IsDateString()
    @IsNotEmpty()
    fecha_emisi_cpcfa: string;

    @IsString()
    @IsNotEmpty()
    autorizacio_cpcfa: string;

    @IsNumber()
    @Min(0)
    @IsNotEmpty()
    base_no_objeto_iva_cpcfa: number;

    @IsNumber()
    @Min(0)
    @IsNotEmpty()
    base_tarifa0_cpcfa: number;

    @IsNumber()
    @Min(0)
    @IsNotEmpty()
    base_grabada_cpcfa: number;

    @IsNumber()
    @Min(0)
    @IsNotEmpty()
    valor_iva_cpcfa: number;

    @IsNumber()
    @Min(0)
    @IsNotEmpty()
    valor_ice_cpcfa: number;

    @IsNumber()
    @Min(0)
    @IsNotEmpty()
    total_cpcfa: number;
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

    /** Comprobantes de reembolso (solo cuando el tipo de documento es reembolso) */
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ReembolsoDocumentoCxPDto)
    reembolsos?: ReembolsoDocumentoCxPDto[];

    /** Cabecera de transacción del anticipo del proveedor (cxp_cabece_transa) */
    @IsOptional()
    @IsInt()
    ide_cpctr_anticipo?: number;

    @IsOptional()
    @IsBoolean()
    isUpdate?: boolean;
}
