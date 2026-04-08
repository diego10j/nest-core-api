import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { FechaCorteDto } from './dto/fecha-corte-cxp.dto';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

// Tablas CXP:
//   cxp_cabece_factur  (pk: ide_cpcfa, estado: ide_cpefa)
//   cxp_cabece_transa  (pk: ide_cpctr, fk: ide_cpcfa, ide_geper)
//   cxp_detall_transa  (fk: ide_cpctr, valor: valor_cpdtr, tipo: ide_cpttr)
//   cxp_tipo_transacc  (pk: ide_cpttr, signo: signo_cpttr)
//   cxp_estado_factur  (pk: ide_cpefa)

@Injectable()
export class CuentasPorPagarService extends BaseService {
  constructor(
    private readonly dataSource: DataSourceService,
    private readonly core: CoreService,
  ) {
    super();
    this.core
      .getVariables([
        'p_cxp_estado_factura_normal',
        'p_cxp_tipo_trans_pago',
      ])
      .then((result) => {
        this.variables = result;
      });
  }

  async getCuentasPorPagar(dtoIn: RangoFechasDto & HeaderParamsDto) {
    const estadoFacturaNormal = this.variables.get('p_cxp_estado_factura_normal');
    const query = new SelectQuery(
      `
    SELECT
        ct.ide_cpctr,
        ct.ide_cpcfa,
        ct.ide_geper,
        CASE
            WHEN cf.fecha_emisi_cpcfa IS NOT NULL THEN cf.fecha_emisi_cpcfa
            ELSE ct.fecha_trans_cpctr
        END AS fecha,
        cf.numero_cpcfa,
        cf.total_cpcfa,
        p.nom_geper,
        p.identificac_geper,
        p.uuid,
        SUM(dt.valor_cpdtr * tt.signo_cpttr)                                    AS saldo_x_pagar,
        cf.total_cpcfa - COALESCE(SUM(dt.valor_cpdtr * tt.signo_cpttr), 0)      AS abonado,
        ROUND(
            (COALESCE(SUM(dt.valor_cpdtr * tt.signo_cpttr), 0) / NULLIF(cf.total_cpcfa, 0) * 100),
            2
        )                                                                         AS porcentaje_pagado,
        cf.dias_credito_cpcfa                                                     AS dias_credito,
        TO_CHAR(
            cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa * INTERVAL '1 day',
            'YYYY-MM-DD'
        )                                                                         AS fecha_vence,
        CASE
            WHEN cf.fecha_emisi_cpcfa IS NOT NULL AND cf.dias_credito_cpcfa > 0 THEN
                GREATEST(0, (CURRENT_DATE - (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa))::integer)
            ELSE 0
        END                                                                       AS dias_vencido,
        CASE
            WHEN cf.dias_credito_cpcfa = 0 OR cf.dias_credito_cpcfa IS NULL THEN 'CONTADO'
            WHEN cf.fecha_emisi_cpcfa IS NULL                                THEN 'SIN FECHA'
            WHEN CURRENT_DATE > (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa) THEN 'VENCIDA'
            ELSE 'POR VENCER'
        END                                                                       AS estado_obligacion,
        CASE
            WHEN cf.fecha_emisi_cpcfa IS NULL THEN 'SIN FECHA'
            WHEN (CURRENT_DATE - cf.fecha_emisi_cpcfa) <= 30  THEN '0-30 DIAS'
            WHEN (CURRENT_DATE - cf.fecha_emisi_cpcfa) <= 60  THEN '31-60 DIAS'
            WHEN (CURRENT_DATE - cf.fecha_emisi_cpcfa) <= 90  THEN '61-90 DIAS'
            WHEN (CURRENT_DATE - cf.fecha_emisi_cpcfa) <= 180 THEN '91-180 DIAS'
            ELSE 'MAS DE 180 DIAS'
        END                                                                       AS antiguedad,
        CASE
            WHEN cf.fecha_emisi_cpcfa IS NULL OR cf.dias_credito_cpcfa <= 0                                           THEN 'AL DIA'
            WHEN CURRENT_DATE <= (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa)                                        THEN 'AL DIA'
            WHEN (CURRENT_DATE - (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa)) <= 30                                 THEN 'MORA 1-30 DIAS'
            WHEN (CURRENT_DATE - (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa)) <= 60                                 THEN 'MORA 31-60 DIAS'
            WHEN (CURRENT_DATE - (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa)) <= 90                                 THEN 'MORA 61-90 DIAS'
            ELSE 'MORA MAS DE 90 DIAS'
        END                                                                       AS rango_mora,
        CASE
            WHEN cf.dias_credito_cpcfa = 0 OR cf.dias_credito_cpcfa IS NULL THEN 'CONTADO'
            WHEN cf.fecha_emisi_cpcfa IS NULL                                THEN 'SIN DATOS'
            WHEN CURRENT_DATE <= (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa) THEN 'BAJA'
            WHEN (CURRENT_DATE - (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa)) <= 30  THEN 'MEDIA'
            WHEN (CURRENT_DATE - (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa)) <= 60  THEN 'ALTA'
            WHEN (CURRENT_DATE - (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa)) <= 90  THEN 'URGENTE'
            ELSE 'CRITICA'
        END                                                                       AS prioridad_pago,
        COALESCE(cf.observacion_cpcfa, ct.observacion_cpctr, '')                  AS observacion,
        ct.usuario_ingre,
        ct.fecha_ingre,
        ct.ide_empr,
        ct.ide_sucu,
        (CURRENT_DATE - cf.fecha_emisi_cpcfa)                                     AS dias_desde_emision

    FROM cxp_detall_transa dt
    LEFT JOIN cxp_cabece_transa ct  ON dt.ide_cpctr = ct.ide_cpctr
    LEFT JOIN cxp_cabece_factur cf  ON cf.ide_cpcfa = ct.ide_cpcfa
        AND cf.ide_cpefa = ${estadoFacturaNormal}
    LEFT JOIN cxp_tipo_transacc tt  ON tt.ide_cpttr = dt.ide_cpttr
    LEFT JOIN gen_persona       p   ON ct.ide_geper = p.ide_geper

    WHERE
        (
            cf.fecha_emisi_cpcfa  BETWEEN $1 AND $2
            OR
            ct.fecha_trans_cpctr  BETWEEN $1 AND $2
        )
        AND dt.ide_sucu  = $3
        AND ct.ide_empr  = $4

    GROUP BY
        ct.ide_cpctr,
        ct.ide_cpcfa,
        ct.ide_geper,
        cf.numero_cpcfa,
        cf.observacion_cpcfa,
        ct.observacion_cpctr,
        cf.fecha_emisi_cpcfa,
        ct.fecha_trans_cpctr,
        cf.total_cpcfa,
        p.nom_geper,
        p.identificac_geper,
        p.uuid,
        cf.dias_credito_cpcfa,
        ct.usuario_ingre,
        ct.fecha_ingre,
        ct.ide_empr,
        ct.ide_sucu

    HAVING SUM(dt.valor_cpdtr * tt.signo_cpttr) > 0

    ORDER BY
        dias_vencido DESC,
        saldo_x_pagar DESC,
        fecha_vence ASC
    `,
      dtoIn,
    );

    query.addParam(1, dtoIn.fechaInicio);
    query.addParam(2, dtoIn.fechaFin);
    query.addParam(3, dtoIn.ideSucu);
    query.addParam(4, dtoIn.ideEmpr);
    return this.dataSource.createQuery(query);
  }

