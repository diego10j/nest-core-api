import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class LiquidacionAduanaItemDto {
    @IsOptional()
    @IsInt()
    ide_imliq?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    arancel_advalorem_liq_imliq?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    iva_liquidacion_imliq?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    ice_liquidacion_imliq?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    fodinfa_liquidacion_imliq?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    tasas_imliq?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    recargos_imliq?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    intereses_imliq?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    multas_imliq?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    otros_imliq?: number;

    @IsDateString()
    @IsOptional()
    fecha_liquidacion_imliq?: string;

    @IsString()
    @IsNotEmpty()
    numero_liquidacion_imliq: string;

    @IsString()
    @IsOptional()
    observaciones_liquidacion_imliq?: string;
}

export class SaveLiquidacionAduanaDto {
    @IsInt()
    @IsNotEmpty()
    ide_imga: number;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => LiquidacionAduanaItemDto)
    @IsNotEmpty()
    liquidaciones: LiquidacionAduanaItemDto[];
}
