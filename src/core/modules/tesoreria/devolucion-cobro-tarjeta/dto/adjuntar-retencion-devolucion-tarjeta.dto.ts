import { IsBoolean, IsNotEmpty } from 'class-validator';

/** Aplica a un ciclo de Devolución de Cobros con Tarjeta los comprobantes de retención que ya
 * amparan sus facturas (registrados con ventas/facturas/retenciones/saveRetencionLote) y todavía
 * no se aplicaron - caso real cuando el correo/XML de Bendo llega después de que ya se concilió el
 * depósito, o cuando un comprobante cubre cobros de varios depósitos. */
export class AdjuntarRetencionDevolucionTarjetaDto {
    /**
     * Decisión explícita del usuario, sin default silencioso: ¿el valor que ya se transfirió a
     * la cuenta destino (`valor_neto_transferido_tecdt`) YA venía descontado de estas retenciones
     * (Bendo las restó antes de depositar), o falta contabilizarlas por separado?
     *
     * true  -> Bendo no las había descontado todavía: por cada comprobante se genera la nota de
     *          débito contra la cuenta de tarjeta + el asiento (DEBE Retención IVA/Renta por
     *          Cobrar, HABER Banco Tarjeta) - el mismo que produce el flujo normal (finalizar()) -
     *          y se recalcula valor_neto_calculado_tecdt.
     * false -> El depósito ya reflejaba el descuento: no se genera ningún movimiento nuevo, solo
     *          queda la trazabilidad documental - generarlo igual duplicaría el descuento ya
     *          implícito en lo transferido.
     */
    @IsBoolean()
    @IsNotEmpty()
    generarAsientoContable: boolean;
}
