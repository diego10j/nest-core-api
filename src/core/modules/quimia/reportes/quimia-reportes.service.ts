import { BadRequestException, Injectable } from '@nestjs/common';

import { VentasBiService } from '../../ventas/data-bi/ventas-bi.service';
import { FacturasService } from '../../ventas/facturas/facturas.service';
import { BloqueChat, GraficoChat, IndicadoresChat, TablaChat } from '../helpers/presentacion.helper';
import { UsuarioQuimia } from '../quimia.types';

export type ClaveReporte =
  | 'RESUMEN_DIARIO'
  | 'VENTAS_ANUALES'
  | 'VENTAS_MENSUALES'
  | 'VENTAS_DIARIAS'
  | 'TOP_CLIENTES'
  | 'TOP_PRODUCTOS';

export interface ParametroReporte {
  clave: string;
  etiqueta: string;
  defecto: number;
  min: number;
  max: number;
}

export interface DefinicionReporte {
  clave: ClaveReporte;
  nombre: string;
  descripcion: string;
  parametros: ParametroReporte[];
  /** Parámetro que recibe el número escrito después del comando (ej. "/ventas_mes 2025"). */
  argumento: string;
}

export interface ResultadoReporte {
  titulo: string;
  bloques: BloqueChat[];
  /** Resumen en texto (Telegram, historial y para que la IA lo comente). */
  texto: string;
}

const anioActual = () => new Date().getFullYear();

/** Catálogo de reportes: los usan la IA (reporte_ventas) y los comandos de Telegram. */
export const CATALOGO_REPORTES: DefinicionReporte[] = [
  {
    clave: 'RESUMEN_DIARIO',
    nombre: 'Resumen diario de ventas',
    descripcion:
      'Resumen del día (mismo dato que Facturas → Resumen diario): ventas, contado/crédito, cobros, utilidad, ventas ' +
      'por hora, formas de pago, top clientes y artículos. De la sucursal del usuario.',
    parametros: [{ clave: 'dias_atras', etiqueta: 'Días atrás (0 = hoy, 1 = ayer)', defecto: 0, min: 0, max: 60 }],
    argumento: 'dias_atras',
  },
  {
    clave: 'VENTAS_ANUALES',
    nombre: 'Ventas anuales',
    descripcion: 'Ventas netas por año, facturas, clientes y devoluciones (mismo dato que Análisis de datos).',
    parametros: [{ clave: 'anios', etiqueta: 'Años a mostrar', defecto: 5, min: 1, max: 15 }],
    argumento: 'anios',
  },
  {
    clave: 'VENTAS_MENSUALES',
    nombre: 'Ventas mensuales',
    descripcion: 'Ventas netas y utilidad por mes de un año.',
    parametros: [{ clave: 'anio', etiqueta: 'Año (0 = año actual)', defecto: 0, min: 0, max: 2100 }],
    argumento: 'anio',
  },
  {
    clave: 'VENTAS_DIARIAS',
    nombre: 'Ventas diarias',
    descripcion: 'Ventas de los últimos días laborables con su variación.',
    parametros: [{ clave: 'dias', etiqueta: 'Días', defecto: 15, min: 3, max: 60 }],
    argumento: 'dias',
  },
  {
    clave: 'TOP_CLIENTES',
    nombre: 'Mejores clientes',
    descripcion: 'Clientes con más ventas netas en el período.',
    parametros: [
      { clave: 'meses', etiqueta: 'Meses hacia atrás', defecto: 12, min: 1, max: 60 },
      { clave: 'limite', etiqueta: 'Cantidad de clientes', defecto: 10, min: 3, max: 30 },
    ],
    argumento: 'meses',
  },
  {
    clave: 'TOP_PRODUCTOS',
    nombre: 'Productos más vendidos',
    descripcion: 'Productos con mayor cantidad vendida en el período.',
    parametros: [
      { clave: 'meses', etiqueta: 'Meses hacia atrás', defecto: 12, min: 1, max: 60 },
      { clave: 'limite', etiqueta: 'Cantidad de productos', defecto: 10, min: 3, max: 30 },
    ],
    argumento: 'meses',
  },
];

