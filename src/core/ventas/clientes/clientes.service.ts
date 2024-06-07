import { getDateFormat, getDateFormatFront } from 'src/core/util/helpers/date-util';
import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../../connection/datasource.service';
import { SelectQuery } from '../../connection/helpers/select-query';
import { BaseService } from '../../../common/base-service';
import { ServiceDto } from '../../../common/dto/service.dto';
import { TrnClienteDto } from './dto/trn-cliente.dto';
import { IdClienteDto } from './dto/id-cliente.dto';
import { toResultQuery } from '../../util/helpers/sql-util';
import { IVentasMensualesClienteDto } from './dto/ventas-mensuales.dto';


@Injectable()
export class ClientesService extends BaseService {


    constructor(private readonly dataSource: DataSourceService
    ) {
        super();
        // obtiene las variables del sistema para el servicio
        this.dataSource.getVariables([
            'p_cxc_estado_factura_normal' // 0
        ]).then(result => {
            this.variables = result;
        });
    }

    /**
     * Retorna el listado de clientes 
     * @param dtoIn 
     * @returns 
     */
    async getClientes(dtoIn: ServiceDto) {
        const query = new SelectQuery(`
        WITH saldo_cte AS (
            SELECT
                ide_geper,
                SUM(valor_ccdtr * signo_ccttr) AS saldo,
                MAX(ct.fecha_trans_ccctr) AS ultima_transaccion
            FROM
                cxc_detall_transa dt
                LEFT JOIN cxc_cabece_transa ct ON dt.ide_ccctr = ct.ide_ccctr
                LEFT JOIN cxc_tipo_transacc tt ON tt.ide_ccttr = dt.ide_ccttr
            GROUP BY
                ide_geper
        )
        SELECT
            p.ide_geper,
            p.uuid,
            p.nom_geper,
            p.identificac_geper,
            p.codigo_geper,
            p.correo_geper,
            p.fecha_ingre_geper,
            b.nombre_cndfp,
            c.nombre_vgven,
            ultima_transaccion,
            COALESCE(s.saldo, 0) AS saldo,
            activo_geper
        FROM
            gen_persona p
            LEFT JOIN con_deta_forma_pago b ON b.ide_cndfp = p.ide_cndfp
            LEFT JOIN ven_vendedor c ON c.ide_vgven = p.ide_vgven
            LEFT JOIN saldo_cte s ON s.ide_geper = p.ide_geper
        WHERE
            p.es_cliente_geper = true
            AND p.identificac_geper IS NOT NULL
            AND p.nivel_geper = 'HIJO'
        ORDER BY
            p.nom_geper
        `, dtoIn);

        return await this.dataSource.createQueryPG(query);
    }


    /**
    * Retorna las transacciones de ingreso/egreso de un cliente en un rango de fechas
    * @param dtoIn 
    * @returns 
    */
    async getTrnCliente(dtoIn: TrnClienteDto) {

        const query = new SelectQuery(`
        WITH saldo_inicial AS (
            SELECT 
                ide_geper,
                COALESCE(SUM(valor_ccdtr * signo_ccttr), 0) AS saldo_inicial
            FROM 
                cxc_detall_transa dt 
                LEFT JOIN cxc_cabece_transa ct ON dt.ide_ccctr = ct.ide_ccctr 
                LEFT JOIN cxc_tipo_transacc tt ON tt.ide_ccttr = dt.ide_ccttr 
            WHERE 
                ide_geper = $1
                AND fecha_trans_ccdtr < $2
                AND dt.ide_sucu =  ${dtoIn.ideSucu}
            GROUP BY 
                ide_geper
        ),
        movimientos AS (
            SELECT 
                a.ide_ccdtr,
                fecha_trans_ccdtr,
                ide_cnccc,
                nombre_ccttr AS transaccion,
                docum_relac_ccdtr, 
                CASE WHEN signo_ccttr = 1 THEN valor_ccdtr END AS ingresos,
                CASE WHEN signo_ccttr = -1 THEN valor_ccdtr END AS egresos,
                '',
                observacion_ccdtr AS observacion,
                nom_usua AS usuario,
                fecha_venci_ccdtr,
                ide_teclb,
                numero_pago_ccdtr
            FROM 
                cxc_detall_transa a
                INNER JOIN cxc_tipo_transacc b ON a.ide_ccttr = b.ide_ccttr
                INNER JOIN sis_usuario c ON a.ide_usua = c.ide_usua
                INNER JOIN cxc_cabece_transa d ON a.ide_ccctr = d.ide_ccctr
            WHERE 
                ide_geper = $3
                AND fecha_trans_ccdtr BETWEEN $4 AND $5
                AND a.ide_sucu =  ${dtoIn.ideSucu}
            ORDER BY 
                fecha_trans_ccdtr, a.ide_ccdtr
        )
        SELECT 
            -1 AS ide_ccdtr,
            '${getDateFormat(dtoIn.fechaInicio)}' AS fecha_trans_ccdtr,
            NULL AS ide_cnccc,
            'Saldo Inicial' AS transaccion,
            NULL AS docum_relac_ccdtr,
            NULL AS ingresos,
            NULL AS egresos,
            'SALDO INICIAL AL ${getDateFormatFront(dtoIn.fechaInicio)} ' AS  observacion,
            NULL AS usuario,
            NULL AS fecha_venci_ccdtr,
            NULL AS ide_teclb,
            NULL AS numero_pago_ccdtr,
            saldo_inicial.saldo_inicial AS saldo
        FROM 
            saldo_inicial
        
        UNION ALL
        
        SELECT 
            mov.ide_ccdtr,
            mov.fecha_trans_ccdtr,
            mov.ide_cnccc,
            mov.transaccion,
            mov.docum_relac_ccdtr,
            mov.ingresos,
            mov.egresos,
            mov.observacion,
            mov.usuario,
            mov.fecha_venci_ccdtr,
            mov.ide_teclb,
            mov.numero_pago_ccdtr,
            saldo_inicial.saldo_inicial + COALESCE(SUM(mov.ingresos) OVER (ORDER BY mov.fecha_trans_ccdtr, mov.ide_ccdtr), 0) - COALESCE(SUM(mov.egresos) OVER (ORDER BY mov.fecha_trans_ccdtr, mov.ide_ccdtr), 0) AS saldo
        FROM 
            movimientos mov
            CROSS JOIN saldo_inicial
        ORDER BY 
            fecha_trans_ccdtr, ide_ccdtr;
        `, dtoIn);
        query.addIntParam(1, dtoIn.ide_geper);
        query.addDateParam(2, dtoIn.fechaInicio);
        query.addIntParam(3, dtoIn.ide_geper);
        query.addDateParam(4, dtoIn.fechaInicio);
        query.addDateParam(5, dtoIn.fechaFin);
        return await this.dataSource.createQueryPG(query);
    }


