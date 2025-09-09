import { IsBoolean } from 'class-validator';

import { TelefonoWebDto } from '../../web/dto/telefono-web.dto';

export class ChatNoLeidoDto extends TelefonoWebDto {
  @IsBoolean()
  leido: boolean;
}
