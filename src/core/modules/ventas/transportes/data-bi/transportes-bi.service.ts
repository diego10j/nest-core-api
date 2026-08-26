import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { TopRutasDto } from './dto/top-rutas.dto';
import { TopTransportistasDto } from './dto/top-transportistas.dto';
import { TransportesDiariaDto } from './dto/transportes-diaria.dto';
import { TransportesMensualDto } from './dto/transportes-mensual.dto';

@Injectable()
export class TransportesBiService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
    }

    /**
     * KPIs principales de envíos: total, entregados, % a tiempo, transportistas activos, flete.
     */
    async getKPIsEnvios(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            WITH envios_periodo AS (
                SELECT
                    COUNT(e.ide_cctfa) AS total_envios,
                    COUNT(*) FILTER (WHERE e.fecha_fin_real_cctfa IS NOT NULL) AS envios_entregados,
                    COUNT(*) FILTER (WHERE e.fecha_fin_real_cctfa IS NULL) AS envios_pendientes,
                    COUNT(*) FILTER (
                        WHERE e.fecha_fin_real_cctfa IS NOT NULL AND e.fecha_fin_cctfa IS NOT NULL
                            AND e.fecha_fin_real_cctfa <= e.fecha_fin_cctfa
                    ) AS entregas_a_tiempo,
                    COUNT(*) FILTER (
                        WHERE e.fecha_fin_real_cctfa IS NOT NULL AND e.fecha_fin_cctfa IS NOT NULL
                            AND e.fecha_fin_real_cctfa > e.fecha_fin_cctfa
                    ) AS entregas_retrasadas,
                    COUNT(DISTINCT e.ide_vgtra) FILTER (WHERE e.es_transporte_propio_cctfa = false) AS transportistas_activos,
                    COALESCE(SUM(e.total_flete_real_cctfa), 0) AS total_flete,
                    AVG(EXTRACT(EPOCH FROM (e.fecha_fin_real_cctfa - e.fecha_inicio_cctfa)) / 86400)
                        FILTER (WHERE e.fecha_fin_real_cctfa IS NOT NULL AND e.fecha_inicio_cctfa IS NOT NULL) AS promedio_dias_entrega
                FROM cxc_transporte_factura e
                WHERE e.ide_empr = ${dtoIn.ideEmpr}
                    AND e.fecha_inicio_cctfa BETWEEN $1 AND $2
            ),
            envios_periodo_anterior AS (
                SELECT COUNT(e.ide_cctfa) AS total_envios_anterior
                FROM cxc_transporte_factura e
                WHERE e.ide_empr = ${dtoIn.ideEmpr}
                    AND e.fecha_inicio_cctfa BETWEEN $3 AND $4
            )
            SELECT
                ep.total_envios,
                ep.envios_entregados,
                ep.envios_pendientes,
                ep.entregas_a_tiempo,
                ep.entregas_retrasadas,
                ep.transportistas_activos,
                ep.total_flete,
                COALESCE(ROUND(ep.promedio_dias_entrega::numeric, 1), 0) AS promedio_dias_entrega,
                CASE
                    WHEN ep.envios_entregados > 0
                    THEN ROUND(ep.entregas_a_tiempo::numeric / ep.envios_entregados * 100, 2)
                    ELSE 0
                END AS porcentaje_a_tiempo,
                epa.total_envios_anterior,
                CASE
                    WHEN epa.total_envios_anterior > 0
                    THEN ROUND((ep.total_envios - epa.total_envios_anterior)::numeric / epa.total_envios_anterior * 100, 2)
                    ELSE 0
                END AS crecimiento_envios_porcentual
            FROM envios_periodo ep
            CROSS JOIN envios_periodo_anterior epa
        `);

        const fechaInicio = new Date(dtoIn.fechaInicio);
        const fechaFin = new Date(dtoIn.fechaFin);
        const diffMs = fechaFin.getTime() - fechaInicio.getTime();
        const fechaInicioAnterior = new Date(fechaInicio.getTime() - diffMs - 1000 * 60 * 60 * 24);
        const fechaFinAnterior = new Date(fechaFin.getTime() - diffMs - 1000 * 60 * 60 * 24);

        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        query.addStringParam(3, fechaInicioAnterior.toISOString().split('T')[0]);
        query.addStringParam(4, fechaFinAnterior.toISOString().split('T')[0]);

        return this.dataSource.createQuery(query);
    }

    /**
     * Variación diaria de envíos (últimos N días hábiles).
     */
    async getVariacionDiariaEnvios(dtoIn: TransportesDiariaDto & HeaderParamsDto) {
        const fecha = dtoIn.fecha ? `'${dtoIn.fecha}'::date` : 'CURRENT_DATE';

        const query = new SelectQuery(`
            WITH fechas_laborables AS (
                SELECT fecha::date
                FROM generate_series(${fecha}::date - INTERVAL '30 days', ${fecha}::date, INTERVAL '1 day') AS fecha
                WHERE EXTRACT(DOW FROM fecha) <> 0
                ORDER BY fecha DESC
            ),
            envios_dia AS (
                SELECT
                    e.fecha_inicio_cctfa::date AS fecha,
                    COUNT(e.ide_cctfa) AS num_envios,
                    COUNT(*) FILTER (WHERE e.fecha_fin_real_cctfa IS NOT NULL) AS entregados,
                    COALESCE(SUM(e.total_flete_real_cctfa), 0) AS total_flete
                FROM cxc_transporte_factura e
                WHERE e.ide_empr = ${dtoIn.ideEmpr}
                    AND e.fecha_inicio_cctfa BETWEEN (${fecha}::date - INTERVAL '30 days') AND ${fecha}::date
                GROUP BY e.fecha_inicio_cctfa::date
                HAVING COUNT(e.ide_cctfa) > 0
            )
            SELECT
                ed.fecha,
                ed.num_envios,
                ed.entregados,
                ed.total_flete,
                LAG(ed.num_envios, 1, 0) OVER (ORDER BY ed.fecha) AS envios_anterior
            FROM envios_dia ed
            WHERE ed.fecha IN (SELECT fecha FROM fechas_laborables)
            ORDER BY ed.fecha DESC
            LIMIT ${dtoIn.dias}
        `);
        return this.dataSource.createQuery(query);
    }

    /**
     * Envíos mensuales en un año: volumen, entregados a tiempo y tiempo promedio de entrega.
     */
    async getEnviosMensuales(dtoIn: TransportesMensualDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            WITH envios_mes AS (
                SELECT
                    EXTRACT(MONTH FROM e.fecha_inicio_cctfa) AS mes,
                    COUNT(e.ide_cctfa) AS num_envios,
                    COUNT(*) FILTER (WHERE e.fecha_fin_real_cctfa IS NOT NULL) AS entregados,
                    COUNT(*) FILTER (
                        WHERE e.fecha_fin_real_cctfa IS NOT NULL AND e.fecha_fin_cctfa IS NOT NULL
                            AND e.fecha_fin_real_cctfa <= e.fecha_fin_cctfa
                    ) AS a_tiempo,
                    COALESCE(SUM(e.total_flete_real_cctfa), 0) AS total_flete,
                    AVG(EXTRACT(EPOCH FROM (e.fecha_fin_real_cctfa - e.fecha_inicio_cctfa)) / 86400)
                        FILTER (WHERE e.fecha_fin_real_cctfa IS NOT NULL) AS promedio_dias
                FROM cxc_transporte_factura e
                WHERE e.ide_empr = ${dtoIn.ideEmpr}
                    AND e.fecha_inicio_cctfa BETWEEN $1 AND $2
                GROUP BY EXTRACT(MONTH FROM e.fecha_inicio_cctfa)
            )
            SELECT
                gm.ide_gemes,
                gm.nombre_gemes,
                COALESCE(em.num_envios, 0) AS num_envios,
                COALESCE(em.entregados, 0) AS entregados,
                COALESCE(em.a_tiempo, 0) AS a_tiempo,
                COALESCE(em.total_flete, 0) AS total_flete,
                COALESCE(ROUND(em.promedio_dias::numeric, 1), 0) AS promedio_dias
            FROM gen_mes gm
            LEFT JOIN envios_mes em ON gm.ide_gemes = em.mes
            ORDER BY gm.ide_gemes
        `);
        query.addStringParam(1, `${dtoIn.periodo}-01-01`);
        query.addStringParam(2, `${dtoIn.periodo}-12-31`);
        return this.dataSource.createQuery(query);
    }

    /**
     * Top transportistas por número de envíos en un período.
     */
    async getEnviosPorTransportista(dtoIn: TopTransportistasDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT
                CASE WHEN e.es_transporte_propio_cctfa THEN -2 ELSE COALESCE(t.ide_vgtra, -1) END AS ide_vgtra,
                CASE
                    WHEN e.es_transporte_propio_cctfa THEN 'TRANSPORTE PROPIO'
                    ELSE COALESCE(t.nombre_vgtra, 'SIN ASIGNAR')
                END AS transportista,
                COUNT(e.ide_cctfa) AS num_envios,
                COUNT(*) FILTER (WHERE e.fecha_fin_real_cctfa IS NOT NULL) AS entregados,
                COUNT(*) FILTER (
                    WHERE e.fecha_fin_real_cctfa IS NOT NULL AND e.fecha_fin_cctfa IS NOT NULL
                        AND e.fecha_fin_real_cctfa <= e.fecha_fin_cctfa
                ) AS a_tiempo,
                COALESCE(SUM(e.total_flete_real_cctfa), 0) AS total_flete,
                ROUND(
                    COUNT(*) FILTER (
                        WHERE e.fecha_fin_real_cctfa IS NOT NULL AND e.fecha_fin_cctfa IS NOT NULL
                            AND e.fecha_fin_real_cctfa <= e.fecha_fin_cctfa
                    )::numeric / NULLIF(COUNT(*) FILTER (WHERE e.fecha_fin_real_cctfa IS NOT NULL), 0) * 100,
                2) AS porcentaje_a_tiempo
            FROM cxc_transporte_factura e
            LEFT JOIN ven_transporte t ON e.ide_vgtra = t.ide_vgtra
            WHERE e.ide_empr = ${dtoIn.ideEmpr}
                AND e.fecha_inicio_cctfa BETWEEN $1 AND $2
            GROUP BY 1, 2
            ORDER BY num_envios DESC
            LIMIT ${dtoIn.limit}
            `,
            dtoIn,
        );
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        return this.dataSource.createQuery(query);
    }

    /**
     * Envíos agrupados por estado de envío (con su color configurado).
     */
    async getEnviosPorEstado(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                COALESCE(ee.ide_cceen, -1) AS ide_cceen,
                COALESCE(ee.nombre_cceen, 'SIN ESTADO') AS estado,
                COALESCE(ee.color_cceen, '#9CA3AF') AS color,
                COUNT(e.ide_cctfa) AS num_envios
            FROM cxc_transporte_factura e
            LEFT JOIN cxc_estado_envio ee ON e.ide_cceen = ee.ide_cceen
            WHERE e.ide_empr = ${dtoIn.ideEmpr}
                AND e.fecha_inicio_cctfa BETWEEN $1 AND $2
            GROUP BY COALESCE(ee.ide_cceen, -1), COALESCE(ee.nombre_cceen, 'SIN ESTADO'), COALESCE(ee.color_cceen, '#9CA3AF')
            ORDER BY num_envios DESC
        `);
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        return this.dataSource.createQuery(query);
    }

    /**
     * Top rutas por número de paradas en un período (según fecha de la ruta).
     */
    async getEnviosPorRuta(dtoIn: TopRutasDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT
                r.ide_vgrta,
                r.nombre_vgrta,
                r.fecha_ruta_vgrta,
                ch.nom_geper AS chofer,
                cam.placa_gecam,
                COUNT(d.ide_vgrtd) AS total_paradas,
                COUNT(*) FILTER (WHERE d.realizado_vgrtd = true) AS paradas_completadas,
                ROUND(
                    COUNT(*) FILTER (WHERE d.realizado_vgrtd = true)::numeric / NULLIF(COUNT(d.ide_vgrtd), 0) * 100,
                2) AS porcentaje_completado
            FROM ven_ruta r
            LEFT JOIN ven_ruta_det d ON d.ide_vgrta = r.ide_vgrta
            LEFT JOIN gen_persona ch ON r.ide_geper = ch.ide_geper
            LEFT JOIN gen_camion cam ON r.ide_gecam = cam.placa_gecam
            WHERE r.ide_empr = ${dtoIn.ideEmpr}
                AND r.fecha_ruta_vgrta BETWEEN $1 AND $2
            GROUP BY r.ide_vgrta, r.nombre_vgrta, r.fecha_ruta_vgrta, ch.nom_geper, cam.placa_gecam
            ORDER BY total_paradas DESC
            LIMIT ${dtoIn.limit}
            `,
            dtoIn,
        );
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        return this.dataSource.createQuery(query);
    }

    /**
     * Resumen anual de envíos (para comparar períodos completos).
     */
    async getResumenEnviosPeriodos(dtoIn: HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                EXTRACT(YEAR FROM e.fecha_inicio_cctfa) AS anio,
                COUNT(e.ide_cctfa) AS total_envios,
                COUNT(*) FILTER (WHERE e.fecha_fin_real_cctfa IS NOT NULL) AS entregados,
                COUNT(*) FILTER (
                    WHERE e.fecha_fin_real_cctfa IS NOT NULL AND e.fecha_fin_cctfa IS NOT NULL
                        AND e.fecha_fin_real_cctfa <= e.fecha_fin_cctfa
                ) AS a_tiempo,
                COALESCE(SUM(e.total_flete_real_cctfa), 0) AS total_flete,
                COUNT(DISTINCT e.ide_vgtra) FILTER (WHERE e.es_transporte_propio_cctfa = false) AS transportistas_activos,
                ROUND(
                    COUNT(*) FILTER (
                        WHERE e.fecha_fin_real_cctfa IS NOT NULL AND e.fecha_fin_cctfa IS NOT NULL
                            AND e.fecha_fin_real_cctfa <= e.fecha_fin_cctfa
                    )::numeric / NULLIF(COUNT(*) FILTER (WHERE e.fecha_fin_real_cctfa IS NOT NULL), 0) * 100,
                2) AS porcentaje_a_tiempo
            FROM cxc_transporte_factura e
            WHERE e.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY EXTRACT(YEAR FROM e.fecha_inicio_cctfa)
            ORDER BY anio DESC
        `);
        return this.dataSource.createQuery(query);
    }
}
