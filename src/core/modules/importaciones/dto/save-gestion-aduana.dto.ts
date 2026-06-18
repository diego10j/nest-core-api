import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

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

    @IsNumber()
    @Min(0)
    @IsOptional()
    fob_imga?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    flete_imga?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    seguro_imga?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    ajustes_imga?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    valor_aduana_imga?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    items_declarados_imga?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    peso_neto_kilos_imga?: number;

    @IsString()
    @IsOptional()
    observaciones_imga?: string;
}
