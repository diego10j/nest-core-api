import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

import { TelefonoDto } from './telefono.dto';

export class EnviarMensajeDto extends TelefonoDto {
  @IsString()
  texto: string;

  @IsBoolean()
  @IsOptional()
  emitSocket?: boolean = true; // true emite mensajes por socket a clientes conectados

  // API

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  tipo: string | 'text' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'contacts' | 'sticker' = 'text';

  @IsString()
  @IsOptional()
  idWts?: string;

  @IsString()
  @IsOptional()
  mediaId?: string;

  @IsString()
  @IsOptional()
  fileName?: string;

  @IsString()
  @IsOptional()
  mimeType?: string;
}
