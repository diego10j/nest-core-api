import { IsInt, IsArray, IsPositive, IsOptional, IsNotEmpty, ArrayNotEmpty } from 'class-validator';

export class ComparativoVentasComprasDto {
  @IsInt()
  @IsPositive()
  periodo: number;

  @ArrayNotEmpty()
  @IsNotEmpty({ each: true })
  @IsArray()
  @IsOptional()
  ide_sucu?: number[];
}
