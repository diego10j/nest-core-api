/**
 * Presentación de datos del ERP en el chat web: convierte el resultado de una herramienta en bloques
 * visuales (tabla / indicadores) que el chat dibuja con formato. Las cifras vienen tal cual de la
 * herramienta (la IA no las copia) y la IA solo escribe una conclusión breve.
 * Telegram no usa bloques: allí la IA escribe todo en texto.
 */

export type FormatoDato = 'texto' | 'numero' | 'cantidad' | 'moneda' | 'precio' | 'fecha' | 'porcentaje' | 'si_no' | 'dias';

export interface ColumnaTabla {
  clave: string;
  etiqueta: string;
  formato?: FormatoDato;
}

export interface TablaChat {
  tipo: 'tabla';
  titulo: string;
  subtitulo?: string | null;
  columnas: ColumnaTabla[];
  filas: Record<string, unknown>[];
  /** Fila de totales (mismas claves que las columnas). */
  total?: Record<string, unknown> | null;
  /** Telegram: se envía como imagen (tablas anchas que en texto no se leen en el celular). */
  imagen?: boolean;
}

export interface IndicadorChat {
  etiqueta: string;
  valor: unknown;
  formato?: FormatoDato;
  /** Unidad para cantidades ("kg"). */
  unidad?: string | null;
  color?: 'success' | 'warning' | 'error' | 'info' | null;
  destacado?: boolean;
}

export interface IndicadoresChat {
  tipo: 'indicadores';
  titulo: string;
  items: IndicadorChat[];
}

/** Gráfico de barras o líneas (chat del ERP: componente de gráficos; Telegram: imagen PNG). */
export interface GraficoChat {
  tipo: 'grafico';
  titulo: string;
  subtitulo?: string | null;
  clase: 'barras' | 'lineas';
  categorias: string[];
  series: { nombre: string; datos: (number | null)[] }[];
  /** Formato de los valores del eje Y y etiquetas. */
  formato?: FormatoDato;
  /** Muestra el valor sobre cada barra/punto (también con varias series). */
  valores?: boolean;
}

export type BloqueChat = TablaChat | IndicadoresChat | GraficoChat;

type Dato = Record<string, any>;

const tabla = (
  titulo: string,
  columnas: ColumnaTabla[],
  filas: Dato[] | undefined,
  extra: Partial<TablaChat> = {},
): TablaChat | null => (filas?.length ? { tipo: 'tabla', titulo, columnas, filas, ...extra } : null);

const indicadores = (titulo: string, items: (IndicadorChat | null | false)[]): IndicadoresChat | null => {
  const validos = items.filter((i): i is IndicadorChat => !!i && i.valor !== null && i.valor !== undefined && i.valor !== '');
  return validos.length ? { tipo: 'indicadores', titulo, items: validos } : null;
};

const sumar = (filas: Dato[], clave: string) => filas.reduce((a, f) => a + (Number(f[clave]) || 0), 0);

