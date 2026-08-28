import {
    IsBoolean,
    IsDateString,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';

/**
 * Payload para registrar un cheque de cliente devuelto (fondos insuficientes, firma no
 * autorizada, cuenta cerrada, etc.). Ver ChequeDevueltoSaveService.registrar.
 */
export class RegistrarChequeDevueltoDto {
    /** FK → tes_cab_libr_banc (el cheque posfechado, ide_tettb=13, a marcar como devuelto) */
    @IsInt()
    @IsNotEmpty()
    ideTeclb: number;

    /** Fecha en que se registra la devolución */
    @IsDateString()
    @IsNotEmpty()
    fecha: string;

    /** Motivo de la devolución (fondos insuficientes, firma no autorizada, etc.) */
    @IsString()
    @IsNotEmpty()
    motivo: string;

    /** true si el banco nos debitó una comisión por el cheque devuelto */
    @IsBoolean()
    @IsOptional()
    tieneComision?: boolean;

    /** FK → tes_cuenta_banco (cuenta bancaria real que el banco debitó) - requerido si tieneComision */
    @IsInt()
    @IsOptional()
    ideTecbaComision?: number;

    /** Valor de la comisión (neto, sin IVA) - prellenado desde la cuenta bancaria, editable */
    @IsNumber()
    @Min(0)
    @IsOptional()
    valorComision?: number;

    /** IVA de la comisión, ya calculado */
    @IsNumber()
    @Min(0)
    @IsOptional()
    valorIvaComision?: number;
}
