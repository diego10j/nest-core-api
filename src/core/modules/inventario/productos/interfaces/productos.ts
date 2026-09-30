export interface SaldoProducto {
  ide_inarti: string;
  nombre_inarti: string;
  saldo: number;
  siglas_inuni: string;
  decim_stock_inarti: number;
  detalle_stock: string;
  stock_minimo?: number;
  stock_ideal?: number;
  /** Precio de la última factura de compra (no es el costo promedio). */
  ultimo_precio_compra?: number | null;
  ultima_fecha_compra?: string | null;
  /** Costo promedio ponderado móvil vigente hoy (kardex PPMP, por sucursal). */
  costo_promedio?: number | null;
  fecha_costo_promedio?: string | null;
}
