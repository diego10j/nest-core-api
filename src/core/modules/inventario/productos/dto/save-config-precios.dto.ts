// tabla: inv_conf_precios_articulo
import {
    IsBoolean,
    IsNotEmpty,
    IsObject,
    ValidateNested,
    IsNumber,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    ValidateIf
} from 'class-validator';
import { Type } from 'class-transformer';

export class InvConfigPrecioDataDto {

    @IsNumber()
    @IsOptional()
    ide_incpa?: number;

    @IsNumber()
    @Min(1)
    ide_inarti: number;

    @IsBoolean()
    rangos_incpa: boolean;

    @ValidateIf(o => o.rangos_incpa)
    @IsNumber({ maxDecimalPlaces: 3 })
    @Min(0)
    @IsOptional()
    rango1_cant_incpa?: number;

    @ValidateIf(o => o.rangos_incpa && !o.rango_infinito_incpa)
    @IsNumber({ maxDecimalPlaces: 3 })
    @Min(0)
    @IsOptional()
    rango2_cant_incpa?: number;

    @ValidateIf(o => !o.rangos_incpa)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @IsOptional()
    precio_fijo_incpa?: number;

    @ValidateIf(o => o.rangos_incpa)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @IsOptional()
    porcentaje_util_incpa?: number;

    @IsBoolean()
    incluye_iva_incpa: boolean;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    @IsOptional()
    observacion_incpa?: string;

    @IsOptional()
    @IsBoolean()    
    activo_incpa: boolean;

    @IsOptional()
    @IsNumber()
    ide_empr?: number;

    @IsOptional()
    @IsNumber()
    ide_sucu?: number;

    @IsOptional()
    @IsString()
    usuario_ingre?: string;

    @IsOptional()
    @IsBoolean()
    rango_infinito_incpa?: boolean;

    @IsOptional()
    @IsBoolean()
    autorizado_incpa?: boolean;

    @IsOptional()
    @IsNumber()
    ide_cndfp?: number;

    @IsOptional()
    @IsNumber()
    ide_cncfp?: number;
}

export class SaveConfigPrecioDto {
    @IsBoolean()
    isUpdate: boolean;

    @IsNotEmpty()
    @IsObject()
    @ValidateNested()
    @Type(() => InvConfigPrecioDataDto)
    data: InvConfigPrecioDataDto;
}