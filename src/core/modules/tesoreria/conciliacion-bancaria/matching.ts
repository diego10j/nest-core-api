/** Movimiento del banco visto por el motor de emparejamiento. `centavos` lleva el signo (ingreso +). */
export interface ItemBanco {
    id: number;
    fecha: string;
    documento: string;
    centavos: number;
}

/** Movimiento del libro de bancos (ERP). `centavos` = valor_teclb * signo_tettb, en centavos. */
export interface ItemErp {
    id: number;
    fecha: string;
    numero: string;
    comprobante: string;
    centavos: number;
}

export interface MatchPropuesto {
    idsBanco: number[];
    idsErp: number[];
    /** DOCUMENTO, MONTO_FECHA, MONTO_FECHA_AMBIGUO, SUMA */
    regla: string;
    /** 0-100 */
    confianza: number;
}

const MS_DIA = 86_400_000;

export const diasEntre = (a: string, b: string): number =>
    Math.abs(Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / MS_DIA));

/** Solo dígitos y sin ceros a la izquierda: "0181891497" y "181891497" son el mismo documento. */
const soloDigitos = (t: string): string => (t ?? '').replace(/\D/g, '').replace(/^0+/, '');

/** Los documentos comparables (>= 4 dígitos, para no cruzar por "1" o "12"). */
const documentoComparable = (t: string): string => {
    const d = soloDigitos(t);
    return d.length >= 4 ? d : '';
};

/** Días máximos entre fechas cuando el cruce es por número de documento (mismo monto). */
const DIAS_MAX_POR_DOCUMENTO = 15;

/**
 * Cruce automático 1 a 1 en dos pasadas, ambas con MONTO EXACTO Y MISMO SIGNO:
 *  1. DOCUMENTO: el documento del banco coincide con el número o el comprobante del libro.
 *  2. MONTO_FECHA: fechas a `toleranciaDias` o menos. Se asigna primero el par de fecha más
 *     cercana; si ese banco o ese libro tenían varios candidatos igual de buenos (ej. varias
 *     transferencias de 350,00) el cruce se marca AMBIGUO con menos confianza, porque desde el
 *     punto de vista del dinero son intercambiables pero el contador debería poder revisarlos.
 *
 * Es determinista: mismos datos, mismos pares. No modifica los arreglos recibidos.
 */
export function emparejarUnoAUno(banco: ItemBanco[], erp: ItemErp[], toleranciaDias: number): MatchPropuesto[] {
    const resultado: MatchPropuesto[] = [];
    const bancoLibre = new Set(banco.map((b) => b.id));
    const erpLibre = new Set(erp.map((e) => e.id));

    // Pasada 1: por documento
    const erpPorDocumento = new Map<string, ItemErp[]>();
    for (const e of erp) {
        for (const d of new Set([documentoComparable(e.numero), documentoComparable(e.comprobante)])) {
            if (d) erpPorDocumento.set(d, [...(erpPorDocumento.get(d) ?? []), e]);
        }
    }
    for (const b of banco) {
        const doc = documentoComparable(b.documento);
        if (!doc) continue;
        const candidato = (erpPorDocumento.get(doc) ?? [])
            .filter((e) => erpLibre.has(e.id) && e.centavos === b.centavos && diasEntre(b.fecha, e.fecha) <= DIAS_MAX_POR_DOCUMENTO)
            .sort((x, y) => diasEntre(b.fecha, x.fecha) - diasEntre(b.fecha, y.fecha) || x.id - y.id)[0];
        if (candidato) {
            resultado.push({ idsBanco: [b.id], idsErp: [candidato.id], regla: 'DOCUMENTO', confianza: 100 });
            bancoLibre.delete(b.id);
            erpLibre.delete(candidato.id);
        }
    }

    // Pasada 2: por monto y fecha
    const pares: Array<{ b: ItemBanco; e: ItemErp; dias: number }> = [];
    const erpPorMonto = new Map<number, ItemErp[]>();
    for (const e of erp) if (erpLibre.has(e.id)) erpPorMonto.set(e.centavos, [...(erpPorMonto.get(e.centavos) ?? []), e]);
    for (const b of banco) {
        if (!bancoLibre.has(b.id)) continue;
        for (const e of erpPorMonto.get(b.centavos) ?? []) {
            const dias = diasEntre(b.fecha, e.fecha);
            if (dias <= toleranciaDias) pares.push({ b, e, dias });
        }
    }
    const candidatosBanco = new Map<number, number>();
    const candidatosErp = new Map<number, number>();
    for (const p of pares) {
        candidatosBanco.set(p.b.id, (candidatosBanco.get(p.b.id) ?? 0) + 1);
        candidatosErp.set(p.e.id, (candidatosErp.get(p.e.id) ?? 0) + 1);
    }
    pares.sort((x, y) => x.dias - y.dias || x.b.fecha.localeCompare(y.b.fecha) || x.b.id - y.b.id || x.e.id - y.e.id);
    for (const p of pares) {
        if (!bancoLibre.has(p.b.id) || !erpLibre.has(p.e.id)) continue;
        const ambiguo = (candidatosBanco.get(p.b.id) ?? 0) > 1 || (candidatosErp.get(p.e.id) ?? 0) > 1;
        resultado.push({
            idsBanco: [p.b.id],
            idsErp: [p.e.id],
            regla: ambiguo ? 'MONTO_FECHA_AMBIGUO' : 'MONTO_FECHA',
            confianza: Math.max(30, (ambiguo ? 70 : 95) - 5 * p.dias),
        });
        bancoLibre.delete(p.b.id);
        erpLibre.delete(p.e.id);
    }
    return resultado;
}

