import { IsOptional, IsString } from 'class-validator';

import { TelefonoDto } from '../../dto/telefono.dto';

export class SendDocumentDto extends TelefonoDto {
  @IsString()
  filename: string;

  @IsString()
  @IsOptional()
  caption?: string;

  @IsString()
  @IsOptional()
  mediaId?: string;
}
