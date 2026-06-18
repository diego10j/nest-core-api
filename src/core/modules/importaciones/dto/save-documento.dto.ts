import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class SaveDocumentoDto {
    @IsOptional()
    @IsInt()
    ide_imdocu?: number;

    @IsInt()
    @IsNotEmpty()
    ide_imcaim: number;

    @IsInt()
    @IsNotEmpty()
    ide_itd: number;

    @IsString()
    @IsOptional()
    numero_documento_imdocu?: string;

    @IsDateString()
    @IsOptional()
    fecha_emision_imdocu?: string;

    @IsDateString()
    @IsOptional()
    fecha_recepcion_imdocu?: string;

    @IsString()
    @IsOptional()
    archivo_ruta_imdocu?: string;

    @IsNumber()
    @IsOptional()
    peso_archivo_imdocu?: number;

    @IsString()
    @IsOptional()
    nombre_real_archivo_imdocu?: string;

    @IsString()
    @IsOptional()
    observaciones_imdocu?: string;
}
