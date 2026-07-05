import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class SaveDireccionPersonaDto {
    @IsInt()
    @IsOptional()
    ide_gedirp?: number;

    @IsInt()
    @IsOptional()
    ide_getidi?: number;

    @IsInt()
    @IsOptional()
    ide_gepais?: number;

    @IsInt()
    @IsOptional()
    ide_geprov?: number;

    @IsInt()
    @IsOptional()
    ide_gecant?: number;

    @IsInt()
    ide_geper: number;

    @IsString()
    @IsOptional()
    nombre_dir_gedirp?: string;

    @IsString()
    @IsOptional()
    correo_gedirp?: string;

    @IsString()
    @IsOptional()
    direccion_gedirp?: string;

    @IsString()
    @IsOptional()
    referencia_gedirp?: string;

    @IsString()
    @IsOptional()
    longitud_gedirp?: string;

    @IsString()
    @IsOptional()
    latitud_gedirp?: string;

    @IsString()
    @IsOptional()
    telefono_gedirp?: string;

    @IsString()
    @IsOptional()
    movil_gedirp?: string;

    @IsBoolean()
    @IsOptional()
    defecto_gedirp?: boolean;

    @IsInt()
    @IsOptional()
    ide_gegen?: number;
}
