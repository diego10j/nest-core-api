import { IsNotEmpty, IsOptional, IsString, IsEmail, IsArray } from 'class-validator';

import { AdjuntoCorreoDto } from './adjunto-dto';

export class SendMailDto {
  @IsNotEmpty()
  @IsEmail({}, { each: true })
  destinatario: string | string[];

  @IsNotEmpty()
  @IsString()
  asunto: string;

  @IsOptional()
  @IsString()
  contenido?: string;

  @IsOptional()
  ide_plco?: number;

  @IsOptional()
  ide_corr?: number;

  @IsOptional()
  variables?: Record<string, any>;

  @IsOptional()
  @IsArray()
  adjuntos?: AdjuntoCorreoDto[];
}
