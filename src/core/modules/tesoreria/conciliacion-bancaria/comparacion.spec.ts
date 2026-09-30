import { CmpBanco, CmpErp, CmpMatch, construirComparacion, EntradaComparacion } from './comparacion';

const banco = (id: number, fecha: string, valor: number, extra: Partial<CmpBanco> = {}): CmpBanco => ({
    ide_tecmv: id, fecha, documento: `D${id}`, descripcion: 'Transferencia', referencia: '', valor, saldo: null, estado: 'PENDIENTE', nota: null, ...extra,
});
const erp = (id: number, fecha: string, valor: number, extra: Partial<CmpErp> = {}): CmpErp => ({
    ide_teclb: id, fecha, numero: `N${id}`, comprobante: null, beneficiario: 'X', observacion: null, valor, tipo: 'TRANSFERENCIA',
    conciliado_legado: false, en_periodo: true, ...extra,
});
const cruce = (grupo: number, mv: number, lb: number, extra: Partial<CmpMatch> = {}): CmpMatch => ({
    ide_tecmv: mv, ide_teclb: lb, grupo, tipo: 'AUTO', regla: 'MONTO_FECHA', confianza: 95, observacion: null, ...extra,
});
const entrada = (parcial: Partial<EntradaComparacion>): EntradaComparacion => ({
    desde: '2026-08-01', hasta: '2026-08-31', toleranciaDias: 3, saldoInicialBanco: 100, saldoInicialErp: 100,
    banco: [], erp: [], matches: [], saltosBanco: new Set(), ...parcial,
});
const codigos = (b: { alertas: { codigo: string }[] }) => b.alertas.map((a) => a.codigo);

