import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';

import { TelefonoDto } from '../../dto/telefono.dto';

export class SendTemplateDto extends TelefonoDto {
  @IsString()
  name: string;

  @IsString()
  language: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  components?: Record<string, any>[];
}
