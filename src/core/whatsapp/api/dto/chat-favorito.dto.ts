import { IsBoolean } from 'class-validator';

import { TelefonoDto } from '../../dto/telefono.dto';

export class ChatFavoritoDto extends TelefonoDto {
  @IsBoolean()
  favorito: boolean;
}