/** Bloques visuales para el resultado de una herramienta (vacío si no aplica). */
export function bloquesDe(herramienta: string, d: Dato): BloqueChat[] {
  if (!d || d.error) return [];
  const b: (BloqueChat | null)[] = [];

  switch (herramienta) {
    case 'consultar_stock':
      b.push(
        indicadores(`Stock · ${d.producto}`, [
          { etiqueta: 'Stock total', valor: d.stock_total, formato: 'cantidad', unidad: d.unidad, destacado: true,
            color: Number(d.stock_total) > 0 ? 'success' : 'error' },
          { etiqueta: 'Al', valor: d.fecha, formato: 'fecha' },
        ]),
        tabla('Por bodega', [
          { clave: 'bodega', etiqueta: 'Bodega' },
          { clave: 'saldo', etiqueta: 'Saldo', formato: 'cantidad' },
        ], d.por_bodega),
      );
      break;

    case 'consultar_proveedores':
      b.push(
        tabla(`Proveedores · ${d.producto}`, [
          { clave: 'proveedor', etiqueta: 'Proveedor' },
          { clave: 'facturas', etiqueta: 'Facturas', formato: 'numero' },
          { clave: 'ultima_compra', etiqueta: 'Última compra', formato: 'fecha' },
          { clave: 'cantidad_neta', etiqueta: 'Cantidad', formato: 'cantidad' },
          { clave: 'total_neto_usd', etiqueta: 'Total', formato: 'moneda' },
        ], d.proveedores),
      );
      break;

    case 'analizar_compras':
      if (!d.ultimas_compras) break;
      b.push(
        indicadores(`Compras · ${d.producto} (${d.periodo_meses} meses)`, [
          { etiqueta: 'Compras', valor: d.compras, formato: 'numero' },
          { etiqueta: 'Cada', valor: d.dias_promedio_entre_compras, formato: 'dias', destacado: true },
          { etiqueta: 'Última compra', valor: d.ultima_compra, formato: 'fecha' },
          { etiqueta: 'Próxima estimada', valor: d.proxima_compra_estimada, formato: 'fecha', color: 'info' },
          { etiqueta: 'Promedio por compra', valor: d.cantidad_promedio_por_compra, formato: 'cantidad', unidad: d.unidad },
        ]),
        tabla('Últimas compras', [
          { clave: 'fecha', etiqueta: 'Fecha', formato: 'fecha' },
          { clave: 'proveedor', etiqueta: 'Proveedor' },
          { clave: 'cantidad', etiqueta: 'Cantidad', formato: 'cantidad' },
          { clave: 'precio', etiqueta: 'Precio', formato: 'precio' },
        ], d.ultimas_compras),
      );
      break;

    case 'consultar_precios':
      b.push(
        indicadores(`Precios · ${d.producto}`, [
          { etiqueta: 'Costo promedio', valor: d.costo_promedio_compra, formato: 'precio', destacado: true },
          { etiqueta: `Venta promedio (${d.ventas_ultimos_meses} m)`, valor: d.precio_venta_promedio, formato: 'precio', destacado: true },
          { etiqueta: 'Venta mínima', valor: d.precio_venta_minimo, formato: 'precio' },
          { etiqueta: 'Venta máxima', valor: d.precio_venta_maximo, formato: 'precio' },
          { etiqueta: 'Clientes', valor: d.clientes, formato: 'numero' },
          { etiqueta: 'Última venta', valor: d.ultima_venta, formato: 'fecha' },
        ]),
        tabla('Últimos precios de compra', [
          { clave: 'proveedor', etiqueta: 'Proveedor' },
          { clave: 'fecha', etiqueta: 'Fecha', formato: 'fecha' },
          { clave: 'cantidad', etiqueta: 'Cantidad', formato: 'numero' },
          { clave: 'precio', etiqueta: 'Precio', formato: 'precio' },
        ], d.ultimos_precios_compra_por_proveedor),
      );
      break;

    case 'consultar_configuracion_precios':
      b.push(
        tabla(`Configuración de precios · ${d.producto}`, [
          { clave: 'rango', etiqueta: 'Rango' },
          { clave: 'forma_pago', etiqueta: 'Forma de pago' },
          { clave: 'precio_fijo', etiqueta: 'Precio fijo', formato: 'precio' },
          { clave: 'porcentaje_utilidad', etiqueta: 'Utilidad', formato: 'porcentaje' },
          { clave: 'incluye_iva', etiqueta: 'Incl. IVA', formato: 'si_no' },
          { clave: 'autorizado', etiqueta: 'Autorizado', formato: 'si_no' },
        ], d.configuraciones),
      );
      break;

    case 'cotizar': {
      const unidad = d.unidad;
      b.push(
        indicadores(`Cotización · ${d.cantidad} ${unidad ?? ''} de ${d.producto}`.replace(/\s+/g, ' '), [
          { etiqueta: 'Cantidad', valor: d.cantidad, formato: 'cantidad', unidad },
          { etiqueta: 'Stock disponible', valor: d.stock_disponible, formato: 'cantidad', unidad,
            color: d.stock_suficiente ? 'success' : 'error' },
          d.precio_promedio_sugerido != null && {
            etiqueta: 'Precio sugerido', valor: d.precio_promedio_sugerido, formato: 'precio', destacado: true },
          d.total_sugerido_sin_iva != null && {
            etiqueta: 'Total sugerido (sin IVA)', valor: d.total_sugerido_sin_iva, formato: 'moneda', destacado: true },
          d.precio_maximo && { etiqueta: `Máximo (${d.precio_maximo.cantidad} ${unidad ?? ''})`, valor: d.precio_maximo.precio_unitario, formato: 'precio' },
          d.precio_minimo && { etiqueta: `Mínimo (${d.precio_minimo.cantidad} ${unidad ?? ''})`, valor: d.precio_minimo.precio_unitario, formato: 'precio' },
          d.costo_ppm_hoy != null && { etiqueta: 'Costo PPM hoy', valor: d.costo_ppm_hoy, formato: 'precio' },
        ]),
        tabla('Precio según forma de pago', [
          { clave: 'forma_pago', etiqueta: 'Forma de pago' },
          { clave: 'precio_unitario_sin_iva', etiqueta: 'P. unit. sin IVA', formato: 'precio' },
          { clave: 'precio_unitario_con_iva', etiqueta: 'P. unit. con IVA', formato: 'precio' },
          { clave: 'total_sin_iva', etiqueta: 'Total sin IVA', formato: 'moneda' },
          { clave: 'total_con_iva', etiqueta: 'Total con IVA', formato: 'moneda' },
        ], d.precios?.filter((p: Dato) => p.precio_unitario_sin_iva != null)),
        tabla('Ventas en cantidades similares (sin configuración de precios)', [
          { clave: 'fecha', etiqueta: 'Fecha', formato: 'fecha' },
          { clave: 'cliente', etiqueta: 'Cliente' },
          { clave: 'cantidad', etiqueta: 'Cantidad', formato: 'cantidad' },
          { clave: 'precio_unitario', etiqueta: 'P. unitario', formato: 'precio' },
          { clave: 'costo_ppm_fecha', etiqueta: 'Costo PPM', formato: 'precio' },
        ], d.ventas_similares),
      );
      break;
    }

    case 'mejores_clientes':
      b.push(
        tabla(`Mejores clientes · ${d.producto}`, [
          { clave: 'cliente', etiqueta: 'Cliente' },
          { clave: 'facturas', etiqueta: 'Facturas', formato: 'numero' },
          { clave: 'ventas_netas_usd', etiqueta: 'Ventas netas', formato: 'moneda' },
          { clave: 'porcentaje', etiqueta: '%', formato: 'porcentaje' },
        ], d.clientes, { subtitulo: d.periodo }),
      );
      break;

    case 'deuda_cliente':
      b.push(
        indicadores('Cartera del cliente', [
          { etiqueta: 'Saldo pendiente', valor: d.saldo_pendiente, formato: 'moneda', destacado: true,
            color: Number(d.saldo_pendiente) > 0 ? 'warning' : 'success' },
          { etiqueta: 'Vencido', valor: d.monto_vencido, formato: 'moneda', color: Number(d.monto_vencido) > 0 ? 'error' : null },
          { etiqueta: 'Facturas por pagar', valor: d.facturas_por_pagar, formato: 'numero' },
          { etiqueta: 'Facturas vencidas', valor: d.facturas_vencidas, formato: 'numero' },
          { etiqueta: 'Total vendido', valor: d.total_ventas, formato: 'moneda' },
          { etiqueta: 'Última venta', valor: d.ultima_venta, formato: 'fecha' },
        ]),
      );
      break;

    case 'deuda_proveedor': {
      b.push(
        indicadores('Cuentas por pagar al proveedor', [
          { etiqueta: 'Le debemos', valor: d.saldo_total, formato: 'moneda', destacado: true,
            color: Number(d.saldo_total) > 0 ? 'warning' : 'success' },
          { etiqueta: 'Vencido', valor: d.total_vencido, formato: 'moneda', color: Number(d.total_vencido) > 0 ? 'error' : null },
          { etiqueta: 'Facturas pendientes', valor: d.documentos_pendientes, formato: 'numero' },
          { etiqueta: 'Facturas vencidas', valor: d.documentos_vencidos, formato: 'numero' },
        ]),
      );
      const filas = d.pendientes as Dato[] | undefined;
      b.push(
        tabla('Facturas pendientes (más urgentes primero)', [
          { clave: 'factura', etiqueta: 'Factura' },
          { clave: 'fecha', etiqueta: 'Fecha', formato: 'fecha' },
          { clave: 'vence', etiqueta: 'Vence', formato: 'fecha' },
          { clave: 'dias_vencido', etiqueta: 'Días venc.', formato: 'numero' },
          { clave: 'total', etiqueta: 'Total', formato: 'moneda' },
          { clave: 'saldo', etiqueta: 'Saldo', formato: 'moneda' },
        ], filas, filas?.length ? { total: { factura: 'Total', total: sumar(filas, 'total'), saldo: sumar(filas, 'saldo') } } : {}),
      );
      break;
    }

    case 'compras_proveedor':
      if (d.compras) {
        b.push(
          indicadores(`Compras de ${d.producto} al proveedor (${d.periodo_meses} meses)`, [
            { etiqueta: 'Veces comprado', valor: d.veces_comprado, formato: 'numero' },
            { etiqueta: 'Último precio', valor: d.ultimo_precio, formato: 'precio', destacado: true },
            { etiqueta: 'Mínimo', valor: d.precio_minimo, formato: 'precio' },
            { etiqueta: 'Máximo', valor: d.precio_maximo, formato: 'precio' },
            { etiqueta: 'Promedio', valor: d.precio_promedio, formato: 'precio' },
          ]),
          tabla('Detalle de compras', [
            { clave: 'fecha', etiqueta: 'Fecha', formato: 'fecha' },
            { clave: 'factura', etiqueta: 'Factura' },
            { clave: 'cantidad', etiqueta: 'Cantidad', formato: 'cantidad' },
            { clave: 'precio', etiqueta: 'Precio', formato: 'precio' },
            { clave: 'total', etiqueta: 'Total', formato: 'moneda' },
          ], d.compras),
        );
      } else if (d.productos_comprados) {
        b.push(
          indicadores(`Compras al proveedor (${d.periodo_meses} meses)`, [
            { etiqueta: 'Facturas', valor: d.facturas, formato: 'numero' },
            { etiqueta: 'Le compramos cada', valor: d.dias_promedio_entre_compras, formato: 'dias', destacado: true },
            { etiqueta: 'Última compra', valor: d.ultima_compra, formato: 'fecha' },
            { etiqueta: 'Próxima estimada', valor: d.proxima_compra_estimada, formato: 'fecha', color: 'info' },
            { etiqueta: 'Total comprado', valor: d.total_comprado_usd, formato: 'moneda' },
          ]),
          tabla('Productos que le compramos', [
            { clave: 'producto', etiqueta: 'Producto' },
            { clave: 'veces', etiqueta: 'Veces', formato: 'numero' },
            { clave: 'cantidad', etiqueta: 'Cantidad', formato: 'cantidad' },
            { clave: 'unidad', etiqueta: 'Unidad' },
            { clave: 'ultimo_precio', etiqueta: 'Último precio', formato: 'precio' },
            { clave: 'ultima_compra', etiqueta: 'Última compra', formato: 'fecha' },
            { clave: 'total_usd', etiqueta: 'Total', formato: 'moneda' },
          ], d.productos_comprados),
        );
      }
      break;

    case 'pagos_por_vencer': {
      const filas = d.pagos as Dato[] | undefined;
      b.push(
        indicadores(String(d.criterio ?? 'Pagos a proveedores'), [
          { etiqueta: 'Total a pagar', valor: d.total, formato: 'moneda', destacado: true, color: Number(d.total) > 0 ? 'warning' : 'success' },
          { etiqueta: 'Documentos', valor: d.cantidad, formato: 'numero' },
        ]),
        tabla('Detalle', [
          { clave: 'proveedor', etiqueta: 'Proveedor' },
          { clave: 'factura', etiqueta: 'Factura' },
          { clave: 'vence', etiqueta: 'Vence', formato: 'fecha' },
          { clave: 'dias_vencido', etiqueta: 'Días venc.', formato: 'numero' },
          { clave: 'total_factura', etiqueta: 'Total factura', formato: 'moneda' },
          { clave: 'saldo', etiqueta: 'Saldo', formato: 'moneda' },
        ], filas, filas?.length ? { total: { proveedor: 'Total', saldo: d.total } } : {}),
      );
      break;
    }

    case 'ventas_producto': {
      const unidad = d.unidad ? ` (${d.unidad})` : '';
      const m = d.mes_consultado as Dato | undefined;
      b.push(
        indicadores(`Ventas de ${d.producto} · ${d.anio}`, [
          m && { etiqueta: `Cantidad ${m.nombre ?? `mes ${m.mes}`}${unidad}`, valor: m.cantidad, formato: 'cantidad', destacado: true },
          m && { etiqueta: `Ventas netas ${m.nombre ?? `mes ${m.mes}`}`, valor: m.ventas_netas, formato: 'moneda', destacado: true },
          { etiqueta: `Cantidad del año${unidad}`, valor: d.total_anio?.cantidad, formato: 'cantidad' },
          { etiqueta: 'Ventas netas del año', valor: d.total_anio?.ventas_netas, formato: 'moneda' },
          { etiqueta: 'Facturas del año', valor: d.total_anio?.facturas, formato: 'numero' },
        ]),
      );
      const filas = d.meses as Dato[] | undefined;
      b.push(
        tabla(`Por mes · ${d.anio}`, [
          { clave: 'nombre', etiqueta: 'Mes' },
          { clave: 'facturas', etiqueta: 'Facturas', formato: 'numero' },
          { clave: 'cantidad', etiqueta: `Cantidad${unidad}`, formato: 'cantidad' },
          { clave: 'ventas_netas', etiqueta: 'Ventas netas', formato: 'moneda' },
        ], filas, filas?.length
          ? { total: { nombre: 'Total', facturas: sumar(filas, 'facturas'), cantidad: sumar(filas, 'cantidad'), ventas_netas: sumar(filas, 'ventas_netas') } }
          : {}),
      );
      break;
    }

    case 'compras_cliente':
      if (d.ventas) {
        b.push(
          indicadores(`Ventas de ${d.producto} al cliente (${d.periodo_meses} meses)`, [
            { etiqueta: 'Veces vendido', valor: d.veces_vendido, formato: 'numero' },
            { etiqueta: 'Último precio', valor: d.ultimo_precio, formato: 'precio', destacado: true },
            { etiqueta: 'Mínimo', valor: d.precio_minimo, formato: 'precio' },
            { etiqueta: 'Máximo', valor: d.precio_maximo, formato: 'precio' },
            { etiqueta: 'Promedio', valor: d.precio_promedio, formato: 'precio' },
          ]),
          tabla('Detalle de ventas', [
            { clave: 'fecha', etiqueta: 'Fecha', formato: 'fecha' },
            { clave: 'factura', etiqueta: 'Factura' },
            { clave: 'cantidad', etiqueta: 'Cantidad', formato: 'cantidad' },
            { clave: 'precio', etiqueta: 'Precio', formato: 'precio' },
            { clave: 'total_neto', etiqueta: 'Total', formato: 'moneda' },
          ], d.ventas),
        );
      } else if (d.productos_mas_comprados) {
        b.push(
          indicadores(`Compras del cliente (${d.periodo_meses} meses)`, [
            { etiqueta: 'Facturas', valor: d.facturas, formato: 'numero' },
            { etiqueta: 'Compra cada', valor: d.dias_promedio_entre_compras, formato: 'dias', destacado: true },
            { etiqueta: 'Última compra', valor: d.ultima_compra, formato: 'fecha' },
            { etiqueta: 'Próxima estimada', valor: d.proxima_compra_estimada, formato: 'fecha', color: 'info' },
            { etiqueta: 'Total comprado', valor: d.total_comprado_usd, formato: 'moneda' },
          ]),
          tabla('Productos que compra', [
            { clave: 'producto', etiqueta: 'Producto' },
            { clave: 'veces', etiqueta: 'Veces', formato: 'numero' },
            { clave: 'cantidad', etiqueta: 'Cantidad', formato: 'cantidad' },
            { clave: 'ultimo_precio', etiqueta: 'Último precio', formato: 'precio' },
            { clave: 'ultima_compra', etiqueta: 'Última compra', formato: 'fecha' },
            { clave: 'total_usd', etiqueta: 'Total', formato: 'moneda' },
          ], d.productos_mas_comprados),
        );
      }
      break;

    case 'envios_cliente': {
      b.push(
        tabla('Transportes usados', [
          { clave: 'transporte', etiqueta: 'Transporte' },
          { clave: 'envios', etiqueta: 'Envíos', formato: 'numero' },
          { clave: 'ultimo_envio', etiqueta: 'Último', formato: 'fecha' },
          { clave: 'flete_cobrado', etiqueta: 'Flete cobrado', formato: 'moneda' },
          { clave: 'costo_real', etiqueta: 'Costo real', formato: 'moneda' },
        ], d.transportes_usados),
      );
      const filas = d.ultimos_envios as Dato[] | undefined;
      b.push(
        tabla('Últimos envíos', [
          { clave: 'fecha', etiqueta: 'Fecha', formato: 'fecha' },
          { clave: 'factura', etiqueta: 'Factura' },
          { clave: 'transporte', etiqueta: 'Transporte' },
          { clave: 'enviado', etiqueta: 'Peso' },
          { clave: 'valor_facturado', etiqueta: 'Facturado', formato: 'moneda' },
          { clave: 'flete_cobrado', etiqueta: 'Flete cobrado', formato: 'moneda' },
          { clave: 'costo_real', etiqueta: 'Costo real', formato: 'moneda' },
          { clave: 'estado', etiqueta: 'Estado' },
        ], filas, filas?.length
          ? {
              total: {
                fecha: 'Total',
                valor_facturado: sumar(filas, 'valor_facturado'),
                flete_cobrado: sumar(filas, 'flete_cobrado'),
                costo_real: sumar(filas, 'costo_real'),
              },
            }
          : {}),
      );
      break;
    }

    case 'transportes_destino':
    case 'costo_envio': {
      if (herramienta === 'costo_envio') {
        const a = d.analisis as Dato | null;
        b.push(
          indicadores(`Transporte a ${d.destino}${d.peso ? ` · ${d.peso}` : ''}`, [
            { etiqueta: 'Envíos encontrados', valor: d.envios_encontrados, formato: 'numero' },
            a?.sugerenciaPrecio != null && { etiqueta: 'Precio sugerido', valor: a.sugerenciaPrecio, formato: 'moneda', destacado: true },
            a?.confianza && { etiqueta: 'Confianza', valor: String(a.confianza).toUpperCase(), color: a.confianza === 'alta' ? 'success' : a.confianza === 'media' ? 'warning' : null },
          ]),
          tabla('Costo por transportista', [
            { clave: 'transporte', etiqueta: 'Transporte' },
            { clave: 'envios', etiqueta: 'Envíos', formato: 'numero' },
            { clave: 'costo_promedio', etiqueta: 'Promedio', formato: 'moneda' },
            { clave: 'costo_minimo', etiqueta: 'Mínimo', formato: 'moneda' },
            { clave: 'costo_maximo', etiqueta: 'Máximo', formato: 'moneda' },
          ], d.por_transportista, { subtitulo: d.criterio ?? null }),
          tabla('Envíos recientes', [
            { clave: 'fecha', etiqueta: 'Fecha', formato: 'fecha' },
            { clave: 'transporte', etiqueta: 'Transporte' },
            { clave: 'ciudad', etiqueta: 'Ciudad' },
            { clave: 'enviado', etiqueta: 'Enviado' },
            { clave: 'costo', etiqueta: 'Costo', formato: 'moneda' },
            { clave: 'tipo_costo', etiqueta: 'Tipo' },
          ], d.ultimos_envios),
        );
      }
      const transportes = (d.transportes ?? d.tarifas_configuradas ?? []) as Dato[];
      const filas = transportes.flatMap((t) =>
        (t.tarifas?.length ? t.tarifas : [{}]).flatMap((tf: Dato) =>
          (tf.opciones?.length ? tf.opciones : [{}]).map((o: Dato) => ({
            transporte: t.transporte,
            destino: [tf.ciudad, tf.canton, tf.provincia].filter(Boolean).join(' · ') || (t.cobertura_nacional ? 'Cobertura nacional' : null),
            tarifa: o.nombre ?? null,
            precio: o.precio ?? null,
            envios: t.envios_realizados,
          })),
        ),
      );
      b.push(
        tabla(herramienta === 'costo_envio' ? 'Tarifas configuradas' : `Transportes a ${d.destino}`, [
          { clave: 'transporte', etiqueta: 'Transporte' },
          { clave: 'destino', etiqueta: 'Destino' },
          { clave: 'tarifa', etiqueta: 'Tarifa' },
          { clave: 'precio', etiqueta: 'Precio', formato: 'moneda' },
          { clave: 'envios', etiqueta: 'Envíos', formato: 'numero' },
        ], filas),
      );
      break;
    }

    default:
      break;
  }
  return b.filter((x): x is BloqueChat => !!x);
}

