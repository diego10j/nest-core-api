import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class SaveVariableDto {
    @IsInt()
    @IsNotEmpty()
    ide_modu: number;

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'nom_para no debe contener espacios' })
    nom_para: string;

    @IsString()
    @IsNotEmpty()
    valor_para: string;

    @IsString()
    @IsNotEmpty()
    descripcion_para: string;

    @IsBoolean()
    @IsOptional()
    activo_para?: boolean;

    @IsBoolean()
    @IsOptional()
    es_empr_para?: boolean;

    @IsString()
    @IsOptional()
    tabla_para?: string;

    @IsString()
    @IsOptional()
    campo_codigo_para?: string;

    @IsString()
    @IsOptional()
    campo_nombre_para?: string;
}