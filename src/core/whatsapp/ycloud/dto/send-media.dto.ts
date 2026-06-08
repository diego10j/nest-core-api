import { IsIn, IsOptional, IsString } from 'class-validator';

import { TelefonoDto } from '../../dto/telefono.dto';

export class SendMediaDto extends TelefonoDto {
  @IsString()
  @IsIn(['image', 'audio', 'video'])
  mediaType: string;

  @IsString()
  @IsOptional()
  caption?: string;

  @IsString()
  @IsOptional()
  mediaId?: string;
}
