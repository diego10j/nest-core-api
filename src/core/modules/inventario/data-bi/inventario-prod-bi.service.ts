import { BadRequestException, Injectable } from '@nestjs/common';
import { getYear } from 'date-fns';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { CoreService } from 'src/core/core.service';
import { isDefined } from 'src/util/helpers/common-util';

import { BaseService } from '../../../../common/base-service';
import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery } from '../../../connection/helpers/select-query';
import { TrnProductoDto } from '../productos/dto/trn-producto.dto';
import { VentasMensualesDto } from '../productos/dto/ventas-mensuales.dto';

import { AnalisisProductoDto } from './dto/analisis-producto.dto';
import { AnalisisDto } from './dto/analisis.dto';
import { EvaluacionRotacionProductoDto } from './dto/evalua-rotacion-producto.dto';
import { ProductosMayorStockDto } from './dto/productos-mayor-stock.dto';
import { ProductosObsoletosDto } from './dto/productos-obsoletos.dto';
import { ProductosStockBajoDto } from './dto/productos-stock-bajo.dto';
import { TopProductosDto } from './dto/top-productos';

@Injectable()
export class InventarioProductoBiService extends BaseService {
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
        'p_inv_estado_normal', // 1
        'p_cxp_estado_factura_normal', //0
      ])
      .then((result) => {
        this.variables = result;
      });
  }

  async getVariacionInventarioProducto(dtoIn: AnalisisProductoDto & HeaderParamsDto) {
    if (dtoIn.periodo === 0) {
      dtoIn.periodo = getYear(new Date());
      dtoIn.ide_inarti = -1;
    }

    const whereClause = dtoIn.ide_inbod ? ` AND cci.ide_inbod = ${dtoIn.ide_inbod}` : '';
    const query = new SelectQuery(
      `       
            WITH Meses AS (
                SELECT
                    gm.nombre_gemes,
                    gm.ide_gemes,
                    TO_DATE('${dtoIn.periodo}-' || LPAD(gm.ide_gemes::text, 2, '0') || '-01', 'YYYY-MM-DD') AS inicio_mes,
                    (TO_DATE('${dtoIn.periodo}-' || LPAD(gm.ide_gemes::text, 2, '0') || '-01', 'YYYY-MM-DD') + INTERVAL '1 MONTH' - INTERVAL '1 DAY') AS fin_mes
                FROM
                    gen_mes gm
            ),
            Transacciones AS (
                SELECT
                    m.ide_gemes,
                    m.inicio_mes,
                    m.fin_mes,
                    SUM(CASE
                        WHEN cci.fecha_trans_incci < m.inicio_mes THEN dci.cantidad_indci * tci.signo_intci
                        ELSE 0
                    END) AS saldo_inicial,
                    SUM(CASE
                        WHEN cci.fecha_trans_incci <= m.fin_mes THEN dci.cantidad_indci * tci.signo_intci
                        ELSE 0
                    END) AS saldo_final,
                    SUM(CASE
                        WHEN cci.fecha_trans_incci BETWEEN m.inicio_mes AND m.fin_mes AND tci.signo_intci = 1 THEN dci.cantidad_indci
                        ELSE 0
                    END) AS ingresos,
                    SUM(CASE
                        WHEN cci.fecha_trans_incci BETWEEN m.inicio_mes AND m.fin_mes AND tci.signo_intci = -1 THEN dci.cantidad_indci
                        ELSE 0
                    END) AS egresos,
                    uni.siglas_inuni
                FROM
                    Meses m
                LEFT JOIN inv_det_comp_inve dci ON dci.ide_inarti = $1
                LEFT JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci AND cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                LEFT JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                LEFT JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                LEFT JOIN inv_articulo iart ON dci.ide_inarti = iart.ide_inarti
                LEFT JOIN inv_unidad uni ON iart.ide_inuni = uni.ide_inuni
                WHERE cci.ide_empr = ${dtoIn.ideEmpr} 
                ${whereClause}
                GROUP BY
                    m.ide_gemes, m.inicio_mes, m.fin_mes, uni.siglas_inuni
            ),
            TransaccionesConNull AS (
                SELECT
                    t.ide_gemes,
                    t.inicio_mes,
                    t.fin_mes,
                    -- Retorna NULL si no hay movimientos en el mes
                    CASE 
                        WHEN NOT EXISTS (
                            SELECT 1 
                            FROM inv_det_comp_inve dci2
                            JOIN inv_cab_comp_inve cci2 ON cci2.ide_incci = dci2.ide_incci 
                            WHERE dci2.ide_inarti = $2
                            AND cci2.fecha_trans_incci BETWEEN t.inicio_mes AND t.fin_mes
                            AND cci2.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                            AND cci2.ide_empr = ${dtoIn.ideEmpr}
                            ${dtoIn.ide_inbod ? ` AND cci2.ide_inbod = ${dtoIn.ide_inbod}` : ''}
                        ) THEN NULL
                        ELSE t.saldo_inicial
                    END AS saldo_inicial,
                    CASE 
                        WHEN NOT EXISTS (
                            SELECT 1 
                            FROM inv_det_comp_inve dci2
                            JOIN inv_cab_comp_inve cci2 ON cci2.ide_incci = dci2.ide_incci 
                            WHERE dci2.ide_inarti = $3 
                            AND cci2.fecha_trans_incci BETWEEN t.inicio_mes AND t.fin_mes
                            AND cci2.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                            AND cci2.ide_empr = ${dtoIn.ideEmpr}
                            ${dtoIn.ide_inbod ? ` AND cci2.ide_inbod = ${dtoIn.ide_inbod}` : ''}
                        ) THEN NULL
                        ELSE t.ingresos
                    END AS ingresos,
                    CASE 
                        WHEN NOT EXISTS (
                            SELECT 1 
                            FROM inv_det_comp_inve dci2
                            JOIN inv_cab_comp_inve cci2 ON cci2.ide_incci = dci2.ide_incci 
                            WHERE dci2.ide_inarti = $4 
                            AND cci2.fecha_trans_incci BETWEEN t.inicio_mes AND t.fin_mes
                            AND cci2.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                            AND cci2.ide_empr = ${dtoIn.ideEmpr}
                            ${dtoIn.ide_inbod ? ` AND cci2.ide_inbod = ${dtoIn.ide_inbod}` : ''}
                        ) THEN NULL
                        ELSE t.egresos
                    END AS egresos,
                    CASE 
                        WHEN NOT EXISTS (
                            SELECT 1 
                            FROM inv_det_comp_inve dci2
                            JOIN inv_cab_comp_inve cci2 ON cci2.ide_incci = dci2.ide_incci 
                            WHERE dci2.ide_inarti = $5 
                            AND cci2.fecha_trans_incci BETWEEN t.inicio_mes AND t.fin_mes
                            AND cci2.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                            AND cci2.ide_empr = ${dtoIn.ideEmpr}
                            ${dtoIn.ide_inbod ? ` AND cci2.ide_inbod = ${dtoIn.ide_inbod}` : ''}
                        ) THEN NULL
                        ELSE t.saldo_final
                    END AS saldo_final,
                    t.siglas_inuni
                FROM
                    Transacciones t
            )
            SELECT
                m.nombre_gemes,
                tc.saldo_inicial,            
                tc.ingresos,
                tc.egresos,
                tc.saldo_final,
                COALESCE(tc.siglas_inuni, '') AS siglas_inuni
            FROM
                Meses m
            LEFT JOIN
                TransaccionesConNull tc ON m.ide_gemes = tc.ide_gemes
            ORDER BY
                m.ide_gemes
            `,
      dtoIn,
    );
    query.addIntParam(1, dtoIn.ide_inarti);
    query.addIntParam(2, dtoIn.ide_inarti);
    query.addIntParam(3, dtoIn.ide_inarti);
    query.addIntParam(4, dtoIn.ide_inarti);
    query.addIntParam(5, dtoIn.ide_inarti);
    return await this.dataSource.createQuery(query);
  }

  //==============

  async getTotalPorTipoTransaccion(dtoIn: AnalisisDto & HeaderParamsDto) {
    return await this.queryTotalPorTipoTransaccion(dtoIn);
  }

  async getTotalPorTipoTransaccionProducto(dtoIn: AnalisisDto & HeaderParamsDto) {
    if (!dtoIn.ide_inarti) {
      throw new BadRequestException('ide_inarti es obligatorio.');
    }
    return await this.queryTotalPorTipoTransaccion(dtoIn);
  }

  /**
   * Obtiene el total de tipo de transaccion de inventario en un rango de fechas
   * @param dtoIn
   * @returns
   */
  private async queryTotalPorTipoTransaccion(dtoIn: AnalisisDto & HeaderParamsDto) {
    let whereClause = dtoIn.ide_inbod ? ` AND cci.ide_inbod = ${dtoIn.ide_inbod}` : '';
    whereClause += dtoIn.ide_inarti ? ` AND dci.ide_inarti = ${dtoIn.ide_inarti}` : '';
    const query = new SelectQuery(
      `
            SELECT 
                tti.ide_intti,
                tti.nombre_intti AS tipo_movimiento,
                tci.signo_intci AS signo,
                COUNT(DISTINCT cci.ide_incci) AS num_trn,
                SUM(CASE WHEN tci.signo_intci = 1 THEN dci.cantidad_indci ELSE 0 END) AS total_ingresos,
                SUM(CASE WHEN tci.signo_intci = -1 THEN dci.cantidad_indci ELSE 0 END) AS total_egresos,
                ROUND(
                    (COUNT(DISTINCT cci.ide_incci) * 100.0 / 
                     SUM(COUNT(DISTINCT cci.ide_incci)) OVER()
                    ), 2
                ) AS porcentaje
            FROM 
                inv_det_comp_inve dci
            INNER JOIN 
                inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
            INNER JOIN 
                inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
            INNER JOIN 
                inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
            INNER JOIN 
                inv_articulo arti ON dci.ide_inarti = arti.ide_inarti
            WHERE  arti.ide_empr = ${dtoIn.ideEmpr}
                AND cci.fecha_trans_incci BETWEEN $1 AND $2
                AND cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                ${whereClause}
            GROUP BY 
                tti.ide_intti,
                tti.nombre_intti, 
                tci.signo_intci
            ORDER BY 
                num_trn DESC,
                porcentaje DESC
        `,
      dtoIn,
    );

    query.addStringParam(1, `${dtoIn.periodo}-01-01`);
    query.addStringParam(2, `${dtoIn.periodo}-12-31`);

    return await this.dataSource.createQuery(query);
  }

  async getAnalisisRotacionStockProducto(dtoIn: AnalisisProductoDto & HeaderParamsDto) {
    if (dtoIn.periodo === 0) {
      dtoIn.periodo = new Date().getFullYear();
    }

    const whereClause = dtoIn.ide_inbod ? ` AND cci.ide_inbod = ${dtoIn.ide_inbod}` : '';

    const query = new SelectQuery(
      `
            WITH meses_base AS (
                SELECT 
                    gm.ide_gemes AS mes_numero,
                    gm.nombre_gemes AS nombre_mes,
                    ${dtoIn.periodo} AS anio
                FROM gen_mes gm
                WHERE gm.ide_gemes BETWEEN 1 AND 12
            ),
            movimientos_mensuales AS (
                SELECT 
                    EXTRACT(YEAR FROM cci.fecha_trans_incci) AS anio,
                    EXTRACT(MONTH FROM cci.fecha_trans_incci) AS mes,
                    TO_CHAR(cci.fecha_trans_incci, 'Month') AS nombre_mes,
                    SUM(CASE WHEN tci.signo_intci = 1 THEN dci.cantidad_indci ELSE 0 END) AS ingresos,
                    SUM(CASE WHEN tci.signo_intci = -1 THEN dci.cantidad_indci ELSE 0 END) AS egresos,
                    AVG(CASE WHEN tci.signo_intci = -1 THEN dci.cantidad_indci ELSE NULL END) AS promedio_egresos_diarios,
                    COUNT(DISTINCT CASE WHEN tci.signo_intci = -1 THEN DATE(cci.fecha_trans_incci) ELSE NULL END) AS dias_con_egresos,
                    uni.siglas_inuni
                FROM 
                    inv_det_comp_inve dci
                INNER JOIN 
                    inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                INNER JOIN 
                    inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                INNER JOIN 
                    inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                INNER JOIN 
                    inv_articulo arti ON dci.ide_inarti = arti.ide_inarti
                LEFT JOIN 
                    inv_unidad uni ON arti.ide_inuni = uni.ide_inuni
                WHERE 
                    dci.ide_inarti = $1
                    AND arti.ide_empr = ${dtoIn.ideEmpr}
                    AND EXTRACT(YEAR FROM cci.fecha_trans_incci) = ${dtoIn.periodo}
                    AND cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                    ${whereClause}
                GROUP BY 
                    EXTRACT(YEAR FROM cci.fecha_trans_incci),
                    EXTRACT(MONTH FROM cci.fecha_trans_incci),
                    TO_CHAR(cci.fecha_trans_incci, 'Month'),
                    uni.siglas_inuni
            ),
            datos_completos AS (
                SELECT
                    mb.mes_numero,
                    mb.nombre_mes,
                    mb.anio,
                    COALESCE(mm.ingresos, 0) AS ingresos,
                    COALESCE(mm.egresos, 0) AS egresos,
                    COALESCE(mm.promedio_egresos_diarios, 0) AS promedio_egresos_diarios,
                    COALESCE(mm.dias_con_egresos, 0) AS dias_con_egresos,
                    COALESCE(mm.siglas_inuni, 'N/A') AS siglas_inuni
                FROM meses_base mb
                LEFT JOIN movimientos_mensuales mm ON mb.mes_numero = mm.mes AND mb.anio = mm.anio
            ),
            estadisticas AS (
                SELECT
                    mes_numero,
                    nombre_mes,
                    anio,
                    ingresos,
                    egresos,
                    promedio_egresos_diarios,
                    dias_con_egresos,
                    siglas_inuni,
                    -- Rotación mensual (egresos / promedio de inventario)
                    CASE 
                        WHEN (ingresos + egresos) > 0 THEN 
                            ROUND(egresos / ((ingresos + egresos) / 2.0), 2)
                        ELSE 0 
                    END AS rotacion_mensual,
                    -- Stock de seguridad (promedio diario * días de cobertura)
                    ROUND(promedio_egresos_diarios * 7, 2) AS stock_seguridad_7dias,
                    ROUND(promedio_egresos_diarios * 15, 2) AS stock_seguridad_15dias,
                    -- Punto de reorden (stock seguridad + lead time)
                    ROUND((promedio_egresos_diarios * 7) + (promedio_egresos_diarios * 3), 2) AS punto_reorden_estimado,
                    -- Eficiencia de ventas (días con egresos / días totales del mes)
                    ROUND((dias_con_egresos * 100.0) / 30, 2) AS porcentaje_dias_venta
                FROM 
                    datos_completos
            )
            SELECT 
                mes_numero,
                nombre_mes,
                anio,
                ingresos,
                egresos,
                f_decimales(promedio_egresos_diarios, 2)::numeric as promedio_egresos_diarios,
                dias_con_egresos,
                rotacion_mensual,
                stock_seguridad_7dias,
                stock_seguridad_15dias,
                punto_reorden_estimado,
                porcentaje_dias_venta,
                siglas_inuni,
                -- Clasificación de rotación
                CASE
                    WHEN rotacion_mensual >= 2 THEN 'ALTA ROTACIÓN'
                    WHEN rotacion_mensual >= 1 THEN 'ROTACIÓN MEDIA'
                    WHEN rotacion_mensual > 0 THEN 'BAJA ROTACIÓN'
                    ELSE 'SIN MOVIMIENTO'
                END AS clasificacion_rotacion,
                -- Recomendación de inventario
                CASE
                    WHEN rotacion_mensual >= 2 THEN 'MANTENER STOCK BAJO'
                    WHEN rotacion_mensual >= 1 THEN 'STOCK MODERADO'
                    WHEN egresos > 0 THEN 'REVISAR EXISTENCIAS'
                    ELSE 'SIN DEMANDA'
                END AS recomendacion_inventario
            FROM estadisticas
            ORDER BY mes_numero
        `,
      dtoIn,
    );

    query.addIntParam(1, dtoIn.ide_inarti);

    return await this.dataSource.createQuery(query);
  }
  async getPrediccionStockMensualProducto(dtoIn: AnalisisProductoDto & HeaderParamsDto) {
    if (dtoIn.periodo === 0) {
      dtoIn.periodo = new Date().getFullYear();
    }

    const whereClause = dtoIn.ide_inbod ? ` AND cci.ide_inbod = ${dtoIn.ide_inbod}` : '';

    const query = new SelectQuery(
      `
            WITH meses_base AS (
                SELECT 
                    gm.ide_gemes AS mes,
                    gm.nombre_gemes AS nombre_mes,
                    ${dtoIn.periodo} AS anio_actual
                FROM gen_mes gm
                WHERE gm.ide_gemes BETWEEN 1 AND 12
            ),
            historico_mensual AS (
                SELECT 
                    EXTRACT(YEAR FROM cci.fecha_trans_incci) AS anio,
                    EXTRACT(MONTH FROM cci.fecha_trans_incci) AS mes,
                    TO_CHAR(cci.fecha_trans_incci, 'Month') AS nombre_mes,
                    SUM(CASE WHEN tci.signo_intci = -1 THEN dci.cantidad_indci ELSE 0 END) AS egresos_mensuales,
                    COUNT(DISTINCT CASE WHEN tci.signo_intci = -1 THEN cci.ide_incci ELSE NULL END) AS transacciones_salida,
                    uni.siglas_inuni
                FROM 
                    inv_det_comp_inve dci
                INNER JOIN 
                    inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                INNER JOIN 
                    inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                INNER JOIN 
                    inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                INNER JOIN 
                    inv_articulo arti ON dci.ide_inarti = arti.ide_inarti
                LEFT JOIN 
                    inv_unidad uni ON arti.ide_inuni = uni.ide_inuni
                WHERE 
                    dci.ide_inarti = $1
                    AND arti.ide_empr = ${dtoIn.ideEmpr}
                    AND EXTRACT(YEAR FROM cci.fecha_trans_incci) = ${dtoIn.periodo}
                    AND cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                    ${whereClause}
                GROUP BY 
                    EXTRACT(YEAR FROM cci.fecha_trans_incci),
                    EXTRACT(MONTH FROM cci.fecha_trans_incci),
                    TO_CHAR(cci.fecha_trans_incci, 'Month'),
                    uni.siglas_inuni
            ),
            datos_completos AS (
                SELECT
                    mb.mes,
                    mb.nombre_mes,
                    mb.anio_actual,
                    COALESCE(hm.egresos_mensuales, 0) AS egresos_mensuales,
                    COALESCE(hm.transacciones_salida, 0) AS transacciones_salida,
                    COALESCE(hm.siglas_inuni, 'N/A') AS siglas_inuni,
                    CASE 
                        WHEN hm.anio IS NOT NULL THEN 1 
                        ELSE 0 
                    END AS tiene_datos_historicos
                FROM meses_base mb
                LEFT JOIN historico_mensual hm ON mb.mes = hm.mes
            ),
            estadisticas_globales AS (
                SELECT
                    AVG(egresos_mensuales) AS promedio_global_egresos,
                    STDDEV(egresos_mensuales) AS desviacion_global,
                    COUNT(*) FILTER (WHERE egresos_mensuales > 0) AS meses_con_movimiento
                FROM datos_completos
                WHERE tiene_datos_historicos = 1
            ),
            prediccion AS (
                SELECT
                    dc.mes,
                    dc.nombre_mes,
                    dc.anio_actual,
                    dc.egresos_mensuales,
                    dc.transacciones_salida,
                    dc.siglas_inuni,
                    dc.tiene_datos_historicos,
                    -- Usar datos históricos cuando existen, si no usar promedio global
                    CASE 
                        WHEN dc.tiene_datos_historicos = 1 THEN dc.egresos_mensuales
                        ELSE eg.promedio_global_egresos
                    END AS base_prediccion,
                    eg.promedio_global_egresos,
                    eg.desviacion_global,
                    eg.meses_con_movimiento,
                    -- Predicción con margen de seguridad
                    ROUND(
                        CASE 
                            WHEN dc.tiene_datos_historicos = 1 THEN 
                                dc.egresos_mensuales + eg.desviacion_global
                            ELSE 
                                eg.promedio_global_egresos + eg.desviacion_global
                        END, 2
                    ) AS prediccion_con_seguridad,
                    -- Stock recomendado considerando crecimiento
                    ROUND(
                        CASE 
                            WHEN dc.tiene_datos_historicos = 1 THEN 
                                (dc.egresos_mensuales + eg.desviacion_global) * 1.2
                            ELSE 
                                (eg.promedio_global_egresos + eg.desviacion_global) * 1.2
                        END, 2
                    ) AS stock_recomendado_mensual,
                    -- Nivel de confianza de la predicción
                    CASE
                        WHEN dc.tiene_datos_historicos = 1 AND dc.egresos_mensuales > 0 THEN 'ALTA'
                        WHEN eg.meses_con_movimiento >= 6 THEN 'MEDIA'
                        ELSE 'BAJA'
                    END AS confianza_prediccion,
                    -- Estacionalidad estimada
                    CASE
                        WHEN dc.egresos_mensuales > eg.promedio_global_egresos + eg.desviacion_global THEN 'ALTA DEMANDA'
                        WHEN dc.egresos_mensuales < eg.promedio_global_egresos - eg.desviacion_global THEN 'BAJA DEMANDA'
                        ELSE 'DEMANDA NORMAL'
                    END AS estacionalidad
                FROM 
                    datos_completos dc
                CROSS JOIN estadisticas_globales eg
            )
            SELECT 
                mes,
                nombre_mes,
                anio_actual AS periodo,
                egresos_mensuales,
                transacciones_salida,
                siglas_inuni,
                tiene_datos_historicos,
                base_prediccion,
                promedio_global_egresos,
                desviacion_global,
                prediccion_con_seguridad,
                stock_recomendado_mensual,
                confianza_prediccion,
                estacionalidad,
                -- Recomendación de compra
                CASE
                    WHEN tiene_datos_historicos = 0 AND promedio_global_egresos > 0 THEN 'COMPRA BASADA EN PROMEDIO'
                    WHEN tiene_datos_historicos = 0 THEN 'REVISAR HISTÓRICO'
                    WHEN estacionalidad = 'ALTA DEMANDA' THEN 'INCREMENTAR STOCK'
                    WHEN estacionalidad = 'BAJA DEMANDA' THEN 'MANTENER STOCK MÍNIMO'
                    ELSE 'COMPRA NORMAL'
                END AS recomendacion_compra,
                -- Punto de reorden sugerido
                ROUND(prediccion_con_seguridad * 0.3, 2) AS punto_reorden_sugerido
            FROM prediccion
            ORDER BY mes
        `,
      dtoIn,
    );

    query.addIntParam(1, dtoIn.ide_inarti);

    return await this.dataSource.createQuery(query);
  }

  async getAnalisisBodegasMensual(dtoIn: TrnProductoDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
            WITH movimientos_bodega AS (
                SELECT 
                    EXTRACT(YEAR FROM cci.fecha_trans_incci) AS anio,
                    EXTRACT(MONTH FROM cci.fecha_trans_incci) AS mes,
                    TO_CHAR(cci.fecha_trans_incci, 'Month') AS nombre_mes,
                    bod.ide_inbod,
                    bod.nombre_inbod,
                    tci.signo_intci,
                    SUM(dci.cantidad_indci) AS cantidad,
                    SUM(dci.cantidad_indci * dci.precio_indci) AS valor_total,
                    COUNT(DISTINCT cci.ide_incci) AS total_transacciones
                FROM 
                    inv_det_comp_inve dci
                INNER JOIN 
                    inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                INNER JOIN 
                    inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                INNER JOIN 
                    inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                INNER JOIN 
                    inv_articulo arti ON dci.ide_inarti = arti.ide_inarti
                INNER JOIN
                    inv_bodega bod ON cci.ide_inbod = bod.ide_inbod
                WHERE 
                    dci.ide_inarti = $1
                    AND arti.ide_empr = ${dtoIn.ideEmpr}
                    AND cci.fecha_trans_incci BETWEEN $2 AND $3
                    AND cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                GROUP BY 
                    EXTRACT(YEAR FROM cci.fecha_trans_incci),
                    EXTRACT(MONTH FROM cci.fecha_trans_incci),
                    TO_CHAR(cci.fecha_trans_incci, 'Month'),
                    bod.ide_inbod, bod.nombre_inbod, tci.signo_intci
            ),
            saldos_bodega AS (
                SELECT
                    anio,
                    mes,
                    nombre_mes,
                    ide_inbod,
                    nombre_inbod,
                    SUM(CASE WHEN signo_intci = 1 THEN cantidad ELSE 0 END) AS ingresos_mes,
                    SUM(CASE WHEN signo_intci = -1 THEN cantidad ELSE 0 END) AS egresos_mes,
                    SUM(CASE WHEN signo_intci = 1 THEN valor_total ELSE 0 END) AS valor_ingresos,
                    SUM(CASE WHEN signo_intci = -1 THEN valor_total ELSE 0 END) AS valor_egresos,
                    SUM(CASE WHEN signo_intci = 1 THEN cantidad ELSE -cantidad END) AS saldo_mensual,
                    SUM(total_transacciones) AS transacciones_totales
                FROM 
                    movimientos_bodega
                GROUP BY 
                    anio, mes, nombre_mes, ide_inbod, nombre_inbod
            ),
            ranking_bodegas AS (
                SELECT
                    *,
                    SUM(saldo_mensual) OVER (PARTITION BY ide_inbod ORDER BY anio, mes) AS saldo_acumulado_bodega,
                    RANK() OVER (PARTITION BY anio, mes ORDER BY saldo_mensual DESC) AS ranking_saldo_mensual,
                    RANK() OVER (PARTITION BY anio, mes ORDER BY transacciones_totales DESC) AS ranking_transacciones
                FROM 
                    saldos_bodega
            )
            SELECT
                anio,
                mes,
                nombre_mes,
                ide_inbod,
                nombre_inbod,
                ingresos_mes,
                egresos_mes,
                valor_ingresos,
                valor_egresos,
                saldo_mensual,
                saldo_acumulado_bodega,
                transacciones_totales,
                ranking_saldo_mensual,
                ranking_transacciones,
                CASE 
                    WHEN ranking_saldo_mensual = 1 THEN 'BODEGA LÍDER EN STOCK'
                    WHEN ranking_saldo_mensual <= 3 THEN 'BODEGA CON ALTO STOCK'
                    ELSE 'BODEGA CON STOCK NORMAL'
                END AS categoria_stock,
                ROUND((saldo_mensual * 100.0) / NULLIF(SUM(saldo_mensual) OVER (PARTITION BY anio, mes), 0), 2) AS porcentaje_participacion_mes
            FROM 
                ranking_bodegas
            ORDER BY 
                anio DESC, mes DESC, ranking_saldo_mensual ASC
        `,
      dtoIn,
    );

    query.addIntParam(1, dtoIn.ide_inarti);
    query.addParam(2, dtoIn.fechaInicio);
    query.addParam(3, dtoIn.fechaFin);

    return await this.dataSource.createQuery(query);
  }

  async getEvaluacionRotacionProducto(dtoIn: EvaluacionRotacionProductoDto & HeaderParamsDto) {
    const diasAnalisis = dtoIn.diasAnalisis || 90;
    const fechaCorte = dtoIn.fechaCorte ? `'${dtoIn.fechaCorte}'::date` : 'CURRENT_DATE';

    const whereClause = dtoIn.ide_inbod ? ` AND cci.ide_inbod = ${dtoIn.ide_inbod}` : '';

    const query = new SelectQuery(
      `
            WITH periodo_analisis AS (
                SELECT 
                    ${fechaCorte} - INTERVAL '${diasAnalisis} days' AS fecha_inicio,
                    ${fechaCorte} AS fecha_fin
            ),
            producto_base AS (
                SELECT 
                    art.ide_inarti,
                    art.nombre_inarti,
                    art.cant_stock1_inarti AS stock_minimo,
                    art.cant_stock2_inarti AS stock_ideal,
                    art.decim_stock_inarti,
                    uni.siglas_inuni
                FROM 
                    inv_articulo art
                LEFT JOIN
                    inv_unidad uni ON art.ide_inuni = uni.ide_inuni
                WHERE 
                    art.ide_inarti = $1
                    AND art.ide_empr = ${dtoIn.ideEmpr}
            ),
            movimientos_recientes AS (
                SELECT 
                    pb.ide_inarti,
                    -- Movimientos últimos N días (parametrizado)
                    SUM(CASE WHEN tci.signo_intci = 1 THEN dci.cantidad_indci ELSE 0 END) AS ingresos_${diasAnalisis}dias,
                    SUM(CASE WHEN tci.signo_intci = -1 THEN dci.cantidad_indci ELSE 0 END) AS egresos_${diasAnalisis}dias,
                    COUNT(DISTINCT CASE WHEN tci.signo_intci = -1 THEN cci.ide_incci ELSE NULL END) AS facturas_venta_${diasAnalisis}dias,
                    COUNT(DISTINCT DATE(cci.fecha_trans_incci)) AS dias_con_venta_${diasAnalisis}dias
                FROM 
                    producto_base pb
                LEFT JOIN inv_det_comp_inve dci ON dci.ide_inarti = pb.ide_inarti
                LEFT JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                LEFT JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                LEFT JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                CROSS JOIN periodo_analisis pa
                WHERE 
                    cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                    AND cci.fecha_trans_incci BETWEEN pa.fecha_inicio AND pa.fecha_fin
                    ${whereClause}
                GROUP BY 
                    pb.ide_inarti
            ),
            saldo_actual AS (
                SELECT 
                    pb.ide_inarti,
                    f_redondeo(SUM(dci.cantidad_indci * tci.signo_intci), pb.decim_stock_inarti) AS saldo_actual
                FROM 
                    producto_base pb
                LEFT JOIN inv_det_comp_inve dci ON dci.ide_inarti = pb.ide_inarti
                LEFT JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                LEFT JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                LEFT JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                WHERE 
                    cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                    AND cci.fecha_trans_incci <= ${fechaCorte}
                    ${whereClause}
                GROUP BY 
                    pb.ide_inarti, pb.decim_stock_inarti
            ),
            ultima_compra AS (
                SELECT 
                    pb.ide_inarti,
                    MAX(cci.fecha_trans_incci) AS fecha_ultima_compra,
                    AVG(dci.precio_indci) AS precio_promedio_compra
                FROM 
                    producto_base pb
                LEFT JOIN inv_det_comp_inve dci ON dci.ide_inarti = pb.ide_inarti
                LEFT JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                LEFT JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                LEFT JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                WHERE 
                    tci.signo_intci = 1  -- Solo compras/ingresos
                    AND cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                    AND cci.fecha_trans_incci <= ${fechaCorte}
                    ${whereClause}
                GROUP BY 
                    pb.ide_inarti
            ),
            datos_completos AS (
                SELECT 
                    pb.ide_inarti,
                    pb.nombre_inarti,
                    pb.siglas_inuni,
                    pb.stock_minimo,
                    pb.stock_ideal,
                    COALESCE(sa.saldo_actual, 0) AS stock_actual,
                    COALESCE(mr.egresos_${diasAnalisis}dias, 0) AS ventas_ultimos_${diasAnalisis}dias,
                    COALESCE(mr.facturas_venta_${diasAnalisis}dias, 0) AS facturas_venta_${diasAnalisis}dias,
                    COALESCE(mr.dias_con_venta_${diasAnalisis}dias, 0) AS dias_con_venta_${diasAnalisis}dias,
                    -- CÁLCULO DE DÍAS DE STOCK
                    CASE 
                        WHEN COALESCE(sa.saldo_actual, 0) > 0 AND COALESCE(mr.egresos_${diasAnalisis}dias, 0) > 0 AND COALESCE(mr.dias_con_venta_${diasAnalisis}dias, 0) > 0 THEN
                            ROUND(COALESCE(sa.saldo_actual, 0) / (mr.egresos_${diasAnalisis}dias / mr.dias_con_venta_${diasAnalisis}dias), 1)
                        ELSE 999
                    END AS dias_stock_disponible
                FROM 
                    producto_base pb
                LEFT JOIN saldo_actual sa ON pb.ide_inarti = sa.ide_inarti
                LEFT JOIN movimientos_recientes mr ON pb.ide_inarti = mr.ide_inarti
            )
            SELECT 
                dc.ide_inarti,
                dc.nombre_inarti,
                dc.siglas_inuni,
                -- DATOS DE STOCK ACTUAL
                dc.stock_actual,
                dc.stock_minimo,
                dc.stock_ideal,
                -- DATOS DE ROTACIÓN
                dc.ventas_ultimos_${diasAnalisis}dias,
                dc.facturas_venta_${diasAnalisis}dias,
                dc.dias_con_venta_${diasAnalisis}dias,
                -- MÉTRICAS DE ROTACIÓN
                ROUND(dc.ventas_ultimos_${diasAnalisis}dias / ${diasAnalisis / 30}, 2) AS promedio_venta_mensual,
                CASE 
                    WHEN dc.dias_con_venta_${diasAnalisis}dias > 0 THEN
                        ROUND(dc.ventas_ultimos_${diasAnalisis}dias / dc.dias_con_venta_${diasAnalisis}dias, 2)
                    ELSE 0
                END AS promedio_venta_diario,
                ROUND((dc.dias_con_venta_${diasAnalisis}dias * 100.0) / ${diasAnalisis}, 2) AS frecuencia_venta_porcentaje,
                -- DÍAS DE STOCK
                dc.dias_stock_disponible,
                -- EVALUACIÓN DE ROTACIÓN
                CASE 
                    WHEN dc.ventas_ultimos_${diasAnalisis}dias = 0 THEN 'SIN ROTACIÓN'
                    WHEN (dc.ventas_ultimos_${diasAnalisis}dias / ${diasAnalisis / 30}) > dc.stock_actual * 2 THEN 'ROTACIÓN MUY ALTA'
                    WHEN (dc.ventas_ultimos_${diasAnalisis}dias / ${diasAnalisis / 30}) > dc.stock_actual THEN 'ROTACIÓN ALTA'
                    WHEN (dc.ventas_ultimos_${diasAnalisis}dias / ${diasAnalisis / 30}) > dc.stock_actual * 0.5 THEN 'ROTACIÓN MEDIA'
                    ELSE 'ROTACIÓN BAJA'
                END AS nivel_rotacion,
                -- RECOMENDACIONES DE COMPRA
                CASE 
                    -- SIN STOCK - COMPRAR URGENTE
                    WHEN dc.stock_actual <= 0 THEN 
                        'COMPRAR URGENTE - Stock agotado'
                    
                    -- STOCK CRÍTICO
                    WHEN dc.stock_minimo IS NOT NULL AND dc.stock_actual < dc.stock_minimo THEN 
                        'COMPRAR INMEDIATO - Stock por debajo del mínimo'
                    
                    -- ROTACIÓN ALTA Y STOCK BAJO
                    WHEN (dc.ventas_ultimos_${diasAnalisis}dias / ${diasAnalisis / 30}) > dc.stock_actual THEN
                        'COMPRAR RÁPIDO - Alta rotación, stock insuficiente'
                    
                    -- STOCK POR DEBAJO DEL IDEAL CON BUENA ROTACIÓN
                    WHEN dc.stock_ideal IS NOT NULL AND dc.stock_actual < dc.stock_ideal AND 
                         (dc.ventas_ultimos_${diasAnalisis}dias / ${diasAnalisis / 30}) > dc.stock_actual * 0.7 THEN
                        'COMPRAR PRONTO - Stock bajo ideal con buena rotación'
                    
                    -- ROTACIÓN MEDIA Y STOCK ADECUADO
                    WHEN dc.stock_ideal IS NOT NULL AND dc.stock_actual >= dc.stock_ideal AND 
                         (dc.ventas_ultimos_${diasAnalisis}dias / ${diasAnalisis / 30}) <= dc.stock_actual * 0.5 THEN
                        'MANTENER STOCK - Rotación media, stock adecuado'
                    
                    -- ROTACIÓN BAJA Y STOCK ALTO
                    WHEN dc.stock_ideal IS NOT NULL AND dc.stock_actual > dc.stock_ideal AND dc.ventas_ultimos_${diasAnalisis}dias = 0 THEN
                        'REDUCIR COMPRAS - Sin rotación y stock alto'
                    
                    -- SITUACIÓN NORMAL
                    ELSE 'EVALUAR PERIÓDICAMENTE - Situación estable'
                END AS recomendacion_compra,
                -- CANTIDAD RECOMENDADA A COMPRAR
                CASE 
                    WHEN dc.stock_actual <= 0 THEN 
                        GREATEST(COALESCE(dc.stock_ideal, 10), (dc.ventas_ultimos_${diasAnalisis}dias / ${diasAnalisis / 30}) * 1.5)
                    
                    WHEN dc.stock_minimo IS NOT NULL AND dc.stock_actual < dc.stock_minimo THEN 
                        (COALESCE(dc.stock_ideal, dc.stock_minimo * 1.5) - dc.stock_actual) + (dc.ventas_ultimos_${diasAnalisis}dias / ${diasAnalisis / 30}) * 0.5
                    
                    WHEN (dc.ventas_ultimos_${diasAnalisis}dias / ${diasAnalisis / 30}) > dc.stock_actual THEN
                        ((dc.ventas_ultimos_${diasAnalisis}dias / ${diasAnalisis / 30}) * 1.2) - dc.stock_actual
                    
                    WHEN dc.stock_ideal IS NOT NULL AND dc.stock_actual < dc.stock_ideal AND 
                         (dc.ventas_ultimos_${diasAnalisis}dias / ${diasAnalisis / 30}) > dc.stock_actual * 0.7 THEN
                        dc.stock_ideal - dc.stock_actual
                    
                    ELSE 0
                END AS cantidad_recomendada_compra,
                -- ALERTAS
                CASE 
                    WHEN dc.stock_actual <= 0 THEN 'ALERTA ROJA - SIN STOCK'
                    WHEN dc.stock_minimo IS NOT NULL AND dc.stock_actual < dc.stock_minimo THEN 'ALERTA NARANJA - STOCK MÍNIMO'
                    WHEN dc.dias_stock_disponible < 7 THEN 'ALERTA AMARILLA - STOCK BAJO'
                    ELSE 'SITUACIÓN NORMAL'
                END AS nivel_alerta,
                -- INFORMACIÓN ADICIONAL
                uc.fecha_ultima_compra,
                uc.precio_promedio_compra,
                -- Días desde última compra usando cálculo simple (hasta fecha de corte)
                CASE 
                    WHEN uc.fecha_ultima_compra IS NOT NULL THEN
                        (${fechaCorte} - uc.fecha_ultima_compra)
                    ELSE -1
                END AS dias_desde_ultima_compra,
                -- Parámetros usados para el análisis
                ${diasAnalisis} AS dias_analisis_utilizados,
                ${fechaCorte}::text AS fecha_corte_utilizada
            FROM 
                datos_completos dc
            LEFT JOIN 
                ultima_compra uc ON dc.ide_inarti = uc.ide_inarti
        `,
      dtoIn,
    );

    query.addIntParam(1, dtoIn.ide_inarti);

    return await this.dataSource.createQuery(query);
  }

  async getProductosStockBajo(dtoIn: HeaderParamsDto & ProductosStockBajoDto) {
    const diasAnalisis = dtoIn.diasAnalisis || 90;
    const fechaCorte = dtoIn.fechaCorte ? `'${dtoIn.fechaCorte}'::date` : 'CURRENT_DATE';
    const diasAlertas = dtoIn.diasAlertas || 7;
    const incluirSinConfiguracion = dtoIn.incluirSinConfiguracion === 'false';

    const limitConfig = isDefined(dtoIn.limit) ? `LIMIT ${dtoIn.limit}` : '';

    const query = new SelectQuery(
      `
            WITH productos_stock_bajo AS (
                SELECT 
                    iart.ide_inarti,
                    iart.uuid,
                    iart.nombre_inarti,
                    iart.codigo_inarti,
                    uni.siglas_inuni,
                    iart.cant_stock1_inarti AS stock_minimo,
                    iart.cant_stock2_inarti AS stock_ideal,
                    -- Saldo actual
                    f_redondeo(
                        SUM(dci.cantidad_indci * tci.signo_intci), 
                        iart.decim_stock_inarti
                    ) AS saldo_actual,
                    -- Última compra
                    MAX(CASE WHEN tci.signo_intci = 1 THEN cci.fecha_trans_incci END) AS ultima_compra,
                    -- Última venta
                    MAX(CASE WHEN tci.signo_intci = -1 THEN cci.fecha_trans_incci END) AS ultima_venta,
                    -- Ventas últimos días
                    COALESCE((
                        SELECT SUM(dci2.cantidad_indci)
                        FROM inv_det_comp_inve dci2
                        JOIN inv_cab_comp_inve cci2 ON cci2.ide_incci = dci2.ide_incci
                        JOIN inv_tip_tran_inve tti2 ON tti2.ide_intti = cci2.ide_intti
                        JOIN inv_tip_comp_inve tci2 ON tci2.ide_intci = tti2.ide_intti
                        WHERE dci2.ide_inarti = iart.ide_inarti 
                        AND tci2.signo_intci = -1
                        AND cci2.fecha_trans_incci >= ${fechaCorte} - INTERVAL '${diasAnalisis} days'
                        AND cci2.fecha_trans_incci <= ${fechaCorte}
                        AND cci2.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                    ), 0) AS ventas_${diasAnalisis}dias
                FROM inv_articulo iart
                LEFT JOIN inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
                LEFT JOIN inv_det_comp_inve dci ON dci.ide_inarti = iart.ide_inarti
                LEFT JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                LEFT JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                LEFT JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                WHERE iart.ide_empr = ${dtoIn.ideEmpr}
                    AND iart.hace_kardex_inarti = true
                    AND iart.nivel_inarti = 'HIJO'
                    AND cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                    AND cci.fecha_trans_incci <= ${fechaCorte}
                GROUP BY 
                    iart.ide_inarti, iart.uuid, iart.nombre_inarti, iart.codigo_inarti, 
                    uni.siglas_inuni, iart.decim_stock_inarti,
                    iart.cant_stock1_inarti, iart.cant_stock2_inarti
                HAVING 
                    -- Cuando incluirSinConfiguracion es TRUE: solo productos CON configuración
                    ${
                      incluirSinConfiguracion
                        ? `(iart.cant_stock1_inarti IS NOT NULL OR iart.cant_stock2_inarti IS NOT NULL)
                           AND (
                               SUM(dci.cantidad_indci * tci.signo_intci) <= 0
                               OR (iart.cant_stock1_inarti IS NOT NULL AND SUM(dci.cantidad_indci * tci.signo_intci) < iart.cant_stock1_inarti)
                               OR (iart.cant_stock2_inarti IS NOT NULL AND SUM(dci.cantidad_indci * tci.signo_intci) < iart.cant_stock2_inarti)
                           )`
                        : `-- Cuando es FALSE: buscar TODOS los productos con stock bajo
                           (
                               -- Productos sin stock
                               SUM(dci.cantidad_indci * tci.signo_intci) <= 0
                               -- Productos con configuración y stock bajo
                               OR (iart.cant_stock1_inarti IS NOT NULL AND SUM(dci.cantidad_indci * tci.signo_intci) < iart.cant_stock1_inarti)
                               OR (iart.cant_stock2_inarti IS NOT NULL AND SUM(dci.cantidad_indci * tci.signo_intci) < iart.cant_stock2_inarti)
                               -- Productos sin configuración y stock bajo (menos de 10 unidades)
                               OR (iart.cant_stock1_inarti IS NULL AND iart.cant_stock2_inarti IS NULL AND SUM(dci.cantidad_indci * tci.signo_intci) <= 10)
                           )`
                    }
            )
            SELECT 
                psb.ide_inarti,
                psb.uuid,
                psb.nombre_inarti,
                psb.codigo_inarti,
                psb.siglas_inuni,
                psb.saldo_actual,
                psb.stock_minimo,
                psb.stock_ideal,
                psb.ultima_compra,
                psb.ultima_venta,
                -- Días desde última compra
                CASE 
                    WHEN psb.ultima_compra IS NOT NULL THEN
                        (${fechaCorte} - psb.ultima_compra)
                    ELSE 999
                END AS dias_desde_ultima_compra,
                -- Días desde última venta (CALCULADO AQUÍ)
                CASE 
                    WHEN psb.ultima_venta IS NOT NULL THEN
                        (${fechaCorte} - psb.ultima_venta)
                    ELSE 999
                END AS dias_desde_ultima_venta,
                psb.ventas_${diasAnalisis}dias,
                -- Promedio venta diario
                CASE 
                    WHEN psb.ventas_${diasAnalisis}dias > 0 THEN
                        ROUND(psb.ventas_${diasAnalisis}dias / ${diasAnalisis}, 2)
                    ELSE 0
                END AS promedio_venta_diario,
                -- Días stock restante
                CASE 
                    WHEN psb.ventas_${diasAnalisis}dias > 0 AND (psb.ventas_${diasAnalisis}dias / ${diasAnalisis}) > 0 THEN 
                        ROUND(psb.saldo_actual / (psb.ventas_${diasAnalisis}dias / ${diasAnalisis}), 1)
                    ELSE 999
                END AS dias_stock_restante,
                -- Estado y prioridad (LÓGICA MEJORADA - USANDO CÁLCULOS DIRECTOS)
                CASE
                    WHEN psb.saldo_actual <= 0 AND psb.ventas_${diasAnalisis}dias > 0 THEN 
                        'SIN STOCK - ALTA ROTACIÓN'
                    WHEN psb.saldo_actual <= 0 AND psb.ventas_${diasAnalisis}dias = 0 AND (${fechaCorte} - psb.ultima_venta) <= 180 THEN 
                        'SIN STOCK - ROTACIÓN MEDIA'
                    WHEN psb.saldo_actual <= 0 THEN 
                        'SIN STOCK - BAJA ROTACIÓN'
                    WHEN psb.stock_minimo IS NOT NULL AND psb.saldo_actual < psb.stock_minimo AND psb.ventas_${diasAnalisis}dias > 0 THEN 
                        'STOCK CRÍTICO - ALTA ROTACIÓN'
                    WHEN psb.stock_minimo IS NOT NULL AND psb.saldo_actual < psb.stock_minimo THEN 
                        'STOCK CRÍTICO'
                    WHEN psb.stock_ideal IS NOT NULL AND psb.saldo_actual < psb.stock_ideal AND psb.ventas_${diasAnalisis}dias > 0 THEN 
                        'STOCK BAJO - ALTA ROTACIÓN'
                    WHEN psb.stock_ideal IS NOT NULL AND psb.saldo_actual < psb.stock_ideal THEN 
                        'STOCK BAJO'
                    WHEN psb.stock_minimo IS NULL AND psb.stock_ideal IS NULL AND psb.saldo_actual <= 10 AND psb.ventas_${diasAnalisis}dias > 0 THEN
                        'STOCK BAJO (SIN CONFIG) - CON ROTACIÓN'
                    WHEN psb.stock_minimo IS NULL AND psb.stock_ideal IS NULL AND psb.saldo_actual <= 10 THEN
                        'STOCK BAJO (SIN CONFIG)'
                    WHEN psb.ventas_${diasAnalisis}dias > 0 AND 
                         (psb.ventas_${diasAnalisis}dias / ${diasAnalisis}) > 0 AND
                         psb.saldo_actual / (psb.ventas_${diasAnalisis}dias / ${diasAnalisis}) <= ${diasAlertas} THEN 
                        'ALERTA PREVENTIVA'
                    ELSE 'STOCK ADECUADO'
                END AS estado_stock,
                -- Prioridad numérica para ordenamiento (LÓGICA MEJORADA - USANDO CÁLCULOS DIRECTOS)
                CASE
                    WHEN psb.saldo_actual <= 0 AND psb.ventas_${diasAnalisis}dias > 0 THEN 1
                    WHEN psb.stock_minimo IS NOT NULL AND psb.saldo_actual < psb.stock_minimo AND psb.ventas_${diasAnalisis}dias > 0 THEN 2
                    WHEN psb.saldo_actual <= 0 AND psb.ventas_${diasAnalisis}dias = 0 AND (${fechaCorte} - psb.ultima_venta) <= 180 THEN 3
                    WHEN psb.stock_minimo IS NOT NULL AND psb.saldo_actual < psb.stock_minimo THEN 4
                    WHEN psb.stock_ideal IS NOT NULL AND psb.saldo_actual < psb.stock_ideal AND psb.ventas_${diasAnalisis}dias > 0 THEN 5
                    WHEN psb.stock_ideal IS NOT NULL AND psb.saldo_actual < psb.stock_ideal THEN 6
                    WHEN psb.stock_minimo IS NULL AND psb.stock_ideal IS NULL AND psb.saldo_actual <= 10 AND psb.ventas_${diasAnalisis}dias > 0 THEN 7
                    WHEN psb.stock_minimo IS NULL AND psb.stock_ideal IS NULL AND psb.saldo_actual <= 10 THEN 8
                    WHEN psb.ventas_${diasAnalisis}dias > 0 AND 
                         (psb.ventas_${diasAnalisis}dias / ${diasAnalisis}) > 0 AND
                         psb.saldo_actual / (psb.ventas_${diasAnalisis}dias / ${diasAnalisis}) <= ${diasAlertas} THEN 9
                    ELSE 10
                END AS prioridad_compra,
                -- Cantidad recomendada (LÓGICA MEJORADA)
                CASE
                    WHEN psb.saldo_actual <= 0 AND psb.ventas_${diasAnalisis}dias > 0 THEN 
                        GREATEST(COALESCE(psb.stock_ideal, psb.stock_minimo, 50), (psb.ventas_${diasAnalisis}dias / ${diasAnalisis}) * 30)
                    WHEN psb.saldo_actual <= 0 AND psb.ventas_${diasAnalisis}dias = 0 AND (${fechaCorte} - psb.ultima_venta) <= 180 THEN 
                        COALESCE(psb.stock_ideal, psb.stock_minimo, 25)
                    WHEN psb.saldo_actual <= 0 THEN 
                        COALESCE(psb.stock_ideal, psb.stock_minimo, 10)
                    WHEN psb.stock_minimo IS NOT NULL AND psb.saldo_actual < psb.stock_minimo THEN 
                        GREATEST(psb.stock_minimo - psb.saldo_actual, COALESCE((psb.ventas_${diasAnalisis}dias / ${diasAnalisis}) * ${diasAlertas}, 5))
                    WHEN psb.stock_ideal IS NOT NULL AND psb.saldo_actual < psb.stock_ideal THEN 
                        psb.stock_ideal - psb.saldo_actual
                    WHEN psb.stock_minimo IS NULL AND psb.stock_ideal IS NULL AND psb.saldo_actual <= 10 THEN
                        GREATEST(25 - psb.saldo_actual, COALESCE((psb.ventas_${diasAnalisis}dias / ${diasAnalisis}) * 15, 15))
                    WHEN psb.ventas_${diasAnalisis}dias > 0 AND 
                         (psb.ventas_${diasAnalisis}dias / ${diasAnalisis}) > 0 AND
                         psb.saldo_actual / (psb.ventas_${diasAnalisis}dias / ${diasAnalisis}) <= ${diasAlertas} THEN 
                        ((psb.ventas_${diasAnalisis}dias / ${diasAnalisis}) * ${diasAlertas} * 2) - psb.saldo_actual
                    ELSE 0
                END AS cantidad_recomendada,
                -- Urgencia compra (LÓGICA MEJORADA - USANDO CÁLCULOS DIRECTOS)
                CASE
                    WHEN psb.saldo_actual <= 0 AND psb.ventas_${diasAnalisis}dias > 0 THEN 'COMPRAR URGENTE'
                    WHEN psb.stock_minimo IS NOT NULL AND psb.saldo_actual < psb.stock_minimo AND psb.ventas_${diasAnalisis}dias > 0 THEN 'COMPRAR INMEDIATO'
                    WHEN psb.saldo_actual <= 0 AND psb.ventas_${diasAnalisis}dias = 0 AND (${fechaCorte} - psb.ultima_venta) <= 180 THEN 'EVALUAR COMPRA'
                    WHEN psb.stock_minimo IS NOT NULL AND psb.saldo_actual < psb.stock_minimo THEN 'COMPRAR PRONTO'
                    WHEN psb.stock_ideal IS NOT NULL AND psb.saldo_actual < psb.stock_ideal AND psb.ventas_${diasAnalisis}dias > 0 THEN 'COMPRAR PRONTO'
                    WHEN psb.stock_ideal IS NOT NULL AND psb.saldo_actual < psb.stock_ideal THEN 'PLANIFICAR COMPRA'
                    WHEN psb.stock_minimo IS NULL AND psb.stock_ideal IS NULL AND psb.saldo_actual <= 10 AND psb.ventas_${diasAnalisis}dias > 0 THEN 'EVALUAR COMPRA'
                    WHEN psb.stock_minimo IS NULL AND psb.stock_ideal IS NULL AND psb.saldo_actual <= 10 THEN 'REVISAR NECESIDAD'
                    WHEN psb.ventas_${diasAnalisis}dias > 0 AND 
                         (psb.ventas_${diasAnalisis}dias / ${diasAnalisis}) > 0 AND
                         psb.saldo_actual / (psb.ventas_${diasAnalisis}dias / ${diasAnalisis}) <= ${diasAlertas} THEN 'PLANIFICAR COMPRA'
                    ELSE 'NO REQUIERE COMPRA'
                END AS urgencia_compra
            FROM 
                productos_stock_bajo psb
            ORDER BY 
                prioridad_compra ASC,
                dias_stock_restante ASC,
                promedio_venta_diario DESC
            ${limitConfig}
        `,
      dtoIn,
    );

    return await this.dataSource.createQuery(query);
  }

  async getProductosMayorStock(dtoIn: HeaderParamsDto & ProductosMayorStockDto) {
    const diasAnalisis = dtoIn.diasAnalisis || 90;
    const fechaCorte = dtoIn.fechaCorte ? `'${dtoIn.fechaCorte}'::date` : 'CURRENT_DATE';
    const limitConfig = isDefined(dtoIn.limit) ? `LIMIT ${dtoIn.limit}` : '';

    const query = new SelectQuery(
      `
        WITH productos_con_stock AS (
            SELECT 
                iart.ide_inarti,
                iart.uuid,
                iart.nombre_inarti,
                iart.codigo_inarti,
                uni.siglas_inuni,
                iart.cant_stock1_inarti AS stock_minimo,
                iart.cant_stock2_inarti AS stock_ideal,
                -- Saldo actual
                f_redondeo(
                    SUM(dci.cantidad_indci * tci.signo_intci), 
                    iart.decim_stock_inarti
                ) AS saldo_actual,
                -- Fecha último ingreso
                MAX(CASE WHEN tci.signo_intci > 0 THEN cci.fecha_trans_incci END) AS fecha_ultimo_ingreso,
                -- Fecha último movimiento (cualquier tipo)
                MAX(cci.fecha_trans_incci) AS fecha_ultimo_movimiento,
                -- Precio promedio
                CASE 
                    WHEN SUM(CASE WHEN tci.signo_intci > 0 THEN dci.cantidad_indci ELSE 0 END) > 0 
                    THEN ROUND(
                        SUM(CASE WHEN tci.signo_intci > 0 THEN dci.precio_indci * dci.cantidad_indci ELSE 0 END) / 
                        SUM(CASE WHEN tci.signo_intci > 0 THEN dci.cantidad_indci ELSE 0 END), 
                        4
                    )
                    ELSE NULL
                END AS precio_promedio_ingresos,
                -- Ventas últimos días (nombre fijo)
                COALESCE((
                    SELECT SUM(dci2.cantidad_indci)
                    FROM inv_det_comp_inve dci2
                    JOIN inv_cab_comp_inve cci2 ON cci2.ide_incci = dci2.ide_incci
                    JOIN inv_tip_tran_inve tti2 ON tti2.ide_intti = cci2.ide_intti
                    JOIN inv_tip_comp_inve tci2 ON tci2.ide_intci = tti2.ide_intti
                    WHERE dci2.ide_inarti = iart.ide_inarti 
                    AND tci2.signo_intci = -1
                    AND cci2.fecha_trans_incci >= ${fechaCorte} - INTERVAL '${diasAnalisis} days'
                    AND cci2.fecha_trans_incci <= ${fechaCorte}
                    AND cci2.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                ), 0) AS ventas_ultimo_periodo
            FROM inv_articulo iart
            LEFT JOIN inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
            LEFT JOIN inv_det_comp_inve dci ON dci.ide_inarti = iart.ide_inarti
            LEFT JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
            LEFT JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
            LEFT JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
            WHERE iart.ide_empr = ${dtoIn.ideEmpr}
            AND cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
            AND cci.fecha_trans_incci <= ${fechaCorte}
            GROUP BY 
                iart.ide_inarti, iart.uuid, iart.nombre_inarti, iart.codigo_inarti, 
                uni.siglas_inuni, iart.decim_stock_inarti,
                iart.cant_stock1_inarti, iart.cant_stock2_inarti
            HAVING SUM(dci.cantidad_indci * tci.signo_intci) > 0
        )
        SELECT 
            pcs.ide_inarti,
            pcs.uuid,
            pcs.nombre_inarti,
            pcs.codigo_inarti,
            pcs.siglas_inuni,
            pcs.saldo_actual,
            pcs.stock_minimo,
            pcs.stock_ideal,
            pcs.precio_promedio_ingresos,
            ROUND(COALESCE(pcs.precio_promedio_ingresos, 0) * pcs.saldo_actual, 2) AS valor_total_stock,
            pcs.ventas_ultimo_periodo,
            pcs.fecha_ultimo_ingreso,
            pcs.fecha_ultimo_movimiento,
            -- Días desde último ingreso
            CASE 
                WHEN pcs.fecha_ultimo_ingreso IS NOT NULL THEN
                    (${fechaCorte} - pcs.fecha_ultimo_ingreso)
                ELSE 999
            END AS dias_desde_ultimo_ingreso,
            -- Días sin movimiento (desde cualquier movimiento)
            CASE 
                WHEN pcs.fecha_ultimo_movimiento IS NOT NULL THEN
                    (${fechaCorte} - pcs.fecha_ultimo_movimiento)
                ELSE 999
            END AS dias_sin_movimiento,
            -- Rotación (nombre fijo)
            CASE 
                WHEN pcs.saldo_actual > 0 THEN
                    ROUND((pcs.ventas_ultimo_periodo * 100.0) / pcs.saldo_actual, 2)
                ELSE 0
            END AS porcentaje_rotacion,
            -- Días de stock disponible (nombre fijo)
            CASE 
                WHEN pcs.ventas_ultimo_periodo > 0 THEN
                    ROUND(pcs.saldo_actual / (pcs.ventas_ultimo_periodo / ${diasAnalisis}), 1)
                ELSE 999
            END AS dias_stock_disponible,
            -- Clasificación mejorada con información de movimiento
            CASE 
                WHEN pcs.stock_ideal IS NOT NULL AND pcs.saldo_actual > pcs.stock_ideal * 3 THEN 
                    CASE 
                        WHEN (${fechaCorte} - pcs.fecha_ultimo_movimiento) > 180 THEN 'STOCK MUY ALTO - INACTIVO'
                        ELSE 'STOCK MUY ALTO'
                    END
                WHEN pcs.stock_ideal IS NOT NULL AND pcs.saldo_actual > pcs.stock_ideal * 2 THEN 
                    CASE 
                        WHEN (${fechaCorte} - pcs.fecha_ultimo_movimiento) > 180 THEN 'STOCK ALTO - INACTIVO'
                        ELSE 'STOCK ALTO'
                    END
                WHEN pcs.stock_ideal IS NOT NULL AND pcs.saldo_actual > pcs.stock_ideal THEN 
                    CASE 
                        WHEN (${fechaCorte} - pcs.fecha_ultimo_movimiento) > 180 THEN 'STOCK SOBRE IDEAL - INACTIVO'
                        ELSE 'STOCK SOBRE IDEAL'
                    END
                WHEN pcs.saldo_actual > 1000 THEN 
                    CASE 
                        WHEN (${fechaCorte} - pcs.fecha_ultimo_movimiento) > 180 THEN 'STOCK MASIVO - INACTIVO'
                        ELSE 'STOCK MASIVO'
                    END
                WHEN pcs.saldo_actual > 500 THEN 
                    CASE 
                        WHEN (${fechaCorte} - pcs.fecha_ultimo_movimiento) > 180 THEN 'STOCK GRANDE - INACTIVO'
                        ELSE 'STOCK GRANDE'
                    END
                WHEN (${fechaCorte} - pcs.fecha_ultimo_movimiento) > 365 THEN 'STOCK INACTIVO'
                ELSE 'STOCK NORMAL'
            END AS clasificacion_stock,
            -- Recomendación mejorada con información de movimiento
            CASE 
                WHEN pcs.ventas_ultimo_periodo = 0 AND pcs.saldo_actual > 100 AND (${fechaCorte} - pcs.fecha_ultimo_movimiento) > 180 THEN 
                    'REVISAR ROTACIÓN - PRODUCTO INACTIVO'
                WHEN pcs.ventas_ultimo_periodo = 0 AND pcs.saldo_actual > 100 THEN 
                    'REVISAR ROTACIÓN'
                WHEN pcs.stock_ideal IS NOT NULL AND pcs.saldo_actual > pcs.stock_ideal * 3 AND (${fechaCorte} - pcs.fecha_ultimo_movimiento) > 180 THEN 
                    'REDUCIR STOCK URGENTE - PRODUCTO INACTIVO'
                WHEN pcs.stock_ideal IS NOT NULL AND pcs.saldo_actual > pcs.stock_ideal * 3 THEN 
                    'REDUCIR STOCK'
                WHEN (pcs.ventas_ultimo_periodo * 100.0 / NULLIF(pcs.saldo_actual, 0)) < 5 AND (${fechaCorte} - pcs.fecha_ultimo_movimiento) > 180 THEN 
                    'BAJA ROTACIÓN - CONSIDERAR DESHACERSE'
                WHEN (pcs.ventas_ultimo_periodo * 100.0 / NULLIF(pcs.saldo_actual, 0)) < 5 THEN 
                    'BAJA ROTACIÓN - PROMOCIONAR'
                WHEN (${fechaCorte} - pcs.fecha_ultimo_movimiento) > 365 THEN 
                    'PRODUCTO MUY INACTIVO - REVISAR NECESIDAD'
                WHEN (${fechaCorte} - pcs.fecha_ultimo_movimiento) > 180 THEN 
                    'PRODUCTO INACTIVO - MONITOREAR'
                ELSE 'SITUACIÓN NORMAL'
            END AS recomendacion,
            -- Parámetros utilizados para referencia
            ${diasAnalisis} AS dias_analisis,
            ${fechaCorte}::text AS fecha_corte
        FROM 
            productos_con_stock pcs
        ORDER BY 
            pcs.saldo_actual DESC,
            dias_sin_movimiento DESC
        ${limitConfig}
    `,
      dtoIn,
    );

    return await this.dataSource.createQuery(query);
  }

  /**
   * Retorna el reporte de valor en inventario por período anual  Costo Promedio Mensual
   * @param dtoIn
   * @returns
   */
  async getReporteValorInventarioProducto(dtoIn: VentasMensualesDto & HeaderParamsDto) {
    if (dtoIn.periodo === 0) {
      dtoIn.periodo = getYear(new Date());
      dtoIn.ide_inarti = -1;
    }

    const query = new SelectQuery(
      `
            WITH Meses AS (
                SELECT
                    gm.nombre_gemes,
                    gm.ide_gemes,
                    TO_DATE('${dtoIn.periodo}-' || LPAD(gm.ide_gemes::text, 2, '0') || '-01', 'YYYY-MM-DD') AS inicio_mes,
                    (TO_DATE('${dtoIn.periodo}-' || LPAD(gm.ide_gemes::text, 2, '0') || '-01', 'YYYY-MM-DD') + INTERVAL '1 MONTH' - INTERVAL '1 DAY') AS fin_mes
                FROM
                    gen_mes gm
            ),
            MovimientosInventario AS (
                SELECT
                    m.ide_gemes,
                    m.inicio_mes,
                    m.fin_mes,
                    -- Saldos físicos
                    SUM(CASE
                        WHEN cci.fecha_trans_incci < m.inicio_mes THEN dci.cantidad_indci * tci.signo_intci
                        ELSE 0
                    END) AS saldo_inicial,
                    SUM(CASE
                        WHEN cci.fecha_trans_incci <= m.fin_mes THEN dci.cantidad_indci * tci.signo_intci
                        ELSE 0
                    END) AS saldo_final,
                    -- Ingresos (compras)
                    SUM(CASE
                        WHEN cci.fecha_trans_incci BETWEEN m.inicio_mes AND m.fin_mes AND tci.signo_intci = 1 THEN dci.cantidad_indci
                        ELSE 0
                    END) AS ingresos_cantidad,
                    SUM(CASE
                        WHEN cci.fecha_trans_incci BETWEEN m.inicio_mes AND m.fin_mes AND tci.signo_intci = 1 THEN dci.cantidad_indci * dci.precio_indci
                        ELSE 0
                    END) AS ingresos_valor,
                    -- Egresos (ventas)
                    SUM(CASE
                        WHEN cci.fecha_trans_incci BETWEEN m.inicio_mes AND m.fin_mes AND tci.signo_intci = -1 THEN dci.cantidad_indci
                        ELSE 0
                    END) AS egresos_cantidad,
                    SUM(CASE
                        WHEN cci.fecha_trans_incci BETWEEN m.inicio_mes AND m.fin_mes AND tci.signo_intci = -1 THEN dci.cantidad_indci * dci.precio_indci
                        ELSE 0
                    END) AS egresos_valor
                FROM
                    Meses m
                LEFT JOIN inv_det_comp_inve dci ON dci.ide_inarti = $1
                INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci AND cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                INNER JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                INNER JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                WHERE cci.ide_empr = ${dtoIn.ideEmpr}
                GROUP BY
                    m.ide_gemes, m.inicio_mes, m.fin_mes
            ),
            ComprasAcumuladas AS (
                SELECT
                    m.ide_gemes,
                    -- Total comprado hasta este mes (cantidad y valor)
                    SUM(CASE
                        WHEN cci.fecha_trans_incci <= m.fin_mes AND tci.signo_intci = 1 THEN dci.cantidad_indci
                        ELSE 0
                    END) AS compras_cantidad_acum,
                    SUM(CASE
                        WHEN cci.fecha_trans_incci <= m.fin_mes AND tci.signo_intci = 1 THEN dci.cantidad_indci * dci.precio_indci
                        ELSE 0
                    END) AS compras_valor_acum
                FROM
                    Meses m
                LEFT JOIN inv_det_comp_inve dci ON dci.ide_inarti = $2
                INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci AND cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                INNER JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                INNER JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                WHERE cci.ide_empr = ${dtoIn.ideEmpr}
                GROUP BY
                    m.ide_gemes
            ),
            CostoPromedioAcumulado AS (
                SELECT
                    m.ide_gemes,
                    -- Costo promedio acumulado: total valor compras / total cantidad compras
                    CASE 
                        WHEN ca.compras_cantidad_acum > 0 
                        THEN ca.compras_valor_acum / ca.compras_cantidad_acum
                        ELSE 0 
                    END AS costo_promedio_acumulado,
                    ca.compras_cantidad_acum,
                    ca.compras_valor_acum
                FROM Meses m
                LEFT JOIN ComprasAcumuladas ca ON m.ide_gemes = ca.ide_gemes
            )
            SELECT
                m.ide_gemes,
                m.nombre_gemes,
                -- Inventario físico
                COALESCE(mi.saldo_inicial, 0) AS saldo_inicial,
                COALESCE(mi.ingresos_cantidad, 0) AS ingresos,
                COALESCE(mi.egresos_cantidad, 0) AS egresos,
                COALESCE(mi.saldo_final, 0) AS saldo_final,
                -- Costo y valor (con costo promedio acumulado)
                COALESCE(cpa.costo_promedio_acumulado, 0) AS costo_promedio,
                COALESCE(mi.saldo_inicial * cpa.costo_promedio_acumulado, 0) AS valor_inicial,
                COALESCE(mi.ingresos_cantidad * cpa.costo_promedio_acumulado, 0) AS valor_ingresos,
                COALESCE(mi.egresos_cantidad * cpa.costo_promedio_acumulado, 0) AS valor_egresos,
                COALESCE(mi.saldo_final * cpa.costo_promedio_acumulado, 0) AS valor_final,
                -- Ventas (desde inventario)
                COALESCE(mi.egresos_cantidad, 0) AS cantidad_vendida,
                COALESCE(mi.egresos_valor, 0) AS ventas_brutas,
                -- Compras (desde inventario)
                COALESCE(mi.ingresos_cantidad, 0) AS cantidad_comprada,
                COALESCE(mi.ingresos_valor, 0) AS compras_brutas,
                -- Para debug
                COALESCE(cpa.compras_cantidad_acum, 0) AS compras_acumuladas_cantidad,
                COALESCE(cpa.compras_valor_acum, 0) AS compras_acumuladas_valor,
                -- Indicadores
                CASE 
                    WHEN COALESCE(mi.saldo_final, 0) > 0 THEN 
                        COALESCE(mi.egresos_cantidad, 0) / mi.saldo_final 
                    ELSE 0 
                END AS rotacion_inventario,
                CASE 
                    WHEN COALESCE(mi.egresos_cantidad, 0) > 0 THEN 
                        (COALESCE(mi.saldo_final, 0) / mi.egresos_cantidad) * 30 
                    ELSE 0 
                END AS dias_inventario,
                CASE 
                    WHEN COALESCE(mi.egresos_valor, 0) > 0 THEN 
                        ((mi.egresos_valor - COALESCE(mi.egresos_cantidad * cpa.costo_promedio_acumulado, 0)) / mi.egresos_valor) * 100 
                    ELSE 0 
                END AS margen_bruto_porcentaje
            FROM
                Meses m
            LEFT JOIN MovimientosInventario mi ON m.ide_gemes = mi.ide_gemes
            LEFT JOIN CostoPromedioAcumulado cpa ON m.ide_gemes = cpa.ide_gemes
            ORDER BY
                m.ide_gemes
            `,
      dtoIn,
    );

    query.addIntParam(1, dtoIn.ide_inarti);
    query.addIntParam(2, dtoIn.ide_inarti);

    return await this.dataSource.createQuery(query);
  }

  /**
   * Retorna el stock de todos los productos por mes (inicio y fin de mes)  Costo Promedio Mensual
   * @param dtoIn
   * @returns
   */
  async getReporteValorInventarioGlobal(dtoIn: AnalisisDto & HeaderParamsDto) {
    if (dtoIn.periodo === 0) {
      dtoIn.periodo = getYear(new Date());
    }

    const whereClause = dtoIn.ide_inbod ? ` AND cci.ide_inbod = ${dtoIn.ide_inbod}` : '';

    const query = new SelectQuery(
      `
        WITH Meses AS (
            SELECT
                gm.nombre_gemes,
                gm.ide_gemes,
                DATE('${dtoIn.periodo}-' || LPAD(gm.ide_gemes::text, 2, '0') || '-01') AS inicio_mes,
                (DATE('${dtoIn.periodo}-' || LPAD(gm.ide_gemes::text, 2, '0') || '-01') + INTERVAL '1 MONTH' - INTERVAL '1 DAY') AS fin_mes
            FROM gen_mes gm
            WHERE gm.ide_gemes BETWEEN 1 AND 12
        ),
        CostoPromedioMensual AS (
            SELECT
                EXTRACT(MONTH FROM cci.fecha_trans_incci) AS mes,
                dci.ide_inarti,
                CASE 
                    WHEN SUM(CASE WHEN tci.signo_intci = 1 THEN dci.cantidad_indci ELSE 0 END) > 0 
                    THEN SUM(CASE WHEN tci.signo_intci = 1 THEN dci.cantidad_indci * dci.precio_indci ELSE 0 END) / 
                         SUM(CASE WHEN tci.signo_intci = 1 THEN dci.cantidad_indci ELSE 0 END)
                    ELSE 0 
                END AS costo_promedio
            FROM inv_det_comp_inve dci
            INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                AND cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                AND cci.ide_empr = ${dtoIn.ideEmpr}
                AND EXTRACT(YEAR FROM cci.fecha_trans_incci) = ${dtoIn.periodo}
            INNER JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
            INNER JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
            INNER JOIN inv_articulo iart ON iart.ide_inarti = dci.ide_inarti
            WHERE iart.hace_kardex_inarti = true
                and iart.nivel_inarti = 'HIJO'
                AND tci.signo_intci = 1  -- Solo compras/ingresos
                ${whereClause}
            GROUP BY EXTRACT(MONTH FROM cci.fecha_trans_incci), dci.ide_inarti
        ),
        StockMensual AS (
            SELECT
                m.ide_gemes,
                dci.ide_inarti,
                SUM(CASE 
                    WHEN cci.fecha_trans_incci < m.inicio_mes THEN 
                        dci.cantidad_indci * tci.signo_intci
                    ELSE 0
                END) AS stock_inicial,
                SUM(CASE 
                    WHEN cci.fecha_trans_incci <= m.fin_mes THEN 
                        dci.cantidad_indci * tci.signo_intci
                    ELSE 0
                END) AS stock_final
            FROM Meses m
            INNER JOIN inv_det_comp_inve dci ON 1=1
            INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                AND cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                AND cci.ide_empr = ${dtoIn.ideEmpr}
            INNER JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
            INNER JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
            INNER JOIN inv_articulo iart ON iart.ide_inarti = dci.ide_inarti
            WHERE iart.hace_kardex_inarti = true
            and iart.nivel_inarti = 'HIJO'
            ${whereClause}
            GROUP BY m.ide_gemes, dci.ide_inarti
        ),
        ValorInventario AS (
            SELECT
                sm.ide_gemes,
                SUM(sm.stock_inicial * COALESCE(cpm.costo_promedio, 0)) AS valor_inicial,
                SUM(sm.stock_final * COALESCE(cpm.costo_promedio, 0)) AS valor_final
            FROM StockMensual sm
            LEFT JOIN CostoPromedioMensual cpm ON sm.ide_gemes = cpm.mes AND sm.ide_inarti = cpm.ide_inarti
            GROUP BY sm.ide_gemes
        )
        SELECT
            m.ide_gemes,
            m.nombre_gemes,
            ROUND(COALESCE(vi.valor_inicial, 0), 2) AS valor_inicial,
            ROUND(COALESCE(vi.valor_final, 0), 2) AS valor_final,
            ROUND(COALESCE(vi.valor_final - vi.valor_inicial, 0), 2) AS variacion_mes
        FROM Meses m
        LEFT JOIN ValorInventario vi ON m.ide_gemes = vi.ide_gemes
        ORDER BY m.ide_gemes
        `,
      dtoIn,
    );

    return await this.dataSource.createQuery(query);
  }
  async getReporteIngresosEgresos(dtoIn: AnalisisDto & HeaderParamsDto) {
    dtoIn.ide_inarti = undefined;
    return this.queryReporteIngresosEgresos(dtoIn);
  }

  async getReporteIngresosEgresosProducto(dtoIn: AnalisisDto & HeaderParamsDto) {
    if (!dtoIn.ide_inarti) {
      throw new BadRequestException('ide_inarti es obligatorio.');
    }
    return this.queryReporteIngresosEgresos(dtoIn);
  }

  private async queryReporteIngresosEgresos(dtoIn: AnalisisDto & HeaderParamsDto) {
    if (dtoIn.periodo === 0) {
      dtoIn.periodo = getYear(new Date());
    }
    let whereClause = dtoIn.ide_inbod ? ` AND cci.ide_inbod = ${dtoIn.ide_inbod}` : '';
    whereClause += dtoIn.ide_inarti ? ` AND dci.ide_inarti = ${dtoIn.ide_inarti}` : '';
    const query = new SelectQuery(
      `
            WITH Meses AS (
                SELECT
                    gm.nombre_gemes,
                    gm.ide_gemes,
                    DATE('${dtoIn.periodo}-' || LPAD(gm.ide_gemes::text, 2, '0') || '-01') AS inicio_mes,
                    (DATE('${dtoIn.periodo}-' || LPAD(gm.ide_gemes::text, 2, '0') || '-01') + INTERVAL '1 MONTH' - INTERVAL '1 DAY') AS fin_mes
                FROM gen_mes gm
                WHERE gm.ide_gemes BETWEEN 1 AND 12
            ),
            MovimientosMensuales AS (
                SELECT
                    EXTRACT(MONTH FROM cci.fecha_trans_incci) AS mes,
                    SUM(CASE WHEN tci.signo_intci = 1 THEN dci.cantidad_indci * dci.precio_indci ELSE 0 END) AS total_ingresos,
                    SUM(CASE WHEN tci.signo_intci = -1 THEN dci.cantidad_indci * dci.precio_indci ELSE 0 END) AS total_egresos,
                    SUM(CASE WHEN tci.signo_intci = 1 THEN dci.cantidad_indci ELSE 0 END) AS cantidad_ingresos,
                    SUM(CASE WHEN tci.signo_intci = -1 THEN dci.cantidad_indci ELSE 0 END) AS cantidad_egresos
                FROM inv_det_comp_inve dci
                INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                    AND cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                    AND cci.ide_empr = ${dtoIn.ideEmpr}
                    AND EXTRACT(YEAR FROM cci.fecha_trans_incci) = ${dtoIn.periodo}
                INNER JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                INNER JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                INNER JOIN inv_articulo iart ON iart.ide_inarti = dci.ide_inarti
                WHERE iart.hace_kardex_inarti = true
                AND iart.nivel_inarti = 'HIJO'
                AND dci.precio_indci > 0
                ${whereClause}
                GROUP BY EXTRACT(MONTH FROM cci.fecha_trans_incci)
            )
            SELECT
                m.ide_gemes,
                m.nombre_gemes,
                ROUND(COALESCE(mm.total_ingresos, 0), 2) AS total_ingresos,
                ROUND(COALESCE(mm.total_egresos, 0), 2) AS total_egresos,
                ROUND(COALESCE(mm.total_ingresos - mm.total_egresos, 0), 2) AS diferencia,
                COALESCE(mm.cantidad_ingresos, 0) AS cantidad_ingresos,
                COALESCE(mm.cantidad_egresos, 0) AS cantidad_egresos,
                CASE 
                    WHEN COALESCE(mm.total_egresos, 0) > 0 
                    THEN ROUND((COALESCE(mm.total_ingresos, 0) / COALESCE(mm.total_egresos, 0)) * 100, 2)
                    ELSE 0 
                END AS porcentaje_ingreso_vs_egreso
            FROM Meses m
            LEFT JOIN MovimientosMensuales mm ON m.ide_gemes = mm.mes
            ORDER BY m.ide_gemes
            `,
      dtoIn,
    );

    return await this.dataSource.createQuery(query);
  }

  /**
   * Clasificación ABC para enfoque en productos importantes
   */
  async getAnalisisABCInventario(dtoIn: HeaderParamsDto & AnalisisDto) {
    const limitConfig = isDefined(dtoIn.limit) ? `LIMIT ${dtoIn.limit}` : '';
    const query = new SelectQuery(
      `
            WITH ValorInventario AS (
                SELECT 
                    iart.ide_inarti,
                    iart.nombre_inarti,
                    uni.siglas_inuni,
                    SUM(dci.cantidad_indci * tci.signo_intci) as stock_actual,
                    AVG(CASE WHEN tci.signo_intci = 1 THEN dci.precio_indci ELSE NULL END) as costo_promedio,
                    SUM(dci.cantidad_indci * tci.signo_intci) * 
                    AVG(CASE WHEN tci.signo_intci = 1 THEN dci.precio_indci ELSE NULL END) as valor_inventario
                FROM inv_articulo iart
                LEFT JOIN inv_det_comp_inve dci ON iart.ide_inarti = dci.ide_inarti
                LEFT JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                LEFT JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                LEFT JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                LEFT JOIN inv_unidad uni ON iart.ide_inuni = uni.ide_inuni
                WHERE cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                    AND cci.ide_empr = ${dtoIn.ideEmpr}
                    AND EXTRACT(YEAR FROM cci.fecha_trans_incci) = ${dtoIn.periodo}
                    and hace_kardex_inarti = true
                    and nivel_inarti = 'HIJO'
                GROUP BY iart.ide_inarti, iart.nombre_inarti, uni.siglas_inuni
            ),
            VentasProducto AS (
                SELECT 
                    cdf.ide_inarti,
                    SUM(cdf.cantidad_ccdfa) as cantidad_vendida,
                    SUM(cdf.total_ccdfa) as valor_vendido
                FROM cxc_deta_factura cdf
                JOIN cxc_cabece_factura cf ON cf.ide_cccfa = cdf.ide_cccfa
                WHERE cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                    AND cf.ide_empr = ${dtoIn.ideEmpr}
                    AND EXTRACT(YEAR FROM cf.fecha_emisi_cccfa) = ${dtoIn.periodo}
                GROUP BY cdf.ide_inarti
            ),
            RankingABC AS (
                SELECT
                    vi.ide_inarti,
                    vi.nombre_inarti,
                    vi.siglas_inuni,
                    vi.stock_actual,
                    vi.costo_promedio,
                    vi.valor_inventario,
                    COALESCE(vp.cantidad_vendida, 0) as cantidad_vendida,
                    COALESCE(vp.valor_vendido, 0) as valor_vendido,
                    SUM(vi.valor_inventario) OVER (ORDER BY vi.valor_inventario DESC) / NULLIF(SUM(vi.valor_inventario) OVER (), 0) as porcentaje_acumulado,
                    CASE 
                        WHEN SUM(vi.valor_inventario) OVER (ORDER BY vi.valor_inventario DESC) / NULLIF(SUM(vi.valor_inventario) OVER (), 0) <= 0.8 THEN 'A'
                        WHEN SUM(vi.valor_inventario) OVER (ORDER BY vi.valor_inventario DESC) / NULLIF(SUM(vi.valor_inventario) OVER (), 0) <= 0.95 THEN 'B'
                        ELSE 'C'
                    END as categoria_abc
                FROM ValorInventario vi
                LEFT JOIN VentasProducto vp ON vi.ide_inarti = vp.ide_inarti
                WHERE vi.valor_inventario > 0
            )
            SELECT * FROM RankingABC
            ORDER BY valor_inventario DESC
            ${limitConfig}
        `,
      dtoIn,
    );

    return await this.dataSource.createQuery(query);
  }

  async getRotacionInventario(dtoIn: HeaderParamsDto & AnalisisDto) {
    const whereClause = dtoIn.ide_inbod ? ` AND cci.ide_inbod = ${dtoIn.ide_inbod}` : '';
    const query = new SelectQuery(
      `
        WITH MovimientosMensuales AS (
            SELECT 
                iart.ide_inarti,
                iart.nombre_inarti,
                EXTRACT(MONTH FROM cci.fecha_trans_incci) as mes,
                SUM(CASE 
                    WHEN cci.fecha_trans_incci <= (DATE_TRUNC('MONTH', TO_DATE('${dtoIn.periodo}-' || LPAD(EXTRACT(MONTH FROM cci.fecha_trans_incci)::text, 2, '0') || '-01', 'YYYY-MM-DD')) + INTERVAL '1 MONTH - 1 day')::date
                    THEN dci.cantidad_indci * tci.signo_intci 
                    ELSE 0 
                END) as stock_mensual,
                SUM(CASE 
                    WHEN tci.signo_intci = -1 THEN dci.cantidad_indci * dci.precio_indci 
                    ELSE 0 
                END) as costo_ventas_mensual
            FROM inv_articulo iart
            LEFT JOIN inv_det_comp_inve dci ON iart.ide_inarti = dci.ide_inarti
            LEFT JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
            LEFT JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
            LEFT JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
            WHERE cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                AND cci.ide_empr = ${dtoIn.ideEmpr}
                and iart.nivel_inarti = 'HIJO'
                and iart.hace_kardex_inarti = true
                AND EXTRACT(YEAR FROM cci.fecha_trans_incci) = ${dtoIn.periodo}
                ${whereClause}
            GROUP BY iart.ide_inarti, iart.nombre_inarti, EXTRACT(MONTH FROM cci.fecha_trans_incci)
        ),
        MovimientosAgregados AS (
            SELECT 
                ide_inarti,
                nombre_inarti,
                AVG(stock_mensual) as stock_promedio,
                SUM(costo_ventas_mensual) as costo_ventas_anual
            FROM MovimientosMensuales
            GROUP BY ide_inarti, nombre_inarti
        ),
        CalculosFinales AS (
            SELECT
                ide_inarti,
                nombre_inarti,
                stock_promedio,
                costo_ventas_anual,
                CASE 
                    WHEN stock_promedio > 0 THEN ROUND(costo_ventas_anual / stock_promedio, 2)
                    ELSE 0 
                END as rotacion_anual,
                CASE 
                    WHEN stock_promedio > 0 THEN ROUND(365 / (costo_ventas_anual / stock_promedio), 2)
                    ELSE 999 
                END as dias_inventario,
                -- Nueva columna: Clasificación del problema
                CASE 
                    WHEN stock_promedio < 0 THEN 'STOCK NEGATIVO'
                    WHEN stock_promedio = 0 AND costo_ventas_anual > 0 THEN 'STOCK CERO CON VENTAS'
                    WHEN stock_promedio > 0 AND (costo_ventas_anual / stock_promedio) < 1 THEN 'ROTACIÓN MUY BAJA (<1)'
                    WHEN stock_promedio > 0 AND (costo_ventas_anual / stock_promedio) < 4 THEN 'ROTACIÓN BAJA (1-4)'
                    WHEN stock_promedio > 0 AND (costo_ventas_anual / stock_promedio) < 12 THEN 'ROTACIÓN NORMAL (4-12)'
                    WHEN stock_promedio > 0 AND (costo_ventas_anual / stock_promedio) >= 12 THEN 'ROTACIÓN ALTA (>12)'
                    ELSE 'SIN CLASIFICAR'
                END as problema
            FROM MovimientosAgregados
            WHERE costo_ventas_anual > 0
        )
        SELECT
            ide_inarti,
            nombre_inarti,
            stock_promedio,
            costo_ventas_anual,
            rotacion_anual,
            dias_inventario,
            problema
        FROM CalculosFinales
        ORDER BY 
            CASE 
                WHEN problema = 'STOCK NEGATIVO' THEN 1
                WHEN problema = 'STOCK CERO CON VENTAS' THEN 2
                WHEN problema = 'ROTACIÓN MUY BAJA (<1)' THEN 3
                WHEN problema = 'ROTACIÓN BAJA (1-4)' THEN 4
                WHEN problema = 'ROTACIÓN NORMAL (4-12)' THEN 5
                WHEN problema = 'ROTACIÓN ALTA (>12)' THEN 6
                ELSE 7
            END,
            rotacion_anual ASC,
            dias_inventario DESC
    `,
      dtoIn,
    );
    return await this.dataSource.createQuery(query);
  }

  /**
   * Productos con alerta de reorden y recomendación de cuántas unidades pedir.
   * ¿CUÁNDO debo hacer un pedido? (Punto de Reorden)
   * ¿CUÁNTO stock de seguridad necesito? (Stock Seguridad)
   * @param dtoIn
   * @returns
   */
  async getStockSeguridadReorden(dtoIn: HeaderParamsDto & AnalisisDto) {
    const whereClause = dtoIn.ide_inbod ? ` AND cci.ide_inbod = ${dtoIn.ide_inbod}` : '';
    const query = new SelectQuery(
      `
            WITH VentasMensuales AS (
                SELECT 
                    cdf.ide_inarti,
                    iart.nombre_inarti,
                    EXTRACT(MONTH FROM cf.fecha_emisi_cccfa) as mes,
                    SUM(cdf.cantidad_ccdfa) as venta_mensual
                FROM cxc_deta_factura cdf
                JOIN cxc_cabece_factura cf ON cf.ide_cccfa = cdf.ide_cccfa
                JOIN inv_articulo iart ON iart.ide_inarti = cdf.ide_inarti
                WHERE cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                    and iart.hace_kardex_inarti = true
                    AND cf.ide_empr = ${dtoIn.ideEmpr}
                    AND EXTRACT(YEAR FROM cf.fecha_emisi_cccfa) = ${dtoIn.periodo}
                GROUP BY cdf.ide_inarti, iart.nombre_inarti, EXTRACT(MONTH FROM cf.fecha_emisi_cccfa)
            ),
            DemandaHistorica AS (
                SELECT 
                    ide_inarti,
                    nombre_inarti,
                    AVG(venta_mensual) as demanda_promedio_mensual,
                    STDDEV(venta_mensual) as desviacion_demanda,
                    15 as tiempo_entrega_promedio, -- Días
                    1.65 as z_value -- 95% nivel de servicio
                FROM VentasMensuales
                GROUP BY ide_inarti, nombre_inarti
                HAVING COUNT(mes) >= 3 -- Mínimo 3 meses de data
            ),
            StockActual AS (
                SELECT 
                    dci.ide_inarti,
                    SUM(dci.cantidad_indci * tci.signo_intci) as stock_actual
                FROM inv_det_comp_inve dci
                JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                WHERE cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                    AND cci.ide_empr = ${dtoIn.ideEmpr}
                    AND EXTRACT(YEAR FROM cci.fecha_trans_incci) = ${dtoIn.periodo}
                    ${whereClause}
                GROUP BY dci.ide_inarti
            ),
            CalculosBase AS (
                SELECT
                    dh.ide_inarti,
                    dh.nombre_inarti,
                    dh.demanda_promedio_mensual,
                    COALESCE(NULLIF(dh.desviacion_demanda, 0), dh.demanda_promedio_mensual * 0.1) as desviacion_demanda,
                    COALESCE(sa.stock_actual, 0) as stock_actual,
                    dh.tiempo_entrega_promedio,
                    dh.z_value,
                    -- Cálculos base
                    (dh.z_value * COALESCE(NULLIF(dh.desviacion_demanda, 0), dh.demanda_promedio_mensual * 0.1) * 
                     SQRT(dh.tiempo_entrega_promedio/30.0)) as stock_seguridad_raw,
                    ((dh.demanda_promedio_mensual * dh.tiempo_entrega_promedio/30.0) + 
                     (dh.z_value * COALESCE(NULLIF(dh.desviacion_demanda, 0), dh.demanda_promedio_mensual * 0.1) * 
                      SQRT(dh.tiempo_entrega_promedio/30.0))) as punto_reorden_raw
                FROM DemandaHistorica dh
                LEFT JOIN StockActual sa ON dh.ide_inarti = sa.ide_inarti
                WHERE dh.demanda_promedio_mensual > 0
            )
            SELECT
                ide_inarti,
                nombre_inarti,
                CAST(demanda_promedio_mensual AS DECIMAL(10,2)) as demanda_promedio_mensual,
                CAST(desviacion_demanda AS DECIMAL(10,2)) as desviacion_demanda,
                CAST(stock_actual AS DECIMAL(10,2)) as stock_actual,
                -- Stock de seguridad
                CAST(stock_seguridad_raw AS DECIMAL(10,2)) as stock_seguridad,
                -- Punto de reorden
                CAST(punto_reorden_raw AS DECIMAL(10,2)) as punto_reorden,
                -- Estado del inventario
                CASE 
                    WHEN stock_actual <= punto_reorden_raw THEN 'REORDENAR'
                    ELSE 'OK'
                END as estado_inventario,
                -- Recomendación adicional
                CASE 
                    WHEN stock_actual <= punto_reorden_raw THEN 
                        'Hacer pedido de ' || CAST(GREATEST(CEIL(punto_reorden_raw * 2 - stock_actual), 0) AS DECIMAL(10,0)) || ' unidades'
                    ELSE 'Stock suficiente'
                END as recomendacion
            FROM CalculosBase
            WHERE demanda_promedio_mensual > 0
            ORDER BY estado_inventario, stock_seguridad DESC
        `,
      dtoIn,
    );
    return await this.dataSource.createQuery(query);
  }

  /**
   * Identificar productos que NO se venden y representan dinero inmovilizado en el inventario.
   * @param dtoIn
   * @returns
   */
  async getProductosObsoletos(dtoIn: HeaderParamsDto & ProductosObsoletosDto) {
    const query = new SelectQuery(
      `
        WITH MovimientosRecientes AS (
            SELECT 
                dci.ide_inarti,
                SUM(CASE 
                    WHEN cci.fecha_trans_incci >= CURRENT_DATE - (INTERVAL '1 month' * ${dtoIn.mesesSinMovimiento})
                    THEN dci.cantidad_indci * tci.signo_intci 
                    ELSE 0 
                END) as movimiento_ultimos_meses
            FROM inv_det_comp_inve dci
            JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
            JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
            JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
            WHERE cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
              AND cci.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY dci.ide_inarti
        ),
        StockActual AS (
            SELECT 
                dci.ide_inarti,
                SUM(dci.cantidad_indci * tci.signo_intci) as stock_actual
            FROM inv_det_comp_inve dci
            JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
            JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
            JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
            WHERE cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
              AND cci.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY dci.ide_inarti
        ),
        CostoPromedio AS (
            SELECT 
                dci.ide_inarti,
                AVG(dci.precio_indci) as costo_promedio
            FROM inv_det_comp_inve dci
            JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
            JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
            JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
            WHERE cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
              AND cci.ide_empr = ${dtoIn.ideEmpr}
              AND tci.signo_intci = 1  -- Solo entradas para costo
            GROUP BY dci.ide_inarti
        ),
        UltimoMovimiento AS (
            SELECT 
                dci.ide_inarti,
                MAX(cci.fecha_trans_incci) as ultima_fecha_int
            FROM inv_det_comp_inve dci
            JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
            WHERE cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
              AND cci.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY dci.ide_inarti
        )
        SELECT
            iart.ide_inarti,
            iart.nombre_inarti,
            um.ultima_fecha_int as ultima_fecha_movimiento,
            COALESCE(mr.movimiento_ultimos_meses, 0) as movimiento_ultimos_meses,
            COALESCE(sa.stock_actual, 0) as stock_actual,
            COALESCE(cp.costo_promedio, 0) as costo_promedio,
            COALESCE(sa.stock_actual * cp.costo_promedio, 0) as valor_obsoleto,
            CASE 
                WHEN um.ultima_fecha_int IS NOT NULL 
                THEN (CURRENT_DATE - um.ultima_fecha_int)
                ELSE 999 
            END as dias_sin_movimiento,
            CASE 
                WHEN COALESCE(mr.movimiento_ultimos_meses, 0) = 0 AND COALESCE(sa.stock_actual, 0) > 0 THEN 'CRÍTICO'
                WHEN COALESCE(mr.movimiento_ultimos_meses, 0) < COALESCE(sa.stock_actual, 0) * 0.1 THEN 'ALERTA'
                WHEN COALESCE(sa.stock_actual, 0) > 0 THEN 'VIGENTE'
                ELSE 'SIN STOCK'
            END as nivel_obsolescencia,
            CASE 
                WHEN COALESCE(mr.movimiento_ultimos_meses, 0) = 0 AND COALESCE(sa.stock_actual, 0) > 0 
                THEN 'Considerar descuento o baja'
                WHEN COALESCE(mr.movimiento_ultimos_meses, 0) < COALESCE(sa.stock_actual, 0) * 0.1 
                THEN 'Revisar estrategia de venta'
                ELSE 'Producto activo'
            END as recomendacion
        FROM inv_articulo iart
        LEFT JOIN UltimoMovimiento um ON iart.ide_inarti = um.ide_inarti
        LEFT JOIN MovimientosRecientes mr ON iart.ide_inarti = mr.ide_inarti
        LEFT JOIN StockActual sa ON iart.ide_inarti = sa.ide_inarti
        LEFT JOIN CostoPromedio cp ON iart.ide_inarti = cp.ide_inarti
        WHERE iart.ide_empr = ${dtoIn.ideEmpr}
          AND COALESCE(sa.stock_actual, 0) > 0
          and hace_kardex_inarti = true
        ORDER BY 
            CASE 
                WHEN COALESCE(mr.movimiento_ultimos_meses, 0) = 0 AND COALESCE(sa.stock_actual, 0) > 0 THEN 1
                WHEN COALESCE(mr.movimiento_ultimos_meses, 0) < COALESCE(sa.stock_actual, 0) * 0.1 THEN 2
                ELSE 3 
            END,
            COALESCE(sa.stock_actual * cp.costo_promedio, 0) DESC
      `,
      dtoIn,
    );
    return await this.dataSource.createQuery(query);
  }

  async getTopProductosAjustados(dtoIn: HeaderParamsDto & TopProductosDto) {
    const limitConfig = isDefined(dtoIn.limit) ? `LIMIT ${dtoIn.limit}` : '';

    const whereClause = dtoIn.ide_inbod ? ` AND cci.ide_inbod = ${dtoIn.ide_inbod}` : '';

    const query = new SelectQuery(
      `
            WITH TiposAjuste AS (
                SELECT ide_intti 
                FROM inv_tip_tran_inve 
                WHERE 
                    LOWER(nombre_intti) LIKE '%ajuste%'
                    OR LOWER(nombre_intti) LIKE '%diferencia%'
                    OR LOWER(nombre_intti) LIKE '%correccion%'
                    OR LOWER(nombre_intti) LIKE '%corrección%'
            ),
            AjustesProductos AS (
                SELECT 
                    dci.ide_inarti,
                    iart.codigo_inarti,
                    iart.nombre_inarti,
                    STRING_AGG(DISTINCT tti.nombre_intti, ', ') as tipos_transaccion,
                    COUNT(DISTINCT cci.ide_incci) as total_ajustes,
                    -- ✅ CANTIDADES SEPARADAS: Positiva y Negativa
                    SUM(CASE WHEN (dci.cantidad_indci * tci.signo_intci) > 0 THEN ABS(dci.cantidad_indci) ELSE 0 END) as cantidad_ajustada_positiva,
                    SUM(CASE WHEN (dci.cantidad_indci * tci.signo_intci) < 0 THEN ABS(dci.cantidad_indci) ELSE 0 END) as cantidad_ajustada_negativa,
                    SUM(ABS(dci.cantidad_indci)) as cantidad_ajustada_total,
                    -- ✅ VALORES SEPARADOS: Positivo y Negativo
                    CAST(SUM(CASE WHEN (dci.cantidad_indci * tci.signo_intci) > 0 THEN ABS(dci.cantidad_indci * dci.precio_indci) ELSE 0 END) AS DECIMAL(10,2)) as valor_ajustado_positivo,
                    CAST(SUM(CASE WHEN (dci.cantidad_indci * tci.signo_intci) < 0 THEN ABS(dci.cantidad_indci * dci.precio_indci) ELSE 0 END) AS DECIMAL(10,2)) as valor_ajustado_negativo,
                    CAST(SUM(ABS(dci.cantidad_indci * dci.precio_indci)) AS DECIMAL(10,2)) as valor_ajustado_total,
                    -- ✅ CONTADORES DE AJUSTES
                    COUNT(DISTINCT CASE WHEN (dci.cantidad_indci * tci.signo_intci) > 0 THEN cci.ide_incci END) as ajustes_positivos,
                    COUNT(DISTINCT CASE WHEN (dci.cantidad_indci * tci.signo_intci) < 0 THEN cci.ide_incci END) as ajustes_negativos,
                    MIN(cci.fecha_trans_incci) as primera_fecha_ajuste,
                    MAX(cci.fecha_trans_incci) as ultima_fecha_ajuste
                FROM inv_det_comp_inve dci
                JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                JOIN inv_articulo iart ON iart.ide_inarti = dci.ide_inarti
                JOIN TiposAjuste ta ON tti.ide_intti = ta.ide_intti
                WHERE cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                    AND cci.ide_empr = ${dtoIn.ideEmpr}
                    AND cci.fecha_trans_incci BETWEEN '${dtoIn.fechaInicio}' AND '${dtoIn.fechaFin}'
                    ${whereClause}
                GROUP BY dci.ide_inarti, iart.codigo_inarti, iart.nombre_inarti
            ),
            StockActual AS (
                SELECT 
                    dci.ide_inarti,
                    SUM(dci.cantidad_indci * tci.signo_intci) as stock_actual
                FROM inv_det_comp_inve dci
                JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                WHERE cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                    AND cci.ide_empr = ${dtoIn.ideEmpr}
                    ${whereClause}
                GROUP BY dci.ide_inarti
            )
            SELECT 
                ap.ide_inarti,
                ap.codigo_inarti,
                ap.nombre_inarti,
                ap.tipos_transaccion,
                ap.total_ajustes,
                -- ✅ CANTIDADES DETALLADAS
                ap.cantidad_ajustada_positiva,
                ap.cantidad_ajustada_negativa,
                ap.cantidad_ajustada_total,
                -- ✅ VALORES DETALLADOS
                ap.valor_ajustado_positivo,
                ap.valor_ajustado_negativo,
                ap.valor_ajustado_total,
                -- ✅ CONTADORES
                ap.ajustes_positivos,
                ap.ajustes_negativos,
                COALESCE(sa.stock_actual, 0) as stock_actual,
                ap.primera_fecha_ajuste,
                ap.ultima_fecha_ajuste,
                (CURRENT_DATE - ap.ultima_fecha_ajuste) as dias_desde_ultimo_ajuste,
                -- ✅ PORCENTAJES MEJORADOS
                CASE 
                    WHEN COALESCE(sa.stock_actual, 0) > 0 
                    THEN CAST((ap.cantidad_ajustada_total * 100.0 / ABS(sa.stock_actual)) AS DECIMAL(10,2))
                    ELSE 0 
                END as porcentaje_ajuste_vs_stock,
                -- ✅ CLASIFICACIONES MEJORADAS
                CASE 
                    WHEN ap.total_ajustes >= 10 THEN 'CRÍTICO'
                    WHEN ap.total_ajustes >= 5 THEN 'ALTO'
                    WHEN ap.total_ajustes >= 2 THEN 'MEDIO'
                    ELSE 'BAJO'
                END as nivel_problema,
                CASE 
                    WHEN ap.ajustes_positivos > ap.ajustes_negativos THEN 'MÁS INCREMENTOS'
                    WHEN ap.ajustes_negativos > ap.ajustes_positivos THEN 'MÁS DECREMENTOS'
                    ELSE 'BALANCEADO'
                END as tendencia_ajustes,
                -- ✅ NUEVO: TENDENCIA POR CANTIDAD
                CASE 
                    WHEN ap.cantidad_ajustada_positiva > ap.cantidad_ajustada_negativa THEN 'NETO POSITIVO'
                    WHEN ap.cantidad_ajustada_negativa > ap.cantidad_ajustada_positiva THEN 'NETO NEGATIVO'
                    ELSE 'EQUILIBRADO'
                END as tendencia_cantidad,
                -- ✅ NUEVO: IMPACTO NETO
                (ap.cantidad_ajustada_positiva - ap.cantidad_ajustada_negativa) as impacto_neto_cantidad,
                (ap.valor_ajustado_positivo - ap.valor_ajustado_negativo) as impacto_neto_valor
            FROM AjustesProductos ap
            LEFT JOIN StockActual sa ON ap.ide_inarti = sa.ide_inarti
            WHERE ap.total_ajustes > 0
            ORDER BY 
                ap.total_ajustes DESC, 
                ap.valor_ajustado_total DESC
            ${limitConfig}
        `,
      dtoIn,
    );
    return await this.dataSource.createQuery(query);
  }
}
