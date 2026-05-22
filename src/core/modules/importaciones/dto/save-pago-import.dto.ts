import { IsBoolean, IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SavePagoImportDto {
    @IsOptional()
    @IsInt()
    ide_impag?: number;

    @IsInt()
    @IsNotEmpty()
    ide_imcaim: number;

    @IsInt()
    @IsOptional()
    ide_imcoim?: number;

    @IsInt()
    @IsOptional()
    ide_mone?: number;

    @IsInt()
    @IsOptional()
    ide_cpcfa?: number;

    @IsInt()
    @IsOptional()
    ide_teclb?: number;

    @IsDateString()
    @IsOptional()
    fecha_pago_impag?: string;

    @IsNumber()
    @Min(0)
    @IsNotEmpty()
    monto_pago_impag: number;

    @IsString()
    @IsOptional()
    referencia_pago_impag?: string;

    @IsString()
    @IsOptional()
    observaciones_pago_impag?: string;

    @IsString()
    @IsOptional()
    path_comprobante_impag?: string;

    @IsBoolean()
    @IsOptional()
    es_costo_operativo_impag?: boolean;
}
