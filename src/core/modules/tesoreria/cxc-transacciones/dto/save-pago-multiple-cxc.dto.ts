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

/** Distribución del cobro hacia una cuenta por cobrar (documento) específica */
export class FacturaPagoCxCDto {
    /** FK → cxc_cabece_transa (cuenta por cobrar a la que se aplica el cobro) */
    @IsInt()
    @IsNotEmpty()
    ide_ccctr: number;

    /** FK → cxc_cabece_factura (documento origen de la deuda) */
    @IsInt()
    @IsNotEmpty()
    ide_cccfa: number;

    /** Monto aplicado a este documento (puede ser parcial) */
    @IsNumber()
    @Min(0.01)
    @IsNotEmpty()
    valor: number;
}

/**
 * Cobro a cliente con distribución entre una o varias cuentas por cobrar
 * (paridad cargarPagoCxC + generarTransaccionPago del legacy). El excedente
 * entre `valor` (total que ingresa a la cuenta) y la suma de `facturas[].valor`
 * se registra como saldo a favor del cliente.
 */
export class SavePagoMultipleCxCDto {
    /** FK → gen_persona (cliente) */
    @IsInt()
    @IsNotEmpty()
    ideGeper: number;

    @IsDateString()
    @IsNotEmpty()
    fecha: string;

    /** FK → tes_cuenta_banco (cuenta o caja de destino del cobro) */
    @IsInt()
    @IsNotEmpty()
    ideTecba: number;

    /** FK → tes_tip_tran_banc */
    @IsInt()
    @IsNotEmpty()
    ideTettb: number;

    /** Valor total que ingresa a la cuenta (incluye el excedente si lo hay) */
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

    /** Fecha efectiva del cheque posfechado (ideTettb = 13) */
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
    @Type(() => FacturaPagoCxCDto)
    facturas: FacturaPagoCxCDto[];
}
