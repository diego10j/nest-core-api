import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, ValidateNested } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

import { ObjectQueryDto } from './object-query.dto';

export class SaveListDto extends PartialType(QueryOptionsDto) {
  @ValidateNested({ each: true })
  @Type(() => ObjectQueryDto)
  listQuery: ObjectQueryDto[];

  @IsBoolean()
  @IsOptional()
  audit?: boolean = false;
}
