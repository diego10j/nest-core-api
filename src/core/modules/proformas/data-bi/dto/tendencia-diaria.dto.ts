import { IsIn, IsOptional } from 'class-validator';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';

export const AGRUPACIONES_TENDENCIA = ['dia', 'semana', 'mes'] as const;
export type AgrupacionTendencia = (typeof AGRUPACIONES_TENDENCIA)[number];

export class TendenciaDiariaDto extends RangoFechasDto {
  /**
   * Cómo agrupar las cotizaciones del rango. Si no se indica, se elige sola según los días del rango. Se agrupa en la
   * base de datos para no enviar una fila por día cuando el rango es largo.
   */
  @IsOptional()
  @IsIn(AGRUPACIONES_TENDENCIA)
  agrupacion?: AgrupacionTendencia;
}
