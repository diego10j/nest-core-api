import { calcularTotalesCxP } from './helpers/calcular-totales-cxp';

const detalle = { cantidad_cpdfa: 1, precio_cpdfa: 500, iva_inarti_cpdfa: '1' };

describe('calcularTotalesCxP - tarifa de IVA', () => {
  it('acepta la tarifa como fracción (0.15)', () => {
    expect(calcularTotalesCxP([detalle], 0.15, 0, 0)).toMatchObject({ valor_iva: 75, total: 575 });
  });

  it('acepta la tarifa como porcentaje (15) sin multiplicar el IVA por 15', () => {
    expect(calcularTotalesCxP([detalle], 15, 0, 0)).toMatchObject({ valor_iva: 75, total: 575 });
  });

  it('tarifa 0 no genera IVA', () => {
    expect(calcularTotalesCxP([detalle], 0, 0, 0)).toMatchObject({ valor_iva: 0, total: 500 });
  });

  it('el descuento reduce la base del IVA y el total; mezcla de bases', () => {
    const r = calcularTotalesCxP(
      [detalle, { cantidad_cpdfa: 2, precio_cpdfa: 10, iva_inarti_cpdfa: '-1' }],
      15,
      100,
      5,
    );
    expect(r).toMatchObject({ base_grabada: 500, base_tarifa0: 20, valor_iva: 60, total: 485 });
  });
});
