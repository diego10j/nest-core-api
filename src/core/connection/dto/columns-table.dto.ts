import { IsString, IsOptional, IsArray, ArrayNotEmpty, IsNotEmpty, Matches } from 'class-validator';

export class ColumnsTableDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\S*$/, { message: 'module no debe contener espacios' })
  module: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\S*$/, { message: 'tableName no debe contener espacios' })
  tableName: string;

  @IsOptional()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @IsArray()
  columns?: string[];
}
