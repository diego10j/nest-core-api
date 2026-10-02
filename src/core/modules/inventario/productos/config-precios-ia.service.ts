import { BadRequestException, Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { DeleteQuery } from 'src/core/connection/helpers';
import { GptService } from 'src/core/integration/gpt/gpt.service';
import { CoreService } from 'src/core/core.service';

import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery } from '../../../connection/helpers/select-query';

import { AplicarConfigPreciosIaDto, ProponerConfigPreciosIaDto } from './dto/config-precios-ia.dto';

/** RUC entre los que se hizo el traspaso por cambio de razón social: no son ventas reales. */
const RUC_EXCLUIDOS = ['1719020883001', '1793234926001'];
const MAX_CONFIGURACIONES = 15;
const MAX_POR_TIPO = 6;
const PREFIJO_OBSERVACION = 'Config IA';

type Linea = {
  tipo: number | null;
  nombreTipo: string;
  medio: string;
  cantidad: number;
  precio: number;
  costo: number;
  valida: boolean;
};

type TierIa = {
  ide_cncfp: number | null;
  desde: number;
  hasta: number | null;
  modo: 'utilidad' | 'fijo';
  razon: string;
};

type RespuestaIa = {
  resumen: string;
  advertencias: string[];
  configuraciones: TierIa[];
};

export type ConfigPrecioPropuesta = {
  ide_cncfp: number | null;
  nombre_cncfp: string;
  rango1: number;
  rango2: number | null;
  rango_infinito: boolean;
  modo: 'utilidad' | 'fijo';
  /** % de utilidad (modo utilidad) o precio sin IVA (modo fijo): calculado con los datos, no por el modelo. */
  valor: number;
  ventas: number;
  /** % de las ventas del rango que coinciden con el valor propuesto (±3 % en precio o ±5 puntos en margen). */
  coherencia: number;
  margen_min: number;
  margen_max: number;
  precio_min: number;
  precio_max: number;
  razon: string;
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

function mediana(valores: number[]): number {
  const s = [...valores].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function percentil(valores: number[], p: number): number {
  const s = [...valores].sort((a, b) => a - b);
  if (s.length === 0) return 0;
  return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))];
}

const margenLinea = (l: Linea) => ((l.precio - l.costo) / l.costo) * 100;

/** Margen del conjunto: utilidad total / costo total (ponderado por el valor vendido). */
function margenPonderado(lineas: Linea[]): number {
  const costo = lineas.reduce((a, l) => a + l.costo * l.cantidad, 0);
  const util = lineas.reduce((a, l) => a + (l.precio - l.costo) * l.cantidad, 0);
  return costo > 0 ? (util / costo) * 100 : 0;
}

const ESQUEMA_RESPUESTA = {
  type: 'object',
  additionalProperties: false,
  required: ['resumen', 'advertencias', 'configuraciones'],
  properties: {
    resumen: { type: 'string' },
    advertencias: { type: 'array', items: { type: 'string' } },
    configuraciones: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ide_cncfp', 'desde', 'hasta', 'modo', 'razon'],
        properties: {
          ide_cncfp: { type: ['integer', 'null'] },
          desde: { type: 'number' },
          hasta: { type: ['number', 'null'] },
          modo: { type: 'string', enum: ['utilidad', 'fijo'] },
          razon: { type: 'string' },
        },
      },
    },
  },
};

