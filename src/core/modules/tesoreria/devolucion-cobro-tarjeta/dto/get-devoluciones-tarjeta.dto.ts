import { IsDateString, IsOptional } from 'class-validator';

/** Filtro de fechas para el listado de ciclos de Devolución de Cobros con Tarjeta ya
 * registrados (ver DevolucionCobroTarjetaService.getDevolucionesTarjeta). */
export class GetDevolucionesTarjetaDto {
    @IsDateString()
    @IsOptional()
    fechaDesde?: string;

    @IsDateString()
    @IsOptional()
    fechaHasta?: string;
}
