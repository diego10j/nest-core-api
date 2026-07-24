import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * Anticipo a proveedor: pago sin documento asociado (paridad
 * generarTransaccionAnticipo del legacy). Genera una cabecera cxp_cabece_transa
 * nueva (ide_cpcfa = NULL) que queda disponible como saldo a favor para
 * aplicarse a una factura futura.
 */
export class SaveAnticipoCxPDto {
    /** FK → gen_persona (proveedor) */
    @IsInt()
    @IsNotEmpty()
    ideGeper: number;

    @IsDateString()
    @IsNotEmpty()
    fecha: string;

    /** FK → tes_cuenta_banco (cuenta o caja de origen) */
    @IsInt()
    @IsNotEmpty()
    ideTecba: number;

    /** FK → tes_tip_tran_banc */
    @IsInt()
    @IsNotEmpty()
    ideTettb: number;

    @IsNumber()
    @Min(0.01)
    @IsNotEmpty()
    valor: number;

    @IsString()
    @IsNotEmpty()
    observacion: string;

    @IsString()
    @IsOptional()
    numero?: string;

    /** Fecha efectiva del cheque posfechado (ideTettb = 14) */
    @IsDateString()
    @IsOptional()
    fechaEfectivo?: string;

    @IsString()
    @IsOptional()
    numCuentaCheque?: string;

    @IsInt()
    @IsOptional()
    ideTeban?: number;
}
