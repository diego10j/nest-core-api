import type { EstadoCuentaParseado, MovimientoBanco } from './estado-cuenta.types';
import {
    numeroComaDecimal, ordenarCronologico, parsearFecha, rangoDeMovimientos, recortar,
} from './parser-util';

// unpdf es ESM-only y el proyecto compila a CommonJS: un `import()` literal lo transformaría TS a
// require() (mismo truco que base-tecnica/helpers/pdf-texto.helper.ts).
const importEsm = new Function('specifier', 'return import(specifier)') as (s: string) => Promise<any>;

/**
 * Texto plano de cada página. Se usa el texto lineal de unpdf y NO base-tecnica/extraerTextoPdf:
 * ese helper elimina las líneas "repetidas" en >= 60 % de las páginas comparándolas con los dígitos
 * enmascarados, y todas las filas de movimientos tienen la misma forma, así que descartaría casi
 * todos los movimientos de las páginas 2 en adelante.
 */
export async function textoPaginasPdf(buffer: Buffer): Promise<string[]> {
    const { extractText, getDocumentProxy } = await importEsm('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: false });
    return text as string[];
}

/** ¿Es el PDF "Descarga de movimientos" de Deuna? */
export const esDeuna = (paginas: string[]): boolean => {
    const inicio = (paginas[0] ?? '').slice(0, 1500).toLowerCase();
    return inicio.includes('descarga de movimientos') && (inicio.includes('deuna') || (paginas[0] ?? '').toLowerCase().includes('deunaapp'));
};

const MONTO = '\\d{1,3}(?:\\.\\d{3})*,\\d{2}';
// fecha  documento  descripción  débito  crédito  saldo   (formato europeo: 1.958,63)
const FILA = new RegExp(`^(\\d{2}/\\d{2}/\\d{4})\\s+(\\S+)\\s+(.+?)\\s+(${MONTO})\\s+(${MONTO})\\s+(-?${MONTO})$`);

/**
 * Deuna (PDF de cuenta personal). El PDF NO trae saldo inicial ni final: salen de la cadena de
 * saldos por movimiento. Cabecera con "Cuenta: 7700..." y "Periodo del dd/mm/yyyy hasta el
 * dd/mm/yyyy"; el reporte se puede bajar en cualquier momento del mes (corte parcial).
 */
export function parsearDeuna(paginas: string[]): EstadoCuentaParseado {
    const advertencias: string[] = [];
    const todo = paginas.join('\n');
    const cuenta = /Cuenta:\s*(\d+)/i.exec(todo)?.[1] ?? null;
    const periodo = /Periodo del\s+(\d{2}\/\d{2}\/\d{4})\s+hasta el\s+(\d{2}\/\d{2}\/\d{4})/i.exec(todo);

    const movimientos: MovimientoBanco[] = [];
    let noReconocidas = 0;
    for (const linea of todo.split('\n')) {
        const l = linea.trim();
        if (!/^\d{2}\/\d{2}\/\d{4}\s/.test(l)) continue;
        const m = FILA.exec(l);
        if (!m) { noReconocidas += 1; continue; }
        try {
            const debito = numeroComaDecimal(m[4]);
            const credito = numeroComaDecimal(m[5]);
            if (debito === 0 && credito === 0) continue;
            movimientos.push({
                fecha: parsearFecha(m[1], 'dmy'),
                documento: recortar(m[2], 60),
                descripcion: recortar(m[3].trim(), 400),
                referencia: '',
                oficina: '',
                monto: debito > 0 ? debito : credito,
                signo: debito > 0 ? -1 : 1,
                saldo: numeroComaDecimal(m[6].replace(/^-/, '')) * (m[6].startsWith('-') ? -1 : 1),
            });
        } catch (e) {
            advertencias.push(`Fila omitida: ${(e as Error).message}`);
        }
    }
    if (noReconocidas > 0) advertencias.push(`${noReconocidas} línea(s) que empiezan con fecha no se pudieron leer.`);

    const ordenados = ordenarCronologico(movimientos, 'DESC');
    const rango = rangoDeMovimientos(ordenados);
    return {
        formato: 'DEUNA',
        cuenta,
        fechaDesde: periodo ? parsearFecha(periodo[1], 'dmy') : rango.desde,
        fechaHasta: periodo ? parsearFecha(periodo[2], 'dmy') : rango.hasta,
        movimientos: ordenados,
        advertencias,
    };
}
