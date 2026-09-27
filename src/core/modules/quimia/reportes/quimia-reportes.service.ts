import { BadRequestException, Injectable } from '@nestjs/common';

import { InventarioBiService } from '../../inventario/data-bi/inventario-bi.service';
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
  /** Resumen en texto (historial y para que la IA lo comente). */
  texto: string;
  /** Mensaje de Telegram de los comandos (HTML). Sin él se envía `texto`. */
  mensajeHtml?: string;
}

const anioActual = () => new Date().getFullYear();

/** Catálogo de reportes: los usan la IA (reporte_ventas) y los comandos de Telegram. */
export const CATALOGO_REPORTES: DefinicionReporte[] = [
  {
    clave: 'RESUMEN_DIARIO',
    nombre: 'Resumen diario de ventas',
    descripcion:
      'Resumen del día (mismo dato que Ventas → Resumen diario de facturas): indicadores de cobranza, desglose de ventas, ' +
      'utilidad, top 10 clientes, top 10 artículos y detalle por vendedor. De la sucursal del usuario. Acepta una fecha ' +
      '(/resumen 25/09/2026) o días atrás (/resumen 1 = ayer).',
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
    nombre: 'Ventas del año por mes',
    descripcion:
      'Mismo dato que la card Ventas anuales de Análisis de ventas: KPIs, gráfico de total ventas y utilidad por mes y ' +
      'detalle mensual (facturas, base imponible, base 0, notas de crédito, IVA, total, utilidad). Año actual o /ventas 2025.',
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
    descripcion: 'Productos con más ventas en el período (mismo dato que Top productos de Análisis de ventas).',
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
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const nombreMes = (nombre: unknown, numero: unknown) => {
  const t = String(nombre ?? '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : (MESES[Number(numero) - 1] ?? String(numero));
};
/** Fecha local (Ecuador) del servidor en YYYY-MM-DD, no UTC: después de las 19:00 UTC ya sería "mañana". */
const fechaLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface Seccion {
  titulo: string;
  lineas: string[];
}

/** Texto plano (IA / historial) y HTML de Telegram (títulos en negrita) de las mismas secciones. */
function textos(encabezado: string, secciones: Seccion[]): { texto: string; mensajeHtml: string } {
  const con = secciones.filter((s) => s.lineas.length);
  return {
    texto: [encabezado, ...con.flatMap((s) => ['', s.titulo, ...s.lineas])].join('\n'),
    mensajeHtml: [`<b>${esc(encabezado)}</b>`, ...con.flatMap((s) => ['', `<b>${esc(s.titulo)}</b>`, ...s.lineas.map(esc)])].join('\n'),
  };
}

/**
 * Fecha escrita por el usuario → YYYY-MM-DD: "26/09/2026", "26-09-2026", "26/9/26", "26/09" (año actual)
 * o "2026-09-26". Null si no es una fecha válida.
 */
export function fechaDeArgumento(valor: string): string | null {
  const t = (valor ?? '').trim();
  let d: number, m: number, a: number;
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const lat = t.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/);
  if (iso) [a, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (lat) {
    [d, m] = [Number(lat[1]), Number(lat[2])];
    a = lat[3] ? Number(lat[3].length === 2 ? `20${lat[3]}` : lat[3]) : anioActual();
  } else return null;
  const f = new Date(a, m - 1, d);
  if (f.getFullYear() !== a || f.getMonth() !== m - 1 || f.getDate() !== d || a < 2000) return null;
  return fechaLocal(f);
}

/**
 * Reportes de ventas para QuimIA y los comandos de Telegram. Reutiliza los servicios de Análisis de
 * datos (VentasBiService): las cifras son las mismas que en los gráficos del ERP.
 */
@Injectable()
export class QuimiaReportesService {
  constructor(
    private readonly ventasBi: VentasBiService,
    private readonly facturas: FacturasService,
    private readonly inventarioBi: InventarioBiService,
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
    // ide_sucu: los servicios de Análisis de datos filtran la sucursal por este parámetro (sin él suman
    // todas las sucursales de la empresa); el resumen diario usa ideSucu.
    const h = {
      ideEmpr: usuario.ideEmpr,
      ideSucu: usuario.ideSucu,
      ideUsua: usuario.ideUsua,
      idePerf: usuario.idePerf,
      login: usuario.login,
      ide_sucu: [usuario.ideSucu],
    };
    switch (clave as ClaveReporte) {
      case 'RESUMEN_DIARIO': {
        // Fecha pedida ("/resumen 25/09/2026") o días atrás desde hoy.
        const d = new Date();
        d.setDate(d.getDate() - p.dias_atras);
        const fecha = (typeof parametros.fecha === 'string' && fechaDeArgumento(parametros.fecha)) || fechaLocal(d);
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
            await this.inventarioBi.getTopProductos({
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
    const u = r.utilidad ?? {};
    const dia = `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(0, 4)}`;
    const titulo = `Resumen diario de facturas · ${dia}`;
    if (!n(m.total_facturas)) {
      const texto = `📋 ${titulo}\nNo hay facturas registradas ese día en la sucursal.`;
      return {
        titulo,
        bloques: [{ tipo: 'indicadores', titulo, items: [{ etiqueta: 'Facturas', valor: 0, formato: 'numero' }] }],
        texto,
        mensajeHtml: `<b>📋 ${esc(titulo)}</b>\nNo hay facturas registradas ese día en la sucursal.`,
      };
    }

    // Mismos cálculos que la página Ventas → Resumen diario de facturas.
    const facturado = n(m.total_facturado);
    const cobrado = n(m.total_cobrado);
    const pendiente = n(m.total_pendiente);
    const notasCredito = n(m.monto_notas_credito);
    const recaudacion = facturado > 0 ? (cobrado / facturado) * 100 : 0;
    const ventasNetas = n(m.total_ventas_netas ?? m.ventas_netas);
    const utilidad = n(u.total_utilidad);
    const margen = ventasNetas > 0 ? (utilidad / ventasNetas) * 100 : 0;
    const sinCosto = n(u.items_sin_precio_compra);

    const clientes = ((g.top_clientes ?? []) as any[]).slice(0, 10).map((x) => ({
      cliente: String(x.nom_geper ?? ''),
      facturas: n(x.cantidad_facturas),
      total: n(x.total_neto),
    }));
    const articulos = ((g.top_articulos ?? []) as any[]).slice(0, 10).map((x) => ({
      producto: String(x.nombre_inarti ?? ''),
      cantidad: n(x.cantidad_vendida),
      unidad: x.siglas_inuni ?? '',
      total: n(x.total_neto),
    }));
    // Detalle por vendedor: agrupado desde las facturas del día (igual que la página).
    const porVendedor = new Map<string, { facturas: number; total: number }>();
    for (const f of (r.facturas ?? []) as any[]) {
      const nombre = String(f.nombre_vgven ?? '').trim() || 'Sin vendedor';
      const v = porVendedor.get(nombre) ?? { facturas: 0, total: 0 };
      v.facturas += 1;
      v.total += n(f.total_cccfa);
      porVendedor.set(nombre, v);
    }
    const totalVendedores = [...porVendedor.values()].reduce((a, v) => a + v.total, 0);
    const vendedores = [...porVendedor.entries()]
      .map(([vendedor, v]) => ({ vendedor, facturas: v.facturas, total: v.total, porcentaje: totalVendedores ? (v.total / totalVendedores) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);

    const bloques: BloqueChat[] = [
      {
        tipo: 'indicadores',
        titulo: `Indicadores de cobranza · ${dia}`,
        items: [
          { etiqueta: `Total por cobrar (${cifra(n(m.total_facturas))} docs)`, valor: facturado, formato: 'moneda', destacado: true },
          { etiqueta: `Total cobrado (${cifra(recaudacion, 1)}%)`, valor: cobrado, formato: 'moneda', color: 'success' },
          { etiqueta: `Pendiente por cobrar (${cifra(n(m.facturas_credito))} a crédito)`, valor: pendiente, formato: 'moneda', color: pendiente > 0 ? 'warning' : null },
          notasCredito > 0 && { etiqueta: `Notas de crédito (${cifra(n(m.facturas_con_nota_credito))})`, valor: notasCredito, formato: 'moneda', color: 'error' },
        ].filter(Boolean) as IndicadoresChat['items'],
      },
      {
        tipo: 'indicadores',
        titulo: 'Desglose de ventas',
        items: [
          { etiqueta: 'Base grabada', valor: n(m.total_base_grabada), formato: 'moneda' },
          { etiqueta: 'Base tarifa 0%', valor: n(m.total_base0), formato: 'moneda' },
          { etiqueta: 'IVA', valor: n(m.total_iva), formato: 'moneda' },
          { etiqueta: notasCredito > 0 ? 'Ventas netas (desc. NC)' : 'Ventas netas', valor: ventasNetas, formato: 'moneda', destacado: true },
        ],
      },
      {
        tipo: 'indicadores',
        titulo: 'Utilidad de ventas',
        items: [
          { etiqueta: 'Utilidad', valor: utilidad, formato: 'moneda', color: utilidad >= 0 ? 'success' : 'error', destacado: true },
          { etiqueta: 'Margen sobre ventas netas', valor: margen, formato: 'porcentaje' },
          { etiqueta: 'Artículos vendidos', valor: n(u.total_items), formato: 'numero' },
          sinCosto > 0 && { etiqueta: 'Sin precio de compra', valor: sinCosto, formato: 'numero', color: 'warning' },
        ].filter(Boolean) as IndicadoresChat['items'],
      },
    ];
    if (clientes.length) {
      bloques.push({
        tipo: 'tabla',
        titulo: 'Top 10 clientes',
        columnas: [
          { clave: 'cliente', etiqueta: 'Cliente' },
          { clave: 'facturas', etiqueta: 'Facturas', formato: 'numero' },
          { clave: 'total', etiqueta: 'Total neto', formato: 'moneda' },
        ],
        filas: clientes,
      });
    }
    if (articulos.length) {
      bloques.push({
        tipo: 'tabla',
        titulo: 'Top 10 artículos',
        columnas: [
          { clave: 'producto', etiqueta: 'Artículo' },
          { clave: 'cantidad', etiqueta: 'Cantidad', formato: 'cantidad' },
          { clave: 'unidad', etiqueta: 'Unidad' },
          { clave: 'total', etiqueta: 'Total neto', formato: 'moneda' },
        ],
        filas: articulos,
      });
    }
    if (vendedores.length) {
      bloques.push({
        tipo: 'tabla',
        titulo: 'Detalle por vendedor',
        columnas: [
          { clave: 'vendedor', etiqueta: 'Vendedor' },
          { clave: 'facturas', etiqueta: 'Facturas', formato: 'numero' },
          { clave: 'total', etiqueta: 'Total', formato: 'moneda' },
          { clave: 'porcentaje', etiqueta: '%', formato: 'porcentaje' },
        ],
        filas: vendedores,
        total: { vendedor: 'Total', facturas: vendedores.reduce((a, v) => a + v.facturas, 0), total: totalVendedores, porcentaje: 100 },
      });
    }

    const secciones: Seccion[] = [
      {
        titulo: '💰 Indicadores de cobranza',
        lineas: [
          `Total por cobrar: ${usd(facturado)} (${cifra(n(m.total_facturas))} docs)`,
          `Total cobrado: ${usd(cobrado)} · ${cifra(recaudacion, 1)}% recaudado`,
          `Pendiente por cobrar: ${usd(pendiente)} (${cifra(n(m.facturas_credito))} a crédito)`,
          ...(notasCredito > 0 ? [`Notas de crédito: ${usd(notasCredito)} (${cifra(n(m.facturas_con_nota_credito))})`] : []),
        ],
      },
      {
        titulo: '🧾 Desglose de ventas',
        lineas: [
          `Base grabada: ${usd(n(m.total_base_grabada))}`,
          `Base tarifa 0%: ${usd(n(m.total_base0))}`,
          `IVA: ${usd(n(m.total_iva))}`,
          `Ventas netas: ${usd(ventasNetas)}`,
        ],
      },
      {
        titulo: '📈 Utilidad de ventas',
        lineas: [
          `Utilidad: ${usd(utilidad)} · margen ${cifra(margen, 1)}%`,
          `${cifra(n(u.total_items))} artículos vendidos${sinCosto > 0 ? ` · ${cifra(sinCosto)} sin precio de compra` : ''}`,
        ],
      },
      {
        titulo: '🏆 Top 10 clientes',
        lineas: clientes.map((c, i) => `${i + 1}. ${c.cliente}: ${usd(c.total)} (${cifra(c.facturas)} fact.)`),
      },
      {
        titulo: '📦 Top 10 artículos',
        lineas: articulos.map((a, i) => `${i + 1}. ${a.producto}: ${cifra(a.cantidad, 3)} ${a.unidad} · ${usd(a.total)}`),
      },
      {
        titulo: '👤 Detalle por vendedor',
        lineas: vendedores.map((v) => `${v.vendedor}: ${usd(v.total)} · ${cifra(v.facturas)} fact. · ${cifra(v.porcentaje, 1)}%`),
      },
    ];
    return { titulo, bloques, ...textos(`📋 ${titulo}`, secciones) };
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

  /** Mismo dato que la card "Ventas anuales" de Análisis de ventas: KPIs, gráfico total/utilidad y detalle por mes. */
  private ventasMensuales(rows: any[], anio: number): ResultadoReporte {
    const filas = rows.map((r) => ({
      mes: nombreMes(r.nombre_gemes, r.ide_gemes),
      facturas: n(r.num_facturas),
      base_imponible: n(r.ventas_con_iva),
      base0: n(r.ventas0),
      notas_credito: n(r.total_nota_credito),
      iva: n(r.iva),
      total: n(r.total),
      utilidad: n(r.utilidad),
      ventas_netas: n(r.ventas_netas),
    }));
    const suma = (k: keyof (typeof filas)[number]) => filas.reduce((a, f) => a + (f[k] as number), 0);
    // Promedios sobre los meses con datos (igual que la página).
    const meses = filas.filter((f) => f.total > 0 || f.facturas > 0).length || 1;
    const ventasNetas = suma('ventas_netas');
    const utilidad = suma('utilidad');
    const facturas = suma('facturas');
    const enCurso = anio === anioActual();
    const titulo = `Ventas ${anio}${enCurso ? ' (a la fecha)' : ''}`;

    const tabla: TablaChat = {
      tipo: 'tabla',
      titulo: `Detalle por mes · ${anio}`,
      columnas: [
        { clave: 'mes', etiqueta: 'Mes' },
        { clave: 'facturas', etiqueta: '# Fact.', formato: 'numero' },
        { clave: 'base_imponible', etiqueta: 'Base imponible', formato: 'moneda' },
        { clave: 'base0', etiqueta: 'Base 0', formato: 'moneda' },
        { clave: 'notas_credito', etiqueta: 'Notas crédito', formato: 'moneda' },
        { clave: 'iva', etiqueta: 'IVA', formato: 'moneda' },
        { clave: 'total', etiqueta: 'Total', formato: 'moneda' },
        { clave: 'utilidad', etiqueta: 'Utilidad', formato: 'moneda' },
      ],
      filas: filas.map(({ ventas_netas: _v, ...f }) => f),
      total: {
        mes: 'Total',
        facturas,
        base_imponible: suma('base_imponible'),
        base0: suma('base0'),
        notas_credito: suma('notas_credito'),
        iva: suma('iva'),
        total: suma('total'),
        utilidad,
      },
      imagen: true,
    };
    const bloques: BloqueChat[] = [
      {
        tipo: 'indicadores',
        titulo,
        items: [
          { etiqueta: 'Total ventas netas', valor: ventasNetas, formato: 'moneda', destacado: true },
          { etiqueta: 'Promedio ventas mensuales', valor: ventasNetas / meses, formato: 'moneda' },
          { etiqueta: 'Total utilidad', valor: utilidad, formato: 'moneda', color: utilidad >= 0 ? 'success' : 'error' },
          { etiqueta: 'Promedio utilidad mensual', valor: utilidad / meses, formato: 'moneda' },
          { etiqueta: 'Total facturas', valor: facturas, formato: 'numero' },
          { etiqueta: 'Promedio facturas mensuales', valor: Math.round(facturas / meses), formato: 'numero' },
        ],
      },
      {
        tipo: 'grafico',
        titulo: `Ventas anuales ${anio}`,
        subtitulo: 'Total de ventas y utilidad por mes',
        clase: 'barras',
        categorias: filas.map((f) => f.mes.slice(0, 3)),
        series: [
          { nombre: 'Total Ventas', datos: filas.map((f) => Math.round(f.total * 100) / 100) },
          { nombre: 'Utilidad', datos: filas.map((f) => Math.round(f.utilidad * 100) / 100) },
        ],
        formato: 'moneda',
        valores: true,
      },
      tabla,
    ];
    const kpis = [
      `Total ventas netas: ${usd(ventasNetas)} · promedio mensual ${usd(ventasNetas / meses)}`,
      `Total utilidad: ${usd(utilidad)} · promedio mensual ${usd(utilidad / meses)}`,
      `Total facturas: ${cifra(facturas)} · promedio mensual ${cifra(Math.round(facturas / meses))}`,
    ];
    const texto = [
      `📊 ${titulo}${enCurso ? ' — año en curso: no comparar como año completo' : ''}`,
      ...kpis,
      '',
      'Detalle por mes (# fact. · base imponible · base 0 · notas de crédito · IVA · total · utilidad):',
      ...filas
        .filter((f) => f.facturas || f.total)
        .map(
          (f) =>
            `${f.mes}: ${cifra(f.facturas)} · ${usd(f.base_imponible)} · ${usd(f.base0)} · ${usd(f.notas_credito)} · ${usd(f.iva)} · ` +
            `${usd(f.total)} · ${usd(f.utilidad)}`,
        ),
    ].join('\n');
    return {
      titulo,
      bloques,
      texto,
      mensajeHtml: [`<b>📊 ${esc(titulo)}</b>`, ...kpis.map(esc), '', '<i>Gráfico y detalle por mes a continuación.</i>'].join('\n'),
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
    // Mismo dato que "Top productos" de Análisis de ventas (ordenado por ventas netas de notas de crédito).
    const filas = rows.map((r) => ({
      producto: r.producto ?? r.nombre_inarti,
      cantidad: n(r.cantidad_vendida ?? r.total_cantidad),
      unidad: r.siglas_inuni ?? null,
      facturas: n(r.num_facturas),
      ventas: n(r.total_ventas),
      porcentaje: n(r.porcentaje),
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
            { clave: 'cantidad', etiqueta: 'Cantidad', formato: 'cantidad' },
            { clave: 'unidad', etiqueta: 'Unidad' },
            { clave: 'facturas', etiqueta: 'Facturas', formato: 'numero' },
            { clave: 'ventas', etiqueta: 'Ventas', formato: 'moneda' },
            { clave: 'porcentaje', etiqueta: '% ventas', formato: 'porcentaje' },
          ],
          filas,
        },
      ],
      texto: [
        `📦 ${titulo}`,
        ...filas.map((f, i) => `${i + 1}. ${f.producto}: ${usd(f.ventas)} · ${cifra(f.cantidad, 2)} ${f.unidad ?? ''} · ${cifra(f.porcentaje, 1)}%`),
      ].join('\n'),
    };
  }
}
