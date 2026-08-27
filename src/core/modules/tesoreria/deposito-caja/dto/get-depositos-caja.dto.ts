import { IsDateString, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

/** Filtro de fechas para el listado de Depósitos de Caja ya registrados (ver
 * DepositoCajaService.getDepositosCaja). Filtra por fecha_genera_tedca.
 * Extiende QueryOptionsDto: se consume vía DataTableQuery/useDataTableQuery (tabla lazy paginada). */
export class GetDepositosCajaDto extends QueryOptionsDto {
    @IsDateString()
    @IsOptional()
    fechaDesde?: string;

    @IsDateString()
    @IsOptional()
    fechaHasta?: string;
}