const PROMPT_SISTEMA = `Eres un analista de precios de una empresa distribuidora de productos químicos en Ecuador.
Recibes el historial de ventas de UN producto, resumido por tipo de pago y por cantidad vendida. Para cada nivel de cantidad
verás: número de ventas, precio unitario sin IVA (mediana, mínimo y máximo), costo unitario promedio y margen de utilidad
sobre el costo (ponderado, mínimo y máximo). Todos los números ya están calculados correctamente: NO los recalcules.

Tu trabajo es detectar CÓMO se fijó realmente el precio y proponer la configuración de precios MÁS SIMPLE que lo reproduzca:
1. Escalones por cantidad: busca las cantidades donde el nivel de precio o de margen cambia de forma sostenida (varias ventas
   seguidas), no por una venta aislada. Ignora ventas atípicas (descuentos puntuales, errores, clientes especiales). Prefiere
   pocos rangos claros; no abras un rango por cada cantidad ni por diferencias pequeñas.
2. Modo de cada rango:
   - "fijo": el PRECIO unitario es prácticamente constante dentro del rango (variación menor a ~3 %) aunque el margen cambie
     porque cambió el costo. Es una lista de precios.
   - "utilidad": el MARGEN es estable y el precio se mueve junto con el costo. Es una política de utilidad sobre el costo.
   Si ambos son estables elige "fijo" cuando el costo cambió poco, y "utilidad" cuando el costo cambió bastante.
3. Tipos de pago: configura cada tipo (por ejemplo Contado, Crédito) que tenga ventas suficientes (4 o más líneas válidas).
   Un tipo con muy pocas ventas no merece configuración propia: no lo incluyas (su ide_cncfp no debe aparecer). Solo usa
   ide_cncfp = null (configuración genérica para cualquier tipo de pago) si aporta algo para tipos sin ventas suficientes.
   Si dos tipos de pago siguen el mismo patrón igualmente genera las configuraciones de cada tipo.
4. Reglas obligatorias: por cada tipo, los rangos son consecutivos, el primero empieza en 0 y el último termina en null
   (sin límite). "desde" de cada rango posterior debe ser una cantidad que exista en los datos. "hasta" de un rango puede
   ponerse en null salvo que sea el último; el sistema lo ajusta. Máximo 6 rangos por tipo y 15 en total.
5. En "razon" explica en una frase corta y concreta qué patrón viste (ej. "Precio estable en $4,50 hasta 20 L; desde 20 L baja
   a $4,20"). En "resumen" resume el hallazgo general en 2-3 frases. En "advertencias" lista cosas que el usuario debe revisar
   (pocos datos, costos que cambiaron mucho, márgenes negativos o cercanos a cero, patrones contradictorios). Escribe en español.`;

@Injectable()
export class ConfigPreciosIaService {
  constructor(
    private readonly dataSource: DataSourceService,
    private readonly core: CoreService,
    private readonly gpt: GptService,
  ) {}