  async getMetricasCuentasPorPagar(dtoIn: RangoFechasDto & HeaderParamsDto) {
    const estadoFacturaNormal = this.variables.get('p_cxp_estado_factura_normal');
    const query = new SelectQuery(
      `
    WITH base AS (
        SELECT
            ct.ide_cpctr,
            ct.ide_cpcfa,
            ct.ide_geper,
            cf.total_cpcfa,
            SUM(dt.valor_cpdtr * tt.signo_cpttr)                                        AS saldo_x_pagar,
            cf.total_cpcfa - COALESCE(SUM(dt.valor_cpdtr * tt.signo_cpttr), 0)          AS abonado,
            cf.dias_credito_cpcfa,
            cf.fecha_emisi_cpcfa,
            CASE
                WHEN cf.dias_credito_cpcfa = 0 OR cf.dias_credito_cpcfa IS NULL         THEN 'CONTADO'
                WHEN cf.fecha_emisi_cpcfa IS NULL                                        THEN 'SIN FECHA'
                WHEN CURRENT_DATE > (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa)      THEN 'VENCIDA'
                ELSE 'POR VENCER'
            END                                                                          AS estado_obligacion,
            CASE
                WHEN cf.fecha_emisi_cpcfa IS NOT NULL AND cf.dias_credito_cpcfa > 0
                    THEN GREATEST(0, (CURRENT_DATE - (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa))::integer)
                ELSE 0
            END                                                                          AS dias_vencido,
            CASE
                WHEN cf.fecha_emisi_cpcfa IS NULL                              THEN 'SIN FECHA'
                WHEN (CURRENT_DATE - cf.fecha_emisi_cpcfa) <= 30               THEN '0-30 DIAS'
                WHEN (CURRENT_DATE - cf.fecha_emisi_cpcfa) <= 60               THEN '31-60 DIAS'
                WHEN (CURRENT_DATE - cf.fecha_emisi_cpcfa) <= 90               THEN '61-90 DIAS'
                WHEN (CURRENT_DATE - cf.fecha_emisi_cpcfa) <= 180              THEN '91-180 DIAS'
                ELSE                                                                 'MAS DE 180 DIAS'
            END                                                                          AS antiguedad,
            CASE
                WHEN cf.fecha_emisi_cpcfa IS NULL OR cf.dias_credito_cpcfa <= 0                                           THEN 'AL DIA'
                WHEN CURRENT_DATE <= (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa)                                        THEN 'AL DIA'
                WHEN (CURRENT_DATE - (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa)) <= 30                                 THEN 'MORA 1-30 DIAS'
                WHEN (CURRENT_DATE - (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa)) <= 60                                 THEN 'MORA 31-60 DIAS'
                WHEN (CURRENT_DATE - (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa)) <= 90                                 THEN 'MORA 61-90 DIAS'
                ELSE                                                                                                             'MORA MAS DE 90 DIAS'
            END                                                                          AS rango_mora
        FROM cxp_detall_transa dt
        LEFT JOIN cxp_cabece_transa  ct ON dt.ide_cpctr  = ct.ide_cpctr
        LEFT JOIN cxp_cabece_factur  cf ON cf.ide_cpcfa  = ct.ide_cpcfa
                                       AND cf.ide_cpefa  = ${estadoFacturaNormal}
        LEFT JOIN cxp_tipo_transacc  tt ON tt.ide_cpttr  = dt.ide_cpttr
        WHERE
            (
                cf.fecha_emisi_cpcfa  BETWEEN $1 AND $2
                OR ct.fecha_trans_cpctr BETWEEN $1 AND $2
            )
            AND dt.ide_sucu  = $3
            AND ct.ide_empr  = $4
        GROUP BY
            ct.ide_cpctr,
            ct.ide_cpcfa,
            ct.ide_geper,
            cf.fecha_emisi_cpcfa,
            cf.total_cpcfa,
            cf.dias_credito_cpcfa
        HAVING SUM(dt.valor_cpdtr * tt.signo_cpttr) > 0
    )
    SELECT
        COUNT(*)                                                                AS total_registros,
        COUNT(DISTINCT ide_geper)                                               AS total_proveedores,
        ROUND(SUM(total_cpcfa)::numeric,   2)                                  AS total_facturado,
        ROUND(SUM(saldo_x_pagar)::numeric, 2)                                  AS total_saldo_por_pagar,
        ROUND(SUM(abonado)::numeric,       2)                                  AS total_abonado,
        ROUND(AVG(total_cpcfa)::numeric,   2)                                  AS ticket_promedio,

        COUNT(*) FILTER (WHERE estado_obligacion = 'VENCIDA')                  AS facturas_vencidas,
        COUNT(*) FILTER (WHERE estado_obligacion = 'POR VENCER')               AS facturas_por_vencer,
        COUNT(*) FILTER (WHERE estado_obligacion = 'CONTADO')                  AS facturas_contado,
        ROUND(SUM(saldo_x_pagar) FILTER (WHERE estado_obligacion = 'VENCIDA')::numeric,    2) AS saldo_vencido,
        ROUND(SUM(saldo_x_pagar) FILTER (WHERE estado_obligacion = 'POR VENCER')::numeric, 2) AS saldo_por_vencer,
        ROUND(SUM(saldo_x_pagar) FILTER (WHERE estado_obligacion = 'CONTADO')::numeric,    2) AS saldo_contado,

        ROUND(AVG(dias_vencido) FILTER (WHERE dias_vencido > 0)::numeric, 1)   AS dias_vencido_promedio,
        MAX(dias_vencido)                                                       AS dias_vencido_maximo,

        ROUND(COALESCE(SUM(saldo_x_pagar) FILTER (WHERE antiguedad = '0-30 DIAS'),       0)::numeric, 2) AS saldo_0_30_dias,
        ROUND(COALESCE(SUM(saldo_x_pagar) FILTER (WHERE antiguedad = '31-60 DIAS'),      0)::numeric, 2) AS saldo_31_60_dias,
        ROUND(COALESCE(SUM(saldo_x_pagar) FILTER (WHERE antiguedad = '61-90 DIAS'),      0)::numeric, 2) AS saldo_61_90_dias,
        ROUND(COALESCE(SUM(saldo_x_pagar) FILTER (WHERE antiguedad = '91-180 DIAS'),     0)::numeric, 2) AS saldo_91_180_dias,
        ROUND(COALESCE(SUM(saldo_x_pagar) FILTER (WHERE antiguedad = 'MAS DE 180 DIAS'), 0)::numeric, 2) AS saldo_mas_180_dias,

        COUNT(*) FILTER (WHERE rango_mora = 'AL DIA')                          AS cantidad_al_dia,
        COUNT(*) FILTER (WHERE rango_mora = 'MORA 1-30 DIAS')                  AS cantidad_mora_1_30,
        COUNT(*) FILTER (WHERE rango_mora = 'MORA 31-60 DIAS')                 AS cantidad_mora_31_60,
        COUNT(*) FILTER (WHERE rango_mora = 'MORA 61-90 DIAS')                 AS cantidad_mora_61_90,
        COUNT(*) FILTER (WHERE rango_mora = 'MORA MAS DE 90 DIAS')             AS cantidad_mora_mas_90,
        ROUND(COALESCE(SUM(saldo_x_pagar) FILTER (WHERE rango_mora = 'MORA 1-30 DIAS'),     0)::numeric, 2) AS saldo_mora_1_30,
        ROUND(COALESCE(SUM(saldo_x_pagar) FILTER (WHERE rango_mora = 'MORA 31-60 DIAS'),    0)::numeric, 2) AS saldo_mora_31_60,
        ROUND(COALESCE(SUM(saldo_x_pagar) FILTER (WHERE rango_mora = 'MORA 61-90 DIAS'),    0)::numeric, 2) AS saldo_mora_61_90,
        ROUND(COALESCE(SUM(saldo_x_pagar) FILTER (WHERE rango_mora = 'MORA MAS DE 90 DIAS'),0)::numeric, 2) AS saldo_mora_mas_90,

        ROUND(
            COALESCE(SUM(saldo_x_pagar) FILTER (WHERE estado_obligacion = 'VENCIDA'), 0)
            / NULLIF(SUM(saldo_x_pagar), 0) * 100, 2
        )                                                                       AS porcentaje_saldo_vencido,
        ROUND(
            COUNT(*) FILTER (WHERE estado_obligacion = 'VENCIDA') * 100.0
            / NULLIF(COUNT(*), 0), 2
        )                                                                       AS porcentaje_facturas_vencidas

    FROM base
    `,
    );
    query.addParam(1, dtoIn.fechaInicio);
    query.addParam(2, dtoIn.fechaFin);
    query.addIntParam(3, dtoIn.ideSucu);
    query.addIntParam(4, dtoIn.ideEmpr);
    return this.dataSource.createSingleQuery(query);
  }


