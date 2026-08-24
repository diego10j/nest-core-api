import { IsIn, IsInt, IsDateString, IsOptional } from 'class-validator';

/** Filtro del reporte "Cobros con Tarjeta" (Ventas > Reportes): todas las facturas de venta
 * cobradas con tarjeta en el rango, liquidadas o no, con su comisión/retención/neto asignados
 * proporcionalmente cuando ya pasaron por un ciclo de Devolución de Cobros con Tarjeta. */
export class GetReporteCobrosTarjetaDto {
    @IsDateString()
    @IsOptional()
    fechaDesde?: string;

    @IsDateString()
    @IsOptional()
    fechaHasta?: string;

    @IsInt()
    @IsOptional()
    ideTecba?: number;

    @IsIn(['true', 'false'])
    @IsOptional()
    conDiferencias?: 'true' | 'false';
}
