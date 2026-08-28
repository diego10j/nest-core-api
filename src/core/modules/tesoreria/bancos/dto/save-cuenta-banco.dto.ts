import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SaveCuentaBancoDto {
    @IsInt()
    @IsOptional()
    ideTecba?: number;

    @IsInt()
    @IsOptional()
    ideTetcb?: number;

    @IsInt()
    @IsNotEmpty()
    ideTeban: number;

    @IsInt()
    @IsOptional()
    ideCndpc?: number;

    @IsString()
    @IsNotEmpty()
    nombreTecba: string;

    @IsString()
    @IsOptional()
    observacionTecba?: string;

    @IsBoolean()
    @IsOptional()
    hacePagosTecba?: boolean;

    @IsBoolean()
    @IsOptional()
    haceChequeTecba?: boolean;

    @IsBoolean()
    @IsOptional()
    activoTecba?: boolean;

    // ── Configuración de comisión (sólo aplica a cuentas de bancos con es_tarjeta_teban) ────

    @IsNumber()
    @Min(0)
    @IsOptional()
    porcentajeComisionTecba?: number;

    @IsBoolean()
    @IsOptional()
    permiteDiferidoTecba?: boolean;

    @IsNumber()
    @Min(0)
    @IsOptional()
    porcentajeComisionDiferidoTecba?: number;

    @IsBoolean()
    @IsOptional()
    ivaComisionTecba?: boolean;

    @IsBoolean()
    @IsOptional()
    retieneIvaTecba?: boolean;

    @IsNumber()
    @Min(0)
    @IsOptional()
    porcentajeRetencionIvaTecba?: number;

    @IsBoolean()
    @IsOptional()
    retieneRentaTecba?: boolean;

    @IsNumber()
    @Min(0)
    @IsOptional()
    porcentajeRetencionRentaTecba?: number;

    /**
     * FK → tes_cuenta_banco: cuenta bancaria real donde el procesador de tarjeta
     * acredita el neto de los cobros (ej. Banco Guayaquil). Solo aplica a cuentas
     * de bancos con es_tarjeta_teban = true. Precarga el campo "cuenta destino"
     * del wizard de Devolución de Cobros con Tarjeta (editable en cada ejecución).
     */
    @IsInt()
    @IsOptional()
    ideTecbaDestinoAcredit?: number;

    /**
     * FK → gen_persona: proveedor/procesador de tarjeta (ej. Bendo) que EMITE la factura de
     * comisión y el comprobante de retención sobre esta cuenta - el comercio solo los
     * registra. Solo aplica a cuentas de bancos con es_tarjeta_teban = true. Precarga el
     * campo "Proveedor" del wizard de Devolución de Cobros con Tarjeta (editable).
     */
    @IsInt()
    @IsOptional()
    ideGeperComisionTecba?: number;

    // ── Configuración de comisión por cheque devuelto (sólo aplica a cuentas con
    // hace_cheque_tecba) ─────────────────────────────────────────────────────

    /** Valor por defecto que este banco cobra por cada cheque devuelto - se prellena
     * (editable) al registrar la devolución. */
    @IsNumber()
    @Min(0)
    @IsOptional()
    comisionChequeDevueltoTecba?: number;

    /** Si la comisión por cheque devuelto de este banco causa IVA. */
    @IsBoolean()
    @IsOptional()
    ivaComisionChequeTecba?: boolean;
}
