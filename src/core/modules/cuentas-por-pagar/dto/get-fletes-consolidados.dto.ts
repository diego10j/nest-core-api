import { IsInt, IsDateString, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

/** Listado de la tabla de control de facturas consolidadas de flete. Filtros propios (todos
 * opcionales, "Consultar" en el listado): estado del proceso y rango de fechas de registro
 * (cc.hora_ingre) - además de la paginación/orden/filtros estándar de QueryOptionsDto
 * (DataTableQuery). */
export class GetFletesConsolidadosDto extends QueryOptionsDto {
  /** cxp_estado_flete_cons.ide_cpefc (1 Pendiente de Pago, 2 Pagado, 3 Anulado,
   * 4 Pendiente Factura). Sin filtro -> todos los estados. */
  @IsInt()
  @IsOptional()
  ide_cpefc?: number;

  @IsDateString()
  @IsOptional()
  fechaInicio?: string;

  @IsDateString()
  @IsOptional()
  fechaFin?: string;
}
