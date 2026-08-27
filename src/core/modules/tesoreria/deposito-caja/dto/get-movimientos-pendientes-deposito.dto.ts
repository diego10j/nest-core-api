import { IsDateString, IsInt, IsNotEmpty, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

/**
 * Filtro para listar movimientos de ingreso de una Caja que aún no están depositados ni
 * reservados por ningún depósito de caja no anulado (ver DepositoCajaService.getMovimientosPendientes).
 * Extiende QueryOptionsDto: el frontend consume este endpoint vía DataTableQuery/useDataTableQuery
 * (tabla lazy paginada), que manda pagination/schema/orderBy/filters en cada request.
 */
export class GetMovimientosPendientesDepositoDto extends QueryOptionsDto {
    /** FK → tes_cuenta_banco (cuenta de caja) */
    @IsInt()
    @IsNotEmpty()
    ideTecba: number;

    @IsDateString()
    @IsOptional()
    fechaDesde?: string;

    @IsDateString()
    @IsOptional()
    fechaHasta?: string;
}