  async getResumenCuentasPorPagar(dtoIn: RangoFechasDto & HeaderParamsDto) {
    const { fechaInicio, fechaFin } = dtoIn;

    const baseCTE = `
      WITH cuentas AS (
        SELECT
          ct.ide_geper,
          p.nom_geper,
          p.identificac_geper,
          p.uuid,
          cf.ide_cpcfa,
          cf.numero_cpcfa,
          cf.total_cpcfa,
          cf.dias_credito_cpcfa                                               AS dias_credito,
          cf.fecha_emisi_cpcfa,
          cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa * INTERVAL '1 day'    AS fecha_vence,
          COALESCE(cf.observacion_cpcfa, ct.observacion_cpctr, '')            AS observacion,
          ct.usuario_ingre,
          ct.ide_sucu,
          ct.ide_empr,

          SUM(dt.valor_cpdtr * tt.signo_cpttr)                               AS saldo_x_pagar,
          cf.total_cpcfa - COALESCE(SUM(dt.valor_cpdtr * tt.signo_cpttr), 0) AS abonado,
          ROUND(
            (COALESCE(SUM(dt.valor_cpdtr * tt.signo_cpttr), 0) / cf.total_cpcfa * 100),
            2
          )                                                                   AS porcentaje_abonado,

          CASE
            WHEN cf.fecha_emisi_cpcfa IS NOT NULL AND cf.dias_credito_cpcfa > 0 THEN
              GREATEST(0, (CURRENT_DATE - (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa))::integer)
            ELSE 0
          END AS dias_vencido,

          CASE
            WHEN cf.fecha_emisi_cpcfa IS NOT NULL AND cf.dias_credito_cpcfa > 0
              AND CURRENT_DATE <= (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa) THEN
              ((cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa) - CURRENT_DATE)::integer
            ELSE NULL
          END AS dias_para_vencer,

          CASE
            WHEN cf.fecha_emisi_cpcfa IS NOT NULL AND cf.dias_credito_cpcfa > 0
              AND CURRENT_DATE > (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa)  THEN 'VENCIDA'
            WHEN cf.fecha_emisi_cpcfa IS NOT NULL AND cf.dias_credito_cpcfa > 0
              AND CURRENT_DATE <= (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa) THEN 'POR VENCER'
            WHEN cf.dias_credito_cpcfa = 0 OR cf.dias_credito_cpcfa IS NULL      THEN 'CONTADO'
            ELSE 'SIN FECHA VENCIMIENTO'
          END AS estado_obligacion,

          CASE
            WHEN cf.fecha_emisi_cpcfa IS NOT NULL AND cf.dias_credito_cpcfa > 0
              AND CURRENT_DATE > (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa) THEN
              CASE
                WHEN (CURRENT_DATE - (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa)) <= 30  THEN 'MORA 1-30 DIAS'
                WHEN (CURRENT_DATE - (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa)) <= 60  THEN 'MORA 31-60 DIAS'
                WHEN (CURRENT_DATE - (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa)) <= 90  THEN 'MORA 61-90 DIAS'
                ELSE 'MORA MAS DE 90 DIAS'
              END
            ELSE 'AL DIA'
          END AS rango_mora,

          CASE
            WHEN cf.fecha_emisi_cpcfa IS NOT NULL AND cf.dias_credito_cpcfa > 0
              AND CURRENT_DATE > (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa) THEN
              CASE
                WHEN (CURRENT_DATE - (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa)) <= 30  THEN 'MEDIA'
                WHEN (CURRENT_DATE - (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa)) <= 60  THEN 'ALTA'
                WHEN (CURRENT_DATE - (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa)) <= 90  THEN 'URGENTE'
                ELSE 'CRITICA'
              END
            WHEN cf.dias_credito_cpcfa = 0 OR cf.dias_credito_cpcfa IS NULL THEN 'CONTADO'
            ELSE 'BAJA'
          END AS prioridad_pago,

          CASE
            WHEN cf.fecha_emisi_cpcfa IS NOT NULL THEN
              CASE
                WHEN (CURRENT_DATE - cf.fecha_emisi_cpcfa) <= 30  THEN '0-30 DIAS'
                WHEN (CURRENT_DATE - cf.fecha_emisi_cpcfa) <= 60  THEN '31-60 DIAS'
                WHEN (CURRENT_DATE - cf.fecha_emisi_cpcfa) <= 90  THEN '61-90 DIAS'
                WHEN (CURRENT_DATE - cf.fecha_emisi_cpcfa) <= 180 THEN '91-180 DIAS'
                ELSE 'MAS DE 180 DIAS'
              END
            ELSE 'SIN FECHA'
          END AS antiguedad

        FROM cxp_detall_transa dt
        LEFT JOIN cxp_cabece_transa  ct  ON dt.ide_cpctr  = ct.ide_cpctr
        LEFT JOIN cxp_cabece_factur  cf  ON cf.ide_cpcfa  = ct.ide_cpcfa
          AND cf.ide_cpefa = ${this.variables.get('p_cxp_estado_factura_normal')}
        LEFT JOIN cxp_tipo_transacc  tt  ON tt.ide_cpttr  = dt.ide_cpttr
        LEFT JOIN gen_persona        p   ON ct.ide_geper  = p.ide_geper
        WHERE
          (
            cf.fecha_emisi_cpcfa    BETWEEN $1 AND $2
            OR ct.fecha_trans_cpctr BETWEEN $3 AND $4
          )
          AND dt.ide_sucu   = $5
          AND ct.ide_empr   = $6
        GROUP BY
          ct.ide_geper, p.nom_geper, p.identificac_geper, p.uuid,
          cf.ide_cpcfa, cf.numero_cpcfa, cf.total_cpcfa, cf.dias_credito_cpcfa,
          cf.fecha_emisi_cpcfa, cf.observacion_cpcfa, ct.observacion_cpctr,
          ct.usuario_ingre, ct.ide_sucu, ct.ide_empr
        HAVING SUM(dt.valor_cpdtr * tt.signo_cpttr) > 0
      )
    `;

    const addBaseParams = (q: SelectQuery) => {
      q.addParam(1, fechaInicio);
      q.addParam(2, fechaFin);
      q.addParam(3, fechaInicio);
      q.addParam(4, fechaFin);
      q.addParam(5, dtoIn.ideSucu);
      q.addParam(6, dtoIn.ideEmpr);
    };

    // ── Query 1: KPIs generales ───────────────────────────────────────────────
    const qMetricas = new SelectQuery(`
      ${baseCTE}
      SELECT
        COUNT(*)::integer                                                                        AS total_facturas_pendientes,
        COUNT(DISTINCT ide_geper)::integer                                                      AS total_proveedores_con_deuda,
        ROUND(SUM(saldo_x_pagar)::numeric, 2)                                                  AS total_saldo_pendiente,
        ROUND(SUM(CASE WHEN estado_obligacion = 'VENCIDA'    THEN saldo_x_pagar ELSE 0 END)::numeric, 2) AS total_saldo_vencido,
        ROUND(SUM(CASE WHEN estado_obligacion = 'POR VENCER' THEN saldo_x_pagar ELSE 0 END)::numeric, 2) AS total_saldo_por_vencer,
        ROUND(SUM(CASE WHEN estado_obligacion = 'CONTADO'    THEN saldo_x_pagar ELSE 0 END)::numeric, 2) AS total_saldo_contado,
        COUNT(CASE WHEN estado_obligacion = 'VENCIDA'    THEN 1 END)::integer                  AS cantidad_facturas_vencidas,
        COUNT(CASE WHEN estado_obligacion = 'POR VENCER' THEN 1 END)::integer                  AS cantidad_facturas_por_vencer,
        COUNT(CASE WHEN estado_obligacion = 'POR VENCER' AND dias_para_vencer <= 10 THEN 1 END)::integer AS cantidad_vencen_en_10_dias,
        ROUND(SUM(CASE WHEN estado_obligacion = 'POR VENCER' AND dias_para_vencer <= 10 THEN saldo_x_pagar ELSE 0 END)::numeric, 2) AS saldo_vence_en_10_dias,
        ROUND(AVG(CASE WHEN estado_obligacion = 'VENCIDA' THEN dias_vencido END)::numeric, 0)  AS promedio_dias_vencido,
        MAX(CASE WHEN estado_obligacion = 'VENCIDA' THEN dias_vencido ELSE 0 END)::integer     AS max_dias_vencido,
        COUNT(CASE WHEN prioridad_pago IN ('URGENTE', 'CRITICA') THEN 1 END)::integer          AS facturas_atencion_urgente,
        ROUND(SUM(CASE WHEN prioridad_pago IN ('URGENTE', 'CRITICA') THEN saldo_x_pagar ELSE 0 END)::numeric, 2) AS saldo_atencion_urgente
      FROM cuentas
    `);
    addBaseParams(qMetricas);

    // ── Query 2: Detalle cuentas vencidas ────────────────────────────────────
    const qVencidas = new SelectQuery(`
      ${baseCTE}
      SELECT
        ide_geper,
        nom_geper,
        identificac_geper,
        uuid,
        ide_cpcfa,
        numero_cpcfa,
        TO_CHAR(fecha_emisi_cpcfa, 'YYYY-MM-DD') AS fecha_emision,
        TO_CHAR(fecha_vence, 'YYYY-MM-DD')        AS fecha_vence,
        dias_credito,
        total_cpcfa,
        abonado,
        saldo_x_pagar,
        porcentaje_abonado,
        dias_vencido,
        rango_mora,
        antiguedad,
        prioridad_pago,
        observacion,
        usuario_ingre
      FROM cuentas
      WHERE estado_obligacion = 'VENCIDA'
      ORDER BY
        CASE prioridad_pago
          WHEN 'CRITICA'  THEN 1
          WHEN 'URGENTE'  THEN 2
          WHEN 'ALTA'     THEN 3
          WHEN 'MEDIA'    THEN 4
          ELSE 5
        END,
        dias_vencido DESC,
        saldo_x_pagar DESC
    `);
    addBaseParams(qVencidas);

    // ── Query 3: Alertas — vencen en los próximos 10 días ────────────────────
    const qPorVencer = new SelectQuery(`
      ${baseCTE}
      SELECT
        ide_geper,
        nom_geper,
        identificac_geper,
        uuid,
        ide_cpcfa,
        numero_cpcfa,
        TO_CHAR(fecha_emisi_cpcfa, 'YYYY-MM-DD') AS fecha_emision,
        TO_CHAR(fecha_vence, 'YYYY-MM-DD')        AS fecha_vence,
        dias_credito,
        total_cpcfa,
        abonado,
        saldo_x_pagar,
        porcentaje_abonado,
        dias_para_vencer,
        antiguedad,
        observacion,
        usuario_ingre
      FROM cuentas
      WHERE estado_obligacion = 'POR VENCER'
        AND dias_para_vencer <= 10
      ORDER BY dias_para_vencer ASC, saldo_x_pagar DESC
    `);
    addBaseParams(qPorVencer);

    // ── Query 4: Distribución por antigüedad ─────────────────────────────────
    const qAntiguedad = new SelectQuery(`
      ${baseCTE}
      SELECT
        antiguedad                                                AS rango,
        COUNT(*)::integer                                         AS cantidad_facturas,
        COUNT(DISTINCT ide_geper)::integer                        AS cantidad_proveedores,
        ROUND(SUM(saldo_x_pagar)::numeric, 2)                    AS total_saldo,
        ROUND(AVG(saldo_x_pagar)::numeric,  2)                   AS promedio_saldo,
        ROUND(SUM(CASE WHEN estado_obligacion = 'VENCIDA' THEN saldo_x_pagar ELSE 0 END)::numeric, 2) AS saldo_vencido
      FROM cuentas
      GROUP BY antiguedad
      ORDER BY
        CASE antiguedad
          WHEN '0-30 DIAS'        THEN 1
          WHEN '31-60 DIAS'       THEN 2
          WHEN '61-90 DIAS'       THEN 3
          WHEN '91-180 DIAS'      THEN 4
          WHEN 'MAS DE 180 DIAS'  THEN 5
          ELSE 6
        END
    `);
    addBaseParams(qAntiguedad);

    // ── Query 5: Top 10 proveedores — mayor deuda vencida ────────────────────
    const qTopProveedores = new SelectQuery(`
      ${baseCTE}
      SELECT
        ide_geper,
        nom_geper,
        identificac_geper,
        uuid,
        COUNT(*)::integer                                                                  AS facturas_pendientes,
        COUNT(CASE WHEN estado_obligacion = 'VENCIDA' THEN 1 END)::integer                AS facturas_vencidas,
        ROUND(SUM(saldo_x_pagar)::numeric, 2)                                             AS saldo_total,
        ROUND(SUM(CASE WHEN estado_obligacion = 'VENCIDA' THEN saldo_x_pagar ELSE 0 END)::numeric, 2) AS saldo_vencido,
        MAX(CASE WHEN estado_obligacion = 'VENCIDA' THEN dias_vencido ELSE 0 END)::integer AS max_dias_vencido,
        MAX(CASE WHEN estado_obligacion = 'VENCIDA' THEN rango_mora END)                  AS rango_mora_mayor,
        CASE
          WHEN SUM(CASE WHEN estado_obligacion = 'VENCIDA' THEN saldo_x_pagar ELSE 0 END) > 5000 THEN 'ALTO'
          WHEN SUM(CASE WHEN estado_obligacion = 'VENCIDA' THEN saldo_x_pagar ELSE 0 END) > 2000 THEN 'MEDIO-ALTO'
          WHEN SUM(CASE WHEN estado_obligacion = 'VENCIDA' THEN saldo_x_pagar ELSE 0 END) > 500  THEN 'MEDIO'
          ELSE 'BAJO'
        END AS nivel_riesgo,
        CASE
          WHEN MAX(CASE WHEN estado_obligacion = 'VENCIDA' THEN dias_vencido ELSE 0 END) > 90
            THEN 'PAGO URGENTE - RIESGO DE SUSPENSION DE CREDITO'
          WHEN MAX(CASE WHEN estado_obligacion = 'VENCIDA' THEN dias_vencido ELSE 0 END) > 60
            THEN 'GESTIONAR PAGO INMEDIATO'
          WHEN MAX(CASE WHEN estado_obligacion = 'VENCIDA' THEN dias_vencido ELSE 0 END) > 30
            THEN 'PROGRAMAR PAGO A CORTO PLAZO'
          ELSE 'INCLUIR EN PROXIMO PAGO'
        END AS accion_sugerida
      FROM cuentas
      WHERE estado_obligacion = 'VENCIDA'
      GROUP BY ide_geper, nom_geper, identificac_geper, uuid
      ORDER BY saldo_vencido DESC, max_dias_vencido DESC
      LIMIT 10
    `);
    addBaseParams(qTopProveedores);

    const [metricas, vencidas, porVencer10Dias, distribucionAntiguedad, topProveedoresDeudaVencida] =
      await Promise.all([
        this.dataSource.createSingleQuery(qMetricas),
        this.dataSource.createSelectQuery(qVencidas),
        this.dataSource.createSelectQuery(qPorVencer),
        this.dataSource.createSelectQuery(qAntiguedad),
        this.dataSource.createSelectQuery(qTopProveedores),
      ]);

    return {
      rowCount: 1,
      row: {
        periodo: { fechaInicio, fechaFin },
        metricas,
        vencidas,
        por_vencer_10_dias: porVencer10Dias,
        distribucion_antiguedad: distribucionAntiguedad,
        top_proveedores_deuda_vencida: topProveedoresDeudaVencida,
      },
      message: 'ok',
    };
  }

