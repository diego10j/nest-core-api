import { Type } from 'class-transformer';
import {
    ArrayNotEmpty,
    IsArray,
    IsDateString,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';

/** Distribución del pago hacia una cuenta por pagar (documento) específica */
export class FacturaPagoCxPDto {
    /** FK → cxp_cabece_transa (cuenta por pagar a la que se aplica el pago) */
    @IsInt()
    @IsNotEmpty()
    ide_cpctr: number;

    /** FK → cxp_cabece_factur (documento origen de la deuda) */
    @IsInt()
    @IsNotEmpty()
    ide_cpcfa: number;

    /** Monto aplicado a este documento (puede ser parcial) */
    @IsNumber()
    @Min(0.01)
    @IsNotEmpty()
    valor: number;
}

/**
 * Pago a proveedor con distribución entre una o varias cuentas por pagar
 * (paridad cargarPagoCxP + generarTransaccionPago del legacy). El excedente
 * entre `valor` (total que sale de la cuenta) y la suma de `facturas[].valor`
 * se registra como saldo a favor del proveedor.
 */
export class SavePagoCxPDto {
    /** FK → gen_persona (proveedor) */
    @IsInt()
    @IsNotEmpty()
    ideGeper: number;

    @IsDateString()
    @IsNotEmpty()
    fecha: string;

    /** FK → tes_cuenta_banco (cuenta o caja de origen del pago) */
    @IsInt()
    @IsNotEmpty()
    ideTecba: number;

    /** FK → tes_tip_tran_banc */
    @IsInt()
    @IsNotEmpty()
    ideTettb: number;

    /** Valor total que sale de la cuenta (incluye el excedente si lo hay) */
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

    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => FacturaPagoCxPDto)
    facturas: FacturaPagoCxPDto[];
}
