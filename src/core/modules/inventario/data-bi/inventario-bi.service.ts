import { Injectable } from '@nestjs/common';
import { getYear } from 'date-fns';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { CoreService } from 'src/core/core.service';

import { BaseService } from '../../../../common/base-service';
import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery } from '../../../connection/helpers/select-query';
import { IdProductoDto } from '../productos/dto/id-producto.dto';
import { TrnProductoDto } from '../productos/dto/trn-producto.dto';
import { VentasMensualesDto } from '../productos/dto/ventas-mensuales.dto';
import { ClientesProductoDto } from './dto/clientes-producto';
import { TopProductosDto } from './dto/top-productos';



@Injectable()
export class InventarioBiService extends BaseService {
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


    /**
     * Retorna el top N de productos mas vendidos en un rango de fechas
     * @param dtoIn 
     * @returns 
     */
    async getTopProductos(dtoIn: TopProductosDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
          WITH ventas_producto AS (
              SELECT 
                  iart.ide_inarti,
                  iart.uuid,
                  iart.nombre_inarti AS producto,
                  COUNT(DISTINCT cf.ide_cccfa) AS num_facturas,
                  SUM(cdf.total_ccdfa) AS ventas_brutas,
                  SUM(cdf.total_ccdfa) AS total_bruto
              FROM 
                  cxc_deta_factura cdf
              JOIN 
                  inv_articulo iart ON cdf.ide_inarti = iart.ide_inarti
              JOIN 
                  cxc_cabece_factura cf ON cdf.ide_cccfa = cf.ide_cccfa
              WHERE 
                  cf.fecha_emisi_cccfa BETWEEN $1 AND $2
                  AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                  AND iart.hace_kardex_inarti = true
                  AND cf.ide_empr = ${dtoIn.ideEmpr}
              GROUP BY 
                  iart.ide_inarti, iart.uuid, iart.nombre_inarti
          ),
          notas_credito_producto AS (
              SELECT 
                  cdn.ide_inarti,
                  SUM(cdn.valor_cpdno) AS total_notas_credito
              FROM 
                  cxp_cabecera_nota cn
              JOIN 
                  cxp_detalle_nota cdn ON cn.ide_cpcno = cdn.ide_cpcno
              JOIN 
                  cxc_cabece_factura cf ON cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
              WHERE 
                  cn.fecha_emisi_cpcno BETWEEN $3 AND $4
                  AND cn.ide_cpeno = 1
                  AND cn.ide_empr = ${dtoIn.ideEmpr}
                  AND cf.ide_empr = ${dtoIn.ideEmpr}
              GROUP BY 
                  cdn.ide_inarti
          )
          SELECT 
              vp.ide_inarti,
              vp.uuid,
              vp.producto,
              vp.num_facturas,
              vp.ventas_brutas - COALESCE(nc.total_notas_credito, 0) AS total_ventas,
              COALESCE(nc.total_notas_credito, 0) AS total_notas_credito,
              ROUND(
                  (vp.total_bruto - COALESCE(nc.total_notas_credito, 0)) * 100.0 / 
                  NULLIF((SELECT SUM(total_ccdfa) 
                   FROM cxc_deta_factura cdf2
                   JOIN cxc_cabece_factura cf2 ON cdf2.ide_cccfa = cf2.ide_cccfa
                   WHERE cf2.fecha_emisi_cccfa BETWEEN $5 AND $6
                   AND cf2.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                   AND cf2.ide_empr = ${dtoIn.ideEmpr}), 0), 
              2) AS porcentaje
          FROM 
              ventas_producto vp
          LEFT JOIN 
              notas_credito_producto nc ON vp.ide_inarti = nc.ide_inarti
          ORDER BY 
              total_ventas DESC
          LIMIT ${dtoIn.limit}`,
            dtoIn,
        );
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        query.addStringParam(3, dtoIn.fechaInicio);
        query.addStringParam(4, dtoIn.fechaFin);
        query.addStringParam(5, dtoIn.fechaInicio);
        query.addStringParam(6, dtoIn.fechaFin);
        return await this.dataSource.createQuery(query);
    }



    /**
     * Retorna los N productos mas vendidos por la cantidad en un rango de fechas
     * @param dtoIn
     * @returns
     */
    async getTopProductosVendidos(dtoIn: TopProductosDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
        WITH ventas_producto AS (
            SELECT 
                iart.ide_inarti,
                iart.nombre_inarti,
                uni.siglas_inuni,
                SUM(cdf.cantidad_ccdfa) AS total_cantidad_ventas
            FROM 
                cxc_deta_factura cdf
            JOIN 
                inv_articulo iart ON cdf.ide_inarti = iart.ide_inarti
            JOIN 
                cxc_cabece_factura cf ON cdf.ide_cccfa = cf.ide_cccfa
            LEFT JOIN 
                inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
            WHERE 
                cf.fecha_emisi_cccfa BETWEEN $1 AND $2
                AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                AND cf.ide_empr = ${dtoIn.ideEmpr}
                AND hace_kardex_inarti = true
            GROUP BY 
                iart.ide_inarti, iart.nombre_inarti, uni.siglas_inuni
        ),
        notas_credito_producto AS (
            SELECT 
                cdn.ide_inarti,
                SUM(cdn.cantidad_cpdno) AS total_cantidad_notas
            FROM 
                cxp_cabecera_nota cn
            JOIN 
                cxp_detalle_nota cdn ON cn.ide_cpcno = cdn.ide_cpcno
            JOIN 
                cxc_cabece_factura cf ON cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
            WHERE 
                cn.fecha_emisi_cpcno BETWEEN $3 AND $4
                AND cn.ide_cpeno = 1
                AND cn.ide_empr = ${dtoIn.ideEmpr}
                AND cf.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY 
                cdn.ide_inarti
        )
        SELECT 
            vp.ide_inarti,
            UPPER(vp.nombre_inarti) as nombre_inarti,
            (vp.total_cantidad_ventas - COALESCE(nc.total_cantidad_notas, 0)) AS total_cantidad,
            vp.siglas_inuni,
            vp.total_cantidad_ventas AS cantidad_bruta,
            COALESCE(nc.total_cantidad_notas, 0) AS cantidad_notas_credito
        FROM 
            ventas_producto vp
        LEFT JOIN 
            notas_credito_producto nc ON vp.ide_inarti = nc.ide_inarti
        ORDER BY 
            total_cantidad DESC
        LIMIT ${dtoIn.limit || 10}`,
            dtoIn,
        );

        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        query.addStringParam(3, dtoIn.fechaInicio);
        query.addStringParam(4, dtoIn.fechaFin);

