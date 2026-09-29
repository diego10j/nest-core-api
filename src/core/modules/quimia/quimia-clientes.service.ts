import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { ProveedorService } from '../compras/proveedor/proveedor.service';
import { CuentasPorPagarService } from '../cuentas-por-pagar/cuentas-por-pagar.service';
import { ClientesService } from '../ventas/clientes/clientes.service';
import { FacturasService } from '../ventas/facturas/facturas.service';
import { TransportesService } from '../ventas/transportes/transportes.service';

import { ProductoQuimia, UsuarioQuimia } from './quimia.types';

const idCliente = {
  ide_geper: { type: 'integer', description: 'ID del cliente (obtenido con buscar_cliente)' },
};

/** Herramientas de clientes y transporte del asistente QuimIA (se suman a HERRAMIENTAS_QUIMIA). */
const idProveedor = {
  ide_geper: { type: 'integer', description: 'ID del proveedor (obtenido con buscar_proveedor)' },
};

export const HERRAMIENTAS_CLIENTES: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'buscar_proveedor',
      description: 'Busca un PROVEEDOR por nombre o RUC (para "cuánto le debo a X", "qué le debo a X"). Devuelve su ide_geper.',
      parameters: {
        type: 'object',
        properties: { texto: { type: 'string', description: 'Nombre o RUC del proveedor' } },
        required: ['texto'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deuda_proveedor',
      description:
        'Cuánto le DEBEMOS a un proveedor (cuentas por pagar): saldo total, vencido y documentos pendientes ordenados por ' +
        'urgencia (factura, fecha, vencimiento, saldo, días vencido). Mismo dato que Cuentas por pagar del ERP.',
      parameters: { type: 'object', properties: { ...idProveedor }, required: ['ide_geper'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compras_proveedor',
      description:
        'Lo que le COMPRAMOS a un proveedor (facturas de compra): "¿qué le compramos a X?", "¿cada cuánto le compramos?", ' +
        '"últimas compras a X", "¿a qué precio le compramos Y a X?". Frecuencia, última compra, productos con último ' +
        'precio y fecha. Con ide_inarti: historial de precios de ese producto con el proveedor.',
      parameters: {
        type: 'object',
        properties: {
          ...idProveedor,
          ide_inarti: {
            type: 'integer',
            description: 'Producto: SOLO si la pregunta nombra un producto o dice "este producto"; si no, omitir.',
          },
          meses: { type: 'integer', description: 'Meses hacia atrás (por defecto 24)' },
        },
        required: ['ide_geper'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pagos_por_vencer',
      description:
        'Cuentas por PAGAR (a proveedores) según vencimiento: "¿qué pagos vencen hoy?", "pagos de esta semana", "¿qué ' +
        'tenemos vencido?". Lista proveedor, factura, vencimiento y saldo, con el total. Opcional: un proveedor.',
      parameters: {
        type: 'object',
        properties: {
          periodo: {
            type: 'string',
            enum: ['HOY', 'MANANA', 'SEMANA', 'MES', 'VENCIDAS'],
            description: 'HOY (por defecto), MANANA, SEMANA (próximos 7 días), MES (próximos 30 días) o VENCIDAS',
          },
          ...idProveedor,
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_cliente',
      description:
        'Busca clientes por nombre, razón social, RUC/cédula o correo. Úsala SIEMPRE antes de cualquier consulta de un cliente para obtener su ide_geper.',
      parameters: {
        type: 'object',
        properties: { texto: { type: 'string', description: 'Nombre, identificación o correo del cliente' } },
        required: ['texto'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'datos_cliente',
      description:
        'Datos de contacto y ubicación del cliente: dirección, provincia, ciudad/cantón, correo, teléfonos, direcciones de entrega (con ubicación en mapa), contactos, vendedor, forma de pago y límite de crédito.',
      parameters: { type: 'object', properties: { ...idCliente }, required: ['ide_geper'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deuda_cliente',
      description:
        'Cuánto NOS debe el cliente / saldo del cliente (cuentas por cobrar): saldo pendiente, monto vencido, facturas ' +
        'por pagar/vencidas, total comprado y cobrado. "¿Cuánto me debe X?", "¿cuál es el saldo de X?".',
      parameters: { type: 'object', properties: { ...idCliente }, required: ['ide_geper'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compras_cliente',
      description:
        'Compras del cliente (facturas de venta). Con ide_inarti: a qué precio se le vendió ese producto (historial de precios y cantidades). Sin producto: qué productos compra (con último precio y fecha de última compra de cada uno), cada cuánto compra (frecuencia) y últimas compras.',
      parameters: {
        type: 'object',
        properties: {
          ...idCliente,
          ide_inarti: {
            type: 'integer',
            description:
              'Producto: SOLO si la pregunta nombra un producto o dice "este producto". "¿Cada cuánto compra?", "¿qué ' +
              'compra?" o "sus últimas compras" → omitir, aunque haya un producto activo.',
          },
          meses: { type: 'integer', description: 'Meses hacia atrás (por defecto 24)' },
        },
        required: ['ide_geper'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'envios_cliente',
      description:
        'Envíos del cliente (mismo dato que Reportes → Envío de facturas, de la sucursal): transportes que se le han ' +
        'usado y sus últimos envíos con fecha, factura, transporte, peso enviado, flete cobrado al cliente, costo real ' +
        'pagado al transportista, valor facturado y estado.',
      parameters: {
        type: 'object',
        properties: { ...idCliente, limite: { type: 'integer', description: 'Cuántos envíos (por defecto 10)' } },
        required: ['ide_geper'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'transportes_destino',
      description:
        'Qué transportistas llevan a una ciudad/cantón o provincia según los ENVÍOS REALES registrados: cuántos envíos, ' +
        'el último, lo que realmente nos cobró cada uno (promedio, mínimo, máximo) y el costo real por kg.',
      parameters: {
        type: 'object',
        properties: { ciudad: { type: 'string', description: 'Ciudad, cantón o provincia de destino' } },
        required: ['ciudad'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'costo_envio',
      description:
        'Costo aproximado de un envío según el HISTORIAL REAL (mismo dato que Consultar tarifas): "cotizar transporte de 5 kg ' +
        'a Loja", "¿cuánto cuesta enviar a Cuenca?". Envíos reales a ese destino (de peso similar si se indica), lo que ' +
        'realmente cobró cada transportista, costo real por kg y un aproximado para el peso pedido. Peso y unidad opcionales.',
      parameters: {
        type: 'object',
        properties: {
          ciudad: { type: 'string', description: 'Ciudad, cantón o provincia de destino (obligatorio)' },
          peso: { type: 'number', description: 'Peso o cantidad a enviar (opcional)' },
          unidad: { type: 'string', description: 'Unidad del peso: kg (por defecto), g, lb, litros, galones, unidades' },
        },
        required: ['ciudad'],
      },
    },
  },
];

export const ESTADOS_CLIENTES: Record<string, string> = {
  buscar_cliente: 'Buscando el cliente…',
  datos_cliente: 'Consultando datos del cliente…',
  deuda_cliente: 'Consultando la cartera del cliente…',
  compras_cliente: 'Analizando las compras del cliente…',
  envios_cliente: 'Consultando los envíos del cliente…',
  buscar_proveedor: 'Buscando el proveedor…',
  deuda_proveedor: 'Consultando cuentas por pagar…',
  compras_proveedor: 'Analizando las compras al proveedor…',
  pagos_por_vencer: 'Revisando los pagos por vencer…',
  transportes_destino: 'Buscando transportistas…',
  costo_envio: 'Cotizando el transporte…',
};

/** Fecha local (Ecuador) del servidor, no UTC: después de las 19:00 UTC ya sería "mañana". */
const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const haceMeses = (meses: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - meses);
  return d.toISOString().slice(0, 10);
};
const num = (v: unknown, dec = 2) => (v === null || v === undefined || v === '' ? null : Number(Number(v).toFixed(dec)));
const fecha = (v: unknown) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null);
const SIN_PAGINAR = { lazy: 'false', schema: 'false' } as const;

/** Nombres con que escriben la unidad → siglas / nombres posibles en inv_unidad. */
function normalizarUnidad(texto: string): string[] {
  const t = texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.\s]/g, '');
  const grupos: string[][] = [
    ['kg', 'kgs', 'kilo', 'kilos', 'kilogramo', 'kilogramos'],
    ['g', 'gr', 'grs', 'gramo', 'gramos'],
    ['lb', 'lbs', 'libra', 'libras'],
    ['l', 'lt', 'lts', 'litro', 'litros'],
    ['gl', 'gal', 'galon', 'galones'],
    ['ml', 'mililitro', 'mililitros'],
    ['u', 'un', 'und', 'unid', 'unidad', 'unidades'],
  ];
  return grupos.find((g) => g.includes(t)) ?? [t];
}

/**
 * Costo de un envío como lo muestra Consultar tarifas: el real si el flete ya se pagó; si es flete al
 * cobro (se paga en la entrega) el real aún no es confiable y se usa el estimado.
 */
function costoEnvioFila(r: any): { monto: number | null; esReal: boolean; cobroDestino: boolean } {
  const cobroDestino = r.flete_pagado_cctfa === false;
  const real = r.costo_real != null && Number(r.costo_real) > 0 ? Number(r.costo_real) : null;
  if (!cobroDestino && real != null) return { monto: real, esReal: true, cobroDestino: false };
  return { monto: r.costo_estimado != null ? Number(r.costo_estimado) : null, esReal: false, cobroDestino };
}

/**
 * Resumen cuando el backend no hace el análisis con IA (10 envíos o menos): mismo cálculo que la
 * página Consultar tarifas (resumenLocal) — rango, promedio y precio sugerido según la dispersión.
 */
function resumenLocalTarifas(rows: any[]) {
  if (!rows.length) return null;
  const montos = rows.map(costoEnvioFila).filter((c) => c.monto != null);
  if (!montos.length) {
    return {
      resumen: `Se encontraron ${rows.length} envío(s) con peso similar, pero ninguno tiene un costo de flete registrado.`,
      sugerenciaPrecio: null,
      confianza: 'baja',
    };
  }
  if (montos.length < 3) return null;
  const v = montos.map((c) => c.monto as number);
  const promedio = v.reduce((a, b) => a + b, 0) / v.length;
  const desviacion = Math.sqrt(v.reduce((a, x) => a + (x - promedio) ** 2, 0) / v.length);
  const dispersion = promedio > 0 ? desviacion / promedio : 1;
  const confianza = v.length >= 5 && dispersion <= 0.15 ? 'alta' : dispersion <= 0.35 ? 'media' : 'baja';
  return {
    resumen:
      `${v.length} envíos con costo registrado para un peso similar, entre $${Math.min(...v).toFixed(2)} y ` +
      `$${Math.max(...v).toFixed(2)} (promedio $${promedio.toFixed(2)}).` +
      (montos.some((c) => !c.esReal) ? ' Algunos valores son estimados (aún no cobrados).' : ''),
    sugerenciaPrecio: confianza !== 'baja' ? Math.round(promedio * 100) / 100 : null,
    confianza,
  };
}

/**
 * Consultas de clientes y transporte para QuimIA. Reutiliza los servicios de las páginas del ERP
 * (ClientesService, TransportesService, FacturasService, exportados por VentasModule) para que el bot
 * responda lo mismo que el ERP.
 */
@Injectable()
export class QuimiaClientesService {
  constructor(
    private readonly dataSource: DataSourceService,
    private readonly clientes: ClientesService,
    private readonly transportes: TransportesService,
    private readonly facturas: FacturasService,
    private readonly proveedores: ProveedorService,
    private readonly cxp: CuentasPorPagarService,
  ) {}

  esHerramienta(nombre: string) {
    return nombre in ESTADOS_CLIENTES;
  }

  async ejecutar(nombre: string, args: Record<string, any>, usuario: UsuarioQuimia, producto: ProductoQuimia | null) {
    switch (nombre) {
      case 'buscar_cliente':
        return this.buscarCliente(args.texto, usuario);
      case 'datos_cliente':
        return this.datosCliente(Number(args.ide_geper), usuario);
      case 'deuda_cliente':
        return this.deudaCliente(Number(args.ide_geper), usuario);
      case 'compras_cliente': {
        // Sin producto explícito se usa el activo solo si la pregunta es de precio de ese producto:
        // la IA decide pasando ide_inarti; aquí no se asume.
        const ideInarti = args.ide_inarti ? Number(args.ide_inarti) : null;
        return this.comprasCliente(Number(args.ide_geper), ideInarti, Number(args.meses) || 24, usuario, producto);
      }
      case 'envios_cliente':
        return this.enviosCliente(Number(args.ide_geper), Math.min(Number(args.limite) || 10, 30), usuario);
      case 'transportes_destino':
        return this.transportesDestino(String(args.ciudad ?? ''), usuario);
      case 'costo_envio':
        return this.costoEnvio(
          String(args.ciudad ?? ''),
          Number(args.peso ?? args.peso_kg) > 0 ? Number(args.peso ?? args.peso_kg) : null,
          args.unidad ? String(args.unidad) : null,
          usuario,
        );
      case 'buscar_proveedor':
        return this.buscarProveedor(String(args.texto ?? ''), usuario);
      case 'deuda_proveedor':
        return this.deudaProveedor(Number(args.ide_geper), usuario);
      case 'compras_proveedor':
        return this.comprasProveedor(
          Number(args.ide_geper),
          args.ide_inarti ? Number(args.ide_inarti) : null,
          Number(args.meses) || 24,
          usuario,
        );
      case 'pagos_por_vencer':
        return this.pagosPorVencer(String(args.periodo ?? 'HOY').toUpperCase(), args.ide_geper ? Number(args.ide_geper) : null, usuario);
      default:
        return { error: `Herramienta desconocida: ${nombre}` };
    }
  }

  private async buscarCliente(texto: string, u: UsuarioQuimia) {
    const valor = (texto ?? '').trim();
    if (!valor) return { error: 'Indica el nombre o identificación del cliente' };
    const rows = await this.clientes.searchCliente({ ...u, value: valor, limit: 8 } as any);
    return {
      total: rows.length,
      clientes: rows.map((c) => ({
        ide_geper: c.ide_geper,
        nombre: c.nom_geper,
        identificacion: c.identificac_geper,
        ciudad: c.nombre_gecant,
        provincia: c.nombre_geprov,
      })),
      nota: rows.length > 1 ? 'Si no está claro cuál es, pregunta al usuario.' : undefined,
    };
  }

  private async getUuid(ideGeper: number): Promise<string | null> {
    const r = await this.dataSource.pool.query(`SELECT uuid FROM gen_persona WHERE ide_geper = $1`, [ideGeper]);
    return r.rows[0]?.uuid ?? null;
  }

  private async datosCliente(ideGeper: number, u: UsuarioQuimia) {
    const uuid = await this.getUuid(ideGeper);
    if (!uuid) return { error: 'Cliente no encontrado' };
    const [ficha, direcciones, contactos] = await Promise.all([
      this.clientes.getCliente({ ...u, uuid } as any),
      this.clientes.getDireccionesCliente({ ...u, ide_geper: ideGeper, ...SIN_PAGINAR } as any),
      this.clientes.getContactosCliente({ ...u, ide_geper: ideGeper, ...SIN_PAGINAR } as any),
    ]);
    const c = (ficha as any)?.row?.cliente ?? {};
    return {
      cliente: c.nom_geper,
      nombre_comercial: c.nombre_compl_geper || null,
      identificacion: c.identificac_geper,
      direccion: c.direccion_geper,
      provincia: c.nombre_geprov,
      ciudad_canton: c.nombre_gecant,
      correo: c.correo_geper,
      telefono: c.telefono_geper,
      celular: c.movil_geper,
      contacto: c.contacto_geper,
      vendedor: c.nombre_vgven,
      forma_pago: c.nombre_cndfp,
      limite_credito: num(c.limite_credito_geper),
      dias_credito: c.dias_credito_geper,
      activo: c.activo_geper,
      direcciones: ((direcciones as any)?.rows ?? []).filter((d) => d.activo_gedirp !== false).slice(0, 6).map((d) => ({
        nombre: d.nombre_dir_gedirp,
        tipo: d.nombre_getidi,
        direccion: d.direccion_gedirp,
        referencia: d.referencia_gedirp,
        provincia: d.nombre_geprov,
        ciudad: d.nombre_gecant,
        telefono: d.telefono_gedirp || d.movil_gedirp,
        distancia_km: num(d.distancia_km),
        mapa:
          d.latitud_gedirp && d.longitud_gedirp
            ? `https://maps.google.com/?q=${d.latitud_gedirp},${d.longitud_gedirp}`
            : null,
        principal: d.defecto_gedirp,
      })),
      contactos: ((contactos as any)?.rows ?? []).filter((x) => x.activo_gedirp !== false).slice(0, 6).map((x) => ({
        nombre: x.nombre_dir_gedirp,
        correo: x.correo_gedirp,
        celular: x.movil_gedirp,
      })),
    };
  }

  private async deudaCliente(ideGeper: number, u: UsuarioQuimia) {
    const t = await this.clientes.getInfoTotalesCliente(ideGeper, u.ideEmpr);
    if (!t) return { error: 'Cliente sin facturas registradas' };
    return {
      saldo_pendiente: num(t.total_pendiente),
      monto_vencido: num(t.monto_vencido),
      facturas_por_pagar: Number(t.facturas_por_pagar ?? 0),
      facturas_pago_parcial: Number(t.facturas_pago_parcial ?? 0),
      facturas_vencidas: Number(t.facturas_vencidas ?? 0),
      total_facturas: Number(t.total_facturas ?? 0),
      total_ventas: num(t.total_ventas),
      total_cobrado: num(t.total_cobrado),
      total_retenciones: num(t.total_retenciones),
      ultima_venta: fecha(t.ultima_venta),
      ultima_transaccion: fecha(t.ultima_transaccion),
      moneda: 'USD',
    };
  }

  private async comprasCliente(
    ideGeper: number,
    ideInarti: number | null,
    meses: number,
    u: UsuarioQuimia,
    productoActivo: ProductoQuimia | null,
  ) {
    const r = await this.clientes.getDetalleVentasCliente({
      ...u,
      ide_geper: ideGeper,
      fechaInicio: haceMeses(meses),
      fechaFin: hoy(),
      ...SIN_PAGINAR,
    } as any);
    const lineas = ((r as any)?.rows ?? []).map((l) => ({
      fecha: fecha(l.fecha_emisi_cccfa),
      factura: l.secuencial_cccfa,
      ide_cccfa: l.ide_cccfa,
      producto: l.nombre_inarti as string,
      cantidad: num(l.cantidad_ccdfa, 3),
      unidad: l.siglas_inuni,
      precio: num(l.precio_ccdfa, 4),
      total_neto: num(l.total_neto),
    }));

    if (ideInarti) {
      // Las filas no traen ide_inarti: se filtra por el nombre del producto del ERP.
      const r2 = await this.dataSource.pool.query(`SELECT nombre_inarti FROM inv_articulo WHERE ide_inarti = $1`, [ideInarti]);
      const nombre = r2.rows[0]?.nombre_inarti ?? productoActivo?.nombre;
      const ventas = lineas.filter((l) => l.producto === nombre);
      const precios = ventas.map((v) => v.precio).filter((p) => p !== null) as number[];
      return {
        producto: nombre,
        periodo_meses: meses,
        veces_vendido: ventas.length,
        // Que no haya comprado ESTE producto no significa que no compre: se informa el total.
        ...(!ventas.length
          ? {
              aviso:
                `No compró ${nombre} en el período, pero tiene ${new Set(lineas.map((l) => l.ide_cccfa)).size} factura(s) ` +
                'de otros productos. Si la pregunta no era de este producto, vuelve a llamar sin ide_inarti.',
            }
          : {}),
        ultimo_precio: ventas[0]?.precio ?? null,
        ultima_fecha: ventas[0]?.fecha ?? null,
        precio_minimo: precios.length ? Math.min(...precios) : null,
        precio_maximo: precios.length ? Math.max(...precios) : null,
        precio_promedio: precios.length ? num(precios.reduce((a, b) => a + b, 0) / precios.length, 4) : null,
        ventas: ventas.slice(0, 15).map(({ ide_cccfa: _i, ...v }) => v),
        nota: 'Precios unitarios sin IVA según la factura.',
      };
    }

    // Sin compras en el período: se busca la última compra histórica antes de decir que no compra.
    if (!lineas.length && meses < 120) {
      const hist: any = await this.clientes
        .getDetalleVentasCliente({ ...u, ide_geper: ideGeper, fechaInicio: haceMeses(120), fechaFin: hoy(), ...SIN_PAGINAR } as any)
        .catch(() => null);
      const filas: any[] = hist?.rows ?? [];
      const ultimaHist = filas.map((l) => fecha(l.fecha_emisi_cccfa)).filter(Boolean).sort().pop() ?? null;
      return {
        periodo_meses: meses,
        facturas: 0,
        sin_compras_en_periodo: true,
        ultima_compra_historica: ultimaHist,
        facturas_ultimos_10_anios: new Set(filas.map((l) => l.ide_cccfa)).size,
        nota: ultimaHist
          ? `No compró en los últimos ${meses} meses; su última compra fue el ${ultimaHist}.`
          : 'No hay facturas del cliente en esta sucursal.',
      };
    }

    const facturas = new Map<number, string>();
    lineas.forEach((l) => facturas.set(l.ide_cccfa, l.fecha));
    const fechas = [...new Set([...facturas.values()])].sort();
    const dias = fechas.slice(1).map((f, i) => (Date.parse(f) - Date.parse(fechas[i])) / 86_400_000);
    const promedio = dias.length ? Math.round(dias.reduce((a, b) => a + b, 0) / dias.length) : null;
    const ultima = fechas[fechas.length - 1] ?? null;
    const porProducto = new Map<
      string,
      { veces: number; cantidad: number; unidad: string; total: number; ultimaFecha: string | null; ultimoPrecio: number | null }
    >();
    lineas.forEach((l) => {
      const p = porProducto.get(l.producto) ?? {
        veces: 0,
        cantidad: 0,
        unidad: l.unidad,
        total: 0,
        ultimaFecha: null,
        ultimoPrecio: null,
      };
      p.veces++;
      p.cantidad += l.cantidad ?? 0;
      p.total += l.total_neto ?? 0;
      // Última compra de cada producto: la fecha más reciente y su precio.
      if (l.fecha && (!p.ultimaFecha || l.fecha > p.ultimaFecha)) {
        p.ultimaFecha = l.fecha;
        p.ultimoPrecio = l.precio;
      }
      porProducto.set(l.producto, p);
    });

    return {
      periodo_meses: meses,
      facturas: facturas.size,
      primera_compra: fechas[0] ?? null,
      ultima_compra: ultima,
      dias_desde_ultima_compra: ultima ? Math.round((Date.now() - Date.parse(ultima)) / 86_400_000) : null,
      dias_promedio_entre_compras: promedio,
      proxima_compra_estimada:
        promedio !== null && ultima ? new Date(Date.parse(ultima) + promedio * 86_400_000).toISOString().slice(0, 10) : null,
      total_comprado_usd: num(lineas.reduce((a, l) => a + (l.total_neto ?? 0), 0)),
      productos_mas_comprados: [...porProducto.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 25)
        .map(([producto, p]) => ({
          producto,
          veces: p.veces,
          cantidad: num(p.cantidad, 3),
          unidad: p.unidad,
          ultimo_precio: p.ultimoPrecio,
          ultima_compra: p.ultimaFecha,
          total_usd: num(p.total),
        })),
      ultimas_facturas: fechas.slice(-8).reverse(),
    };
  }

  /**
   * Envíos del cliente: mismo dato que Reportes → Envío de facturas (FacturasService.getReporteEnviosFacturas,
   * filtrado por cliente y por la sucursal del usuario). Flete cobrado al cliente = total_flete_cctfa;
   * costo real (pagado al transportista) = total_flete_real_cctfa; valor facturado = total de la factura.
   */
  private async enviosCliente(ideGeper: number, limite: number, u: UsuarioQuimia) {
    if (!ideGeper) return { error: 'Primero busca el cliente con buscar_cliente' };
    const r: any = await this.facturas.getReporteEnviosFacturas({
      ...u,
      ...SIN_PAGINAR,
      fechaInicio: '2000-01-01',
      fechaFin: hoy(),
      ide_geper: ideGeper,
    } as any);
    const rows: any[] = Array.isArray(r) ? r : (r?.rows ?? []);
    if (!rows.length) return { total_envios: 0, mensaje: 'El cliente no tiene envíos registrados en esta sucursal.' };

    // Peso/cantidad enviada por factura: artículos de kardex agrupados por unidad (misma regla que
    // Consultar tarifas → detalle_unidades).
    const ultimos = rows.slice(0, limite);
    const pesos = await this.dataSource.pool.query(
      `SELECT d.ide_cccfa, COALESCE(un.siglas_inuni, 'unid.') AS unidad, SUM(d.cantidad_ccdfa) AS cantidad
         FROM cxc_deta_factura d
         JOIN inv_articulo a ON a.ide_inarti = d.ide_inarti
         LEFT JOIN inv_unidad un ON un.ide_inuni = a.ide_inuni
        WHERE d.ide_cccfa = ANY($1::int[]) AND a.hace_kardex_inarti = TRUE
        GROUP BY d.ide_cccfa, COALESCE(un.siglas_inuni, 'unid.')
        ORDER BY cantidad DESC`,
      [ultimos.map((e) => e.ide_cccfa)],
    );
    const enviadoDe = (id: number) =>
      pesos.rows
        .filter((p) => p.ide_cccfa === id)
        .map((p) => `${num(p.cantidad, 3)} ${p.unidad}`)
        .join(', ') || null;
    const tipo = (e: any) => (e.es_transporte_propio_cctfa ? 'Transporte propio' : e.ide_vgtra ? e.nombre_transporte : 'Retiro en oficina');

    // Transportes usados (todo el historial del cliente en la sucursal).
    const porTransporte = new Map<string, { envios: number; ultimo: string | null; cobrado: number; costo_real: number }>();
    for (const e of rows) {
      const t = tipo(e) ?? 'Sin transporte';
      const x = porTransporte.get(t) ?? { envios: 0, ultimo: null, cobrado: 0, costo_real: 0 };
      x.envios += 1;
      const f = fecha(e.fecha_envio_cctfa ?? e.fecha_emisi_cccfa);
      if (f && (!x.ultimo || f > x.ultimo)) x.ultimo = f;
      x.cobrado += Number(e.total_flete_cctfa ?? 0);
      x.costo_real += Number(e.total_flete_real_cctfa ?? 0);
      porTransporte.set(t, x);
    }
    return {
      total_envios: rows.length,
      transportes_usados: [...porTransporte.entries()]
        .map(([transporte, x]) => ({
          transporte,
          envios: x.envios,
          ultimo_envio: x.ultimo,
          flete_cobrado: num(x.cobrado),
          costo_real: num(x.costo_real),
        }))
        .sort((a, b) => b.envios - a.envios),
      ultimos_envios: ultimos.map((e) => ({
        fecha: fecha(e.fecha_envio_cctfa ?? e.fecha_emisi_cccfa),
        factura: [e.establecimiento_ccdfa, e.pto_emision_ccdfa, e.secuencial_cccfa].filter(Boolean).join('-'),
        transporte: tipo(e),
        estado: e.estado_envio ?? null,
        destinatario: e.destinatario_guia_cctfa ?? null,
        enviado: enviadoDe(e.ide_cccfa),
        valor_facturado: num(e.total_cccfa),
        flete_cobrado: num(e.total_flete_cctfa),
        costo_real: e.flete_pagado_cctfa ? num(e.total_flete_real_cctfa) : null,
        flete_pagado: !!e.flete_pagado_cctfa,
        diferencia: e.tipo_diferencia_flete ? `${e.tipo_diferencia_flete} ${num(e.diferencia_flete)}` : null,
        factura_flete: e.numero_factura_flete ?? null,
      })),
      nota:
        'flete_cobrado = lo cobrado al cliente por el flete; costo_real = lo pagado al transportista (null si aún no ' +
        'está pagado / flete al cobro); valor_facturado = total de la factura.',
    };
  }

  /** Destino como en Consultar tarifas: cantón o provincia reconocidos; si no, búsqueda por texto. */
  private async resolverDestino(destino: string) {
    const lugar = await this.dataSource.pool.query(
      `SELECT c.ide_gecant, c.nombre_gecant, p.ide_geprov, p.nombre_geprov,
              unaccent(UPPER(c.nombre_gecant)) = unaccent(UPPER($1)) AS es_canton,
              unaccent(UPPER(p.nombre_geprov)) = unaccent(UPPER($1)) AS es_provincia
         FROM gen_canton c
         JOIN gen_provincia p ON p.ide_geprov = c.ide_geprov
        WHERE unaccent(UPPER(c.nombre_gecant)) = unaccent(UPPER($1)) OR unaccent(UPPER(p.nombre_geprov)) = unaccent(UPPER($1))
        ORDER BY es_canton DESC
        LIMIT 1`,
      [destino],
    );
    const l = lugar.rows[0];
    return {
      filtro: l?.es_canton ? { ide_gecant: l.ide_gecant } : l?.es_provincia ? { ide_geprov: l.ide_geprov } : { descripcion: destino },
      texto: l?.es_canton ? `${l.nombre_gecant} (${l.nombre_geprov})` : l?.es_provincia ? `Provincia de ${l.nombre_geprov}` : destino,
    };
  }

  /**
   * Resumen por transportista a partir de los ENVÍOS REALES (no de tarifas configuradas: dependen del
   * transportista y varían). El costo que cuenta es lo que el transportista nos cobró de verdad
   * (flete pagado); el estimado solo se informa aparte cuando no hay costo real. Con los kg enviados se
   * calcula el costo real por kg, que sirve para aproximar el costo de un envío de otro peso.
   */
  private resumenPorTransportista(rows: any[]) {
    const esKg = (unidad: unknown) => /^(KG|KGS|KILO|KILOS|KILOGRAMOS?)$/i.test(String(unidad ?? '').trim());
    const grupos = new Map<string, any[]>();
    rows.forEach((r) => grupos.set(r.nombre_vgtra ?? 'Sin transportista', [...(grupos.get(r.nombre_vgtra ?? 'Sin transportista') ?? []), r]));
    const stats = (v: number[]) =>
      v.length
        ? { promedio: num(v.reduce((a, b) => a + b, 0) / v.length), minimo: num(Math.min(...v)), maximo: num(Math.max(...v)) }
        : null;
    return [...grupos.entries()]
      .map(([transporte, envios]) => {
        const reales = envios.filter((r) => r.flete_pagado_cctfa !== false && Number(r.costo_real) > 0);
        const costosReales = reales.map((r) => Number(r.costo_real));
        const porKg = reales
          .map((r) => {
            const kg = (r.detalle_unidades ?? []).filter((x: any) => esKg(x.unidad)).reduce((a: number, x: any) => a + Number(x.cantidad ?? 0), 0);
            return kg > 0 ? Number(r.costo_real) / kg : null;
          })
          .filter((x): x is number => x != null);
        const estimados = envios
          .filter((r) => !reales.includes(r) && Number(r.costo_estimado) > 0)
          .map((r) => Number(r.costo_estimado));
        return {
          transporte,
          envios: envios.length,
          ultimo_envio: fecha(envios[0]?.fecha_envio),
          envios_con_costo_real: reales.length,
          costo_real: stats(costosReales),
          costo_real_por_kg: porKg.length ? { ...stats(porKg), envios_con_peso_kg: porKg.length } : null,
          ...(costosReales.length ? {} : { costo_estimado_sin_confirmar: stats(estimados) }),
        };
      })
      .sort((a, b) => b.envios - a.envios)
      .slice(0, 10);
  }

  /**
   * Qué transportistas llevan a un destino: los que realmente han enviado ahí (envíos registrados), con
   * cuántos envíos, el último y lo que costaron en realidad. No usa tarifas configuradas.
   */
  private async transportesDestino(ciudad: string, u: UsuarioQuimia) {
    const destino = ciudad.trim();
    if (!destino) return { error: 'Indica la ciudad de destino' };
    const d = await this.resolverDestino(destino);
    const r: any = await this.transportes.consultarTarifas({ ...u, ...d.filtro } as any);
    const rows: any[] = r?.rows ?? [];
    return {
      destino: d.texto,
      envios_registrados: rows.length,
      nota:
        (rows.length >= 300 ? 'Se analizaron los 300 envíos más recientes. ' : '') +
        'Datos de envíos reales a ese destino. costo_real = lo que nos cobró el transportista (flete pagado); ' +
        'costo_real_por_kg sirve para aproximar otro peso. No hay tarifas: no las menciones.',
      por_transportista: this.resumenPorTransportista(rows),
      ultimos_envios: this.ultimosEnvios(rows, null),
    };
  }

  /**
   * Cotizador de transporte: mismo dato que Ventas → Transportes → Consultar tarifas
   * (TransportesService.consultarTarifas): envíos históricos a ese destino, filtrados por peso similar
   * (-30% / +35%) si se indica el peso, con el costo por transportista y el análisis de la página. Se
   * suman las tarifas configuradas de los transportistas que llegan a ese destino.
   */
  private async costoEnvio(ciudad: string, peso: number | null, unidad: string | null, u: UsuarioQuimia) {
    const destino = ciudad.trim();
    if (!destino) return { error: 'Indica la ciudad de destino' };

    const { filtro: filtroDestino, texto: destinoTxt } = await this.resolverDestino(destino);

    // Unidad del peso (opcional, kg por defecto) → ide_inuni del catálogo de unidades.
    let ideInuni: number | null = null;
    let siglas: string | null = null;
    if (peso && peso > 0) {
      const alias = normalizarUnidad(unidad ?? 'kg');
      const un = await this.dataSource.pool.query(
        `SELECT ide_inuni, siglas_inuni FROM inv_unidad
          WHERE LOWER(TRIM(siglas_inuni)) = ANY($1::text[]) OR unaccent(LOWER(TRIM(nombre_inuni))) = ANY($1::text[])
          ORDER BY ide_inuni LIMIT 1`,
        [alias],
      );
      if (!un.rows[0]) return { error: `No reconozco la unidad "${unidad}". Usa kg, g, litros, galones o unidades.` };
      ideInuni = un.rows[0].ide_inuni;
      siglas = un.rows[0].siglas_inuni;
    }
    const conPeso = ideInuni != null;

    const resultado: any = await this.transportes.consultarTarifas({
      ...u,
      ...filtroDestino,
      ...(conPeso ? { peso, ide_inuni: ideInuni } : {}),
    } as any);
    let rows: any[] = resultado?.rows ?? [];
    const analisis = resultado?.resumenIA ?? (conPeso ? resumenLocalTarifas(rows) : null);

    // Sin envíos de peso similar: se usan todos los envíos al destino y el costo real por kg para aproximar.
    let sinPesoSimilar = false;
    if (conPeso && !rows.length) {
      const todos: any = await this.transportes.consultarTarifas({ ...u, ...filtroDestino } as any);
      rows = todos?.rows ?? [];
      sinPesoSimilar = rows.length > 0;
    }
    const porTransportista = this.resumenPorTransportista(rows);
    const esKgPedido = conPeso && /^(kg|kgs)$/i.test(String(siglas ?? '').trim());
    return {
      destino: destinoTxt,
      peso: conPeso ? `${peso} ${siglas}` : null,
      envios_encontrados: rows.length,
      criterio: sinPesoSimilar
        ? `No hay envíos a ${destinoTxt} de peso similar a ${peso} ${siglas}: se muestran todos los envíos a ese destino`
        : conPeso
          ? `Envíos a ${destinoTxt} con ${peso} ${siglas} (entre -30% y +35%)`
          : `Todos los envíos a ${destinoTxt} (sin filtrar por peso)`,
      analisis: sinPesoSimilar ? null : analisis,
      por_transportista: porTransportista.map((t) => ({
        ...t,
        // Aproximado para el peso pedido con el costo real por kg de ese transportista a ese destino.
        ...(esKgPedido && t.costo_real_por_kg?.promedio != null
          ? { costo_aproximado_para_peso: num(Number(t.costo_real_por_kg.promedio) * Number(peso)) }
          : {}),
      })),
      nota:
        'Todo sale de envíos reales. costo_real = lo que nos cobró el transportista (flete pagado); ' +
        'costo_aproximado_para_peso = costo real por kg promedio × peso pedido (referencial: los fletes tienen mínimos ' +
        'y varían). No hay tarifas configuradas: no las menciones.',
      ultimos_envios: this.ultimosEnvios(rows, conPeso && !sinPesoSimilar ? siglas : null),
    };
  }

  /**
   * Últimos envíos al destino con fecha, factura, cliente, transporte, lo enviado y el costo: primero los que
   * tienen costo Y cantidad (sirven de referencia para cotizar), completando con los demás hasta `limite`.
   */
  private ultimosEnvios(rows: any[], siglasBuscadas: string | null, limite = 10) {
    const filas = rows.map((r) => {
      const c = costoEnvioFila(r);
      const enviado =
        (siglasBuscadas && r.cantidad_unidad_buscada != null
          ? `${num(r.cantidad_unidad_buscada, 3)} ${siglasBuscadas}`
          : (r.detalle_unidades ?? []).map((x: any) => `${num(x.cantidad, 3)} ${x.unidad}`).join(', ')) || null;
      return {
        fecha: fecha(r.fecha_envio),
        factura: r.secuencial_cccfa,
        cliente: r.cliente,
        ciudad: r.nombre_gecant ?? r.nombre_geprov,
        transporte: r.nombre_vgtra,
        enviado,
        costo: c.monto,
        tipo_costo: c.cobroDestino ? 'Estimado (flete al cobro)' : c.esReal ? 'Real' : 'Estimado',
      };
    });
    const completos = filas.filter((f) => f.costo != null && f.enviado);
    const resto = filas.filter((f) => !completos.includes(f));
    return [...completos, ...resto]
      .slice(0, limite)
      .sort((a, b) => String(b.fecha ?? '').localeCompare(String(a.fecha ?? '')));
  }

  // ------------------------------------------------------------------ proveedores / cuentas por pagar

  /** Proveedores por nombre o RUC (ProveedorService.searchProveedor, el autocompletado del ERP). */
  private async buscarProveedor(texto: string, u: UsuarioQuimia) {
    const valor = texto.trim();
    if (!valor) return { error: 'Indica el nombre o RUC del proveedor' };
    const r: any = await this.proveedores.searchProveedor({ ...u, value: valor, limit: 8 } as any);
    const rows: any[] = Array.isArray(r) ? r : (r?.rows ?? []);
    if (!rows.length) return { encontrados: 0, mensaje: `No hay un proveedor que coincida con "${valor}".` };
    return {
      encontrados: rows.length,
      proveedores: rows.map((p) => ({ ide_geper: p.ide_geper, nombre: p.nom_geper, ruc: p.identificac_geper })),
      ...(rows.length > 1 ? { mensaje: 'Si no está claro cuál es, pregunta al usuario.' } : {}),
    };
  }

  /**
   * Cuánto le debemos a un proveedor: saldo (ProveedorService.getSaldo) y documentos pendientes por
   * urgencia (CuentasPorPagarService.getCuentasPorPagarProveedorPendientes), de la sucursal del usuario.
   */
  private async deudaProveedor(ideGeper: number, u: UsuarioQuimia) {
    if (!ideGeper) return { error: 'Primero busca el proveedor con buscar_proveedor' };
    const [saldo, pendientes] = await Promise.all([
      this.proveedores.getSaldo({ ...u, ide_geper: ideGeper } as any),
      this.cxp.getCuentasPorPagarProveedorPendientes({ ...u, ...SIN_PAGINAR, ide_geper: ideGeper } as any),
    ]);
    const filaSaldo: any = Array.isArray(saldo) ? saldo[0] : ((saldo as any)?.rows?.[0] ?? saldo);
    const docs: any[] = (Array.isArray(pendientes) ? pendientes : ((pendientes as any)?.rows ?? [])).filter(
      (d) => Number(d.saldo_x_pagar) > 0.004,
    );
    const vencidos = docs.filter((d) => Number(d.dias_vencido) > 0);
    const total = docs.reduce((a, d) => a + Number(d.saldo_x_pagar), 0);
    return {
      saldo_total: num(filaSaldo?.saldo ?? total),
      total_vencido: num(vencidos.reduce((a, d) => a + Number(d.saldo_x_pagar), 0)),
      documentos_pendientes: docs.length,
      documentos_vencidos: vencidos.length,
      pendientes: docs.slice(0, 15).map((d) => ({
        factura: d.numero_cpcfa ?? null,
        fecha: fecha(d.fecha),
        vence: fecha(d.fecha_vence),
        total: num(d.total_cpcfa),
        saldo: num(d.saldo_x_pagar),
        dias_vencido: Number(d.dias_vencido ?? 0),
        estado: d.estado_obligacion ?? null,
      })),
      moneda: 'USD',
    };
  }

  /**
   * Pagos a proveedores por vencimiento (CuentasPorPagarService.getCuentasPorPagar, solo pendientes, de la
   * sucursal): HOY, MANANA, SEMANA (7 días), MES (30 días) o VENCIDAS, con el total.
   */
  private async pagosPorVencer(periodo: string, ideGeper: number | null, u: UsuarioQuimia) {
    const r: any = await this.cxp.getCuentasPorPagar({
      ...u,
      ...SIN_PAGINAR,
      fechaInicio: '2000-01-01',
      fechaFin: hoy(),
      activos: 'true',
      ...(ideGeper ? { ide_geper: ideGeper } : {}),
    } as any);
    const rows: any[] = Array.isArray(r) ? r : (r?.rows ?? []);
    const dia = (offset: number) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const hoyStr = dia(0);
    const rangos: Record<string, [string, string, string]> = {
      HOY: [hoyStr, hoyStr, 'vencen hoy'],
      MANANA: [dia(1), dia(1), 'vencen mañana'],
      SEMANA: [hoyStr, dia(7), 'vencen en los próximos 7 días'],
      MES: [hoyStr, dia(30), 'vencen en los próximos 30 días'],
    };
    const esVencidas = periodo === 'VENCIDAS';
    const [desde, hasta, etiqueta] = rangos[periodo] ?? rangos.HOY;
    const lista = rows
      .filter((d) => Number(d.saldo_x_pagar) > 0.004)
      .map((d) => ({ ...d, _vence: fecha(d.fecha_vence) }))
      .filter((d) => (esVencidas ? d._vence && d._vence < hoyStr : d._vence && d._vence >= desde && d._vence <= hasta))
      .sort((a, b) => String(a._vence).localeCompare(String(b._vence)) || Number(b.saldo_x_pagar) - Number(a.saldo_x_pagar));
    const total = lista.reduce((a, d) => a + Number(d.saldo_x_pagar), 0);
    return {
      criterio: esVencidas ? 'Pagos a proveedores ya vencidos' : `Pagos a proveedores que ${etiqueta}`,
      cantidad: lista.length,
      total: num(total),
      pagos: lista.slice(0, 40).map((d) => ({
        proveedor: d.nom_geper,
        factura: d.numero_cpcfa ?? null,
        fecha: fecha(d.fecha),
        vence: d._vence,
        total_factura: num(d.total_cpcfa),
        saldo: num(d.saldo_x_pagar),
        dias_vencido: Number(d.dias_vencido ?? 0),
      })),
      ...(lista.length > 40 ? { nota: `Se muestran 40 de ${lista.length}; el total incluye todos.` } : {}),
      moneda: 'USD',
    };
  }

  /**
   * Compras a un proveedor (ProveedorService.getDetalleComprasProveedor, el detalle de la ficha del
   * proveedor) con la unidad de cada producto (getProductosProveedor). Igual que compras_cliente: sin
   * producto → frecuencia y productos que le compramos; con producto → historial de precios.
   */
  private async comprasProveedor(ideGeper: number, ideInarti: number | null, meses: number, u: UsuarioQuimia) {
    if (!ideGeper) return { error: 'Primero busca el proveedor con buscar_proveedor' };
    type LineaCompra = { fecha: string | null; factura: string; producto: string; cantidad: number | null; precio: number | null; total: number | null };
    const leer = async (m: number): Promise<LineaCompra[]> => {
      const r: any = await this.proveedores.getDetalleComprasProveedor({
        ...u,
        ...SIN_PAGINAR,
        ide_geper: ideGeper,
        fechaInicio: haceMeses(m),
        fechaFin: hoy(),
      } as any);
      return (Array.isArray(r) ? r : (r?.rows ?? [])).map((l: any) => ({
        fecha: fecha(l.fecha_emisi_cpcfa),
        factura: l.numero_cpcfa as string,
        producto: l.nombre_inarti as string,
        cantidad: num(l.cantidad_cpdfa, 3),
        precio: num(l.precio_cpdfa, 4),
        total: num(l.valor_cpdfa),
      }));
    };
    const lineas = await leer(meses);

    // Sin compras en el período: última compra histórica antes de decir que no le compramos.
    if (!lineas.length) {
      const hist = meses < 120 ? await leer(120).catch(() => []) : [];
      const ultimaHist = hist.map((l) => l.fecha).filter(Boolean).sort().pop() ?? null;
      return {
        periodo_meses: meses,
        facturas: 0,
        sin_compras_en_periodo: true,
        ultima_compra_historica: ultimaHist,
        nota: ultimaHist
          ? `No le compramos en los últimos ${meses} meses; la última compra fue el ${ultimaHist}.`
          : 'No hay facturas de compra de este proveedor.',
      };
    }

    // Unidad por producto (la ficha del proveedor la trae; el detalle no).
    const prods: any = await this.proveedores.getProductosProveedor({ ...u, ...SIN_PAGINAR, ide_geper: ideGeper } as any).catch(() => null);
    const unidades = new Map<string, string | null>(
      (Array.isArray(prods) ? prods : (prods?.rows ?? [])).map((p: any) => [p.nombre_inarti, p.unidad || null]),
    );

    if (ideInarti) {
      const r2 = await this.dataSource.pool.query(`SELECT nombre_inarti FROM inv_articulo WHERE ide_inarti = $1`, [ideInarti]);
      const nombre = r2.rows[0]?.nombre_inarti ?? null;
      const compras = lineas.filter((l) => l.producto === nombre).reverse();
      const precios = compras.map((c) => c.precio).filter((p) => p !== null) as number[];
      return {
        producto: nombre,
        unidad: unidades.get(nombre) ?? null,
        periodo_meses: meses,
        veces_comprado: compras.length,
        ...(!compras.length
          ? {
              aviso:
                `No le compramos ${nombre} en el período, pero hay ${new Set(lineas.map((l) => l.factura)).size} factura(s) ` +
                'de otros productos. Si la pregunta no era de este producto, vuelve a llamar sin ide_inarti.',
            }
          : {}),
        ultimo_precio: compras[0]?.precio ?? null,
        ultima_fecha: compras[0]?.fecha ?? null,
        precio_minimo: precios.length ? Math.min(...precios) : null,
        precio_maximo: precios.length ? Math.max(...precios) : null,
        precio_promedio: precios.length ? num(precios.reduce((a, b) => a + b, 0) / precios.length, 4) : null,
        compras: compras.slice(0, 15),
        nota: 'Precios unitarios sin IVA según la factura de compra.',
      };
    }

    // Fechas distintas con compra (varias facturas el mismo día cuentan como una compra).
    const unicas: string[] = [...new Set(lineas.map((l) => String(l.fecha ?? '')).filter(Boolean))].sort();
    const dias = unicas.slice(1).map((f, i) => (Date.parse(f) - Date.parse(unicas[i])) / 86_400_000);
    const promedio = dias.length ? Math.round(dias.reduce((a, b) => a + b, 0) / dias.length) : null;
    const ultima = unicas[unicas.length - 1] ?? null;
    const porProducto = new Map<string, { veces: number; cantidad: number; total: number; ultimaFecha: string | null; ultimoPrecio: number | null }>();
    lineas.forEach((l) => {
      const p = porProducto.get(l.producto) ?? { veces: 0, cantidad: 0, total: 0, ultimaFecha: null, ultimoPrecio: null };
      p.veces++;
      p.cantidad += l.cantidad ?? 0;
      p.total += l.total ?? 0;
      if (l.fecha && (!p.ultimaFecha || l.fecha >= p.ultimaFecha)) {
        p.ultimaFecha = l.fecha;
        p.ultimoPrecio = l.precio;
      }
      porProducto.set(l.producto, p);
    });
    return {
      periodo_meses: meses,
      facturas: new Set(lineas.map((l) => l.factura)).size,
      primera_compra: unicas[0] ?? null,
      ultima_compra: ultima,
      dias_desde_ultima_compra: ultima ? Math.round((Date.now() - Date.parse(ultima)) / 86_400_000) : null,
      dias_promedio_entre_compras: promedio,
      proxima_compra_estimada:
        promedio !== null && ultima ? new Date(Date.parse(ultima) + promedio * 86_400_000).toISOString().slice(0, 10) : null,
      total_comprado_usd: num(lineas.reduce((a, l) => a + (l.total ?? 0), 0)),
      productos_comprados: [...porProducto.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 25)
        .map(([producto, p]) => ({
          producto,
          veces: p.veces,
          cantidad: num(p.cantidad, 3),
          unidad: unidades.get(producto) ?? null,
          ultimo_precio: p.ultimoPrecio,
          ultima_compra: p.ultimaFecha,
          total_usd: num(p.total),
        })),
      nota: 'Compras de toda la empresa a este proveedor (la ficha del proveedor no filtra por sucursal).',
    };
  }

  /** Nombre de un cliente / proveedor (para fijarlo como contexto del chat). */
  async nombrePersona(ideGeper: number, ideEmpr: number): Promise<string | null> {
    if (!ideGeper) return null;
    const r = await this.dataSource.pool
      .query(`SELECT nom_geper FROM gen_persona WHERE ide_geper = $1 AND ide_empr = $2`, [ideGeper, ideEmpr])
      .catch(() => null);
    return r?.rows?.[0]?.nom_geper ?? null;
  }
}
