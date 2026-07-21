import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { ComparativoPeriodosDto, EvolucionPeriodosDto, PeriodoAnioDto, PeriodoContableDto, TopCuentasBiDto } from './dto/contabilidad-bi.dto';

@Injectable()
export class ContabilidadBiService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        this.core
            .getVariables([
                'p_con_estado_comprobante_normal',
                'p_con_estado_comp_inicial',
                'p_con_estado_comp_final',
                'p_con_lugar_debe',
                'p_con_lugar_haber',
                'p_con_tipo_cuenta_activo',
                'p_con_tipo_cuenta_pasivo',
                'p_con_tipo_cuenta_patrimonio',
                'p_con_tipo_cuenta_ingresos',
                'p_con_tipo_cuenta_gastos',
                'p_con_tipo_cuenta_costos',
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    // ─── Helpers privados ────────────────────────────────────────────────────────

    private get estadosComprobantes(): string {
        return [
            this.variables.get('p_con_estado_comprobante_normal'),
            this.variables.get('p_con_estado_comp_inicial'),
            this.variables.get('p_con_estado_comp_final'),
        ].join(',');
    }

    private get tiposBalance(): string {
        return [
            this.variables.get('p_con_tipo_cuenta_activo'),
            this.variables.get('p_con_tipo_cuenta_pasivo'),
            this.variables.get('p_con_tipo_cuenta_patrimonio'),
        ].join(',');
    }

    private get tiposResultados(): string {
        return [
            this.variables.get('p_con_tipo_cuenta_ingresos'),
            this.variables.get('p_con_tipo_cuenta_gastos'),
            this.variables.get('p_con_tipo_cuenta_costos'),
        ].join(',');
    }

    // ─── KPI: Resumen ejecutivo ──────────────────────────────────────────────────

    /**
     * KPI principal del dashboard contable.
     * Retorna en una sola consulta:
     *   - total_activos, total_pasivos, total_patrimonio
     *   - total_ingresos, total_gastos, total_costos
     *   - utilidad_neta, num_comprobantes, total_debe, total_haber
     * Ideal para tarjetas de resumen (cards) en el dashboard.
     */
    async getKpisPrincipales(dto: HeaderParamsDto & RangoFechasDto) {
        const estados = this.estadosComprobantes;
        const activo = this.variables.get('p_con_tipo_cuenta_activo');
        const pasivo = this.variables.get('p_con_tipo_cuenta_pasivo');
        const patrimonio = this.variables.get('p_con_tipo_cuenta_patrimonio');
        const ingresos = this.variables.get('p_con_tipo_cuenta_ingresos');
        const gastos = this.variables.get('p_con_tipo_cuenta_gastos');
        const costos = this.variables.get('p_con_tipo_cuenta_costos');
        const lugarDebe = this.variables.get('p_con_lugar_debe');

        const query = new SelectQuery(`
            SELECT
                ROUND(COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${activo}     THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END)::numeric, 0), 2) AS total_activos,
                ROUND(COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${pasivo}     THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END)::numeric, 0), 2) AS total_pasivos,
                ROUND(COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${patrimonio} THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END)::numeric, 0), 2) AS total_patrimonio,
                ROUND(COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${ingresos}   THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END)::numeric, 0), 2) AS total_ingresos,
                ROUND(COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${gastos}     THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END)::numeric, 0), 2) AS total_gastos,
                ROUND(COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${costos}     THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END)::numeric, 0), 2) AS total_costos,
                ROUND(COALESCE(
                    SUM(CASE WHEN dpc.ide_cntcu = ${ingresos} THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END)
                    - SUM(CASE WHEN dpc.ide_cntcu = ${gastos} THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END)
                    - SUM(CASE WHEN dpc.ide_cntcu = ${costos} THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END),
                    0
                )::numeric, 2)                                                                                                                AS utilidad_neta,
                COUNT(DISTINCT ccc.ide_cnccc)                                                                                                 AS num_comprobantes,
                ROUND(COALESCE(SUM(CASE WHEN dcc.ide_cnlap =  ${lugarDebe} THEN dcc.valor_cndcc ELSE 0 END)::numeric, 0), 2)                  AS total_debe,
                ROUND(COALESCE(SUM(CASE WHEN dcc.ide_cnlap != ${lugarDebe} THEN dcc.valor_cndcc ELSE 0 END)::numeric, 0), 2)                  AS total_haber
            FROM con_cab_comp_cont  ccc
            JOIN con_det_comp_cont  dcc ON ccc.ide_cnccc = dcc.ide_cnccc
            JOIN con_det_plan_cuen  dpc ON dpc.ide_cndpc = dcc.ide_cndpc
            JOIN con_tipo_cuenta    tc  ON dpc.ide_cntcu = tc.ide_cntcu
            JOIN con_signo_cuenta   sc  ON tc.ide_cntcu  = sc.ide_cntcu
                                      AND dcc.ide_cnlap  = sc.ide_cnlap
            WHERE ccc.fecha_trans_cnccc BETWEEN $1 AND $2
              AND ccc.ide_cneco IN (${estados})
              AND ccc.ide_sucu  = $3
              AND dpc.ide_cncpc = (SELECT ide_cncpc FROM con_cab_plan_cuen WHERE ide_sucu = $3 AND activo_cncpc = true)
        `);
        query.addStringParam(1, dto.fechaInicio);
        query.addStringParam(2, dto.fechaFin);
        query.addIntParam(3, dto.ideSucu);

        return this.dataSource.createSingleQuery(query);
    }

    /**
     * KPI de ratios financieros clave del período:
     *   - ratio_endeudamiento: pasivos / activos × 100
     *   - ratio_autonomia: patrimonio / activos × 100
     *   - margen_neto: utilidad_neta / ingresos × 100
     *   - margen_bruto: (ingresos - costos) / ingresos × 100
     *   - cobertura_gastos: ingresos / (gastos + costos)
     * Ideal para gauge charts o cards con semáforo.
     */
    async getRatiosFinancieros(dto: HeaderParamsDto & RangoFechasDto) {
        const estados = this.estadosComprobantes;
        const activo = this.variables.get('p_con_tipo_cuenta_activo');
        const pasivo = this.variables.get('p_con_tipo_cuenta_pasivo');
        const patrimonio = this.variables.get('p_con_tipo_cuenta_patrimonio');
        const ingresos = this.variables.get('p_con_tipo_cuenta_ingresos');
        const gastos = this.variables.get('p_con_tipo_cuenta_gastos');
        const costos = this.variables.get('p_con_tipo_cuenta_costos');

        const query = new SelectQuery(`
            WITH base AS (
                SELECT
                    COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${activo}     THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END), 0) AS total_activos,
                    COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${pasivo}     THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END), 0) AS total_pasivos,
                    COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${patrimonio} THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END), 0) AS total_patrimonio,
                    COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${ingresos}   THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END), 0) AS total_ingresos,
                    COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${gastos}     THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END), 0) AS total_gastos,
                    COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${costos}     THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END), 0) AS total_costos
                FROM con_cab_comp_cont  ccc
                JOIN con_det_comp_cont  dcc ON ccc.ide_cnccc = dcc.ide_cnccc
                JOIN con_det_plan_cuen  dpc ON dpc.ide_cndpc = dcc.ide_cndpc
                JOIN con_tipo_cuenta    tc  ON dpc.ide_cntcu = tc.ide_cntcu
                JOIN con_signo_cuenta   sc  ON tc.ide_cntcu  = sc.ide_cntcu
                                          AND dcc.ide_cnlap  = sc.ide_cnlap
                WHERE ccc.fecha_trans_cnccc BETWEEN $1 AND $2
                  AND ccc.ide_cneco IN (${estados})
                  AND ccc.ide_sucu  = $3
                  AND dpc.ide_cncpc = (SELECT ide_cncpc FROM con_cab_plan_cuen WHERE ide_sucu = $3 AND activo_cncpc = true)
            )
            SELECT
                ROUND(total_activos::numeric,    2) AS total_activos,
                ROUND(total_pasivos::numeric,    2) AS total_pasivos,
                ROUND(total_patrimonio::numeric, 2) AS total_patrimonio,
                ROUND(total_ingresos::numeric,   2) AS total_ingresos,
                ROUND(total_gastos::numeric,     2) AS total_gastos,
                ROUND(total_costos::numeric,     2) AS total_costos,
                ROUND((total_ingresos - total_costos - total_gastos)::numeric, 2) AS utilidad_neta,
                -- Ratios
                ROUND(CASE WHEN total_activos  <> 0 THEN (total_pasivos    / total_activos  * 100)::numeric ELSE 0 END, 2) AS ratio_endeudamiento,
                ROUND(CASE WHEN total_activos  <> 0 THEN (total_patrimonio / total_activos  * 100)::numeric ELSE 0 END, 2) AS ratio_autonomia,
                ROUND(CASE WHEN total_ingresos <> 0 THEN ((total_ingresos - total_costos - total_gastos) / total_ingresos * 100)::numeric ELSE 0 END, 2) AS margen_neto,
                ROUND(CASE WHEN total_ingresos <> 0 THEN ((total_ingresos - total_costos) / total_ingresos * 100)::numeric ELSE 0 END, 2) AS margen_bruto,
                ROUND(CASE WHEN (total_gastos + total_costos) <> 0 THEN (total_ingresos / (total_gastos + total_costos))::numeric ELSE 0 END, 4) AS cobertura_gastos
            FROM base
        `);
        query.addStringParam(1, dto.fechaInicio);
        query.addStringParam(2, dto.fechaFin);
        query.addIntParam(3, dto.ideSucu);

        return this.dataSource.createSingleQuery(query);
    }

    // ─── Gráfico: Evolución mensual de resultados ────────────────────────────────

    /**
     * Evolución mensual de Ingresos, Costos, Gastos y Utilidad Neta durante un año.
     * Retorna los 12 meses (con ceros si no hay movimiento).
     * Ideal para gráfico de líneas o áreas apiladas.
     */
    async getEvolucionMensualResultados(dto: HeaderParamsDto & PeriodoAnioDto) {
        const estados = this.estadosComprobantes;
        const ingresos = this.variables.get('p_con_tipo_cuenta_ingresos');
        const gastos = this.variables.get('p_con_tipo_cuenta_gastos');
        const costos = this.variables.get('p_con_tipo_cuenta_costos');

        const query = new SelectQuery(`
            WITH movs AS (
                SELECT
                    EXTRACT(MONTH FROM ccc.fecha_trans_cnccc)::int AS mes,
                    ROUND(COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${ingresos} THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END)::numeric, 0), 2) AS total_ingresos,
                    ROUND(COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${gastos}   THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END)::numeric, 0), 2) AS total_gastos,
                    ROUND(COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${costos}   THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END)::numeric, 0), 2) AS total_costos
                FROM con_cab_comp_cont  ccc
                JOIN con_det_comp_cont  dcc ON ccc.ide_cnccc = dcc.ide_cnccc
                JOIN con_det_plan_cuen  dpc ON dpc.ide_cndpc = dcc.ide_cndpc
                JOIN con_tipo_cuenta    tc  ON dpc.ide_cntcu = tc.ide_cntcu
                JOIN con_signo_cuenta   sc  ON tc.ide_cntcu  = sc.ide_cntcu
                                          AND dcc.ide_cnlap  = sc.ide_cnlap
                WHERE EXTRACT(YEAR FROM ccc.fecha_trans_cnccc) = $1
                  AND ccc.ide_cneco IN (${estados})
                  AND ccc.ide_sucu  = $2
                  AND dpc.ide_cncpc = (SELECT ide_cncpc FROM con_cab_plan_cuen WHERE ide_sucu = $2 AND activo_cncpc = true)
                  AND dpc.ide_cntcu IN (${ingresos},${gastos},${costos})
                GROUP BY EXTRACT(MONTH FROM ccc.fecha_trans_cnccc)
            )
            SELECT
                gm.ide_gemes                                                    AS mes,
                gm.nombre_gemes,
                COALESCE(m.total_ingresos, 0)                                   AS total_ingresos,
                COALESCE(m.total_gastos,   0)                                   AS total_gastos,
                COALESCE(m.total_costos,   0)                                   AS total_costos,
                ROUND((COALESCE(m.total_ingresos, 0) - COALESCE(m.total_costos, 0) - COALESCE(m.total_gastos, 0))::numeric, 2) AS utilidad_neta
            FROM gen_mes gm
            LEFT JOIN movs m ON gm.ide_gemes = m.mes
            ORDER BY gm.ide_gemes
        `);
        query.addIntParam(1, dto.anio);
        query.addIntParam(2, dto.ideSucu);

        return this.dataSource.createQuery(query);
    }

    // ─── Gráfico: Composición del Balance General ────────────────────────────────

    /**
     * Distribución porcentual de Activo, Pasivo y Patrimonio en el período.
     * Retorna: ide_cntcu, nombre_cntcu, total, porcentaje.
     * Ideal para gráfico de dona (donut) o pastel.
     */
    async getComposicionBalance(dto: HeaderParamsDto & RangoFechasDto) {
        const estados = this.estadosComprobantes;
        const tipos = this.tiposBalance;

        const query = new SelectQuery(`
            WITH totales AS (
                SELECT
                    dpc.ide_cntcu,
                    tc.nombre_cntcu,
                    ROUND(SUM(dcc.valor_cndcc * sc.signo_cnscu)::numeric, 2) AS total
                FROM con_cab_comp_cont  ccc
                JOIN con_det_comp_cont  dcc ON ccc.ide_cnccc = dcc.ide_cnccc
                JOIN con_det_plan_cuen  dpc ON dpc.ide_cndpc = dcc.ide_cndpc
                JOIN con_tipo_cuenta    tc  ON dpc.ide_cntcu = tc.ide_cntcu
                JOIN con_signo_cuenta   sc  ON tc.ide_cntcu  = sc.ide_cntcu
                                          AND dcc.ide_cnlap  = sc.ide_cnlap
                WHERE ccc.fecha_trans_cnccc BETWEEN $1 AND $2
                  AND ccc.ide_cneco IN (${estados})
                  AND ccc.ide_sucu  = $3
                  AND dpc.ide_cncpc = (SELECT ide_cncpc FROM con_cab_plan_cuen WHERE ide_sucu = $3 AND activo_cncpc = true)
                  AND dpc.ide_cntcu IN (${tipos})
                GROUP BY dpc.ide_cntcu, tc.nombre_cntcu
            ),
            gran_total AS (
                SELECT SUM(ABS(total)) AS suma FROM totales
            )
            SELECT
                t.ide_cntcu,
                t.nombre_cntcu,
                t.total,
                ROUND(CASE WHEN gt.suma <> 0 THEN (ABS(t.total) / gt.suma * 100)::numeric ELSE 0 END, 2) AS porcentaje
            FROM totales t
            CROSS JOIN gran_total gt
            ORDER BY ABS(t.total) DESC
        `);
        query.addStringParam(1, dto.fechaInicio);
        query.addStringParam(2, dto.fechaFin);
        query.addIntParam(3, dto.ideSucu);

        return this.dataSource.createQuery(query);
    }

    // ─── Gráfico: Distribución de Gastos y Costos ───────────────────────────────

    /**
     * Top N cuentas de gastos y costos por monto en el período.
     * Retorna: codigo, nombre, tipo_cuenta, total, porcentaje.
     * Ideal para gráfico de barras horizontal o pastel.
     */
    async getDistribucionGastos(dto: HeaderParamsDto & TopCuentasBiDto) {
        const estados = this.estadosComprobantes;
        const gastos = this.variables.get('p_con_tipo_cuenta_gastos');
        const costos = this.variables.get('p_con_tipo_cuenta_costos');
        const limit = dto.limit ?? 10;

        const query = new SelectQuery(`
            WITH movs AS (
                SELECT
                    dpc.codig_recur_cndpc AS codigo,
                    dpc.nombre_cndpc      AS nombre,
                    tc.nombre_cntcu       AS tipo_cuenta,
                    ROUND(SUM(dcc.valor_cndcc * sc.signo_cnscu)::numeric, 2) AS total
                FROM con_cab_comp_cont  ccc
                JOIN con_det_comp_cont  dcc ON ccc.ide_cnccc = dcc.ide_cnccc
                JOIN con_det_plan_cuen  dpc ON dpc.ide_cndpc = dcc.ide_cndpc
                JOIN con_tipo_cuenta    tc  ON dpc.ide_cntcu = tc.ide_cntcu
                JOIN con_signo_cuenta   sc  ON tc.ide_cntcu  = sc.ide_cntcu
                                          AND dcc.ide_cnlap  = sc.ide_cnlap
                WHERE ccc.fecha_trans_cnccc BETWEEN $1 AND $2
                  AND ccc.ide_cneco IN (${estados})
                  AND ccc.ide_sucu  = $3
                  AND dpc.ide_cncpc = (SELECT ide_cncpc FROM con_cab_plan_cuen WHERE ide_sucu = $3 AND activo_cncpc = true)
                  AND dpc.ide_cntcu IN (${gastos}, ${costos})
                  AND dpc.nivel_cndpc = 'HIJO'
                GROUP BY dpc.codig_recur_cndpc, dpc.nombre_cndpc, tc.nombre_cntcu
                HAVING SUM(dcc.valor_cndcc * sc.signo_cnscu) > 0
            ),
            gran_total AS (SELECT SUM(total) AS suma FROM movs)
            SELECT
                m.codigo,
                m.nombre,
                m.tipo_cuenta,
                m.total,
                ROUND(CASE WHEN gt.suma <> 0 THEN (m.total / gt.suma * 100)::numeric ELSE 0 END, 2) AS porcentaje
            FROM movs m
            CROSS JOIN gran_total gt
            ORDER BY m.total DESC
            LIMIT ${limit}
        `);
        query.addStringParam(1, dto.fechaInicio);
        query.addStringParam(2, dto.fechaFin);
        query.addIntParam(3, dto.ideSucu);

        return this.dataSource.createQuery(query);
    }


    /**
     * Volumen mensual de actividad contable durante un año.
     * Retorna los 12 meses con:
     *   - volumen_total: monto total movilizado (debe = haber, se toma uno)
     *   - num_comprobantes: cantidad de asientos contables
     *   - promedio_por_comprobante: monto promedio por asiento
     * Ideal para gráfico de barras + línea de tendencia (combo chart).
     */
    async getVolumenMensualMovimientos(dto: HeaderParamsDto & PeriodoAnioDto) {
        const estados = this.estadosComprobantes;
        const lugarDebe = this.variables.get('p_con_lugar_debe');

        const query = new SelectQuery(`
        WITH movs AS (
            SELECT
                EXTRACT(MONTH FROM ccc.fecha_trans_cnccc)::int           AS mes,
                ROUND(SUM(
                    CASE WHEN dcc.ide_cnlap = ${lugarDebe}
                    THEN dcc.valor_cndcc ELSE 0 END
                )::numeric, 2)                                            AS volumen_total,
                COUNT(DISTINCT ccc.ide_cnccc)                            AS num_comprobantes
            FROM con_cab_comp_cont ccc
            JOIN con_det_comp_cont dcc ON ccc.ide_cnccc = dcc.ide_cnccc
            WHERE EXTRACT(YEAR FROM ccc.fecha_trans_cnccc) = $1
              AND ccc.ide_cneco IN (${estados})
              AND ccc.ide_sucu  = $2
            GROUP BY
                EXTRACT(MONTH FROM ccc.fecha_trans_cnccc)
        )
        SELECT
            gm.ide_gemes                                                  AS mes,
            gm.nombre_gemes,
            COALESCE(m.volumen_total,       0)                            AS volumen_total,
            COALESCE(m.num_comprobantes,    0)                            AS num_comprobantes,
            ROUND(
                CASE WHEN COALESCE(m.num_comprobantes, 0) > 0
                THEN (m.volumen_total / m.num_comprobantes)::numeric
                ELSE 0 END
            , 2)                                                          AS promedio_por_comprobante
        FROM gen_mes gm
        LEFT JOIN movs m ON gm.ide_gemes = m.mes
        ORDER BY gm.ide_gemes
    `);
        query.addIntParam(1, dto.anio);
        query.addIntParam(2, dto.ideSucu);

        return this.dataSource.createQuery(query);
    }
    // ─── Gráfico: Top cuentas con mayor movimiento ──────────────────────────────

    /**
     * Cuentas contables con mayor volumen de movimientos en el período.
     * Retorna: codigo, nombre, tipo_cuenta, num_movimientos, total_debe, total_haber, saldo_neto.
     * Ideal para tabla rankeada o gráfico de barras horizontal.
     */
    async getTopCuentasMayorMovimiento(dto: HeaderParamsDto & TopCuentasBiDto) {
        const estados = this.estadosComprobantes;
        const lugarDebe = this.variables.get('p_con_lugar_debe');
        const lugarHaber = this.variables.get('p_con_lugar_haber');
        const limit = dto.limit ?? 10;

        const query = new SelectQuery(`
            SELECT
                dpc.codig_recur_cndpc                                                                    AS codigo,
                dpc.nombre_cndpc                                                                         AS nombre,
                tc.nombre_cntcu                                                                          AS tipo_cuenta,
                COUNT(dcc.ide_cndcc)                                                                     AS num_movimientos,
                ROUND(SUM(CASE WHEN dcc.ide_cnlap =  ${lugarDebe} THEN dcc.valor_cndcc ELSE 0 END)::numeric, 2) AS total_debe,
                ROUND(SUM(CASE WHEN dcc.ide_cnlap = ${lugarHaber} THEN dcc.valor_cndcc ELSE 0 END)::numeric, 2) AS total_haber,
                ROUND(SUM(dcc.valor_cndcc * sc.signo_cnscu)::numeric, 2)                                 AS saldo_neto
            FROM con_cab_comp_cont  ccc
            JOIN con_det_comp_cont  dcc ON ccc.ide_cnccc = dcc.ide_cnccc
            JOIN con_det_plan_cuen  dpc ON dpc.ide_cndpc = dcc.ide_cndpc
            JOIN con_tipo_cuenta    tc  ON dpc.ide_cntcu = tc.ide_cntcu
            JOIN con_signo_cuenta   sc  ON tc.ide_cntcu  = sc.ide_cntcu
                                      AND dcc.ide_cnlap  = sc.ide_cnlap
            WHERE ccc.fecha_trans_cnccc BETWEEN $1 AND $2
              AND ccc.ide_cneco IN (${estados})
              AND ccc.ide_sucu  = $3
              AND dpc.ide_cncpc = (SELECT ide_cncpc FROM con_cab_plan_cuen WHERE ide_sucu = $3 AND activo_cncpc = true)
              AND dpc.nivel_cndpc = 'HIJO'
            GROUP BY dpc.codig_recur_cndpc, dpc.nombre_cndpc, tc.nombre_cntcu
            ORDER BY COUNT(dcc.ide_cndcc) DESC
            LIMIT ${limit}
        `);
        query.addStringParam(1, dto.fechaInicio);
        query.addStringParam(2, dto.fechaFin);
        query.addIntParam(3, dto.ideSucu);

        return this.dataSource.createQuery(query);
    }

    // ─── Gráfico: Comparativo de resultados entre dos períodos (años) ───────────

    /**
     * Comparativo mensual de Ingresos y Utilidad entre el año actual y el anterior.
     * Retorna los 12 meses con columnas separadas por año.
     * Ideal para gráfico de barras agrupadas de comparación interanual.
     */
    async getComparativoPeriodos(dto: HeaderParamsDto & ComparativoPeriodosDto) {
        const estados = this.estadosComprobantes;
        const ingresos = this.variables.get('p_con_tipo_cuenta_ingresos');
        const gastos = this.variables.get('p_con_tipo_cuenta_gastos');
        const costos = this.variables.get('p_con_tipo_cuenta_costos');

        const query = new SelectQuery(`
            WITH movs AS (
                SELECT
                    EXTRACT(YEAR  FROM ccc.fecha_trans_cnccc)::int AS anio,
                    EXTRACT(MONTH FROM ccc.fecha_trans_cnccc)::int AS mes,
                    COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${ingresos} THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END), 0) AS total_ingresos,
                    COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${gastos}   THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END), 0) AS total_gastos,
                    COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${costos}   THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END), 0) AS total_costos
                FROM con_cab_comp_cont  ccc
                JOIN con_det_comp_cont  dcc ON ccc.ide_cnccc = dcc.ide_cnccc
                JOIN con_det_plan_cuen  dpc ON dpc.ide_cndpc = dcc.ide_cndpc
                JOIN con_tipo_cuenta    tc  ON dpc.ide_cntcu = tc.ide_cntcu
                JOIN con_signo_cuenta   sc  ON tc.ide_cntcu  = sc.ide_cntcu
                                          AND dcc.ide_cnlap  = sc.ide_cnlap
                WHERE EXTRACT(YEAR FROM ccc.fecha_trans_cnccc) IN ($1, $2)
                  AND ccc.ide_cneco IN (${estados})
                  AND ccc.ide_sucu  = $3
                  AND dpc.ide_cncpc = (SELECT ide_cncpc FROM con_cab_plan_cuen WHERE ide_sucu = $3 AND activo_cncpc = true)
                  AND dpc.ide_cntcu IN (${ingresos}, ${gastos}, ${costos})
                GROUP BY
                    EXTRACT(YEAR  FROM ccc.fecha_trans_cnccc),
                    EXTRACT(MONTH FROM ccc.fecha_trans_cnccc)
            )
            SELECT
                gm.ide_gemes                                                                      AS mes,
                gm.nombre_gemes,
                -- Año actual
                ROUND(COALESCE(MAX(CASE WHEN m.anio = $1 THEN m.total_ingresos END), 0)::numeric, 2) AS ingresos_actual,
                ROUND(COALESCE(MAX(CASE WHEN m.anio = $1 THEN m.total_ingresos - m.total_costos - m.total_gastos END), 0)::numeric, 2) AS utilidad_actual,
                -- Año anterior
                ROUND(COALESCE(MAX(CASE WHEN m.anio = $2 THEN m.total_ingresos END), 0)::numeric, 2) AS ingresos_anterior,
                ROUND(COALESCE(MAX(CASE WHEN m.anio = $2 THEN m.total_ingresos - m.total_costos - m.total_gastos END), 0)::numeric, 2) AS utilidad_anterior,
                -- Variación porcentual de ingresos
                ROUND(CASE
                    WHEN COALESCE(MAX(CASE WHEN m.anio = $2 THEN m.total_ingresos END), 0) <> 0
                    THEN ((COALESCE(MAX(CASE WHEN m.anio = $1 THEN m.total_ingresos END), 0)
                           - COALESCE(MAX(CASE WHEN m.anio = $2 THEN m.total_ingresos END), 0))
                          / COALESCE(MAX(CASE WHEN m.anio = $2 THEN m.total_ingresos END), 1) * 100)::numeric
                    ELSE 0 END, 2) AS variacion_ingresos_pct
            FROM gen_mes gm
            LEFT JOIN movs m ON gm.ide_gemes = m.mes
            GROUP BY gm.ide_gemes, gm.nombre_gemes
            ORDER BY gm.ide_gemes
        `);
        query.addIntParam(1, dto.anioActual);
        query.addIntParam(2, dto.anioAnterior);
        query.addIntParam(3, dto.ideSucu);

        return this.dataSource.createQuery(query);
    }

    // ─── Gráfico: Tendencia de Activos, Pasivos y Patrimonio por mes ────────────

    /**
     * Evolución mensual del Balance (Activos, Pasivos, Patrimonio) durante un año.
     * Retorna los 12 meses con saldos acumulados de balance.
     * Ideal para gráfico de áreas apiladas o líneas.
     */
    async getTendenciaBalance(dto: HeaderParamsDto & PeriodoAnioDto) {
        const estados = this.estadosComprobantes;
        const activo = this.variables.get('p_con_tipo_cuenta_activo');
        const pasivo = this.variables.get('p_con_tipo_cuenta_pasivo');
        const patrimonio = this.variables.get('p_con_tipo_cuenta_patrimonio');

        const query = new SelectQuery(`
            WITH movs AS (
                SELECT
                    EXTRACT(MONTH FROM ccc.fecha_trans_cnccc)::int AS mes,
                    ROUND(COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${activo}     THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END)::numeric, 0), 2) AS total_activos,
                    ROUND(COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${pasivo}     THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END)::numeric, 0), 2) AS total_pasivos,
                    ROUND(COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${patrimonio} THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END)::numeric, 0), 2) AS total_patrimonio
                FROM con_cab_comp_cont  ccc
                JOIN con_det_comp_cont  dcc ON ccc.ide_cnccc = dcc.ide_cnccc
                JOIN con_det_plan_cuen  dpc ON dpc.ide_cndpc = dcc.ide_cndpc
                JOIN con_tipo_cuenta    tc  ON dpc.ide_cntcu = tc.ide_cntcu
                JOIN con_signo_cuenta   sc  ON tc.ide_cntcu  = sc.ide_cntcu
                                          AND dcc.ide_cnlap  = sc.ide_cnlap
                WHERE EXTRACT(YEAR FROM ccc.fecha_trans_cnccc) = $1
                  AND ccc.ide_cneco IN (${estados})
                  AND ccc.ide_sucu  = $2
                  AND dpc.ide_cncpc = (SELECT ide_cncpc FROM con_cab_plan_cuen WHERE ide_sucu = $2 AND activo_cncpc = true)
                  AND dpc.ide_cntcu IN (${activo}, ${pasivo}, ${patrimonio})
                GROUP BY EXTRACT(MONTH FROM ccc.fecha_trans_cnccc)
            )
            SELECT
                gm.ide_gemes                        AS mes,
                gm.nombre_gemes,
                COALESCE(m.total_activos,    0)     AS total_activos,
                COALESCE(m.total_pasivos,    0)     AS total_pasivos,
                COALESCE(m.total_patrimonio, 0)     AS total_patrimonio,
                ROUND((COALESCE(m.total_activos, 0) - COALESCE(m.total_pasivos, 0))::numeric, 2) AS activo_neto
            FROM gen_mes gm
            LEFT JOIN movs m ON gm.ide_gemes = m.mes
            ORDER BY gm.ide_gemes
        `);
        query.addIntParam(1, dto.anio);
        query.addIntParam(2, dto.ideSucu);

        return this.dataSource.createQuery(query);
    }

    // ─── Gráfico: Distribución de Ingresos por cuenta ───────────────────────────

    /**
     * Top N cuentas de ingresos por monto en el período.
     * Retorna: codigo, nombre, total, porcentaje.
     * Ideal para gráfico de barras horizontal o pastel.
     */
    async getDistribucionIngresos(dto: HeaderParamsDto & TopCuentasBiDto) {
        const estados = this.estadosComprobantes;
        const ingresos = this.variables.get('p_con_tipo_cuenta_ingresos');
        const limit = dto.limit ?? 10;

        const query = new SelectQuery(`
            WITH movs AS (
                SELECT
                    dpc.codig_recur_cndpc AS codigo,
                    dpc.nombre_cndpc      AS nombre,
                    ROUND(SUM(dcc.valor_cndcc * sc.signo_cnscu)::numeric, 2) AS total
                FROM con_cab_comp_cont  ccc
                JOIN con_det_comp_cont  dcc ON ccc.ide_cnccc = dcc.ide_cnccc
                JOIN con_det_plan_cuen  dpc ON dpc.ide_cndpc = dcc.ide_cndpc
                JOIN con_tipo_cuenta    tc  ON dpc.ide_cntcu = tc.ide_cntcu
                JOIN con_signo_cuenta   sc  ON tc.ide_cntcu  = sc.ide_cntcu
                                          AND dcc.ide_cnlap  = sc.ide_cnlap
                WHERE ccc.fecha_trans_cnccc BETWEEN $1 AND $2
                  AND ccc.ide_cneco IN (${estados})
                  AND ccc.ide_sucu  = $3
                  AND dpc.ide_cncpc = (SELECT ide_cncpc FROM con_cab_plan_cuen WHERE ide_sucu = $3 AND activo_cncpc = true)
                  AND dpc.ide_cntcu = ${ingresos}
                  AND dpc.nivel_cndpc = 'HIJO'
                GROUP BY dpc.codig_recur_cndpc, dpc.nombre_cndpc
                HAVING SUM(dcc.valor_cndcc * sc.signo_cnscu) > 0
            ),
            gran_total AS (SELECT SUM(total) AS suma FROM movs)
            SELECT
                m.codigo,
                m.nombre,
                m.total,
                ROUND(CASE WHEN gt.suma <> 0 THEN (m.total / gt.suma * 100)::numeric ELSE 0 END, 2) AS porcentaje
            FROM movs m
            CROSS JOIN gran_total gt
            ORDER BY m.total DESC
            LIMIT ${limit}
        `);
        query.addStringParam(1, dto.fechaInicio);
        query.addStringParam(2, dto.fechaFin);
        query.addIntParam(3, dto.ideSucu);

        return this.dataSource.createQuery(query);
    }

    // ─── Gráfico: Actividad diaria de comprobantes ──────────────────────────────

    /**
     * Número de comprobantes y monto total por día de la semana en el período.
     * Retorna: num_dia, dia_semana, num_comprobantes, total_debe, promedio_diario.
     * Ideal para gráfico de barras o heatmap semanal.
     */
    async getActividadPorDiaSemana(dto: HeaderParamsDto & RangoFechasDto) {
        const estados = this.estadosComprobantes;
        const lugarDebe = this.variables.get('p_con_lugar_debe');

        const query = new SelectQuery(`
            WITH dias_semana AS (
                SELECT 0 AS num_dia, 'Domingo'   AS dia_semana UNION ALL
                SELECT 1,            'Lunes'                   UNION ALL
                SELECT 2,            'Martes'                  UNION ALL
                SELECT 3,            'Miércoles'               UNION ALL
                SELECT 4,            'Jueves'                  UNION ALL
                SELECT 5,            'Viernes'                 UNION ALL
                SELECT 6,            'Sábado'
            ),
            movs AS (
                SELECT
                    EXTRACT(DOW FROM ccc.fecha_trans_cnccc)::int AS num_dia,
                    COUNT(DISTINCT ccc.ide_cnccc)                 AS num_comprobantes,
                    ROUND(SUM(CASE WHEN dcc.ide_cnlap = ${lugarDebe} THEN dcc.valor_cndcc ELSE 0 END)::numeric, 2) AS total_debe
                FROM con_cab_comp_cont  ccc
                JOIN con_det_comp_cont  dcc ON ccc.ide_cnccc = dcc.ide_cnccc
                WHERE ccc.fecha_trans_cnccc BETWEEN $1 AND $2
                  AND ccc.ide_cneco IN (${estados})
                  AND ccc.ide_sucu  = $3
                GROUP BY EXTRACT(DOW FROM ccc.fecha_trans_cnccc)
            )
            SELECT
                ds.num_dia,
                ds.dia_semana,
                COALESCE(m.num_comprobantes, 0) AS num_comprobantes,
                COALESCE(m.total_debe,       0) AS total_debe,
                ROUND(CASE WHEN COALESCE(m.num_comprobantes, 0) > 0
                    THEN (m.total_debe / m.num_comprobantes)::numeric ELSE 0 END, 2) AS promedio_por_comprobante
            FROM dias_semana ds
            LEFT JOIN movs m ON ds.num_dia = m.num_dia
            ORDER BY ds.num_dia
        `);
        query.addStringParam(1, dto.fechaInicio);
        query.addStringParam(2, dto.fechaFin);
        query.addIntParam(3, dto.ideSucu);

        return this.dataSource.createQuery(query);
    }

    // ─── Gráfico: Resumen por tipo de comprobante ───────────────────────────────

    /**
     * Distribución de comprobantes por tipo (diarios, ajustes, cierres, etc.) en el período.
     * Retorna: nombre_cntcm, num_comprobantes, total_debe, porcentaje.
     * Ideal para gráfico de dona o barras apiladas.
     */
    async getResumenPorTipoComprobante(dto: HeaderParamsDto & RangoFechasDto) {
        const estados = this.estadosComprobantes;
        const lugarDebe = this.variables.get('p_con_lugar_debe');

        const query = new SelectQuery(`
            WITH movs AS (
                SELECT
                    tc.nombre_cntcm,
                    COUNT(DISTINCT ccc.ide_cnccc)                 AS num_comprobantes,
                    ROUND(SUM(CASE WHEN dcc.ide_cnlap = ${lugarDebe} THEN dcc.valor_cndcc ELSE 0 END)::numeric, 2) AS total_debe
                FROM con_cab_comp_cont  ccc
                JOIN con_tipo_comproba  tc  ON ccc.ide_cntcm  = tc.ide_cntcm
                JOIN con_det_comp_cont  dcc ON ccc.ide_cnccc  = dcc.ide_cnccc
                WHERE ccc.fecha_trans_cnccc BETWEEN $1 AND $2
                  AND ccc.ide_cneco IN (${estados})
                  AND ccc.ide_sucu  = $3
                GROUP BY tc.nombre_cntcm
            ),
            gran_total AS (SELECT SUM(num_comprobantes) AS suma FROM movs)
            SELECT
                m.nombre_cntcm,
                m.num_comprobantes,
                m.total_debe,
                ROUND(CASE WHEN gt.suma <> 0 THEN (m.num_comprobantes::numeric / gt.suma * 100)::numeric ELSE 0 END, 2) AS porcentaje
            FROM movs m
            CROSS JOIN gran_total gt
            ORDER BY m.num_comprobantes DESC
        `);
        query.addStringParam(1, dto.fechaInicio);
        query.addStringParam(2, dto.fechaFin);
        query.addIntParam(3, dto.ideSucu);

        return this.dataSource.createQuery(query);
    }

    // ─── Dashboard: Resumen compacto (un solo endpoint) ─────────────────────────

    /**
     * Dashboard ejecutivo: KPIs principales + composición del balance + top 5 cuentas.
     * Retorna un objeto con todas las métricas necesarias para el dashboard principal.
     * Optimizado para cargar en una sola llamada API.
     */
    async getDashboardResumen(dto: HeaderParamsDto & RangoFechasDto) {
        const estados = this.estadosComprobantes;
        const activo = this.variables.get('p_con_tipo_cuenta_activo');
        const pasivo = this.variables.get('p_con_tipo_cuenta_pasivo');
        const patrimonio = this.variables.get('p_con_tipo_cuenta_patrimonio');
        const ingresos = this.variables.get('p_con_tipo_cuenta_ingresos');
        const gastos = this.variables.get('p_con_tipo_cuenta_gastos');
        const costos = this.variables.get('p_con_tipo_cuenta_costos');
        const lugarDebe = this.variables.get('p_con_lugar_debe');

        const query = new SelectQuery(`
            WITH base AS (
                SELECT
                    COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${activo}     THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END), 0) AS total_activos,
                    COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${pasivo}     THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END), 0) AS total_pasivos,
                    COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${patrimonio} THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END), 0) AS total_patrimonio,
                    COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${ingresos}   THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END), 0) AS total_ingresos,
                    COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${gastos}     THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END), 0) AS total_gastos,
                    COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${costos}     THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END), 0) AS total_costos,
                    COUNT(DISTINCT ccc.ide_cnccc)::int                                                                                         AS num_comprobantes,
                    ROUND(COALESCE(SUM(CASE WHEN dcc.ide_cnlap = ${lugarDebe} THEN dcc.valor_cndcc ELSE 0 END)::numeric, 0), 2)                 AS total_debe,
                    ROUND(COALESCE(SUM(CASE WHEN dcc.ide_cnlap != ${lugarDebe} THEN dcc.valor_cndcc ELSE 0 END)::numeric, 0), 2)                 AS total_haber
                FROM con_cab_comp_cont  ccc
                JOIN con_det_comp_cont  dcc ON ccc.ide_cnccc = dcc.ide_cnccc
                JOIN con_det_plan_cuen  dpc ON dpc.ide_cndpc = dcc.ide_cndpc
                JOIN con_tipo_cuenta    tc  ON dpc.ide_cntcu = tc.ide_cntcu
                JOIN con_signo_cuenta   sc  ON tc.ide_cntcu  = sc.ide_cntcu
                                          AND dcc.ide_cnlap  = sc.ide_cnlap
                WHERE ccc.fecha_trans_cnccc BETWEEN $1 AND $2
                  AND ccc.ide_cneco IN (${estados})
                  AND ccc.ide_sucu  = $3
                  AND dpc.ide_cncpc = (SELECT ide_cncpc FROM con_cab_plan_cuen WHERE ide_sucu = $3 AND activo_cncpc = true)
            ),
            balance_composicion AS (
                SELECT
                    dpc.ide_cntcu,
                    tc.nombre_cntcu,
                    ROUND(SUM(dcc.valor_cndcc * sc.signo_cnscu)::numeric, 2) AS total
                FROM con_cab_comp_cont  ccc
                JOIN con_det_comp_cont  dcc ON ccc.ide_cnccc = dcc.ide_cnccc
                JOIN con_det_plan_cuen  dpc ON dpc.ide_cndpc = dcc.ide_cndpc
                JOIN con_tipo_cuenta    tc  ON dpc.ide_cntcu = tc.ide_cntcu
                JOIN con_signo_cuenta   sc  ON tc.ide_cntcu  = sc.ide_cntcu
                                          AND dcc.ide_cnlap  = sc.ide_cnlap
                WHERE ccc.fecha_trans_cnccc BETWEEN $1 AND $2
                  AND ccc.ide_cneco IN (${estados})
                  AND ccc.ide_sucu  = $3
                  AND dpc.ide_cncpc = (SELECT ide_cncpc FROM con_cab_plan_cuen WHERE ide_sucu = $3 AND activo_cncpc = true)
                  AND dpc.ide_cntcu IN (${activo}, ${pasivo}, ${patrimonio})
                GROUP BY dpc.ide_cntcu, tc.nombre_cntcu
            ),
            top_ingresos AS (
                SELECT
                    dpc.codig_recur_cndpc AS codigo,
                    dpc.nombre_cndpc      AS nombre,
                    'INGRESO'             AS tipo,
                    ROUND(SUM(dcc.valor_cndcc * sc.signo_cnscu)::numeric, 2) AS total
                FROM con_cab_comp_cont  ccc
                JOIN con_det_comp_cont  dcc ON ccc.ide_cnccc = dcc.ide_cnccc
                JOIN con_det_plan_cuen  dpc ON dpc.ide_cndpc = dcc.ide_cndpc
                JOIN con_tipo_cuenta    tc  ON dpc.ide_cntcu = tc.ide_cntcu
                JOIN con_signo_cuenta   sc  ON tc.ide_cntcu  = sc.ide_cntcu
                                          AND dcc.ide_cnlap  = sc.ide_cnlap
                WHERE ccc.fecha_trans_cnccc BETWEEN $1 AND $2
                  AND ccc.ide_cneco IN (${estados})
                  AND ccc.ide_sucu  = $3
                  AND dpc.ide_cncpc = (SELECT ide_cncpc FROM con_cab_plan_cuen WHERE ide_sucu = $3 AND activo_cncpc = true)
                  AND dpc.ide_cntcu = ${ingresos}
                  AND dpc.nivel_cndpc = 'HIJO'
                GROUP BY dpc.codig_recur_cndpc, dpc.nombre_cndpc
                HAVING SUM(dcc.valor_cndcc * sc.signo_cnscu) > 0
                ORDER BY total DESC
                LIMIT 5
            ),
            top_gastos AS (
                SELECT
                    dpc.codig_recur_cndpc AS codigo,
                    dpc.nombre_cndpc      AS nombre,
                    'GASTO'               AS tipo,
                    ROUND(SUM(dcc.valor_cndcc * sc.signo_cnscu)::numeric, 2) AS total
                FROM con_cab_comp_cont  ccc
                JOIN con_det_comp_cont  dcc ON ccc.ide_cnccc = dcc.ide_cnccc
                JOIN con_det_plan_cuen  dpc ON dpc.ide_cndpc = dcc.ide_cndpc
                JOIN con_tipo_cuenta    tc  ON dpc.ide_cntcu = tc.ide_cntcu
                JOIN con_signo_cuenta   sc  ON tc.ide_cntcu  = sc.ide_cntcu
                                          AND dcc.ide_cnlap  = sc.ide_cnlap
                WHERE ccc.fecha_trans_cnccc BETWEEN $1 AND $2
                  AND ccc.ide_cneco IN (${estados})
                  AND ccc.ide_sucu  = $3
                  AND dpc.ide_cncpc = (SELECT ide_cncpc FROM con_cab_plan_cuen WHERE ide_sucu = $3 AND activo_cncpc = true)
                  AND dpc.ide_cntcu IN (${gastos}, ${costos})
                  AND dpc.nivel_cndpc = 'HIJO'
                GROUP BY dpc.codig_recur_cndpc, dpc.nombre_cndpc
                HAVING SUM(dcc.valor_cndcc * sc.signo_cnscu) > 0
                ORDER BY total DESC
                LIMIT 5
            )
            SELECT
                ROUND(b.total_activos::numeric,    2) AS total_activos,
                ROUND(b.total_pasivos::numeric,    2) AS total_pasivos,
                ROUND(b.total_patrimonio::numeric, 2) AS total_patrimonio,
                ROUND(b.total_ingresos::numeric,   2) AS total_ingresos,
                ROUND(b.total_gastos::numeric,     2) AS total_gastos,
                ROUND(b.total_costos::numeric,     2) AS total_costos,
                ROUND((b.total_ingresos - b.total_costos - b.total_gastos)::numeric, 2) AS utilidad_neta,
                b.num_comprobantes,
                b.total_debe,
                b.total_haber,
                ROUND(CASE WHEN b.total_activos <> 0 THEN (b.total_pasivos / b.total_activos * 100)::numeric ELSE 0 END, 2) AS ratio_endeudamiento,
                ROUND(CASE WHEN b.total_activos <> 0 THEN (b.total_patrimonio / b.total_activos * 100)::numeric ELSE 0 END, 2) AS ratio_autonomia,
                ROUND(CASE WHEN b.total_ingresos <> 0 THEN ((b.total_ingresos - b.total_costos - b.total_gastos) / b.total_ingresos * 100)::numeric ELSE 0 END, 2) AS margen_neto,
                COALESCE((SELECT jsonb_agg(row_to_json(bc.*)) FROM balance_composicion bc), '[]'::jsonb) AS composicion_balance,
                COALESCE((SELECT jsonb_agg(row_to_json(ti.*)) FROM top_ingresos ti), '[]'::jsonb)     AS top_ingresos,
                COALESCE((SELECT jsonb_agg(row_to_json(tg.*)) FROM top_gastos tg), '[]'::jsonb)       AS top_gastos
            FROM base b
        `);
        query.addStringParam(1, dto.fechaInicio);
        query.addStringParam(2, dto.fechaFin);
        query.addIntParam(3, dto.ideSucu);

        return this.dataSource.createSingleQuery(query);
    }

    // ─── Balance y resultados por periodo contable ───────────────────────────────

    /**
     * Balance General para un periodo contable específico usando con_periodo.
     * Usa las fechas del periodo (fecha_inicio_cnper / fecha_fin_cnper).
     */
    async getBalancePorPeriodo(dto: HeaderParamsDto & PeriodoContableDto) {
        const estados = this.estadosComprobantes;
        const tipos = this.tiposBalance;

        const query = new SelectQuery(`
            WITH periodo AS (
                SELECT fecha_inicio_cnper, fecha_fin_cnper, nombre_cnper
                FROM con_periodo
                WHERE ide_cnper = $1 AND ide_sucu = $2
            ),
            totales AS (
                SELECT
                    dpc.ide_cntcu,
                    tc.nombre_cntcu,
                    ROUND(SUM(dcc.valor_cndcc * sc.signo_cnscu)::numeric, 2) AS total
                FROM con_cab_comp_cont  ccc
                JOIN con_det_comp_cont  dcc ON ccc.ide_cnccc = dcc.ide_cnccc
                JOIN con_det_plan_cuen  dpc ON dpc.ide_cndpc = dcc.ide_cndpc
                JOIN con_tipo_cuenta    tc  ON dpc.ide_cntcu = tc.ide_cntcu
                JOIN con_signo_cuenta   sc  ON tc.ide_cntcu  = sc.ide_cntcu
                                          AND dcc.ide_cnlap  = sc.ide_cnlap
                CROSS JOIN periodo p
                WHERE ccc.fecha_trans_cnccc BETWEEN p.fecha_inicio_cnper AND p.fecha_fin_cnper
                  AND ccc.ide_cneco IN (${estados})
                  AND ccc.ide_sucu  = $2
                  AND dpc.ide_cncpc = (SELECT ide_cncpc FROM con_cab_plan_cuen WHERE ide_sucu = $2 AND activo_cncpc = true)
                  AND dpc.ide_cntcu IN (${tipos})
                GROUP BY dpc.ide_cntcu, tc.nombre_cntcu
            )
            SELECT
                p.nombre_cnper,
                p.fecha_inicio_cnper,
                p.fecha_fin_cnper,
                COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'ide_cntcu',     t.ide_cntcu,
                        'nombre_cntcu',  t.nombre_cntcu,
                        'total',         t.total
                    )
                ) FILTER (WHERE t.ide_cntcu IS NOT NULL), '[]'::jsonb) AS detalle
            FROM periodo p
            LEFT JOIN totales t ON true
            GROUP BY p.nombre_cnper, p.fecha_inicio_cnper, p.fecha_fin_cnper
        `);
        query.addIntParam(1, dto.ideCnper);
        query.addIntParam(2, dto.ideSucu);

        return this.dataSource.createSingleQuery(query);
    }

    /**
     * Estado de Resultados para un periodo contable específico usando con_periodo.
     */
    async getResultadosPorPeriodo(dto: HeaderParamsDto & PeriodoContableDto) {
        const estados = this.estadosComprobantes;
        const ingresos = this.variables.get('p_con_tipo_cuenta_ingresos');
        const gastos = this.variables.get('p_con_tipo_cuenta_gastos');
        const costos = this.variables.get('p_con_tipo_cuenta_costos');

        const query = new SelectQuery(`
            WITH periodo AS (
                SELECT fecha_inicio_cnper, fecha_fin_cnper, nombre_cnper
                FROM con_periodo
                WHERE ide_cnper = $1 AND ide_sucu = $2
            ),
            totales AS (
                SELECT
                    dpc.ide_cntcu,
                    tc.nombre_cntcu,
                    ROUND(SUM(dcc.valor_cndcc * sc.signo_cnscu)::numeric, 2) AS total
                FROM con_cab_comp_cont  ccc
                JOIN con_det_comp_cont  dcc ON ccc.ide_cnccc = dcc.ide_cnccc
                JOIN con_det_plan_cuen  dpc ON dpc.ide_cndpc = dcc.ide_cndpc
                JOIN con_tipo_cuenta    tc  ON dpc.ide_cntcu = tc.ide_cntcu
                JOIN con_signo_cuenta   sc  ON tc.ide_cntcu  = sc.ide_cntcu
                                          AND dcc.ide_cnlap  = sc.ide_cnlap
                CROSS JOIN periodo p
                WHERE ccc.fecha_trans_cnccc BETWEEN p.fecha_inicio_cnper AND p.fecha_fin_cnper
                  AND ccc.ide_cneco IN (${estados})
                  AND ccc.ide_sucu  = $2
                  AND dpc.ide_cncpc = (SELECT ide_cncpc FROM con_cab_plan_cuen WHERE ide_sucu = $2 AND activo_cncpc = true)
                  AND dpc.ide_cntcu IN (${ingresos}, ${gastos}, ${costos})
                GROUP BY dpc.ide_cntcu, tc.nombre_cntcu
            )
            SELECT
                p.nombre_cnper,
                p.fecha_inicio_cnper,
                p.fecha_fin_cnper,
                COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'ide_cntcu',     t.ide_cntcu,
                        'nombre_cntcu',  t.nombre_cntcu,
                        'total',         t.total
                    )
                ) FILTER (WHERE t.ide_cntcu IS NOT NULL), '[]'::jsonb) AS detalle
            FROM periodo p
            LEFT JOIN totales t ON true
            GROUP BY p.nombre_cnper, p.fecha_inicio_cnper, p.fecha_fin_cnper
        `);
        query.addIntParam(1, dto.ideCnper);
        query.addIntParam(2, dto.ideSucu);

        return this.dataSource.createSingleQuery(query);
    }

    // ─── Evolución de KPIs en el tiempo ──────────────────────────────────────────

    /**
     * Evolución del margen bruto en los últimos N periodos contables.
     * Retorna: periodo, fecha_inicio, fecha_fin, ingresos, costos, margen_bruto, utilidad_neta.
     * Ideal para gráfico de línea de tendencia + barras.
     */
    async getEvolucionMargenBruto(dto: HeaderParamsDto & EvolucionPeriodosDto) {
        const estados = this.estadosComprobantes;
        const ingresos = this.variables.get('p_con_tipo_cuenta_ingresos');
        const gastos = this.variables.get('p_con_tipo_cuenta_gastos');
        const costos = this.variables.get('p_con_tipo_cuenta_costos');
        const cantidad = dto.cantidad ?? 12;

        const query = new SelectQuery(`
            WITH periodos AS (
                SELECT
                    ide_cnper,
                    nombre_cnper,
                    fecha_inicio_cnper,
                    fecha_fin_cnper
                FROM con_periodo
                WHERE ide_sucu = $1
                  AND estado_cnper = true
                ORDER BY ide_cnper DESC
                LIMIT ${cantidad}
            ),
            movs AS (
                SELECT
                    p.ide_cnper,
                    p.nombre_cnper,
                    p.fecha_inicio_cnper,
                    p.fecha_fin_cnper,
                    ROUND(COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${ingresos} THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END)::numeric, 0), 2) AS total_ingresos,
                    ROUND(COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${gastos}   THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END)::numeric, 0), 2) AS total_gastos,
                    ROUND(COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${costos}   THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END)::numeric, 0), 2) AS total_costos
                FROM periodos p
                LEFT JOIN con_cab_comp_cont  ccc ON ccc.fecha_trans_cnccc BETWEEN p.fecha_inicio_cnper AND p.fecha_fin_cnper
                                                AND ccc.ide_cneco IN (${estados})
                                                AND ccc.ide_sucu = $1
                LEFT JOIN con_det_comp_cont  dcc ON ccc.ide_cnccc = dcc.ide_cnccc
                LEFT JOIN con_det_plan_cuen  dpc ON dpc.ide_cndpc = dcc.ide_cndpc
                                                AND dpc.ide_cntcu IN (${ingresos}, ${gastos}, ${costos})
                                                AND dpc.ide_cncpc = (SELECT ide_cncpc FROM con_cab_plan_cuen WHERE ide_sucu = $1 AND activo_cncpc = true)
                LEFT JOIN con_tipo_cuenta    tc  ON dpc.ide_cntcu = tc.ide_cntcu
                LEFT JOIN con_signo_cuenta   sc  ON tc.ide_cntcu  = sc.ide_cntcu
                                                AND dcc.ide_cnlap  = sc.ide_cnlap
                GROUP BY p.ide_cnper, p.nombre_cnper, p.fecha_inicio_cnper, p.fecha_fin_cnper
            )
            SELECT
                ide_cnper,
                nombre_cnper,
                fecha_inicio_cnper,
                fecha_fin_cnper,
                total_ingresos,
                total_costos,
                total_gastos,
                ROUND((total_ingresos - total_costos)::numeric, 2)            AS margen_bruto,
                ROUND((total_ingresos - total_costos - total_gastos)::numeric, 2) AS utilidad_neta,
                ROUND(CASE WHEN total_ingresos <> 0 THEN ((total_ingresos - total_costos) / total_ingresos * 100)::numeric ELSE 0 END, 2) AS pct_margen_bruto,
                ROUND(CASE WHEN total_ingresos <> 0 THEN ((total_ingresos - total_costos - total_gastos) / total_ingresos * 100)::numeric ELSE 0 END, 2) AS pct_margen_neto
            FROM movs
            ORDER BY ide_cnper ASC
        `);
        query.addIntParam(1, dto.ideSucu);

        return this.dataSource.createQuery(query);
    }

    /**
     * Análisis de concentración (Pareto) de cuentas contables.
     * Retorna: codigo, nombre, total, porcentaje, porcentaje_acumulado.
     * Ideal para gráfico combinado de barras + línea (Pareto).
     */
    async getConcentracionCuentas(dto: HeaderParamsDto & TopCuentasBiDto) {
        const estados = this.estadosComprobantes;
        const limit = dto.limit ?? 20;

        const query = new SelectQuery(`
            WITH movs AS (
                SELECT
                    dpc.codig_recur_cndpc  AS codigo,
                    dpc.nombre_cndpc       AS nombre,
                    tc.nombre_cntcu        AS tipo_cuenta,
                    ROUND(SUM(ABS(dcc.valor_cndcc * sc.signo_cnscu))::numeric, 2) AS total
                FROM con_cab_comp_cont  ccc
                JOIN con_det_comp_cont  dcc ON ccc.ide_cnccc = dcc.ide_cnccc
                JOIN con_det_plan_cuen  dpc ON dpc.ide_cndpc = dcc.ide_cndpc
                JOIN con_tipo_cuenta    tc  ON dpc.ide_cntcu = tc.ide_cntcu
                JOIN con_signo_cuenta   sc  ON tc.ide_cntcu  = sc.ide_cntcu
                                          AND dcc.ide_cnlap  = sc.ide_cnlap
                WHERE ccc.fecha_trans_cnccc BETWEEN $1 AND $2
                  AND ccc.ide_cneco IN (${estados})
                  AND ccc.ide_sucu  = $3
                  AND dpc.ide_cncpc = (SELECT ide_cncpc FROM con_cab_plan_cuen WHERE ide_sucu = $3 AND activo_cncpc = true)
                  AND dpc.nivel_cndpc = 'HIJO'
                GROUP BY dpc.codig_recur_cndpc, dpc.nombre_cndpc, tc.nombre_cntcu
                HAVING SUM(ABS(dcc.valor_cndcc * sc.signo_cnscu)) > 0
            ),
            gran_total AS (SELECT SUM(total) AS suma FROM movs)
            SELECT
                m.codigo,
                m.nombre,
                m.tipo_cuenta,
                m.total,
                ROUND(CASE WHEN gt.suma <> 0 THEN (m.total / gt.suma * 100)::numeric ELSE 0 END, 2)                     AS porcentaje,
                ROUND(
                    CASE WHEN gt.suma <> 0
                    THEN (SUM(m.total) OVER (ORDER BY m.total DESC) / gt.suma * 100)::numeric
                    ELSE 0 END, 2
                )                                                                                                       AS porcentaje_acumulado
            FROM movs m
            CROSS JOIN gran_total gt
            ORDER BY m.total DESC
            LIMIT ${limit}
        `);
        query.addStringParam(1, dto.fechaInicio);
        query.addStringParam(2, dto.fechaFin);
        query.addIntParam(3, dto.ideSucu);

        return this.dataSource.createQuery(query);
    }

    /**
     * Variación porcentual mes a mes de indicadores clave.
     * Retorna: mes, nombre_mes, ingresos, variacion_ingresos_pct, gastos, variacion_gastos_pct, utilidad, variacion_utilidad_pct.
     * Ideal para tabla con indicadores de tendencia (flechas arriba/abajo).
     */
    async getVariacionMensual(dto: HeaderParamsDto & PeriodoAnioDto) {
        const estados = this.estadosComprobantes;
        const ingresos = this.variables.get('p_con_tipo_cuenta_ingresos');
        const gastos = this.variables.get('p_con_tipo_cuenta_gastos');
        const costos = this.variables.get('p_con_tipo_cuenta_costos');

        const query = new SelectQuery(`
            WITH movs AS (
                SELECT
                    EXTRACT(MONTH FROM ccc.fecha_trans_cnccc)::int AS mes,
                    ROUND(COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${ingresos} THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END)::numeric, 0), 2) AS total_ingresos,
                    ROUND(COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${gastos}   THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END)::numeric, 0), 2) AS total_gastos,
                    ROUND(COALESCE(SUM(CASE WHEN dpc.ide_cntcu = ${costos}   THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END)::numeric, 0), 2) AS total_costos
                FROM con_cab_comp_cont  ccc
                JOIN con_det_comp_cont  dcc ON ccc.ide_cnccc = dcc.ide_cnccc
                JOIN con_det_plan_cuen  dpc ON dpc.ide_cndpc = dcc.ide_cndpc
                JOIN con_tipo_cuenta    tc  ON dpc.ide_cntcu = tc.ide_cntcu
                JOIN con_signo_cuenta   sc  ON tc.ide_cntcu  = sc.ide_cntcu
                                          AND dcc.ide_cnlap  = sc.ide_cnlap
                WHERE EXTRACT(YEAR FROM ccc.fecha_trans_cnccc) = $1
                  AND ccc.ide_cneco IN (${estados})
                  AND ccc.ide_sucu  = $2
                  AND dpc.ide_cncpc = (SELECT ide_cncpc FROM con_cab_plan_cuen WHERE ide_sucu = $2 AND activo_cncpc = true)
                  AND dpc.ide_cntcu IN (${ingresos}, ${gastos}, ${costos})
                GROUP BY EXTRACT(MONTH FROM ccc.fecha_trans_cnccc)
            )
            SELECT
                gm.ide_gemes                                                                       AS mes,
                gm.nombre_gemes,
                COALESCE(m.total_ingresos, 0)                                                       AS ingresos,
                COALESCE(m.total_gastos + m.total_costos, 0)                                        AS egresos,
                ROUND((COALESCE(m.total_ingresos, 0) - COALESCE(m.total_costos, 0) - COALESCE(m.total_gastos, 0))::numeric, 2) AS utilidad,
                ROUND(CASE
                    WHEN LAG(COALESCE(m.total_ingresos, 0)) OVER (ORDER BY gm.ide_gemes) <> 0
                    THEN ((COALESCE(m.total_ingresos, 0) - LAG(COALESCE(m.total_ingresos, 0)) OVER (ORDER BY gm.ide_gemes))
                          / LAG(COALESCE(m.total_ingresos, 0)) OVER (ORDER BY gm.ide_gemes) * 100)::numeric
                    ELSE NULL END, 2
                )                                                                                   AS variacion_ingresos_pct,
                ROUND(CASE
                    WHEN LAG(COALESCE(m.total_ingresos, 0) - COALESCE(m.total_costos, 0) - COALESCE(m.total_gastos, 0)) OVER (ORDER BY gm.ide_gemes) <> 0
                    THEN (((COALESCE(m.total_ingresos, 0) - COALESCE(m.total_costos, 0) - COALESCE(m.total_gastos, 0))
                           - LAG(COALESCE(m.total_ingresos, 0) - COALESCE(m.total_costos, 0) - COALESCE(m.total_gastos, 0)) OVER (ORDER BY gm.ide_gemes))
                          / ABS(LAG(COALESCE(m.total_ingresos, 0) - COALESCE(m.total_costos, 0) - COALESCE(m.total_gastos, 0)) OVER (ORDER BY gm.ide_gemes)) * 100)::numeric
                    ELSE NULL END, 2
                )                                                                                   AS variacion_utilidad_pct
            FROM gen_mes gm
            LEFT JOIN movs m ON gm.ide_gemes = m.mes
            ORDER BY gm.ide_gemes
        `);
        query.addIntParam(1, dto.anio);
        query.addIntParam(2, dto.ideSucu);

        return this.dataSource.createQuery(query);
    }
}
