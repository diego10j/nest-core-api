import { PartialType } from '@nestjs/mapped-types';
import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class CheckExistFileDto extends PartialType(QueryOptionsDto) {
  @IsString()
  fileName: string;

  @IsInt()
  @IsPositive()
  @IsOptional()
  sis_ide_arch?: number;
}
