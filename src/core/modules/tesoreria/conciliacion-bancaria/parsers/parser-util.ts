import type { FilaHoja, MovimientoBanco } from './estado-cuenta.types';

export const aCentavos = (valor: number | string | null | undefined): number => Math.round(Number(valor || 0) * 100);
export const deCentavos = (centavos: number): number => Number((centavos / 100).toFixed(2));

/** Texto de una celda, sin espacios sobrantes. */
export const texto = (celda: string | number | null | undefined): string => (celda === null || celda === undefined ? '' : String(celda).trim());

/** "1,234.56" / "$1,234.56" / 1234.56 -> 1234.56 (formato con punto decimal). */
export function numeroPuntoDecimal(celda: string | number | null | undefined): number {
    if (typeof celda === 'number') return celda;
    const limpio = texto(celda).replace(/[$\s,]/g, '');
    if (limpio === '' || limpio === '-') return 0;
    const n = Number(limpio);
    if (Number.isNaN(n)) throw new Error(`Monto no numérico: "${celda}"`);
    return n;
}

/** "1.234,56" -> 1234.56 (formato con coma decimal, como el de Deuna). */
export function numeroComaDecimal(celda: string): number {
    const limpio = texto(celda).replace(/[$\s.]/g, '').replace(',', '.');
    const n = Number(limpio);
    if (Number.isNaN(n)) throw new Error(`Monto no numérico: "${celda}"`);
    return n;
}

const dosDigitos = (n: number | string): string => String(n).padStart(2, '0');

