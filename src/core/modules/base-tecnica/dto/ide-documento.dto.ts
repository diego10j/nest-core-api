import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';

export class IdeDocumentoDto {
  @Type(() => Number)
  @IsInt()
  ide_bddoc: number;
}
