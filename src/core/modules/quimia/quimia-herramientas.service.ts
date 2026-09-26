import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

import { BdtConsultaService, DocContexto, DocumentoListado } from '../base-tecnica/bdt-consulta.service';
import { ConfigPreciosProductosService } from '../inventario/productos/config-precios.service';
import { ProductosService } from '../inventario/productos/productos.service';

import { MAX_NOTAS_QUIMIA, NotaQuimia, QuimiaConocimientoService } from './conocimiento/quimia-conocimiento.service';
import {
  ArchivoErpQuimia,
  ImagenProductoQuimia,
  MAX_FOTOS_PRODUCTO,
  QuimiaDocumentosErpService,
  TipoArchivoErp,
} from './erp/quimia-documentos-erp.service';
import { notasContexto } from './prompts/quimia.prompt';
import { ESTADOS_CLIENTES, HERRAMIENTAS_CLIENTES, QuimiaClientesService } from './quimia-clientes.service';
import { QuimiaProductosService } from './quimia-productos.service';
import { EventoQuimia, ProductoQuimia, UsuarioQuimia } from './quimia.types';

/** Estado de una conversación mientras el agente usa herramientas. */
export interface ContextoHerramientas {
  usuario: UsuarioQuimia;
  pregunta: string;
  /** Producto activo (el que eligió el usuario o detectó el backend). */
  producto: ProductoQuimia | null;
  /** Documentos técnicos enviados a la IA (para verificar las citas [D1], [D2]…). */
  docsContexto: DocContexto[];
  /** Documentos listados con link (se muestran como tarjetas / links). */
  documentos: DocumentoListado[];
  /** Último resultado de buscar_producto (para ofrecer botones de selección). */
  ultimaBusqueda: { ide_inarti: number; nombre: string; documentos_tecnicos: number }[];
  herramientasUsadas: string[];
  /** Notas de la base de conocimiento que ve la IA (etiquetas N1, N2… en este orden). */
  notas: NotaQuimia[];
  /** PDFs de facturas/proformas pedidos (tarjetas en el chat, archivos en Telegram). */
  archivos: ArchivoErpQuimia[];
  /** Fotos del producto pedidas (máximo 5). */
  imagenes: ImagenProductoQuimia[];
  emitir: (evento: EventoQuimia) => void;
}

const LIMITE_JSON = 12000;

const idProducto = {
  ide_inarti: {
    type: 'integer',
    description: 'ID del producto. Omitir para usar el producto activo de la conversación.',
  },
};

/**
 * Herramientas (function calling) del asistente QuimIA. Cada una reutiliza servicios existentes
 * del ERP (productos, precios) o de la base técnica, y devuelve datos compactos para la IA.
 */
