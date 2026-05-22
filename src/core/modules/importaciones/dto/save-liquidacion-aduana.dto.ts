import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SaveLiquidacionAduanaDto {
    @IsOptional()
    @IsInt()
    ide_imliq?: number;

    @IsInt()
    @IsNotEmpty()
    ide_imga: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    base_imponible_liq_imliq?: number;

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
