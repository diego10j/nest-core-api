import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString } from 'class-validator';

import { TelefonoDto } from './telefono.dto';

export class GetMensajesDto extends TelefonoDto {
  // WEB
  @IsString()
  @IsNotEmpty()
  chatId: string;

  @IsInt()
  @IsPositive()
  @IsOptional()
  limit?: number = 100;

  @IsString()
  @IsOptional()
  beforeId?: string;
}