  /** Líneas de factura del producto con costo PPMP y precio neto sin IVA, ya depuradas de traspasos. */
  private async obtenerLineas(dto: ProponerConfigPreciosIaDto, ideEmpr: number) {
    const query = new SelectQuery(`
      WITH facturas_con_nota AS (
          SELECT lpad(cf.secuencial_cccfa::text, 9, '0') AS secuencial_padded,
                 SUM(cdn.valor_cpdno) AS valor_nota_credito
          FROM cxp_cabecera_nota cn
          JOIN cxp_detalle_nota cdn ON cn.ide_cpcno = cdn.ide_cpcno
          JOIN cxc_cabece_factura cf ON cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
          WHERE cn.fecha_emisi_cpcno BETWEEN $2::date AND $3::date
            AND cn.ide_cpeno = 1
            AND cdn.ide_inarti = $1
            AND cn.ide_empr = cf.ide_empr
            AND cn.ide_sucu = cf.ide_sucu
          GROUP BY lpad(cf.secuencial_cccfa::text, 9, '0')
      )
      SELECT
          fpg.ide_cncfp AS tipo,
          cp.nombre_cncfp AS nombre_tipo,
          fpg.nombre_cndfp AS medio,
          cdf.cantidad_ccdfa::float8 AS cantidad,
          (CASE WHEN cdf.iva_inarti_ccdfa = -1
                THEN (cdf.total_ccdfa / cdf.cantidad_ccdfa)
                     / (1 + COALESCE(NULLIF(CASE WHEN cf.tarifa_iva_cccfa > 1 THEN cf.tarifa_iva_cccfa / 100
                                                 ELSE cf.tarifa_iva_cccfa END, 0), 0.15))
                ELSE cdf.total_ccdfa / cdf.cantidad_ccdfa END)::float8 AS precio,
          ppmp.costo_unitario::float8 AS costo,
          (iart.hace_kardex_inarti IS TRUE
             AND COALESCE(ppmp.costo_unitario, 0) > 0
             AND COALESCE(fn.valor_nota_credito, 0) = 0
             AND cdf.total_ccdfa > 0) AS valida
      FROM cxc_deta_factura cdf
      JOIN cxc_cabece_factura cf ON cf.ide_cccfa = cdf.ide_cccfa
      JOIN inv_articulo iart ON iart.ide_inarti = cdf.ide_inarti
      JOIN gen_persona per ON per.ide_geper = cf.ide_geper
      LEFT JOIN con_deta_forma_pago fpg ON fpg.ide_cndfp = cf.ide_cndfp1
      LEFT JOIN con_cabece_forma_pago cp ON cp.ide_cncfp = fpg.ide_cncfp
      LEFT JOIN facturas_con_nota fn ON fn.secuencial_padded = lpad(cf.secuencial_cccfa::text, 9, '0')
      LEFT JOIN LATERAL (
          SELECT p.costo_unitario
          FROM f_costo_unitario_ppmp(${ideEmpr}, cf.ide_sucu, cdf.ide_inarti, cf.fecha_emisi_cccfa) p
      ) ppmp ON TRUE
      WHERE cf.ide_ccefa = 0
        AND cf.fecha_emisi_cccfa BETWEEN $2::date AND $3::date
        AND cf.ide_empr = ${ideEmpr}
        AND cdf.ide_inarti = $1
        AND cdf.cantidad_ccdfa > 0
        AND per.identificac_geper NOT IN (${RUC_EXCLUIDOS.map((r) => `'${r}'`).join(', ')})
    `);
    query.addParam(1, dto.ide_inarti);
    query.addParam(2, dto.fechaInicio);
    query.addParam(3, dto.fechaFin);
    query.setLazy(false);
    const filas = (await this.dataSource.createSelectQuery(query)) as any[];

    return filas.map<Linea>((f) => ({
      tipo: f.tipo === null || f.tipo === undefined ? null : Number(f.tipo),
      nombreTipo: f.nombre_tipo ?? 'Sin forma de pago',
      medio: f.medio ?? 'Sin forma de pago',
      cantidad: Number(f.cantidad),
      precio: Number(f.precio),
      costo: Number(f.costo) || 0,
      valida: f.valida === true,
    }));
  }

  /** Resumen por tipo de pago y cantidad que se le entrega al modelo (todo calculado aquí, no por el modelo). */
  private resumirParaModelo(lineas: Linea[]) {
    const tipos = new Map<string, Linea[]>();
    lineas.forEach((l) => {
      const clave = String(l.tipo);
      tipos.set(clave, [...(tipos.get(clave) ?? []), l]);
    });

    return [...tipos.values()].map((grupo) => {
      const validas = grupo.filter((l) => l.valida);
      const porCantidad = new Map<number, Linea[]>();
      validas.forEach((l) => porCantidad.set(l.cantidad, [...(porCantidad.get(l.cantidad) ?? []), l]));

      const medios: Record<string, number> = {};
      grupo.forEach((l) => {
        medios[l.medio] = (medios[l.medio] ?? 0) + 1;
      });

      return {
        ide_cncfp: grupo[0].tipo,
        tipo_de_pago: grupo[0].nombreTipo,
        lineas_totales: grupo.length,
        lineas_validas: validas.length,
        medios_de_pago: medios,
        niveles: [...porCantidad.entries()]
          .sort((a, b) => a[0] - b[0])
          .slice(0, 150)
          .map(([cantidad, ls]) => ({
            cantidad,
            ventas: ls.length,
            precio_mediana: r4(mediana(ls.map((l) => l.precio))),
            precio_min: r4(Math.min(...ls.map((l) => l.precio))),
            precio_max: r4(Math.max(...ls.map((l) => l.precio))),
            costo_promedio: r4(ls.reduce((a, l) => a + l.costo, 0) / ls.length),
            margen_pct: r2(margenPonderado(ls)),
            margen_min: r2(Math.min(...ls.map(margenLinea))),
            margen_max: r2(Math.max(...ls.map(margenLinea))),
          })),
      };
    });
  }

