import { BadRequestException, Injectable } from '@nestjs/common';
import { getYear } from 'date-fns';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { CoreService } from 'src/core/core.service';
import { isDefined } from 'src/util/helpers/common-util';

import { BaseService } from '../../../../common/base-service';
import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery } from '../../../connection/helpers/select-query';
import { IdProductoDto } from '../productos/dto/id-producto.dto';
import { TrnProductoDto } from '../productos/dto/trn-producto.dto';
import { VentasMensualesDto } from '../productos/dto/ventas-mensuales.dto';

import { AnalisisProductoDto } from './dto/analisis-producto.dto';
import { AnalisisDto } from './dto/analisis.dto';
import { ClientesProductoDto } from './dto/clientes-producto.dto';
import { ProductosMayorStockDto } from './dto/productos-mayor-stock.dto';
import { ProductosObsoletosDto } from './dto/productos-obsoletos.dto';
import { ProductosStockBajoDto } from './dto/productos-stock-bajo.dto';
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
    const limitConfig = isDefined(dtoIn.limit) ? `LIMIT ${dtoIn.limit}` : '';

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
         ${limitConfig}`,
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
    const limitConfig = isDefined(dtoIn.limit) ? `LIMIT ${dtoIn.limit}` : '';
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
         ${limitConfig}`,
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
    const limitConfig = isDefined(dtoIn.limit) ? `LIMIT ${dtoIn.limit}` : '';
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
        ${limitConfig}`,
      dtoIn,
    );
    query.addStringParam(1, dtoIn.fechaInicio);
    query.addStringParam(2, dtoIn.fechaFin);
    return await this.dataSource.createQuery(query);
  }

  async getTopProductosMayorRotacion(dtoIn: TopProductosDto & HeaderParamsDto) {
    const limitConfig = isDefined(dtoIn.limit) ? `LIMIT ${dtoIn.limit}` : '';
    const query = new SelectQuery(
      `
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
                    -- Promedio diario de ventas (CON MANEJO DE CERO)
                    CASE 
                        WHEN COUNT(DISTINCT DATE(cci.fecha_trans_incci)) > 0 
                        THEN ROUND(
                            SUM(CASE WHEN tci.signo_intci = -1 THEN dci.cantidad_indci ELSE 0 END) / 
                            COUNT(DISTINCT DATE(cci.fecha_trans_incci)), 
                        2)
                        ELSE 0
                    END AS promedio_venta_diario,
                    -- COSTO PROMEDIO CON MANEJO DE CERO
                    CASE 
                        WHEN SUM(CASE WHEN tci.signo_intci = 1 THEN dci.cantidad_indci ELSE 0 END) > 0 
                        THEN SUM(CASE WHEN tci.signo_intci = 1 THEN dci.cantidad_indci * dci.precio_indci ELSE 0 END) / 
                             SUM(CASE WHEN tci.signo_intci = 1 THEN dci.cantidad_indci ELSE 0 END)
                        ELSE 0 
                    END AS costo_promedio_periodo
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
                    f_redondeo(SUM(dci.cantidad_indci * tci.signo_intci), art.decim_stock_inarti) AS saldo_actual,
                    -- COSTO PROMEDIO CON MANEJO DE CERO
                    CASE 
                        WHEN SUM(CASE WHEN tci.signo_intci = 1 THEN dci.cantidad_indci ELSE 0 END) > 0 
                        THEN SUM(CASE WHEN tci.signo_intci = 1 THEN dci.cantidad_indci * dci.precio_indci ELSE 0 END) / 
                             SUM(CASE WHEN tci.signo_intci = 1 THEN dci.cantidad_indci ELSE 0 END)
                        ELSE 0 
                    END AS costo_promedio_acumulado
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
                    CASE 
                        WHEN EXTRACT(DAYS FROM ($3::timestamp - $4::timestamp))::integer + 1 > 0 
                        THEN EXTRACT(DAYS FROM ($5::timestamp - $6::timestamp))::integer + 1
                        ELSE 1  -- Evitar división por cero
                    END AS total_dias_periodo
            ),
            datos_calculados AS (
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
                    
                    -- MÉTRICAS DE VALOR CON MANEJO DE CERO
                    ROUND(mp.egresos_periodo * mp.costo_promedio_periodo, 2) AS costo_ventas_periodo,
                    ROUND(COALESCE(sa.saldo_actual, 0) * COALESCE(sa.costo_promedio_acumulado, 0), 2) AS valor_inventario_actual,
                    
                    -- ROTACIÓN MEJORADA CON MANEJO DE CERO
                    CASE 
                        WHEN COALESCE(sa.saldo_actual, 0) > 0 AND COALESCE(sa.costo_promedio_acumulado, 0) > 0
                        THEN ROUND(
                            (mp.egresos_periodo * mp.costo_promedio_periodo) / 
                            (COALESCE(sa.saldo_actual, 0) * COALESCE(sa.costo_promedio_acumulado, 0)), 
                            2
                        )
                        ELSE 0
                    END AS indice_rotacion_valor,
                    
                    -- ROTACIÓN POR CANTIDADES CON MANEJO DE CERO
                    CASE 
                        WHEN COALESCE(sa.saldo_actual, 0) > 0 
                        THEN ROUND(mp.egresos_periodo / COALESCE(sa.saldo_actual, 0), 2)
                        ELSE 0
                    END AS indice_rotacion_stock,
    
                    -- FRECUENCIA DE VENTAS CON MANEJO DE CERO
                    CASE 
                        WHEN mp.dias_venta > 0 
                        THEN ROUND(mp.facturas_venta / mp.dias_venta, 2)
                        ELSE 0
                    END AS frecuencia_ventas,
                    
                    -- PORCENTAJE DE DÍAS CON VENTAS CON MANEJO DE CERO
                    CASE 
                        WHEN pd.total_dias_periodo > 0 
                        THEN ROUND((mp.dias_venta * 100.0) / pd.total_dias_periodo, 2)
                        ELSE 0
                    END AS porcentaje_dias_venta,
                    
                    -- VOLUMEN DE VENTAS
                    mp.egresos_periodo AS volumen_ventas,
    
                    -- DÍAS DE STOCK CON MANEJO DE CERO
                    CASE 
                        WHEN COALESCE(sa.saldo_actual, 0) > 0 AND mp.promedio_venta_diario > 0 
                        THEN ROUND(COALESCE(sa.saldo_actual, 0) / mp.promedio_venta_diario, 1)
                        ELSE 0
                    END AS dias_stock_disponible,
    
                    -- ALERTAS DE INVENTARIO
                    CASE 
                        WHEN COALESCE(sa.saldo_actual, 0) <= mp.stock_minimo THEN 'STOCK CRÍTICO'
                        WHEN COALESCE(sa.saldo_actual, 0) <= mp.stock_ideal THEN 'REORDENAR'
                        ELSE 'STOCK OK'
                    END AS estado_inventario
    
                FROM 
                    movimientos_periodo mp
                LEFT JOIN 
                    saldos_actuales sa ON mp.ide_inarti = sa.ide_inarti
                CROSS JOIN
                    periodo_dias pd
                WHERE 
                    mp.egresos_periodo > 0
                    AND mp.dias_venta > 0
            )
            SELECT 
                *,
                -- SCORE MEJORADO CON MANEJO SEGURO (ahora en SELECT final)
                ROUND(
                    (indice_rotacion_valor * 0.4) + 
                    (frecuencia_ventas * 0.2) +
                    (porcentaje_dias_venta * 0.01) +  -- Reducido peso porque es porcentaje
                    (LEAST(costo_ventas_periodo * 0.0001, 10)),  -- Limitado a máximo 10
                2) AS score_rotacion,
    
                -- CLASIFICACIÓN MEJORADA (ahora en SELECT final)
                CASE 
                    WHEN costo_ventas_periodo > 5000 AND frecuencia_ventas > 2 THEN 'ROTACIÓN MUY ALTA'
                    WHEN costo_ventas_periodo > 2000 AND frecuencia_ventas > 1 THEN 'ROTACIÓN ALTA'
                    WHEN costo_ventas_periodo > 500 THEN 'ROTACIÓN MEDIA'
                    ELSE 'ROTACIÓN BAJA'
                END AS clasificacion_rotacion
    
            FROM datos_calculados
            ORDER BY 
                indice_rotacion_valor DESC NULLS LAST,
                score_rotacion DESC NULLS LAST,
                egresos_periodo DESC
            ${limitConfig}
        `,
      dtoIn,
    );

    query.addStringParam(1, dtoIn.fechaInicio);
    query.addStringParam(2, dtoIn.fechaFin);
    query.addStringParam(3, dtoIn.fechaFin);
    query.addStringParam(4, dtoIn.fechaInicio);
    query.addStringParam(5, dtoIn.fechaFin);
    query.addStringParam(6, dtoIn.fechaInicio);
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
