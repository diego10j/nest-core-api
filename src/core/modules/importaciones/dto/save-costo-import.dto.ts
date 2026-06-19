import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SaveCostoImportDto {
    @IsOptional()
    @IsInt()
    ide_imcoim?: number;

    @IsInt()
    @IsNotEmpty()
    ide_imcaim: number;

    @IsInt()
    @IsNotEmpty()
    ide_imtco: number;

    @IsInt()
    @IsOptional()
    ide_mone?: number;

    @IsInt()
    @IsOptional()
    ide_cpcfa?: number;

    @IsDateString()
    @IsOptional()
    fecha_imcoim?: string;

    @IsNumber()
    @Min(0)
    @IsNotEmpty()
    monto_imcoim: number;

    @IsInt()
    @IsOptional()
    ide_teccba?: number;

    @IsString()
    @IsOptional()
    observaciones_imcoim?: string;

    @IsString()
    @IsOptional()
    referencia_imcoim?: string;
}
