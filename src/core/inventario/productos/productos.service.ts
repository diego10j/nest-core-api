import { getDateFormat } from 'src/util/helpers/date-util';
import { ResultQuery } from './../../connection/interfaces/resultQuery';
import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../../connection/datasource.service';
import { SelectQuery } from '../../connection/helpers/select-query';
import { TrnProductoDto } from './dto/trn-producto.dto';
import { IdProductoDto } from './dto/id-producto.dto';
import { ServiceDto } from '../../../common/dto/service.dto';
import { IVentasMensualesDto } from './dto/ventas-mensuales.dto';
import { VariacionPreciosComprasDto } from './dto/varia-precio-compras.dto';
import { BaseService } from '../../../common/base-service';
import { getDateFormatFront } from 'src/util/helpers/date-util';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class ProductosService extends BaseService {

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly audit: AuditService,
    ) {
        super();
        // obtiene las variables del sistema para el servicio
        this.dataSource.getVariables([
            'p_inv_estado_normal',  // 1
            'p_cxp_estado_factura_normal', // 0
            'p_cxc_estado_factura_normal'  // 0
        ]).then(result => {
            this.variables = result;
        });

    }

    /**
     * Retorna el listado de Productos
     * @returns 
     */
    async getProductos(_dtoIn?: ServiceDto) {

        const query = new SelectQuery(`
    WITH existencia_cte AS (
        SELECT
            dci.ide_inarti,
            SUM(cantidad_indci * signo_intci) AS existencia
        FROM
            inv_det_comp_inve dci
            LEFT JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
            LEFT JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
            LEFT JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
        WHERE
            ide_inepi = ${this.variables.get('p_inv_estado_normal')} 
        GROUP BY
            dci.ide_inarti
    ),
    precio_cte AS (
        SELECT
            ide_inarti,
            precio_cpdfa,
            fecha_emisi_cpcfa,
            ROW_NUMBER() OVER (PARTITION BY ide_inarti ORDER BY fecha_emisi_cpcfa DESC) AS rn
        FROM
            cxp_detall_factur
            INNER JOIN cxp_cabece_factur ON cxp_detall_factur.ide_cpcfa = cxp_cabece_factur.ide_cpcfa
        WHERE
            ide_cpefa  =  ${this.variables.get('p_cxp_estado_factura_normal')} 
    )
    SELECT
        ARTICULO.ide_inarti,
        ARTICULO.uuid,
        ARTICULO.nombre_inarti,
        nombre_incate,
        ARTICULO.codigo_inarti,
        ARTICULO.foto_inarti,
        COALESCE(existencia_cte.existencia, 0) AS existencia,
        UNIDAD.siglas_inuni,
        precio_cte.precio_cpdfa AS precio_compra,
        precio_cte.fecha_emisi_cpcfa AS fecha_compra,
        ARTICULO.activo_inarti
    FROM
        inv_articulo ARTICULO
        LEFT JOIN inv_unidad UNIDAD ON ARTICULO.ide_inuni = UNIDAD.ide_inuni
        LEFT JOIN inv_marca m ON ARTICULO.ide_inmar = m.ide_inmar
        LEFT JOIN existencia_cte ON ARTICULO.ide_inarti = existencia_cte.ide_inarti
        LEFT JOIN precio_cte ON ARTICULO.ide_inarti = precio_cte.ide_inarti AND precio_cte.rn = 1
        LEFT JOIN inv_categoria c ON ARTICULO.ide_incate  = c.ide_incate
    WHERE
        ARTICULO.ide_intpr = 1 -- solo productos
        AND ARTICULO.nivel_inarti = 'HIJO'
    ORDER BY
        ARTICULO.nombre_inarti;
    `, _dtoIn);

        return await this.dataSource.createQuery(query);
    }

    /**
     * Retorna las transacciones de ingreso/egreso de un producto en un rango de fechas
     * @param dtoIn 
     * @returns 
     */
    async getTrnProducto(dtoIn: TrnProductoDto) {
        const query = new SelectQuery(`
        WITH saldo_inicial AS (
            SELECT 
                dci.ide_inarti,
                SUM(cantidad_indci * signo_intci) AS saldo
            FROM
                inv_det_comp_inve dci
                INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                INNER JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                LEFT JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
            WHERE
                dci.ide_inarti = $1
                AND fecha_trans_incci < $2
                AND ide_inepi = ${this.variables.get('p_inv_estado_normal')} 
                AND dci.ide_sucu =  ${dtoIn.ideSucu}
            GROUP BY
                dci.ide_inarti
        ),
        movimientos AS (
            SELECT
                dci.ide_indci,
                dci.ide_inarti,
                cci.ide_incci,
                cci.fecha_trans_incci,
                COALESCE(
                    (
                        SELECT secuencial_cccfa
                        FROM cxc_cabece_factura
                        WHERE ide_cccfa = dci.ide_cccfa
                    ),
                    (
                        SELECT numero_cpcfa
                        FROM cxp_cabece_factur
                        WHERE ide_cpcfa = dci.ide_cpcfa
                    )
                ) AS NUM_DOCUMENTO,
                gpe.nom_geper,
                tti.nombre_intti,
                dci.precio_indci AS PRECIO,
                CASE
                    WHEN signo_intci = 1 THEN cantidad_indci
                END AS INGRESO,
                CASE
                    WHEN signo_intci = -1 THEN cantidad_indci
                END AS EGRESO,
                cantidad_indci * signo_intci AS movimiento
            FROM
                inv_det_comp_inve dci
                INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                LEFT JOIN gen_persona gpe ON cci.ide_geper = gpe.ide_geper
                LEFT JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                LEFT JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                INNER JOIN inv_articulo arti ON dci.ide_inarti = arti.ide_inarti
            WHERE
                dci.ide_inarti = $3
                AND fecha_trans_incci BETWEEN $4 AND $5
                AND ide_inepi = ${this.variables.get('p_inv_estado_normal')} 
                AND dci.ide_sucu =  ${dtoIn.ideSucu}
        ),
        saldo_movimientos AS (
            SELECT
                ide_indci AS ide_indci,
                mov.ide_inarti,
                ide_incci AS ide_incci,
                mov.fecha_trans_incci,
                mov.NUM_DOCUMENTO,
                mov.nom_geper,
                mov.nombre_intti,
                mov.PRECIO,
                mov.INGRESO,
                mov.EGRESO,
                (COALESCE(saldo_inicial.saldo, 0) + SUM(mov.movimiento) OVER (ORDER BY mov.fecha_trans_incci, mov.ide_indci)) AS SALDO
            FROM
                movimientos mov
                LEFT JOIN saldo_inicial ON mov.ide_inarti = saldo_inicial.ide_inarti
            UNION ALL
            SELECT
                -1 AS ide_indci,
                saldo_inicial.ide_inarti,
                NULL AS ide_incci,
                '${getDateFormat(dtoIn.fechaInicio)}' AS fecha_trans_incci,
                NULL AS NUM_DOCUMENTO,        
                'SALDO INICIAL AL ${getDateFormatFront(dtoIn.fechaInicio)} ' AS  nom_geper,
                'Saldo Inicial' AS nombre_intti,
                NULL AS PRECIO,
                NULL AS INGRESO,
                NULL AS EGRESO,
                saldo_inicial.saldo AS SALDO
            FROM
                saldo_inicial
        )
        SELECT *
        FROM saldo_movimientos
        ORDER BY fecha_trans_incci, ide_indci 
        `);
        query.addIntParam(1, dtoIn.ide_inarti);
        query.addDateParam(2, dtoIn.fechaInicio);
        query.addIntParam(3, dtoIn.ide_inarti);
        query.addDateParam(4, dtoIn.fechaInicio);
        query.addDateParam(5, dtoIn.fechaFin);

        return await this.dataSource.createQuery(query);
    }

    /**
     * Retorna las facturas de ventas de un producto determinado en un rango de fechas
     * @param dtoIn 
     * @returns 
     */
    async getVentasProducto(dtoIn: TrnProductoDto) {
        const query = new SelectQuery(`
        SELECT
            cdf.ide_ccdfa,
            cf.fecha_emisi_cccfa,
            secuencial_ccdfa,
            nom_geper,
            cdf.cantidad_ccdfa,
            siglas_inuni,
            cdf.precio_ccdfa,
            cdf.total_ccdfa,
            p.uuid
        FROM
            cxc_deta_factura cdf
        INNER join cxc_cabece_factura cf on cf.ide_cccfa = cdf.ide_cccfa
        INNER join inv_articulo iart on iart.ide_inarti = cdf.ide_inarti
        LEFT JOIN inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
        INNER join gen_persona p on cf.ide_geper = p.ide_geper
        WHERE
            cdf.ide_inarti =  $1
            and cf.ide_ccefa =  ${this.variables.get('p_cxc_estado_factura_normal')} 
            and cf.fecha_emisi_cccfa BETWEEN $2 AND $3
        ORDER BY 
            cf.fecha_emisi_cccfa desc, secuencial_ccdfa`);
        query.addIntParam(1, dtoIn.ide_inarti);
        query.addDateParam(2, dtoIn.fechaInicio);
        query.addDateParam(3, dtoIn.fechaFin);
        return await this.dataSource.createQuery(query);
    }


    /**
     * Retorna las facturas de compras de un producto determinado en un rango de fechas
     * @param dtoIn 
     * @returns 
     */
    async getComprasProducto(dtoIn: TrnProductoDto) {
        const query = new SelectQuery(`
    SELECT
        cdf.ide_cpdfa,
        cf.fecha_emisi_cpcfa,
        numero_cpcfa,
        nom_geper,
        cdf.cantidad_cpdfa,
        siglas_inuni,
        cdf.precio_cpdfa,
        cdf.valor_cpdfa,
        p.uuid
    FROM
        cxp_detall_factur cdf
        left join cxp_cabece_factur cf on cf.ide_cpcfa = cdf.ide_cpcfa
        left join inv_articulo iart on iart.ide_inarti = cdf.ide_inarti
        LEFT JOIN inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
        left join gen_persona p on cf.ide_geper = p.ide_geper
    WHERE
        cdf.ide_inarti =  $1
        and cf.ide_cpefa =  ${this.variables.get('p_cxp_estado_factura_normal')} 
        and cf.fecha_emisi_cpcfa BETWEEN $2 AND $3
    ORDER BY 
        cf.fecha_emisi_cpcfa desc, numero_cpcfa`
            , dtoIn);
        query.addIntParam(1, dtoIn.ide_inarti);
        query.addDateParam(2, dtoIn.fechaInicio);
        query.addDateParam(3, dtoIn.fechaFin);
        return await this.dataSource.createQuery(query);
    }

    /**
     * Retorna los últimos precios de compra a proveddores de un producto determinado
     * @param dtoIn 
     * @returns 
     */
    async getUltimosPreciosCompras(dtoIn: IdProductoDto) {
        const query = new SelectQuery(`
    SELECT
        DISTINCT b.ide_geper,
        c.nom_geper,
        MAX(b.fecha_emisi_cpcfa) AS fecha_ultima_venta,
        df.cantidad,
        df.precio,
        df.total
    FROM 
        cxp_detall_factur a
        INNER JOIN cxp_cabece_factur b ON a.ide_cpcfa = b.ide_cpcfa
        INNER JOIN gen_persona c ON b.ide_geper = c.ide_geper
        LEFT JOIN (
            SELECT
                ide_geper,
                ide_inarti,
                cantidad_cpdfa AS cantidad,
                precio_cpdfa AS precio,
                valor_cpdfa AS total,
                ROW_NUMBER() OVER (PARTITION BY ide_geper ORDER BY fecha_emisi_cpcfa DESC) AS rn
            FROM 
                cxp_detall_factur 
                INNER JOIN cxp_cabece_factur ON cxp_detall_factur.ide_cpcfa = cxp_cabece_factur.ide_cpcfa
            WHERE 
                ide_cpefa = ${this.variables.get('p_cxp_estado_factura_normal')} 
                AND ide_inarti = $1
        ) df ON df.ide_geper = b.ide_geper AND df.rn = 1
    WHERE
        b.ide_cpefa = ${this.variables.get('p_cxp_estado_factura_normal')}
        AND a.ide_inarti = $2
    GROUP BY 
        a.ide_inarti,
        b.ide_geper,
        c.nom_geper,
        df.cantidad,
        df.precio,
        df.total
    ORDER BY 
        3, c.nom_geper DESC  
        `);
        query.addIntParam(1, dtoIn.ide_inarti);
        query.addIntParam(2, dtoIn.ide_inarti);
        return await this.dataSource.createQuery(query);
    }

    /**
     * Retorna el saldo de un producto
     * @param dtoIn 
     * @returns 
     */
    async getSaldo(dtoIn: IdProductoDto) {
        const query = new SelectQuery(`     
        SELECT 
            iart.ide_inarti,
            COALESCE(ROUND(SUM(cantidad_indci * signo_intci), 3), 0) AS saldo,
            siglas_inuni
        FROM
            inv_det_comp_inve dci
            inner join inv_cab_comp_inve cci on cci.ide_incci = dci.ide_incci
            inner join inv_tip_tran_inve tti on tti.ide_intti = cci.ide_intti
            inner join inv_tip_comp_inve tci on tci.ide_intci = tti.ide_intci
            inner join inv_articulo iart on iart.ide_inarti = dci.ide_inarti
            left join inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
        WHERE
            dci.ide_inarti = $1
            AND ide_inepi =  ${this.variables.get('p_inv_estado_normal')} 
        GROUP BY   
            iart.ide_inarti,siglas_inuni
        `);
        query.addIntParam(1, dtoIn.ide_inarti);
        return await this.dataSource.createQuery(query, false);
    }


    /**
       * Retorna el total de ventas mensuales de un producto en un periodo 
       * @param dtoIn 
       * @returns 
       */
    async getVentasMensuales(dtoIn: IVentasMensualesDto) {
        const query = new SelectQuery(`
    SELECT
        gm.nombre_gemes,
        ${dtoIn.periodo} as periodo,
        COALESCE(count(cdf.ide_ccdfa), 0) AS num_facturas,
        COALESCE(sum(cdf.cantidad_ccdfa), 0) AS cantidad,
        COALESCE(sum(cdf.total_ccdfa), 0) AS total
    FROM
        gen_mes gm
    LEFT JOIN (
        SELECT
            EXTRACT(MONTH FROM fecha_emisi_cccfa) AS mes,
            cdf.ide_ccdfa,
            cdf.cantidad_ccdfa,
            cdf.total_ccdfa
        FROM
            cxc_cabece_factura a
        INNER JOIN
            cxc_deta_factura cdf ON a.ide_cccfa = cdf.ide_cccfa
        WHERE
            fecha_emisi_cccfa  >=  $1 AND a.fecha_emisi_cccfa <=  $2 
            AND cdf.ide_inarti = $3
            AND ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
    ) cdf ON gm.ide_gemes = cdf.mes
    GROUP BY
        gm.nombre_gemes, gm.ide_gemes
    ORDER BY
        gm.ide_gemes       
        `);
        query.addStringParam(1, `${dtoIn.periodo}-01-01`);
        query.addStringParam(2, `${dtoIn.periodo}-12-31`);
        query.addIntParam(3, dtoIn.ide_inarti);

        return await this.dataSource.createQuery(query);
    }


    /**
       * Retorna el total de compras mensuales de un producto en un periodo 
       * @param dtoIn 
       * @returns 
       */
    async getComprasMensuales(dtoIn: IVentasMensualesDto) {
        const query = new SelectQuery(`
    SELECT
        gm.nombre_gemes,
        ${dtoIn.periodo} as periodo,
        COALESCE(count(cdf.ide_cpcfa), 0) AS num_facturas,
        COALESCE(sum(cdf.cantidad_cpdfa), 0) AS cantidad,
        COALESCE(sum(cdf.valor_cpdfa), 0) AS total
    FROM
        gen_mes gm
    LEFT JOIN (
        SELECT
            EXTRACT(MONTH FROM fecha_emisi_cpcfa) AS mes,
            cdf.ide_cpcfa,
            cdf.cantidad_cpdfa,
            cdf.valor_cpdfa
        FROM
            cxp_cabece_factur a
        INNER JOIN
            cxp_detall_factur cdf ON a.ide_cpcfa = cdf.ide_cpcfa
        WHERE
            fecha_emisi_cpcfa  >=  $1 AND a.fecha_emisi_cpcfa <=  $2 
            AND cdf.ide_inarti = $3
            AND ide_cpefa = ${this.variables.get('p_cxp_estado_factura_normal')} 
    ) cdf ON gm.ide_gemes = cdf.mes
    GROUP BY
        gm.nombre_gemes, gm.ide_gemes
    ORDER BY
        gm.ide_gemes       
        `);
        query.addStringParam(1, `${dtoIn.periodo}-01-01`);
        query.addStringParam(2, `${dtoIn.periodo}-12-31`);
        query.addIntParam(3, dtoIn.ide_inarti);
        return await this.dataSource.createQuery(query);
    }

    /**
        * Retorna la sumatoria de total ventas / compras en un periodo
        * @param dtoIn 
        * @returns 
        */
    async getSumatoriaTrnPeriodo(dtoIn: IVentasMensualesDto) {
        const query = new SelectQuery(`
    SELECT
        COALESCE(v.siglas_inuni, c.siglas_inuni) AS unidad,
        v.fact_ventas,
        v.cantidad_ventas,
        v.total_ventas,
        c.fact_compras,
        c.cantidad_compras,
        c.total_compras,
        v.total_ventas -  c.total_compras as margen
    FROM
        (
            SELECT
                count(1) AS fact_ventas,
                sum(cdf.cantidad_ccdfa) AS cantidad_ventas,
                sum(cdf.total_ccdfa) AS total_ventas,
                siglas_inuni
            FROM
                cxc_deta_factura cdf
                LEFT JOIN cxc_cabece_factura cf ON cf.ide_cccfa = cdf.ide_cccfa
                LEFT JOIN inv_articulo iart ON iart.ide_inarti = cdf.ide_inarti
                LEFT JOIN inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
            WHERE
                cdf.ide_inarti = $1
                AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                AND cf.fecha_emisi_cccfa BETWEEN $2 AND $3
            GROUP BY
                siglas_inuni
        ) v FULL
        OUTER JOIN (
            SELECT
                count(1) AS fact_compras,
                sum(cdf.cantidad_cpdfa) AS cantidad_compras,
                sum(cdf.valor_cpdfa) AS total_compras,
                siglas_inuni
            FROM
                cxp_detall_factur cdf
                LEFT JOIN cxp_cabece_factur cf ON cf.ide_cpcfa = cdf.ide_cpcfa
                LEFT JOIN inv_articulo iart ON iart.ide_inarti = cdf.ide_inarti
                LEFT JOIN inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
            WHERE
                cdf.ide_inarti = $4
                AND cf.ide_cpefa = ${this.variables.get('p_cxp_estado_factura_normal')} 
                AND cf.fecha_emisi_cpcfa BETWEEN $5 AND $6
            GROUP BY
                siglas_inuni
        ) c ON v.siglas_inuni = c.siglas_inuni
        `);
        query.addIntParam(1, dtoIn.ide_inarti);
        query.addStringParam(2, `${dtoIn.periodo}-01-01`);
        query.addStringParam(3, `${dtoIn.periodo}-12-31`);
        query.addIntParam(4, dtoIn.ide_inarti);
        query.addStringParam(5, `${dtoIn.periodo}-01-01`);
        query.addStringParam(6, `${dtoIn.periodo}-12-31`);

        const data = await this.dataSource.createSelectQuery(query);
        if (data.length === 0) {
            data.push(
                {
                    "unidad": "",
                    "fact_ventas": "0",
                    "cantidad_ventas": "0",
                    "total_ventas": "0",
                    "fact_compras": "0",
                    "cantidad_compras": "0",
                    "total_compras": "0",
                    "margen": "0"
                }
            );
        }

        return {
            rows: data,
            rowCount: data.length
        } as ResultQuery;
    }


    async getProveedores(dtoIn: IdProductoDto) {
        const query = new SelectQuery(`
        SELECT
            p.ide_geper,
            p.nom_geper as nom_geper,
            p.identificac_geper,
            max(cf.fecha_emisi_cpcfa) as fecha_ultima,
            COUNT(1) AS num_facturas,
            SUM(cdf.cantidad_cpdfa) AS total_cantidad,
            SUM(cdf.cantidad_cpdfa * cdf.precio_cpdfa) AS total_valor,
            siglas_inuni,
            p.uuid
        FROM
            cxp_detall_factur cdf
            INNER JOIN cxp_cabece_factur cf ON cf.ide_cpcfa = cdf.ide_cpcfa
            INNER JOIN inv_articulo iart ON iart.ide_inarti = cdf.ide_inarti
            LEFT JOIN inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
            INNER JOIN gen_persona p ON cf.ide_geper = p.ide_geper
        WHERE
            cdf.ide_inarti = $1
            AND cf.ide_cpefa = ${this.variables.get('p_cxp_estado_factura_normal')} 
        GROUP BY
            p.ide_geper,
            p.nom_geper,
            p.identificac_geper,
            siglas_inuni,
            p.uuid
        ORDER BY
            p.nom_geper
        `);
        query.addIntParam(1, dtoIn.ide_inarti);

        return await this.dataSource.createQuery(query);
    }

    /**
     * Retorna top 10 mejores proveedores en un periodo
     * @param dtoIn 
     * @returns 
     */
    async getTopProveedores(dtoIn: IVentasMensualesDto) {
        const query = new SelectQuery(`
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
        GROUP BY
            p.ide_geper,
            p.nom_geper,
            siglas_inuni
        ORDER BY
            total_valor DESC
        LIMIT 10
        `);
        query.addIntParam(1, dtoIn.ide_inarti);
        query.addStringParam(2, `${dtoIn.periodo}-01-01`);
        query.addStringParam(3, `${dtoIn.periodo}-12-31`);

        return await this.dataSource.createQuery(query);
    }

    /**
     * Retorna top 10 mejores clientes en un periodo
     * @param dtoIn 
     * @returns 
     */
    async getTopClientes(dtoIn: IVentasMensualesDto) {
        const query = new SelectQuery(`
        SELECT
            p.ide_geper,
            upper(p.nom_geper) as nom_geper,
            COUNT(1) AS num_facturas,
            SUM(cdf.cantidad_ccdfa) AS total_cantidad,
            SUM(cdf.cantidad_ccdfa * cdf.precio_ccdfa) AS total_valor,
            siglas_inuni
        FROM
            cxc_deta_factura cdf
            INNER JOIN cxc_cabece_factura cf ON cf.ide_cccfa = cdf.ide_cccfa
            INNER JOIN inv_articulo iart ON iart.ide_inarti = cdf.ide_inarti
            LEFT JOIN inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
            INNER JOIN gen_persona p ON cf.ide_geper = p.ide_geper
        WHERE
            cdf.ide_inarti = $1
            AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
            AND cf.fecha_emisi_cccfa BETWEEN $2 AND $3
        GROUP BY
            p.ide_geper,
            p.nom_geper,
            siglas_inuni
        ORDER BY
            total_valor DESC
        LIMIT 10
        `);
        query.addIntParam(1, dtoIn.ide_inarti);
        query.addStringParam(2, `${dtoIn.periodo}-01-01`);
        query.addStringParam(3, `${dtoIn.periodo}-12-31`);

        return await this.dataSource.createQuery(query);
    }


    /**
     * Retorna los clientes que han comprado un producto
     * @param dtoIn 
     * @returns 
     */
    async getClientes(dtoIn: IdProductoDto) {
        const query = new SelectQuery(`            
            SELECT
                p.ide_geper,
                p.nom_geper,
                p.identificac_geper,
                max(cf.fecha_emisi_cccfa) as fecha_ultima,
                count(1) as num_facturas,
                sum(cdf.cantidad_ccdfa) as total_cantidad,
                uni.siglas_inuni,
                SUM(cdf.cantidad_ccdfa * cdf.precio_ccdfa) AS total_valor,
                p.uuid
            FROM
                cxc_deta_factura cdf
                INNER JOIN cxc_cabece_factura cf ON cf.ide_cccfa = cdf.ide_cccfa
                INNER JOIN inv_articulo iart ON iart.ide_inarti = cdf.ide_inarti
                LEFT JOIN inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
                INNER JOIN gen_persona p ON cf.ide_geper = p.ide_geper
            WHERE
                cdf.ide_inarti = $1
                AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
            GROUP BY
                p.ide_geper,
                p.nom_geper,
                p.identificac_geper,
                uni.siglas_inuni
            order by
                p.nom_geper
            `);
        query.addIntParam(1, dtoIn.ide_inarti);
        return await this.dataSource.createQuery(query);
    }

    async getVariacionPreciosCompras(dtoIn: VariacionPreciosComprasDto) {
        const query = new SelectQuery(`
        WITH compras AS (
            SELECT
                cf.fecha_emisi_cpcfa AS fecha,
                cdf.cantidad_cpdfa AS cantidad,
                cdf.precio_cpdfa AS precio,
                p.ide_geper,
                p.nom_geper
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
        )
        SELECT
            fecha,
            cantidad,
            ide_geper,
            nom_geper,
            precio,
            LAG(precio) OVER (ORDER BY fecha) AS precio_anterior,
            ROUND(
                CASE 
                    WHEN LAG(precio) OVER (ORDER BY fecha) IS NULL THEN NULL
                    ELSE ((precio - LAG(precio) OVER (ORDER BY fecha)) / LAG(precio) OVER (ORDER BY fecha)) * 100 
                END, 
                2
            ) AS porcentaje_variacion,
            CASE
                WHEN LAG(precio) OVER (ORDER BY fecha) IS NULL THEN NULL
                WHEN precio > LAG(precio) OVER (ORDER BY fecha) THEN '+'
                WHEN precio < LAG(precio) OVER (ORDER BY fecha) THEN '-'
                ELSE '='
            END AS variacion
        FROM
            compras
        ORDER BY
            fecha;     
        `);
        query.addIntParam(1, dtoIn.ide_inarti);
        query.addDateParam(2, dtoIn.fechaInicio);
        query.addDateParam(3, dtoIn.fechaFin);
        return await this.dataSource.createQuery(query);
    }


    async getVariacionInventario(dtoIn: IVentasMensualesDto) {
        const query = new SelectQuery(`       
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

        `);
        query.addIntParam(1, dtoIn.ide_inarti);
        return await this.dataSource.createQuery(query);
    }

    /**
     * Retrona la actividades/log registradas sobre un producto
     * @param dtoIn 
     * @returns 
     */
    async getActividades(dtoIn: IdProductoDto) {
        const query = this.audit.getQueryActividadesPorTabla('inv_articulo', dtoIn.ide_inarti);
        return await this.dataSource.createQuery(query, false);
    }


    // =====================================================================

    /**
     * Retorna saldo inicial de un producto a una determinada fecha de corte
     * @param ide_inarti 
     * @param fechaCorte 
     * @returns 
     */
    async _getSaldoInicial(ide_inarti: number, fechaCorte: Date): Promise<number> {
        let saldoInicial = 0;
        const querySaldoInicial = new SelectQuery(`     
        SELECT sum(cantidad_indci *signo_intci) as saldo
        FROM
            inv_det_comp_inve dci
            left join inv_cab_comp_inve cci on cci.ide_incci = dci.ide_incci
            left join inv_tip_tran_inve tti on tti.ide_intti = cci.ide_intti
            left join inv_tip_comp_inve tci on tci.ide_intci = tti.ide_intci
        WHERE
            dci.ide_inarti = $1
            AND fecha_trans_incci <  $2
            AND ide_inepi =  ${this.variables.get('p_inv_estado_normal')} 
        GROUP BY   
            ide_inarti `);
        querySaldoInicial.addIntParam(1, ide_inarti);
        querySaldoInicial.addDateParam(2, fechaCorte);
        const data = await this.dataSource.createSingleQuery(querySaldoInicial);
        if (data) {
            saldoInicial = Number(data.saldo);
        }
        return saldoInicial;
    }




}
