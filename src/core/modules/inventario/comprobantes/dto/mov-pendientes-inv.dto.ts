import { IsIn, IsInt, IsOptional, IsPositive } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class MovimientosPendientesInvDto extends QueryOptionsDto {
  @IsIn([1, -1]) // 1 = INGRESOS   /  -1 = EGRESOS
  signo: 1 | -1;

  @IsInt()
  @IsPositive()
  @IsOptional()
  ide_inbod?: number;
}