const SIN_PAGINAR = { lazy: 'false', schema: 'false' } as const;
const fechaIso = (d: Date) => d.toISOString().slice(0, 10);
const haceMeses = (m: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - m);
  return fechaIso(d);
};
const n = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const usd = (v: number) => `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;
const cifra = (v: number, dec = 0) => new Intl.NumberFormat('en-US', { maximumFractionDigits: dec }).format(v);
const filasDe = (r: any): any[] => (Array.isArray(r) ? r : (r?.rows ?? []));

/**
 * Reportes de ventas para QuimIA y los comandos de Telegram. Reutiliza los servicios de Análisis de
 * datos (VentasBiService): las cifras son las mismas que en los gráficos del ERP.
 */
@Injectable()
export class QuimiaReportesService {
  constructor(
    private readonly ventasBi: VentasBiService,
    private readonly facturas: FacturasService,
  ) {}

  definicion(clave: string): DefinicionReporte | undefined {
    return CATALOGO_REPORTES.find((r) => r.clave === clave);
  }

  /** Parámetros finales: defecto del catálogo ← configurados en el comando ← escritos por el usuario. */
  resolverParametros(clave: string, ...fuentes: (Record<string, unknown> | undefined)[]): Record<string, number> {
    const def = this.definicion(clave);
    if (!def) throw new BadRequestException(`Reporte desconocido: ${clave}`);
    const p: Record<string, number> = {};
    for (const par of def.parametros) {
      let v = par.defecto;
      for (const f of fuentes) {
        const x = f?.[par.clave];
        if (x !== undefined && x !== null && x !== '' && Number.isFinite(Number(x))) v = Number(x);
      }
      p[par.clave] = Math.min(par.max, Math.max(par.min, Math.round(v)));
    }
    return p;
  }

  async ejecutar(clave: string, parametros: Record<string, unknown>, usuario: UsuarioQuimia): Promise<ResultadoReporte> {
    const p = this.resolverParametros(clave, parametros);
    const h = { ideEmpr: usuario.ideEmpr, ideSucu: usuario.ideSucu, ideUsua: usuario.ideUsua, idePerf: usuario.idePerf, login: usuario.login };
    switch (clave as ClaveReporte) {
      case 'RESUMEN_DIARIO': {
        const d = new Date();
        d.setDate(d.getDate() - p.dias_atras);
        // Fecha local (Ecuador) del servidor, no UTC: después de las 19:00 UTC ya sería "mañana".
        const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const r: any = await this.facturas.getResumenDiarioFacturas({ ...h, ...SIN_PAGINAR, fecha } as any);
        return this.resumenDiario(r?.row ?? {}, fecha);
      }
      case 'VENTAS_ANUALES':
        return this.ventasAnuales(filasDe(await this.ventasBi.getResumenVentasPeriodos({ ...h, ...SIN_PAGINAR } as any)), p.anios);
      case 'VENTAS_MENSUALES': {
        const anio = p.anio || anioActual();
        return this.ventasMensuales(filasDe(await this.ventasBi.getTotalVentasPeriodo({ ...h, ...SIN_PAGINAR, periodo: anio } as any)), anio);
      }
      case 'VENTAS_DIARIAS':
        return this.ventasDiarias(filasDe(await this.ventasBi.getVariacionDiariaVentas({ ...h, ...SIN_PAGINAR, dias: p.dias } as any)));
      case 'TOP_CLIENTES':
        return this.topClientes(
          filasDe(
            await this.ventasBi.getTopClientes({ ...h, ...SIN_PAGINAR, fechaInicio: haceMeses(p.meses), fechaFin: fechaIso(new Date()), limit: p.limite } as any),
          ),
          p.meses,
        );
      case 'TOP_PRODUCTOS':
        return this.topProductos(
          filasDe(
            await this.ventasBi.getTopProductosVendidos({
              ...h,
              ...SIN_PAGINAR,
              fechaInicio: haceMeses(p.meses),
              fechaFin: fechaIso(new Date()),
              limit: p.limite,
            } as any),
          ),
          p.meses,
        );
      default:
        throw new BadRequestException(`Reporte desconocido: ${clave}`);
    }
  }

  // ------------------------------------------------------------------ reportes

  private resumenDiario(r: any, fecha: string): ResultadoReporte {
    const m = r.metricas ?? {};
    const g = r.graficas ?? {};
    const dia = `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(0, 4)}`;
    const titulo = `Resumen diario de ventas · ${dia}`;
    const utilidad = n(r.utilidad?.total_utilidad);
    const ventas = n(m.ventas_netas ?? m.total_ventas_netas);
    if (!n(m.total_facturas)) {
      return {
        titulo,
        bloques: [{ tipo: 'indicadores', titulo, items: [{ etiqueta: 'Facturas', valor: 0, formato: 'numero' }] }],
        texto: `📋 ${titulo}