  async getPagosProveedores(dtoIn: FechaCorteDto & HeaderParamsDto) {
    const estadoFacturaNormal = this.variables.get('p_cxp_estado_factura_normal');
    const diasAlerta = dtoIn.diasAlerta ?? 7;
    const query = new SelectQuery(
      `
    SELECT
        ct.ide_cpctr,
        cf.ide_cpcfa,
        ct.ide_geper,
        p.nom_geper                                                               AS nombre_proveedor,
        p.identificac_geper,
        p.uuid,
        cf.numero_cpcfa,
        TO_CHAR(cf.fecha_emisi_cpcfa, 'YYYY-MM-DD')                              AS fecha_emision,
        cf.total_cpcfa,
        cf.dias_credito_cpcfa                                                     AS dias_credito,
        TO_CHAR(
            cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa * INTERVAL '1 day',
            'YYYY-MM-DD'
        )                                                                         AS fecha_vence,
        ROUND(SUM(dt.valor_cpdtr * tt.signo_cpttr)::numeric, 2)                  AS valor_a_pagar,

        -- TRUE = próxima a vencer, FALSE = ya vencida
        (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa * INTERVAL '1 day')::date >= $1::date
                                                                                  AS es_proximo_vencer,
        CASE
            WHEN (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa * INTERVAL '1 day')::date < $1::date
                THEN 'VENCIDA'
            ELSE 'PROXIMA_A_VENCER'
        END                                                                       AS tipo_pago,

        -- Días vencidos (solo aplica para VENCIDA)
        CASE
            WHEN (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa * INTERVAL '1 day')::date < $1::date
                THEN ($1::date - (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa * INTERVAL '1 day')::date)::integer
            ELSE 0
        END                                                                       AS dias_vencido,

        -- Días restantes para vencer (solo aplica para PROXIMA_A_VENCER)
        CASE
            WHEN (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa * INTERVAL '1 day')::date >= $1::date
                THEN ((cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa * INTERVAL '1 day')::date - $1::date)::integer
            ELSE NULL
        END                                                                       AS dias_para_vencer,

        CASE
            WHEN (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa * INTERVAL '1 day')::date >= $1::date
                THEN 'PROXIMO A VENCER'
            WHEN ($1::date - (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa * INTERVAL '1 day')::date) <= 30  THEN '1-30 DIAS'
            WHEN ($1::date - (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa * INTERVAL '1 day')::date) <= 60  THEN '31-60 DIAS'
            WHEN ($1::date - (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa * INTERVAL '1 day')::date) <= 90  THEN '61-90 DIAS'
            WHEN ($1::date - (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa * INTERVAL '1 day')::date) <= 180 THEN '91-180 DIAS'
            ELSE 'MAS DE 180 DIAS'
        END                                                                       AS rango_vencimiento,
        CASE
            WHEN (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa * INTERVAL '1 day')::date >= $1::date
                THEN 'ALERTA'
            WHEN ($1::date - (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa * INTERVAL '1 day')::date) <= 30  THEN 'MEDIA'
            WHEN ($1::date - (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa * INTERVAL '1 day')::date) <= 60  THEN 'ALTA'
            WHEN ($1::date - (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa * INTERVAL '1 day')::date) <= 90  THEN 'URGENTE'
            ELSE 'CRITICA'
        END                                                                       AS prioridad_pago,
        COALESCE(cf.observacion_cpcfa, MIN(ct.observacion_cpctr), '')             AS observacion,
        MIN(ct.usuario_ingre)                                                     AS usuario_ingre

    FROM cxp_detall_transa dt
    LEFT JOIN cxp_cabece_transa ct  ON dt.ide_cpctr = ct.ide_cpctr
    LEFT JOIN cxp_cabece_factur cf  ON cf.ide_cpcfa = ct.ide_cpcfa
        AND cf.ide_cpefa = ${estadoFacturaNormal}
    LEFT JOIN cxp_tipo_transacc tt  ON tt.ide_cpttr = dt.ide_cpttr
    LEFT JOIN gen_persona       p   ON ct.ide_geper  = p.ide_geper

    WHERE
        cf.dias_credito_cpcfa > 0
        AND cf.fecha_emisi_cpcfa IS NOT NULL
        AND (
            -- Facturas ya vencidas a la fecha de corte
            (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa * INTERVAL '1 day')::date < $1::date
            OR
            -- Facturas que vencen en los próximos N días
            (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa * INTERVAL '1 day')::date
                BETWEEN $1::date AND ($1::date + $4 * INTERVAL '1 day')
        )
        AND dt.ide_sucu  = $2
        AND ct.ide_empr  = $3

    GROUP BY
        cf.ide_cpcfa,
        ct.ide_geper,
        p.nom_geper,
        p.identificac_geper,
        p.uuid,
        cf.numero_cpcfa,
        cf.fecha_emisi_cpcfa,
        cf.total_cpcfa,
        cf.dias_credito_cpcfa,
        cf.observacion_cpcfa

    HAVING SUM(dt.valor_cpdtr * tt.signo_cpttr) > 0

    ORDER BY
        es_proximo_vencer ASC,
        dias_vencido DESC,
        dias_para_vencer ASC NULLS LAST,
        valor_a_pagar DESC
    `,
      dtoIn,
    );

    query.addParam(1, dtoIn.fechaCorte);
    query.addParam(2, dtoIn.ideSucu);
    query.addParam(3, dtoIn.ideEmpr);
    query.addIntParam(4, diasAlerta);
    return this.dataSource.createQuery(query);
  }
}
