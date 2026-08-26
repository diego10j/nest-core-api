import { Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';
import { CoreService } from 'src/core/core.service';
import { isDefined } from 'src/util/helpers/common-util';

import { BaseService } from '../../../../common/base-service';
import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery } from '../../../connection/helpers/select-query';

import { ComparativoVentasComprasDto } from './dto/comparativo-ventas-compras.dto';
import { ComprasDiariasDto } from './dto/compras-diarias.dto';
import { ComprasMensualesDto } from './dto/compras-mensuales.dto';
import { TopProveedoresDto } from './dto/top-proveedores.dto';

@Injectable()
export class ComprasBiService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        this.core
            .getVariables([
                'p_cxp_estado_factura_normal',
                'p_cxc_estado_factura_normal',
                'p_con_tipo_documento_factura',
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    /**
     * KPIs principales de compras (total, ticket promedio, proveedores activos, IVA pagado, crecimiento).
     */
    async getKPIsCompras(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            WITH compras_periodo AS (
                SELECT
                    COUNT(ide_cpcfa) AS total_facturas,
                    SUM(total_cpcfa) AS compras_brutas,
                    SUM(base_grabada_cpcfa + base_tarifa0_cpcfa + base_no_objeto_iva_cpcfa) AS compras_base,
                    SUM(valor_iva_cpcfa) AS iva_pagado,
                    COUNT(DISTINCT ide_geper) AS proveedores_activos
                FROM cxp_cabece_factur
                WHERE fecha_emisi_cpcfa BETWEEN $1 AND $2
                    AND ide_cpefa = ${this.variables.get('p_cxp_estado_factura_normal')}
                    AND ide_cntdo = ${this.variables.get('p_con_tipo_documento_factura')}
                    AND ide_rem_cpcfa IS NULL
                    AND ide_empr = ${dtoIn.ideEmpr}
            ),
            compras_periodo_anterior AS (
                SELECT
                    SUM(total_cpcfa) AS compras_brutas_anterior,
                    COUNT(ide_cpcfa) AS total_facturas_anterior
                FROM cxp_cabece_factur
                WHERE fecha_emisi_cpcfa BETWEEN $3 AND $4
                    AND ide_cpefa = ${this.variables.get('p_cxp_estado_factura_normal')}
                    AND ide_cntdo = ${this.variables.get('p_con_tipo_documento_factura')}
                    AND ide_rem_cpcfa IS NULL
                    AND ide_empr = ${dtoIn.ideEmpr}
            )
            SELECT
                cp.total_facturas,
                cp.compras_brutas,
                cp.compras_base,
                cp.iva_pagado,
                cp.proveedores_activos,
                cpa.compras_brutas_anterior,
                cpa.total_facturas_anterior,
                CASE
                    WHEN cpa.compras_brutas_anterior > 0
                    THEN ROUND((cp.compras_brutas - cpa.compras_brutas_anterior) / cpa.compras_brutas_anterior * 100, 2)
                    ELSE 0
                END AS crecimiento_compras_porcentual,
                CASE
                    WHEN cp.total_facturas > 0
                    THEN ROUND(cp.compras_brutas / cp.total_facturas, 2)
                    ELSE 0
                END AS ticket_promedio,
                CASE
                    WHEN cp.proveedores_activos > 0
                    THEN ROUND(cp.compras_brutas / cp.proveedores_activos, 2)
                    ELSE 0
                END AS compra_por_proveedor
            FROM compras_periodo cp
            CROSS JOIN compras_periodo_anterior cpa
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
     * Variación diaria de compras (últimos N días hábiles).
     */
    async getVariacionDiariaCompras(dtoIn: ComprasDiariasDto & HeaderParamsDto) {
        const fecha = dtoIn.fecha ? `'${dtoIn.fecha}'::date` : 'CURRENT_DATE';

        const whereSucursal = isDefined(dtoIn.ide_sucu)
            ? `AND ide_sucu = ANY (ARRAY[${Array.isArray(dtoIn.ide_sucu) ? dtoIn.ide_sucu.join(',') : dtoIn.ide_sucu}]::INT[])`
            : '';

        const query = new SelectQuery(`
            WITH fechas_laborables AS (
                SELECT fecha::date
                FROM generate_series(${fecha}::date - INTERVAL '30 days', ${fecha}::date, INTERVAL '1 day') AS fecha
                WHERE EXTRACT(DOW FROM fecha) <> 0
                ORDER BY fecha DESC
            ),
            compras_con_facturas AS (
                SELECT
                    fecha_emisi_cpcfa AS fecha,
                    SUM(total_cpcfa) AS compra_bruta,
                    COUNT(ide_cpcfa) AS num_facturas
                FROM cxp_cabece_factur
                WHERE fecha_emisi_cpcfa BETWEEN (${fecha}::date - INTERVAL '30 days') AND ${fecha}::date
                    AND ide_cpefa = ${this.variables.get('p_cxp_estado_factura_normal')}
                    AND ide_cntdo = ${this.variables.get('p_con_tipo_documento_factura')}
                    AND ide_rem_cpcfa IS NULL
                    AND ide_empr = ${dtoIn.ideEmpr}
                    ${whereSucursal}
                GROUP BY fecha_emisi_cpcfa
                HAVING COUNT(ide_cpcfa) > 0
            )
            SELECT
                cf.fecha,
                cf.compra_bruta AS compra_diaria,
                cf.num_facturas,
                LAG(cf.compra_bruta, 1, 0) OVER (ORDER BY cf.fecha) AS compra_anterior,
                ROUND(
                    (cf.compra_bruta - LAG(cf.compra_bruta, 1, 0) OVER (ORDER BY cf.fecha)) /
                    NULLIF(LAG(cf.compra_bruta, 1, 0) OVER (ORDER BY cf.fecha), 0) * 100,
                    2
                ) AS variacion_porcentual
            FROM compras_con_facturas cf
            WHERE cf.fecha IN (SELECT fecha FROM fechas_laborables)
            ORDER BY cf.fecha DESC
            LIMIT ${dtoIn.dias}
        `);
        return this.dataSource.createQuery(query);
    }

    /**
     * Total de compras mensuales en un año (todos los meses, incluidos los vacíos).
     */
    async getTotalComprasPeriodo(dtoIn: ComprasMensualesDto & HeaderParamsDto) {
        const whereSucursal = isDefined(dtoIn.ide_sucu)
            ? `AND ide_sucu = ANY (ARRAY[${Array.isArray(dtoIn.ide_sucu) ? dtoIn.ide_sucu.join(',') : dtoIn.ide_sucu}]::INT[])`
            : '';

        const query = new SelectQuery(`
            WITH FacturasFiltradas AS (
                SELECT
                    EXTRACT(MONTH FROM fecha_emisi_cpcfa) AS mes,
                    COUNT(ide_cpcfa) AS num_facturas,
                    SUM(base_grabada_cpcfa) AS compras12,
                    SUM(base_tarifa0_cpcfa + base_no_objeto_iva_cpcfa) AS compras0,
                    SUM(base_grabada_cpcfa + base_tarifa0_cpcfa + base_no_objeto_iva_cpcfa) AS compras_brutas,
                    SUM(valor_iva_cpcfa) AS iva,
                    SUM(total_cpcfa) AS total
                FROM cxp_cabece_factur
                WHERE fecha_emisi_cpcfa >= $1 AND fecha_emisi_cpcfa <= $2
                    AND ide_cpefa = ${this.variables.get('p_cxp_estado_factura_normal')}
                    AND ide_cntdo = ${this.variables.get('p_con_tipo_documento_factura')}
                    AND ide_rem_cpcfa IS NULL
                    AND ide_empr = ${dtoIn.ideEmpr}
                    ${whereSucursal}
                GROUP BY EXTRACT(MONTH FROM fecha_emisi_cpcfa)
            )
            SELECT
                gm.ide_gemes,
                gm.nombre_gemes,
                COALESCE(ff.num_facturas, 0) AS num_facturas,
                COALESCE(ff.compras12, 0) AS compras_con_iva,
                COALESCE(ff.compras0, 0) AS compras0,
                COALESCE(ff.compras_brutas, 0) AS compras_netas,
                COALESCE(ff.iva, 0) AS iva,
                COALESCE(ff.total, 0) AS total
            FROM gen_mes gm
            LEFT JOIN FacturasFiltradas ff ON gm.ide_gemes = ff.mes
            ORDER BY gm.ide_gemes
        `);
        query.addStringParam(1, `${dtoIn.periodo}-01-01`);
        query.addStringParam(2, `${dtoIn.periodo}-12-31`);
        return this.dataSource.createQuery(query);
    }

    /**
     * Tasa de crecimiento mensual de compras dentro de un año (comparado con el mes anterior).
     */
    async getTasaCrecimientoMensualCompras(dtoIn: ComprasMensualesDto & HeaderParamsDto) {
        const whereSucursal = isDefined(dtoIn.ide_sucu)
            ? `AND ide_sucu = ANY (ARRAY[${Array.isArray(dtoIn.ide_sucu) ? dtoIn.ide_sucu.join(',') : dtoIn.ide_sucu}]::INT[])`
            : '';

        const query = new SelectQuery(`
            WITH meses_anios AS (
                SELECT
                    ide_gemes AS mes_numero,
                    nombre_gemes AS mes_nombre,
                    ${dtoIn.periodo}::INTEGER AS anio
                FROM gen_mes
            ),
            compras_mensuales AS (
                SELECT
                    EXTRACT(MONTH FROM fecha_emisi_cpcfa) AS mes_numero,
                    SUM(total_cpcfa) AS total_compras_bruto
                FROM cxp_cabece_factur
                WHERE fecha_emisi_cpcfa BETWEEN $1 AND $2
                    AND ide_cpefa = ${this.variables.get('p_cxp_estado_factura_normal')}
                    AND ide_cntdo = ${this.variables.get('p_con_tipo_documento_factura')}
                    AND ide_rem_cpcfa IS NULL
                    AND ide_empr = ${dtoIn.ideEmpr}
                    ${whereSucursal}
                GROUP BY EXTRACT(MONTH FROM fecha_emisi_cpcfa)
            ),
            dic_anterior AS MATERIALIZED (
                SELECT COALESCE(SUM(total_cpcfa), 0) AS compras_dic
                FROM cxp_cabece_factur
                WHERE fecha_emisi_cpcfa BETWEEN '${dtoIn.periodo - 1}-12-01'::DATE AND '${dtoIn.periodo - 1}-12-31'::DATE
                    AND ide_cpefa = ${this.variables.get('p_cxp_estado_factura_normal')}
                    AND ide_cntdo = ${this.variables.get('p_con_tipo_documento_factura')}
                    AND ide_rem_cpcfa IS NULL
                    AND ide_empr = ${dtoIn.ideEmpr}
                    ${whereSucursal}
            ),
            compras_totales AS (
                SELECT
                    ma.mes_numero,
                    ma.mes_nombre,
                    ma.anio,
                    COALESCE(cm.total_compras_bruto, 0) AS total_compras
                FROM meses_anios ma
                LEFT JOIN compras_mensuales cm ON cm.mes_numero = ma.mes_numero
            ),
            compras_calculadas AS (
                SELECT
                    ct.*,
                    COALESCE(
                        CASE WHEN ct.mes_numero = 1
                             THEN (SELECT compras_dic FROM dic_anterior)
                             ELSE LAG(ct.total_compras, 1) OVER (ORDER BY ct.mes_numero)
                        END,
                    0) AS compras_mes_anterior,
                    CASE WHEN ct.mes_numero = 1 THEN 'Diciembre'
                         ELSE LAG(ct.mes_nombre, 1) OVER (ORDER BY ct.mes_numero)
                    END AS nombre_mes_anterior
                FROM compras_totales ct
            )
            SELECT
                cc.mes_numero,
                cc.mes_nombre,
                cc.anio,
                cc.total_compras,
                cc.compras_mes_anterior,
                COALESCE(ROUND(
                    (cc.total_compras - cc.compras_mes_anterior) /
                    NULLIF(cc.compras_mes_anterior, 0) * 100,
                2), 0) AS crecimiento_porcentual,
                cc.total_compras - cc.compras_mes_anterior AS crecimiento_absoluto,
                CASE
                    WHEN cc.total_compras - cc.compras_mes_anterior > 0 THEN 'CRECIMIENTO'
                    WHEN cc.total_compras - cc.compras_mes_anterior < 0 THEN 'DECRECIMIENTO'
                    ELSE 'ESTABLE'
                END AS tendencia,
                CASE
                    WHEN cc.mes_numero = 1 THEN 'Diciembre ' || ${dtoIn.periodo - 1}
                    ELSE COALESCE(cc.nombre_mes_anterior, 'N/A') || ' ' || cc.anio
                END AS comparacion_con
            FROM compras_calculadas cc
            ORDER BY cc.mes_numero
        `);
        query.addStringParam(1, `${dtoIn.periodo}-01-01`);
        query.addStringParam(2, `${dtoIn.periodo}-12-31`);
        return this.dataSource.createQuery(query);
    }

    /**
     * Top proveedores por monto de compras en un período.
     */
    async getTopProveedores(dtoIn: TopProveedoresDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT
                p.ide_geper,
                p.nom_geper AS proveedor,
                COUNT(cf.ide_cpcfa) AS num_facturas,
                SUM(cf.base_grabada_cpcfa + cf.base_tarifa0_cpcfa + cf.base_no_objeto_iva_cpcfa) AS total_compras_base,
                SUM(cf.total_cpcfa) AS total_compras,
                ROUND(SUM(cf.total_cpcfa) * 100.0 /
                    (SELECT SUM(total_cpcfa)
                     FROM cxp_cabece_factur
                     WHERE fecha_emisi_cpcfa BETWEEN $1 AND $2
                     AND ide_cpefa = ${this.variables.get('p_cxp_estado_factura_normal')}
                     AND ide_cntdo = ${this.variables.get('p_con_tipo_documento_factura')}
                     AND ide_rem_cpcfa IS NULL
                     AND ide_empr = ${dtoIn.ideEmpr}), 2) AS porcentaje
            FROM cxp_cabece_factur cf
            JOIN gen_persona p ON cf.ide_geper = p.ide_geper
            WHERE cf.fecha_emisi_cpcfa BETWEEN $3 AND $4
                AND cf.ide_cpefa = ${this.variables.get('p_cxp_estado_factura_normal')}
                AND cf.ide_cntdo = ${this.variables.get('p_con_tipo_documento_factura')}
                AND cf.ide_rem_cpcfa IS NULL
                AND cf.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY p.ide_geper, p.nom_geper
            ORDER BY total_compras DESC
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
     * Top productos/artículos comprados en un período.
     */
    async getTopProductosComprados(dtoIn: TopProveedoresDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT
                d.ide_inarti,
                art.codigo_inarti,
                art.nombre_inarti AS producto,
                COUNT(DISTINCT cf.ide_cpcfa) AS num_facturas,
                SUM(d.cantidad_cpdfa) AS cantidad_comprada,
                SUM(d.valor_cpdfa) AS total_comprado
            FROM cxp_detall_factur d
            JOIN cxp_cabece_factur cf ON d.ide_cpcfa = cf.ide_cpcfa
            JOIN inv_articulo art ON d.ide_inarti = art.ide_inarti
            WHERE cf.fecha_emisi_cpcfa BETWEEN $1 AND $2
                AND cf.ide_cpefa = ${this.variables.get('p_cxp_estado_factura_normal')}
                AND cf.ide_cntdo = ${this.variables.get('p_con_tipo_documento_factura')}
                AND cf.ide_rem_cpcfa IS NULL
                AND cf.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY d.ide_inarti, art.codigo_inarti, art.nombre_inarti
            ORDER BY total_comprado DESC
            LIMIT ${dtoIn.limit}
            `,
            dtoIn,
        );
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        return this.dataSource.createQuery(query);
    }

    /**
     * Compras agrupadas por categoría de producto.
     */
    async getComprasPorCategoriaProducto(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                COALESCE(art.ide_incate, -1) AS ide_categoria,
                COALESCE(cat.nombre_incate, 'SIN CATEGORÍA') AS categoria,
                COUNT(DISTINCT cf.ide_cpcfa) AS num_facturas,
                SUM(d.valor_cpdfa) AS total_comprado
            FROM cxp_detall_factur d
            JOIN inv_articulo art ON d.ide_inarti = art.ide_inarti
            LEFT JOIN inv_categoria cat ON art.ide_incate = cat.ide_incate
            JOIN cxp_cabece_factur cf ON d.ide_cpcfa = cf.ide_cpcfa
            WHERE cf.fecha_emisi_cpcfa BETWEEN $1 AND $2
                AND cf.ide_cpefa = ${this.variables.get('p_cxp_estado_factura_normal')}
                AND cf.ide_cntdo = ${this.variables.get('p_con_tipo_documento_factura')}
                AND cf.ide_rem_cpcfa IS NULL
                AND cf.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY art.ide_incate, COALESCE(cat.nombre_incate, 'SIN CATEGORÍA')
            ORDER BY total_comprado DESC
        `);
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        return this.dataSource.createQuery(query);
    }

    /**
     * Resumen anual de compras (para comparar períodos completos).
     */
    async getResumenComprasPeriodos(dtoIn: HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                EXTRACT(YEAR FROM fecha_emisi_cpcfa) AS anio,
                COUNT(ide_cpcfa) AS total_facturas,
                SUM(base_grabada_cpcfa) AS base_grabada,
                SUM(valor_iva_cpcfa) AS total_iva,
                SUM(base_tarifa0_cpcfa + base_no_objeto_iva_cpcfa) AS compras_exentas,
                SUM(base_grabada_cpcfa + base_tarifa0_cpcfa + base_no_objeto_iva_cpcfa) AS total_compras_bruto,
                SUM(total_cpcfa) AS total_compras_neto,
                COUNT(DISTINCT ide_geper) AS proveedores_unicos,
                CASE
                    WHEN COUNT(ide_cpcfa) > 0
                    THEN ROUND(SUM(total_cpcfa) / COUNT(ide_cpcfa), 2)
                    ELSE 0
                END AS promedio_compra_por_factura
            FROM cxp_cabece_factur
            WHERE ide_cpefa = ${this.variables.get('p_cxp_estado_factura_normal')}
                AND ide_cntdo = ${this.variables.get('p_con_tipo_documento_factura')}
                AND ide_rem_cpcfa IS NULL
                AND ide_empr = ${dtoIn.ideEmpr}
            GROUP BY EXTRACT(YEAR FROM fecha_emisi_cpcfa)
            ORDER BY anio DESC
        `);
        return this.dataSource.createQuery(query);
    }

    /**
     * Comparativo mensual de Ventas vs Compras en un año, con margen bruto estimado.
     * Usado tanto en el dashboard de Ventas como en el de Compras.
     */
    async getComparativoVentasCompras(dtoIn: ComparativoVentasComprasDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            WITH ventas_mes AS (
                SELECT
                    EXTRACT(MONTH FROM fecha_emisi_cccfa) AS mes,
                    SUM(total_cccfa) AS total_ventas,
                    COUNT(ide_cccfa) AS num_facturas_venta
                FROM cxc_cabece_factura
                WHERE fecha_emisi_cccfa BETWEEN $1 AND $2
                    AND ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                    AND ide_empr = ${dtoIn.ideEmpr}
                GROUP BY EXTRACT(MONTH FROM fecha_emisi_cccfa)
            ),
            compras_mes AS (
                SELECT
                    EXTRACT(MONTH FROM fecha_emisi_cpcfa) AS mes,
                    SUM(total_cpcfa) AS total_compras,
                    COUNT(ide_cpcfa) AS num_facturas_compra
                FROM cxp_cabece_factur
                WHERE fecha_emisi_cpcfa BETWEEN $3 AND $4
                    AND ide_cpefa = ${this.variables.get('p_cxp_estado_factura_normal')}
                    AND ide_cntdo = ${this.variables.get('p_con_tipo_documento_factura')}
                    AND ide_rem_cpcfa IS NULL
                    AND ide_empr = ${dtoIn.ideEmpr}
                GROUP BY EXTRACT(MONTH FROM fecha_emisi_cpcfa)
            )
            SELECT
                gm.ide_gemes AS mes,
                gm.nombre_gemes,
                COALESCE(v.total_ventas, 0) AS total_ventas,
                COALESCE(v.num_facturas_venta, 0) AS num_facturas_venta,
                COALESCE(c.total_compras, 0) AS total_compras,
                COALESCE(c.num_facturas_compra, 0) AS num_facturas_compra,
                COALESCE(v.total_ventas, 0) - COALESCE(c.total_compras, 0) AS margen_bruto,
                CASE
                    WHEN COALESCE(v.total_ventas, 0) > 0
                    THEN ROUND((COALESCE(v.total_ventas, 0) - COALESCE(c.total_compras, 0)) / v.total_ventas * 100, 2)
                    ELSE 0
                END AS margen_porcentual
            FROM gen_mes gm
            LEFT JOIN ventas_mes v ON gm.ide_gemes = v.mes
            LEFT JOIN compras_mes c ON gm.ide_gemes = c.mes
            ORDER BY gm.ide_gemes
        `);
        query.addStringParam(1, `${dtoIn.periodo}-01-01`);
        query.addStringParam(2, `${dtoIn.periodo}-12-31`);
        query.addStringParam(3, `${dtoIn.periodo}-01-01`);
        query.addStringParam(4, `${dtoIn.periodo}-12-31`);
        return this.dataSource.createQuery(query);
    }
}
