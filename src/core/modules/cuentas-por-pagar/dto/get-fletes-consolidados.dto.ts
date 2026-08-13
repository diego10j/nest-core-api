import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

/** Listado de la tabla de control de facturas consolidadas de flete - sin filtros propios,
 * usa la paginación/orden/filtros estándar de QueryOptionsDto (DataTableQuery). */
export class GetFletesConsolidadosDto extends QueryOptionsDto { }