    /**
     * Retorna las facturas de ventas del cliente en un rango de fechas
     * @param dtoIn 
     * @returns 
     */
    async getDetalleVentasCliente(dtoIn: TrnClienteDto) {
        const query = new SelectQuery(`
        SELECT
            cdf.ide_ccdfa,
            cf.fecha_emisi_cccfa,
            CONCAT(
                SUBSTRING(serie_ccdaf FROM 1 FOR 3), '-', 
                SUBSTRING(serie_ccdaf FROM 4 FOR 3), '-', 
                secuencial_cccfa
            ) AS secuencial_cccfa, 
            iart.nombre_inarti,
            observacion_ccdfa,
            cdf.cantidad_ccdfa,
            uni.siglas_inuni,
            cdf.precio_ccdfa,
            cdf.total_ccdfa,
            cf.ide_cccfa
        FROM
            cxc_deta_factura cdf
            INNER join cxc_cabece_factura cf on cf.ide_cccfa = cdf.ide_cccfa
            INNER join inv_articulo iart on iart.ide_inarti = cdf.ide_inarti
            LEFT join cxc_datos_fac df on cf.ide_ccdaf=df.ide_ccdaf 
            LEFT JOIN inv_unidad uni ON cdf.ide_inuni = uni.ide_inuni
        WHERE
            cf.ide_geper =  $1
            AND cf.ide_ccefa =  ${this.variables.get('p_cxc_estado_factura_normal')} 
            AND cf.fecha_emisi_cccfa BETWEEN $2 AND $3
            AND cf.ide_sucu =  ${dtoIn.ideSucu}
        ORDER BY 
            cf.fecha_emisi_cccfa desc, serie_ccdaf,secuencial_ccdfa
        `, dtoIn);
        query.addIntParam(1, dtoIn.ide_geper);
        query.addDateParam(2, dtoIn.fechaInicio);
        query.addDateParam(3, dtoIn.fechaFin);
        return await this.dataSource.createQueryPG(query);
    }


    /**
     * Retorna el saldo del cliente
     * @param dtoIn 
     * @returns 
     */
    async getSaldo(dtoIn: IdClienteDto) {
        let msg: string;
        const query = new SelectQuery(`     
            SELECT 
                ct.ide_geper,
                COALESCE(SUM(valor_ccdtr* signo_ccttr), 0) AS saldo
            FROM
                cxc_detall_transa dt
            INNER JOIN cxc_cabece_transa ct on dt.ide_ccctr=ct.ide_ccctr
            INNER JOIN cxc_tipo_transacc tt on tt.ide_ccttr=dt.ide_ccttr
            WHERE
                ct.ide_geper = $1
                AND ct.ide_sucu =  ${dtoIn.ideSucu}
            GROUP BY   
                ide_geper
            `);
        query.addIntParam(1, dtoIn.ide_geper);
        const data = await this.dataSource.createQuery(query);
        if (data.length === 0)
            msg = `[ERROR] No existe el cliente ${dtoIn.ide_geper}`;
        return toResultQuery(data, msg);
    }


