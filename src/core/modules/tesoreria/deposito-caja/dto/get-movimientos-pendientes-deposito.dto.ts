import { IsDateString, IsInt, IsNotEmpty, IsOptional } from 'class-validator';

/**
 * Filtro para listar movimientos de ingreso de una Caja que aún no están depositados ni
 * reservados por ningún depósito de caja no anulado (ver DepositoCajaService.getMovimientosPendientes).
 */
export class GetMovimientosPendientesDepositoDto {
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
