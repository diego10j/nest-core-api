import { PartialType } from '@nestjs/mapped-types';
import { ArrayNotEmpty, IsArray, IsInt, IsNotEmpty, IsOptional, IsPositive } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class TesoreriaMensualDto extends PartialType(QueryOptionsDto) {
  @IsInt()
  @IsPositive()
  periodo: number;

  @ArrayNotEmpty()
  @IsNotEmpty({ each: true })
  @IsArray()
  @IsOptional()
  ide_sucu?: number[];
}
