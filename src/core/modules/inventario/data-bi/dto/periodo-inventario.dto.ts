import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

/** Año a consultar en el dashboard de inventario (por defecto, el año actual). */
export class PeriodoInventarioDto extends QueryOptionsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  periodo?: number;
}
