import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsDateString,
    IsEmail,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';

/**
 * Detalle del comprobante de retención (con_detall_retenc)
 */
export class DetalleRetencionCxPDto {
    /** FK → con_cabece_impues (impuesto/casillero) */
    @IsInt()
    @IsNotEmpty()
    ide_cncim: number;

    /** Porcentaje de retención (ej. 1.75, 30, 70, 100) */
    @IsNumber()
    @Min(0)
    @IsNotEmpty()
    porcentaje_cndre: number;

    @IsNumber()
    @Min(0)
    @IsNotEmpty()
    base_cndre: number;

    /** Si no se envía se calcula: base × porcentaje / 100 */
    @IsNumber()
    @Min(0)
    @IsOptional()
    valor_cndre?: number;
}

/**
 * Comprobante de retención de un documento CxP (con_cabece_retenc)
 */
export class SaveRetencionCxPDto {
    /** FK → cxp_cabece_factur (documento al que se retiene) */
    @IsInt()
    @IsNotEmpty()
    ide_cpcfa: number;

    @IsDateString()
    @IsNotEmpty()
    fecha_emisi_cncre: string;

    /** Obligatorio para retención física (no electrónica) */
    @IsString()
    @IsOptional()
    numero_cncre?: string;

    /** Obligatorio para retención física (no electrónica) */
    @IsString()
    @IsOptional()
    autorizacion_cncre?: string;

    @IsString()
    @IsOptional()
    observacion_cncre?: string;

    @IsEmail()
    @IsOptional()
    correo_cncre?: string;

    /** FK → cxc_datos_fac (punto de emisión de retenciones) */
    @IsInt()
    @IsOptional()
    ide_ccdaf?: number;

    /** Valida que las bases cuadren con el documento (default true) */
    @IsBoolean()
    @IsOptional()
    validar_totales?: boolean;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DetalleRetencionCxPDto)
    @IsNotEmpty()
    detalles: DetalleRetencionCxPDto[];
}

export class AnularRetencionCxPDto {
    /** FK → con_cabece_retenc */
    @IsInt()
    @IsNotEmpty()
    ide_cncre: number;
}

export class IdDocumentoCxPDto {
    /** FK → cxp_cabece_factur */
    @IsInt()
    @IsNotEmpty()
    ide_cpcfa: number;
}
