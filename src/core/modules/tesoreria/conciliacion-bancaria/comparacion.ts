import { diasEntre, documentoComparable } from './matching';
import { aCentavos, deCentavos } from './parsers/parser-util';

/** Umbral de confianza por debajo del cual un cruce automático/IA se marca para revisión. */
export const CONFIANZA_MINIMA = 70;

export interface CmpBanco {
    ide_tecmv: number;
    fecha: string;
    documento: string;
    descripcion: string;
    referencia: string;
    /** Valor con signo (ingreso +). */
    valor: number;
    saldo: number | null;
    estado: string;
    nota: string | null;
}

export interface CmpErp {
    ide_teclb: number;
    fecha: string;
    numero: string | null;
    comprobante: string | null;
    beneficiario: string | null;
    observacion: string | null;
    valor: number;
    tipo: string;
    conciliado_legado: boolean;
    en_periodo: boolean;
}

export interface CmpMatch {
    ide_tecmv: number;
    ide_teclb: number;
    grupo: number;
    tipo: string;
    regla: string | null;
    confianza: number | null;
    observacion: string | null;
}

export interface EntradaComparacion {
    desde: string;
    hasta: string;
    toleranciaDias: number;
    saldoInicialBanco: number | null;
    saldoInicialErp: number;
    banco: CmpBanco[];
    erp: CmpErp[];
    matches: CmpMatch[];
    /** Movimientos del banco donde la cadena de saldos del archivo se rompe. */
    saltosBanco: Set<number>;
}

export type TipoBloque = 'CRUCE' | 'SOLO_BANCO' | 'SOLO_ERP';
export type Severidad = 'ROJO' | 'AMARILLO' | 'GRIS' | 'OK';

export interface Alerta {
    codigo: string;
    nivel: 'ROJO' | 'AMARILLO' | 'GRIS';
    texto: string;
}

export interface BloqueComparacion {
    id: string;
    tipo: TipoBloque;
    fecha: string;
    banco: CmpBanco[];
    erp: CmpErp[];
    totalBanco: number;
    totalErp: number;
    diferencia: number;
    cruce: { grupo: number; tipo: string; regla: string | null; confianza: number | null; observacion: string | null } | null;
    severidad: Severidad;
    alertas: Alerta[];
    /** Saldo del banco / del ERP / su diferencia acumulados hasta este bloque (null si el banco no informa saldos). */
    acumBanco: number | null;
    acumErp: number | null;
    diferenciaAcumulada: number | null;
}

export interface ResultadoComparacion {
    bloques: BloqueComparacion[];
    contadores: {
        total: number;
        cruzados: number;
        soloBanco: number;
        soloErp: number;
        rojos: number;
        amarillos: number;
        ignorados: number;
        conAlertas: number;
        /** Movimientos del ERP del margen de tolerancia (otro mes) sin cruce: no se muestran como faltantes. */
        erpFueraDeMesSinCruce: number;
    };
    saldos: { inicialBanco: number | null; inicialErp: number; arrastre: number | null };
}

const cents = (n: number) => aCentavos(n);
const alertaRoja = (codigo: string, texto: string): Alerta => ({ codigo, nivel: 'ROJO', texto });
const alertaAmarilla = (codigo: string, texto: string): Alerta => ({ codigo, nivel: 'AMARILLO', texto });
const dinero = (centavos: number) => deCentavos(centavos).toFixed(2);

/**
 * Arma la comparación banco ↔ ERP como bloques alineados: cada CRUCE (grupo de matches) es un bloque con
 * lo del banco y lo del ERP; lo que no cruzó es un bloque de un solo lado (en rojo, "falta en el otro").
 * Sobre cada bloque se evalúan las reglas de advertencia (ver docs/plan-conciliacion-bancaria.md §10) y se
 * acumulan los saldos de cada lado para ver desde qué bloque empieza a descuadrar la diferencia.
 * Función pura: no toca la BD.
 */
