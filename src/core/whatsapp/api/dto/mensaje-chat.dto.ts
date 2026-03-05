import { IsOptional, IsString } from 'class-validator';

import { TelefonoDto } from '../../dto/telefono.dto';

export class MensajeChatDto extends TelefonoDto {
  @IsString()
  @IsOptional()
  mensaje?: string;
}
