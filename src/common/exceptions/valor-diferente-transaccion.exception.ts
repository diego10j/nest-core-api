import { HttpException, HttpStatus } from '@nestjs/common';

interface ValorDiferenteTransaccionPayload {
    valorIngresado: number;
    valorTransaccion: number;
    diferencia: number;
}

/**
 * 409: el valor a guardar no coincide con el valor real de la(s) cuenta(s) seleccionada(s)
 * (típicamente una lectura OCR errónea del comprobante escaneado) y generaría un saldo a
 * favor adicional no solicitado. El frontend debe mostrar una confirmación explícita al
 * usuario con `data` y, si confirma, reenviar la misma petición con `confirmarDiferencia: true`.
 */
export class ValorDiferenteTransaccionException extends HttpException {
    constructor(payload: ValorDiferenteTransaccionPayload) {
        const { valorIngresado, valorTransaccion, diferencia } = payload;
        super(
            {
                statusCode: HttpStatus.CONFLICT,
                error: 'DIFERENCIA_VALOR_REQUIERE_CONFIRMACION',
                message:
                    `El valor ingresado ($${valorIngresado.toFixed(2)}) es diferente al valor de la `
                    + `transacción ($${valorTransaccion.toFixed(2)}). Se creará un saldo a favor adicional `
                    + `de $${diferencia.toFixed(2)}. Confirme para continuar.`,
                data: payload,
            },
            HttpStatus.CONFLICT,
        );
    }
}
