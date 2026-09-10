import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

/** Origen de Mayorizar cuyo log se consulta (opcional, sin filtro = los 3 orígenes) */
export const TIPO_ORIGEN_MAYORIZAR_VALUES = ['FACTURA_VENTA', 'DOCUMENTOS_PAGAR', 'NOTA_CREDITO'] as const;
export type TipoOrigenMayorizar = (typeof TIPO_ORIGEN_MAYORIZAR_VALUES)[number];

/**
 * Log de generación/anulación de asientos automáticos (Mayorizar) de un mes/período.
 * Extiende QueryOptionsDto (paginación/orden/filtro anidados: `pagination`, `orderBy`,
 * `filters`, `globalFilter`, `lazy`) - lo consume DataTableQuery/useDataTableQuery en el
 * frontend igual que cualquier otra tabla lazy de la app (ver getLogMayorizacion en
 * AsientosAutomaticosService, que pasa este dto directo a `new SelectQuery(sql, dtoIn)` +
 * `dataSource.createQuery`, el mismo motor genérico que usa `core.getTableQuery`).
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
}
