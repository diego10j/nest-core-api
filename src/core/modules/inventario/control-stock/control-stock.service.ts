import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { GetControlStockDto } from './dto/get-control-stock.dto';

/** Días de salidas que se usan para medir la rotación (consumo diario y cobertura). */
const DIAS_ANALISIS = 90;
/** Con existencia y sin salidas hace más de estos días = stock inmóvil. */
const DIAS_INMOVIL = 180;
/** Existencia por encima de ideal × este factor = exceso. */
const FACTOR_EXCESO = 2;

const enteros = (v?: string) =>
  (v ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);

const partes = (v?: string) =>
  (v ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

/** Producto con alerta de reposición: sin stock (con rotación o con mínimo/ideal), negativo, crítico o bajo el ideal. */
const alertaExpr = (t: string) =>
  `(${t}.estado IN ('NEGATIVO', 'CRITICO', 'BAJO')
     OR (${t}.estado = 'SIN_STOCK' AND (${t}.salidas_90 > 0 OR ${t}.stock_minimo IS NOT NULL OR ${t}.stock_ideal IS NOT NULL)))`;

/**
 * Control de stock de productos: existencia, valor de inventario, alertas de reposición y stock inmóvil.
 *
 * - Existencia: misma definición de la página Stock (movimientos normales de inv_det_comp_inve × signo del tipo
 *   de comprobante, productos con kardex, nivel HIJO, activos), pero de UNA empresa (ide_sucu de la CABECERA).
 * - Valor: existencia × último costo promedio del kardex PPMP (el costo oficial del producto).
 * - Stock mínimo / ideal: cant_stock1_inarti / cant_stock2_inarti (0 se toma como "sin configurar").
 */
@Injectable()
export class ControlStockService extends BaseService {
  constructor(
    private readonly dataSource: DataSourceService,
    private readonly core: CoreService,
  ) {
    super();
    this.core.getVariables(['p_inv_estado_normal']).then((result) => {
      this.variables = result;
    });
  }

  /**
   * Un registro por producto con existencia, estado, valor, rotación y sugerencia de reposición. Estados:
   * NEGATIVO (< 0), SIN_STOCK (0), CRITICO (< mínimo), BAJO (< ideal), EXCESO (> ideal × 2),
   * SIN_CONFIG (con existencia pero sin mínimo ni ideal) y ADECUADO.
   */
  private sqlBase(dto: HeaderParamsDto & GetControlStockDto): string {
    const empresa = Number(dto.ideEmpr);
    const sucursal = Number(dto.ideSucu);
    const estadoNormal = Number(this.variables.get('p_inv_estado_normal'));
    const bodegas = enteros(dto.bodegas);
    const categorias = enteros(dto.categorias);

    return `
      SELECT y.*, ROUND(y.sugerido_reposicion * COALESCE(y.costo_unitario, 0), 2) AS valor_reposicion
        FROM (
          SELECT e.*,
                 ${alertaExpr('e')} AS alerta,
                 CASE WHEN e.saldo <= 0 AND e.salidas_90 > 0 THEN 1
                      WHEN e.estado = 'CRITICO' AND e.salidas_90 > 0 THEN 2
                      WHEN e.estado = 'NEGATIVO' THEN 3
                      WHEN e.estado = 'CRITICO' THEN 4
                      WHEN e.estado = 'SIN_STOCK' THEN 5
                      WHEN e.estado = 'BAJO' AND e.salidas_90 > 0 THEN 6
                      WHEN e.estado = 'BAJO' THEN 7
                      ELSE 9 END AS prioridad,
                 CASE WHEN e.saldo > 0 AND e.consumo_diario > 0 THEN ROUND(e.saldo / e.consumo_diario, 0) END AS dias_cobertura,
                 CASE WHEN ${alertaExpr('e')} THEN
                        ROUND(GREATEST(
                          COALESCE(e.stock_ideal, e.stock_minimo * 2, CEIL(e.consumo_diario * 30), 0) - GREATEST(e.saldo, 0), 0
                        ), e.decim)
                 END AS sugerido_reposicion,
                 (e.saldo > 0 AND (e.ultima_salida IS NULL OR e.dias_sin_salida > ${DIAS_INMOVIL})) AS inmovil,
                 ROUND(e.valor_stock * 100.0 / NULLIF(SUM(e.valor_stock) OVER (), 0), 2) AS porcentaje_valor
            FROM (
              SELECT b.*,
                     CASE WHEN b.saldo < 0 THEN 'NEGATIVO'
                          WHEN b.saldo = 0 THEN 'SIN_STOCK'
                          WHEN b.stock_minimo IS NOT NULL AND b.saldo < b.stock_minimo THEN 'CRITICO'
                          WHEN b.stock_ideal IS NOT NULL AND b.saldo < b.stock_ideal THEN 'BAJO'
                          WHEN b.stock_minimo IS NULL AND b.stock_ideal IS NULL THEN 'SIN_CONFIG'
                          WHEN b.stock_ideal IS NOT NULL AND b.saldo > b.stock_ideal * ${FACTOR_EXCESO} THEN 'EXCESO'
                          ELSE 'ADECUADO' END AS estado,
                     ROUND(GREATEST(b.saldo, 0) * COALESCE(b.costo_unitario, 0), 2) AS valor_stock,
                     (CURRENT_DATE - b.ultima_salida) AS dias_sin_salida,
                     ROUND(b.salidas_90 / ${DIAS_ANALISIS}.0, 4) AS consumo_diario
                FROM (
                  SELECT a.ide_inarti, a.uuid::text AS uuid_inarti, a.codigo_inarti, a.nombre_inarti, a.ide_incate, c.nombre_incate, u.siglas_inuni,
                         COALESCE(a.decim_stock_inarti, 2)::int AS decim,
                         ROUND(COALESCE(m.saldo, 0), COALESCE(a.decim_stock_inarti, 2)::int) AS saldo,
                         NULLIF(a.cant_stock1_inarti, 0) AS stock_minimo,
                         NULLIF(a.cant_stock2_inarti, 0) AS stock_ideal,
                         COALESCE(m.salidas_90, 0) AS salidas_90,
                         m.ultima_salida,
                         pp.costo_unitario
                    FROM inv_articulo a
                    LEFT JOIN inv_unidad u ON u.ide_inuni = a.ide_inuni
                    LEFT JOIN inv_categoria c ON c.ide_incate = a.ide_incate
                    LEFT JOIN (
                      SELECT dci.ide_inarti,
                             SUM(dci.cantidad_indci * tci.signo_intci) AS saldo,
                             MAX(CASE WHEN tci.signo_intci = -1 THEN cci.fecha_trans_incci END) AS ultima_salida,
                             SUM(CASE WHEN tci.signo_intci = -1 AND cci.fecha_trans_incci > CURRENT_DATE - ${DIAS_ANALISIS}
                                      THEN dci.cantidad_indci ELSE 0 END) AS salidas_90
                        FROM inv_det_comp_inve dci
                        JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                        JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                        JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                       WHERE cci.ide_inepi = ${estadoNormal}
                         AND cci.ide_empr = ${empresa}
                         AND cci.ide_sucu = ${sucursal}
                         AND cci.fecha_trans_incci <= CURRENT_DATE
                         ${bodegas.length ? `AND cci.ide_inbod IN (${bodegas.join(',')})` : ''}
                       GROUP BY dci.ide_inarti
                    ) m ON m.ide_inarti = a.ide_inarti
                    -- Último costo promedio (PPMP) con costo > 0: el vigente para valorar el stock y estimar la reposición.
                    LEFT JOIN (
                      SELECT DISTINCT ON (k.ide_inarti) k.ide_inarti, k.costo_promedio AS costo_unitario
                        FROM inv_kardex_ppmp k
                       WHERE k.ide_empr = ${empresa} AND k.ide_sucu = ${sucursal}
                         AND k.fecha_mov <= CURRENT_DATE AND k.costo_promedio > 0
                       ORDER BY k.ide_inarti, k.fecha_mov DESC, k.orden_mov DESC
                    ) pp ON pp.ide_inarti = a.ide_inarti
                   WHERE a.ide_empr = ${empresa}
                     AND a.ide_intpr = 1
                     AND a.nivel_inarti = 'HIJO'
                     AND a.hace_kardex_inarti = true
                     AND a.activo_inarti = true
                     ${categorias.length ? `AND a.ide_incate IN (${categorias.join(',')})` : ''}
                ) b
            ) e
        ) y`;
  }

  /** Productos con su stock (DataTableQuery: paginación, orden y búsqueda global) según la vista elegida. */
  async getProductosStock(dto: GetControlStockDto & HeaderParamsDto) {
    const params: unknown[] = [];
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    const cond: string[] = [];
    let orden = 's.nombre_incate NULLS LAST, s.nombre_inarti';
    switch (dto.vista) {
      case 'ALERTAS':
        cond.push('s.alerta');
        orden = 's.prioridad, s.dias_cobertura NULLS LAST, s.nombre_inarti';
        break;
      case 'MAS_STOCK':
        cond.push('s.saldo > 0');
        orden = 's.valor_stock DESC, s.saldo DESC';
        break;
      case 'INMOVIL':
        cond.push('s.inmovil');
        orden = 's.valor_stock DESC, s.nombre_inarti';
        break;
      default:
        if (dto.incluirSinStock !== 'true') cond.push('s.saldo > 0');
    }
    if (partes(dto.estados).length) cond.push(`s.estado = ANY(${p(partes(dto.estados))}::text[])`);

    const q = new SelectQuery(
      `SELECT s.ide_inarti, s.uuid_inarti, s.codigo_inarti, s.nombre_inarti, s.nombre_incate, s.ide_incate, s.siglas_inuni,
              s.saldo, s.stock_minimo, s.stock_ideal, s.estado, s.costo_unitario, s.valor_stock, s.porcentaje_valor,
              s.salidas_90, s.dias_cobertura, to_char(s.ultima_salida, 'YYYY-MM-DD') AS ultima_salida, s.dias_sin_salida,
              s.inmovil, s.alerta, s.prioridad, s.sugerido_reposicion, s.valor_reposicion
         FROM (${this.sqlBase(dto)}) s
        ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
        ORDER BY ${orden}`,
      dto,
    );
    params.forEach((v, i) => q.addParam(i + 1, v));
    return this.dataSource.createQuery(q);
  }

  /**
   * Tarjetas y datos del dashboard en una sola consulta (la base se evalúa una vez): totales, productos por
   * estado, valor por categoría y los rankings de más stock, alertas más urgentes y stock inmóvil.
   */
  async getDashboardStock(dto: GetControlStockDto & HeaderParamsDto) {
    const agg = (select: string, orden: string) =>
      `(SELECT COALESCE(json_agg(t ORDER BY ${orden}), '[]'::json) FROM (${select}) t)`;

    const r = await this.dataSource.pool.query(
      `WITH b AS (${this.sqlBase(dto)})
       SELECT
         (SELECT row_to_json(k) FROM (
            SELECT COUNT(*)::int AS productos,
                   COUNT(*) FILTER (WHERE saldo > 0)::int AS con_stock,
                   COALESCE(SUM(valor_stock), 0) AS valor_total,
                   COUNT(*) FILTER (WHERE alerta AND saldo <= 0 AND estado <> 'NEGATIVO')::int AS sin_stock,
                   COUNT(*) FILTER (WHERE estado = 'NEGATIVO')::int AS negativos,
                   COUNT(*) FILTER (WHERE estado = 'CRITICO')::int AS criticos,
                   COUNT(*) FILTER (WHERE estado = 'BAJO')::int AS bajos,
                   COUNT(*) FILTER (WHERE estado = 'EXCESO')::int AS exceso,
                   COALESCE(SUM(valor_stock) FILTER (WHERE estado = 'EXCESO'), 0) AS valor_exceso,
                   COUNT(*) FILTER (WHERE estado = 'SIN_CONFIG')::int AS sin_config,
                   COUNT(*) FILTER (WHERE alerta)::int AS alertas,
                   COUNT(*) FILTER (WHERE alerta AND prioridad <= 2)::int AS urgentes,
                   COALESCE(SUM(valor_reposicion) FILTER (WHERE alerta), 0) AS valor_reposicion,
                   COUNT(*) FILTER (WHERE inmovil)::int AS inmovil,
                   COALESCE(SUM(valor_stock) FILTER (WHERE inmovil), 0) AS valor_inmovil
              FROM b) k) AS kpis,
         ${agg(
           `SELECT estado, COUNT(*)::int AS productos, COALESCE(SUM(valor_stock), 0) AS valor
              FROM b WHERE saldo > 0 OR alerta GROUP BY estado`,
           't.productos DESC',
         )} AS por_estado,
         ${agg(
           `SELECT ide_incate, COALESCE(nombre_incate, 'Sin categoría') AS categoria,
                   COUNT(*) FILTER (WHERE saldo > 0)::int AS productos, COALESCE(SUM(valor_stock), 0) AS valor
              FROM b GROUP BY ide_incate, nombre_incate HAVING COALESCE(SUM(valor_stock), 0) > 0
             ORDER BY valor DESC LIMIT 10`,
           't.valor DESC',
         )} AS por_categoria,
         ${agg(
           `SELECT ide_inarti, uuid_inarti, nombre_inarti, nombre_incate, siglas_inuni, saldo, valor_stock, porcentaje_valor
              FROM b WHERE saldo > 0 ORDER BY valor_stock DESC, saldo DESC LIMIT 10`,
           't.valor_stock DESC, t.saldo DESC',
         )} AS mas_stock,
         ${agg(
           `SELECT ide_inarti, uuid_inarti, nombre_inarti, siglas_inuni, estado, saldo, stock_minimo, stock_ideal, salidas_90,
                   dias_cobertura, sugerido_reposicion, prioridad
              FROM b WHERE alerta ORDER BY prioridad, valor_reposicion DESC, nombre_inarti LIMIT 10`,
           't.prioridad, t.sugerido_reposicion DESC NULLS LAST, t.nombre_inarti',
         )} AS alertas_top,
         ${agg(
           `SELECT ide_inarti, uuid_inarti, nombre_inarti, siglas_inuni, saldo, valor_stock, dias_sin_salida
              FROM b WHERE inmovil ORDER BY valor_stock DESC, nombre_inarti LIMIT 10`,
           't.valor_stock DESC, t.nombre_inarti',
         )} AS inmovil_top`,
    );
    const d = r.rows[0];
    return {
      kpis: d.kpis,
      porEstado: d.por_estado,
      porCategoria: d.por_categoria,
      masStock: d.mas_stock,
      alertasTop: d.alertas_top,
      inmovilTop: d.inmovil_top,
      diasInmovil: DIAS_INMOVIL,
      diasAnalisis: DIAS_ANALISIS,
    };
  }
}
