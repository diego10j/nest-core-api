import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SaveGestionAduanaDto {
    @IsOptional()
    @IsInt()
    ide_imga?: number;

    @IsInt()
    @IsNotEmpty()
    ide_imcaim: number;

    @IsInt()
    @IsNotEmpty()
    ide_imtaf: number;

    @IsInt()
    @IsNotEmpty()
    ide_geper: number;

    @IsString()
    @IsOptional()
    numero_dau_imga?: string;

    @IsDateString()
    @IsOptional()
    fecha_presentacion_imga?: string;

    @IsDateString()
    @IsOptional()
    fecha_liquidacion_imga?: string;

    @IsDateString()
    @IsOptional()
    fecha_liberacion_imga?: string;

    @IsString()
    @IsOptional()
    observaciones_imga?: string;
}
