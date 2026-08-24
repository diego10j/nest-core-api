import { IsDateString, IsInt, IsNotEmpty, IsOptional } from 'class-validator';

/**
 * Filtro para listar facturas de venta cobradas con una cuenta de tarjeta que aún no están
 * cubiertas por ningún ciclo de Devolución de Cobros con Tarjeta (ver
 * DevolucionCobroTarjetaService.getFacturasTarjetaPendientes).
 */
export class GetFacturasTarjetaPendientesDto {
    /** FK → tes_cuenta_banco (cuenta del procesador de tarjeta, ej. Bendo) */
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
