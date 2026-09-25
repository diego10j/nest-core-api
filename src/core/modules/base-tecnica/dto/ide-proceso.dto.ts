import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';

export class IdeProcesoDto {
  @Type(() => Number)
  @IsInt()
  ide_bdrun: number;
}
