import { IsInt, IsPositive } from 'class-validator';

export class ComparativoVentasComprasDto {
  @IsInt()
  @IsPositive()
  periodo: number;
}