/** Serial de Excel (días desde 1899-12-30) -> YYYY-MM-DD. */
export function fechaDeSerialExcel(serial: number): string {
    const ms = Math.round((serial - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
}

/** Valida y compone YYYY-MM-DD; lanza si la fecha no existe (ej. 31/02). */
export function fechaIso(anio: number, mes: number, dia: number): string {
    const iso = `${anio}-${dosDigitos(mes)}-${dosDigitos(dia)}`;
    const d = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.getUTCMonth() + 1 !== mes || d.getUTCDate() !== dia) {
        throw new Error(`Fecha inválida: ${iso}`);
    }
    return iso;
}

/** Acepta 2026-08-31, 31/08/2026 (dmy) o 08/31/2026 (mdy) y serial de Excel. */
export function parsearFecha(celda: string | number | null | undefined, orden: 'dmy' | 'mdy'): string {
    if (typeof celda === 'number') return fechaDeSerialExcel(celda);
    const t = texto(celda);
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
    if (m) return fechaIso(Number(m[1]), Number(m[2]), Number(m[3]));
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
    if (m) {
        return orden === 'dmy'
            ? fechaIso(Number(m[3]), Number(m[2]), Number(m[1]))
            : fechaIso(Number(m[3]), Number(m[1]), Number(m[2]));
    }
    throw new Error(`Fecha no reconocida: "${t}"`);
}

/** Índice (0-based) de la primera fila cuyo texto contiene TODAS las cabeceras dadas; -1 si no hay. */
export function buscarFilaCabecera(filas: FilaHoja[], cabeceras: string[]): number {
    const objetivo = cabeceras.map(normalizar);
    return filas.findIndex((fila) => {
        const celdas = fila.map((c) => normalizar(texto(c)));
        return objetivo.every((h) => celdas.some((c) => c === h));
    });
}

/** Minúsculas, sin tildes ni espacios repetidos: para comparar rótulos. */
export function normalizar(t: string): string {
    return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface SaldosCadena {
    inicial: number | null;
    final: number | null;
    /** false si la cadena de saldos tiene huecos (el estado de cuenta no está completo). */
    consistente: boolean;
}

/**
 * Saldo inicial y final a partir de la CADENA de saldos: cada movimiento deja un saldo (después) y
 * cuyo saldo anterior es saldo - monto*signo. El saldo inicial es el "anterior" que ningún
 * movimiento dejó como "después", y el final es el "después" que ningún movimiento usó como
 * "anterior". Así no depende del orden en que el banco liste los movimientos (Produbanco los
 * ordena por fecha pero desordenados dentro del día). Si un banco no trae saldo por movimiento,
 * devuelve nulls.
 *
 * `movimientos` debe estar en orden cronológico (se usa solo como plan B cuando la cadena es
 * ambigua, ej. el saldo final es igual al inicial).
 */
export function calcularSaldosCadena(movimientos: MovimientoBanco[]): SaldosCadena {
    if (movimientos.length === 0 || movimientos.some((m) => m.saldo === null)) {
        return { inicial: null, final: null, consistente: false };
    }
    const despues = new Map<number, number>();
    const antes = new Map<number, number>();
    const sumar = (mapa: Map<number, number>, clave: number) => mapa.set(clave, (mapa.get(clave) ?? 0) + 1);
    for (const m of movimientos) {
        const saldoDespues = aCentavos(m.saldo);
        sumar(despues, saldoDespues);
        sumar(antes, saldoDespues - aCentavos(m.monto) * m.signo);
    }
    // Multiconjunto: lo que sobra en "antes" (inicial) y en "después" (final) tras cruzarlos
    const restarMapas = (a: Map<number, number>, b: Map<number, number>): number[] => {
        const sobrantes: number[] = [];
        for (const [clave, cant] of a) {
            const resto = cant - (b.get(clave) ?? 0);
            for (let i = 0; i < resto; i += 1) sobrantes.push(clave);
        }
        return sobrantes;
    };
    const iniciales = restarMapas(antes, despues);
    const finales = restarMapas(despues, antes);
    if (iniciales.length === 1 && finales.length === 1) {
        return { inicial: deCentavos(iniciales[0]), final: deCentavos(finales[0]), consistente: true };
    }
    // Plan B: primer y último movimiento en orden cronológico (saldo final == inicial o huecos)
    const primero = movimientos[0];
    const ultimo = movimientos[movimientos.length - 1];
    return {
        inicial: deCentavos(aCentavos(primero.saldo) - aCentavos(primero.monto) * primero.signo),
        final: ultimo.saldo,
        consistente: iniciales.length === 0 && finales.length === 0,
    };
}

/**
 * Deja los movimientos en orden cronológico ascendente. Cada banco lista en un sentido (Guayaquil,
 * Pichincha y Deuna: el más nuevo primero; Produbanco: el más viejo primero): se deduce comparando
 * la primera y la última fecha, y solo si todos son del mismo día se usa el sentido habitual del
 * banco. No reordena por fecha (sort) para no desarmar el orden que el banco da dentro de un día.
 */
export function ordenarCronologico(movimientos: MovimientoBanco[], sentidoHabitual: 'ASC' | 'DESC'): MovimientoBanco[] {
    if (movimientos.length < 2) return movimientos;
    const primera = movimientos[0].fecha;
    const ultima = movimientos[movimientos.length - 1].fecha;
    const descendente = primera === ultima ? sentidoHabitual === 'DESC' : primera > ultima;
    return descendente ? [...movimientos].reverse() : movimientos;
}

/** Orden de las fechas con barras (dmy / mdy) según lo que muestren TODAS las del archivo. */
export function detectarOrdenFecha(fechas: string[], porDefecto: 'dmy' | 'mdy'): 'dmy' | 'mdy' {
    let primeroMayor12 = false;
    let segundoMayor12 = false;
    for (const f of fechas) {
        const m = /^(\d{1,2})\/(\d{1,2})\/\d{4}/.exec(f.trim());
        if (!m) continue;
        if (Number(m[1]) > 12) primeroMayor12 = true;
        if (Number(m[2]) > 12) segundoMayor12 = true;
    }
    if (primeroMayor12 && !segundoMayor12) return 'dmy';
    if (segundoMayor12 && !primeroMayor12) return 'mdy';
    return porDefecto;
}

/** Rango de fechas (min, max) de los movimientos, o nulls si no hay. */
export function rangoDeMovimientos(movimientos: MovimientoBanco[]): { desde: string | null; hasta: string | null } {
    if (movimientos.length === 0) return { desde: null, hasta: null };
    const fechas = movimientos.map((m) => m.fecha).sort();
    return { desde: fechas[0], hasta: fechas[fechas.length - 1] };
}

/** Recorta un texto largo a `max` caracteres (columnas VARCHAR). */
export const recortar = (t: string, max: number): string => (t.length > max ? t.slice(0, max) : t);

export interface SaltoSaldo {
    indice: number;
    movimiento: MovimientoBanco;
    saldoEsperado: number;
}

/**
 * Movimientos cuyo saldo NO es el saldo anterior +/- su monto (en el orden cronológico dado).
 * Sirve para explicar al usuario DÓNDE se rompe la cadena del estado de cuenta; solo es confiable
 * si el banco lista dentro de cada día en el orden real de las operaciones.
 */
export function detectarSaltosDeSaldo(movimientos: MovimientoBanco[], saldoInicial: number): SaltoSaldo[] {
    const saltos: SaltoSaldo[] = [];
    let previo = aCentavos(saldoInicial);
    movimientos.forEach((m, indice) => {
        const esperado = previo + aCentavos(m.monto) * m.signo;
        if (m.saldo !== null && esperado !== aCentavos(m.saldo)) saltos.push({ indice, movimiento: m, saldoEsperado: deCentavos(esperado) });
        if (m.saldo !== null) previo = aCentavos(m.saldo);
    });
    return saltos;
}
