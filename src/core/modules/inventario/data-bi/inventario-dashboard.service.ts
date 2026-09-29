import { Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';

import { PeriodoInventarioDto } from './dto/periodo-inventario.dto';

/** Con existencia y sin salidas hace más de estos días = inmóvil (igual que Control de stock). */
const DIAS_INMOVIL = 180;
/** Clases ABC por valor acumulado del inventario: A hasta 80 %, B hasta 95 %, C el resto. */
const CORTE_A = 0.8;
const CORTE_B = 0.95;

/**
 * Dashboard general de inventario. Todo sale del kardex de costo promedio ponderado móvil (inv_kardex_ppmp), el costo
 * oficial del producto: cada fila trae el saldo en unidades y en dinero después del movimiento, así que
 *  - el valor del inventario a una fecha = suma del último saldo_valor de cada producto;
 *  - el valor que entró o salió en un movimiento = variación del saldo_valor respecto a la fila anterior del producto.
 * El kardex es por empresa + sucursal (ide_sucu de la sesión: son dos empresas legales distintas).
 */
@Injectable()
export class InventarioDashboardService {
  constructor(private readonly dataSource: DataSourceService) {}

  /** Filas del kardex hasta hoy con `delta_valor` (dinero que agregó o quitó el movimiento). */
  private sqlKardex(dto: HeaderParamsDto): string {
    return `
      SELECT k.ide_inarti, k.ide_incci, k.fecha_mov, k.orden_mov, k.signo, k.cantidad, k.saldo_cantidad, k.saldo_valor,
             k.saldo_valor - COALESCE(LAG(k.saldo_valor) OVER (
               PARTITION BY k.ide_inarti ORDER BY k.fecha_mov, k.orden_mov), 0) AS delta_valor
        FROM inv_kardex_ppmp k
       WHERE k.ide_empr = ${Number(dto.ideEmpr)} AND k.ide_sucu = ${Number(dto.ideSucu)}
         AND k.fecha_mov <= CURRENT_DATE`;
  }

  /** Un registro por mes desde el primer movimiento: entradas, salidas y valor del inventario al cierre del mes. */
  private sqlSerie(dto: HeaderParamsDto): string {
    return `
      k AS (${this.sqlKardex(dto)}),
      mensual AS (
        SELECT date_trunc('month', fecha_mov)::date AS mes,
               SUM(delta_valor) AS delta,
               COALESCE(SUM(delta_valor) FILTER (WHERE signo = 1), 0) AS entradas,
               COALESCE(-SUM(delta_valor) FILTER (WHERE signo = -1), 0) AS salidas
          FROM k GROUP BY 1
      ),
      serie AS (
        SELECT g.mes::date AS mes, COALESCE(m.entradas, 0) AS entradas, COALESCE(m.salidas, 0) AS salidas,
               SUM(COALESCE(m.delta, 0)) OVER (ORDER BY g.mes) AS valor_fin
          FROM generate_series((SELECT MIN(mes) FROM mensual), date_trunc('month', CURRENT_DATE)::date,
                               interval '1 month') g(mes)
          LEFT JOIN mensual m ON m.mes = g.mes::date
      )`;
  }

  /** Último saldo de cada producto activo con kardex, con su categoría y sus salidas de los últimos 12 meses. */
  private sqlProductos(dto: HeaderParamsDto): string {
    return `
      SELECT a.ide_inarti, a.uuid::text AS uuid_inarti, a.codigo_inarti, a.nombre_inarti, a.ide_incate,
             COALESCE(c.nombre_incate, 'Sin categoría') AS categoria, uni.siglas_inuni,
             u.saldo_cantidad, u.saldo_valor,
             COALESCE(s.cant_12m, 0) AS cant_12m, COALESCE(s.valor_12m, 0) AS valor_12m, s.ultima_salida
        FROM (
          SELECT DISTINCT ON (k.ide_inarti) k.ide_inarti, k.saldo_cantidad, k.saldo_valor
            FROM k ORDER BY k.ide_inarti, k.fecha_mov DESC, k.orden_mov DESC
        ) u
        JOIN inv_articulo a ON a.ide_inarti = u.ide_inarti AND a.ide_empr = ${Number(dto.ideEmpr)}
         AND a.ide_intpr = 1 AND a.nivel_inarti = 'HIJO' AND a.hace_kardex_inarti = TRUE AND a.activo_inarti = TRUE
        LEFT JOIN inv_categoria c ON c.ide_incate = a.ide_incate
        LEFT JOIN inv_unidad uni ON uni.ide_inuni = a.ide_inuni
        LEFT JOIN (
          SELECT k.ide_inarti,
                 SUM(k.cantidad) FILTER (WHERE k.signo = -1 AND k.fecha_mov > CURRENT_DATE - 365) AS cant_12m,
                 -SUM(k.delta_valor) FILTER (WHERE k.signo = -1 AND k.fecha_mov > CURRENT_DATE - 365) AS valor_12m,
                 MAX(k.fecha_mov) FILTER (WHERE k.signo = -1) AS ultima_salida
            FROM k GROUP BY k.ide_inarti
        ) s ON s.ide_inarti = u.ide_inarti`;
  }

  /**
   * Totales del encabezado: valor del inventario (actual, mes anterior y hace un año), entradas y salidas del mes,
   * rotación y días de inventario de los últimos 12 meses y cuántos productos hay con existencia o en negativo.
   */
  async getKpisInventario(dto: HeaderParamsDto) {
    const r = await this.dataSource.pool.query(
      `WITH ${this.sqlSerie(dto)},
       ultimo AS (
         SELECT DISTINCT ON (k.ide_inarti) k.ide_inarti, k.saldo_cantidad, k.saldo_valor
           FROM k ORDER BY k.ide_inarti, k.fecha_mov DESC, k.orden_mov DESC
       )
       SELECT
         (SELECT valor_fin FROM serie ORDER BY mes DESC LIMIT 1) AS valor_actual,
         (SELECT valor_fin FROM serie ORDER BY mes DESC OFFSET 1 LIMIT 1) AS valor_mes_anterior,
         (SELECT valor_fin FROM serie WHERE mes = (date_trunc('month', CURRENT_DATE) - interval '12 months')::date)
           AS valor_hace_12_meses,
         (SELECT entradas FROM serie ORDER BY mes DESC LIMIT 1) AS entradas_mes,
         (SELECT salidas FROM serie ORDER BY mes DESC LIMIT 1) AS salidas_mes,
         (SELECT entradas FROM serie ORDER BY mes DESC OFFSET 1 LIMIT 1) AS entradas_mes_anterior,
         (SELECT salidas FROM serie ORDER BY mes DESC OFFSET 1 LIMIT 1) AS salidas_mes_anterior,
         (SELECT COALESCE(SUM(salidas), 0) FROM (SELECT salidas FROM serie ORDER BY mes DESC LIMIT 12) s) AS salidas_12m,
         (SELECT AVG(valor_fin) FROM (SELECT valor_fin FROM serie ORDER BY mes DESC LIMIT 12) s) AS inventario_promedio_12m,
         (SELECT COUNT(*) FROM ultimo WHERE saldo_cantidad > 0)::int AS productos_con_stock,
         (SELECT COUNT(*) FROM ultimo WHERE saldo_cantidad < 0)::int AS productos_negativos,
         (SELECT COALESCE(SUM(saldo_valor), 0) FROM ultimo WHERE saldo_cantidad > 0) AS valor_con_stock,
         (SELECT COUNT(*) FROM inv_articulo a
           WHERE a.ide_empr = ${Number(dto.ideEmpr)} AND a.ide_intpr = 1 AND a.nivel_inarti = 'HIJO'
             AND a.hace_kardex_inarti = TRUE AND a.activo_inarti = TRUE)::int AS productos_total`,
    );
    const d = r.rows[0] ?? {};
    const salidas12m = Number(d.salidas_12m) || 0;
    const promedio = Number(d.inventario_promedio_12m) || 0;
    const rotacion = promedio > 0 ? salidas12m / promedio : null;
    return {
      ...d,
      rotacion_12m: rotacion === null ? null : Math.round(rotacion * 100) / 100,
      dias_inventario: rotacion ? Math.round(365 / rotacion) : null,
      dias_inmovil: DIAS_INMOVIL,
    };
  }

  /**
   * Valor del inventario al cierre de cada mes del año, con lo que entró y salió (a costo) y el valor del mismo mes
   * del año anterior para comparar. Los meses futuros no aparecen.
   */
  async getValorInventarioMensual(dto: PeriodoInventarioDto & HeaderParamsDto) {
    const periodo = dto.periodo ?? new Date().getFullYear();
    const r = await this.dataSource.pool.query(
      `WITH ${this.sqlSerie(dto)}
       SELECT to_char(s.mes, 'YYYY-MM') AS mes, EXTRACT(MONTH FROM s.mes)::int AS mes_num,
              s.entradas, s.salidas, s.valor_fin, p.valor_fin AS valor_fin_anio_anterior
         FROM serie s
         LEFT JOIN serie p ON p.mes = (s.mes - interval '12 months')::date
        WHERE EXTRACT(YEAR FROM s.mes) = ${Number(periodo)}
        ORDER BY s.mes`,
    );
    return { periodo, rows: r.rows };
  }

  /** Movimientos del año por tipo de transacción: comprobantes y dinero (a costo) que movió cada uno. */
  async getMovimientosPorTipo(dto: PeriodoInventarioDto & HeaderParamsDto) {
    const periodo = dto.periodo ?? new Date().getFullYear();
    const r = await this.dataSource.pool.query(
      `WITH k AS (${this.sqlKardex(dto)})
       SELECT tti.nombre_intti AS tipo, k.signo, COUNT(DISTINCT k.ide_incci)::int AS comprobantes,
              COALESCE(SUM(ABS(k.delta_valor)), 0) AS valor
         FROM k
         JOIN inv_cab_comp_inve cci ON cci.ide_incci = k.ide_incci
         JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
        WHERE EXTRACT(YEAR FROM k.fecha_mov) = ${Number(periodo)}
        GROUP BY tti.nombre_intti, k.signo
        ORDER BY valor DESC`,
    );
    return { periodo, rows: r.rows };
  }

  /** Rotación por categoría: valor en stock, salidas de 12 meses, rotación, días de inventario y valor inmóvil. */
  async getRotacionCategorias(dto: HeaderParamsDto) {
    const r = await this.dataSource.pool.query(
      `WITH k AS (${this.sqlKardex(dto)}),
       p AS (${this.sqlProductos(dto)})
       SELECT p.ide_incate, p.categoria,
              COUNT(*) FILTER (WHERE p.saldo_cantidad > 0)::int AS productos_con_stock,
              COALESCE(SUM(p.saldo_valor) FILTER (WHERE p.saldo_cantidad > 0), 0) AS valor_stock,
              COALESCE(SUM(p.valor_12m), 0) AS salidas_12m,
              CASE WHEN SUM(p.saldo_valor) FILTER (WHERE p.saldo_cantidad > 0) > 0
                   THEN ROUND(SUM(p.valor_12m) / (SUM(p.saldo_valor) FILTER (WHERE p.saldo_cantidad > 0)), 2) END AS rotacion,
              CASE WHEN SUM(p.valor_12m) > 0 AND SUM(p.saldo_valor) FILTER (WHERE p.saldo_cantidad > 0) > 0
                   THEN ROUND(365 * (SUM(p.saldo_valor) FILTER (WHERE p.saldo_cantidad > 0)) / SUM(p.valor_12m), 0) END AS dias_inventario,
              COALESCE(SUM(p.saldo_valor) FILTER (
                WHERE p.saldo_cantidad > 0 AND (p.ultima_salida IS NULL OR p.ultima_salida < CURRENT_DATE - ${DIAS_INMOVIL})), 0) AS valor_inmovil
         FROM p
        GROUP BY p.ide_incate, p.categoria
       HAVING COUNT(*) FILTER (WHERE p.saldo_cantidad > 0) > 0
        ORDER BY valor_stock DESC`,
    );
    return { rowCount: r.rows.length, rows: r.rows };
  }

  /**
   * Productos con existencia ordenados por valor de inventario, con su clase ABC (por valor acumulado; el producto que
   * cruza el corte pertenece a la clase de arriba), participación, salidas de 12 meses y rotación.
   */
  private sqlAbc(dto: HeaderParamsDto): string {
    return `
      SELECT b.*,
             CASE WHEN b.acumulado - b.participacion < ${CORTE_A} THEN 'A'
                  WHEN b.acumulado - b.participacion < ${CORTE_B} THEN 'B'
                  ELSE 'C' END AS clase
        FROM (
          SELECT r.*, ROW_NUMBER() OVER (ORDER BY r.saldo_valor DESC, r.ide_inarti) AS posicion,
                 r.saldo_valor / NULLIF(SUM(r.saldo_valor) OVER (), 0) AS participacion,
                 SUM(r.saldo_valor) OVER (ORDER BY r.saldo_valor DESC, r.ide_inarti)
                   / NULLIF(SUM(r.saldo_valor) OVER (), 0) AS acumulado
            FROM (SELECT * FROM (${this.sqlProductos(dto)}) p WHERE p.saldo_cantidad > 0 AND p.saldo_valor > 0) r
        ) b`;
  }

  /** Resumen ABC (productos y valor por clase) y los 30 productos más valiosos con su porcentaje acumulado (Pareto). */
  async getResumenAbc(dto: HeaderParamsDto) {
    const r = await this.dataSource.pool.query(
      `WITH k AS (${this.sqlKardex(dto)}),
       abc AS (${this.sqlAbc(dto)})
       SELECT
         (SELECT COALESCE(json_agg(t ORDER BY t.clase), '[]'::json) FROM (
            SELECT clase, COUNT(*)::int AS productos, COALESCE(SUM(saldo_valor), 0) AS valor,
                   ROUND(SUM(participacion) * 100, 1) AS pct_valor,
                   ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) AS pct_productos
              FROM abc GROUP BY clase) t) AS resumen,
         (SELECT COALESCE(json_agg(t ORDER BY t.posicion), '[]'::json) FROM (
            SELECT posicion, uuid_inarti, codigo_inarti, nombre_inarti, categoria, siglas_inuni, saldo_cantidad,
                   saldo_valor AS valor, ROUND(participacion * 100, 2) AS pct_valor,
                   ROUND(acumulado * 100, 2) AS pct_acumulado, clase
              FROM abc ORDER BY posicion LIMIT 30) t) AS top,
         (SELECT COUNT(*)::int FROM abc) AS productos`,
    );
    const d = r.rows[0];
    return { productos: d.productos, resumen: d.resumen, top: d.top };
  }

  /** Todos los productos con existencia y su clasificación ABC (DataTableQuery: búsqueda, filtros, orden y exportar). */
  async getAbcInventarioTabla(dto: HeaderParamsDto & PeriodoInventarioDto) {
    const q = new SelectQuery(
      `WITH k AS (${this.sqlKardex(dto)})
       SELECT abc.ide_inarti, abc.uuid_inarti, abc.posicion, abc.codigo_inarti, abc.nombre_inarti, abc.categoria,
              abc.clase, abc.saldo_cantidad AS existencia, abc.siglas_inuni,
              ROUND(abc.saldo_valor / NULLIF(abc.saldo_cantidad, 0), 4) AS costo_unitario, abc.saldo_valor AS valor,
              ROUND(abc.participacion * 100, 2) AS pct_valor, ROUND(abc.acumulado * 100, 2) AS pct_acumulado,
              abc.cant_12m AS salidas_12m, abc.valor_12m AS valor_salidas_12m,
              CASE WHEN abc.saldo_valor > 0 THEN ROUND(abc.valor_12m / abc.saldo_valor, 2) END AS rotacion,
              to_char(abc.ultima_salida, 'YYYY-MM-DD') AS ultima_salida,
              (CURRENT_DATE - abc.ultima_salida) AS dias_sin_salida
         FROM (${this.sqlAbc(dto)}) abc
        ORDER BY abc.posicion`,
      dto,
    );
    return this.dataSource.createQuery(q);
  }
}