export function construirComparacion(entrada: EntradaComparacion): ResultadoComparacion {
    const bancoPorId = new Map(entrada.banco.map((b) => [b.ide_tecmv, b]));
    const erpPorId = new Map(entrada.erp.map((e) => [e.ide_teclb, e]));

    // Grupos de cruce
    const grupos = new Map<number, { matches: CmpMatch[]; banco: Set<number>; erp: Set<number> }>();
    for (const m of entrada.matches) {
        const g = grupos.get(m.grupo) ?? { matches: [], banco: new Set<number>(), erp: new Set<number>() };
        g.matches.push(m);
        g.banco.add(m.ide_tecmv);
        g.erp.add(m.ide_teclb);
        grupos.set(m.grupo, g);
    }
    const bancoCruzado = new Set<number>();
    const erpCruzado = new Set<number>();
    grupos.forEach((g) => {
        g.banco.forEach((id) => bancoCruzado.add(id));
        g.erp.forEach((id) => erpCruzado.add(id));
    });

    // Repetidos por lado, para detectar posibles duplicados. En el ERP: misma fecha y monto. En el banco (documento
    // oficial) cada movimiento trae su propio número de referencia, así que dos con el mismo monto y fecha pero con
    // referencia distinta NO son repetidos (p. ej. las comisiones de 0,36 de cada transferencia); solo cuenta como
    // posible duplicado si también coincide el documento.
    const repeticiones = <T extends { fecha: string; valor: number }>(items: T[], clave: (i: T) => string) => {
        const mapa = new Map<string, number>();
        items.forEach((i) => mapa.set(clave(i), (mapa.get(clave(i)) ?? 0) + 1));
        return mapa;
    };
    const claveBanco = (b: CmpBanco) => `${b.fecha}|${cents(b.valor)}|${(b.documento ?? '').trim()}`;
    const claveErp = (e: CmpErp) => `${e.fecha}|${cents(e.valor)}`;
    const repBanco = repeticiones(entrada.banco, claveBanco);
    const repErp = repeticiones(entrada.erp, claveErp);

    const fueraDelMes = (fecha: string) => fecha < entrada.desde || fecha > entrada.hasta;
    const bloques: BloqueComparacion[] = [];

    // ── Cruces ──
    grupos.forEach((g, grupo) => {
        const banco = [...g.banco].map((id) => bancoPorId.get(id)).filter((b): b is CmpBanco => !!b);
        const erp = [...g.erp].map((id) => erpPorId.get(id)).filter((e): e is CmpErp => !!e);
        const perdidos = g.banco.size - banco.length + (g.erp.size - erp.length);
        const primero = g.matches[0];
        const alertas: Alerta[] = [];

        const totalBanco = banco.reduce((s, b) => s + cents(b.valor), 0);
        const totalErp = erp.reduce((s, e) => s + cents(e.valor), 0);
        const diferencia = totalBanco - totalErp;
        if (diferencia !== 0) {
            alertas.push(alertaAmarilla('DIFERENCIA', `Los montos no coinciden: banco ${dinero(totalBanco)} vs ERP ${dinero(totalErp)} (diferencia ${dinero(diferencia)})${primero.observacion ? `. Justificación: ${primero.observacion}` : ''}`));
        }
        if (totalBanco !== 0 && totalErp !== 0 && Math.sign(totalBanco) !== Math.sign(totalErp)) {
            alertas.push(alertaAmarilla('SIGNO', 'Ingreso contra egreso: normalmente no son el mismo movimiento'));
        }
        const fechas = [...banco.map((b) => b.fecha), ...erp.map((e) => e.fecha)].sort();
        if (fechas.length > 1) {
            const dias = diasEntre(fechas[0], fechas[fechas.length - 1]);
            if (dias >= 1) {
                alertas.push(alertaAmarilla('FECHAS', `Fechas con ${dias} día(s) de diferencia${dias >= entrada.toleranciaDias ? ' (en el límite de la tolerancia)' : ''}`));
            }
        }
        if (fechas.some(fueraDelMes)) alertas.push(alertaAmarilla('OTRO_MES', 'Uno de los movimientos es de otro mes'));
        if (primero.regla?.includes('AMBIGUO')) alertas.push(alertaAmarilla('AMBIGUO', 'Cruce ambiguo: hay varios movimientos con el mismo monto'));
        else if (primero.tipo !== 'MANUAL' && primero.confianza !== null && primero.confianza < CONFIANZA_MINIMA) {
            alertas.push(alertaAmarilla('BAJA_CONFIANZA', `Confianza baja (${primero.confianza}%)`));
        }
        if (primero.tipo === 'IA') alertas.push(alertaAmarilla('IA', 'Cruce aceptado desde una sugerencia de la IA: conviene revisarlo'));
        else if (primero.regla === 'SUMA') alertas.push(alertaAmarilla('SUMA', 'Cruce por suma de varios movimientos: conviene revisarlo'));
        if (banco.some((b) => entrada.saltosBanco.has(b.ide_tecmv))) {
            alertas.push(alertaAmarilla('SALTO_SALDO', 'El saldo del banco no encadena en este movimiento'));
        }
        if (perdidos > 0) alertas.push(alertaAmarilla('NO_VIGENTE', `${perdidos} movimiento(s) del cruce ya no están disponibles (anulados en el libro o fuera de la ventana)`));

        bloques.push({
            id: `G${grupo}`,
            tipo: 'CRUCE',
            fecha: fechas[0] ?? entrada.desde,
            banco, erp,
            totalBanco: deCentavos(totalBanco),
            totalErp: deCentavos(totalErp),
            diferencia: deCentavos(diferencia),
            cruce: { grupo, tipo: primero.tipo, regla: primero.regla, confianza: primero.confianza, observacion: primero.observacion },
            severidad: alertas.length > 0 ? 'AMARILLO' : 'OK',
            alertas,
            acumBanco: null, acumErp: null, diferenciaAcumulada: null,
        });
    });

    // ── Solo banco ──
    for (const b of entrada.banco) {
        if (bancoCruzado.has(b.ide_tecmv)) continue;
        const alertas: Alerta[] = [];
        let severidad: Severidad = 'ROJO';
        if (b.estado === 'IGNORADO') {
            severidad = 'GRIS';
            alertas.push({ codigo: 'IGNORADO', nivel: 'GRIS', texto: `Ignorado${b.nota ? `: ${b.nota}` : ''}` });
        } else {
            alertas.push(alertaRoja('BANCO_SIN_ERP', b.estado === 'FALTANTE' ? `Marcado como falta en el ERP${b.nota ? `: ${b.nota}` : ''}` : 'Falta en el ERP'));
        }
        if ((repBanco.get(claveBanco(b)) ?? 0) > 1) {
            alertas.push(alertaAmarilla('DUPLICADO', 'Posible duplicado: mismo documento, monto y fecha aparecen varias veces en el banco'));
        }
        if (entrada.saltosBanco.has(b.ide_tecmv)) alertas.push(alertaAmarilla('SALTO_SALDO', 'El saldo del banco no encadena en este movimiento'));
        bloques.push({
            id: `B${b.ide_tecmv}`, tipo: 'SOLO_BANCO', fecha: b.fecha, banco: [b], erp: [],
            totalBanco: deCentavos(cents(b.valor)), totalErp: 0, diferencia: deCentavos(cents(b.valor)),
            cruce: null, severidad, alertas, acumBanco: null, acumErp: null, diferenciaAcumulada: null,
        });
    }

    // Documentos del ERP que ya están cruzados con el banco, con lo que el banco muestra y lo que suma el ERP: si queda otro
    // movimiento del ERP con ese mismo número sin cruzar, es un posible registro duplicado (misma transferencia cobrada dos veces)
    const docCruzado = new Map<string, { banco: number; erp: number }>();
    for (const bl of bloques) {
        if (bl.tipo !== 'CRUCE') continue;
        for (const e of bl.erp) {
            for (const d of new Set([documentoComparable(e.numero ?? ''), documentoComparable(e.comprobante ?? '')])) {
                if (d && !docCruzado.has(d)) docCruzado.set(d, { banco: bl.totalBanco, erp: bl.totalErp });
            }
        }
    }

    // ── Solo ERP (los del margen de otro mes sin cruce no son faltantes: solo se cuentan) ──
    let erpFueraDeMesSinCruce = 0;
    for (const e of entrada.erp) {
        if (erpCruzado.has(e.ide_teclb)) continue;
        if (!e.en_periodo) { erpFueraDeMesSinCruce += 1; continue; }
        const alertas: Alerta[] = [alertaRoja('ERP_SIN_BANCO', 'Falta en el banco')];
        const docPrevio = [documentoComparable(e.numero ?? ''), documentoComparable(e.comprobante ?? '')].map((d) => (d ? docCruzado.get(d) : undefined)).find(Boolean);
        if (docPrevio) {
            alertas.push(alertaAmarilla('DOCUMENTO_REPETIDO', `El número ${e.numero || e.comprobante} ya está cruzado con el banco en otro movimiento del ERP (el banco muestra ${dinero(cents(docPrevio.banco))}): posible registro duplicado de la misma transferencia`));
        }
        if (e.conciliado_legado) alertas.push(alertaAmarilla('LEGADO', 'Marcado como conciliado con el flujo antiguo, pero sin cruce en esta conciliación'));
        if ((repErp.get(claveErp(e)) ?? 0) > 1) {
            alertas.push(alertaAmarilla('DUPLICADO', 'Posible duplicado: mismo monto y fecha aparecen varias veces en el ERP'));
        }
        bloques.push({
            id: `E${e.ide_teclb}`, tipo: 'SOLO_ERP', fecha: e.fecha, banco: [], erp: [e],
            totalBanco: 0, totalErp: deCentavos(cents(e.valor)), diferencia: deCentavos(-cents(e.valor)),
            cruce: null, severidad: 'ROJO', alertas, acumBanco: null, acumErp: null, diferenciaAcumulada: null,
        });
    }

    // Orden por fecha (los cruces antes que lo sin cruzar en la misma fecha)
    const rango: Record<TipoBloque, number> = { CRUCE: 0, SOLO_BANCO: 1, SOLO_ERP: 2 };
    bloques.sort((a, b) => a.fecha.localeCompare(b.fecha) || rango[a.tipo] - rango[b.tipo] || a.id.localeCompare(b.id, undefined, { numeric: true }));

    // Acumulados por lado → diferencia acumulada
    const tieneSaldosBanco = entrada.saldoInicialBanco !== null;
    let acumBanco = cents(entrada.saldoInicialBanco ?? 0);
    let acumErp = cents(entrada.saldoInicialErp);
    for (const bl of bloques) {
        acumBanco += bl.banco.reduce((s, b) => s + cents(b.valor), 0);
        acumErp += bl.erp.reduce((s, e) => s + cents(e.valor), 0);
        if (tieneSaldosBanco) {
            bl.acumBanco = deCentavos(acumBanco);
            bl.diferenciaAcumulada = deCentavos(acumBanco - acumErp);
        }
        bl.acumErp = deCentavos(acumErp);
    }

    const rojos = bloques.filter((b) => b.severidad === 'ROJO').length;
    const amarillos = bloques.filter((b) => b.severidad === 'AMARILLO').length;
    return {
        bloques,
        contadores: {
            total: bloques.length,
            cruzados: bloques.filter((b) => b.tipo === 'CRUCE').length,
            soloBanco: bloques.filter((b) => b.tipo === 'SOLO_BANCO' && b.severidad !== 'GRIS').length,
            soloErp: bloques.filter((b) => b.tipo === 'SOLO_ERP').length,
            rojos,
            amarillos,
            ignorados: bloques.filter((b) => b.severidad === 'GRIS').length,
            conAlertas: bloques.filter((b) => b.alertas.length > 0 && b.severidad !== 'GRIS').length,
            erpFueraDeMesSinCruce,
        },
        saldos: {
            inicialBanco: entrada.saldoInicialBanco,
            inicialErp: entrada.saldoInicialErp,
            arrastre: tieneSaldosBanco ? deCentavos(cents(entrada.saldoInicialBanco as number) - cents(entrada.saldoInicialErp)) : null,
        },
    };
}
