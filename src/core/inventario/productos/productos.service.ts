import { ResultQuery } from './../../connection/interfaces/resultQuery';
import { Injectable, BadRequestException } from '@nestjs/common';
import { DataSourceService } from '../../connection/datasource.service';
import { SelectQuery } from '../../connection/helpers/select-query';
import { TrnProductoDto } from './dto/trn-producto.dto';
import { IdProductoDto } from './dto/id-producto.dto';
import { getNumberFormat } from '../../util/helpers/number-util';
import { getDateFormatFront, toDate, getDateFormat } from '../../util/helpers/date-util';
import { toResultQuery } from '../../util/helpers/sql-util';
import { ServiceDto } from '../../../common/dto/service.dto';
import { IVentasMensualesDto } from './dto/ventas-mensuales.dto';
import { VariacionPreciosComprasDto } from './dto/varia-precio-compras.dto';

@Injectable()
export class ProductosService {

    private variables = new Map();

    constructor(private readonly dataSource: DataSourceService
    ) {
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

        const query = new SelectQuery(`SELECT
        ide_inarti,
        uuid,
        nombre_inarti,
        codigo_inarti,
        foto_inarti,
        (
            select
                sum (cantidad_indci * signo_intci)
            from
                inv_det_comp_inve dci
                left join inv_cab_comp_inve cci on cci.ide_incci = dci.ide_incci
                left join inv_tip_tran_inve tti on tti.ide_intti = cci.ide_intti
                left join inv_tip_comp_inve tci on tci.ide_intci = tti.ide_intci
            where
                dci.ide_inarti = ARTICULO.ide_inarti
                and ide_inepi =  ${this.variables.get('p_inv_estado_normal')} 
            GROUP BY
                dci.ide_inarti
        ) AS existencia,
        nombre_inuni,
        (
            select
                precio_cpdfa
            from
                cxp_detall_factur
                inner join cxp_cabece_factur on cxp_detall_factur.ide_cpcfa = cxp_cabece_factur.ide_cpcfa
            where
                ide_cpefa = 0
                and ide_inarti = ARTICULO.ide_inarti
            order by
                fecha_emisi_cpcfa desc
            limit
                1
        ) AS precio_compra,
        (
            select
                fecha_emisi_cpcfa
            from
                cxp_detall_factur
                inner join cxp_cabece_factur on cxp_detall_factur.ide_cpcfa = cxp_cabece_factur.ide_cpcfa
            where
                ide_cpefa = 0
                and ide_inarti = ARTICULO.ide_inarti
            order by
                fecha_emisi_cpcfa desc
            limit
                1
        ) AS fecha_compra,
        activo_inarti
    FROM
        inv_articulo ARTICULO
        LEFT JOIN inv_unidad UNIDAD ON ARTICULO.ide_inuni = UNIDAD.ide_inuni
        LEFT JOIN inv_marca m on ARTICULO.ide_inmar = m.ide_inmar
    WHERE
        ide_intpr = 1 ---solo productos
        and nivel_inarti = 'HIJO'
    ORDER BY
        ARTICULO.nombre_inarti`);

        return await this.dataSource.createQueryPG(query);
    }

