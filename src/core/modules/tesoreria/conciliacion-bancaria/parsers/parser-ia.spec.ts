import { aMovimiento, GptJson, leerConIa, LINEAS_POR_TRAMO, numeroFlexible, partirEnTramos } from './parser-ia';
import { calcularSaldosCadena } from './parser-util';

/** IA simulada: lee líneas "dd-mm-aaaa | documento | descripción | débito | crédito | saldo" (un formato inventado). */
const iaSimulada = (): GptJson & { llamadas: number } => ({
    llamadas: 0,
    async parseTextToJson(_prompt: string, texto: string) {
        this.llamadas += 1;
        const movimientos = texto
            .split('\n')
            .map((l) => l.split('|').map((c) => c.trim()))
            .filter((c) => /^\d{2}-\d{2}-\d{4}$/.test(c[0]))
            .map((c) => {
                const [d, m, a] = c[0].split('-');
                return { fecha: `${a}-${m}-${d}`, documento: c[1], descripcion: c[2], debito: c[3], credito: c[4], saldo: c[5] };
            });
        const cuenta = /Cuenta:\s*(\d+)/.exec(texto)?.[1] ?? null;
        return { banco: cuenta ? 'Banco Nuevo' : null, cuenta, fechaDesde: cuenta ? '2026-09-01' : null, fechaHasta: cuenta ? '2026-09-30' : null, movimientos };
    },
});

const construirLineas = (n: number) => {
    const lineas = ['Banco Nuevo - Estado de cuenta', 'Cuenta: 9988776655', 'Fecha | Doc | Descripción | Débito | Crédito | Saldo'];
    let saldo = 1000;
    for (let i = 1; i <= n; i += 1) {
        const esDebito = i % 3 === 0;
        const monto = 10 + i;
        saldo = esDebito ? saldo - monto : saldo + monto;
        const dia = String(1 + Math.floor((i - 1) / 10)).padStart(2, '0');
        lineas.push(`${dia}-09-2026 | D${i} | Movimiento ${i} | ${esDebito ? monto.toFixed(2) : '0,00'} | ${esDebito ? '0,00' : monto.toFixed(2)} | ${saldo.toFixed(2).replace('.', ',')}`);
    }
    lineas.push('Página 1 de 1');
    return lineas;
};

describe('numeroFlexible', () => {
    it.each([
        ['1.958,63', 1958.63], ['1,958.63', 1958.63], ['-12.50', -12.5], ['$ 350,00', 350], ['(45,10)', -45.1],
        ['0,00', 0], [12.5, 12.5], ['1,958', 1958],
    ])('%s -> %s', (entrada, esperado) => {
        expect(numeroFlexible(entrada)).toBe(esperado);
    });

    it('devuelve null para vacío o texto', () => {
        expect(numeroFlexible('')).toBeNull();
        expect(numeroFlexible(null)).toBeNull();
        expect(numeroFlexible('abc')).toBeNull();
    });
});

describe('aMovimiento', () => {
    it('usa débito/crédito separados', () => {
        expect(aMovimiento({ fecha: '2026-09-01', documento: 'A', descripcion: 'x', debito: 10, credito: null, saldo: 90 })).toMatchObject({ monto: 10, signo: -1, saldo: 90 });
        expect(aMovimiento({ fecha: '2026-09-01', documento: 'A', descripcion: 'x', debito: '0,00', credito: '25,5' })).toMatchObject({ monto: 25.5, signo: 1 });
    });

    it('usa monto con tipo o con signo', () => {
        expect(aMovimiento({ fecha: '2026-09-01', monto: 30, tipo: 'D' })).toMatchObject({ monto: 30, signo: -1 });
        expect(aMovimiento({ fecha: '2026-09-01', monto: -30 })).toMatchObject({ monto: 30, signo: -1 });
        expect(aMovimiento({ fecha: '2026-09-01', monto: 30, tipo: 'C' })).toMatchObject({ signo: 1 });
    });

    it('descarta filas sin fecha válida o sin monto', () => {
        expect(aMovimiento({ fecha: '31/02/2026', debito: 5 })).toBeNull();
        expect(aMovimiento({ fecha: '2026-02-31', debito: 5 })).toBeNull();
        expect(aMovimiento({ fecha: '2026-09-01' })).toBeNull();
    });
});

describe('leerConIa', () => {
    it('parte el texto en tramos', () => {
        expect(partirEnTramos(new Array(150).fill('x'), LINEAS_POR_TRAMO)).toHaveLength(3);
    });

    it('lee un formato desconocido en varios tramos, conserva el orden y la cadena de saldos cierra', async () => {
        const gpt = iaSimulada();
        const r = await leerConIa(gpt, construirLineas(200));
        expect(gpt.llamadas).toBeGreaterThan(1);
        expect(r.formato).toBe('IA');
        expect(r.cuenta).toBe('9988776655');
        expect(r.movimientos).toHaveLength(200);
        expect(r.advertencias[0]).toMatch(/leyó con IA/);
        const saldos = calcularSaldosCadena(r.movimientos);
        expect(saldos.consistente).toBe(true);
        expect(saldos.inicial).toBe(1000);
        expect(r.fechaDesde).toBe('2026-09-01');
        // cronológico ascendente
        expect(r.movimientos[0].fecha <= r.movimientos[199].fecha).toBe(true);
    });

    it('avisa cuando la IA se deja filas (menos movimientos que líneas con fecha)', async () => {
        const gpt: GptJson = {
            async parseTextToJson(_p, texto) {
                const filas = texto.split('\n').filter((l) => /^\d{2}-\d{2}-\d{4}/.test(l));
                return { movimientos: filas.slice(0, Math.ceil(filas.length / 2)).map((l, i) => ({ fecha: '2026-09-01', documento: String(i), debito: 1, saldo: null })) };
            },
        };
        const r = await leerConIa(gpt, construirLineas(40));
        expect(r.advertencias.some((a) => /puede faltar alguno/.test(a))).toBe(true);
    });

    it('descarta e informa las filas inválidas de la IA', async () => {
        const gpt: GptJson = { parseTextToJson: async () => ({ movimientos: [{ fecha: '2026-09-01', debito: 5 }, { fecha: 'mañana', debito: 5 }, { fecha: '2026-09-02' }] }) };
        const r = await leerConIa(gpt, ['a', 'b']);
        expect(r.movimientos).toHaveLength(1);
        expect(r.advertencias.some((a) => /2 fila\(s\)/.test(a))).toBe(true);
    });

    it('falla con texto vacío', async () => {
        await expect(leerConIa({ parseTextToJson: async () => ({}) }, ['  ', ''])).rejects.toThrow(/no tiene texto/);
    });
});