  /** Ajusta lo que propone el modelo a rangos válidos y continuos por tipo, sin confiar en sus números. */
  private normalizar(tiers: TierIa[], tiposDisponibles: Set<number | null>, paso: number): TierIa[] {
    const porTipo = new Map<number | null, TierIa[]>();
    tiers
      .filter((t) => tiposDisponibles.has(t.ide_cncfp))
      .forEach((t) => porTipo.set(t.ide_cncfp, [...(porTipo.get(t.ide_cncfp) ?? []), t]));

    const salida: TierIa[] = [];
    porTipo.forEach((lista) => {
      const ordenados = [...lista]
        .map((t) => ({ ...t, desde: Math.max(0, Number(t.desde) || 0) }))
        .sort((a, b) => a.desde - b.desde)
        // dos rangos que empiezan en la misma cantidad son uno solo: se conserva el primero
        .filter((t, i, arr) => i === 0 || t.desde > arr[i - 1].desde)
        .slice(0, MAX_POR_TIPO);
      ordenados.forEach((t, i) => {
        const siguiente = ordenados[i + 1];
        salida.push({
          ...t,
          desde: i === 0 ? 0 : t.desde,
          hasta: siguiente ? r4(siguiente.desde - paso) : null,
        });
      });
    });
    return salida;
  }

