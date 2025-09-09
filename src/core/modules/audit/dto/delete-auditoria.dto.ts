import { PartialType } from '@nestjs/mapped-types';
import { ArrayNotEmpty, IsArray, IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class DeleteAuditoriaDto extends PartialType(QueryOptionsDto) {
  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;

  @IsOptional()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @IsArray()
  ide_auac?: string[];
}
