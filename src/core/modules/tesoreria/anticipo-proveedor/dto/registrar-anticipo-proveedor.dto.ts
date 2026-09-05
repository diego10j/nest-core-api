import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * Registra un Anticipo a Proveedores: pago SIN factura todavía, contabilizado contra la cuenta
 * dedicada de activo (configurada en Contabilidad > Configuración de Asientos, identificador
 * "ANTICIPO A PROVEEDORES") en vez de la cuenta por pagar del proveedor. Mismos campos de forma
 * de pago que SaveAnticipoCxPDto (paridad de formulario), pero este SÍ queda con seguimiento de
 * saldo/estado propio (tes_cab_anticipo_prov) para poder liquidarse contra una o varias
 * facturas más adelante (ver LiquidarAnticipoProveedorDto).
 */
export class RegistrarAnticipoProveedorDto {
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

    /** Fecha efectiva del cheque posfechado */
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
