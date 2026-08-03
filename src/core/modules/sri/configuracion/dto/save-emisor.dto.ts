import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveEmisorDto {
    @IsInt()
    @IsOptional()
    ide_sremi?: number;

    @IsString()
    @MaxLength(1)
    tipoemision_sremi: string;

    @IsInt()
    @IsOptional()
    tiempo_espera_sremi?: number;

    @IsString()
    @MaxLength(250)
    wsdl_recep_offline_sremi: string;

    @IsString()
    @MaxLength(250)
    wsdl_autori_offline_sremi: string;

    @IsString()
    @MaxLength(2)
    @IsOptional()
    ambiente_sremi?: string;
}
