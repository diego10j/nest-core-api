import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class PeriodoCxPDto extends QueryOptionsDto {
    /** Año del período (ej. 2026) */
    @IsInt()
    @Min(2000)
    periodo: number;
}

/** Filtro de estado de contabilización (Mayorizar): sin asiento (default), con asiento, o todas */
export const ESTADO_ASIENTO_VALUES = ['SIN_ASIENTO', 'CON_ASIENTO', 'TODAS'] as const;
export type EstadoAsientoFiltro = (typeof ESTADO_ASIENTO_VALUES)[number];

export class PeriodoMesCxPDto extends PeriodoCxPDto {
    /** Mes 1-12 */
    @IsInt()
    @Min(1)
    @Max(12)
    mes: number;

    /** FK → con_tipo_document (opcional para filtrar) */
    @IsInt()
    @IsOptional()
    ide_cntdo?: number;

    /** Filtro de estado de contabilización (Mayorizar). Default: SIN_ASIENTO */
    @IsIn(ESTADO_ASIENTO_VALUES)
    @IsOptional()
    estado?: EstadoAsientoFiltro;
}
