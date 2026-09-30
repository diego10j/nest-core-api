import type { EstadoCuentaParseado, MovimientoBanco } from './estado-cuenta.types';
import {
    detectarOrdenFecha, normalizar, numeroPuntoDecimal, ordenarCronologico, parsearFecha,
    rangoDeMovimientos, recortar,
} from './parser-util';

/** Cabecera exacta del CSV de Banco Pichincha. */
const CABECERAS = ['fecha', 'codigo', 'concepto', 'tipo', 'documento', 'oficina', 'monto', 'saldo'];

/** Divide un CSV con campos entre comillas (los montos traen coma de miles: "97,180.71"). */
export function parsearCsv(contenido: string): string[][] {
    const filas: string[][] = [];
    let fila: string[] = [];
    let campo = '';
    let entreComillas = false;
    const cierraCampo = () => { fila.push(campo); campo = ''; };
    const cierraFila = () => { cierraCampo(); if (fila.some((c) => c !== '')) filas.push(fila); fila = []; };
    for (let i = 0; i < contenido.length; i += 1) {
        const c = contenido[i];
        if (entreComillas) {
            if (c === '"') {
                if (contenido[i + 1] === '"') { campo += '"'; i += 1; } else entreComillas = false;
            } else campo += c;
        } else if (c === '"') entreComillas = true;
        else if (c === ',') cierraCampo();
        else if (c === '\n') cierraFila();
        else if (c !== '\r') campo += c;
    }
    if (campo !== '' || fila.length > 0) cierraFila();
    return filas;
}

/** Texto del CSV (UTF-8 con o sin BOM; si trae caracteres inválidos se lee como latin1). */
export function textoDeCsv(buffer: Buffer): string {
    const utf8 = buffer.toString('utf8').replace(/^\uFEFF/, '');
    return utf8.includes('\uFFFD') ? buffer.toString('latin1') : utf8;
}

/** ¿Es el CSV de Banco Pichincha? (cabecera "Fecha","Codigo","Concepto","Tipo","Documento","Oficina","Monto","Saldo") */
export const esPichincha = (contenido: string): boolean => {
    const primera = parsearCsv(contenido.slice(0, 500))[0];
    return !!primera && CABECERAS.every((h, i) => normalizar(primera[i] ?? '') === h);
};

/**
 * Banco Pichincha (CSV). El archivo NO trae la cuenta ni el periodo: la cuenta se toma de los
 * dígitos del nombre del archivo (ej. AGOSTO_PICHINCHA100347177.csv) y el periodo de las fechas de
 * los movimientos. Tipo D/C, montos positivos con coma de miles; el más nuevo va primero.
 */
export function parsearPichincha(contenido: string, nombreArchivo: string): EstadoCuentaParseado {
    const advertencias: string[] = [];
    const filas = parsearCsv(contenido);
    const datos = filas.slice(1);
    const orden = detectarOrdenFecha(datos.map((f) => f[0] ?? ''), 'dmy');

    const movimientos: MovimientoBanco[] = [];
    for (const f of datos) {
        try {
            const tipo = (f[3] ?? '').trim().toUpperCase();
            if (tipo !== 'D' && tipo !== 'C') throw new Error(`Tipo "${f[3]}" no es D ni C`);
            movimientos.push({
                fecha: parsearFecha(f[0], orden),
                documento: recortar((f[4] ?? '').trim(), 60),
                descripcion: recortar((f[2] ?? '').trim(), 400),
                referencia: recortar(`Código ${(f[1] ?? '').trim()}`, 400),
                oficina: recortar((f[5] ?? '').trim(), 80),
                monto: Math.abs(numeroPuntoDecimal(f[6])),
                signo: tipo === 'D' ? -1 : 1,
                saldo: (f[7] ?? '').trim() === '' ? null : numeroPuntoDecimal(f[7]),
            });
        } catch (e) {
            advertencias.push(`Fila omitida: ${(e as Error).message}`);
        }
    }

    // La cuenta va en el nombre del archivo: el bloque de dígitos más largo (mínimo 6)
    const bloques: string[] = nombreArchivo.match(/\d{6,}/g) ?? [];
    const cuenta = bloques.sort((a, b) => b.length - a.length)[0] ?? null;
    if (!cuenta) advertencias.push('El CSV de Pichincha no trae la cuenta y el nombre del archivo no la incluye: seleccione la cuenta manualmente.');

    const ordenados = ordenarCronologico(movimientos, 'DESC');
    const rango = rangoDeMovimientos(ordenados);
    return { formato: 'PICHINCHA', cuenta, fechaDesde: rango.desde, fechaHasta: rango.hasta, movimientos: ordenados, advertencias };
}