    /**
     * Retorna las transacciones de ingreso/egreso de un producto en un rango de fechas
     * @param dtoIn 
     * @returns 
     */
    async getTrnProducto(dtoIn: TrnProductoDto) {

        const query = new SelectQuery(`
        SELECT
            dci.ide_indci,
            cci.ide_incci,
            cci.fecha_trans_incci,                   
            COALESCE(
                (
                    select
                        secuencial_cccfa
                    from
                        cxc_cabece_factura
                    where
                        ide_cccfa = dci.ide_cccfa
                ),
                (
                    select
                        numero_cpcfa
                    from
                        cxp_cabece_factur
                    where
                        ide_cpcfa = dci.ide_cpcfa
                )
            ) as NUM_DOCUMENTO,
            nom_geper,
            nombre_intti, 
            precio_indci as PRECIO,
            case
                when signo_intci = 1 THEN cantidad_indci
            end as INGRESO,
            case
                when signo_intci = -1 THEN cantidad_indci
            end as EGRESO,
            0.00 as SALDO
        FROM
            inv_det_comp_inve dci
            left join inv_cab_comp_inve cci on cci.ide_incci = dci.ide_incci
            left join gen_persona gpe on cci.ide_geper = gpe.ide_geper
            left join inv_tip_tran_inve tti on tti.ide_intti = cci.ide_intti
            left join inv_tip_comp_inve tci on tci.ide_intci = tti.ide_intci
            left join inv_articulo arti on dci.ide_inarti = arti.ide_inarti
        WHERE
            dci.ide_inarti = $1
            AND fecha_trans_incci BETWEEN $2 AND $3
            AND ide_inepi =  ${this.variables.get('p_inv_estado_normal')} 
        ORDER BY 
            cci.fecha_trans_incci desc,dci.ide_indci asc,signo_intci asc`);
        query.addIntParam(1, dtoIn.ide_inarti);
        query.addDateParam(2, dtoIn.fechaInicio);
        query.addDateParam(3, dtoIn.fechaFin);
        const res: ResultQuery = await this.dataSource.createQueryPG(query);
        // Calcula saldos
        const saldoInicial: number = await this._getSaldoInicial(dtoIn.ide_inarti, dtoIn.fechaInicio);
        let saldoCalcula: number = saldoInicial;
        const tmpRow = res.rows.reverse();
        tmpRow.forEach(row => {
            const { ingreso, egreso } = row;
            saldoCalcula = saldoCalcula + Number(ingreso) - Number(egreso);
            row.saldo = getNumberFormat(saldoCalcula, 3);
        });
        if (saldoInicial !== 0) {
            tmpRow.unshift({
                "ide_indci": 0,
                "ide_incci": null,
                "fecha_trans_incci": getDateFormatFront(dtoIn.fechaInicio),
                "nombre_intti": "Saldo Inicial",
                "nom_geper": `SALDO INICIAL AL ${getDateFormatFront(dtoIn.fechaInicio)}`,
                "num_documento": null,
                "ingreso": null,
                "egreso": null,
                "precio": null,
                "saldo": getNumberFormat(saldoInicial, 3)
            });
            res.rowCount = res.rowCount + 1;
        }
        res.rows = tmpRow.reverse();

        return res;
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
            cdf.total_ccdfa
        FROM
            cxc_deta_factura cdf
            left join cxc_cabece_factura cf on cf.ide_cccfa = cdf.ide_cccfa
            left join inv_articulo iart on iart.ide_inarti = cdf.ide_inarti
            left join gen_persona p on cf.ide_geper = p.ide_geper
        WHERE
            cdf.ide_inarti =  $1
            and cf.ide_ccefa =  ${this.variables.get('p_cxc_estado_factura_normal')} 
            and cf.fecha_emisi_cccfa BETWEEN $2 AND $3
        ORDER BY 
            cf.fecha_emisi_cccfa desc, secuencial_ccdfa`);
        query.addIntParam(1, dtoIn.ide_inarti);
        query.addDateParam(2, dtoIn.fechaInicio);
        query.addDateParam(3, dtoIn.fechaFin);
        return await this.dataSource.createQueryPG(query);
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
        cdf.precio_cpdfa,
        cdf.valor_cpdfa
    FROM
        cxp_detall_factur cdf
        left join cxp_cabece_factur cf on cf.ide_cpcfa = cdf.ide_cpcfa
        left join inv_articulo iart on iart.ide_inarti = cdf.ide_inarti
        left join gen_persona p on cf.ide_geper = p.ide_geper
    WHERE
        cdf.ide_inarti =  $1
        and cf.ide_cpefa =  ${this.variables.get('p_cxp_estado_factura_normal')} 
        and cf.fecha_emisi_cpcfa BETWEEN $2 AND $3
    ORDER BY 
        cf.fecha_emisi_cpcfa desc, numero_cpcfa`);
        query.addIntParam(1, dtoIn.ide_inarti);
        query.addDateParam(2, dtoIn.fechaInicio);
        query.addDateParam(3, dtoIn.fechaFin);
        return await this.dataSource.createQueryPG(query);
    }

    /**
     * Retorna los últimos precios de compra a proveddores de un producto determinado
     * @param dtoIn 
     * @returns 
     */
    async getUltimosPreciosCompras(dtoIn: IdProductoDto) {
        const query = new SelectQuery(`
        SELECT
        distinct b.ide_geper,nom_geper,max(b.fecha_emisi_cpcfa) as fecha_ultima_venta,
            (select cantidad_cpdfa from cxp_detall_factur  
            inner join cxp_cabece_factur  on cxp_detall_factur.ide_cpcfa=cxp_cabece_factur.ide_cpcfa 
            where ide_cpefa= ${this.variables.get('p_cxp_estado_factura_normal')}  and ide_geper=b.ide_geper and ide_inarti=$1 
            order by fecha_emisi_cpcfa desc limit 1) as cantidad,
            (select precio_cpdfa from cxp_detall_factur  
            inner join cxp_cabece_factur  on cxp_detall_factur.ide_cpcfa=cxp_cabece_factur.ide_cpcfa 
            where ide_cpefa= ${this.variables.get('p_cxp_estado_factura_normal')}  and ide_geper=b.ide_geper and ide_inarti=$2 
            order by fecha_emisi_cpcfa desc limit 1) as precio,
            (select valor_cpdfa  from cxp_detall_factur  
            inner join cxp_cabece_factur  on cxp_detall_factur.ide_cpcfa=cxp_cabece_factur.ide_cpcfa 
            where ide_cpefa= ${this.variables.get('p_cxp_estado_factura_normal')}  and ide_geper=b.ide_geper and ide_inarti=$3 
            order by fecha_emisi_cpcfa desc limit 1) as total
        FROM 
            cxp_detall_factur a 
            inner join cxp_cabece_factur b on a.ide_cpcfa=b.ide_cpcfa
            inner join gen_persona c on b.ide_geper=c.ide_geper
        WHERE
            ide_cpefa=${this.variables.get('p_cxp_estado_factura_normal')}
            and a.ide_inarti=$4
        GROUP BY 
            a.ide_inarti,b.ide_geper,nom_geper
        ORDER BY 
            3,nom_geper desc       
        `);
        query.addIntParam(1, dtoIn.ide_inarti);
        query.addIntParam(2, dtoIn.ide_inarti);
        query.addIntParam(3, dtoIn.ide_inarti);
        query.addIntParam(4, dtoIn.ide_inarti);
        return await this.dataSource.createQueryPG(query);
    }

    /**
     * Retorna el saldo de un producto
     * @param dtoIn 
     * @returns 
     */
    async getSaldo(dtoIn: IdProductoDto) {
        let msg: string;
        const query = new SelectQuery(`     
        SELECT ide_inarti,round( sum(cantidad_indci *signo_intci), 3) as saldo
        FROM
            inv_det_comp_inve dci
            left join inv_cab_comp_inve cci on cci.ide_incci = dci.ide_incci
            left join inv_tip_tran_inve tti on tti.ide_intti = cci.ide_intti
            left join inv_tip_comp_inve tci on tci.ide_intci = tti.ide_intci
        WHERE
            dci.ide_inarti = $1
            AND ide_inepi =  ${this.variables.get('p_inv_estado_normal')} 
        GROUP BY   
            ide_inarti`);
        query.addIntParam(1, dtoIn.ide_inarti);
        const data = await this.dataSource.createQuery(query);
        if (data.length === 0)
            msg = `[ERROR] No existe el producto ${dtoIn.ide_inarti}`;
        return toResultQuery(data, msg);
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

        return await this.dataSource.createQueryPG(query);
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
        return await this.dataSource.createQueryPG(query);
    }

    /**
        * Retorna la sumatoria de total ventas / compras en un periodo
        * @param dtoIn 
        * @returns 
        */
    async getSumatoriaTrnPeriodo(dtoIn: IVentasMensualesDto) {
        const query = new SelectQuery(`
    SELECT
        COALESCE(v.nombre_inuni, c.nombre_inuni) AS unidad,
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
                nombre_inuni
            FROM
                cxc_deta_factura cdf
                LEFT JOIN cxc_cabece_factura cf ON cf.ide_cccfa = cdf.ide_cccfa
                LEFT JOIN inv_articulo iart ON iart.ide_inarti = cdf.ide_inarti
                LEFT JOIN inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
            WHERE
                cdf.ide_inarti = $1
                AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                AND cf.fecha_emisi_cccfa BETWEEN $2  AND $3
            GROUP BY
                nombre_inuni
        ) v FULL
        OUTER JOIN (
            SELECT
                count(1) AS fact_compras,
                sum(cdf.cantidad_cpdfa) AS cantidad_compras,
                sum(cdf.valor_cpdfa) AS total_compras,
                nombre_inuni
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
                nombre_inuni
        ) c ON v.nombre_inuni = c.nombre_inuni
        `);
        query.addIntParam(1, dtoIn.ide_inarti);
        query.addStringParam(2, `${dtoIn.periodo}-01-01`);
        query.addStringParam(3, `${dtoIn.periodo}-12-31`);
        query.addIntParam(4, dtoIn.ide_inarti);
        query.addStringParam(5, `${dtoIn.periodo}-01-01`);
        query.addStringParam(6, `${dtoIn.periodo}-12-31`);

        const data = await this.dataSource.createQuery(query);

        return {
            rows: data,
            rowCount: data.length
        } as ResultQuery;
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
                LEFT JOIN cxp_cabece_factur cf ON cf.ide_cpcfa = cdf.ide_cpcfa
                LEFT JOIN inv_articulo iart ON iart.ide_inarti = cdf.ide_inarti
                LEFT JOIN inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
                LEFT JOIN gen_persona p ON cf.ide_geper = p.ide_geper
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
        return await this.dataSource.createQueryPG(query);
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
