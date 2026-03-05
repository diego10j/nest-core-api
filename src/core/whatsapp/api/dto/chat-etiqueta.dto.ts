import { IsNumber } from 'class-validator';

import { TelefonoDto } from '../../dto/telefono.dto';

export class ChatEtiquetaDto extends TelefonoDto {
  @IsNumber()
  etiqueta: boolean;
}
