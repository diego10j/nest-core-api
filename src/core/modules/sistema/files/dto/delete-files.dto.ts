import { PartialType } from '@nestjs/mapped-types';
import { ArrayNotEmpty, IsArray, IsBoolean, IsNotEmpty, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class DeleteFilesDto extends PartialType(QueryOptionsDto) {
  @ArrayNotEmpty()
  @IsNotEmpty({ each: true })
  @IsArray()
  values: string[];

  @IsBoolean()
  @IsOptional()
  trash?: boolean = true;
}
