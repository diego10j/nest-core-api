import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SaveEnvioDto {
    @IsOptional()
    @IsInt()
    ide_imenv?: number;

    @IsInt()
    @IsNotEmpty()
    ide_imcaim: number;

    @IsInt()
    @IsNotEmpty()
    ide_imev: number;

    @IsInt()
    @IsNotEmpty()
    ide_itt: number;

    @IsString()
    @IsOptional()
    naviera_aerolinea_imenv?: string;

    @IsDateString()
    @IsOptional()
    fecha_embarque_imenv?: string;

    @IsDateString()
    @IsOptional()
    fecha_estimada_llegada_imenv?: string;

    @IsDateString()
    @IsOptional()
    fecha_real_llegada_imenv?: string;

    @IsString()
    @IsOptional()
    puerto_embarque_imenv?: string;

    @IsString()
    @IsNotEmpty()
    puerto_destino_imenv: string;

    @IsString()
    @IsOptional()
    agente_carga_imenv?: string;
}