No hay facturas registradas ese día en la sucursal.`,
      };
    }
    const porHora = (g.por_hora ?? []) as any[];
    const bloques: BloqueChat[] = [
      {
        tipo: 'indicadores',
        titulo,
        items: [
          { etiqueta: 'Ventas netas', valor: ventas, formato: 'moneda', destacado: true },
          { etiqueta: 'Facturas', valor: n(m.total_facturas), formato: 'numero' },
          { etiqueta: 'Ticket promedio', valor: n(m.ticket_promedio), formato: 'moneda' },
          { etiqueta: 'Utilidad', valor: utilidad, formato: 'moneda', color: utilidad >= 0 ? 'success' : 'error' },
          { etiqueta: `Contado (${n(m.facturas_contado)})`, valor: n(m.total_contado), formato: 'moneda' },
          { etiqueta: `Crédito (${n(m.facturas_credito)})`, valor: n(m.total_credito), formato: 'moneda' },
          { etiqueta: 'Cobrado', valor: n(m.total_cobrado), formato: 'moneda', color: 'success' },
          { etiqueta: 'Pendiente de cobro', valor: n(m.total_pendiente), formato: 'moneda', color: n(m.total_pendiente) > 0 ? 'warning' : null },
          n(m.monto_notas_credito) > 0 && { etiqueta: 'Notas de crédito', valor: n(m.monto_notas_credito), formato: 'moneda' },
          n(m.facturas_anuladas) > 0 && { etiqueta: 'Anuladas', valor: n(m.facturas_anuladas), formato: 'numero', color: 'error' },
        ].filter(Boolean) as IndicadoresChat['items'],
      },
    ];
    if (porHora.length > 1) {
      bloques.push({
        tipo: 'grafico',
        titulo: `Ventas por hora · ${dia}`,
        clase: 'barras',
        categorias: porHora.map((x) => String(x.etiqueta ?? x.hora)),
        series: [{ nombre: 'Ventas', datos: porHora.map((x) => Math.round(n(x.total) * 100) / 100) }],
        formato: 'moneda',
      });
    }
    const formas = ((g.por_forma_pago ?? []) as any[]).map((x) => ({ forma: x.nombre, facturas: n(x.cantidad), total: n(x.total) }));
    if (formas.length) {
      bloques.push({
        tipo: 'tabla',
        titulo: 'Por forma de pago',
        columnas: [
          { clave: 'forma', etiqueta: 'Forma de pago' },
          { clave: 'facturas', etiqueta: 'Facturas', formato: 'numero' },
          { clave: 'total', etiqueta: 'Total', formato: 'moneda' },
        ],
        filas: formas,
      });
    }
    const clientes = ((g.top_clientes ?? []) as any[]).map((x) => ({
      cliente: x.nom_geper,
      facturas: n(x.cantidad_facturas),
      total: n(x.total_neto),
    }));
    if (clientes.length) {
      bloques.push({
        tipo: 'tabla',
        titulo: 'Top clientes del día',
        columnas: [
          { clave: 'cliente', etiqueta: 'Cliente' },
          { clave: 'facturas', etiqueta: 'Facturas', formato: 'numero' },
          { clave: 'total', etiqueta: 'Total neto', formato: 'moneda' },
        ],
        filas: clientes,
      });
    }
    const articulos = ((g.top_articulos ?? []) as any[]).map((x) => ({
      producto: x.nombre_inarti,
      cantidad: n(x.cantidad_vendida),
      unidad: x.siglas_inuni ?? null,
      total: n(x.total_neto),
    }));
    if (articulos.length) {
      bloques.push({
        tipo: 'tabla',
        titulo: 'Top artículos del día',
        columnas: [
          { clave: 'producto', etiqueta: 'Artículo' },
          { clave: 'cantidad', etiqueta: 'Cantidad', formato: 'cantidad' },
          { clave: 'total', etiqueta: 'Total neto', formato: 'moneda' },
        ],
        filas: articulos,
      });
    }
    const texto = [
      `📋 ${titulo}`,
      `Ventas netas: ${usd(ventas)} · ${cifra(n(m.total_facturas))} facturas · ticket ${usd(n(m.ticket_promedio))}`,
      `Contado: ${usd(n(m.total_contado))} · Crédito: ${usd(n(m.total_credito))}`,
      `Cobrado: ${usd(n(m.total_cobrado))} · Pendiente: ${usd(n(m.total_pendiente))}`,
      `Utilidad: ${usd(utilidad)}`,
      ...(formas.length ? ['', '💳 Formas de pago:', ...formas.map((f) => `• ${f.forma}: ${usd(f.total)} (${f.facturas})`)] : []),
      ...(clientes.length ? ['', '🏆 Top clientes:', ...clientes.slice(0, 5).map((c, i) => `${i + 1}. ${c.cliente}: ${usd(c.total)}`)] : []),
      ...(articulos.length
        ? ['', '📦 Top artículos:', ...articulos.slice(0, 5).map((a, i) => `${i + 1}. ${a.producto}: ${cifra(a.cantidad, 2)} ${a.unidad ?? ''} · ${usd(a.total)}`)]
        : []),
    ].join('\n');
    return { titulo, bloques, texto };
  }

  private ventasAnuales(rows: any[], anios: number): ResultadoReporte {
    const filas = rows
      .map((r) => ({
        anio: String(r.anio),
        facturas: n(r.total_facturas),
        ventas: n(r.total_ventas_neto),
        clientes: n(r.clientes_unicos),
        devolucion: n(r.porcentaje_devolucion),
        ticket: n(r.promedio_venta_por_factura),
      }))
      .sort((a, b) => Number(b.anio) - Number(a.anio))
      .slice(0, anios);
    const asc = [...filas].reverse();
    const actual = filas[0];
    const anterior = filas[1];
    const titulo = 'Ventas anuales';
    const grafico: GraficoChat = {
      tipo: 'grafico',
      titulo,
      subtitulo: 'Ventas netas (descontadas notas de crédito)',
      clase: 'barras',
      categorias: asc.map((f) => f.anio),
      series: [{ nombre: 'Ventas netas', datos: asc.map((f) => Math.round(f.ventas * 100) / 100) }],
      formato: 'moneda',
    };
    const indicadores: IndicadoresChat = {
      tipo: 'indicadores',
      titulo: 'Resumen',
      items: [
        actual && { etiqueta: `Ventas ${actual.anio}${Number(actual.anio) === anioActual() ? ' (a la fecha)' : ''}`, valor: actual.ventas, formato: 'moneda', destacado: true },
        anterior && { etiqueta: `Ventas ${anterior.anio}`, valor: anterior.ventas, formato: 'moneda' },
        actual && { etiqueta: `Clientes ${actual.anio}`, valor: actual.clientes, formato: 'numero' },
        actual && { etiqueta: `Ticket promedio ${actual.anio}`, valor: actual.ticket, formato: 'moneda' },
      ].filter(Boolean) as IndicadoresChat['items'],
    };
    const tabla: TablaChat = {
      tipo: 'tabla',
      titulo: 'Detalle por año',
      columnas: [
        { clave: 'anio', etiqueta: 'Año' },
        { clave: 'facturas', etiqueta: 'Facturas', formato: 'numero' },
        { clave: 'ventas', etiqueta: 'Ventas netas', formato: 'moneda' },
        { clave: 'clientes', etiqueta: 'Clientes', formato: 'numero' },
        { clave: 'ticket', etiqueta: 'Ticket prom.', formato: 'moneda' },
        { clave: 'devolucion', etiqueta: '% Devol.', formato: 'porcentaje' },
      ],
      filas,
    };
    const texto = [
      `📊 ${titulo}`,
      ...filas.map(
        (f) =>
          `${f.anio}${Number(f.anio) === anioActual() ? ' (año en curso, a la fecha: no comparar como año completo)' : ''}: ` +
          `${usd(f.ventas)} · ${cifra(f.facturas)} fact. · ${cifra(f.clientes)} clientes`,
      ),
    ].join('\n');
    return { titulo, bloques: [indicadores, grafico, tabla], texto };
  }

  private ventasMensuales(rows: any[], anio: number): ResultadoReporte {
    const filas = rows.map((r) => ({
      mes: String(r.nombre_gemes ?? r.ide_gemes),
      facturas: n(r.num_facturas),
      ventas: n(r.ventas_netas),
      utilidad: n(r.utilidad),
    }));
    const total = filas.reduce((a, f) => a + f.ventas, 0);
    const utilidad = filas.reduce((a, f) => a + f.utilidad, 0);
    const mejor = [...filas].sort((a, b) => b.ventas - a.ventas)[0];
    const titulo = `Ventas mensuales ${anio}`;
    return {
      titulo,
      bloques: [
        {
          tipo: 'indicadores',
          titulo: 'Resumen',
          items: [
            { etiqueta: `Ventas ${anio}`, valor: total, formato: 'moneda', destacado: true },
            { etiqueta: 'Utilidad', valor: utilidad, formato: 'moneda', color: utilidad >= 0 ? 'success' : 'error' },
            { etiqueta: 'Margen', valor: total ? (utilidad / total) * 100 : null, formato: 'porcentaje' },
            mejor && mejor.ventas > 0 && { etiqueta: 'Mejor mes', valor: `${mejor.mes} (${usd(mejor.ventas)})` },
          ].filter(Boolean) as IndicadoresChat['items'],
        },
        {
          tipo: 'grafico',
          titulo,
          clase: 'barras',
          categorias: filas.map((f) => f.mes.slice(0, 3)),
          series: [
            { nombre: 'Ventas netas', datos: filas.map((f) => Math.round(f.ventas * 100) / 100) },
            { nombre: 'Utilidad', datos: filas.map((f) => Math.round(f.utilidad * 100) / 100) },
          ],
          formato: 'moneda',
        },
        {
          tipo: 'tabla',
          titulo: 'Detalle por mes',
          columnas: [
            { clave: 'mes', etiqueta: 'Mes' },
            { clave: 'facturas', etiqueta: 'Facturas', formato: 'numero' },
            { clave: 'ventas', etiqueta: 'Ventas netas', formato: 'moneda' },
            { clave: 'utilidad', etiqueta: 'Utilidad', formato: 'moneda' },
          ],
          filas,
          total: { mes: 'Total', facturas: filas.reduce((a, f) => a + f.facturas, 0), ventas: total, utilidad },
        },
      ],
      texto: [
        `📊 ${titulo}: ${usd(total)} · utilidad ${usd(utilidad)}`,
        ...filas.filter((f) => f.ventas).map((f) => `${f.mes}: ${usd(f.ventas)}`),
      ].join('\n'),
    };
  }

  private ventasDiarias(rows: any[]): ResultadoReporte {
    const filas = rows
      .map((r) => ({
        fecha: String(r.fecha instanceof Date ? r.fecha.toISOString() : r.fecha).slice(0, 10),
        facturas: n(r.num_facturas),
        venta: n(r.venta_diaria),
        variacion: r.variacion_porcentual === null ? null : n(r.variacion_porcentual),
      }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    const total = filas.reduce((a, f) => a + f.venta, 0);
    const ultimo = filas[filas.length - 1];
    const dd = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
    const titulo = `Ventas diarias (últimos ${filas.length} días con ventas)`;
    return {
      titulo,
      bloques: [
        {
          tipo: 'indicadores',
          titulo: 'Resumen',
          items: [
            { etiqueta: 'Total del período', valor: total, formato: 'moneda', destacado: true },
            { etiqueta: 'Promedio diario', valor: filas.length ? total / filas.length : null, formato: 'moneda' },
            ultimo && { etiqueta: `Último día (${dd(ultimo.fecha)})`, valor: ultimo.venta, formato: 'moneda' },
          ].filter(Boolean) as IndicadoresChat['items'],
        },
        {
          tipo: 'grafico',
          titulo: 'Ventas diarias',
          clase: 'lineas',
          categorias: filas.map((f) => dd(f.fecha)),
          series: [{ nombre: 'Ventas', datos: filas.map((f) => Math.round(f.venta * 100) / 100) }],
          formato: 'moneda',
        },
        {
          tipo: 'tabla',
          titulo: 'Detalle por día',
          columnas: [
            { clave: 'fecha', etiqueta: 'Fecha', formato: 'fecha' },
            { clave: 'facturas', etiqueta: 'Facturas', formato: 'numero' },
            { clave: 'venta', etiqueta: 'Ventas', formato: 'moneda' },
            { clave: 'variacion', etiqueta: 'Variación', formato: 'porcentaje' },
          ],
          filas: [...filas].reverse(),
        },
      ],
      texto: [`📊 ${titulo}: ${usd(total)}`, ...[...filas].reverse().map((f) => `${dd(f.fecha)}: ${usd(f.venta)} (${f.facturas} fact.)`)].join('\n'),
    };
  }

  private topClientes(rows: any[], meses: number): ResultadoReporte {
    const filas = rows.map((r) => ({
      cliente: r.cliente ?? r.nom_geper,
      facturas: n(r.num_facturas),
      ventas: n(r.total_ventas_netas),
      porcentaje: n(r.porcentaje),
    }));
    const titulo = `Mejores clientes (últimos ${meses} meses)`;
    return {
      titulo,
      bloques: [
        {
          tipo: 'grafico',
          titulo,
          clase: 'barras',
          categorias: filas.map((f) => String(f.cliente).slice(0, 18)),
          series: [{ nombre: 'Ventas netas', datos: filas.map((f) => Math.round(f.ventas * 100) / 100) }],
          formato: 'moneda',
        },
        {
          tipo: 'tabla',
          titulo: 'Detalle',
          columnas: [
            { clave: 'cliente', etiqueta: 'Cliente' },
            { clave: 'facturas', etiqueta: 'Facturas', formato: 'numero' },
            { clave: 'ventas', etiqueta: 'Ventas netas', formato: 'moneda' },
            { clave: 'porcentaje', etiqueta: '% del total', formato: 'porcentaje' },
          ],
          filas,
        },
      ],
      texto: [`🏆 ${titulo}`, ...filas.map((f, i) => `${i + 1}. ${f.cliente}: ${usd(f.ventas)} (${cifra(f.porcentaje, 1)}%)`)].join('\n'),
    };
  }

  private topProductos(rows: any[], meses: number): ResultadoReporte {
    const filas = rows.map((r) => ({
      producto: r.nombre_inarti,
      cantidad: n(r.total_cantidad),
      unidad: r.siglas_inuni ?? null,
    }));
    const titulo = `Productos más vendidos (últimos ${meses} meses)`;
    return {
      titulo,
      bloques: [
        {
          tipo: 'tabla',
          titulo,
          columnas: [
            { clave: 'producto', etiqueta: 'Producto' },
            { clave: 'cantidad', etiqueta: 'Cantidad vendida', formato: 'cantidad' },
          ],
          filas,
        },
      ],
      texto: [`📦 ${titulo}`, ...filas.map((f, i) => `${i + 1}. ${f.producto}: ${cifra(f.cantidad, 2)} ${f.unidad ?? ''}`.trim())].join('\n'),
    };
  }
}
