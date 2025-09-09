import { ArrayNotEmpty, IsArray, IsNotEmpty } from 'class-validator';

import { QueryOptionsDto } from './query-options.dto';

export class ArrayIdeDto extends QueryOptionsDto {
  @ArrayNotEmpty()
  @IsNotEmpty({ each: true })
  @IsArray()
  ide: number[];
}
