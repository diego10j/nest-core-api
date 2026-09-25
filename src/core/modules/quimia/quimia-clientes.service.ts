import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { ClientesService } from '../ventas/clientes/clientes.service';
import { TransportesService } from '../ventas/transportes/transportes.service';

import { ProductoQuimia, UsuarioQuimia } from './quimia.types';

const idCliente = {
  ide_geper: { type: 'integer', description: 'ID del cliente (obtenido con buscar_cliente)' },
};

/** Herramientas de clientes y transporte del asistente QuimIA (se suman a HERRAMIENTAS_QUIMIA). */
export const HERRAMIENTAS_CLIENTES: OpenAI.ChatCompletionTool[] = [
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
        'Cuánto debe el cliente: saldo pendiente, monto vencido, facturas por pagar/vencidas, total comprado y cobrado.',
      parameters: { type: 'object', properties: { ...idCliente }, required: ['ide_geper'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compras_cliente',
      description:
        'Compras del cliente (facturas de venta). Con ide_inarti: a qué precio se le vendió ese producto (historial de precios y cantidades). Sin producto: cada cuánto compra (frecuencia), últimas compras y productos que más compra.',
      parameters: {
        type: 'object',
        properties: {
          ...idCliente,
          ide_inarti: { type: 'integer', description: 'Producto (omitir para analizar todas sus compras)' },
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
        'Envíos realizados al cliente: transportista, fecha, factura, costo del flete (estimado y real), peso/cantidad enviada y destinatario.',
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
      description: 'Qué transportistas llevan a una ciudad/cantón o provincia, con sus tarifas configuradas.',
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
        'Costo referencial de enviar un peso a una ciudad: tarifas configuradas de los transportistas y envíos históricos reales de peso similar.',
      parameters: {
        type: 'object',
        properties: {
          ciudad: { type: 'string', description: 'Ciudad, cantón o provincia de destino' },
          peso_kg: { type: 'number', description: 'Peso en kilogramos' },
        },
        required: ['ciudad', 'peso_kg'],
      },
    },
  },
];

export const ESTADOS_CLIENTES: Record<string, string> = {
  buscar_cliente: 'Buscando el cliente…',
  datos_cliente: 'Consultando datos del cliente…',
  deuda_cliente: 'Consultando la cartera del cliente…',
  compras_cliente: 'Analizando las compras del cliente…',
  envios_cliente: 'Consultando envíos…',
  transportes_destino: 'Buscando transportistas…',
  costo_envio: 'Calculando el costo del envío…',
};

const hoy = () => new Date().toISOString().slice(0, 10);
const haceMeses = (meses: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - meses);
  return d.toISOString().slice(0, 10);
};
const num = (v: unknown, dec = 2) => (v === null || v === undefined || v === '' ? null : Number(Number(v).toFixed(dec)));
const fecha = (v: unknown) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null);
const SIN_PAGINAR = { lazy: 'false', schema: 'false' } as const;

/**
 * Consultas de clientes y transporte para QuimIA. Reutiliza ClientesService y TransportesService
 * (exportados por VentasModule); solo la lista de envíos de un cliente es una consulta propia de
 * lectura porque no existe un método equivalente.
 */
