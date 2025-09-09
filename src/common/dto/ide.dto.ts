import { IsInt } from 'class-validator';

import { QueryOptionsDto } from './query-options.dto';

export class IdeDto extends QueryOptionsDto {
  @IsInt()
  ide: number;
}
