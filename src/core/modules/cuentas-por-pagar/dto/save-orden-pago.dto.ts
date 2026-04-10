// tabla: cxp_cab_orden_pago / cxp_det_orden_pago
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsDateString,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import { SaveDto } from 'src/common/dto/save.dto';

export class CabOrdenPagoDataDto {
    @IsOptional()
    @IsInt()
    ide_cpcop?: number;

    @IsInt()
    @IsNotEmpty()
    ide_cpeo: number;

    @IsDateString()
    @IsNotEmpty()
    fecha_genera_cpcop: string;

    @IsDateString()
    @IsOptional()
    fecha_pago_cpcop?: string;

    @IsDateString()
    @IsOptional()
    fecha_efectiva_pago_cpcop?: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    referencia_cpcop?: string;

    @IsBoolean()
    @IsOptional()
    activo_cpcop?: boolean;
}

export class DetOrdenPagoDataDto {
    @IsOptional()
    @IsInt()
    ide_cpcdop?: number;

    /** FK → cxp_cabece_transa (transacción seleccionada de getPagosProveedores) */
    @IsInt()
    @IsNotEmpty()
    ide_cpctr: number;

    @IsInt()
    @IsNotEmpty()
    ide_cpeo: number;

    @IsDateString()
    @IsOptional()
    fecha_pago_cpcdop?: string;

    @IsString()
    @IsOptional()
    @MaxLength(50)
    num_comprobante_cpcdop?: string;

    @IsNumber()
    @Min(0)
    @IsOptional()
    valor_pagado_cpcdop?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    saldo_pendiente_cpcdop?: number;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    documento_referencia_cpcdop?: string;

    @IsBoolean()
    @IsOptional()
    notifica_cpcdop?: boolean;

    @IsBoolean()
    @IsOptional()
    activo_cpcdop?: boolean;

    @IsNumber()
    @Min(0)
    @IsOptional()
    valor_pagado_banco_cpcdop?: number;

    /** FK → tes_cuenta_banco */
    @IsInt()
    @IsOptional()
    ide_tecba?: number;

    /** FK → tes_tip_tran_banc (transferencia, cheque, etc.) */
    @IsInt()
    @IsOptional()
    ide_tettb?: number;

    @IsString()
    @IsOptional()
    @MaxLength(250)
    observacion_cpcdop?: string;

    @IsString()
    @IsOptional()
    @MaxLength(200)
    foto_cpcdop?: string;
}

export class SaveOrdenPagoDto extends SaveDto {
    @IsObject()
    @IsNotEmpty()
    @ValidateNested()
    @Type(() => CabOrdenPagoDataDto)
    declare data: CabOrdenPagoDataDto;

    @ValidateNested({ each: true })
    @Type(() => DetOrdenPagoDataDto)
    @IsOptional()
    detalles?: DetOrdenPagoDataDto[];
}

/**
 * DTO para actualizar un único detalle de orden de pago.
 * Todos los campos de pago son obligatorios.
 */
export class SaveDetalleOrdenDto {
    @IsInt()
    @IsNotEmpty()
    ide_cpcdop: number;

    @IsInt()
    @IsNotEmpty()
    ide_cpctr: number;

    @IsInt()
    @IsNotEmpty()
    ide_tecba: number;

    @IsInt()
    @IsNotEmpty()
    ide_tettb: number;

    @IsDateString()
    @IsNotEmpty()
    fecha_pago_cpcdop: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    num_comprobante_cpcdop: string;

    @IsNumber()
    @Min(0)
    @IsNotEmpty()
    valor_pagado_banco_cpcdop: number;

    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    foto_cpcdop: string;

    @IsNumber()
    @Min(0)
    @IsOptional()
    valor_pagado_cpcdop?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    saldo_pendiente_cpcdop?: number;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    documento_referencia_cpcdop?: string;

    @IsBoolean()
    @IsOptional()
    notifica_cpcdop?: boolean;

    @IsString()
    @IsOptional()
    @MaxLength(250)
    observacion_cpcdop?: string;

    @IsDateString()
    @IsOptional()
    fecha_cheque_cpcdop?: string;
}

/**
 * DTO para guardar múltiples detalles de una misma orden de pago.
 */
export class SaveDetallesOrdenDto {
    @IsInt()
    @IsNotEmpty()
    ide_cpcop: number;

    @IsArray()
    @IsNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => SaveDetalleOrdenDto)
    detalles: SaveDetalleOrdenDto[];
}