/** Cantidad máxima de movimientos en un lado de un cruce por suma (1 banco = N libro, o al revés). */
const MAX_ELEMENTOS_SUMA = 4;
/** Candidatos máximos que se consideran para la búsqueda de subconjuntos (crece exponencialmente). */
const MAX_CANDIDATOS_SUMA = 18;

/** Primer subconjunto (de menor tamaño, luego el más cercano en fecha) de `items` que suma `objetivo`. */
function buscarSubconjunto<T extends { id: number; centavos: number; fecha: string }>(
    items: T[], objetivo: number, referencia: string,
): T[] | null {
    const ordenados = [...items]
        .sort((a, b) => diasEntre(referencia, a.fecha) - diasEntre(referencia, b.fecha) || a.id - b.id)
        .slice(0, MAX_CANDIDATOS_SUMA);
    for (let tamano = 2; tamano <= MAX_ELEMENTOS_SUMA; tamano += 1) {
        const hallado = combinar(ordenados, tamano, objetivo, 0, []);
        if (hallado) return hallado;
    }
    return null;
}

function combinar<T extends { centavos: number }>(items: T[], tamano: number, objetivo: number, desde: number, actual: T[]): T[] | null {
    if (actual.length === tamano) return actual.reduce((s, i) => s + i.centavos, 0) === objetivo ? actual : null;
    for (let i = desde; i < items.length; i += 1) {
        const hallado = combinar(items, tamano, objetivo, i + 1, [...actual, items[i]]);
        if (hallado) return hallado;
    }
    return null;
}

/**
 * Cruces N:1 / 1:N por SUMA sobre lo que quedó sin cruzar: un movimiento del banco = varios del
 * libro (ej. un depósito de varios cheques) o varios del banco = uno del libro (ej. un asiento
 * que agrupa varias transferencias). Mismo signo y fechas a `toleranciaDias`. Por ser más
 * riesgosos NO se aplican solos: se ofrecen como sugerencias para que el contador los confirme.
 */
export function sugerirPorSuma(banco: ItemBanco[], erp: ItemErp[], toleranciaDias: number): MatchPropuesto[] {
    const resultado: MatchPropuesto[] = [];
    const bancoLibre = new Map(banco.map((b) => [b.id, b]));
    const erpLibre = new Map(erp.map((e) => [e.id, e]));

    for (const b of banco) {
        if (!bancoLibre.has(b.id)) continue;
        const candidatos = [...erpLibre.values()].filter(
            (e) => Math.sign(e.centavos) === Math.sign(b.centavos) && diasEntre(b.fecha, e.fecha) <= toleranciaDias && Math.abs(e.centavos) < Math.abs(b.centavos),
        );
        const subconjunto = buscarSubconjunto(candidatos, b.centavos, b.fecha);
        if (subconjunto) {
            resultado.push({ idsBanco: [b.id], idsErp: subconjunto.map((e) => e.id), regla: 'SUMA', confianza: 60 });
            bancoLibre.delete(b.id);
            subconjunto.forEach((e) => erpLibre.delete(e.id));
        }
    }
    for (const e of [...erpLibre.values()]) {
        if (!erpLibre.has(e.id)) continue;
        const candidatos = [...bancoLibre.values()].filter(
            (b) => Math.sign(b.centavos) === Math.sign(e.centavos) && diasEntre(b.fecha, e.fecha) <= toleranciaDias && Math.abs(b.centavos) < Math.abs(e.centavos),
        );
        const subconjunto = buscarSubconjunto(candidatos, e.centavos, e.fecha);
        if (subconjunto) {
            resultado.push({ idsBanco: subconjunto.map((b) => b.id), idsErp: [e.id], regla: 'SUMA', confianza: 60 });
            erpLibre.delete(e.id);
            subconjunto.forEach((b) => bancoLibre.delete(b.id));
        }
    }
    return resultado;
}
