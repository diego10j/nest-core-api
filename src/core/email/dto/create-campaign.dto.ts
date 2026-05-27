import { IsNotEmpty, IsOptional, IsString, IsArray } from 'class-validator';

export class CreateCampaignDto {
  @IsNotEmpty()
  @IsString()
  nombre: string;

  @IsNotEmpty()
  @IsString()
  asunto: string;

  @IsNotEmpty()
  @IsString()
  contenido: string;

  @IsNotEmpty()
  @IsArray()
  destinatarios: Array<{
    email: string;
    variables?: Record<string, any>;
  }>;

  @IsOptional()
  programacion?: Date;

  @IsOptional()
  @IsString()
  alias_corr?: string = 'default';
}
