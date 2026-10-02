export interface DetalleParaTotales {
  cantidad_cpdfa?: number | string | null;
  precio_cpdfa?: number | string | null;
  iva_inarti_cpdfa?: string | null;
}

/**
 * Calcula bases, IVA y total. El descuento reduce tanto la base gravada usada para el IVA como el
 * total del documento (a diferencia de calcularTotalDocumento del legacy, que solo lo aplicaba al IVA
 * y dejaba el campo como puramente informativo — un defecto heredado: Descuento/Otros Valores existen
 * para poder cuadrar el total contra la factura real del proveedor, así que sí deben afectar el total).
 *
 * La tarifa se acepta como fracción (0.15) o como porcentaje (15): el front de Liquidación de Compra
 * manda el porcentaje y el de Documentos CxP la fracción. Sin esta normalización 500 de base daban
 * 7500 de IVA y el SRI rechazaba la liquidación (ERROR 52).
 */
export function calcularTotalesCxP(detalles: DetalleParaTotales[], tarifaIva: number, descuento: number, otros: number) {
  let baseGrabada = 0;
  let baseTarifa0 = 0;
  let baseNoObjeto = 0;

  for (const det of detalles) {
    const valor = (Number(det.cantidad_cpdfa) || 0) * (Number(det.precio_cpdfa) || 0);
    switch (det.iva_inarti_cpdfa) {
      case '1':
        baseGrabada += valor;
        break;
      case '-1':
        baseTarifa0 += valor;
        break;
      case '0':
        baseNoObjeto += valor;
        break;
    }
  }

  const tasaIva = tarifaIva > 1 ? tarifaIva / 100 : tarifaIva;
  const valorIva = Number(((baseGrabada - descuento) * tasaIva).toFixed(2));
  const total = Number((baseGrabada - descuento + baseNoObjeto + baseTarifa0 + valorIva + otros).toFixed(2));

  return {
    base_grabada: Number(baseGrabada.toFixed(2)),
    base_tarifa0: Number(baseTarifa0.toFixed(2)),
    base_no_objeto_iva: Number(baseNoObjeto.toFixed(2)),
    valor_iva: valorIva,
    total,
  };
}
