import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { isDefined } from 'src/util/helpers/common-util';

import { RangoFechasSucursalDto } from './dto/rango-fechas-sucursal.dto';
import { TesoreriaDiariaDto } from './dto/tesoreria-diaria.dto';
import { TesoreriaMensualDto } from './dto/tesoreria-mensual.dto';
import { TopCuentasTesoreriaDto } from './dto/top-cuentas-tesoreria.dto';

@Injectable()
export class TesoreriaBiService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        this.core
            .getVariables(['p_tes_estado_lib_banco_normal'])
            .then((result) => {
                this.variables = result;
            });
    }

    private whereSucursalCuenta(ide_sucu?: number[]) {
        return isDefined(ide_sucu)
            ? `AND cb.ide_sucu = ANY (ARRAY[${Array.isArray(ide_sucu) ? ide_sucu.join(',') : ide_sucu}]::INT[])`
            : '';
    }

    /**
     * KPIs principales de tesorería: ingresos, egresos, flujo neto, saldo actual, crecimiento.
     */
    async getKPIsTesoreria(dtoIn: RangoFechasSucursalDto & HeaderParamsDto) {
        const whereSucursal = this.whereSucursalCuenta(dtoIn.ide_sucu);
        const estadoNormal = this.variables.get('p_tes_estado_lib_banco_normal');

        const query = new SelectQuery(`
            WITH periodo AS (
                SELECT
                    COUNT(l.ide_teclb) AS num_transacciones,
                    COUNT(*) FILTER (WHERE t.signo_tettb = 1) AS num_ingresos,
                    COUNT(*) FILTER (WHERE t.signo_tettb = -1) AS num_egresos,
                    COALESCE(SUM(l.valor_teclb) FILTER (WHERE t.signo_tettb = 1), 0) AS total_ingresos,
                    COALESCE(SUM(l.valor_teclb) FILTER (WHERE t.signo_tettb = -1), 0) AS total_egresos,
                    COUNT(DISTINCT l.ide_tecba) AS cuentas_activas
                FROM tes_cab_libr_banc l
                INNER JOIN tes_tip_tran_banc t ON l.ide_tettb = t.ide_tettb
                INNER JOIN tes_cuenta_banco cb ON l.ide_tecba = cb.ide_tecba
                WHERE l.ide_teelb = ${estadoNormal}
                    AND cb.ide_empr = ${dtoIn.ideEmpr}
                    ${whereSucursal}
                    AND l.fecha_trans_teclb BETWEEN $1 AND $2
            ),
            periodo_anterior AS (
                SELECT
                    COALESCE(SUM(l.valor_teclb) FILTER (WHERE t.signo_tettb = 1), 0) AS total_ingresos_anterior,
                    COALESCE(SUM(l.valor_teclb) FILTER (WHERE t.signo_tettb = -1), 0) AS total_egresos_anterior
                FROM tes_cab_libr_banc l
                INNER JOIN tes_tip_tran_banc t ON l.ide_tettb = t.ide_tettb
                INNER JOIN tes_cuenta_banco cb ON l.ide_tecba = cb.ide_tecba
                WHERE l.ide_teelb = ${estadoNormal}
                    AND cb.ide_empr = ${dtoIn.ideEmpr}
                    ${whereSucursal}
                    AND l.fecha_trans_teclb BETWEEN $3 AND $4
            ),
            saldo AS (
                SELECT COALESCE(SUM(l.valor_teclb * t.signo_tettb), 0) AS saldo_actual
                FROM tes_cab_libr_banc l
                INNER JOIN tes_tip_tran_banc t ON l.ide_tettb = t.ide_tettb
                INNER JOIN tes_cuenta_banco cb ON l.ide_tecba = cb.ide_tecba
                WHERE l.ide_teelb = ${estadoNormal}
                    AND cb.ide_empr = ${dtoIn.ideEmpr}
                    ${whereSucursal}
                    AND l.fecha_trans_teclb <= $5
            )
            SELECT
                p.num_transacciones,
                p.num_ingresos,
                p.num_egresos,
                p.total_ingresos,
                p.total_egresos,
                (p.total_ingresos - p.total_egresos) AS flujo_neto,
                p.cuentas_activas,
                s.saldo_actual,
                pa.total_ingresos_anterior,
                pa.total_egresos_anterior,
                CASE
                    WHEN pa.total_ingresos_anterior > 0
                    THEN ROUND((p.total_ingresos - pa.total_ingresos_anterior) / pa.total_ingresos_anterior * 100, 2)
                    ELSE 0
                END AS crecimiento_ingresos_porcentual,
                CASE
                    WHEN p.num_ingresos > 0
                    THEN ROUND(p.total_ingresos / p.num_ingresos, 2)
                    ELSE 0
                END AS promedio_ingreso,
                CASE
                    WHEN p.num_egresos > 0
                    THEN ROUND(p.total_egresos / p.num_egresos, 2)
                    ELSE 0
                END AS promedio_egreso
            FROM periodo p
            CROSS JOIN periodo_anterior pa
            CROSS JOIN saldo s
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
        query.addStringParam(5, dtoIn.fechaFin);

        return this.dataSource.createQuery(query);
    }

    /**
     * Variación diaria de flujo de tesorería (últimos N días hábiles).
     */
    async getVariacionDiariaTesoreria(dtoIn: TesoreriaDiariaDto & HeaderParamsDto) {
        const fecha = dtoIn.fecha ? `'${dtoIn.fecha}'::date` : 'CURRENT_DATE';
        const whereSucursal = this.whereSucursalCuenta(dtoIn.ide_sucu);
        const estadoNormal = this.variables.get('p_tes_estado_lib_banco_normal');

        const query = new SelectQuery(`
            WITH fechas_laborables AS (
                SELECT fecha::date
                FROM generate_series(${fecha}::date - INTERVAL '30 days', ${fecha}::date, INTERVAL '1 day') AS fecha
                WHERE EXTRACT(DOW FROM fecha) <> 0
                ORDER BY fecha DESC
            ),
            movimientos_dia AS (
                SELECT
                    l.fecha_trans_teclb AS fecha,
                    COALESCE(SUM(l.valor_teclb) FILTER (WHERE t.signo_tettb = 1), 0) AS ingresos,
                    COALESCE(SUM(l.valor_teclb) FILTER (WHERE t.signo_tettb = -1), 0) AS egresos,
                    COUNT(l.ide_teclb) AS num_transacciones
                FROM tes_cab_libr_banc l
                INNER JOIN tes_tip_tran_banc t ON l.ide_tettb = t.ide_tettb
                INNER JOIN tes_cuenta_banco cb ON l.ide_tecba = cb.ide_tecba
                WHERE l.ide_teelb = ${estadoNormal}
                    AND cb.ide_empr = ${dtoIn.ideEmpr}
                    ${whereSucursal}
                    AND l.fecha_trans_teclb BETWEEN (${fecha}::date - INTERVAL '30 days') AND ${fecha}::date
                GROUP BY l.fecha_trans_teclb
                HAVING COUNT(l.ide_teclb) > 0
            )
            SELECT
                md.fecha,
                md.ingresos,
                md.egresos,
                (md.ingresos - md.egresos) AS flujo_neto,
                md.num_transacciones,
                LAG(md.ingresos - md.egresos, 1, 0) OVER (ORDER BY md.fecha) AS flujo_anterior
            FROM movimientos_dia md
            WHERE md.fecha IN (SELECT fecha FROM fechas_laborables)
            ORDER BY md.fecha DESC
            LIMIT ${dtoIn.dias}
        `);
        return this.dataSource.createQuery(query);
    }

    /**
     * Flujo de tesorería mensual (ingresos/egresos) en un año completo.
     */
    async getFlujoMensualTesoreria(dtoIn: TesoreriaMensualDto & HeaderParamsDto) {
        const whereSucursal = this.whereSucursalCuenta(dtoIn.ide_sucu);
        const estadoNormal = this.variables.get('p_tes_estado_lib_banco_normal');

        const query = new SelectQuery(`
            WITH movimientos_mes AS (
                SELECT
                    EXTRACT(MONTH FROM l.fecha_trans_teclb) AS mes,
                    COALESCE(SUM(l.valor_teclb) FILTER (WHERE t.signo_tettb = 1), 0) AS ingresos,
                    COALESCE(SUM(l.valor_teclb) FILTER (WHERE t.signo_tettb = -1), 0) AS egresos,
                    COUNT(l.ide_teclb) AS num_transacciones
                FROM tes_cab_libr_banc l
                INNER JOIN tes_tip_tran_banc t ON l.ide_tettb = t.ide_tettb
                INNER JOIN tes_cuenta_banco cb ON l.ide_tecba = cb.ide_tecba
                WHERE l.ide_teelb = ${estadoNormal}
                    AND cb.ide_empr = ${dtoIn.ideEmpr}
                    ${whereSucursal}
                    AND l.fecha_trans_teclb BETWEEN $1 AND $2
                GROUP BY EXTRACT(MONTH FROM l.fecha_trans_teclb)
            )
            SELECT
                gm.ide_gemes,
                gm.nombre_gemes,
                COALESCE(mm.ingresos, 0) AS ingresos,
                COALESCE(mm.egresos, 0) AS egresos,
                COALESCE(mm.ingresos, 0) - COALESCE(mm.egresos, 0) AS flujo_neto,
                COALESCE(mm.num_transacciones, 0) AS num_transacciones
            FROM gen_mes gm
            LEFT JOIN movimientos_mes mm ON gm.ide_gemes = mm.mes
            ORDER BY gm.ide_gemes
        `);
        query.addStringParam(1, `${dtoIn.periodo}-01-01`);
        query.addStringParam(2, `${dtoIn.periodo}-12-31`);
        return this.dataSource.createQuery(query);
    }

    private async getMovimientosMensualesPorTipo(
        dtoIn: TesoreriaMensualDto & HeaderParamsDto,
        esCaja: boolean,
        esTarjeta: boolean,
    ) {
        const whereSucursal = this.whereSucursalCuenta(dtoIn.ide_sucu);
        const estadoNormal = this.variables.get('p_tes_estado_lib_banco_normal');

        const query = new SelectQuery(`
            WITH cuentas AS (
                SELECT b.ide_teban, b.nombre_teban, b.color_teban
                FROM tes_banco b
                WHERE b.ide_empr = ${dtoIn.ideEmpr}
                    AND b.es_caja_teban = ${esCaja}
                    AND b.es_tarjeta_teban = ${esTarjeta}
            ),
            movimientos AS (
                SELECT
                    b.ide_teban,
                    EXTRACT(MONTH FROM l.fecha_trans_teclb) AS mes,
                    COALESCE(SUM(l.valor_teclb) FILTER (WHERE t.signo_tettb = 1), 0) AS ingresos,
                    COALESCE(SUM(l.valor_teclb) FILTER (WHERE t.signo_tettb = -1), 0) AS egresos,
                    COUNT(l.ide_teclb) AS num_transacciones
                FROM tes_cab_libr_banc l
                INNER JOIN tes_tip_tran_banc t ON l.ide_tettb = t.ide_tettb
                INNER JOIN tes_cuenta_banco cb ON l.ide_tecba = cb.ide_tecba
                INNER JOIN tes_banco b ON cb.ide_teban = b.ide_teban
                WHERE l.ide_teelb = ${estadoNormal}
                    AND cb.ide_empr = ${dtoIn.ideEmpr}
                    ${whereSucursal}
                    AND b.es_caja_teban = ${esCaja}
                    AND b.es_tarjeta_teban = ${esTarjeta}
                    AND l.fecha_trans_teclb BETWEEN $1 AND $2
                GROUP BY b.ide_teban, EXTRACT(MONTH FROM l.fecha_trans_teclb)
            )
            SELECT
                gm.ide_gemes AS mes,
                gm.nombre_gemes,
                c.ide_teban,
                c.nombre_teban,
                c.color_teban,
                COALESCE(m.ingresos, 0) AS ingresos,
                COALESCE(m.egresos, 0) AS egresos,
                COALESCE(m.num_transacciones, 0) AS num_transacciones
            FROM gen_mes gm
            CROSS JOIN cuentas c
            LEFT JOIN movimientos m ON m.ide_teban = c.ide_teban AND m.mes = gm.ide_gemes
            ORDER BY c.nombre_teban, gm.ide_gemes
        `);
        query.addStringParam(1, `${dtoIn.periodo}-01-01`);
        query.addStringParam(2, `${dtoIn.periodo}-12-31`);
        return this.dataSource.createQuery(query);
    }

    /**
     * Ingresos/egresos mensuales agrupados por banco (excluye cajas y tarjetas).
     */
    async getIngresosMensualesPorBanco(dtoIn: TesoreriaMensualDto & HeaderParamsDto) {
        return this.getMovimientosMensualesPorTipo(dtoIn, false, false);
    }

    /**
     * Ingresos/egresos mensuales agrupados por caja.
     */
    async getIngresosMensualesPorCaja(dtoIn: TesoreriaMensualDto & HeaderParamsDto) {
        return this.getMovimientosMensualesPorTipo(dtoIn, true, false);
    }

    /**
     * Ingresos/egresos mensuales agrupados por cuenta de tarjeta.
     */
    async getIngresosMensualesPorTarjeta(dtoIn: TesoreriaMensualDto & HeaderParamsDto) {
        return this.getMovimientosMensualesPorTipo(dtoIn, false, true);
    }

    /**
     * Top cuentas (banco/caja/tarjeta) por monto movilizado en un período.
     */
    async getTopCuentas(dtoIn: TopCuentasTesoreriaDto & HeaderParamsDto) {
        const whereSucursal = this.whereSucursalCuenta(dtoIn.ide_sucu);
        const estadoNormal = this.variables.get('p_tes_estado_lib_banco_normal');

        const query = new SelectQuery(
            `
            SELECT
                cb.ide_tecba,
                cb.nombre_tecba,
                b.ide_teban,
                b.nombre_teban,
                b.color_teban,
                CASE
                    WHEN b.es_caja_teban THEN 'CAJA'
                    WHEN b.es_tarjeta_teban THEN 'TARJETA'
                    ELSE 'BANCO'
                END AS tipo_cuenta,
                COUNT(l.ide_teclb) AS num_transacciones,
                COALESCE(SUM(l.valor_teclb) FILTER (WHERE t.signo_tettb = 1), 0) AS total_ingresos,
                COALESCE(SUM(l.valor_teclb) FILTER (WHERE t.signo_tettb = -1), 0) AS total_egresos,
                ROUND(COALESCE(SUM(l.valor_teclb) FILTER (WHERE t.signo_tettb = 1), 0) * 100.0 /
                    NULLIF((
                        SELECT SUM(l2.valor_teclb)
                        FROM tes_cab_libr_banc l2
                        INNER JOIN tes_tip_tran_banc t2 ON l2.ide_tettb = t2.ide_tettb
                        INNER JOIN tes_cuenta_banco cb2 ON l2.ide_tecba = cb2.ide_tecba
                        WHERE l2.ide_teelb = ${estadoNormal}
                            AND cb2.ide_empr = ${dtoIn.ideEmpr}
                            ${whereSucursal.replace(/cb\./g, 'cb2.')}
                            AND t2.signo_tettb = 1
                            AND l2.fecha_trans_teclb BETWEEN $1 AND $2
                    ), 0), 2) AS porcentaje
            FROM tes_cab_libr_banc l
            INNER JOIN tes_tip_tran_banc t ON l.ide_tettb = t.ide_tettb
            INNER JOIN tes_cuenta_banco cb ON l.ide_tecba = cb.ide_tecba
            INNER JOIN tes_banco b ON cb.ide_teban = b.ide_teban
            WHERE l.ide_teelb = ${estadoNormal}
                AND cb.ide_empr = ${dtoIn.ideEmpr}
                ${whereSucursal}
                AND l.fecha_trans_teclb BETWEEN $3 AND $4
            GROUP BY cb.ide_tecba, cb.nombre_tecba, b.ide_teban, b.nombre_teban, b.color_teban,
                b.es_caja_teban, b.es_tarjeta_teban
            ORDER BY total_ingresos DESC
            LIMIT ${dtoIn.limit}
            `,
            dtoIn,
        );
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        query.addStringParam(3, dtoIn.fechaInicio);
        query.addStringParam(4, dtoIn.fechaFin);
        return this.dataSource.createQuery(query);
    }

    /**
     * Distribución de movimientos por tipo de cuenta (Banco / Caja / Tarjeta).
     */
    async getDistribucionPorTipoCuenta(dtoIn: RangoFechasSucursalDto & HeaderParamsDto) {
        const whereSucursal = this.whereSucursalCuenta(dtoIn.ide_sucu);
        const estadoNormal = this.variables.get('p_tes_estado_lib_banco_normal');

        const query = new SelectQuery(`
            SELECT
                CASE
                    WHEN b.es_caja_teban THEN 'Caja'
                    WHEN b.es_tarjeta_teban THEN 'Tarjeta'
                    ELSE 'Banco'
                END AS tipo,
                COUNT(l.ide_teclb) AS num_transacciones,
                COALESCE(SUM(l.valor_teclb) FILTER (WHERE t.signo_tettb = 1), 0) AS total_ingresos,
                COALESCE(SUM(l.valor_teclb) FILTER (WHERE t.signo_tettb = -1), 0) AS total_egresos
            FROM tes_cab_libr_banc l
            INNER JOIN tes_tip_tran_banc t ON l.ide_tettb = t.ide_tettb
            INNER JOIN tes_cuenta_banco cb ON l.ide_tecba = cb.ide_tecba
            INNER JOIN tes_banco b ON cb.ide_teban = b.ide_teban
            WHERE l.ide_teelb = ${estadoNormal}
                AND cb.ide_empr = ${dtoIn.ideEmpr}
                ${whereSucursal}
                AND l.fecha_trans_teclb BETWEEN $1 AND $2
            GROUP BY CASE
                WHEN b.es_caja_teban THEN 'Caja'
                WHEN b.es_tarjeta_teban THEN 'Tarjeta'
                ELSE 'Banco'
            END
            ORDER BY total_ingresos DESC
        `);
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        return this.dataSource.createQuery(query);
    }

    /**
     * Resumen anual de tesorería (para comparar períodos completos).
     */
    async getResumenTesoreriaPeriodos(dtoIn: HeaderParamsDto) {
        const estadoNormal = this.variables.get('p_tes_estado_lib_banco_normal');

        const query = new SelectQuery(`
            SELECT
                EXTRACT(YEAR FROM l.fecha_trans_teclb) AS anio,
                COUNT(l.ide_teclb) AS num_transacciones,
                COALESCE(SUM(l.valor_teclb) FILTER (WHERE t.signo_tettb = 1), 0) AS total_ingresos,
                COALESCE(SUM(l.valor_teclb) FILTER (WHERE t.signo_tettb = -1), 0) AS total_egresos,
                COALESCE(SUM(l.valor_teclb) FILTER (WHERE t.signo_tettb = 1), 0) -
                    COALESCE(SUM(l.valor_teclb) FILTER (WHERE t.signo_tettb = -1), 0) AS flujo_neto,
                COUNT(DISTINCT l.ide_tecba) AS cuentas_activas
            FROM tes_cab_libr_banc l
            INNER JOIN tes_tip_tran_banc t ON l.ide_tettb = t.ide_tettb
            INNER JOIN tes_cuenta_banco cb ON l.ide_tecba = cb.ide_tecba
            WHERE l.ide_teelb = ${estadoNormal}
                AND cb.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY EXTRACT(YEAR FROM l.fecha_trans_teclb)
            ORDER BY anio DESC
        `);
        return this.dataSource.createQuery(query);
    }
}
