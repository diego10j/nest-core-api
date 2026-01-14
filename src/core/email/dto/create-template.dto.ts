import { IsNotEmpty, IsOptional, IsString, IsArray } from 'class-validator';

export class CreateTemplateDto {
  @IsNotEmpty()
  @IsString()
  nombre: string;

  @IsNotEmpty()
  @IsString()
  asunto: string;

  @IsNotEmpty()
  @IsString()
  contenido: string;

  @IsOptional()
  @IsArray()
  variables?: string[];

  @IsOptional()
  ide_corr?: number;
}