  async proponer(dtoIn: ProponerConfigPreciosIaDto & HeaderParamsDto) {
    if (dtoIn.fechaInicio > dtoIn.fechaFin) {
      throw new BadRequestException('La fecha inicial no puede ser mayor que la final');
    }

    const qProd = new SelectQuery(
      `SELECT nombre_inarti, COALESCE(decim_stock_inarti, 2) AS decimales, siglas_inuni
       FROM inv_articulo a LEFT JOIN inv_unidad u ON u.ide_inuni = a.ide_inuni WHERE a.ide_inarti = $1`,
    );
    qProd.addParam(1, dtoIn.ide_inarti);
    const prod = ((await this.dataSource.createSelectQuery(qProd)) as any[])[0];
    if (!prod) throw new BadRequestException('El producto no existe');
    const paso = 10 ** -Number(prod.decimales);

    const lineas = await this.obtenerLineas(dtoIn, Number(dtoIn.ideEmpr));
    if (lineas.length === 0) {
      throw new BadRequestException('No hay ventas de este producto en el período elegido');
    }
    const validas = lineas.filter((l) => l.valida);
    if (validas.length < 3) {
      throw new BadRequestException(
        'Hay muy pocas ventas con costo en kardex en el período para calcular una utilidad confiable',
      );
    }

    const resumen = this.resumirParaModelo(lineas);
    const tiposDisponibles = new Set<number | null>(
      resumen.filter((t) => t.lineas_validas >= 4).map((t) => t.ide_cncfp),
    );
    tiposDisponibles.add(null);

    const datos = {
      producto: prod.nombre_inarti,
      unidad: prod.siglas_inuni,
      decimales_cantidad: Number(prod.decimales),
      periodo: { desde: dtoIn.fechaInicio, hasta: dtoIn.fechaFin },
      lineas_validas: validas.length,
      lineas_descartadas_sin_costo_o_nota_credito: lineas.length - validas.length,
      tipos_de_pago: resumen,
    };

    let respuesta: RespuestaIa;
    try {
      respuesta = await this.gpt.jsonEstructurado<RespuestaIa>({
        system: PROMPT_SISTEMA,
        user: JSON.stringify(datos),
        schemaName: 'config_precios',
        schema: ESQUEMA_RESPUESTA,
      });
    } catch (error) {
      throw new BadRequestException(
        `No se pudo consultar a la IA: ${error instanceof Error ? error.message : 'error desconocido'}`,
      );
    }

    // ── El modelo decide los cortes y el modo; los valores se calculan aquí con los datos reales ──
    let tiers = this.normalizar(respuesta.configuraciones ?? [], tiposDisponibles, paso);

    const tiposConConfig = new Set(tiers.map((t) => t.ide_cncfp).filter((t) => t !== null));
    const lineasDe = (tipo: number | null) =>
      validas.filter((l) => (tipo === null ? !tiposConConfig.has(l.tipo) : l.tipo === tipo));

    const calcular = (t: TierIa): ConfigPrecioPropuesta | null => {
      const ls = lineasDe(t.ide_cncfp).filter(
        (l) => l.cantidad >= t.desde && (t.hasta === null || l.cantidad <= t.hasta + paso / 2),
      );
      if (ls.length === 0) return null;

      const margen = margenPonderado(ls);
      const precios = ls.map((l) => l.precio);
      const med = mediana(precios);
      const valor = t.modo === 'fijo' ? r4(med) : r2(margen);
      const coherentes = ls.filter((l) =>
        t.modo === 'fijo' ? Math.abs(l.precio - med) / med <= 0.03 : Math.abs(margenLinea(l) - margen) <= 5,
      ).length;
      const margenes = ls.map(margenLinea);

      return {
        ide_cncfp: t.ide_cncfp,
        nombre_cncfp: t.ide_cncfp === null ? 'Otras formas de pago' : (ls[0].nombreTipo ?? 'Tipo de pago'),
        rango1: t.desde,
        rango2: t.hasta,
        rango_infinito: t.hasta === null,
        modo: t.modo,
        valor,
        ventas: ls.length,
        coherencia: Math.round((coherentes / ls.length) * 100),
        margen_min: r2(percentil(margenes, 0.1)),
        margen_max: r2(percentil(margenes, 0.9)),
        precio_min: r4(percentil(precios, 0.1)),
        precio_max: r4(percentil(precios, 0.9)),
        razon: t.razon,
      };
    };

    let propuestas = tiers.map(calcular).filter((p): p is ConfigPrecioPropuesta => p !== null);

    // Tope total: se quita el rango con menos ventas y se vuelve a ajustar la continuidad.
    while (propuestas.length > MAX_CONFIGURACIONES) {
      const menor = propuestas.reduce((a, b) => (b.ventas < a.ventas ? b : a));
      tiers = this.normalizar(
        tiers.filter((t) => !(t.ide_cncfp === menor.ide_cncfp && t.desde === menor.rango1)),
        tiposDisponibles,
        paso,
      );
      propuestas = tiers.map(calcular).filter((p): p is ConfigPrecioPropuesta => p !== null);
    }

    if (propuestas.length === 0) {
      throw new BadRequestException('La IA no encontró un patrón de precios suficiente con los datos del período');
    }

    // Sin huecos tras quitar rangos sin ventas: el primero de cada tipo parte de 0 y el último es abierto.
    const porTipo = new Map<number | null, ConfigPrecioPropuesta[]>();
    propuestas.forEach((p) => porTipo.set(p.ide_cncfp, [...(porTipo.get(p.ide_cncfp) ?? []), p]));
    porTipo.forEach((lista) => {
      lista.sort((a, b) => a.rango1 - b.rango1);
      lista.forEach((p, i) => {
        const sig = lista[i + 1];
        p.rango1 = i === 0 ? 0 : p.rango1;
        p.rango2 = sig ? r4(sig.rango1 - paso) : null;
        p.rango_infinito = !sig;
      });
    });

    const advertencias = [...(respuesta.advertencias ?? [])];
    const descartados = resumen.filter((t) => t.lineas_validas < 4 && t.lineas_validas > 0);
    if (descartados.length > 0) {
      advertencias.push(
        `Sin configuración propia por pocas ventas: ${descartados
          .map((t) => `${t.tipo_de_pago} (${t.lineas_validas})`)
          .join(', ')}.`,
      );
    }
    propuestas
      .filter((p) => p.modo === 'utilidad' && p.valor < 5)
      .forEach((p) =>
        advertencias.push(
          `${p.nombre_cncfp} ${p.rango1}+: la utilidad propuesta es muy baja (${p.valor} %). Verifica que no sean ventas al costo.`,
        ),
      );

    return {
      producto: prod.nombre_inarti,
      unidad: prod.siglas_inuni,
      periodo: { fechaInicio: dtoIn.fechaInicio, fechaFin: dtoIn.fechaFin },
      lineasAnalizadas: validas.length,
      lineasDescartadas: lineas.length - validas.length,
      resumen: respuesta.resumen,
      advertencias,
      configuraciones: propuestas.sort(
        (a, b) => (a.ide_cncfp ?? 99) - (b.ide_cncfp ?? 99) || a.rango1 - b.rango1,
      ),
    };
  }