        return await this.dataSource.createQuery(query);
    }


    /**
     * Retorna los productos mas facturados
     * @param dtoIn
     * @returns
     */
    async getTopProductosFacturados(dtoIn: TopProductosDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
        SELECT
            iart.ide_inarti,
            upper(iart.nombre_inarti) as nombre_inarti,
            COUNT(1) AS num_facturas
        FROM
            cxc_deta_factura cdf
            INNER JOIN cxc_cabece_factura cf ON cf.ide_cccfa = cdf.ide_cccfa
            INNER JOIN inv_articulo iart ON iart.ide_inarti = cdf.ide_inarti
            LEFT JOIN inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
        WHERE
            cf.fecha_emisi_cccfa BETWEEN $1 AND $2
            AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
            AND cf.ide_empr = ${dtoIn.ideEmpr} 
            AND hace_kardex_inarti = true
        GROUP BY
            iart.ide_inarti,
            iart.nombre_inarti
        ORDER BY
            num_facturas  DESC
        LIMIT  ${dtoIn.limit || 10}`,
            dtoIn,
        );
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        return await this.dataSource.createQuery(query);
    }



    async getTopProductosMayorRotacion(dtoIn: TopProductosDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            WITH movimientos_periodo AS (
                SELECT 
                    art.ide_inarti,
                    art.uuid,
                    art.nombre_inarti,
                    art.cant_stock1_inarti AS stock_minimo,
                    art.cant_stock2_inarti AS stock_ideal,
                    uni.siglas_inuni,
                    -- Movimientos del período
                    SUM(CASE WHEN tci.signo_intci = 1 THEN dci.cantidad_indci ELSE 0 END) AS ingresos_periodo,
                    SUM(CASE WHEN tci.signo_intci = -1 THEN dci.cantidad_indci ELSE 0 END) AS egresos_periodo,
                    COUNT(DISTINCT CASE WHEN tci.signo_intci = -1 THEN cci.ide_incci ELSE NULL END) AS facturas_venta,
                    COUNT(DISTINCT DATE(cci.fecha_trans_incci)) AS dias_venta,
                    -- Promedio diario de ventas
                    ROUND(
                        SUM(CASE WHEN tci.signo_intci = -1 THEN dci.cantidad_indci ELSE 0 END) / 
                        NULLIF(COUNT(DISTINCT DATE(cci.fecha_trans_incci)), 0), 
                    2) AS promedio_venta_diario
                FROM 
                    inv_det_comp_inve dci
                INNER JOIN 
                    inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                INNER JOIN 
                    inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                INNER JOIN 
                    inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                INNER JOIN 
                    inv_articulo art ON dci.ide_inarti = art.ide_inarti
                LEFT JOIN
                    inv_unidad uni ON art.ide_inuni = uni.ide_inuni
                WHERE 
                    cci.fecha_trans_incci BETWEEN $1 AND $2
                    AND art.ide_empr = ${dtoIn.ideEmpr}
                    AND cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                GROUP BY 
                    art.ide_inarti, art.uuid, art.nombre_inarti, art.cant_stock1_inarti, 
                    art.cant_stock2_inarti, uni.siglas_inuni
            ),
            saldos_actuales AS (
                SELECT 
                    dci.ide_inarti,
                    f_redondeo(SUM(dci.cantidad_indci * tci.signo_intci), art.decim_stock_inarti) AS saldo_actual
                FROM 
                    inv_det_comp_inve dci
                INNER JOIN 
                    inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                INNER JOIN 
                    inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                INNER JOIN 
                    inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                INNER JOIN 
                    inv_articulo art ON dci.ide_inarti = art.ide_inarti
                WHERE 
                    cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                    AND art.ide_empr = ${dtoIn.ideEmpr}
                GROUP BY 
                    dci.ide_inarti, art.decim_stock_inarti
            ),
            periodo_dias AS (
                SELECT 
                    EXTRACT(DAYS FROM ($3::timestamp - $4::timestamp))::integer + 1 AS total_dias_periodo
            )
            SELECT 
                mp.ide_inarti,
                mp.uuid,
                mp.nombre_inarti,
                mp.siglas_inuni,
                mp.ingresos_periodo,
                mp.egresos_periodo,
                mp.facturas_venta,
                mp.dias_venta,
                mp.promedio_venta_diario,
                COALESCE(sa.saldo_actual, 0) AS saldo_actual,
                mp.stock_minimo,
                mp.stock_ideal,
                -- MÉTODO 1: Rotación basada en ventas vs stock promedio
                CASE 
                    WHEN COALESCE(sa.saldo_actual, 0) > 0 THEN
                        ROUND(mp.egresos_periodo / NULLIF(COALESCE(sa.saldo_actual, 0), 0), 2)
                    ELSE 
                        -- Si no hay stock actual, usar las ventas como indicador de rotación
                        ROUND(mp.egresos_periodo / NULLIF(mp.ingresos_periodo, 0), 2)
                END AS indice_rotacion_stock,
                -- MÉTODO 2: Frecuencia de ventas
                ROUND(mp.facturas_venta / NULLIF(mp.dias_venta, 0), 2) AS frecuencia_ventas,
                -- MÉTODO 3: Porcentaje de días con ventas
                ROUND((mp.dias_venta * 100.0) / NULLIF(pd.total_dias_periodo, 0), 2) AS porcentaje_dias_venta,
                -- MÉTODO 4: Volumen total de ventas (método más simple y efectivo)
                mp.egresos_periodo AS volumen_ventas,
                -- Score combinado para ranking (ponderando diferentes métricas)
                ROUND(
                    (CASE WHEN COALESCE(sa.saldo_actual, 0) > 0 THEN
                        (mp.egresos_periodo / NULLIF(COALESCE(sa.saldo_actual, 0), 0)) 
                     ELSE 
                        (mp.egresos_periodo / NULLIF(mp.ingresos_periodo, 0))
                     END * 0.3) +
                    ((mp.facturas_venta / NULLIF(mp.dias_venta, 0)) * 0.2) +
                    ((mp.dias_venta * 100.0 / NULLIF(pd.total_dias_periodo, 0)) * 0.1) +
                    (mp.egresos_periodo * 0.0001),  -- Normalizado para que no domine
                2) AS score_rotacion,
                -- Clasificación basada en múltiples factores
                CASE 
                    WHEN mp.egresos_periodo > 1000 AND (mp.facturas_venta / NULLIF(mp.dias_venta, 0)) > 1 THEN 'ROTACIÓN MUY ALTA'
                    WHEN mp.egresos_periodo > 500 AND (mp.facturas_venta / NULLIF(mp.dias_venta, 0)) > 0.5 THEN 'ROTACIÓN ALTA'
                    WHEN mp.egresos_periodo > 100 THEN 'ROTACIÓN MEDIA'
                    ELSE 'ROTACIÓN BAJA'
                END AS clasificacion_rotacion,
                -- Días de stock disponible
                CASE 
                    WHEN COALESCE(sa.saldo_actual, 0) > 0 AND mp.promedio_venta_diario > 0 THEN
                        ROUND(COALESCE(sa.saldo_actual, 0) / mp.promedio_venta_diario, 1)
                    ELSE 0
                END AS dias_stock_disponible
            FROM 
                movimientos_periodo mp
            LEFT JOIN 
                saldos_actuales sa ON mp.ide_inarti = sa.ide_inarti
            CROSS JOIN
                periodo_dias pd
            WHERE 
                mp.egresos_periodo > 0
                AND mp.dias_venta > 0
            ORDER BY 
                -- Ordenar por volumen de ventas primero, luego por frecuencia
                mp.egresos_periodo DESC,
                (mp.facturas_venta / NULLIF(mp.dias_venta, 0)) DESC,
                (mp.dias_venta * 100.0 / NULLIF(pd.total_dias_periodo, 0)) DESC
            LIMIT ${dtoIn.limit || 20}
        `, dtoIn);

        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        query.addStringParam(3, dtoIn.fechaFin);
        query.addStringParam(4, dtoIn.fechaInicio);
        return await this.dataSource.createQuery(query);
    }


    /**
     * Total de productos por categoria
     * @param dtoIn 
     * @returns 
     */
    async getTotalProductosPorCategoria(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT 
                COALESCE(c.nombre_incate, 'SIN CATEGORIA') AS categoria,
            COUNT(a.ide_inarti) AS cantidad
            FROM 
                inv_articulo a
            LEFT JOIN 
                inv_categoria c ON a.ide_incate = c.ide_incate
            WHERE a.ide_empr = ${dtoIn.ideEmpr} 
            AND ide_intpr = 1
            AND nivel_inarti = 'HIJO'
            and activo_inarti = true    
            AND hace_kardex_inarti = true
            GROUP BY 
                c.nombre_incate
            order by 2
            `);
        return await this.dataSource.createSelectQuery(query);
    }



    /**
     * Retorna el top N clientes de un producto  en un rango de fechas
     * @param dtoIn 
     * @returns 
     */
    async getTopClientesProducto(dtoIn: ClientesProductoDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `  
            SELECT 
                p.ide_geper,
            p.uuid,
            p.nom_geper AS cliente,
            COUNT(DISTINCT cf.ide_cccfa) AS num_facturas,
            SUM(cdf.total_ccdfa) AS total_ventas_brutas,
            COALESCE(nc.total_notas_credito, 0) AS total_notas_credito,
            SUM(cdf.total_ccdfa) - COALESCE(nc.total_notas_credito, 0) AS total_ventas_netas,
            ROUND(
                (SUM(cdf.total_ccdfa) - COALESCE(nc.total_notas_credito, 0)) * 100.0 /
                NULLIF((
                    SELECT SUM(cdf2.total_ccdfa)
                        FROM cxc_deta_factura cdf2
                        JOIN cxc_cabece_factura cf2 ON cdf2.ide_cccfa = cf2.ide_cccfa
                        WHERE cf2.fecha_emisi_cccfa BETWEEN $1 AND $2
                        AND cf2.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                        AND cf2.ide_empr = ${dtoIn.ideEmpr}
                        AND cdf2.ide_inarti = $7
                ), 0),
            2) AS porcentaje
        FROM 
                cxc_cabece_factura cf
        JOIN 
                gen_persona p ON cf.ide_geper = p.ide_geper
        JOIN
                cxc_deta_factura cdf ON cf.ide_cccfa = cdf.ide_cccfa
            LEFT JOIN(
            SELECT 
                    cdn.ide_inarti,
            cf.ide_geper,
            SUM(cdn.valor_cpdno) AS total_notas_credito
                FROM 
                    cxp_cabecera_nota cn
                JOIN 
                    cxp_detalle_nota cdn ON cn.ide_cpcno = cdn.ide_cpcno
                JOIN 
                    cxc_cabece_factura cf ON cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa:: text, 9, '0')
                WHERE 
                    cn.fecha_emisi_cpcno BETWEEN $3 AND $4
                    AND cn.ide_cpeno = 1
                    AND cn.ide_empr = ${dtoIn.ideEmpr}
                    AND cdn.ide_inarti = $8
                GROUP BY 
                    cdn.ide_inarti, cf.ide_geper
        ) nc ON p.ide_geper = nc.ide_geper AND cdf.ide_inarti = nc.ide_inarti
        WHERE
        cf.fecha_emisi_cccfa BETWEEN $5 AND $6
                AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                AND cf.ide_empr = ${dtoIn.ideEmpr}
                AND cdf.ide_inarti = $9
            GROUP BY
        p.ide_geper,
            p.uuid,
            p.nom_geper,
            nc.total_notas_credito
            ORDER BY 
                total_ventas_netas DESC
            LIMIT ${dtoIn.limit || 10} `,
            dtoIn,
        );

        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        query.addStringParam(3, dtoIn.fechaInicio);
        query.addStringParam(4, dtoIn.fechaFin);
        query.addStringParam(5, dtoIn.fechaInicio);
        query.addStringParam(6, dtoIn.fechaFin);
        query.addIntParam(7, dtoIn.ide_inarti);
        query.addIntParam(8, dtoIn.ide_inarti);
        query.addIntParam(9, dtoIn.ide_inarti);

        return await this.dataSource.createQuery(query);
    }


    /**
  * Retorna top 10 mejores proveedores en un periodo
  * @param dtoIn
  * @returns
  */
    async getTopProveedoresProducto(dtoIn: ClientesProductoDto & HeaderParamsDto) {

        const query = new SelectQuery(
            `
        SELECT
            p.ide_geper,
            upper(p.nom_geper) as nom_geper,
            COUNT(1) AS num_facturas,
            SUM(cdf.cantidad_cpdfa) AS total_cantidad,
            SUM(cdf.cantidad_cpdfa * cdf.precio_cpdfa) AS total_valor,
            siglas_inuni
        FROM
            cxp_detall_factur cdf
            INNER JOIN cxp_cabece_factur cf ON cf.ide_cpcfa = cdf.ide_cpcfa
            INNER JOIN inv_articulo iart ON iart.ide_inarti = cdf.ide_inarti
            LEFT JOIN inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
            INNER JOIN gen_persona p ON cf.ide_geper = p.ide_geper
        WHERE
            cdf.ide_inarti = $1
            AND cf.ide_cpefa = ${this.variables.get('p_cxp_estado_factura_normal')} 
            AND cf.fecha_emisi_cpcfa BETWEEN $2 AND $3
            AND cf.ide_empr = ${dtoIn.ideEmpr} 
        GROUP BY
            p.ide_geper,
            p.nom_geper,
            siglas_inuni
        ORDER BY
            total_valor DESC
            LIMIT ${dtoIn.limit || 10} `,
            dtoIn,
        );
        query.addIntParam(1, dtoIn.ide_inarti);
        query.addStringParam(2, dtoIn.fechaInicio);
        query.addStringParam(3, dtoIn.fechaFin);

        return await this.dataSource.createQuery(query);
    }

    async getTotalVentasProductoPorFormaPago(dtoIn: ClientesProductoDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            WITH ventas_producto_forma_pago AS (
                SELECT 
                    fp.ide_cndfp,
                    fp.nombre_cndfp AS forma_pago,
                    COUNT(DISTINCT cf.ide_cccfa) AS num_facturas,
                    SUM(cdf.total_ccdfa) AS total_ventas_brutas,
                    SUM(cdf.cantidad_ccdfa) AS total_cantidad
                FROM 
                    cxc_cabece_factura cf
                JOIN 
                    con_deta_forma_pago fp ON cf.ide_cndfp1 = fp.ide_cndfp
                JOIN
                    cxc_deta_factura cdf ON cf.ide_cccfa = cdf.ide_cccfa
                WHERE 
                    cf.fecha_emisi_cccfa BETWEEN $1 AND $2
                    AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                    AND cf.ide_empr = ${dtoIn.ideEmpr}
                    AND cdf.ide_inarti = $5
                GROUP BY 
                    fp.ide_cndfp,
                    fp.nombre_cndfp
            ),
            notas_credito_producto_forma_pago AS (
                SELECT 
                    fp.ide_cndfp,
                    SUM(cdn.valor_cpdno) AS total_notas_credito,
                    SUM(cdn.cantidad_cpdno) AS total_cantidad_notas
                FROM 
                    cxp_cabecera_nota cn
                JOIN 
                    cxp_detalle_nota cdn ON cn.ide_cpcno = cdn.ide_cpcno
                JOIN 
                    cxc_cabece_factura cf ON cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
                JOIN
                    con_deta_forma_pago fp ON cf.ide_cndfp1 = fp.ide_cndfp
                WHERE 
                    cn.fecha_emisi_cpcno BETWEEN $3 AND $4
                    AND cn.ide_cpeno = 1
                    AND cn.ide_empr = ${dtoIn.ideEmpr}
                    AND cf.ide_empr = ${dtoIn.ideEmpr}
                    AND cdn.ide_inarti = $6
                GROUP BY 
                    fp.ide_cndfp
            )
            SELECT 
                vp.ide_cndfp,
                vp.forma_pago,
                vp.num_facturas,
                vp.total_ventas_brutas,
                vp.total_cantidad,
                COALESCE(nc.total_notas_credito, 0) AS total_notas_credito,
                COALESCE(nc.total_cantidad_notas, 0) AS total_cantidad_notas,
                (vp.total_ventas_brutas - COALESCE(nc.total_notas_credito, 0)) AS total_ventas_netas,
                (vp.total_cantidad - COALESCE(nc.total_cantidad_notas, 0)) AS total_cantidad_neta,
                ROUND(
                    (vp.total_ventas_brutas - COALESCE(nc.total_notas_credito, 0)) * 100.0 / 
                    NULLIF((
                        SELECT SUM(cdf2.total_ccdfa)
                        FROM cxc_deta_factura cdf2
                        JOIN cxc_cabece_factura cf2 ON cdf2.ide_cccfa = cf2.ide_cccfa
                        WHERE cf2.fecha_emisi_cccfa BETWEEN $7 AND $8
                        AND cf2.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                        AND cf2.ide_empr = ${dtoIn.ideEmpr}
                        AND cdf2.ide_inarti = $9
                    ), 0), 
                2) AS porcentaje
            FROM 
                ventas_producto_forma_pago vp
            LEFT JOIN 
                notas_credito_producto_forma_pago nc ON vp.ide_cndfp = nc.ide_cndfp
            ORDER BY 
                total_ventas_netas DESC
        `);

        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        query.addStringParam(3, dtoIn.fechaInicio);
        query.addStringParam(4, dtoIn.fechaFin);
        query.addIntParam(5, dtoIn.ide_inarti);
        query.addIntParam(6, dtoIn.ide_inarti);
        query.addStringParam(7, dtoIn.fechaInicio);
        query.addStringParam(8, dtoIn.fechaFin);
        query.addIntParam(9, dtoIn.ide_inarti);

        return await this.dataSource.createQuery(query);
    }



    async getTopVendedoresProducto(dtoIn: ClientesProductoDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            WITH ventas_vendedor_producto AS (
                SELECT 
                    v.ide_vgven,
                    v.nombre_vgven,
                    COUNT(DISTINCT cf.ide_cccfa) AS num_facturas,
                    SUM(cdf.total_ccdfa) AS ventas_brutas,
                    SUM(cdf.cantidad_ccdfa) AS total_cantidad,
                    SUM(cdf.total_ccdfa) AS total_bruto
                FROM 
                    cxc_cabece_factura cf
                JOIN 
                    ven_vendedor v ON cf.ide_vgven = v.ide_vgven
                JOIN
                    cxc_deta_factura cdf ON cf.ide_cccfa = cdf.ide_cccfa
                WHERE 
                    cf.fecha_emisi_cccfa BETWEEN $1 AND $2
                    AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                    AND cf.ide_empr = ${dtoIn.ideEmpr}
                    AND cdf.ide_inarti = $7
                GROUP BY 
                    v.ide_vgven, v.nombre_vgven
            ),
            notas_credito_vendedor_producto AS (
                SELECT 
                    cf.ide_vgven,
                    SUM(cdn.valor_cpdno) AS total_notas_credito,
                    SUM(cdn.cantidad_cpdno) AS total_cantidad_notas
                FROM 
                    cxp_cabecera_nota cn
                JOIN 
                    cxp_detalle_nota cdn ON cn.ide_cpcno = cdn.ide_cpcno
                JOIN 
                    cxc_cabece_factura cf ON cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
                WHERE 
                    cn.fecha_emisi_cpcno BETWEEN $3 AND $4
                    AND cn.ide_cpeno = 1
                    AND cn.ide_empr = ${dtoIn.ideEmpr}
                    AND cf.ide_empr = ${dtoIn.ideEmpr}
                    AND cdn.ide_inarti = $8
                GROUP BY 
                    cf.ide_vgven
            )
            SELECT 
                vv.nombre_vgven AS vendedor,
                vv.num_facturas,
                vv.total_cantidad,
                vv.ventas_brutas - COALESCE(nc.total_notas_credito, 0) AS total_ventas,
                vv.total_cantidad - COALESCE(nc.total_cantidad_notas, 0) AS total_cantidad_neta,
                COALESCE(nc.total_notas_credito, 0) AS total_notas_credito,
                COALESCE(nc.total_cantidad_notas, 0) AS total_cantidad_notas,
                ROUND((vv.ventas_brutas - COALESCE(nc.total_notas_credito, 0)) / vv.num_facturas, 2) AS promedio_venta,
                ROUND(
                    (vv.total_bruto - COALESCE(nc.total_notas_credito, 0)) * 100.0 / 
                    NULLIF((
                        SELECT SUM(cdf2.total_ccdfa)
                        FROM cxc_deta_factura cdf2
                        JOIN cxc_cabece_factura cf2 ON cdf2.ide_cccfa = cf2.ide_cccfa
                        WHERE cf2.fecha_emisi_cccfa BETWEEN $5 AND $6
                        AND cf2.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                        AND cf2.ide_empr = ${dtoIn.ideEmpr}
                        AND cdf2.ide_inarti = $9
                    ), 0), 
                2) AS porcentaje
            FROM 
                ventas_vendedor_producto vv
            LEFT JOIN 
                notas_credito_vendedor_producto nc ON vv.ide_vgven = nc.ide_vgven
            ORDER BY 
                total_ventas DESC
            LIMIT ${dtoIn.limit || 10}
        `);

        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        query.addStringParam(3, dtoIn.fechaInicio);
        query.addStringParam(4, dtoIn.fechaFin);
        query.addStringParam(5, dtoIn.fechaInicio);
        query.addStringParam(6, dtoIn.fechaFin);
        query.addIntParam(7, dtoIn.ide_inarti);
        query.addIntParam(8, dtoIn.ide_inarti);
        query.addIntParam(9, dtoIn.ide_inarti);

        return await this.dataSource.createQuery(query);
    }



    async getTotalVentasProductoPorIdCliente(dtoIn: ClientesProductoDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            WITH ventas_tipo_identificacion AS (
                SELECT
                    d.ide_getid,
                    d.nombre_getid,
                    COUNT(DISTINCT a.ide_cccfa) AS num_facturas,
                    SUM(b.cantidad_ccdfa) AS cantidad_bruta,
                    SUM(b.total_ccdfa) AS ventas_brutas
                FROM
                    cxc_cabece_factura a
                INNER JOIN cxc_deta_factura b ON a.ide_cccfa = b.ide_cccfa
                INNER JOIN gen_persona c ON a.ide_geper = c.ide_geper
                INNER JOIN gen_tipo_identifi d ON c.ide_getid = d.ide_getid
                WHERE
                    a.fecha_emisi_cccfa >= $1
                    AND a.fecha_emisi_cccfa <= $2
                    AND b.ide_inarti = $3
                    AND a.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                    AND a.ide_empr = ${dtoIn.ideEmpr} 
                GROUP BY
                    d.ide_getid, d.nombre_getid
            ),
            notas_credito_tipo_identificacion AS (
                SELECT
                    d.ide_getid,
                    SUM(e.cantidad_cpdno) AS cantidad_notas,
                    SUM(e.valor_cpdno) AS total_notas_credito
                FROM
                    cxp_cabecera_nota cn
                INNER JOIN cxp_detalle_nota e ON cn.ide_cpcno = e.ide_cpcno
                INNER JOIN cxc_cabece_factura a ON cn.num_doc_mod_cpcno LIKE '%' || lpad(a.secuencial_cccfa::text, 9, '0')
                INNER JOIN gen_persona c ON a.ide_geper = c.ide_geper
                INNER JOIN gen_tipo_identifi d ON c.ide_getid = d.ide_getid
                WHERE
                    cn.fecha_emisi_cpcno >= $4
                    AND cn.fecha_emisi_cpcno <= $5
                    AND e.ide_inarti = $6
                    AND cn.ide_cpeno = 1
                    AND cn.ide_empr = ${dtoIn.ideEmpr}
                    AND a.ide_empr = ${dtoIn.ideEmpr}
                GROUP BY
                    d.ide_getid
            )
            SELECT
                v.ide_getid,
                v.nombre_getid,
                v.num_facturas,
                v.cantidad_bruta,
                v.ventas_brutas,
                COALESCE(nc.cantidad_notas, 0) AS cantidad_notas,
                COALESCE(nc.total_notas_credito, 0) AS total_notas_credito,
                (v.cantidad_bruta - COALESCE(nc.cantidad_notas, 0)) AS cantidad_neta,
                (v.ventas_brutas - COALESCE(nc.total_notas_credito, 0)) AS ventas_netas,
                ROUND(
                    (v.ventas_brutas - COALESCE(nc.total_notas_credito, 0)) * 100.0 / 
                    NULLIF((
                        SELECT SUM(b2.total_ccdfa)
                        FROM cxc_deta_factura b2
                        INNER JOIN cxc_cabece_factura a2 ON b2.ide_cccfa = a2.ide_cccfa
                        WHERE a2.fecha_emisi_cccfa >= $7
                        AND a2.fecha_emisi_cccfa <= $8
                        AND b2.ide_inarti = $9
                        AND a2.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                        AND a2.ide_empr = ${dtoIn.ideEmpr}
                    ), 0), 
                2) AS porcentaje
            FROM
                ventas_tipo_identificacion v
            LEFT JOIN
                notas_credito_tipo_identificacion nc ON v.ide_getid = nc.ide_getid
            ORDER BY
                ventas_netas DESC    
            LIMIT ${dtoIn.limit || 20}
        `);

        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        query.addIntParam(3, dtoIn.ide_inarti);
        query.addStringParam(4, dtoIn.fechaInicio);
        query.addStringParam(5, dtoIn.fechaFin);
        query.addIntParam(6, dtoIn.ide_inarti);
        query.addStringParam(7, dtoIn.fechaInicio);
        query.addStringParam(8, dtoIn.fechaFin);
        query.addIntParam(9, dtoIn.ide_inarti);

        return await this.dataSource.createSelectQuery(query);
    }


    async getVariacionInventario(dtoIn: VentasMensualesDto & HeaderParamsDto) {
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
                    END) AS egresos
                FROM
                    Meses m
                LEFT JOIN inv_det_comp_inve dci ON dci.ide_inarti = $1
                INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci AND cci.ide_inepi =  ${this.variables.get('p_inv_estado_normal')} 
                INNER JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                INNER JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                where cci.ide_empr = ${dtoIn.ideEmpr} 
                GROUP BY
                    m.ide_gemes, m.inicio_mes, m.fin_mes
            )
            SELECT
                m.nombre_gemes,
                COALESCE(t.saldo_inicial, 0) AS saldo_inicial,            
                COALESCE(t.ingresos, 0) AS ingresos,
                COALESCE(t.egresos, 0) AS egresos,
                COALESCE(t.saldo_final, 0) AS saldo_final
            FROM
                Meses m
            LEFT JOIN
                Transacciones t ON m.ide_gemes = t.ide_gemes
            ORDER BY
                m.ide_gemes;
    
            `,
            dtoIn,
        );
        query.addIntParam(1, dtoIn.ide_inarti);
        return await this.dataSource.createSelectQuery(query);
    }


    /**
  * Retorna el total de PROFORMAS mensuales de un producto en un periodo
  * @param dtoIn
  * @returns
  */
    async getProformasMensualesProducto(dtoIn: VentasMensualesDto & HeaderParamsDto) {
        if (dtoIn.periodo === 0) {
            dtoIn.periodo = getYear(new Date());
            dtoIn.ide_inarti = -1;
        }
        const query = new SelectQuery(
            `
        WITH 
        proformas_mes AS (
            SELECT
                EXTRACT(MONTH FROM a.fecha_cccpr) AS mes,
                COUNT(cdf.ide_ccdpr) AS num_proformas,
                SUM(cdf.cantidad_ccdpr) AS cantidad_cotizada,
                SUM(cdf.total_ccdpr) AS total_cotizado,
                MAX(f.siglas_inuni) AS siglas_inuni
            FROM
                cxc_cabece_proforma a
            INNER JOIN cxc_deta_proforma cdf ON a.ide_cccpr = cdf.ide_cccpr
            INNER JOIN inv_articulo d ON cdf.ide_inarti = d.ide_inarti
            LEFT JOIN inv_unidad f ON d.ide_inuni = f.ide_inuni
            WHERE
                a.fecha_cccpr BETWEEN $1 AND $2
                AND cdf.ide_inarti = $3
                AND a.anulado_cccpr = false
                AND a.ide_empr = ${dtoIn.ideEmpr} 
            GROUP BY EXTRACT(MONTH FROM a.fecha_cccpr)
        ),
        
        facturas_efectivas AS (
            SELECT
                EXTRACT(MONTH FROM c.fecha_emisi_cccfa) AS mes,
                COUNT(DISTINCT c.ide_cccfa) AS cotizaciones_efectivas,
                SUM(d.cantidad_ccdfa) AS cantidad_efectiva
            FROM
                cxc_cabece_factura c
            INNER JOIN cxc_deta_factura d ON c.ide_cccfa = d.ide_cccfa
            WHERE
                c.fecha_emisi_cccfa BETWEEN $4 AND $5
                AND d.ide_inarti = $6
                AND c.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                AND c.num_proforma_cccfa IS NOT NULL
            GROUP BY EXTRACT(MONTH FROM c.fecha_emisi_cccfa)
        )
        SELECT
            gm.nombre_gemes,
            ${dtoIn.periodo} AS periodo,
            COALESCE(pm.num_proformas, 0) AS num_proformas,
            COALESCE(pm.cantidad_cotizada, 0) AS cantidad,
            COALESCE(pm.siglas_inuni, '') AS siglas_inuni,
            COALESCE(pm.total_cotizado, 0) AS total,
            COALESCE(fe.cotizaciones_efectivas, 0) AS cotizaciones_efectivas,
            COALESCE(fe.cantidad_efectiva, 0) AS cantidad_efectiva,
            CASE 
                WHEN COALESCE(pm.cantidad_cotizada, 0) = 0 THEN 0
                ELSE ROUND(
                    (COALESCE(fe.cantidad_efectiva, 0)::numeric / 
                    NULLIF(pm.cantidad_cotizada, 0)::numeric) * 100, 
                    2
                )
            END AS porcentaje_efectividad
        FROM
            gen_mes gm
        LEFT JOIN proformas_mes pm ON gm.ide_gemes = pm.mes
        LEFT JOIN facturas_efectivas fe ON gm.ide_gemes = fe.mes
        ORDER BY
            gm.ide_gemes
        `,
            dtoIn,
        );
        query.addStringParam(1, `${dtoIn.periodo}-01-01`);
        query.addStringParam(2, `${dtoIn.periodo}-12-31`);
        query.addIntParam(3, dtoIn.ide_inarti);
        query.addStringParam(4, `${dtoIn.periodo}-01-01`);
        query.addStringParam(5, `${dtoIn.periodo}-12-31`);
        query.addIntParam(6, dtoIn.ide_inarti);

        return await this.dataSource.createQuery(query);
    }


    /**
     * Retorna el total de compras mensuales de un producto en un periodo
     * @param dtoIn
     * @returns
     */
    async getComprasMensuales(dtoIn: VentasMensualesDto & HeaderParamsDto) {
        if (dtoIn.periodo === 0) {
            dtoIn.periodo = getYear(new Date());
            dtoIn.ide_inarti = -1;
        }
        const query = new SelectQuery(
            `
    SELECT
        gm.nombre_gemes,
        ${dtoIn.periodo} as periodo,
        COALESCE(count(cdf.ide_cpcfa), 0) AS num_facturas,
        COALESCE(sum(cdf.cantidad_cpdfa), 0) AS cantidad,
        siglas_inuni,
        COALESCE(sum(cdf.valor_cpdfa), 0) AS total
    FROM
        gen_mes gm
    LEFT JOIN (
        SELECT
            EXTRACT(MONTH FROM fecha_emisi_cpcfa) AS mes,
            cdf.ide_cpcfa,
            cdf.cantidad_cpdfa,
            cdf.valor_cpdfa,
            siglas_inuni
        FROM
            cxp_cabece_factur a
        INNER JOIN
            cxp_detall_factur cdf ON a.ide_cpcfa = cdf.ide_cpcfa
        INNER JOIN 
            inv_articulo d ON cdf.ide_inarti = d.ide_inarti
        LEFT JOIN 
            inv_unidad f ON d.ide_inuni = f.ide_inuni 
        WHERE
            fecha_emisi_cpcfa  >=  $1 AND a.fecha_emisi_cpcfa <=  $2 
            AND cdf.ide_inarti = $3
            AND ide_cpefa = ${this.variables.get('p_cxp_estado_factura_normal')} 
            AND a.ide_empr = ${dtoIn.ideEmpr} 
    ) cdf ON gm.ide_gemes = cdf.mes
    GROUP BY
        gm.nombre_gemes, gm.ide_gemes, siglas_inuni
    ORDER BY
        gm.ide_gemes       
        `,
            dtoIn,
        );
        query.addStringParam(1, `${dtoIn.periodo}-01-01`);
        query.addStringParam(2, `${dtoIn.periodo}-12-31`);
        query.addIntParam(3, dtoIn.ide_inarti);
        return await this.dataSource.createQuery(query);
    }


    /**
 * Retorna el total de ventas mensuales de un producto específico en un período
 * @param dtoIn
 * @returns
 */
    async getTotalVentasMensualesProducto(dtoIn: VentasMensualesDto & HeaderParamsDto) {
        const query = new SelectQuery(`
        WITH FacturasFiltradas AS (
            SELECT 
                EXTRACT(MONTH FROM cf.fecha_emisi_cccfa) AS mes,
                EXTRACT(YEAR FROM cf.fecha_emisi_cccfa) AS anio,
                COUNT(DISTINCT cf.ide_cccfa) AS num_facturas,
                SUM(CASE WHEN cf.base_grabada_cccfa IS NOT NULL THEN cf.base_grabada_cccfa ELSE 0 END) AS ventas12,
                SUM(CASE WHEN cf.base_tarifa0_cccfa IS NOT NULL THEN cf.base_tarifa0_cccfa ELSE 0 END) AS ventas0,
                SUM(cdf.total_ccdfa) AS ventas_brutas,
                SUM(cdf.cantidad_ccdfa) AS cantidad_vendida,
                SUM(cdf.total_ccdfa) AS total
            FROM 
                cxc_cabece_factura cf
            JOIN
                cxc_deta_factura cdf ON cf.ide_cccfa = cdf.ide_cccfa
            WHERE 
                cf.fecha_emisi_cccfa >= $1 AND cf.fecha_emisi_cccfa <= $2
                AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                AND cf.ide_empr = ${dtoIn.ideEmpr}
                AND cdf.ide_inarti = $5
            GROUP BY 
                EXTRACT(MONTH FROM cf.fecha_emisi_cccfa),
                EXTRACT(YEAR FROM cf.fecha_emisi_cccfa)
        ),
        NotasCredito AS (
            SELECT 
                EXTRACT(MONTH FROM cn.fecha_emisi_cpcno) AS mes,
                EXTRACT(YEAR FROM cn.fecha_emisi_cpcno) AS anio,
                SUM(cdn.valor_cpdno) AS total_nota_credito,
                SUM(cdn.cantidad_cpdno) AS cantidad_nota_credito
            FROM 
                cxp_cabecera_nota cn
            JOIN
                cxp_detalle_nota cdn ON cn.ide_cpcno = cdn.ide_cpcno
            JOIN 
                cxc_cabece_factura cf ON cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
            WHERE 
                cn.fecha_emisi_cpcno BETWEEN $3 AND $4
                AND cn.ide_cpeno = 1
                AND cn.ide_empr = ${dtoIn.ideEmpr}
                AND cf.ide_empr = ${dtoIn.ideEmpr}
                AND cdn.ide_inarti = $6
            GROUP BY 
                EXTRACT(MONTH FROM cn.fecha_emisi_cpcno),
                EXTRACT(YEAR FROM cn.fecha_emisi_cpcno)
        )
        SELECT 
            gm.ide_gemes,
            gm.nombre_gemes,
            COALESCE(ff.num_facturas, 0) AS num_facturas,
            COALESCE(ff.ventas12, 0) AS ventas_con_iva,
            COALESCE(ff.ventas0, 0) AS ventas0,
            COALESCE(ff.cantidad_vendida, 0) AS cantidad_vendida,
            COALESCE(ff.ventas_brutas, 0) AS ventas_brutas,
            COALESCE(nc.total_nota_credito, 0) AS total_nota_credito,
            COALESCE(nc.cantidad_nota_credito, 0) AS cantidad_nota_credito,
            COALESCE(ff.ventas_brutas, 0) - COALESCE(nc.total_nota_credito, 0) AS ventas_netas,
            COALESCE(ff.cantidad_vendida, 0) - COALESCE(nc.cantidad_nota_credito, 0) AS cantidad_neta,
            COALESCE(ff.total, 0) - COALESCE(nc.total_nota_credito, 0) AS total_neto,
            ROUND(
                (COALESCE(ff.ventas_brutas, 0) - COALESCE(nc.total_nota_credito, 0)) * 100.0 / 
                NULLIF((
                    SELECT SUM(cdf2.total_ccdfa)
                    FROM cxc_deta_factura cdf2
                    JOIN cxc_cabece_factura cf2 ON cdf2.ide_cccfa = cf2.ide_cccfa
                    WHERE cf2.fecha_emisi_cccfa >= $7 AND cf2.fecha_emisi_cccfa <= $8
                    AND cf2.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                    AND cf2.ide_empr = ${dtoIn.ideEmpr}
                    AND cdf2.ide_inarti = $9
                ), 0), 
            2) AS porcentaje_anual
        FROM 
            gen_mes gm
        LEFT JOIN 
            FacturasFiltradas ff ON gm.ide_gemes = ff.mes
        LEFT JOIN 
            NotasCredito nc ON gm.ide_gemes = nc.mes AND (ff.anio = nc.anio OR ff.anio IS NULL)
        ORDER BY 
            gm.ide_gemes
    `);

        query.addStringParam(1, `${dtoIn.periodo}-01-01`);
        query.addStringParam(2, `${dtoIn.periodo}-12-31`);
        query.addStringParam(3, `${dtoIn.periodo}-01-01`);
        query.addStringParam(4, `${dtoIn.periodo}-12-31`);
        query.addIntParam(5, dtoIn.ide_inarti);
        query.addIntParam(6, dtoIn.ide_inarti);
        query.addStringParam(7, `${dtoIn.periodo}-01-01`);
        query.addStringParam(8, `${dtoIn.periodo}-12-31`);
        query.addIntParam(9, dtoIn.ide_inarti);

        return await this.dataSource.createQuery(query);
    }


    async getTendenciaVentasDiaProducto(dtoIn: ClientesProductoDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            WITH ventas_dia_semana AS (
                SELECT 
                    EXTRACT(DOW FROM cf.fecha_emisi_cccfa) AS num_dia,
                    TO_CHAR(cf.fecha_emisi_cccfa, 'Day') AS dia_semana,
                    COUNT(DISTINCT cf.ide_cccfa) AS num_facturas,
                    SUM(cdf.total_ccdfa) AS total_ventas_brutas,
                    SUM(cdf.cantidad_ccdfa) AS total_cantidad_bruta,
                    AVG(cdf.total_ccdfa) AS promedio_venta
                FROM 
                    cxc_cabece_factura cf
                JOIN
                    cxc_deta_factura cdf ON cf.ide_cccfa = cdf.ide_cccfa
                WHERE 
                    cf.fecha_emisi_cccfa BETWEEN $1 AND $2
                    AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                    AND cf.ide_empr = ${dtoIn.ideEmpr}
                    AND cdf.ide_inarti = $3
                GROUP BY 
                    TO_CHAR(cf.fecha_emisi_cccfa, 'Day'), EXTRACT(DOW FROM cf.fecha_emisi_cccfa)
            ),
            notas_credito_dia_semana AS (
                SELECT 
                    EXTRACT(DOW FROM cn.fecha_emisi_cpcno) AS num_dia,
                    SUM(cdn.valor_cpdno) AS total_notas_credito,
                    SUM(cdn.cantidad_cpdno) AS total_cantidad_notas
                FROM 
                    cxp_cabecera_nota cn
                JOIN
                    cxp_detalle_nota cdn ON cn.ide_cpcno = cdn.ide_cpcno
                JOIN 
                    cxc_cabece_factura cf ON cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
                WHERE 
                    cn.fecha_emisi_cpcno BETWEEN $4 AND $5
                    AND cn.ide_cpeno = 1
                    AND cn.ide_empr = ${dtoIn.ideEmpr}
                    AND cf.ide_empr = ${dtoIn.ideEmpr}
                    AND cdn.ide_inarti = $6
                GROUP BY 
                    EXTRACT(DOW FROM cn.fecha_emisi_cpcno)
            )
            SELECT 
                vd.num_dia,
                TRIM(vd.dia_semana) AS dia_semana,
                vd.num_facturas,
                vd.total_ventas_brutas,
                vd.total_cantidad_bruta,
                COALESCE(nc.total_notas_credito, 0) AS total_notas_credito,
                COALESCE(nc.total_cantidad_notas, 0) AS total_cantidad_notas,
                (vd.total_ventas_brutas - COALESCE(nc.total_notas_credito, 0)) AS total_ventas_netas,
                (vd.total_cantidad_bruta - COALESCE(nc.total_cantidad_notas, 0)) AS total_cantidad_neta,
                vd.promedio_venta,
                ROUND(
                    (vd.total_ventas_brutas - COALESCE(nc.total_notas_credito, 0)) * 100.0 / 
                    NULLIF((
                        SELECT SUM(cdf2.total_ccdfa)
                        FROM cxc_deta_factura cdf2
                        JOIN cxc_cabece_factura cf2 ON cdf2.ide_cccfa = cf2.ide_cccfa
                        WHERE cf2.fecha_emisi_cccfa BETWEEN $7 AND $8
                        AND cf2.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                        AND cf2.ide_empr = ${dtoIn.ideEmpr}
                        AND cdf2.ide_inarti = $9
                    ), 0), 
                2) AS porcentaje_total
            FROM 
                ventas_dia_semana vd
            LEFT JOIN 
                notas_credito_dia_semana nc ON vd.num_dia = nc.num_dia
            ORDER BY 
                vd.num_dia
        `);

        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        query.addIntParam(3, dtoIn.ide_inarti);
        query.addStringParam(4, dtoIn.fechaInicio);
        query.addStringParam(5, dtoIn.fechaFin);
        query.addIntParam(6, dtoIn.ide_inarti);
        query.addStringParam(7, dtoIn.fechaInicio);
        query.addStringParam(8, dtoIn.fechaFin);
        query.addIntParam(9, dtoIn.ide_inarti);

        return await this.dataSource.createQuery(query);
    }


    async getResumenVentasPeriodosProducto(dtoIn: IdProductoDto & HeaderParamsDto) {
        const query = new SelectQuery(`            
            WITH ventas_anio_producto AS (
                SELECT 
                    EXTRACT(YEAR FROM cf.fecha_emisi_cccfa) AS anio,
                    COUNT(DISTINCT cf.ide_cccfa) AS total_facturas,
                    SUM(cdf.total_ccdfa) AS total_ventas_bruto,
                    SUM(cdf.cantidad_ccdfa) AS total_cantidad_bruta,
                    AVG(cdf.total_ccdfa) AS promedio_venta_por_factura,
                    COUNT(DISTINCT cf.ide_geper) AS clientes_unicos,
                    COUNT(DISTINCT cf.ide_vgven) AS vendedores_activos
                FROM 
                    cxc_cabece_factura cf
                JOIN
                    cxc_deta_factura cdf ON cf.ide_cccfa = cdf.ide_cccfa
                WHERE 
                    cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                    AND cf.ide_empr = ${dtoIn.ideEmpr}
                    AND cdf.ide_inarti = $1
                GROUP BY 
                    EXTRACT(YEAR FROM cf.fecha_emisi_cccfa)
            ),
            notas_credito_anio_producto AS (
                SELECT 
                    EXTRACT(YEAR FROM cn.fecha_emisi_cpcno) AS anio,
                    SUM(cdn.valor_cpdno) AS total_notas_credito,
                    SUM(cdn.cantidad_cpdno) AS total_cantidad_notas
                FROM 
                    cxp_cabecera_nota cn
                JOIN
                    cxp_detalle_nota cdn ON cn.ide_cpcno = cdn.ide_cpcno
                JOIN 
                    cxc_cabece_factura cf ON cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
                WHERE 
                    cn.ide_cpeno = 1
                    AND cn.ide_empr = ${dtoIn.ideEmpr}
                    AND cf.ide_empr = ${dtoIn.ideEmpr}
                    AND cdn.ide_inarti = $2
                GROUP BY 
                    EXTRACT(YEAR FROM cn.fecha_emisi_cpcno)
            )
            
            SELECT 
                vp.anio,
                vp.total_facturas,
                vp.total_ventas_bruto,
                vp.total_cantidad_bruta,
                COALESCE(nc.total_notas_credito, 0) AS total_notas_credito,
                COALESCE(nc.total_cantidad_notas, 0) AS total_cantidad_notas,
                (vp.total_ventas_bruto - COALESCE(nc.total_notas_credito, 0)) AS total_ventas_neto,
                (vp.total_cantidad_bruta - COALESCE(nc.total_cantidad_notas, 0)) AS total_cantidad_neta,
                vp.promedio_venta_por_factura,
                vp.clientes_unicos,
                vp.vendedores_activos,
                ROUND(
                    (vp.total_ventas_bruto - COALESCE(nc.total_notas_credito, 0)) * 100.0 / 
                    NULLIF((
                        SELECT SUM(cdf2.total_ccdfa)
                        FROM cxc_deta_factura cdf2
                        JOIN cxc_cabece_factura cf2 ON cdf2.ide_cccfa = cf2.ide_cccfa
                        WHERE cf2.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                        AND cf2.ide_empr = ${dtoIn.ideEmpr}
                        AND cdf2.ide_inarti = $3
                    ), 0), 
                2) AS porcentaje_ventas_totales,
                ROUND(
                    (vp.total_cantidad_bruta - COALESCE(nc.total_cantidad_notas, 0)) * 100.0 / 
                    NULLIF((
                        SELECT SUM(cdf2.cantidad_ccdfa)
                        FROM cxc_deta_factura cdf2
                        JOIN cxc_cabece_factura cf2 ON cdf2.ide_cccfa = cf2.ide_cccfa
                        WHERE cf2.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                        AND cf2.ide_empr = ${dtoIn.ideEmpr}
                        AND cdf2.ide_inarti = $4
                    ), 0), 
                2) AS porcentaje_cantidad_total
            FROM 
                ventas_anio_producto vp
            LEFT JOIN 
                notas_credito_anio_producto nc ON vp.anio = nc.anio
            ORDER BY 
                vp.anio DESC
        `);

        query.addIntParam(1, dtoIn.ide_inarti);
        query.addIntParam(2, dtoIn.ide_inarti);
        query.addIntParam(3, dtoIn.ide_inarti);
        query.addIntParam(4, dtoIn.ide_inarti);

        return await this.dataSource.createQuery(query);
    }



    //==============

    /**
     * Obtiene el total de tipo de transaccion de inventario por mes 
     * @param dtoIn 
     * @returns 
     */
    async getAnalisisTransaccionesTipo(dtoIn: TrnProductoDto & HeaderParamsDto) {
        const whereClause = dtoIn.ide_inbod ? ` AND cci.ide_inbod = ${dtoIn.ide_inbod}` : '';

        const query = new SelectQuery(`
            SELECT 
                EXTRACT(YEAR FROM cci.fecha_trans_incci) AS anio,
                EXTRACT(MONTH FROM cci.fecha_trans_incci) AS mes,
                TO_CHAR(cci.fecha_trans_incci, 'Month') AS nombre_mes,
                tti.nombre_intti AS tipo_movimiento,
                tci.signo_intci AS signo,
                COUNT(DISTINCT cci.ide_incci) AS total_transacciones,
                SUM(CASE WHEN tci.signo_intci = 1 THEN dci.cantidad_indci ELSE 0 END) AS total_ingresos,
                SUM(CASE WHEN tci.signo_intci = -1 THEN dci.cantidad_indci ELSE 0 END) AS total_egresos,
                SUM(dci.cantidad_indci * tci.signo_intci) AS movimiento_neto,
                ROUND(AVG(dci.precio_indci), 2) AS precio_promedio
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
            WHERE 
                dci.ide_inarti = $1
                AND arti.ide_empr = ${dtoIn.ideEmpr}
                AND cci.fecha_trans_incci BETWEEN $2 AND $3
                AND cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                ${whereClause}
            GROUP BY 
                EXTRACT(YEAR FROM cci.fecha_trans_incci),
                EXTRACT(MONTH FROM cci.fecha_trans_incci),
                TO_CHAR(cci.fecha_trans_incci, 'Month'),
                tti.nombre_intti, tci.signo_intci
            ORDER BY 
                anio DESC, mes DESC, total_egresos DESC
        `, dtoIn);

        query.addIntParam(1, dtoIn.ide_inarti);
        query.addParam(2, dtoIn.fechaInicio);
        query.addParam(3, dtoIn.fechaFin);

        return await this.dataSource.createQuery(query);
    }



    async getAnalisisRotacionStock(dtoIn: TrnProductoDto & HeaderParamsDto) {
        const whereClause = dtoIn.ide_inbod ? ` AND cci.ide_inbod = ${dtoIn.ide_inbod}` : '';

        const query = new SelectQuery(`
            WITH movimientos_mensuales AS (
                SELECT 
                    EXTRACT(YEAR FROM cci.fecha_trans_incci) AS anio,
                    EXTRACT(MONTH FROM cci.fecha_trans_incci) AS mes,
                    TO_CHAR(cci.fecha_trans_incci, 'Month') AS nombre_mes,
                    SUM(CASE WHEN tci.signo_intci = 1 THEN dci.cantidad_indci ELSE 0 END) AS ingresos,
                    SUM(CASE WHEN tci.signo_intci = -1 THEN dci.cantidad_indci ELSE 0 END) AS egresos,
                    AVG(CASE WHEN tci.signo_intci = -1 THEN dci.cantidad_indci ELSE NULL END) AS promedio_egresos_diarios,
                    COUNT(DISTINCT CASE WHEN tci.signo_intci = -1 THEN DATE(cci.fecha_trans_incci) ELSE NULL END) AS dias_con_egresos
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
                WHERE 
                    dci.ide_inarti = $1
                    AND arti.ide_empr = ${dtoIn.ideEmpr}
                    AND cci.fecha_trans_incci BETWEEN $2 AND $3
                    AND cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                    ${whereClause}
                GROUP BY 
                    EXTRACT(YEAR FROM cci.fecha_trans_incci),
                    EXTRACT(MONTH FROM cci.fecha_trans_incci),
                    TO_CHAR(cci.fecha_trans_incci, 'Month')
            ),
            estadisticas AS (
                SELECT
                    anio,
                    mes,
                    nombre_mes,
                    ingresos,
                    egresos,
                    promedio_egresos_diarios,
                    dias_con_egresos,
                    -- Rotación mensual (egresos / promedio de inventario)
                    ROUND(egresos / NULLIF((ingresos + egresos) / 2, 0), 2) AS rotacion_mensual,
                    -- Stock de seguridad (promedio diario * días de cobertura)
                    ROUND(promedio_egresos_diarios * 7, 2) AS stock_seguridad_7dias,
                    ROUND(promedio_egresos_diarios * 15, 2) AS stock_seguridad_15dias,
                    -- Punto de reorden (stock seguridad + lead time)
                    ROUND((promedio_egresos_diarios * 7) + (promedio_egresos_diarios * 3), 2) AS punto_reorden_estimado
                FROM 
                    movimientos_mensuales
            )
            SELECT *
            FROM estadisticas
            ORDER BY anio DESC, mes DESC
        `, dtoIn);

        query.addIntParam(1, dtoIn.ide_inarti);
        query.addParam(2, dtoIn.fechaInicio);
        query.addParam(3, dtoIn.fechaFin);

        return await this.dataSource.createQuery(query);
    }


    async getPrediccionStockMensual(dtoIn: TrnProductoDto & HeaderParamsDto) {
        const whereClause = dtoIn.ide_inbod ? ` AND cci.ide_inbod = ${dtoIn.ide_inbod}` : '';

        const query = new SelectQuery(`
            WITH historico_mensual AS (
                SELECT 
                    EXTRACT(YEAR FROM cci.fecha_trans_incci) AS anio,
                    EXTRACT(MONTH FROM cci.fecha_trans_incci) AS mes,
                    TO_CHAR(cci.fecha_trans_incci, 'Month') AS nombre_mes,
                    SUM(CASE WHEN tci.signo_intci = -1 THEN dci.cantidad_indci ELSE 0 END) AS egresos_mensuales,
                    COUNT(DISTINCT CASE WHEN tci.signo_intci = -1 THEN cci.ide_incci ELSE NULL END) AS transacciones_salida
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
                WHERE 
                    dci.ide_inarti = $1
                    AND arti.ide_empr = ${dtoIn.ideEmpr}
                    AND cci.fecha_trans_incci BETWEEN $2 AND $3
                    AND cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                    ${whereClause}
                GROUP BY 
                    EXTRACT(YEAR FROM cci.fecha_trans_incci),
                    EXTRACT(MONTH FROM cci.fecha_trans_incci),
                    TO_CHAR(cci.fecha_trans_incci, 'Month')
            ),
            promedios_mensuales AS (
                SELECT
                    mes,
                    nombre_mes,
                    ROUND(AVG(egresos_mensuales), 2) AS promedio_historico_egresos,
                    ROUND(STDDEV(egresos_mensuales), 2) AS desviacion_estandar,
                    ROUND(AVG(transacciones_salida), 2) AS promedio_transacciones,
                    COUNT(*) AS anos_con_datos
                FROM 
                    historico_mensual
                GROUP BY 
                    mes, nombre_mes
            ),
            prediccion AS (
                SELECT
                    pm.mes,
                    pm.nombre_mes,
                    pm.promedio_historico_egresos,
                    pm.desviacion_estandar,
                    pm.promedio_transacciones,
                    pm.anos_con_datos,
                    -- Predicción con margen de seguridad (promedio + 1 desviación estándar)
                    ROUND(pm.promedio_historico_egresos + pm.desviacion_estandar, 2) AS prediccion_con_seguridad,
                    -- Stock recomendado para 30 días
                    ROUND((pm.promedio_historico_egresos + pm.desviacion_estandar) * 1.2, 2) AS stock_recomendado_mensual
                FROM 
                    promedios_mensuales pm
            )
            SELECT *
            FROM prediccion
            ORDER BY mes
        `, dtoIn);

        query.addIntParam(1, dtoIn.ide_inarti);
        query.addParam(2, dtoIn.fechaInicio);
        query.addParam(3, dtoIn.fechaFin);

        return await this.dataSource.createQuery(query);
    }



    async getAnalisisBodegasMensual(dtoIn: TrnProductoDto & HeaderParamsDto) {
        const query = new SelectQuery(`
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
        `, dtoIn);

        query.addIntParam(1, dtoIn.ide_inarti);
        query.addParam(2, dtoIn.fechaInicio);
        query.addParam(3, dtoIn.fechaFin);

        return await this.dataSource.createQuery(query);
    }



    async getEvaluacionRotacionProducto(dtoIn: IdProductoDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            WITH periodo_analisis AS (
                SELECT 
                    CURRENT_DATE - INTERVAL '365 days' AS fecha_inicio,
                    CURRENT_DATE AS fecha_fin
            ),
            movimientos_recientes AS (
                SELECT 
                    art.ide_inarti,
                    art.nombre_inarti,
                    art.cant_stock1_inarti AS stock_minimo,
                    art.cant_stock2_inarti AS stock_ideal,
                    uni.siglas_inuni,
                    -- Movimientos últimos 365 días
                    SUM(CASE WHEN tci.signo_intci = 1 THEN dci.cantidad_indci ELSE 0 END) AS ingresos_365dias,
                    SUM(CASE WHEN tci.signo_intci = -1 THEN dci.cantidad_indci ELSE 0 END) AS egresos_365dias,
                    COUNT(DISTINCT CASE WHEN tci.signo_intci = -1 THEN cci.ide_incci ELSE NULL END) AS facturas_venta_365dias,
                    COUNT(DISTINCT DATE(cci.fecha_trans_incci)) AS dias_con_venta_365dias
                FROM 
                    inv_det_comp_inve dci
                INNER JOIN 
                    inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                INNER JOIN 
                    inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                INNER JOIN 
                    inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                INNER JOIN 
                    inv_articulo art ON dci.ide_inarti = art.ide_inarti
                LEFT JOIN
                    inv_unidad uni ON art.ide_inuni = uni.ide_inuni
                CROSS JOIN
                    periodo_analisis pa
                WHERE 
                    dci.ide_inarti = $1
                    AND art.ide_empr = ${dtoIn.ideEmpr}
                    AND cci.fecha_trans_incci BETWEEN pa.fecha_inicio AND pa.fecha_fin
                    AND cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                GROUP BY 
                    art.ide_inarti, art.nombre_inarti, art.cant_stock1_inarti, 
                    art.cant_stock2_inarti, uni.siglas_inuni
            ),
            saldo_actual AS (
                SELECT 
                    dci.ide_inarti,
                    f_redondeo(SUM(dci.cantidad_indci * tci.signo_intci), art.decim_stock_inarti) AS saldo_actual
                FROM 
                    inv_det_comp_inve dci
                INNER JOIN 
                    inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                INNER JOIN 
                    inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                INNER JOIN 
                    inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                INNER JOIN 
                    inv_articulo art ON dci.ide_inarti = art.ide_inarti
                WHERE 
                    dci.ide_inarti = $2
                    AND cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                    AND art.ide_empr = ${dtoIn.ideEmpr}
                GROUP BY 
                    dci.ide_inarti, art.decim_stock_inarti
            ),
            ultima_compra AS (
                SELECT 
                    dci.ide_inarti,
                    MAX(cci.fecha_trans_incci) AS fecha_ultima_compra,
                    AVG(dci.precio_indci) AS precio_promedio_compra
                FROM 
                    inv_det_comp_inve dci
                INNER JOIN 
                    inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                INNER JOIN 
                    inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                INNER JOIN 
                    inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                WHERE 
                    dci.ide_inarti = $3
                    AND tci.signo_intci = 1  -- Solo compras/ingresos
                    AND cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                GROUP BY 
                    dci.ide_inarti
            ),
            calculo_dias_stock AS (
                SELECT 
                    mr.ide_inarti,
                    mr.nombre_inarti,
                    mr.siglas_inuni,
                    COALESCE(sa.saldo_actual, 0) AS stock_actual,
                    mr.stock_minimo,
                    mr.stock_ideal,
                    mr.egresos_365dias AS ventas_ultimos_365dias,
                    mr.facturas_venta_365dias,
                    mr.dias_con_venta_365dias,
                    -- CÁLCULO DE DÍAS DE STOCK
                    CASE 
                        WHEN COALESCE(sa.saldo_actual, 0) > 0 AND (mr.egresos_365dias / NULLIF(mr.dias_con_venta_365dias, 0)) > 0 THEN
                            ROUND(COALESCE(sa.saldo_actual, 0) / (mr.egresos_365dias / NULLIF(mr.dias_con_venta_365dias, 0)), 1)
                        ELSE 999
                    END AS dias_stock_disponible
                FROM 
                    movimientos_recientes mr
                LEFT JOIN 
                    saldo_actual sa ON mr.ide_inarti = sa.ide_inarti
            )
            SELECT 
                cd.ide_inarti,
                cd.nombre_inarti,
                cd.siglas_inuni,
                -- DATOS DE STOCK ACTUAL
                cd.stock_actual,
                cd.stock_minimo,
                cd.stock_ideal,
                -- DATOS DE ROTACIÓN
                cd.ventas_ultimos_365dias,
                cd.facturas_venta_365dias,
                cd.dias_con_venta_365dias,
                -- MÉTRICAS DE ROTACIÓN
                ROUND(cd.ventas_ultimos_365dias / 3, 2) AS promedio_venta_mensual,
                ROUND(cd.ventas_ultimos_365dias / NULLIF(cd.dias_con_venta_365dias, 0), 2) AS promedio_venta_diario,
                ROUND((cd.dias_con_venta_365dias * 100.0) / 365, 2) AS frecuencia_venta_porcentaje,
                -- DÍAS DE STOCK
                cd.dias_stock_disponible,
                -- EVALUACIÓN DE ROTACIÓN
                CASE 
                    WHEN cd.ventas_ultimos_365dias = 0 THEN 'SIN ROTACIÓN'
                    WHEN (cd.ventas_ultimos_365dias / 3) > cd.stock_actual * 2 THEN 'ROTACIÓN MUY ALTA'
                    WHEN (cd.ventas_ultimos_365dias / 3) > cd.stock_actual THEN 'ROTACIÓN ALTA'
                    WHEN (cd.ventas_ultimos_365dias / 3) > cd.stock_actual * 0.5 THEN 'ROTACIÓN MEDIA'
                    ELSE 'ROTACIÓN BAJA'
                END AS nivel_rotacion,
                -- RECOMENDACIONES DE COMPRA
                CASE 
                    -- SIN STOCK - COMPRAR URGENTE
                    WHEN cd.stock_actual <= 0 THEN 
                        'COMPRAR URGENTE - Stock agotado'
                    
                    -- STOCK CRÍTICO
                    WHEN cd.stock_actual < cd.stock_minimo THEN 
                        'COMPRAR INMEDIATO - Stock por debajo del mínimo'
                    
                    -- ROTACIÓN ALTA Y STOCK BAJO
                    WHEN (cd.ventas_ultimos_365dias / 3) > cd.stock_actual THEN
                        'COMPRAR RÁPIDO - Alta rotación, stock insuficiente'
                    
                    -- STOCK POR DEBAJO DEL IDEAL CON BUENA ROTACIÓN
                    WHEN cd.stock_actual < cd.stock_ideal AND 
                         (cd.ventas_ultimos_365dias / 3) > cd.stock_actual * 0.7 THEN
                        'COMPRAR PRONTO - Stock bajo ideal con buena rotación'
                    
                    -- ROTACIÓN MEDIA Y STOCK ADECUADO
                    WHEN cd.stock_actual >= cd.stock_ideal AND 
                         (cd.ventas_ultimos_365dias / 3) <= cd.stock_actual * 0.5 THEN
                        'MANTENER STOCK - Rotación media, stock adecuado'
                    
                    -- ROTACIÓN BAJA Y STOCK ALTO
                    WHEN cd.stock_actual > cd.stock_ideal AND cd.ventas_ultimos_365dias = 0 THEN
                        'REDUCIR COMPRAS - Sin rotación y stock alto'
                    
                    -- SITUACIÓN NORMAL
                    ELSE 'EVALUAR PERIÓDICAMENTE - Situación estable'
                END AS recomendacion_compra,
                -- CANTIDAD RECOMENDADA A COMPRAR
                CASE 
                    WHEN cd.stock_actual <= 0 THEN 
                        GREATEST(cd.stock_ideal, (cd.ventas_ultimos_365dias / 3) * 1.5)
                    
                    WHEN cd.stock_actual < cd.stock_minimo THEN 
                        (cd.stock_ideal - cd.stock_actual) + (cd.ventas_ultimos_365dias / 3) * 0.5
                    
                    WHEN (cd.ventas_ultimos_365dias / 3) > cd.stock_actual THEN
                        ((cd.ventas_ultimos_365dias / 3) * 1.2) - cd.stock_actual
                    
                    WHEN cd.stock_actual < cd.stock_ideal AND 
                         (cd.ventas_ultimos_365dias / 3) > cd.stock_actual * 0.7 THEN
                        cd.stock_ideal - cd.stock_actual
                    
                    ELSE 0
                END AS cantidad_recomendada_compra,
                -- ALERTAS
                CASE 
                    WHEN cd.stock_actual <= 0 THEN 'ALERTA ROJA - SIN STOCK'
                    WHEN cd.stock_actual < cd.stock_minimo THEN 'ALERTA NARANJA - STOCK MÍNIMO'
                    WHEN cd.dias_stock_disponible < 7 THEN 'ALERTA AMARILLA - STOCK BAJO'
                    ELSE 'SITUACIÓN NORMAL'
                END AS nivel_alerta,
                -- INFORMACIÓN ADICIONAL
                uc.fecha_ultima_compra,
                uc.precio_promedio_compra,
                -- Días desde última compra usando cálculo simple
                CASE 
                    WHEN uc.fecha_ultima_compra IS NOT NULL THEN
                        (CURRENT_DATE - uc.fecha_ultima_compra)
                    ELSE -1
                END AS dias_desde_ultima_compra
            FROM 
                calculo_dias_stock cd
            LEFT JOIN 
                ultima_compra uc ON cd.ide_inarti = uc.ide_inarti
            WHERE 
                cd.ide_inarti = $4
        `, dtoIn);

        query.addIntParam(1, dtoIn.ide_inarti);
        query.addIntParam(2, dtoIn.ide_inarti);
        query.addIntParam(3, dtoIn.ide_inarti);
        query.addIntParam(4, dtoIn.ide_inarti);

        return await this.dataSource.createQuery(query);
    }
}