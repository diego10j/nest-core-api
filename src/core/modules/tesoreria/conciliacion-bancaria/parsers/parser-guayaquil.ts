import type { EstadoCuentaParseado, FilaHoja, MovimientoBanco } from './estado-cuenta.types';
import {
    buscarFilaCabecera, normalizar, numeroPuntoDecimal, ordenarCronologico, parsearFecha,
    rangoDeMovimientos, recortar, texto,
} from './parser-util';

/** ¿Es el Excel "Banco Guayaquil - Consultar movimientos"? */
export const esGuayaquil = (filas: FilaHoja[]): boolean =>
    filas.slice(0, 6).some((f) => normalizar(texto(f[0])).startsWith('banco guayaquil'));

/**
 * Banco Guayaquil (Excel). Cabecera con "Cuenta: 00569..." y "Periodo: Agosto | Desde: dd/mm/yyyy |
 * Hasta: dd/mm/yyyy"; el "Saldo: $..." del encabezado es el saldo AL MOMENTO DE DESCARGAR (no al
 * fin del periodo), por eso no se usa: los saldos salen de la cadena de saldos de cada movimiento.
 * Monto siempre positivo con columna "Signo" (+/-); el más nuevo va primero.
 */
export function parsearGuayaquil(filas: FilaHoja[]): EstadoCuentaParseado {
    const advertencias: string[] = [];
    const encabezado = filas.slice(0, 10).map((f) => texto(f[0])).join('\n');
    const cuenta = /Cuenta:\s*(\d+)/i.exec(encabezado)?.[1] ?? null;
    const desde = /Desde:\s*(\d{2}\/\d{2}\/\d{4})/i.exec(encabezado)?.[1];
    const hasta = /Hasta:\s*(\d{2}\/\d{2}\/\d{4})/i.exec(encabezado)?.[1];

    const idxCabecera = buscarFilaCabecera(filas, ['fecha de transaccion', 'monto', 'signo']);
    if (idxCabecera < 0) throw new Error('No se encontró la fila de cabeceras (Fecha de transacción / Monto / Signo).');
    const cabeceras = filas[idxCabecera].map((c) => normalizar(texto(c)));
    const col = (nombre: string): number => cabeceras.indexOf(nombre);
    const cFecha = col('fecha de transaccion');
    const cTipo = col('tipo de movimiento');
    const cDocumento = col('documento');
    const cConcepto = col('concepto');
    const cAgencia = col('agencia');
    const cMonto = col('monto');
    const cSaldo = col('saldo total') >= 0 ? col('saldo total') : col('saldo efectivo');
    const cSigno = col('signo');
    const cReferencias = [col('referencia'), col('referencia 2'), col('referencia 3')].filter((i) => i >= 0);

    const movimientos: MovimientoBanco[] = [];
    for (const fila of filas.slice(idxCabecera + 1)) {
        if (texto(fila[cFecha]) === '' && typeof fila[cFecha] !== 'number') continue;
        try {
            const signoTexto = texto(fila[cSigno]);
            const esDebito = signoTexto === '-' || (signoTexto === '' && normalizar(texto(fila[cTipo])).includes('debito'));
            const referencias = cReferencias.map((i) => texto(fila[i])).filter((r) => r !== '' && r !== '0');
            movimientos.push({
                fecha: parsearFecha(fila[cFecha], 'dmy'),
                documento: recortar(texto(fila[cDocumento]), 60),
                descripcion: recortar(texto(fila[cConcepto]), 400),
                referencia: recortar([texto(fila[cTipo]), ...referencias].filter(Boolean).join(' | '), 400),
                oficina: recortar(texto(fila[cAgencia]), 80),
                monto: Math.abs(numeroPuntoDecimal(fila[cMonto])),
                signo: esDebito ? -1 : 1,
                saldo: cSaldo >= 0 && texto(fila[cSaldo]) !== '' ? numeroPuntoDecimal(fila[cSaldo]) : null,
            });
        } catch (e) {
            advertencias.push(`Fila omitida: ${(e as Error).message}`);
        }
    }

    const ordenados = ordenarCronologico(movimientos, 'DESC');
    const rango = rangoDeMovimientos(ordenados);
    return {
        formato: 'GUAYAQUIL',
        cuenta,
        fechaDesde: desde ? parsearFecha(desde, 'dmy') : rango.desde,
        fechaHasta: hasta ? parsearFecha(hasta, 'dmy') : rango.hasta,
        movimientos: ordenados,
        advertencias,
    };
}
