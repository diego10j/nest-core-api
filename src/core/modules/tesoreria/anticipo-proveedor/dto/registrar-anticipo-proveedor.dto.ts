import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * Registra un Anticipo a Proveedores: pago SIN factura todavía, contabilizado contra la cuenta
 * dedicada de activo (configurada en Contabilidad > Configuración de Asientos, identificador
 * "ANTICIPO A PROVEEDORES") en vez de la cuenta por pagar del proveedor. Se guarda en
 * cxp_cabece_transa/cxp_detall_transa (mismo mecanismo genérico que ya usan savePagoCxP/
 * saveAnticipoCxP - así aparece en Transacciones CxP y en el detalle de Tesorería), pero con
 * su propio asiento contable (cuenta dedicada en vez de la cuenta por pagar del proveedor).
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

    /** FK → cxp_cab_flete_cons - si viene, vincula este anticipo al grupo "Pendiente Factura"
     * indicado (cxp_cab_flete_cons.ide_cpctr_anticipo), para que su pantalla de detalle sepa
     * que ya tiene un anticipo registrado y no vuelva a ofrecer "Registrar Anticipo" sobre el
     * mismo grupo. Se valida que el grupo sea del mismo proveedor (ideGeper). */
    @IsInt()
    @IsOptional()
    ideCpcfc?: number;
}
