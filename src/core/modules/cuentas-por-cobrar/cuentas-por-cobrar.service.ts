import { Injectable } from '@nestjs/common';
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
        const query = new SelectQuery(
            `
        SELECT 
            dt.ide_ccctr,
            dt.ide_cccfa,
            ct.ide_geper,
            
            -- Fecha (prioriza fecha de factura sobre fecha de transacción)
            CASE 
                WHEN cf.fecha_emisi_cccfa IS NOT NULL THEN cf.fecha_emisi_cccfa 
                ELSE ct.fecha_trans_ccctr 
            END AS fecha,
            
            -- Información de facturación
            cf.secuencial_cccfa,
            cf.total_cccfa,
            df.establecimiento_ccdfa,
            df.pto_emision_ccdfa,
            df.serie_ccdaf,
            
            -- Información del cliente
            p.nom_geper,
            p.identificac_geper,
            p.uuid,
            
            -- Métricas de saldo
            SUM(dt.valor_ccdtr * tt.signo_ccttr) AS saldo_x_pagar,
            cf.total_cccfa - COALESCE(SUM(dt.valor_ccdtr * tt.signo_ccttr), 0) AS abonado,
            ROUND(
                (COALESCE(SUM(dt.valor_ccdtr * tt.signo_ccttr), 0) / cf.total_cccfa * 100), 
                2
            ) AS porcentaje_pagado,
            
            -- Información de crédito y vencimiento
            cf.dias_credito_cccfa AS dias_credito,
            TO_CHAR(
                cf.fecha_emisi_cccfa + cf.dias_credito_cccfa * INTERVAL '1 day',
                'YYYY-MM-DD'
            ) AS fecha_vence,
            
            -- Cálculo de días de mora
            CASE 
                WHEN cf.fecha_emisi_cccfa IS NOT NULL AND cf.dias_credito_cccfa > 0 THEN
                    GREATEST(0, (CURRENT_DATE - (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa))::integer)
                ELSE 
                    0
            END AS dias_vencido,
            
            -- Estado de la obligación
            CASE 
                WHEN cf.fecha_emisi_cccfa IS NOT NULL AND cf.dias_credito_cccfa > 0 AND
                     CURRENT_DATE > (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa) THEN 'VENCIDA'
                WHEN cf.fecha_emisi_cccfa IS NOT NULL AND cf.dias_credito_cccfa > 0 AND
                     CURRENT_DATE <= (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa) THEN 'POR VENCER'
                WHEN cf.dias_credito_cccfa = 0 OR cf.dias_credito_cccfa IS NULL THEN 'CONTADO'
                ELSE 'SIN FECHA VENCIMIENTO'
            END AS estado_obligacion,
            
            -- Rango de antigüedad
            CASE 
                WHEN cf.fecha_emisi_cccfa IS NOT NULL THEN
                    CASE 
                        WHEN (CURRENT_DATE - cf.fecha_emisi_cccfa) <= 30 THEN '0-30 DÍAS'
                        WHEN (CURRENT_DATE - cf.fecha_emisi_cccfa) <= 60 THEN '31-60 DÍAS'
                        WHEN (CURRENT_DATE - cf.fecha_emisi_cccfa) <= 90 THEN '61-90 DÍAS'
                        WHEN (CURRENT_DATE - cf.fecha_emisi_cccfa) <= 180 THEN '91-180 DÍAS'
                        ELSE 'MÁS DE 180 DÍAS'
                    END
                ELSE 'SIN FECHA'
            END AS antiguedad,
            
            -- Rango de mora específico
            CASE 
                WHEN cf.fecha_emisi_cccfa IS NOT NULL AND cf.dias_credito_cccfa > 0 AND
                     CURRENT_DATE > (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa) THEN
                    CASE 
                        WHEN (CURRENT_DATE - (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa)) <= 30 THEN 'MORA 1-30 DÍAS'
                        WHEN (CURRENT_DATE - (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa)) <= 60 THEN 'MORA 31-60 DÍAS'
                        WHEN (CURRENT_DATE - (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa)) <= 90 THEN 'MORA 61-90 DÍAS'
                        ELSE 'MORA MÁS DE 90 DÍAS'
                    END
                ELSE 'AL DÍA'
            END AS rango_mora,
            
            -- Prioridad de cobro
            CASE 
                WHEN cf.fecha_emisi_cccfa IS NOT NULL AND cf.dias_credito_cccfa > 0 AND
                     CURRENT_DATE > (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa) THEN
                    CASE 
                        WHEN (CURRENT_DATE - (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa)) <= 30 THEN 'MEDIA'
                        WHEN (CURRENT_DATE - (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa)) <= 60 THEN 'ALTA'
                        WHEN (CURRENT_DATE - (cf.fecha_emisi_cccfa + cf.dias_credito_cccfa)) <= 90 THEN 'URGENTE'
                        ELSE 'CRÍTICA'
                    END
                WHEN cf.dias_credito_cccfa = 0 OR cf.dias_credito_cccfa IS NULL THEN 'CONTADO'
                ELSE 'BAJA'
            END AS prioridad_cobro,
            
            -- Observaciones
            COALESCE(cf.observacion_cccfa, ct.observacion_ccctr, '') AS observacion,
            
            -- Información de transacción
            tt.nombre_ccttr AS tipo_transaccion,
            tt.signo_ccttr,
            ct.usuario_ingre,
            ct.fecha_ingre,
            
            -- Información de empresa y sucursal
            ct.ide_empr,
            ct.ide_sucu,
            
            -- Métricas adicionales
            (CURRENT_DATE - cf.fecha_emisi_cccfa) AS dias_desde_emision,
            CASE 
                WHEN cf.dias_credito_cccfa > 0 THEN
                    ROUND((cf.total_cccfa / cf.dias_credito_cccfa)::numeric, 2)
                ELSE 0
            END AS promedio_diario_credito

        FROM cxc_detall_transa dt
        LEFT JOIN cxc_cabece_transa ct ON dt.ide_ccctr = ct.ide_ccctr
        LEFT JOIN cxc_cabece_factura cf ON cf.ide_cccfa = ct.ide_cccfa 
            AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
        LEFT JOIN cxc_tipo_transacc tt ON tt.ide_ccttr = dt.ide_ccttr
        LEFT JOIN gen_persona p ON ct.ide_geper = p.ide_geper
        LEFT JOIN cxc_datos_fac df ON cf.ide_ccdaf = df.ide_ccdaf
        
        WHERE 
            -- Filtro por rango de fechas (usando fecha de factura o transacción)
            (
                cf.fecha_emisi_cccfa BETWEEN $1 AND $2 
                OR 
                ct.fecha_trans_ccctr BETWEEN $3 AND $4
            )
            AND dt.ide_sucu = $5
            AND ct.ide_empr = $6
            AND dt.ide_ccttr NOT IN (7, 9)  -- Transacciones de ajustes NO
            
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
            prioridad_cobro DESC,
            dias_vencido DESC,
            saldo_x_pagar DESC,
            fecha ASC
        `,
            dtoIn
        );

        query.addParam(1, dtoIn.fechaInicio);
        query.addParam(2, dtoIn.fechaFin);
        query.addParam(3, dtoIn.fechaInicio);
        query.addParam(4, dtoIn.fechaFin);
        query.addParam(5, dtoIn.ideSucu);
        query.addParam(6, dtoIn.ideEmpr);
        return await this.dataSource.createQuery(query);
    }


    async getClientesPagoDestiempo(dtoIn: RangoFechasDto & HeaderParamsDto) {
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
                    cf.dias_credito_cccfa,
                    cf.fecha_emisi_cccfa + cf.dias_credito_cccfa AS fecha_vencimiento,
                    cf.observacion_cccfa,
                    cf.ide_empr
                FROM cxc_cabece_factura cf
                JOIN gen_persona p ON cf.ide_geper = p.ide_geper
                WHERE 
                    cf.fecha_emisi_cccfa BETWEEN $1 AND $2
                    AND cf.ide_empr = $3
                    AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                    AND cf.dias_credito_cccfa > 0  -- Solo facturas a crédito
            ),
            pagos_por_factura AS (
                SELECT 
                    ct.ide_cccfa,
                    ABS(SUM(dt.valor_ccdtr * tt.signo_ccttr)) AS total_pagado,
                    MAX(ct.fecha_trans_ccctr) AS fecha_ultimo_pago
                FROM cxc_cabece_transa ct
                JOIN cxc_detall_transa dt ON ct.ide_ccctr = dt.ide_ccctr
                JOIN cxc_tipo_transacc tt ON dt.ide_ccttr = tt.ide_ccttr
                WHERE 
                    tt.signo_ccttr < 0  -- Solo transacciones de pago
                    AND dt.ide_ccttr NOT IN (7, 9)
                GROUP BY ct.ide_cccfa
            ),
            facturas_con_saldo AS (
                SELECT 
                    fb.*,
                    COALESCE(ppf.total_pagado, 0) AS total_pagado,
                    (fb.total_cccfa - COALESCE(ppf.total_pagado, 0)) AS saldo_actual,
                    ppf.fecha_ultimo_pago,
                    
                    -- Días de retraso CORREGIDO - usando diferencia directa de fechas
                    CASE 
                        WHEN (fb.total_cccfa - COALESCE(ppf.total_pagado, 0)) > 0 THEN
                            GREATEST(0, (CURRENT_DATE - fb.fecha_vencimiento))
                        ELSE 0
                    END AS dias_retraso,
                    
                    -- Estado de pago
                    CASE 
                        WHEN (fb.total_cccfa - COALESCE(ppf.total_pagado, 0)) > 0 THEN
                            CASE 
                                WHEN CURRENT_DATE > fb.fecha_vencimiento THEN 'PENDIENTE VENCIDA'
                                ELSE 'PENDIENTE POR VENCER'
                            END
                        ELSE 'PAGADA'
                    END AS estado_pago
    
                FROM facturas_base fb
                LEFT JOIN pagos_por_factura ppf ON fb.ide_cccfa = ppf.ide_cccfa
            ),
            metricas_pagos AS (
                SELECT 
                    fcs.ide_geper,
                    fcs.nom_geper,
                    fcs.identificac_geper,
                    fcs.uuid,
                    
                    -- Métricas básicas
                    COUNT(*) AS total_facturas,
                    SUM(CASE WHEN fcs.estado_pago = 'PENDIENTE VENCIDA' THEN 1 ELSE 0 END) AS facturas_vencidas,
                    SUM(CASE WHEN fcs.estado_pago = 'PENDIENTE POR VENCER' THEN 1 ELSE 0 END) AS facturas_por_vencer,
                    SUM(CASE WHEN fcs.estado_pago = 'PAGADA' THEN 1 ELSE 0 END) AS facturas_pagadas,
                    
                    -- Métricas de montos
                    SUM(fcs.total_cccfa) AS total_facturado,
                    SUM(fcs.total_pagado) AS total_abonado,
                    SUM(fcs.saldo_actual) AS total_saldo_pendiente,
                    SUM(CASE WHEN fcs.estado_pago = 'PENDIENTE VENCIDA' THEN fcs.saldo_actual ELSE 0 END) AS saldo_vencido,
                    SUM(CASE WHEN fcs.estado_pago = 'PENDIENTE POR VENCER' THEN fcs.saldo_actual ELSE 0 END) AS saldo_por_vencer,
                    
                    -- Métricas de retraso
                    CASE 
                        WHEN SUM(CASE WHEN fcs.estado_pago = 'PENDIENTE VENCIDA' THEN 1 ELSE 0 END) > 0 THEN
                            ROUND(AVG(CASE WHEN fcs.estado_pago = 'PENDIENTE VENCIDA' THEN fcs.dias_retraso ELSE NULL END))
                        ELSE 0
                    END AS dias_retraso_promedio,
                    
                    MAX(CASE WHEN fcs.estado_pago = 'PENDIENTE VENCIDA' THEN fcs.dias_retraso ELSE 0 END) AS max_dias_retraso,
                    
                    CASE 
                        WHEN SUM(CASE WHEN fcs.estado_pago = 'PENDIENTE VENCIDA' THEN 1 ELSE 0 END) > 0 THEN
                            MIN(CASE WHEN fcs.estado_pago = 'PENDIENTE VENCIDA' THEN fcs.dias_retraso ELSE NULL END)
                        ELSE 0
                    END AS min_dias_retraso,
                    
                    -- Porcentajes
                    CASE 
                        WHEN COUNT(*) > 0 THEN
                            ROUND(
                                (SUM(CASE WHEN fcs.estado_pago = 'PENDIENTE VENCIDA' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)),
                                2
                            )
                        ELSE 0
                    END AS porcentaje_facturas_vencidas,
                    
                    CASE 
                        WHEN SUM(fcs.saldo_actual) > 0 THEN
                            ROUND(
                                (SUM(CASE WHEN fcs.estado_pago = 'PENDIENTE VENCIDA' THEN fcs.saldo_actual ELSE 0 END) * 100.0 / 
                                 SUM(fcs.saldo_actual)),
                                2
                            )
                        ELSE 0
                    END AS porcentaje_saldo_vencido,
                    
                    -- Comportamiento histórico
                    COUNT(DISTINCT DATE_PART('year', fcs.fecha_emisi_cccfa)) AS años_relacion_comercial,
                    MIN(fcs.fecha_emisi_cccfa) AS fecha_primer_factura,
                    MAX(fcs.fecha_emisi_cccfa) AS fecha_ultima_factura,
                    
                    -- Frecuencia de facturación - simplificada
                    CASE 
                        WHEN COUNT(*) > 1 THEN
                            (MAX(fcs.fecha_emisi_cccfa) - MIN(fcs.fecha_emisi_cccfa)) / (COUNT(*) - 1)
                        ELSE NULL
                    END AS frecuencia_facturacion_dias,
                    
                    -- Tendencias recientes (últimos 3 meses)
                    SUM(CASE WHEN fcs.fecha_emisi_cccfa >= CURRENT_DATE - 90 
                             AND fcs.estado_pago = 'PENDIENTE VENCIDA' THEN 1 ELSE 0 END) AS facturas_vencidas_ultimos_3_meses,
                    
                    SUM(CASE WHEN fcs.fecha_emisi_cccfa >= CURRENT_DATE - 90 
                             AND fcs.estado_pago = 'PENDIENTE VENCIDA' THEN fcs.saldo_actual ELSE 0 END) AS saldo_vencido_ultimos_3_meses
    
                FROM facturas_con_saldo fcs
                GROUP BY fcs.ide_geper, fcs.nom_geper, fcs.identificac_geper, fcs.uuid
            ),
            historico_pagos AS (
                SELECT 
                    ct.ide_geper,
                    
                    -- Comportamiento de pagos anteriores - usando diferencia directa
                    AVG(
                        (ct.fecha_trans_ccctr - cf.fecha_vencimiento)
                    ) AS dias_retraso_historico_promedio,
                    
                    COUNT(DISTINCT CASE 
                        WHEN ct.fecha_trans_ccctr > cf.fecha_vencimiento THEN
                             cf.ide_cccfa
                    END) AS facturas_pagadas_con_retraso_historico,
                    
                    COUNT(DISTINCT CASE 
                        WHEN ct.fecha_trans_ccctr <= cf.fecha_vencimiento THEN
                             cf.ide_cccfa
                    END) AS facturas_pagadas_a_tiempo_historico
    
                FROM cxc_cabece_transa ct
                JOIN cxc_detall_transa dt ON ct.ide_ccctr = dt.ide_ccctr
                JOIN facturas_base cf ON ct.ide_cccfa = cf.ide_cccfa
                JOIN cxc_tipo_transacc tt ON dt.ide_ccttr = tt.ide_ccttr
                WHERE 
                    tt.signo_ccttr < 0  -- Solo transacciones de pago
                    AND dt.ide_ccttr NOT IN (7, 9)
                    AND ct.fecha_trans_ccctr BETWEEN $4 AND $5
                GROUP BY ct.ide_geper
            )
            SELECT 
                mp.ide_geper,
                mp.nom_geper,
                mp.identificac_geper,
                mp.uuid,
                
                -- Métricas básicas
                mp.total_facturas,
                mp.facturas_vencidas,
                mp.facturas_por_vencer,
                mp.facturas_pagadas,
                
                -- Métricas financieras
                mp.total_facturado,
                mp.total_abonado,
                mp.total_saldo_pendiente,
                mp.saldo_vencido,
                mp.saldo_por_vencer,
                
                -- Indicadores de retraso actual
                mp.dias_retraso_promedio AS dias_retraso_promedio,
                mp.max_dias_retraso,
                mp.min_dias_retraso,
                
                -- Porcentajes de morosidad
                mp.porcentaje_facturas_vencidas,
                mp.porcentaje_saldo_vencido,
                
                -- Comportamiento histórico
                COALESCE(ROUND(hp.dias_retraso_historico_promedio), 0) AS dias_retraso_historico_promedio,
                COALESCE(hp.facturas_pagadas_con_retraso_historico, 0) AS facturas_pagadas_con_retraso_historico,
                COALESCE(hp.facturas_pagadas_a_tiempo_historico, 0) AS facturas_pagadas_a_tiempo_historico,
                
                -- Cálculo de porcentaje histórico de pagos a tiempo
                CASE 
                    WHEN COALESCE(hp.facturas_pagadas_con_retraso_historico, 0) + 
                         COALESCE(hp.facturas_pagadas_a_tiempo_historico, 0) > 0 THEN
                        ROUND(
                            (COALESCE(hp.facturas_pagadas_a_tiempo_historico, 0) * 100.0 / 
                             (COALESCE(hp.facturas_pagadas_con_retraso_historico, 0) + 
                              COALESCE(hp.facturas_pagadas_a_tiempo_historico, 0))),
                            2
                        )
                    ELSE 0
                END AS porcentaje_pagos_a_tiempo_historico,
                
                -- Antigüedad de relación comercial
                mp.años_relacion_comercial,
                mp.fecha_primer_factura,
                mp.fecha_ultima_factura,
                mp.frecuencia_facturacion_dias,
                
                -- Tendencias recientes
                mp.facturas_vencidas_ultimos_3_meses,
                mp.saldo_vencido_ultimos_3_meses,
                
                -- Score de cumplimiento
                CASE 
                    WHEN mp.facturas_vencidas = 0 AND 
                         COALESCE(hp.facturas_pagadas_con_retraso_historico, 0) = 0 THEN 'EXCELENTE'
                    WHEN mp.porcentaje_facturas_vencidas <= 10 AND 
                         COALESCE(hp.dias_retraso_historico_promedio, 0) <= 5 THEN 'BUENO'
                    WHEN mp.porcentaje_facturas_vencidas <= 25 AND 
                         COALESCE(hp.dias_retraso_historico_promedio, 0) <= 15 THEN 'REGULAR'
                    WHEN mp.porcentaje_facturas_vencidas <= 50 THEN 'MALO'
                    ELSE 'MUY MALO'
                END AS score_cumplimiento,
                
                -- Recomendaciones
                CASE 
                    WHEN mp.porcentaje_facturas_vencidas > 50 OR mp.max_dias_retraso > 90 THEN 
                        'REVISIÓN URGENTE - POSIBLE CORTE DE CRÉDITO'
                    WHEN mp.porcentaje_facturas_vencidas > 25 THEN 
                        'REDUCIR LÍMITE DE CRÉDITO'
                    WHEN mp.porcentaje_facturas_vencidas > 10 THEN 
                        'SEGUIMIENTO ESPECIAL'
                    ELSE 'MANTENER VIGILANCIA'
                END AS recomendacion,
                
                -- Nivel de riesgo
                CASE 
                    WHEN mp.saldo_vencido > 5000 THEN 'ALTO'
                    WHEN mp.saldo_vencido > 2000 THEN 'MEDIO-ALTO'
                    WHEN mp.saldo_vencido > 500 THEN 'MEDIO'
                    WHEN mp.saldo_vencido > 0 THEN 'BAJO'
                    ELSE 'SIN RIESGO'
                END AS nivel_riesgo
    
            FROM metricas_pagos mp
            LEFT JOIN historico_pagos hp ON mp.ide_geper = hp.ide_geper
            WHERE 
                mp.facturas_vencidas > 0  -- Solo clientes con facturas vencidas actualmente
            
            ORDER BY 
                mp.saldo_vencido DESC,
                mp.porcentaje_facturas_vencidas DESC,
                mp.max_dias_retraso DESC
            `,
            dtoIn
        );

        query.addParam(1, dtoIn.fechaInicio);
        query.addParam(2, dtoIn.fechaFin);
        query.addParam(3, dtoIn.ideEmpr);
        query.addParam(4, dtoIn.fechaInicio);
        query.addParam(5, dtoIn.fechaFin);
        return await this.dataSource.createQuery(query);
    }

}
