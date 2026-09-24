import { IsIn, IsDateString, IsOptional } from 'class-validator';

export const TIPOS_MOVIMIENTO_TARJETA = ['todos', 'acreditacion', 'corte'] as const;
export type TipoMovimientoTarjeta = (typeof TIPOS_MOVIMIENTO_TARJETA)[number];

/** Estados de una acreditación (acreditada/parcial/completa/anulada) y de un corte (activo/anulado);
 * `anulado` cubre las anuladas de ambos tipos. */
export const ESTADOS_MOVIMIENTO_TARJETA = ['todos', 'acreditada', 'parcial', 'completa', 'activo', 'anulado'] as const;
export type EstadoMovimientoTarjeta = (typeof ESTADOS_MOVIMIENTO_TARJETA)[number];

/** Filtros del listado unificado de cobros con tarjeta: acreditaciones (transferencia del neto del
 * procesador) y cortes (factura de comisión y/o comprobante de retención) - ver
 * DevolucionCobroTarjetaService.getDevolucionesTarjeta. */
export class GetDevolucionesTarjetaDto {
    @IsDateString()
    @IsOptional()
    fechaDesde?: string;

    @IsDateString()
    @IsOptional()
    fechaHasta?: string;

    /** Qué filas incluir: solo acreditaciones, solo cortes o ambos (por defecto todos) */
    @IsIn(TIPOS_MOVIMIENTO_TARJETA)
    @IsOptional()
    tipo?: TipoMovimientoTarjeta;

    /** Estado a mostrar (por defecto todos) */
    @IsIn(ESTADOS_MOVIMIENTO_TARJETA)
    @IsOptional()
    estado?: EstadoMovimientoTarjeta;
}