  /** Guarda la propuesta (ya revisada por el usuario). Reemplaza solo lo generado antes automáticamente. */
  async aplicar(dtoIn: AplicarConfigPreciosIaDto & HeaderParamsDto) {
    dtoIn.configuraciones.forEach((c, i) => {
      if (c.rango_infinito ? c.rango2 != null : c.rango2 == null || c.rango2 < c.rango1) {
        throw new BadRequestException(`El rango de la configuración ${i + 1} no es válido`);
      }
      if (c.modo === 'utilidad' ? c.valor < 0 : c.valor <= 0) {
        throw new BadRequestException(`El valor de la configuración ${i + 1} no es válido`);
      }
    });

    const borrar = new DeleteQuery('inv_conf_precios_articulo');
    borrar.where = `ide_inarti = $1 AND (observacion_incpa LIKE '${PREFIJO_OBSERVACION}%' OR observacion_incpa LIKE 'Config automática%')`;
    borrar.addParam(1, dtoIn.ide_inarti);
    await this.dataSource.createQuery(borrar);

    const module = 'inv';
    const tableName = 'conf_precios_articulo';
    const primaryKey = 'ide_incpa';
    const listQuery: ObjectQueryDto[] = [];

    for (const c of dtoIn.configuraciones) {
      const ide = await this.dataSource.getSeqTable(`${module}_${tableName}`, primaryKey, 1, dtoIn.login);
      listQuery.push({
        operation: 'insert',
        module,
        tableName,
        primaryKey,
        object: {
          ide_incpa: ide,
          ide_inarti: dtoIn.ide_inarti,
          ide_empr: dtoIn.ideEmpr,
          rangos_incpa: true,
          rango1_cant_incpa: c.rango1,
          rango2_cant_incpa: c.rango_infinito ? null : c.rango2,
          rango_infinito_incpa: c.rango_infinito,
          porcentaje_util_incpa: c.modo === 'utilidad' ? c.valor : null,
          precio_fijo_incpa: c.modo === 'fijo' ? c.valor : null,
          incluye_iva_incpa: c.incluye_iva ?? false,
          activo_incpa: true,
          autorizado_incpa: true,
          ide_cncfp: c.ide_cncfp ?? null,
          ide_cndfp: null,
          observacion_incpa: (c.observacion ?? `${PREFIJO_OBSERVACION} ${new Date().toISOString().slice(0, 10)}`).slice(
            0,
            200,
          ),
        },
      } as ObjectQueryDto);
    }

    await this.core.save({ ...dtoIn, listQuery, audit: true });
    return { message: 'ok', total: listQuery.length };
  }
}