export const HERRAMIENTAS_QUIMIA: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'buscar_producto',
      description:
        'Busca productos en el catálogo del ERP por nombre, código o nombre alterno. Úsala cuando no hay producto activo o el usuario menciona otro producto.',
      parameters: {
        type: 'object',
        properties: { texto: { type: 'string', description: 'Nombre o código del producto' } },
        required: ['texto'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_base_tecnica',
      description:
        'Información técnica de los documentos del producto (fichas técnicas, certificados de análisis, hojas de seguridad): especificaciones, resultados de lotes, pureza, pH, CAS, seguridad, primeros auxilios, aplicaciones, presentación, origen, fabricante. Los documentos vienen etiquetados [D1], [D2]…',
      parameters: {
        type: 'object',
        properties: {
          ...idProducto,
          pregunta: { type: 'string', description: 'Qué información técnica se busca' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_documentos',
      description:
        'Lista los documentos técnicos del producto con su link para abrirlos: certificados de análisis (COA), fichas técnicas o hojas de seguridad, del más reciente al más antiguo. Úsala cuando pidan "el certificado", "los últimos 3 COA", "la ficha técnica", "la hoja de seguridad" o links.',
      parameters: {
        type: 'object',
        properties: {
          ...idProducto,
          tipo: {
            type: 'string',
            enum: ['CERTIFICADO_ANALISIS', 'FICHA_TECNICA', 'HOJA_SEGURIDAD', 'TODOS'],
          },
          limite: { type: 'integer', description: 'Cuántos documentos (por defecto 3)' },
        },
        required: ['tipo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_stock',
      description: 'Stock actual (existencia) del producto, total y por bodega.',
      parameters: { type: 'object', properties: { ...idProducto } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_proveedores',
      description:
        'Proveedores a los que se ha comprado el producto: número de facturas, primera y última compra, cantidades y montos.',
      parameters: { type: 'object', properties: { ...idProducto } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analizar_compras',
      description:
        'Historial y frecuencia de compras del producto: cada cuánto se compra (días promedio entre compras), cantidad promedio, última compra y próxima compra estimada.',
      parameters: {
        type: 'object',
        properties: { ...idProducto, meses: { type: 'integer', description: 'Meses hacia atrás (por defecto 24)' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_precios',
      description:
        'Costo promedio (precio promedio de compra ponderado), últimos precios de compra por proveedor y precio promedio/mínimo/máximo de venta del producto.',
      parameters: {
        type: 'object',
        properties: { ...idProducto, meses: { type: 'integer', description: 'Meses para las ventas (por defecto 12)' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_configuracion_precios',
      description:
        'Configuración de precios de venta del producto (rangos de cantidad, precio fijo o % de utilidad, forma de pago). Indica si el producto tiene o no configuración.',
      parameters: { type: 'object', properties: { ...idProducto } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cotizar',
      description:
        'Calcula el precio de venta para una cantidad (en la unidad del producto) según la configuración de precios, con y sin IVA, y si hay stock suficiente. Úsala para "a qué precio cotizar 25 kg".',
      parameters: {
        type: 'object',
        properties: { ...idProducto, cantidad: { type: 'number', description: 'Cantidad en la unidad del producto' } },
        required: ['cantidad'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'obtener_documento_pdf',
      description:
        'Genera el PDF de una FACTURA o PROFORMA del ERP por su número ("la factura 1029", "proforma 350", "factura 001-002-000001029") para entregarlo al usuario. El PDF se envía solo: no escribas links.',
      parameters: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['FACTURA', 'PROFORMA'] },
          numero: { type: 'string', description: 'Número tal como lo dijo el usuario (secuencial o completo)' },
          id: { type: 'integer', description: 'Solo si una búsqueda anterior devolvió varias y el usuario eligió una (id)' },
        },
        required: ['tipo', 'numero'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'imagenes_producto',
      description: `Fotos del producto cargadas en su galería (máximo ${MAX_FOTOS_PRODUCTO}). Úsala cuando pidan imágenes, fotos o cómo se ve el producto. Las fotos se muestran solas.`,
      parameters: { type: 'object', properties: { ...idProducto } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_base_conocimiento',
      description:
        'Busca en la base de conocimiento interna (notas del equipo): políticas de venta, productos restringidos o que no se venden, presentaciones permitidas, cuentas bancarias, procedimientos y acuerdos con clientes o proveedores. Las notas vienen etiquetadas [N#].',
      parameters: {
        type: 'object',
        properties: {
          texto: { type: 'string', description: 'Qué se busca (palabras clave)' },
          ide_geper: { type: 'integer', description: 'Cliente/proveedor (de buscar_cliente) para incluir sus notas relacionadas' },
        },
        required: ['texto'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mejores_clientes',
      description: 'Mejores clientes del producto por ventas netas en un periodo.',
      parameters: {
        type: 'object',
        properties: {
          ...idProducto,
          meses: { type: 'integer', description: 'Meses hacia atrás (por defecto 12)' },
          limite: { type: 'integer', description: 'Cuántos clientes (por defecto 10)' },
        },
      },
    },
  },
];

/** Todas las herramientas del agente: productos/base técnica + clientes/transporte. */
export const TODAS_HERRAMIENTAS_QUIMIA: OpenAI.ChatCompletionTool[] = [...HERRAMIENTAS_QUIMIA, ...HERRAMIENTAS_CLIENTES];

const MENSAJE_ESTADO: Record<string, string> = {
  ...ESTADOS_CLIENTES,
  buscar_producto: 'Buscando el producto…',
  buscar_base_conocimiento: 'Revisando la base de conocimiento…',
  obtener_documento_pdf: 'Generando el PDF…',
  imagenes_producto: 'Buscando las fotos del producto…',
  consultar_base_tecnica: 'Revisando la documentación técnica…',
  listar_documentos: 'Buscando los documentos…',
  consultar_stock: 'Consultando el stock…',
  consultar_proveedores: 'Consultando proveedores…',
  analizar_compras: 'Analizando el historial de compras…',
  consultar_precios: 'Consultando precios…',
  consultar_configuracion_precios: 'Revisando la configuración de precios…',
  cotizar: 'Calculando el precio…',
  mejores_clientes: 'Buscando los mejores clientes…',
};

const hoy = () => new Date().toISOString().slice(0, 10);
const haceMeses = (meses: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - meses);
  return d.toISOString().slice(0, 10);
};
const num = (v: unknown, decimales = 4) => (v === null || v === undefined || v === '' ? null : Number(Number(v).toFixed(decimales)));
const fecha = (v: unknown) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null);
/** Opciones para llamar a los servicios de consulta sin paginación ni esquema de columnas. */
const SIN_PAGINAR = { lazy: 'false', schema: 'false' } as const;

@Injectable()
export class QuimiaHerramientasService {
  private readonly logger = new Logger(QuimiaHerramientasService.name);

  constructor(
    private readonly productos: ProductosService,
    private readonly configPrecios: ConfigPreciosProductosService,
    private readonly bdtConsulta: BdtConsultaService,
    private readonly quimiaProductos: QuimiaProductosService,
    private readonly quimiaClientes: QuimiaClientesService,
    private readonly conocimiento: QuimiaConocimientoService,
    private readonly documentosErp: QuimiaDocumentosErpService,
  ) {}

  /** Ejecuta una herramienta y devuelve el texto (JSON compacto) que recibe la IA. */
  async ejecutar(nombre: string, argsJson: string, ctx: ContextoHerramientas): Promise<string> {
    let args: Record<string, any> = {};
    try {
      args = JSON.parse(argsJson || '{}');
    } catch {
      return JSON.stringify({ error: 'Argumentos inválidos' });
    }
    ctx.herramientasUsadas.push(nombre);
    ctx.emitir({ tipo: 'estado', texto: MENSAJE_ESTADO[nombre] ?? 'Consultando…' });

    try {
      if (nombre === 'buscar_producto') return this.json(await this.buscarProducto(args.texto, ctx));
      if (nombre === 'buscar_base_conocimiento') return await this.buscarConocimiento(args, ctx);
      if (nombre === 'obtener_documento_pdf') return this.json(await this.documentoPdf(args, ctx));
      // Clientes y transporte no requieren producto activo (compras_cliente lo recibe si aplica).
      if (this.quimiaClientes.esHerramienta(nombre)) {
        return this.json(await this.quimiaClientes.ejecutar(nombre, args, ctx.usuario, ctx.producto));
      }

      const producto = await this.resolverProducto(args.ide_inarti, ctx);
      if (!producto) {
        return this.json({
          error: 'No hay un producto definido. Usa buscar_producto o pide al usuario que indique el producto.',
        });
      }
      const u = ctx.usuario;
      const base = { ...u, ide_inarti: producto.ide_inarti, ...SIN_PAGINAR };

      switch (nombre) {
        case 'consultar_base_tecnica': {
          const r = await this.bdtConsulta.construirContexto(
            producto.ide_inarti,
            u.ideEmpr,
            args.pregunta || ctx.pregunta,
            producto.nombre,
          );
          if (!r.docs.length) {
            return this.json({ producto: producto.nombre, sin_documentos: true, mensaje: 'El producto no tiene documentos técnicos procesados en la base técnica.' });
          }
          // Las etiquetas D1, D2… se mantienen únicas si la herramienta se llama más de una vez.
          ctx.docsContexto = r.docs;
          return r.texto;
        }

        case 'listar_documentos': {
          const tipo = args.tipo && args.tipo !== 'TODOS' ? args.tipo : null;
          const limite = Number(args.limite) || 3;
          const docs = await this.bdtConsulta.listarDocumentos(producto.ide_inarti, u.ideEmpr, tipo, limite);
          // Respaldo: adjuntos del producto aún no procesados en la base técnica (link directo).
          const sinProcesar =
            docs.length < limite
              ? await this.bdtConsulta.listarAdjuntosSinProcesar(producto.ide_inarti, u.ideEmpr, tipo, limite - docs.length)
              : [];
          const todos = [...docs, ...sinProcesar];
          ctx.documentos.push(
            ...todos.filter((d) => !ctx.documentos.some((x) => x.url === d.url)),
          );
          return this.json({
            producto: producto.nombre,
            total: todos.length,
            nota:
              'Los links se muestran automáticamente al usuario como botones/tarjetas; no escribas URL. ' +
              (sinProcesar.length
                ? 'Los marcados sin_procesar son adjuntos del producto aún no leídos por la base técnica (el tipo se dedujo del nombre del archivo): entrégalos igual.'
                : '') +
              (!todos.length ? 'No hay documentos de ese tipo adjuntos al producto.' : ''),
            documentos: todos.map(({ tipo_etiqueta, archivo, fecha: f, lote, fabricante, estado }) => ({
              tipo: tipo_etiqueta,
              archivo,
              fecha: f,
              lote,
              fabricante,
              pendiente_revision: estado === 'REVISION',
              sin_procesar: estado === 'SIN_PROCESAR',
            })),
          });
        }

        case 'consultar_stock': {
          const [total, porBodega] = await Promise.all([
            this.productos.getStock(producto.ide_inarti),
            this.productos.getSaldoPorBodega(base as any),
          ]);
          return this.json({
            producto: producto.nombre,
            fecha: hoy(),
            stock_total: num(total?.saldo, 3) ?? 0,
            unidad: total?.siglas_inuni ?? null,
            por_bodega: (porBodega.rows ?? [])
              .filter((b) => Number(b.saldo) !== 0)
              .map((b) => ({ bodega: b.nombre_inbod, saldo: num(b.saldo, 3), unidad: b.siglas_inuni })),
          });
        }

        case 'consultar_proveedores': {
          const r = await this.productos.getProveedoresProducto(base as any);
          return this.json({
            producto: producto.nombre,
            proveedores: (r.rows ?? []).slice(0, 12).map((p) => ({
              proveedor: p.nom_geper,
              facturas: Number(p.num_facturas),
              primera_compra: fecha(p.fecha_primer_compra),
              ultima_compra: fecha(p.fecha_ultima_compra),
              cantidad_neta: num(p.cantidad_neta, 3),
              unidad: p.siglas_inuni,
              total_neto_usd: num(p.total_neto, 2),
            })),
          });
        }

        case 'analizar_compras':
          return this.json(await this.analizarCompras(producto, base, Number(args.meses) || 24));

        case 'consultar_precios': {
          const meses = Number(args.meses) || 12;
          const [costo, ultimos, ventas] = await Promise.all([
            this.productos.getCostoProducto({ ...base, fecha: hoy() } as any),
            this.productos.getUltimosPreciosCompras(base as any),
            this.productos.getKpiVentasProducto({ ...base, fechaInicio: haceMeses(meses), fechaFin: hoy() } as any),
          ]);
          return this.json({
            producto: producto.nombre,
            costo_promedio_compra: num(costo?.costo_calculado),
            tipo_costo: costo?.tipo_costo_usado,
            ultimos_precios_compra_por_proveedor: (ultimos.rows ?? []).slice(0, 8).map((x) => ({
              proveedor: x.nom_geper,
              fecha: fecha(x.fecha_ultima_compra),
              precio: num(x.precio),
              cantidad: num(x.cantidad, 3),
            })),
            ventas_ultimos_meses: meses,
            precio_venta_promedio: num(ventas?.precio_promedio),
            precio_venta_minimo: num(ventas?.precio_minimo),
            precio_venta_maximo: num(ventas?.precio_maximo),
            cantidad_vendida: num(ventas?.cantidad_neta_total, 3),
            clientes: Number(ventas?.total_clientes ?? 0),
            ultima_venta: fecha(ventas?.fecha_ultima_venta),
          });
        }

        case 'consultar_configuracion_precios': {
          const r = await this.configPrecios.getConfigPreciosProducto({ ...base, activos: 'true' } as any);
          const rows = r.rows ?? [];
          return this.json({
            producto: producto.nombre,
            tiene_configuracion: rows.length > 0,
            configuraciones: rows.slice(0, 20).map((c) => ({
              rango: c.rangos_incpa
                ? `${num(c.rango1_cant_incpa, 3)} a ${c.rango_infinito_incpa ? 'más' : num(c.rango2_cant_incpa, 3)} ${c.siglas_inuni ?? ''}`.trim()
                : 'sin rango',
              precio_fijo: num(c.precio_fijo_incpa),
              porcentaje_utilidad: num(c.porcentaje_util_incpa, 2),
              incluye_iva: c.incluye_iva_incpa,
              forma_pago: [c.nombre_cncfp, c.nombre_cndfp].filter(Boolean).join(' / ') || null,
              autorizado: c.autorizado_incpa,
              observacion: c.observacion_incpa,
            })),
          });
        }

        case 'cotizar': {
          const cantidad = Number(args.cantidad);
          if (!(cantidad > 0)) return this.json({ error: 'La cantidad debe ser mayor a 0' });
          const [precios, stock] = await Promise.all([
            this.configPrecios.getPrecioVentaProducto({ ...u, ide_inarti: producto.ide_inarti, cantidad } as any),
            this.productos.getStock(producto.ide_inarti),
          ]);
          const rows = (precios as any[]) ?? [];
          const saldo = Number(stock?.saldo ?? 0);
          const tieneConfig = rows.some((p) => p.precio_venta_sin_iva != null);
          if (!tieneConfig) {
            return this.json({
              producto: producto.nombre,
              cantidad,
              unidad: stock?.siglas_inuni ?? null,
              stock_disponible: num(saldo, 3),
              stock_suficiente: saldo >= cantidad,
              tiene_precio_configurado: false,
              ...(await this.ventasSimilares(base, cantidad)),
            });
          }
          return this.json({
            producto: producto.nombre,
            cantidad,
            unidad: stock?.siglas_inuni ?? null,
            stock_disponible: num(saldo, 3),
            stock_suficiente: saldo >= cantidad,
            tiene_precio_configurado: rows.some((p) => p.precio_venta_sin_iva != null),
            precios: rows.slice(0, 10).map((p) => ({
              forma_pago: [p.nombre_cncfp, p.nombre_cndfp].filter(Boolean).join(' / ') || null,
              precio_unitario_sin_iva: num(p.precio_venta_sin_iva),
              precio_unitario_con_iva: num(p.precio_venta_con_iva),
              porcentaje_iva: num(p.porcentaje_iva, 2),
              total_sin_iva: p.precio_venta_sin_iva != null ? num(Number(p.precio_venta_sin_iva) * cantidad, 2) : null,
              total_con_iva: p.precio_venta_con_iva != null ? num(Number(p.precio_venta_con_iva) * cantidad, 2) : null,
              tipo_configuracion: p.tipo_configuracion,
              utilidad_porcentaje: num(p.porcentaje_utilidad, 2),
            })),
          });
        }

        case 'imagenes_producto': {
          const r = await this.documentosErp.fotosProducto(producto.ide_inarti, u.ideEmpr);
          if (!r.fotos.length) {
            return this.json({ producto: producto.nombre, total: 0, mensaje: 'El producto no tiene imágenes cargadas.' });
          }
          ctx.imagenes = r.fotos.map((archivo) => ({ archivo, producto: producto.nombre }));
          return this.json({
            producto: producto.nombre,
            total: r.fotos.length,
            mensaje: `Las fotos se adjuntan solas. Responde en una línea, ej.: "Te envío ${r.fotos.length === 1 ? 'la foto' : `las ${r.fotos.length} fotos`} de ${producto.nombre}."`,
          });
        }

        case 'mejores_clientes': {
          const meses = Number(args.meses) || 12;
          const r = await this.productos.getTopClientesProducto({
            ...base,
            fechaInicio: haceMeses(meses),
            fechaFin: hoy(),
            limit: Math.min(Number(args.limite) || 10, 30),
          } as any);
          return this.json({
            producto: producto.nombre,
            periodo: `${haceMeses(meses)} a ${hoy()}`,
            clientes: (r.rows ?? []).map((c) => ({
              cliente: c.cliente,
              facturas: Number(c.num_facturas),
              ventas_netas_usd: num(c.total_ventas_netas, 2),
              porcentaje: num(c.porcentaje, 2),
            })),
          });
        }

        default:
          return this.json({ error: `Herramienta desconocida: ${nombre}` });
      }
    } catch (error) {
      this.logger.error(`Herramienta ${nombre}: ${error?.message}`, error?.stack);
      return this.json({ error: `No se pudo consultar (${nombre}). Indícalo al usuario.` });
    }
  }

  /**
   * Sin configuración de precios: ventas del producto en cantidades similares (±30%, mismo criterio
   * que "Ventas" del producto) de los últimos 24 meses. Últimas 10 + máximo, mínimo y promedio.
   */
  private async ventasSimilares(base: Record<string, any>, cantidad: number) {
    const r = await this.productos.getVentasProducto({ ...base, fechaInicio: haceMeses(24), fechaFin: hoy(), cantidad } as any);
    const ventas = ((r as any)?.rows ?? [])
      .filter((v: any) => v.estado_venta !== 'TOTALMENTE_DEVUELTA' && Number(v.precio_ccdfa) > 0)
      .slice(0, 10)
      .map((v: any) => ({
        fecha: fecha(v.fecha_emisi_cccfa),
        factura: v.secuencial_cccfa,
        cliente: v.nom_geper,
        cantidad: num(v.cantidad_ccdfa, 3),
        unidad: v.siglas_inuni,
        precio_unitario: num(v.precio_ccdfa),
      }));
    if (!ventas.length) {
      return {
        ventas_similares: [],
        instruccion:
          'Indica que el producto no tiene configuración de precios y que no hay ventas en cantidades similares ' +
          '(±30%) en los últimos 24 meses para sugerir un precio.',
      };
    }
    const max = ventas.reduce((a, b) => (b.precio_unitario > a.precio_unitario ? b : a));
    const min = ventas.reduce((a, b) => (b.precio_unitario < a.precio_unitario ? b : a));
    const totalCant = ventas.reduce((s, v) => s + (v.cantidad ?? 0), 0);
    const promedio = totalCant
      ? ventas.reduce((s, v) => s + v.precio_unitario * (v.cantidad ?? 0), 0) / totalCant
      : ventas.reduce((s, v) => s + v.precio_unitario, 0) / ventas.length;
    return {
      ventas_similares: ventas,
      precio_maximo: { precio_unitario: max.precio_unitario, cantidad: max.cantidad, fecha: max.fecha, cliente: max.cliente },
      precio_minimo: { precio_unitario: min.precio_unitario, cantidad: min.cantidad, fecha: min.fecha, cliente: min.cliente },
      precio_promedio_sugerido: num(promedio),
      total_sugerido_sin_iva: num(promedio * cantidad, 2),
      instruccion:
        'Responde: "No encontré configuración de precios para este producto, pero las últimas ventas en cantidades ' +
        'similares son:" y lista las ventas (fecha, cliente, cantidad, precio unitario; en el chat del ERP como tabla). ' +
        'Al final: precio máximo (con su cantidad), precio mínimo (con su cantidad) y precio promedio sugerido ' +
        '(ponderado por cantidad) con el total para la cantidad pedida. Precios sin IVA.',
    };
  }

  /** Factura/proforma por número: una coincidencia → se entrega el PDF; varias → la IA pregunta cuál. */
  private async documentoPdf(args: Record<string, any>, ctx: ContextoHerramientas) {
    const tipo: TipoArchivoErp = args.tipo === 'PROFORMA' ? 'PROFORMA' : 'FACTURA';
    const numero = String(args.numero ?? '').trim();
    const encontrados =
      tipo === 'FACTURA'
        ? await this.documentosErp.buscarFacturas(numero, ctx.usuario.ideEmpr, ctx.usuario.ideSucu)
        : await this.documentosErp.buscarProformas(numero, ctx.usuario.ideEmpr);
    const elegido = args.id ? encontrados.find((d) => d.id === Number(args.id)) : encontrados.length === 1 ? encontrados[0] : null;
    const etiqueta = tipo === 'FACTURA' ? 'factura' : 'proforma';
    if (!encontrados.length) return { encontrado: false, mensaje: `No existe una ${etiqueta} con el número ${numero}.` };
    if (!elegido) {
      return {
        encontrado: false,
        varias: encontrados,
        mensaje: `Hay ${encontrados.length} ${etiqueta}s con ese número (distinta serie o fecha). Pregunta cuál (muestra número completo, fecha, cliente y total).`,
      };
    }
    const archivo = this.documentosErp.archivoDe(tipo, elegido);
    if (!ctx.archivos.some((a) => a.tipo === tipo && a.id === archivo.id)) ctx.archivos.push(archivo);
    return {
      encontrado: true,
      documento: { ...elegido, tipo },
      mensaje: 'El PDF se entrega automáticamente como archivo: confirma brevemente qué documento es (número, cliente, fecha, total).',
    };
  }

  /** Notas nuevas se agregan a ctx.notas con etiquetas que continúan la numeración (N6, N7…). */
  private async buscarConocimiento(args: Record<string, any>, ctx: ContextoHerramientas): Promise<string> {
    const encontradas = await this.conocimiento.buscar(
      String(args.texto || ctx.pregunta),
      ctx.usuario.ideEmpr,
      { ide_inarti: ctx.producto?.ide_inarti, ide_geper: Number(args.ide_geper) || null },
      MAX_NOTAS_QUIMIA,
    );
    if (!encontradas.length) return this.json({ total: 0, mensaje: 'No hay notas en la base de conocimiento sobre esto.' });
    const etiquetas = encontradas.map((n) => {
      let i = ctx.notas.findIndex((x) => x.ide_cono === n.ide_cono);
      if (i < 0) {
        ctx.notas.push(n);
        i = ctx.notas.length - 1;
      }
      return i;
    });
    return etiquetas
      .map((i) => notasContexto([ctx.notas[i]], i))
      .join('\n\n');
  }

  private async buscarProducto(texto: string, ctx: ContextoHerramientas) {
    const resultados = await this.quimiaProductos.buscar(texto, ctx.usuario);
    ctx.ultimaBusqueda = resultados.map((p) => ({
      ide_inarti: p.ide_inarti,
      nombre: p.nombre,
      documentos_tecnicos: p.documentos_tecnicos,
    }));
    // Con una sola coincidencia exacta se fija el producto; una aproximada la confirma la IA.
    if (resultados.length === 1 && resultados[0].parecido === undefined) this.fijarProducto(ctx, resultados[0]);
    const aproximada = resultados.some((p) => p.parecido !== undefined);
    return {
      total: resultados.length,
      ...(aproximada
        ? {
            nota:
              'No hubo coincidencia exacta: son productos de nombre PARECIDO (posible error de escritura o de ' +
              'transcripción). Si hay uno claramente igual a lo pedido úsalo indicando el nombre correcto; si no, ' +
              `empieza con ${'[ELEGIR_PRODUCTO]'} para que el usuario elija.`,
          }
        : {}),
      productos: resultados.map((p) => ({
        ide_inarti: p.ide_inarti,
        nombre: p.nombre,
        codigo: p.codigo,
        unidad: p.unidad,
        stock: p.stock,
        tiene_documentos_tecnicos: p.documentos_tecnicos > 0,
        ...(p.parecido !== undefined ? { parecido: p.parecido } : {}),
      })),
    };
  }

  /** Producto de la herramienta: el que pide la IA o el activo; si no había activo, lo fija. */
  private async resolverProducto(ideInarti: number | undefined, ctx: ContextoHerramientas): Promise<ProductoQuimia | null> {
    if (!ideInarti || ideInarti === ctx.producto?.ide_inarti) return ctx.producto;
    const p = await this.quimiaProductos.getProducto(Number(ideInarti), ctx.usuario.ideEmpr);
    if (p && !ctx.producto) this.fijarProducto(ctx, p);
    return p;
  }

  private fijarProducto(ctx: ContextoHerramientas, p: ProductoQuimia) {
    ctx.producto = { ide_inarti: p.ide_inarti, nombre: p.nombre };
    ctx.emitir({ tipo: 'producto', ...ctx.producto });
  }

  /** Frecuencia de compra calculada a partir de las compras del kardex (servicio existente). */
  private async analizarCompras(producto: ProductoQuimia, base: Record<string, any>, meses: number) {
    const r = await this.productos.getComprasProducto({ ...base, fechaInicio: haceMeses(meses), fechaFin: hoy() } as any);
    const compras = (r.rows ?? []).map((c) => ({
      fecha: fecha(c.fecha_emisi_cpcfa),
      proveedor: c.nom_geper,
      cantidad: Number(c.cantidad_cpdfa),
      precio: num(c.precio_cpdfa),
      unidad: c.siglas_inuni,
    }));
    if (!compras.length) {
      return { producto: producto.nombre, periodo_meses: meses, compras: 0, mensaje: 'Sin compras en el periodo' };
    }

    // Varias líneas del mismo día = una sola compra.
    const fechas = [...new Set(compras.map((c) => c.fecha))].sort();
    const dias = fechas.slice(1).map((f, i) => (Date.parse(f) - Date.parse(fechas[i])) / 86_400_000);
    const promedioDias = dias.length ? Math.round(dias.reduce((a, b) => a + b, 0) / dias.length) : null;
    const ultima = fechas[fechas.length - 1];
    const cantidadTotal = compras.reduce((a, c) => a + c.cantidad, 0);
    const porProveedor = new Map<string, number>();
    compras.forEach((c) => porProveedor.set(c.proveedor, (porProveedor.get(c.proveedor) ?? 0) + 1));
    const proxima =
      promedioDias !== null ? new Date(Date.parse(ultima) + promedioDias * 86_400_000).toISOString().slice(0, 10) : null;

    return {
      producto: producto.nombre,
      periodo_meses: meses,
      compras: fechas.length,
      primera_compra: fechas[0],
      ultima_compra: ultima,
      dias_desde_ultima_compra: Math.round((Date.now() - Date.parse(ultima)) / 86_400_000),
      dias_promedio_entre_compras: promedioDias,
      dias_minimo_entre_compras: dias.length ? Math.min(...dias) : null,
      dias_maximo_entre_compras: dias.length ? Math.max(...dias) : null,
      proxima_compra_estimada: proxima,
      cantidad_total: num(cantidadTotal, 3),
      cantidad_promedio_por_compra: num(cantidadTotal / fechas.length, 3),
      unidad: compras[0].unidad,
      compras_por_proveedor: Object.fromEntries(porProveedor),
      ultimas_compras: compras.slice(0, 10),
    };
  }

  private json(data: unknown): string {
    const s = JSON.stringify(data);
    return s.length > LIMITE_JSON ? `${s.slice(0, LIMITE_JSON)}… (recortado)` : s;
  }
}