describe('construirComparacion', () => {
    it('un cruce limpio es OK y va en una sola banda', () => {
        const r = construirComparacion(entrada({
            banco: [banco(1, '2026-08-05', 50)], erp: [erp(10, '2026-08-05', 50)], matches: [cruce(1, 1, 10, { confianza: 100, regla: 'DOCUMENTO' })],
        }));
        expect(r.bloques).toHaveLength(1);
        expect(r.bloques[0]).toMatchObject({ tipo: 'CRUCE', severidad: 'OK', diferencia: 0 });
        expect(r.bloques[0].banco).toHaveLength(1);
        expect(r.bloques[0].erp).toHaveLength(1);
    });

    it('lo que solo está en un lado es rojo con su etiqueta', () => {
        const r = construirComparacion(entrada({ banco: [banco(1, '2026-08-05', 50)], erp: [erp(10, '2026-08-06', -20)] }));
        const soloBanco = r.bloques.find((b) => b.tipo === 'SOLO_BANCO')!;
        const soloErp = r.bloques.find((b) => b.tipo === 'SOLO_ERP')!;
        expect(soloBanco.severidad).toBe('ROJO');
        expect(codigos(soloBanco)).toContain('BANCO_SIN_ERP');
        expect(soloErp.severidad).toBe('ROJO');
        expect(codigos(soloErp)).toContain('ERP_SIN_BANCO');
        expect(r.contadores).toMatchObject({ rojos: 2, soloBanco: 1, soloErp: 1 });
    });

    it('ignorado es gris y no cuenta como rojo', () => {
        const r = construirComparacion(entrada({ banco: [banco(1, '2026-08-05', 50, { estado: 'IGNORADO', nota: 'comisión' })] }));
        expect(r.bloques[0].severidad).toBe('GRIS');
        expect(r.contadores).toMatchObject({ rojos: 0, ignorados: 1, soloBanco: 0 });
    });

    it('marca diferencia de monto, fechas distantes, otro mes e IA en amarillo', () => {
        const r = construirComparacion(entrada({
            banco: [banco(1, '2026-09-01', 133.5)], erp: [erp(10, '2026-08-29', 133)],
            matches: [cruce(1, 1, 10, { tipo: 'IA', regla: 'IA', confianza: 80, observacion: 'mismo cliente' })],
        }));
        const b = r.bloques[0];
        expect(b.severidad).toBe('AMARILLO');
        expect(codigos(b)).toEqual(expect.arrayContaining(['DIFERENCIA', 'FECHAS', 'OTRO_MES', 'IA']));
        expect(b.diferencia).toBeCloseTo(0.5);
        expect(b.alertas.find((a) => a.codigo === 'DIFERENCIA')!.texto).toContain('mismo cliente');
    });

    it('marca cruce ambiguo, baja confianza y signo distinto', () => {
        const r = construirComparacion(entrada({
            banco: [banco(1, '2026-08-05', 50), banco(2, '2026-08-06', 30)], erp: [erp(10, '2026-08-05', 50), erp(11, '2026-08-06', -30)],
            matches: [cruce(1, 1, 10, { regla: 'MONTO_FECHA_AMBIGUO', confianza: 65 }), cruce(2, 2, 11, { confianza: 60 })],
        }));
        expect(codigos(r.bloques[0])).toContain('AMBIGUO');
        expect(codigos(r.bloques[1])).toEqual(expect.arrayContaining(['BAJA_CONFIANZA', 'SIGNO']));
    });

    it('un cruce manual con confianza nula no se marca de baja confianza', () => {
        const r = construirComparacion(entrada({
            banco: [banco(1, '2026-08-05', 50)], erp: [erp(10, '2026-08-05', 50)], matches: [cruce(1, 1, 10, { tipo: 'MANUAL', regla: null, confianza: null })],
        }));
        expect(r.bloques[0].severidad).toBe('OK');
    });

    it('agrupa un cruce N:M en una sola banda', () => {
        const r = construirComparacion(entrada({
            banco: [banco(1, '2026-08-05', 300)], erp: [erp(10, '2026-08-05', 100), erp(11, '2026-08-05', 200)],
            matches: [cruce(7, 1, 10, { regla: 'SUMA', confianza: 60 }), cruce(7, 1, 11, { regla: 'SUMA', confianza: 60 })],
        }));
        expect(r.bloques).toHaveLength(1);
        expect(r.bloques[0].erp).toHaveLength(2);
        expect(codigos(r.bloques[0])).toContain('SUMA');
        expect(r.bloques[0].diferencia).toBe(0);
    });

    it('detecta posibles duplicados y el conciliado del flujo antiguo sin cruce', () => {
        const r = construirComparacion(entrada({
            banco: [banco(1, '2026-08-05', 50, { documento: 'D1' }), banco(2, '2026-08-05', 50, { documento: 'D1' })],
            erp: [erp(10, '2026-08-07', 20, { conciliado_legado: true })],
        }));
        expect(r.bloques.filter((b) => b.tipo === 'SOLO_BANCO').every((b) => codigos(b).includes('DUPLICADO'))).toBe(true);
        expect(codigos(r.bloques.find((b) => b.tipo === 'SOLO_ERP')!)).toContain('LEGADO');
    });

    it('en el banco, mismo monto y fecha con distinta referencia NO es repetido (comisiones por transferencia)', () => {
        const r = construirComparacion(entrada({
            banco: [
                banco(1, '2026-06-16', -0.36, { documento: '0001590830', descripcion: '16642068-COSTO OPER CASH' }),
                banco(2, '2026-06-16', -0.36, { documento: '0001590401', descripcion: '16642088-COSTO OPER CASH' }),
                banco(3, '2026-06-16', -0.05, { documento: '0001590884' }), banco(4, '2026-06-16', -0.05, { documento: '0001591013' }),
            ],
            desde: '2026-06-01', hasta: '2026-06-30',
        }));
        expect(r.bloques.some((b) => codigos(b).includes('DUPLICADO'))).toBe(false);
    });

    it('un movimiento del ERP de otro mes sin cruce no es faltante: solo se cuenta', () => {
        const r = construirComparacion(entrada({ erp: [erp(10, '2026-09-02', 20, { en_periodo: false })] }));
        expect(r.bloques).toHaveLength(0);
        expect(r.contadores.erpFueraDeMesSinCruce).toBe(1);
    });

    it('marca el salto de saldo del banco', () => {
        const r = construirComparacion(entrada({
            banco: [banco(1, '2026-08-05', 50)], erp: [erp(10, '2026-08-05', 50)], matches: [cruce(1, 1, 10)], saltosBanco: new Set([1]),
        }));
        expect(codigos(r.bloques[0])).toContain('SALTO_SALDO');
    });

    it('la diferencia acumulada cambia solo donde hay desbalance', () => {
        const r = construirComparacion(entrada({
            banco: [banco(1, '2026-08-05', 50), banco(2, '2026-08-10', 25)],
            erp: [erp(10, '2026-08-05', 50), erp(11, '2026-08-12', -10)],
            matches: [cruce(1, 1, 10)],
        }));
        // cruce (05/08): sin cambio; solo banco (10/08): +25; solo ERP (12/08): +10 más
        expect(r.bloques.map((b) => b.diferenciaAcumulada)).toEqual([0, 25, 35]);
        expect(r.saldos.arrastre).toBe(0);
    });

    it('sin saldos del banco no calcula la diferencia acumulada', () => {
        const r = construirComparacion(entrada({ saldoInicialBanco: null, banco: [banco(1, '2026-08-05', 50)] }));
        expect(r.bloques[0].diferenciaAcumulada).toBeNull();
        expect(r.saldos.arrastre).toBeNull();
    });

    it('ordena por fecha y pone los cruces antes de lo sin cruzar', () => {
        const r = construirComparacion(entrada({
            banco: [banco(2, '2026-08-05', 10), banco(1, '2026-08-05', 50)], erp: [erp(10, '2026-08-05', 50)], matches: [cruce(1, 1, 10)],
        }));
        expect(r.bloques.map((b) => b.tipo)).toEqual(['CRUCE', 'SOLO_BANCO']);
    });
});