    /**
     * Reorna los productos que compra el cliente, con ultima fecha de compra,
     * ultimo precio de venta, cantidad, unidad
     * @param dtoIn 
     * @returns 
     */
    async getProductosCliente(dtoIn: IdClienteDto) {
        const query = new SelectQuery(`     
        WITH UltimasVentas AS (
            SELECT 
                a.ide_inarti, 
                MAX(b.fecha_emisi_cccfa) AS fecha_ultima_venta
            FROM cxc_deta_factura a
            INNER JOIN cxc_cabece_factura b ON a.ide_cccfa = b.ide_cccfa
            WHERE b.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
            AND b.ide_geper = $1
            AND a.ide_sucu = ${dtoIn.ideSucu}
            GROUP BY a.ide_inarti
        ),
        DetallesUltimaVenta AS (
            SELECT 
                uv.ide_inarti,
                b.fecha_emisi_cccfa AS fecha_ultima_venta,
                d.precio_ccdfa AS ultimo_precio,
                d.cantidad_ccdfa AS ultima_cantidad,
                u.siglas_inuni,
                b.ide_cccfa,
                b.secuencial_cccfa,
                c.serie_ccdaf
            FROM UltimasVentas uv
            INNER JOIN cxc_deta_factura d ON uv.ide_inarti = d.ide_inarti
            INNER JOIN cxc_cabece_factura b ON d.ide_cccfa = b.ide_cccfa AND b.fecha_emisi_cccfa = uv.fecha_ultima_venta
            INNER JOIN cxc_datos_fac c ON b.ide_ccdaf = c.ide_ccdaf
            LEFT JOIN inv_unidad u ON d.ide_inuni = u.ide_inuni AND b.fecha_emisi_cccfa = uv.fecha_ultima_venta
            WHERE b.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
            AND b.ide_geper = $2
            AND d.ide_sucu = ${dtoIn.ideSucu}
        )
        SELECT DISTINCT 
            a.ide_inarti,
            c.nombre_inarti,
            uv.fecha_ultima_venta,
            dv.ultimo_precio,
            dv.ultima_cantidad,
            dv.siglas_inuni,
            dv.ide_cccfa,
            CONCAT(
                SUBSTRING(dv.serie_ccdaf FROM 1 FOR 3), '-', 
                SUBSTRING(dv.serie_ccdaf FROM 4 FOR 3), '-', 
                dv.secuencial_cccfa
            ) AS secuencial  
        FROM cxc_deta_factura a
        INNER JOIN cxc_cabece_factura b ON a.ide_cccfa = b.ide_cccfa
        INNER JOIN inv_articulo c ON a.ide_inarti = c.ide_inarti
        INNER JOIN UltimasVentas uv ON a.ide_inarti = uv.ide_inarti
        LEFT JOIN DetallesUltimaVenta dv ON uv.ide_inarti = dv.ide_inarti AND uv.fecha_ultima_venta = dv.fecha_ultima_venta
        WHERE b.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
        AND b.ide_geper = $3
        AND a.ide_sucu = ${dtoIn.ideSucu}
        ORDER BY c.nombre_inarti
        `
            , dtoIn);
        query.addIntParam(1, dtoIn.ide_geper);
        query.addIntParam(2, dtoIn.ide_geper);
        query.addIntParam(3, dtoIn.ide_geper);
        return await this.dataSource.createQueryPG(query);
    }



    /**
   * Retorna el total de ventas mensuales en un período
   * @param dtoIn 
   * @returns 
   */
    async getVentasMensuales(dtoIn: IVentasMensualesClienteDto) {
        const query = new SelectQuery(`
        WITH FacturasFiltradas AS (
            SELECT 
                EXTRACT(MONTH FROM fecha_emisi_cccfa) AS mes,
                COUNT(ide_cccfa) AS num_facturas,
                SUM(base_grabada_cccfa) AS ventas12,
                SUM(base_tarifa0_cccfa + base_no_objeto_iva_cccfa) AS ventas0,
                SUM(valor_iva_cccfa) AS iva,
                SUM(total_cccfa) AS total
            FROM 
                cxc_cabece_factura
            WHERE 
                fecha_emisi_cccfa >= $1 AND fecha_emisi_cccfa <= $2
                AND ide_geper = $3
                AND ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
            GROUP BY 
                EXTRACT(MONTH FROM fecha_emisi_cccfa)
        )
        SELECT 
            gm.nombre_gemes,
            COALESCE(ff.num_facturas, 0) AS num_facturas,
            COALESCE(ff.ventas12, 0) AS ventas12,
            COALESCE(ff.ventas0, 0) AS ventas0,
            COALESCE(ff.iva, 0) AS iva,
            COALESCE(ff.total, 0) AS total
        FROM 
            gen_mes gm
        LEFT JOIN 
            FacturasFiltradas ff ON gm.ide_gemes = ff.mes
        ORDER BY 
            gm.ide_gemes
        `);
        query.addStringParam(1, `${dtoIn.periodo}-01-01`);
        query.addStringParam(2, `${dtoIn.periodo}-12-31`);
        query.addIntParam(3, dtoIn.ide_geper);
        return await this.dataSource.createQueryPG(query);
    }


}
