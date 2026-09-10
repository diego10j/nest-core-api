import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

/** Origen de Mayorizar cuyo log se consulta (opcional, sin filtro = los 3 orígenes) */
export const TIPO_ORIGEN_MAYORIZAR_VALUES = ['FACTURA_VENTA', 'DOCUMENTOS_PAGAR', 'NOTA_CREDITO'] as const;
export type TipoOrigenMayorizar = (typeof TIPO_ORIGEN_MAYORIZAR_VALUES)[number];

/**
 * Log de generación/anulación de asientos automáticos (Mayorizar) de un mes/período.
 * Paginado (page/pageSize planos, no el `pagination` anidado de QueryOptionsDto - este es un
 * GET con query params simples, no el flujo lazy de DataTableQuery/getTableQuery) - un período
 * con uso intensivo de Mayorizar puede acumular miles de filas de log.
 */
export class LogMayorizacionDto extends QueryOptionsDto {
    /** Año del período (ej. 2026) */
    @IsInt()
    @Min(2000)
    periodo: number;

    /** Mes 1-12 */
    @IsInt()
    @Min(1)
    @Max(12)
    mes: number;

    /** Filtrar por origen (opcional) */
    @IsIn(TIPO_ORIGEN_MAYORIZAR_VALUES)
    @IsOptional()
    tipoOrigen?: TipoOrigenMayorizar;

    /** Página 0-indexed (opcional, default 0) */
    @IsInt()
    @Min(0)
    @IsOptional()
    @Type(() => Number)
    page?: number = 0;

    /** Filas por página (opcional, default 50, máx 200) */
    @IsInt()
    @Min(1)
    @Max(200)
    @IsOptional()
    @Type(() => Number)
    pageSize?: number = 50;
}
