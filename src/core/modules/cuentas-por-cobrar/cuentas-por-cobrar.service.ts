import { Injectable } from '@nestjs/common';
import { Console } from 'console';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

@Injectable()
export class CuentasPorCobrarService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        // obtiene las variables del sistema para el servicio
        this.core
            .getVariables([
                'p_cxc_estado_factura_normal', // 0
                'p_con_tipo_documento_factura', // 3
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    /**
     * Valida cédula
     * @returns
     */
    async getCuentasPorCobrar(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const estadoFacturaNormal = this.variables.get('p_cxc_estado_factura_normal');
        const query = new SelectQuery(
            `
    SELECT 
        dt.ide_ccctr,
        dt.ide_cccfa,
        ct.ide_geper,
        CASE 
            WHEN cf.fecha_emisi_cccfa IS NOT NULL THEN cf.fecha_emisi_cccfa 
            ELSE ct.fecha_trans_ccctr 
        END AS fecha,
        cf.secuencial_cccfa,
        cf.total_cccfa,
        df.establecimiento_ccdfa,
        df.pto_emision_ccdfa,
        df.serie_ccdaf,
        p.nom_geper,
        p.identificac_geper,
        p.uuid,
        SUM(dt.valor_ccdtr * tt.signo_ccttr) AS saldo_x_pagar,
        cf.total_cccfa - COALESCE(SUM(dt.valor_ccdtr * tt.signo_ccttr), 0) AS abonado,
        ROUND(
            (COALESCE(SUM(dt.valor_ccdtr * tt.signo_ccttr), 0) / NULLIF(cf.total_cccfa, 0) * 100), 
            2
        ) AS porcentaje_pagado,
        cf.dias_credito_cccfa AS dias_credito,
        TO_CHAR(
            cf.fecha_emisi_cccfa + cf.dias_credito_cccfa * INTERVAL '1 day',
            'YYYY-MM-DD'
        ) AS fecha_vence,
        CASE 
            WHEN cf.fecha_emisi_cccfa IS NOT NULL AND cf.dias_credito_cccfa > 0 THEN
                GREATEST(0, (CURRENT_DATE - (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa))::integer)
            ELSE 0
        END AS dias_vencido,
        CASE 
            WHEN cf.dias_credito_cccfa = 0 OR cf.dias_credito_cccfa IS NULL THEN 'CONTADO'
            WHEN cf.fecha_emisi_cccfa IS NULL THEN 'SIN FECHA'
            WHEN CURRENT_DATE > (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa) THEN 'VENCIDA'
            ELSE 'POR VENCER'
        END AS estado_obligacion,
        CASE 
            WHEN cf.fecha_emisi_cccfa IS NULL THEN 'SIN FECHA'
            WHEN (CURRENT_DATE - cf.fecha_emisi_cccfa) <= 30  THEN '0-30 DIAS'
            WHEN (CURRENT_DATE - cf.fecha_emisi_cccfa) <= 60  THEN '31-60 DIAS'
            WHEN (CURRENT_DATE - cf.fecha_emisi_cccfa) <= 90  THEN '61-90 DIAS'
            WHEN (CURRENT_DATE - cf.fecha_emisi_cccfa) <= 180 THEN '91-180 DIAS'
            ELSE 'MAS DE 180 DIAS'
        END AS antiguedad,
        CASE 
            WHEN cf.fecha_emisi_cccfa IS NULL OR cf.dias_credito_cccfa <= 0 THEN 'AL DIA'
            WHEN CURRENT_DATE <= (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa) THEN 'AL DIA'
            WHEN (CURRENT_DATE - (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa)) <= 30  THEN 'MORA 1-30 DIAS'
            WHEN (CURRENT_DATE - (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa)) <= 60  THEN 'MORA 31-60 DIAS'
            WHEN (CURRENT_DATE - (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa)) <= 90  THEN 'MORA 61-90 DIAS'
            ELSE 'MORA MAS DE 90 DIAS'
        END AS rango_mora,
        CASE 
            WHEN cf.fecha_emisi_cccfa IS NULL OR cf.dias_credito_cccfa IS NULL THEN 90
            WHEN cf.dias_credito_cccfa = 0 THEN 80
            WHEN CURRENT_DATE <= (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa) THEN 70
            WHEN (CURRENT_DATE - (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa)) <= 30  THEN 40
            WHEN (CURRENT_DATE - (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa)) <= 60  THEN 30
            WHEN (CURRENT_DATE - (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa)) <= 90  THEN 20
            ELSE 10
        END AS prioridad_cobro_orden,
        CASE 
            WHEN cf.dias_credito_cccfa = 0 OR cf.dias_credito_cccfa IS NULL THEN 'CONTADO'
            WHEN cf.fecha_emisi_cccfa IS NULL THEN 'SIN DATOS'
            WHEN CURRENT_DATE <= (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa) THEN 'BAJA'
            WHEN (CURRENT_DATE - (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa)) <= 30  THEN 'MEDIA'
            WHEN (CURRENT_DATE - (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa)) <= 60  THEN 'ALTA'
            WHEN (CURRENT_DATE - (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa)) <= 90  THEN 'URGENTE'
            ELSE 'CRITICA'
        END AS prioridad_cobro,
        COALESCE(cf.observacion_cccfa, ct.observacion_ccctr, '') AS observacion,
        tt.nombre_ccttr AS tipo_transaccion,
        tt.signo_ccttr,
        ct.usuario_ingre,
        ct.fecha_ingre,
        ct.ide_empr,
        ct.ide_sucu,
        (CURRENT_DATE - cf.fecha_emisi_cccfa) AS dias_desde_emision

    FROM cxc_detall_transa dt
    LEFT JOIN cxc_cabece_transa ct  ON dt.ide_ccctr = ct.ide_ccctr
    LEFT JOIN cxc_cabece_factura cf ON cf.ide_cccfa = ct.ide_cccfa 
        AND cf.ide_ccefa = ${estadoFacturaNormal}
    LEFT JOIN cxc_tipo_transacc  tt ON tt.ide_ccttr = dt.ide_ccttr
    LEFT JOIN gen_persona         p  ON ct.ide_geper = p.ide_geper
    LEFT JOIN cxc_datos_fac      df  ON cf.ide_ccdaf = df.ide_ccdaf
    
    WHERE 
        (
            cf.fecha_emisi_cccfa BETWEEN $1 AND $2 
            OR 
            ct.fecha_trans_ccctr BETWEEN $1 AND $2
        )
        AND dt.ide_sucu = $3
        AND ct.ide_empr = $4
        AND dt.ide_ccttr NOT IN (7, 9)
        
    GROUP BY 
        dt.ide_ccctr,
        dt.ide_cccfa,
        ct.ide_geper,
        cf.secuencial_cccfa,
        cf.observacion_cccfa,
        ct.observacion_ccctr,
        cf.fecha_emisi_cccfa,
        ct.fecha_trans_ccctr,
        cf.total_cccfa,
        p.nom_geper,
        p.identificac_geper,
        p.uuid,
        df.establecimiento_ccdfa,
        df.pto_emision_ccdfa,
        df.serie_ccdaf,
        cf.dias_credito_cccfa,
        tt.nombre_ccttr,
        tt.signo_ccttr,
        ct.usuario_ingre,
        ct.fecha_ingre,
        ct.ide_empr,
        ct.ide_sucu
        
    HAVING SUM(dt.valor_ccdtr * tt.signo_ccttr) > 0
    
    ORDER BY 
        prioridad_cobro_orden ASC,
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

    async getClientesPagoDestiempo(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const estadoFacturaNormal = this.variables.get('p_cxc_estado_factura_normal');
        const query = new SelectQuery(
            `
        WITH facturas_base AS (
            SELECT 
                cf.ide_cccfa,
                cf.ide_geper,
                p.nom_geper,
                p.identificac_geper,
                p.uuid,
                cf.fecha_emisi_cccfa,
                cf.secuencial_cccfa,
                cf.total_cccfa,
                COALESCE(cf.dias_credito_cccfa, 0)                                          AS dias_credito_cccfa,
                CASE
                    WHEN COALESCE(cf.dias_credito_cccfa, 0) > 0
                        THEN (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa * INTERVAL '1 day')::date
                    ELSE cf.fecha_emisi_cccfa::date
                END                                                                          AS fecha_vencimiento,
                CASE
                    WHEN COALESCE(cf.dias_credito_cccfa, 0) = 0 THEN 'CONTADO'
                    ELSE 'CREDITO'
                END                                                                          AS tipo_factura,
                cf.observacion_cccfa,
                cf.ide_empr,
                cf.ide_sucu
            FROM cxc_cabece_factura cf
            JOIN gen_persona p ON cf.ide_geper = p.ide_geper
            WHERE 
                cf.fecha_emisi_cccfa BETWEEN $1 AND $2
                AND cf.ide_empr = $3
                AND cf.ide_ccefa = ${estadoFacturaNormal}
                AND p.identificac_geper <> '9999999999999'
                AND CASE
                        WHEN COALESCE(cf.dias_credito_cccfa, 0) > 0
                            THEN (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa * INTERVAL '1 day')::date
                        ELSE cf.fecha_emisi_cccfa::date
                    END < CURRENT_DATE
        ),
        pagos_por_factura AS (
            SELECT 
                ct.ide_cccfa,
                GREATEST(
                    ROUND(
                        SUM(
                            CASE WHEN tt.signo_ccttr < 0 AND dt.ide_ccttr NOT IN (7, 9)
                                 THEN ABS(dt.valor_ccdtr)
                                 ELSE 0
                            END
                        )::numeric,
                        2
                    ),
                    0
                )                         AS total_pagado,
                MAX(ct.fecha_trans_ccctr) AS fecha_ultimo_pago
            FROM cxc_cabece_transa ct
            JOIN cxc_detall_transa dt ON ct.ide_ccctr = dt.ide_ccctr
            JOIN cxc_tipo_transacc tt ON dt.ide_ccttr = tt.ide_ccttr
            JOIN facturas_base fb     ON ct.ide_cccfa = fb.ide_cccfa
            GROUP BY ct.ide_cccfa
        ),
        facturas_con_saldo AS (
            SELECT 
                fb.*,
                COALESCE(ppf.total_pagado, 0)                                               AS total_pagado,
                GREATEST(
                    ROUND((fb.total_cccfa - COALESCE(ppf.total_pagado, 0))::numeric, 2),
                    0
                )                                                                            AS saldo_actual,
                ppf.fecha_ultimo_pago,
                CASE 
                    WHEN ROUND((fb.total_cccfa - COALESCE(ppf.total_pagado, 0))::numeric, 2) <= 0.10
                        THEN 'PAGADA'
                    ELSE 'VENCIDA'
                END                                                                          AS estado_pago,
                CASE 
                    WHEN ROUND((fb.total_cccfa - COALESCE(ppf.total_pagado, 0))::numeric, 2) <= 0.10
                        THEN 0
                    ELSE GREATEST(0, (CURRENT_DATE - fb.fecha_vencimiento)::integer)
                END                                                                          AS dias_retraso
            FROM facturas_base fb
            LEFT JOIN pagos_por_factura ppf ON fb.ide_cccfa = ppf.ide_cccfa
        ),
        metricas_pagos AS (
            SELECT 
                fcs.ide_geper,
                fcs.nom_geper,
                fcs.identificac_geper,
                fcs.uuid,
                COUNT(*)                                                                             AS total_facturas,
                SUM(CASE WHEN fcs.tipo_factura = 'CREDITO'  THEN 1 ELSE 0 END)                     AS facturas_credito,
                SUM(CASE WHEN fcs.tipo_factura = 'CONTADO'  THEN 1 ELSE 0 END)                     AS facturas_contado,
                SUM(CASE WHEN fcs.estado_pago  = 'VENCIDA'  THEN 1 ELSE 0 END)                     AS facturas_vencidas,
                SUM(CASE WHEN fcs.estado_pago  = 'VENCIDA'
                          AND fcs.tipo_factura = 'CREDITO'  THEN 1 ELSE 0 END)                     AS facturas_credito_vencidas,
                SUM(CASE WHEN fcs.estado_pago  = 'VENCIDA'
                          AND fcs.tipo_factura = 'CONTADO'  THEN 1 ELSE 0 END)                     AS facturas_contado_vencidas,
                SUM(CASE WHEN fcs.estado_pago  = 'PAGADA'   THEN 1 ELSE 0 END)                     AS facturas_pagadas,
                ROUND(SUM(fcs.total_cccfa)::numeric,  2)                                            AS total_facturado,
                ROUND(SUM(fcs.total_pagado)::numeric, 2)                                            AS total_abonado,
                ROUND(SUM(fcs.saldo_actual)::numeric, 2)                                            AS total_saldo_pendiente,
                ROUND(SUM(CASE WHEN fcs.estado_pago = 'VENCIDA'
                               THEN fcs.saldo_actual ELSE 0 END)::numeric, 2)                       AS saldo_vencido,
                ROUND(SUM(CASE WHEN fcs.estado_pago = 'VENCIDA'
                                AND fcs.tipo_factura = 'CREDITO'
                               THEN fcs.saldo_actual ELSE 0 END)::numeric, 2)                       AS saldo_vencido_credito,
                ROUND(SUM(CASE WHEN fcs.estado_pago = 'VENCIDA'
                                AND fcs.tipo_factura = 'CONTADO'
                               THEN fcs.saldo_actual ELSE 0 END)::numeric, 2)                       AS saldo_vencido_contado,
                COALESCE(
                    ROUND(AVG(CASE WHEN fcs.estado_pago = 'VENCIDA'
                                    AND fcs.tipo_factura = 'CREDITO'
                                   THEN fcs.dias_retraso END)),
                    0
                )                                                                                    AS dias_retraso_promedio,
                MAX(CASE WHEN fcs.estado_pago = 'VENCIDA'
                          AND fcs.tipo_factura = 'CREDITO'
                         THEN fcs.dias_retraso ELSE 0 END)                                          AS max_dias_retraso,
                COALESCE(
                    MIN(CASE WHEN fcs.estado_pago = 'VENCIDA'
                              AND fcs.tipo_factura = 'CREDITO'
                             THEN fcs.dias_retraso END),
                    0
                )                                                                                    AS min_dias_retraso,
                ROUND(
                    SUM(CASE WHEN fcs.estado_pago = 'VENCIDA' THEN 1 ELSE 0 END) * 100.0
                    / NULLIF(COUNT(*), 0),
                    2
                )                                                                                    AS porcentaje_facturas_vencidas,
                ROUND(
                    SUM(CASE WHEN fcs.estado_pago = 'VENCIDA'
                             THEN fcs.saldo_actual ELSE 0 END) * 100.0
                    / NULLIF(SUM(fcs.saldo_actual), 0),
                    2
                )                                                                                    AS porcentaje_saldo_vencido,
                COUNT(DISTINCT EXTRACT(YEAR FROM fcs.fecha_emisi_cccfa)::integer)                   AS anos_relacion_comercial,
                MIN(fcs.fecha_emisi_cccfa)                                                           AS fecha_primer_factura,
                MAX(fcs.fecha_emisi_cccfa)                                                           AS fecha_ultima_factura,
                CASE 
                    WHEN COUNT(*) > 1 THEN
                        ROUND(
                            (MAX(fcs.fecha_emisi_cccfa) - MIN(fcs.fecha_emisi_cccfa))::numeric
                            / NULLIF(COUNT(*) - 1, 0),
                            1
                        )
                    ELSE NULL
                END                                                                                  AS frecuencia_facturacion_dias,
                SUM(CASE WHEN fcs.fecha_emisi_cccfa >= CURRENT_DATE - 90
                          AND fcs.estado_pago = 'VENCIDA'
                         THEN 1 ELSE 0 END)                                                         AS facturas_vencidas_ultimos_3_meses,
                ROUND(SUM(CASE WHEN fcs.fecha_emisi_cccfa >= CURRENT_DATE - 90
                               AND fcs.estado_pago = 'VENCIDA'
                               THEN fcs.saldo_actual ELSE 0 END)::numeric, 2)                       AS saldo_vencido_ultimos_3_meses
            FROM facturas_con_saldo fcs
            GROUP BY fcs.ide_geper, fcs.nom_geper, fcs.identificac_geper, fcs.uuid
        ),
        historico_pagos AS (
            SELECT 
                ct.ide_geper,
                COALESCE(
                    ROUND(
                        AVG((ct.fecha_trans_ccctr - fb.fecha_vencimiento)::integer)::numeric,
                        1
                    ),
                    0
                )                                                                                    AS dias_retraso_historico_promedio,
                COUNT(DISTINCT CASE
                    WHEN ct.fecha_trans_ccctr > fb.fecha_vencimiento
                         AND fb.tipo_factura = 'CREDITO' THEN fb.ide_cccfa
                END)                                                                                 AS facturas_pagadas_con_retraso_historico,
                COUNT(DISTINCT CASE
                    WHEN ct.fecha_trans_ccctr <= fb.fecha_vencimiento
                         AND fb.tipo_factura = 'CREDITO' THEN fb.ide_cccfa
                END)                                                                                 AS facturas_pagadas_a_tiempo_historico
            FROM cxc_cabece_transa ct
            JOIN cxc_detall_transa dt ON ct.ide_ccctr = dt.ide_ccctr
            JOIN facturas_base fb     ON ct.ide_cccfa = fb.ide_cccfa
            JOIN cxc_tipo_transacc tt ON dt.ide_ccttr = tt.ide_ccttr
            WHERE 
                tt.signo_ccttr < 0
                AND dt.ide_ccttr NOT IN (7, 9)
            GROUP BY ct.ide_geper
        )
        SELECT 
            mp.ide_geper,
            mp.nom_geper,
            mp.identificac_geper,
            mp.uuid,
            mp.total_facturas,
            mp.facturas_credito,
            mp.facturas_contado,
            mp.facturas_vencidas,
            mp.facturas_credito_vencidas,
            mp.facturas_contado_vencidas,
            mp.facturas_pagadas,
            mp.total_facturado,
            mp.total_abonado,
            mp.total_saldo_pendiente,
            mp.saldo_vencido,
            mp.saldo_vencido_credito,
            mp.saldo_vencido_contado,
            mp.dias_retraso_promedio,
            mp.max_dias_retraso,
            mp.min_dias_retraso,
            mp.porcentaje_facturas_vencidas,
            mp.porcentaje_saldo_vencido,
            COALESCE(hp.dias_retraso_historico_promedio,        0) AS dias_retraso_historico_promedio,
            COALESCE(hp.facturas_pagadas_con_retraso_historico, 0) AS facturas_pagadas_con_retraso_historico,
            COALESCE(hp.facturas_pagadas_a_tiempo_historico,    0) AS facturas_pagadas_a_tiempo_historico,
            ROUND(
                COALESCE(hp.facturas_pagadas_a_tiempo_historico, 0) * 100.0
                / NULLIF(
                    COALESCE(hp.facturas_pagadas_con_retraso_historico, 0) +
                    COALESCE(hp.facturas_pagadas_a_tiempo_historico,    0),
                    0
                ),
                2
            )                                                       AS porcentaje_pagos_a_tiempo_historico,
            mp.anos_relacion_comercial,
            mp.fecha_primer_factura,
            mp.fecha_ultima_factura,
            mp.frecuencia_facturacion_dias,
            mp.facturas_vencidas_ultimos_3_meses,
            mp.saldo_vencido_ultimos_3_meses,
            CASE 
                WHEN mp.facturas_credito_vencidas = 0 AND
                     COALESCE(hp.facturas_pagadas_con_retraso_historico, 0) = 0  THEN 'EXCELENTE'
                WHEN mp.porcentaje_facturas_vencidas <= 10 AND
                     COALESCE(hp.dias_retraso_historico_promedio, 0) <= 5        THEN 'BUENO'
                WHEN mp.porcentaje_facturas_vencidas <= 25 AND
                     COALESCE(hp.dias_retraso_historico_promedio, 0) <= 15       THEN 'REGULAR'
                WHEN mp.porcentaje_facturas_vencidas <= 50                       THEN 'MALO'
                ELSE 'MUY MALO'
            END AS score_cumplimiento,
            CASE 
                WHEN mp.porcentaje_facturas_vencidas > 50 OR mp.max_dias_retraso > 90
                    THEN 'REVISION URGENTE - POSIBLE CORTE DE CREDITO'
                WHEN mp.porcentaje_facturas_vencidas > 25
                    THEN 'REDUCIR LIMITE DE CREDITO'
                WHEN mp.porcentaje_facturas_vencidas > 10
                    THEN 'SEGUIMIENTO ESPECIAL'
                ELSE 'MANTENER VIGILANCIA'
            END AS recomendacion,
            CASE 
                WHEN mp.saldo_vencido > 5000 THEN 'ALTO'
                WHEN mp.saldo_vencido > 2000 THEN 'MEDIO-ALTO'
                WHEN mp.saldo_vencido > 500  THEN 'MEDIO'
                WHEN mp.saldo_vencido > 0    THEN 'BAJO'
                ELSE 'SIN RIESGO'
            END AS nivel_riesgo
        FROM metricas_pagos mp
        LEFT JOIN historico_pagos hp ON mp.ide_geper = hp.ide_geper
        WHERE 
            mp.facturas_vencidas > 0
            AND mp.saldo_vencido >= 0.10
        ORDER BY 
            mp.saldo_vencido DESC,
            mp.porcentaje_facturas_vencidas DESC,
            mp.max_dias_retraso DESC
        `,
            dtoIn,
        );

        query.addParam(1, dtoIn.fechaInicio);
        query.addParam(2, dtoIn.fechaFin);
        query.addParam(3, dtoIn.ideEmpr);
        return this.dataSource.createQuery(query);
    }
    /**
     * Resumen ejecutivo de cuentas por cobrar de la sucursal para seguimiento de funcionarios.
     * Incluye: KPIs generales, detalle de vencidas, alertas de vencimiento próximo (10 días),
     * distribución por antigüedad y ranking de clientes con mayor deuda vencida.
     * Las fechas son opcionales; por defecto abarca el último año.
     */
    async getResumenCuentasPorCobrar(dtoIn: RangoFechasDto & HeaderParamsDto) {
        // ── Fechas por defecto: último año ────────────────────────────────────────
        const { fechaInicio, fechaFin } = dtoIn;
        // ── CTE base (misma lógica que getCuentasPorCobrar) ───────────────────────
        const baseCTE = `
      WITH cuentas AS (
        SELECT
          ct.ide_geper,
          p.nom_geper,
          p.identificac_geper,
          p.uuid,
          p.correo_geper,
          cf.ide_cccfa,
          cf.secuencial_cccfa,
          cf.total_cccfa,
          cf.dias_credito_cccfa                                            AS dias_credito,
          cf.fecha_emisi_cccfa,
          cf.fecha_emisi_cccfa + cf.dias_credito_cccfa * INTERVAL '1 day' AS fecha_vence,
          df.establecimiento_ccdfa,
          df.pto_emision_ccdfa,
          df.serie_ccdaf,
          COALESCE(cf.observacion_cccfa, ct.observacion_ccctr, '')         AS observacion,
          ct.usuario_ingre,
          ct.ide_sucu,
          ct.ide_empr,

          -- Saldo pendiente
          SUM(dt.valor_ccdtr * tt.signo_ccttr)                            AS saldo_x_pagar,
          cf.total_cccfa - COALESCE(SUM(dt.valor_ccdtr * tt.signo_ccttr), 0) AS abonado,
          ROUND(
            (COALESCE(SUM(dt.valor_ccdtr * tt.signo_ccttr), 0) / cf.total_cccfa * 100),
            2
          )                                                                AS porcentaje_abonado,

          -- Días en mora (desde el vencimiento)
          CASE
            WHEN cf.fecha_emisi_cccfa IS NOT NULL AND cf.dias_credito_cccfa > 0 THEN
              GREATEST(0, (CURRENT_DATE - (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa))::integer)
            ELSE 0
          END AS dias_vencido,

          -- Días restantes para vencer
          CASE
            WHEN cf.fecha_emisi_cccfa IS NOT NULL AND cf.dias_credito_cccfa > 0
              AND CURRENT_DATE <= (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa) THEN
              ((cf.fecha_emisi_cccfa + cf.dias_credito_cccfa) - CURRENT_DATE)::integer
            ELSE NULL
          END AS dias_para_vencer,

          -- Estado de la obligación
          CASE
            WHEN cf.fecha_emisi_cccfa IS NOT NULL AND cf.dias_credito_cccfa > 0
              AND CURRENT_DATE > (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa)  THEN 'VENCIDA'
            WHEN cf.fecha_emisi_cccfa IS NOT NULL AND cf.dias_credito_cccfa > 0
              AND CURRENT_DATE <= (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa) THEN 'POR VENCER'
            WHEN cf.dias_credito_cccfa = 0 OR cf.dias_credito_cccfa IS NULL      THEN 'CONTADO'
            ELSE 'SIN FECHA VENCIMIENTO'
          END AS estado_obligacion,

          -- Rango de mora
          CASE
            WHEN cf.fecha_emisi_cccfa IS NOT NULL AND cf.dias_credito_cccfa > 0
              AND CURRENT_DATE > (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa) THEN
              CASE
                WHEN (CURRENT_DATE - (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa)) <= 30  THEN 'MORA 1-30 DÍAS'
                WHEN (CURRENT_DATE - (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa)) <= 60  THEN 'MORA 31-60 DÍAS'
                WHEN (CURRENT_DATE - (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa)) <= 90  THEN 'MORA 61-90 DÍAS'
                ELSE 'MORA MÁS DE 90 DÍAS'
              END
            ELSE 'AL DÍA'
          END AS rango_mora,

          -- Prioridad de cobro para el funcionario
          CASE
            WHEN cf.fecha_emisi_cccfa IS NOT NULL AND cf.dias_credito_cccfa > 0
              AND CURRENT_DATE > (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa) THEN
              CASE
                WHEN (CURRENT_DATE - (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa)) <= 30  THEN 'MEDIA'
                WHEN (CURRENT_DATE - (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa)) <= 60  THEN 'ALTA'
                WHEN (CURRENT_DATE - (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa)) <= 90  THEN 'URGENTE'
                ELSE 'CRÍTICA'
              END
            WHEN cf.dias_credito_cccfa = 0 OR cf.dias_credito_cccfa IS NULL THEN 'CONTADO'
            ELSE 'BAJA'
          END AS prioridad_cobro,

          -- Antigüedad desde emisión
          CASE
            WHEN cf.fecha_emisi_cccfa IS NOT NULL THEN
              CASE
                WHEN (CURRENT_DATE - cf.fecha_emisi_cccfa) <= 30  THEN '0-30 DÍAS'
                WHEN (CURRENT_DATE - cf.fecha_emisi_cccfa) <= 60  THEN '31-60 DÍAS'
                WHEN (CURRENT_DATE - cf.fecha_emisi_cccfa) <= 90  THEN '61-90 DÍAS'
                WHEN (CURRENT_DATE - cf.fecha_emisi_cccfa) <= 180 THEN '91-180 DÍAS'
                ELSE 'MÁS DE 180 DÍAS'
              END
            ELSE 'SIN FECHA'
          END AS antiguedad

        FROM cxc_detall_transa dt
        LEFT JOIN cxc_cabece_transa  ct  ON dt.ide_ccctr  = ct.ide_ccctr
        LEFT JOIN cxc_cabece_factura cf  ON cf.ide_cccfa  = ct.ide_cccfa
          AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
        LEFT JOIN cxc_tipo_transacc  tt  ON tt.ide_ccttr  = dt.ide_ccttr
        LEFT JOIN gen_persona        p   ON ct.ide_geper  = p.ide_geper
        LEFT JOIN cxc_datos_fac      df  ON cf.ide_ccdaf  = df.ide_ccdaf
        WHERE
          (
            cf.fecha_emisi_cccfa    BETWEEN $1 AND $2
            OR ct.fecha_trans_ccctr BETWEEN $3 AND $4
          )
          AND dt.ide_sucu   = $5
          AND ct.ide_empr   = $6
          AND dt.ide_ccttr NOT IN (7, 9)
        GROUP BY
          ct.ide_geper, p.nom_geper, p.identificac_geper, p.uuid, p.correo_geper,
          cf.ide_cccfa, cf.secuencial_cccfa, cf.total_cccfa, cf.dias_credito_cccfa,
          cf.fecha_emisi_cccfa, cf.observacion_cccfa, ct.observacion_ccctr,
          df.establecimiento_ccdfa, df.pto_emision_ccdfa, df.serie_ccdaf,
          ct.usuario_ingre, ct.ide_sucu, ct.ide_empr
        HAVING SUM(dt.valor_ccdtr * tt.signo_ccttr) > 0
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
        COUNT(DISTINCT ide_geper)::integer                                                      AS total_clientes_con_deuda,
        ROUND(SUM(saldo_x_pagar)::numeric, 2)                                                  AS total_saldo_pendiente,
        ROUND(SUM(CASE WHEN estado_obligacion = 'VENCIDA'    THEN saldo_x_pagar ELSE 0 END)::numeric, 2) AS total_saldo_vencido,
        ROUND(SUM(CASE WHEN estado_obligacion = 'POR VENCER' THEN saldo_x_pagar ELSE 0 END)::numeric, 2) AS total_saldo_por_vencer,
        ROUND(SUM(CASE WHEN estado_obligacion = 'CONTADO'    THEN saldo_x_pagar ELSE 0 END)::numeric, 2) AS total_saldo_contado,
        COUNT(CASE WHEN estado_obligacion = 'VENCIDA'    THEN 1 END)::integer                  AS cantidad_facturas_vencidas,
        COUNT(CASE WHEN estado_obligacion = 'POR VENCER' THEN 1 END)::integer                  AS cantidad_facturas_por_vencer,
        COUNT(DISTINCT CASE WHEN estado_obligacion = 'VENCIDA' THEN ide_geper END)::integer    AS clientes_con_deuda_vencida,
        -- Alertas por vencer en 10 días
        COUNT(CASE WHEN estado_obligacion = 'POR VENCER' AND dias_para_vencer <= 10 THEN 1 END)::integer AS cantidad_vencen_en_10_dias,
        ROUND(SUM(CASE WHEN estado_obligacion = 'POR VENCER' AND dias_para_vencer <= 10 THEN saldo_x_pagar ELSE 0 END)::numeric, 2) AS saldo_vence_en_10_dias,
        -- Indicadores de mora
        ROUND(AVG(CASE WHEN estado_obligacion = 'VENCIDA' THEN dias_vencido END)::numeric, 0)  AS promedio_dias_vencido,
        MAX(CASE WHEN estado_obligacion = 'VENCIDA' THEN dias_vencido ELSE 0 END)::integer     AS max_dias_vencido,
        -- Atención urgente (URGENTE + CRÍTICA)
        COUNT(CASE WHEN prioridad_cobro IN ('URGENTE', 'CRÍTICA') THEN 1 END)::integer         AS facturas_atencion_urgente,
        ROUND(SUM(CASE WHEN prioridad_cobro IN ('URGENTE', 'CRÍTICA') THEN saldo_x_pagar ELSE 0 END)::numeric, 2) AS saldo_atencion_urgente
      FROM cuentas
    `);
        addBaseParams(qMetricas);

        // ── Query 2: Detalle cuentas vencidas (para gestión de cobranza) ──────────
        const qVencidas = new SelectQuery(`
      ${baseCTE}
      SELECT
        ide_geper,
        nom_geper,
        identificac_geper,
        uuid,
        correo_geper,
        ide_cccfa,
        secuencial_cccfa,
        establecimiento_ccdfa,
        pto_emision_ccdfa,
        serie_ccdaf,
        TO_CHAR(fecha_emisi_cccfa, 'YYYY-MM-DD') AS fecha_emision,
        TO_CHAR(fecha_vence, 'YYYY-MM-DD')        AS fecha_vence,
        dias_credito,
        total_cccfa,
        abonado,
        saldo_x_pagar,
        porcentaje_abonado,
        dias_vencido,
        rango_mora,
        antiguedad,
        prioridad_cobro,
        observacion,
        usuario_ingre
      FROM cuentas
      WHERE estado_obligacion = 'VENCIDA'
      ORDER BY
        CASE prioridad_cobro
          WHEN 'CRÍTICA'  THEN 1
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
        correo_geper,
        ide_cccfa,
        secuencial_cccfa,
        establecimiento_ccdfa,
        pto_emision_ccdfa,
        serie_ccdaf,
        TO_CHAR(fecha_emisi_cccfa, 'YYYY-MM-DD') AS fecha_emision,
        TO_CHAR(fecha_vence, 'YYYY-MM-DD')        AS fecha_vence,
        dias_credito,
        total_cccfa,
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

        // ── Query 4: Distribución por antigüedad (aging) ──────────────────────────
        const qAntiguedad = new SelectQuery(`
      ${baseCTE}
      SELECT
        antiguedad                                              AS rango,
        COUNT(*)::integer                                       AS cantidad_facturas,
        COUNT(DISTINCT ide_geper)::integer                      AS cantidad_clientes,
        ROUND(SUM(saldo_x_pagar)::numeric, 2)                  AS total_saldo,
        ROUND(AVG(saldo_x_pagar)::numeric, 2)                  AS promedio_saldo,
        ROUND(
          SUM(CASE WHEN estado_obligacion = 'VENCIDA' THEN saldo_x_pagar ELSE 0 END)::numeric, 2
        )                                                       AS saldo_vencido
      FROM cuentas
      GROUP BY antiguedad
      ORDER BY
        CASE antiguedad
          WHEN '0-30 DÍAS'       THEN 1
          WHEN '31-60 DÍAS'      THEN 2
          WHEN '61-90 DÍAS'      THEN 3
          WHEN '91-180 DÍAS'     THEN 4
          WHEN 'MÁS DE 180 DÍAS' THEN 5
          ELSE 6
        END
    `);
        addBaseParams(qAntiguedad);

        // ── Query 5: Top 10 clientes — mayor deuda vencida (prioridad seguimiento)
        const qTopClientes = new SelectQuery(`
      ${baseCTE}
      SELECT
        ide_geper,
        nom_geper,
        identificac_geper,
        uuid,
        correo_geper,
        COUNT(*)::integer                                                                  AS facturas_pendientes,
        COUNT(CASE WHEN estado_obligacion = 'VENCIDA' THEN 1 END)::integer                AS facturas_vencidas,
        ROUND(SUM(saldo_x_pagar)::numeric, 2)                                             AS saldo_total,
        ROUND(SUM(CASE WHEN estado_obligacion = 'VENCIDA' THEN saldo_x_pagar ELSE 0 END)::numeric, 2) AS saldo_vencido,
        MAX(CASE WHEN estado_obligacion = 'VENCIDA' THEN dias_vencido ELSE 0 END)::integer AS max_dias_vencido,
        MAX(CASE WHEN estado_obligacion = 'VENCIDA' THEN rango_mora END)                  AS rango_mora_mayor,
        -- Nivel de riesgo por monto
        CASE
          WHEN SUM(CASE WHEN estado_obligacion = 'VENCIDA' THEN saldo_x_pagar ELSE 0 END) > 5000 THEN 'ALTO'
          WHEN SUM(CASE WHEN estado_obligacion = 'VENCIDA' THEN saldo_x_pagar ELSE 0 END) > 2000 THEN 'MEDIO-ALTO'
          WHEN SUM(CASE WHEN estado_obligacion = 'VENCIDA' THEN saldo_x_pagar ELSE 0 END) > 500  THEN 'MEDIO'
          ELSE 'BAJO'
        END AS nivel_riesgo,
        -- Acción de seguimiento recomendada
        CASE
          WHEN MAX(CASE WHEN estado_obligacion = 'VENCIDA' THEN dias_vencido ELSE 0 END) > 90 THEN
            'GESTIÓN COBRANZA URGENTE - EVALUAR ACCIÓN LEGAL'
          WHEN MAX(CASE WHEN estado_obligacion = 'VENCIDA' THEN dias_vencido ELSE 0 END) > 60 THEN
            'LLAMADA DIRECTA Y ACUERDO DE PAGO'
          WHEN MAX(CASE WHEN estado_obligacion = 'VENCIDA' THEN dias_vencido ELSE 0 END) > 30 THEN
            'ENVIAR RECORDATORIO FORMAL'
          ELSE 'CONTACTAR CLIENTE'
        END AS accion_seguimiento
      FROM cuentas
      WHERE estado_obligacion = 'VENCIDA'
      GROUP BY ide_geper, nom_geper, identificac_geper, uuid, correo_geper
      ORDER BY saldo_vencido DESC, max_dias_vencido DESC
      LIMIT 10
    `);
        addBaseParams(qTopClientes);

        // ── Ejecutar todas las consultas en paralelo ──────────────────────────────
        const [metricas, vencidas, porVencer10Dias, distribucionAntiguedad, topClientesDeudaVencida] =
            await Promise.all([
                this.dataSource.createSingleQuery(qMetricas),
                this.dataSource.createSelectQuery(qVencidas),
                this.dataSource.createSelectQuery(qPorVencer),
                this.dataSource.createSelectQuery(qAntiguedad),
                this.dataSource.createSelectQuery(qTopClientes),
            ]);

        return {
            rowCount: 1,
            row: {
                periodo: { fechaInicio, fechaFin },
                metricas,
                vencidas,
                por_vencer_10_dias: porVencer10Dias,
                distribucion_antiguedad: distribucionAntiguedad,
                top_clientes_deuda_vencida: topClientesDeudaVencida,
            },
            message: 'ok',
        };
    }
}
