import { IsBoolean } from 'class-validator';

import { TelefonoDto } from '../../dto/telefono.dto';

export class ChatNoLeidoDto extends TelefonoDto {
  @IsBoolean()
  leido: boolean;
}
