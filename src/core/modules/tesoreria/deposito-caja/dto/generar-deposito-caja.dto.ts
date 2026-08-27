import { Type } from 'class-transformer';
import {
    ArrayNotEmpty,
    IsArray,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';

/** Un movimiento de ingreso de caja (tes_cab_libr_banc) reservado por este depósito */
export class MovimientoDepositoCajaDto {
    /** FK → tes_cab_libr_banc */
    @IsInt()
    @IsNotEmpty()
    ide_teclb: number;

    /** Valor del movimiento (para el cálculo del total a depositar y la trazabilidad) */
    @IsNumber()
    @Min(0.01)
    @IsNotEmpty()
    valor: number;
}

/**
 * Payload de la etapa "Generar" del wizard de Depósitos de Caja: solo reserva los movimientos
 * de ingreso seleccionados contra la caja elegida - no genera todavía movimientos en el libro
 * bancos ni asiento contable. El banco real destino no se pide aquí: muchas veces todavía no se
 * sabe a qué banco se va a llevar el efectivo, y se elige recién en "Completar" (junto con el
 * comprobante del depósito físico). Ver DepositoCajaSaveService.generar.
 */
export class GenerarDepositoCajaDto {
    /** FK → tes_cuenta_banco (caja origen) */
    @IsInt()
    @IsNotEmpty()
    ideTecbaOrigen: number;

    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => MovimientoDepositoCajaDto)
    movimientos: MovimientoDepositoCajaDto[];

    @IsString()
    @IsOptional()
    observacion?: string;
}
