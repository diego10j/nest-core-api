import { IsOptional, IsString, IsArray, IsBoolean } from 'class-validator';

export class UpdateTemplateDto {
    @IsOptional()
    @IsString()
    nombre?: string;

    @IsOptional()
    @IsString()
    asunto?: string;

    @IsOptional()
    @IsString()
    contenido?: string;

    @IsOptional()
    @IsArray()
    variables?: string[];

    @IsOptional()
    @IsBoolean()
    estado?: boolean;

    @IsOptional()
    ide_corr?: number;
}