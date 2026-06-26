import { IsOptional, IsString, MaxLength } from 'class-validator';

import { TelefonoDto } from '../../dto/telefono.dto';

export class SendTextDto extends TelefonoDto {
  @IsString()
  @MaxLength(4096)
  body: string;

  @IsString()
  @IsOptional()
  contextMessageId?: string;
}
