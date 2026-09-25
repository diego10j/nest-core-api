import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';

export class IdeInartiDto {
  @Type(() => Number)
  @IsInt()
  ide_inarti: number;
}
