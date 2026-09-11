import { IsInt, IsArray, IsPositive, IsOptional, IsNotEmpty, ArrayNotEmpty } from 'class-validator';

export class VariacionVentasPeriodoDto {
  @IsInt()
  @IsPositive()
  periodo: number;

  @IsInt()
  @IsPositive()
  periodoCompara: number;

  @ArrayNotEmpty()
  @IsNotEmpty({ each: true })
  @IsArray()
  @IsOptional()
  ide_sucu?: number[];
}