@Injectable()
export class QuimiaClientesService {
  constructor(
    private readonly dataSource: DataSourceService,
    private readonly clientes: ClientesService,
    private readonly transportes: TransportesService,
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
        return this.costoEnvio(String(args.ciudad ?? ''), Number(args.peso_kg), usuario);
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
        ultimo_precio: ventas[0]?.precio ?? null,
        ultima_fecha: ventas[0]?.fecha ?? null,
        precio_minimo: precios.length ? Math.min(...precios) : null,
        precio_maximo: precios.length ? Math.max(...precios) : null,
        precio_promedio: precios.length ? num(precios.reduce((a, b) => a + b, 0) / precios.length, 4) : null,
        ventas: ventas.slice(0, 15).map(({ ide_cccfa: _i, ...v }) => v),
        nota: 'Precios unitarios sin IVA según la factura.',
      };
    }

    const facturas = new Map<number, string>();
    lineas.forEach((l) => facturas.set(l.ide_cccfa, l.fecha));
    const fechas = [...new Set([...facturas.values()])].sort();
    const dias = fechas.slice(1).map((f, i) => (Date.parse(f) - Date.parse(fechas[i])) / 86_400_000);
    const promedio = dias.length ? Math.round(dias.reduce((a, b) => a + b, 0) / dias.length) : null;
    const ultima = fechas[fechas.length - 1] ?? null;
    const porProducto = new Map<string, { veces: number; cantidad: number; unidad: string; total: number }>();
    lineas.forEach((l) => {
      const p = porProducto.get(l.producto) ?? { veces: 0, cantidad: 0, unidad: l.unidad, total: 0 };
      p.veces++;
      p.cantidad += l.cantidad ?? 0;
      p.total += l.total_neto ?? 0;
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
        .slice(0, 10)
        .map(([producto, p]) => ({ producto, veces: p.veces, cantidad: num(p.cantidad, 3), unidad: p.unidad, total_usd: num(p.total) })),
      ultimas_facturas: fechas.slice(-8).reverse(),
    };
  }

  private async enviosCliente(ideGeper: number, limite: number, u: UsuarioQuimia) {
    const r = await this.dataSource.pool.query(
      `SELECT f.secuencial_cccfa AS factura,
              COALESCE(e.fecha_envio_cctfa, e.fecha_inicio_cctfa, f.fecha_emisi_cccfa) AS fecha_envio,
              t.nombre_vgtra AS transporte, e.es_transporte_propio_cctfa AS propio,
              e.total_flete_cctfa AS costo_estimado, e.total_flete_real_cctfa AS costo_real,
              e.flete_pagado_cctfa AS flete_pagado, e.destinatario_guia_cctfa AS destinatario,
              (SELECT json_agg(json_build_object('cantidad', s.total, 'unidad', s.siglas) ORDER BY s.total DESC)
                 FROM (SELECT COALESCE(un.siglas_inuni, 'unid.') AS siglas, SUM(d.cantidad_ccdfa) AS total
                         FROM cxc_deta_factura d
                         JOIN inv_articulo a ON a.ide_inarti = d.ide_inarti
                         LEFT JOIN inv_unidad un ON un.ide_inuni = a.ide_inuni
                        WHERE d.ide_cccfa = e.ide_cccfa AND a.hace_kardex_inarti = TRUE
                        GROUP BY COALESCE(un.siglas_inuni, 'unid.')) s) AS enviado
         FROM cxc_transporte_factura e
         JOIN cxc_cabece_factura f ON f.ide_cccfa = e.ide_cccfa
         LEFT JOIN ven_transporte t ON t.ide_vgtra = e.ide_vgtra
        WHERE f.ide_geper = $1 AND e.ide_empr = $2
        ORDER BY fecha_envio DESC
        LIMIT $3`,
      [ideGeper, u.ideEmpr, limite],
    );
    return {
      total: r.rows.length,
      envios: r.rows.map((e) => ({
        fecha: fecha(e.fecha_envio),
        factura: e.factura,
        transporte: e.propio ? 'Transporte propio' : e.transporte,
        costo_estimado: num(e.costo_estimado),
        costo_real: num(e.costo_real),
        flete_pagado: e.flete_pagado,
        destinatario: e.destinatario,
        enviado: (e.enviado ?? []).map((x) => `${num(x.cantidad, 3)} ${x.unidad}`).join(', ') || null,
      })),
    };
  }

  private async transportesDestino(ciudad: string, u: UsuarioQuimia) {
    if (!ciudad.trim()) return { error: 'Indica la ciudad de destino' };
    const rows = await this.transportes.getTransportesPorDestino({ ...u, ciudad_vgttr: ciudad.trim() } as any);
    return {
      destino: ciudad,
      transportes: (rows ?? []).slice(0, 10).map((t) => ({
        transporte: t.label,
        cobertura_nacional: t.cobertura_nacional_vgtra,
        cobra_flete_al_cliente: t.flete_cobro_vgtra,
        envios_realizados: Number(t.num_envios ?? 0),
        tarifas: (t.tarifas ?? []).slice(0, 5).map((tf) => ({
          provincia: tf.nombre_geprov,
          canton: tf.nombre_gecant,
          ciudad: tf.ciudad_vgttr,
          opciones: [1, 2, 3, 4]
            .filter((i) => tf[`activo${i}_vgttr`] !== false && tf[`precio${i}_vgttr`] != null)
            .map((i) => ({
              nombre: tf[`nombre${i}_vgttr`],
              precio: num(tf[`precio${i}_vgttr`]),
              descripcion: tf[`descripcion${i}_vgttr`],
            })),
        })),
      })),
    };
  }

  private async costoEnvio(ciudad: string, pesoKg: number, u: UsuarioQuimia) {
    if (!ciudad.trim() || !(pesoKg > 0)) return { error: 'Indica la ciudad y el peso en kg' };
    const kg = await this.dataSource.pool.query(
      `SELECT ide_inuni FROM inv_unidad WHERE LOWER(TRIM(siglas_inuni)) IN ('kg', 'kgs', 'kilo', 'kilos') ORDER BY ide_inuni LIMIT 1`,
    );
    const [tarifas, historico] = await Promise.all([
      this.transportesDestino(ciudad, u),
      this.transportes
        .consultarTarifas({
          ...u,
          descripcion: ciudad.trim(),
          ...(kg.rows[0] ? { peso: pesoKg, ide_inuni: kg.rows[0].ide_inuni } : {}),
          ...SIN_PAGINAR,
        } as any)
        .catch(() => ({ rows: [], resumenIA: null })),
    ]);
    const envios = ((historico as any)?.rows ?? []).slice(0, 12);
    return {
      destino: ciudad,
      peso_kg: pesoKg,
      tarifas_configuradas: (tarifas as any).transportes ?? [],
      envios_historicos_similares: envios.map((e) => ({
        fecha: fecha(e.fecha_envio),
        transporte: e.nombre_vgtra,
        ciudad: e.nombre_gecant,
        enviado: e.cantidad_unidad_buscada != null ? `${num(e.cantidad_unidad_buscada, 3)} kg` : null,
        costo_real: num(e.costo_real),
        costo_estimado: num(e.costo_estimado),
      })),
      analisis: (historico as any)?.resumenIA ?? null,
    };
  }
}
