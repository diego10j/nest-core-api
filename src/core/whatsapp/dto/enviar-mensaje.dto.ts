import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

import { TelefonoWebDto } from '../web/dto/telefono-web.dto';

export class EnviarMensajeDto extends TelefonoWebDto {
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
