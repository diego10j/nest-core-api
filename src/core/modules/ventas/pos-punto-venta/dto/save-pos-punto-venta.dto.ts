import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SavePosPuntoVentaDto {
    @IsBoolean()
    @IsNotEmpty()
    isUpdate: boolean;

    @IsInt()
    @IsOptional()
    @Transform(({ value }) => value ?? null)
    ide_vgpos?: number | null;

    @IsString()
    @IsNotEmpty()
    nombre_vgpos: string;

    @IsString()
    @IsOptional()
    @Transform(({ value }) => value || null)
    printer_url_vgpos?: string | null;

    @IsString()
    @IsOptional()
    @Transform(({ value }) => value || null)
    printer_token_vgpos?: string | null;

    @IsInt()
    @IsOptional()
    @Transform(({ value }) => value ?? null)
    ide_ccdaf?: number | null;
}
