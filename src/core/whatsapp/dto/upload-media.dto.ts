import { IsBoolean, IsOptional, IsString } from 'class-validator';

import { TelefonoDto } from './telefono.dto';

export class UploadMediaDto extends TelefonoDto {
  @IsBoolean()
  @IsOptional()
  emitSocket: boolean = true; // true emite mensajes por socket a clientes conectados

  @IsString()
  @IsOptional()
  caption?: string;

  @IsString()
  @IsOptional()
  type?: string | 'image' | 'video' | 'document' | 'audio' | 'sticker';

  @IsString()
  @IsOptional()
  fileName?: string;
}
