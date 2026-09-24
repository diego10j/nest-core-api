import { IsIn, IsDateString, IsOptional } from 'class-validator';

export const TIPOS_MOVIMIENTO_TARJETA = ['todos', 'devolucion', 'retencion'] as const;
export type TipoMovimientoTarjeta = (typeof TIPOS_MOVIMIENTO_TARJETA)[number];

/** Filtros del listado unificado de Devolución de Cobros con Tarjeta: ciclos ya registrados
 * (depósitos del procesador) y comprobantes de retención de tarjeta (ver
 * DevolucionCobroTarjetaService.getDevolucionesTarjeta). */
export class GetDevolucionesTarjetaDto {
    @IsDateString()
    @IsOptional()
    fechaDesde?: string;

    @IsDateString()
    @IsOptional()
    fechaHasta?: string;

    /** Qué filas incluir: solo depósitos, solo retenciones o ambos (por defecto todos) */
    @IsIn(TIPOS_MOVIMIENTO_TARJETA)
    @IsOptional()
    tipo?: TipoMovimientoTarjeta;
}
