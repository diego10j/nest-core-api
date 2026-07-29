/**
 * Tabla 26 SRI (Anexo 5/17, reembolso de gastos): 01 Persona Natural, 02 Sociedad.
 * Se deriva del tipo de identificación del proveedor y, si es RUC, del tercer
 * dígito (9 = sociedad privada/extranjera, 6 = entidad pública → sociedad).
 */
export function getTipoProveedorReembolso(
    tipoIdentificacion: string | null | undefined,
    identificacion: string | null | undefined,
): '01' | '02' {
    if ((tipoIdentificacion ?? '').trim() !== '04') {
        return '01'; // cédula, pasaporte, etc. → persona natural
    }
    const tercerDigito = (identificacion ?? '').trim().charAt(2);
    return tercerDigito === '9' || tercerDigito === '6' ? '02' : '01';
}
