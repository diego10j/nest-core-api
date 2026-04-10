import { Injectable } from '@nestjs/common';

import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

import { IdOrdenPagoDto } from './dto/id-orden-pago.dto';

@Injectable()
export class CuentasPorPagarOrdenService extends BaseService {
    constructor(private readonly dataSource: DataSourceService) {
        super();
    }

    /**
     * Listado de órdenes de pago en un rango de fechas.
     * Incluye estado, usuario responsable y totales calculados del detalle.
     */
    async getOrdenesPago(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                cab.ide_cpcop,
                cab.secuencial_cpcop,
                cab.ide_cpeo,
                est.nombre_cpeo                              AS estado,
                est.color_cpeo,
                cab.fecha_genera_cpcop,
                cab.fecha_pago_cpcop,
                cab.fecha_efectiva_pago_cpcop,
                cab.referencia_cpcop,
                cab.activo_cpcop,
                u.nom_usua                                   AS nombre_usuario,
                COUNT(det.ide_cpcdop)                        AS num_facturas,
                COALESCE(SUM(det.valor_pagado_cpcdop), 0)    AS total_pagado,
                COALESCE(SUM(det.valor_pagado_banco_cpcdop), 0) AS total_pagado_banco,
                COALESCE(SUM(det.saldo_pendiente_cpcdop), 0) AS total_saldo_pendiente,
                cab.usuario_ingre,
                cab.hora_ingre
            FROM cxp_cab_orden_pago cab
            JOIN cxp_estado_orden est        ON est.ide_cpeo = cab.ide_cpeo
            LEFT JOIN sis_usuario u           ON u.ide_usua  = cab.ide_usua
            LEFT JOIN cxp_det_orden_pago det  ON det.ide_cpcop = cab.ide_cpcop
            WHERE cab.fecha_genera_cpcop BETWEEN $1 AND $2
              AND cab.ide_empr = ${dtoIn.ideEmpr}
                AND cab.ide_sucu = ${dtoIn.ideSucu}
            GROUP BY
                cab.ide_cpcop,
                cab.secuencial_cpcop,
                cab.ide_cpeo,
                est.nombre_cpeo,
                est.color_cpeo,
                cab.fecha_genera_cpcop,
                cab.fecha_pago_cpcop,
                cab.fecha_efectiva_pago_cpcop,
                cab.referencia_cpcop,
                cab.activo_cpcop,
                u.nom_usua,
                cab.usuario_ingre,
                cab.hora_ingre
            ORDER BY cab.fecha_genera_cpcop DESC, cab.ide_cpcop DESC
        `);
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        return this.dataSource.createQuery(query);
    }

    /**
     * Retorna la cabecera y detalles completos de una orden de pago.
     * Los detalles incluyen datos del proveedor, transacción, banco y tipo de transacción bancaria.
     */
    async getOrdenPagoById(dtoIn: IdOrdenPagoDto & HeaderParamsDto) {
        // Cabecera
        const cabQuery = new SelectQuery(`
            SELECT
                cab.ide_cpcop,
                cab.secuencial_cpcop,
                cab.ide_cpeo,
                est.nombre_cpeo                 AS estado,
                est.color_cpeo,
                cab.fecha_genera_cpcop,
                cab.fecha_pago_cpcop,
                cab.fecha_efectiva_pago_cpcop,
                cab.referencia_cpcop,
                cab.activo_cpcop,
                cab.ide_usua,
                u.nom_usua                      AS nombre_usuario,
                cab.ide_empr,
                cab.ide_sucu,
                cab.usuario_ingre,
                cab.hora_ingre,
                cab.usuario_actua,
                cab.hora_actua
            FROM cxp_cab_orden_pago cab
            JOIN cxp_estado_orden est    ON est.ide_cpeo = cab.ide_cpeo
            LEFT JOIN sis_usuario u      ON u.ide_usua   = cab.ide_usua
            WHERE cab.ide_cpcop = $1
              AND cab.ide_empr  = ${dtoIn.ideEmpr}
              AND cab.ide_sucu  = ${dtoIn.ideSucu}
        `);
        cabQuery.addIntParam(1, dtoIn.ide_cpcop);
        const cabecera = await this.dataSource.createSingleQuery(cabQuery);

        // Detalles
        const detQuery = new SelectQuery(`
            SELECT
                det.ide_cpcdop,
                det.ide_cpcop,
                det.ide_cpctr,
                det.ide_cpeo,
                est.nombre_cpeo                     AS estado_detalle,
                est.color_cpeo                      AS color_detalle,
                -- Datos de la transacción y factura
                ct.ide_cpcfa,
                cf.numero_cpcfa,
                cf.fecha_emisi_cpcfa,
                cf.total_cpcfa,
                cf.dias_credito_cpcfa,
                (cf.fecha_emisi_cpcfa + cf.dias_credito_cpcfa * INTERVAL '1 day')::date AS fecha_vence,
                -- Proveedor
                ct.ide_geper,
                p.nom_geper                         AS nombre_proveedor,
                p.identificac_geper,
                -- Campos de pago
                det.fecha_pago_cpcdop,
                det.num_comprobante_cpcdop,
                det.valor_pagado_cpcdop,
                det.saldo_pendiente_cpcdop,
                det.documento_referencia_cpcdop,
                det.notifica_cpcdop,
                det.activo_cpcdop,
                det.valor_pagado_banco_cpcdop,
                det.fecha_cheque_cpcdop,
                -- Banco
                det.ide_tecba,
                b.nombre_teban                        AS nombre_banco,
                ban.nombre_tecba                    AS cuenta_banco,
                det.ide_tettb,
                ttb.nombre_tettb                    AS tipo_transaccion_banco,
                det.observacion_cpcdop,
                det.foto_cpcdop,
                det.usuario_ingre,
                det.hora_ingre,
                det.usuario_actua,
                det.hora_actua
            FROM cxp_det_orden_pago det
            JOIN cxp_estado_orden        est  ON est.ide_cpeo  = det.ide_cpeo
            JOIN cxp_cabece_transa        ct  ON ct.ide_cpctr  = det.ide_cpctr
            LEFT JOIN cxp_cabece_factur   cf  ON cf.ide_cpcfa  = ct.ide_cpcfa
            LEFT JOIN gen_persona          p  ON p.ide_geper   = ct.ide_geper
            LEFT JOIN tes_cuenta_banco   ban  ON ban.ide_tecba = det.ide_tecba
            LEFT JOIN tes_tip_tran_banc  ttb  ON ttb.ide_tettb = det.ide_tettb
            LEFT JOIN tes_banco             b   ON b.ide_teban   = ban.ide_teban
            WHERE det.ide_cpcop = $1
            ORDER BY det.ide_cpcdop
        `);
        detQuery.addIntParam(1, dtoIn.ide_cpcop);
        const detalles = await this.dataSource.createSelectQuery(detQuery);
        return { cabecera, detalles };
    }

    /**
     * Métricas de órdenes de pago para dashboard.
     * Retorna 4 conjuntos de datos:
     *   1. resumen_general   — totales del período
     *   2. pagos_por_semana  — desglose semanal dentro de cada mes (para tabla semanas)
     *   3. pagos_por_mes     — total pagado por mes (para gráfico de barras)
     *   4. distribucion_estado — conteo y monto por estado de orden
     */
    async getResumenOrdenesPago(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const [resumen_general, pagos_por_semana, pagos_por_mes, distribucion_estado] = await Promise.all([
            this.getResumenGeneral(dtoIn),
            this.getPagosPorSemana(dtoIn),
            this.getPagosPorMes(dtoIn),
            this.getDistribucionEstado(dtoIn),
        ]);

        return {
            resumen_general,
            pagos_por_semana,
            pagos_por_mes,
            distribucion_estado,
        };
    }

    // ─── PRIVADOS (sub-queries de resumenOrdenesPago) ─────────────────────────

    private async getResumenGeneral(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                COUNT(DISTINCT cab.ide_cpcop)                        AS total_ordenes,
                COUNT(DISTINCT CASE WHEN cab.activo_cpcop = true THEN cab.ide_cpcop END) AS ordenes_activas,
                COALESCE(SUM(det.valor_pagado_cpcdop), 0)            AS total_pagado,
                COALESCE(SUM(det.valor_pagado_banco_cpcdop), 0)      AS total_pagado_banco,
                COALESCE(SUM(det.saldo_pendiente_cpcdop), 0)         AS total_saldo_pendiente,
                COUNT(det.ide_cpcdop)                                AS total_facturas_incluidas,
                MIN(cab.fecha_genera_cpcop)                          AS primera_orden,
                MAX(cab.fecha_genera_cpcop)                          AS ultima_orden
            FROM cxp_cab_orden_pago cab
            LEFT JOIN cxp_det_orden_pago det ON det.ide_cpcop = cab.ide_cpcop
            WHERE cab.fecha_genera_cpcop BETWEEN $1 AND $2
              AND cab.ide_empr = ${dtoIn.ideEmpr}
                AND cab.ide_sucu = ${dtoIn.ideSucu}
        `);
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        return this.dataSource.createSingleQuery(query);
    }

    /**
     * Desglose semanal dentro de cada mes.
     * La semana del mes se calcula como CEIL(día / 7) → valores 1 a 5.
     * Se usa fecha_efectiva_pago_cpcop para reflejar el pago real.
     */
    private async getPagosPorSemana(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            WITH pagos AS (
                SELECT
                    EXTRACT(YEAR  FROM cab.fecha_efectiva_pago_cpcop)::int              AS anio,
                    EXTRACT(MONTH FROM cab.fecha_efectiva_pago_cpcop)::int              AS mes,
                    gm.nombre_gemes,
                    CEIL(EXTRACT(DAY FROM cab.fecha_efectiva_pago_cpcop) / 7.0)::int    AS semana_del_mes,
                    DATE_TRUNC('week', cab.fecha_efectiva_pago_cpcop)::date              AS semana_inicio,
                    COUNT(DISTINCT cab.ide_cpcop)                                        AS num_ordenes,
                    COALESCE(SUM(det.valor_pagado_cpcdop), 0)                           AS total_pagado
                FROM cxp_cab_orden_pago cab
                LEFT JOIN cxp_det_orden_pago det ON det.ide_cpcop = cab.ide_cpcop
                JOIN gen_mes gm
                    ON gm.ide_gemes = EXTRACT(MONTH FROM cab.fecha_efectiva_pago_cpcop)::int
                WHERE cab.fecha_efectiva_pago_cpcop BETWEEN $1 AND $2
                  AND cab.ide_empr = ${dtoIn.ideEmpr}
                  AND cab.ide_sucu = ${dtoIn.ideSucu}
                GROUP BY
                    anio, mes, gm.nombre_gemes,
                    semana_del_mes, semana_inicio
            )
            SELECT
                anio,
                mes,
                nombre_gemes,
                semana_del_mes,
                semana_inicio,
                num_ordenes,
                total_pagado
            FROM pagos
            ORDER BY anio, mes, semana_del_mes
        `);
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Total pagado por mes en el rango — datos para gráfico de barras.
     */
    private async getPagosPorMes(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                gm.ide_gemes,
                gm.nombre_gemes,
                EXTRACT(YEAR FROM cab.fecha_efectiva_pago_cpcop)::int       AS anio,
                COUNT(DISTINCT cab.ide_cpcop)                                AS num_ordenes,
                COALESCE(SUM(det.valor_pagado_cpcdop), 0)                   AS total_pagado,
                COALESCE(SUM(det.valor_pagado_banco_cpcdop), 0)             AS total_pagado_banco,
                COALESCE(SUM(det.saldo_pendiente_cpcdop), 0)                AS total_saldo_pendiente
            FROM cxp_cab_orden_pago cab
            LEFT JOIN cxp_det_orden_pago det ON det.ide_cpcop = cab.ide_cpcop
            JOIN gen_mes gm
                ON gm.ide_gemes = EXTRACT(MONTH FROM cab.fecha_efectiva_pago_cpcop)::int
            WHERE cab.fecha_efectiva_pago_cpcop BETWEEN $1 AND $2
              AND cab.ide_empr = ${dtoIn.ideEmpr}
              AND cab.ide_sucu = ${dtoIn.ideSucu}
            GROUP BY
                gm.ide_gemes, gm.nombre_gemes,
                EXTRACT(YEAR FROM cab.fecha_efectiva_pago_cpcop)::int
            ORDER BY anio, gm.ide_gemes
        `);
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Distribución de órdenes y montos por estado.
     */
    private async getDistribucionEstado(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                est.ide_cpeo,
                est.nombre_cpeo         AS estado,
                est.color_cpeo,
                COUNT(DISTINCT cab.ide_cpcop)                        AS num_ordenes,
                COALESCE(SUM(det.valor_pagado_cpcdop), 0)            AS total_pagado
            FROM cxp_cab_orden_pago cab
            JOIN cxp_estado_orden est         ON est.ide_cpeo = cab.ide_cpeo
            LEFT JOIN cxp_det_orden_pago det  ON det.ide_cpcop = cab.ide_cpcop
            WHERE cab.fecha_genera_cpcop BETWEEN $1 AND $2
              AND cab.ide_empr = ${dtoIn.ideEmpr}
              AND cab.ide_sucu = ${dtoIn.ideSucu}
            GROUP BY est.ide_cpeo, est.nombre_cpeo, est.color_cpeo
            ORDER BY total_pagado DESC
        `);
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Genera el próximo secuencial de orden de pago en formato 00000001.
     * Solo debe llamarse en la creación de una orden nueva; no se actualiza.
     */
    async getSecuencialOrden(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT LPAD(
                (COALESCE(MAX(secuencial_cpcop::int), 0) + 1)::text,
                8, '0'
            ) AS secuencial
            FROM cxp_cab_orden_pago
            WHERE ide_empr = ${dtoIn.ideEmpr}
            AND ide_sucu = ${dtoIn.ideSucu}
        `);
        const result = await this.dataSource.createSingleQuery(query);
        return { secuencial: result?.secuencial ?? '00000001' };
    }
}
