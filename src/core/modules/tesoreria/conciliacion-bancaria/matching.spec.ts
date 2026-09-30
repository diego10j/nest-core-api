import { emparejarUnoAUno, sugerirPorSuma } from './matching';
import type { MovimientoBanco } from './parsers/estado-cuenta.types';
import { calcularSaldosCadena } from './parsers/parser-util';

const banco = (id: number, fecha: string, centavos: number, documento = '') => ({ id, fecha, documento, centavos });
const erp = (id: number, fecha: string, centavos: number, numero = '', comprobante = '') => ({ id, fecha, numero, comprobante, centavos });

describe('emparejarUnoAUno', () => {
    it('empareja montos repetidos por cercanía de fecha y los marca ambiguos', () => {
        const r = emparejarUnoAUno(
            [banco(1, '2026-08-27', -35000), banco(2, '2026-08-28', -35000)],
            [erp(10, '2026-08-28', -35000), erp(11, '2026-08-27', -35000)],
            3,
        );
        expect(r).toHaveLength(2);
        expect(r.find((x) => x.idsBanco[0] === 1)?.idsErp[0]).toBe(11);
        expect(r.find((x) => x.idsBanco[0] === 2)?.idsErp[0]).toBe(10);
        expect(r.every((x) => x.regla === 'MONTO_FECHA_AMBIGUO')).toBe(true);
    });

    it('cruza por documento ignorando ceros a la izquierda', () => {
        const r = emparejarUnoAUno([banco(1, '2026-08-31', -35650, '0181891497')], [erp(10, '2026-09-02', -35650, '181891497')], 3);
        expect(r).toEqual([{ idsBanco: [1], idsErp: [10], regla: 'DOCUMENTO', confianza: 100 }]);
    });

    it('no cruza fuera de la tolerancia ni con signo distinto', () => {
        expect(emparejarUnoAUno([banco(1, '2026-08-01', 1000)], [erp(1, '2026-08-10', 1000)], 3)).toHaveLength(0);
        expect(emparejarUnoAUno([banco(1, '2026-08-01', 1000)], [erp(1, '2026-08-01', -1000)], 3)).toHaveLength(0);
    });
});

describe('sugerirPorSuma', () => {
    it('encuentra un movimiento del banco que es la suma de varios del ERP', () => {
        const r = sugerirPorSuma(
            [banco(1, '2026-08-05', 30000)],
            [erp(1, '2026-08-05', 10000), erp(2, '2026-08-04', 12000), erp(3, '2026-08-06', 8000), erp(4, '2026-08-05', 5000)],
            3,
        );
        expect(r).toHaveLength(1);
        expect(r[0].idsBanco).toEqual([1]);
        expect([...r[0].idsErp].sort()).toEqual([1, 2, 3]);
    });
});

describe('calcularSaldosCadena', () => {
    const mov = (fecha: string, monto: number, signo: 1 | -1, saldo: number): MovimientoBanco => ({
        fecha, documento: '', descripcion: '', referencia: '', oficina: '', monto, signo, saldo,
    });

    it('saca saldo inicial y final sin depender del orden dentro del día', () => {
        // saldo inicial 100 -> +50 = 150 -> -30 = 120 -> +10 = 130 (listados desordenados a propósito)
        const r = calcularSaldosCadena([mov('2026-08-01', 30, -1, 120), mov('2026-08-01', 50, 1, 150), mov('2026-08-02', 10, 1, 130)]);
        expect(r).toEqual({ inicial: 100, final: 130, consistente: true });
    });

    it('marca inconsistente una cadena con un salto', () => {
        const r = calcularSaldosCadena([mov('2026-08-01', 50, 1, 150), mov('2026-08-02', 10, 1, 175)]);
        expect(r.consistente).toBe(false);
    });

    it('devuelve nulls si el banco no informa saldo por movimiento', () => {
        expect(calcularSaldosCadena([{ ...mov('2026-08-01', 5, 1, 0), saldo: null }])).toEqual({ inicial: null, final: null, consistente: false });
    });
});
