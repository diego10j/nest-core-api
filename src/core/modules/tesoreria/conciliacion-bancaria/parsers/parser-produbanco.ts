import type { EstadoCuentaParseado, FilaHoja, MovimientoBanco } from './estado-cuenta.types';
import {
    buscarFilaCabecera, detectarOrdenFecha, normalizar, numeroPuntoDecimal, ordenarCronologico,
    parsearFecha, rangoDeMovimientos, recortar, texto,
} from './parser-util';

/** ¿Es el Excel "REPORTE MOVIMIENTOS SIMPLES MONETARIOS" de Produbanco? */
export const esProdubanco = (filas: FilaHoja[]): boolean =>
    filas.slice(0, 6).some((f) => f.some((c) => normalizar(texto(c)).startsWith('reporte movimientos simples')));

/**
 * Produbanco (Excel). Rótulos "Desde:/Hasta:/Cuenta:" en la columna A con el valor en la B. Fechas
 * en formato mm/dd/yyyy. TOTAL con signo (débitos negativos). Los movimientos van del más viejo al
 * más nuevo, pero desordenados dentro de un mismo día: por eso los saldos se sacan de la cadena.
 */
export function parsearProdubanco(filas: FilaHoja[]): EstadoCuentaParseado {
    const advertencias: string[] = [];
    const valorRotulo = (rotulo: string): string | null => {
        const fila = filas.slice(0, 12).find((f) => normalizar(texto(f[0])) === rotulo);
        return fila ? texto(fila[1]) : null;
    };
    const cuenta = valorRotulo('cuenta:');

    const idxCabecera = buscarFilaCabecera(filas, ['fecha proceso', 'transaccion', 'causal', 'total']);
    if (idxCabecera < 0) throw new Error('No se encontró la fila de cabeceras (FECHA PROCESO / TRANSACCIÓN / CAUSAL / TOTAL).');
    const cabeceras = filas[idxCabecera].map((c) => normalizar(texto(c)));
    const col = (nombre: string): number => cabeceras.indexOf(nombre);
    const cFecha = col('fecha proceso');
    const cTransaccion = col('transaccion');
    const cCausal = col('causal');
    const cTotal = col('total');
    const cSaldo = col('saldo contable');
    const cReferencia = col('referencia');
    const cOficina = col('oficina');

    const datos = filas.slice(idxCabecera + 1).filter((f) => texto(f[cFecha]) !== '' || typeof f[cFecha] === 'number');
    const orden = detectarOrdenFecha(datos.map((f) => texto(f[cFecha])), 'mdy');

    const movimientos: MovimientoBanco[] = [];
    for (const fila of datos) {
        try {
            const total = numeroPuntoDecimal(fila[cTotal]);
            const transaccion = texto(fila[cTransaccion]);
            // "42003 - NOTA DE DEBITO" también marca el débito si el total viniera sin signo
            const esDebito = total < 0 || (total > 0 && normalizar(transaccion).includes('nota de debito'));
            movimientos.push({
                fecha: parsearFecha(fila[cFecha], orden),
                documento: recortar(texto(fila[cReferencia]), 60),
                descripcion: recortar(texto(fila[cCausal]), 400),
                referencia: recortar(transaccion, 400),
                oficina: recortar(texto(fila[cOficina]), 80),
                monto: Math.abs(total),
                signo: esDebito ? -1 : 1,
                saldo: cSaldo >= 0 && texto(fila[cSaldo]) !== '' ? numeroPuntoDecimal(fila[cSaldo]) : null,
            });
        } catch (e) {
            advertencias.push(`Fila omitida: ${(e as Error).message}`);
        }
    }

    const ordenados = ordenarCronologico(movimientos, 'ASC');
    const rango = rangoDeMovimientos(ordenados);
    const desde = valorRotulo('desde:');
    const hasta = valorRotulo('hasta:');
    return {
        formato: 'PRODUBANCO',
        cuenta,
        fechaDesde: desde ? parsearFecha(desde, orden) : rango.desde,
        fechaHasta: hasta ? parsearFecha(hasta, orden) : rango.hasta,
        movimientos: ordenados,
        advertencias,
    };
}
