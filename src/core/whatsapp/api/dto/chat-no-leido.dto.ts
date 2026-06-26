import { IsBoolean, IsInt, IsOptional } from 'class-validator';

import { TelefonoDto } from '../../dto/telefono.dto';

export class ChatNoLeidoDto extends TelefonoDto {
  @IsBoolean()
  leido: boolean;

  @IsInt()
  @IsOptional()
  chatId?: number;

  @IsOptional()
  telefono: string;
}
