import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';

export class GetArchivosDto {
  @Type(() => Number)
  @IsInt()
  ideCono: number;
}
