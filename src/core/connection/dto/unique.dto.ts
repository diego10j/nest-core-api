import { PartialType } from '@nestjs/mapped-types';
import { IsString, IsNotEmpty, IsDefined, IsOptional, IsArray, Matches } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class UniqueDto extends PartialType(QueryOptionsDto) {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\S*$/, { message: 'module no debe contener espacios' })
  module: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\S*$/, { message: 'tableName no debe contener espacios' })
  tableName: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\S*$/, { message: 'primaryKey no debe contener espacios' })
  primaryKey: string;

  @IsDefined()
  @IsArray()
  columns: { columnName: string; value: any }[];

  @IsOptional()
  @IsString()
  id?: string;
}
