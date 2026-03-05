import { IsArray } from 'class-validator';

import { TelefonoDto } from '../../dto/telefono.dto';

export class ListContactDto extends TelefonoDto {
  @IsArray()
  listas: number[];
}
