import { IsDateString, IsOptional } from 'class-validator';

/** Filtro de fechas para el listado de Depósitos de Caja ya registrados (ver
 * DepositoCajaService.getDepositosCaja). Filtra por fecha_genera_tedca. */
export class GetDepositosCajaDto {
    @IsDateString()
    @IsOptional()
    fechaDesde?: string;

    @IsDateString()
    @IsOptional()
    fechaHasta?: string;
}