/**
 * Aviso para la IA cuando los datos ya se muestran como tabla/indicadores en el chat del ERP: que no
 * los repita y solo escriba la conclusión.
 */
export const AVISO_EN_PANTALLA =
  'Estos datos YA se muestran al usuario como tabla/indicadores con formato: NO los repitas ni armes tablas. ' +
  'Responde en 1-3 frases con la conclusión o lo importante (ej. si alcanza el stock, tendencia de precio).';

/** Preguntas de seguimiento sugeridas según lo que se consultó (chat del ERP). */
export function sugerenciasSeguimiento(herramientas: string[], producto: string | null): string[] {
  const p = producto ? ` de ${producto}` : '';
  const mapa: Record<string, string[]> = {
    consultar_stock: [`¿A qué precio cotizo 25 kg${p}?`, `¿Cada cuánto compramos${p}?`],
    cotizar: [`¿Cuánto stock hay${p}?`, `¿Quiénes son los mejores clientes${p}?`],
    analizar_compras: [`¿Quiénes son los proveedores${p}?`, `¿Cuál es el costo promedio${p}?`],
    consultar_proveedores: [`Últimas compras${p}`, `¿Cuál es el costo promedio${p}?`],
    consultar_precios: [`¿Tiene configuración de precios${p ? p.replace(' de ', ' ') : ''}?`, `¿A qué precio cotizo 25 kg${p}?`],
    consultar_base_tecnica: [`Dame la ficha técnica${p}`, `Últimos 3 COA${p}`],
    listar_documentos: [`¿Cuál es la pureza${p}?`, `Presentación${p}`],
    mejores_clientes: [`¿Cuánto stock hay${p}?`],
    deuda_cliente: ['¿Cada cuánto compra este cliente?', '¿Qué envíos se le han hecho?'],
    compras_cliente: ['¿Cuánto debe este cliente?', '¿Dónde está ubicado?'],
    datos_cliente: ['¿Cuánto debe?', '¿Cada cuánto compra?'],
    transportes_destino: ['¿Cuánto cuesta enviar 10 kg?'],
    costo_envio: ['¿Y con 20 kg?', '¿Qué transportes llegan ahí?'],
  };
  const vistas = new Set<string>();
  const salida: string[] = [];
  for (const h of [...herramientas].reverse()) {
    for (const s of mapa[h] ?? []) {
      if (!vistas.has(s)) {
        vistas.add(s);
        salida.push(s);
      }
    }
  }
  return salida.slice(0, 3);
}
