import { IsOptional, IsString } from 'class-validator';

import { TelefonoWebDto } from '../../web/dto/telefono-web.dto';

export class MensajeChatDto extends TelefonoWebDto {
  @IsString()
  @IsOptional()
  mensaje?: string;
}
