import { IsInt, IsPositive } from 'class-validator';

export class VariacionVentasPeriodoDto {
  @IsInt()
  @IsPositive()
  periodo: number;

  @IsInt()
  @IsPositive()
  periodoCompara: number;
}
