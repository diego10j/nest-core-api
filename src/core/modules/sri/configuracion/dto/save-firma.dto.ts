import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveFirmaDto {
    @IsString()
    @MaxLength(80)
    password_srfid: string;

    @IsString()
    @MaxLength(190)
    @IsOptional()
    nombre_representante_srfid?: string;

    @IsString()
    @MaxLength(150)
    @IsOptional()
    correo_representante_srfid?: string;

    @IsBoolean()
    @IsOptional()
    disponible_srfid?: boolean;

    @IsDateString()
    @IsOptional()
    fecha_caduca_srfid?: string;
}
