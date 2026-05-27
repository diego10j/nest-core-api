import { IsNotEmpty, IsOptional, IsString, IsEmail, IsArray } from 'class-validator';

import { AdjuntoCorreoDto } from './adjunto-dto';

export class SendMailDto {
  @IsNotEmpty()
  @IsEmail({}, { each: true })
  destinatario: string | string[];

  @IsOptional()
  @IsEmail({}, { each: true })
  cc?: string | string[];

  @IsNotEmpty()
  @IsString()
  asunto: string;

  @IsOptional()
  @IsString()
  contenido?: string;

  @IsOptional()
  ide_plco?: number;

  @IsOptional()
  @IsString()
  alias_corr?: string = 'default';

  @IsOptional()
  variables?: Record<string, any>;

  @IsOptional()
  @IsArray()
  adjuntos?: AdjuntoCorreoDto[];
}
