import { PartialType } from '@nestjs/mapped-types';
import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class MoveFileDto extends PartialType(QueryOptionsDto) {
  @IsString()
  id: string;

  @IsInt()
  @IsPositive()
  @IsOptional()
  sis_ide_arch?: number;
}
