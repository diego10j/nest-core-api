import { getDateFormat, getDateFormatFront } from 'src/util/helpers/date-util';
import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSourceService } from '../../connection/datasource.service';
import { SelectQuery } from '../../connection/helpers/select-query';
import { BaseService } from '../../../common/base-service';
import { ServiceDto } from '../../../common/dto/service.dto';
import { TrnClienteDto } from './dto/trn-cliente.dto';
import { IdClienteDto } from './dto/id-cliente.dto';
import { IVentasMensualesClienteDto } from './dto/ventas-mensuales.dto';
import { UuidDto } from 'src/common/dto/uuid.dto';
import { ResultQuery } from 'src/core/connection/interfaces/resultQuery';
import { validateDataRequiere } from 'src/util/helpers/common-util';
import { validateCedula, validateRUC } from 'src/util/helpers/validations/cedula-ruc';
import { SaveClienteDto } from './dto/save-cliente.dto';
import { CoreService } from 'src/core/core.service';
import { ObjectQueryDto } from 'src/core/connection/dto';

@Injectable()
export class ClientesService extends BaseService {


    constructor(private readonly dataSource: DataSourceService,
        private readonly core: CoreService
    ) {
        super();
        // obtiene las variables del sistema para el servicio
        this.dataSource.getVariables([
            'p_cxc_estado_factura_normal',// 0 
            'p_cxp_estado_factura_normal', // 0
            'p_gen_tipo_identificacion_ruc', //  1
            'p_gen_tipo_identificacion_cedula'  // 0
        ]).then(result => {
            this.variables = result;
        });
    }


    async getCliente(dtoIn: UuidDto) {
        const query = new SelectQuery(`
        SELECT
            p.ide_geper,
            p.uuid,
            p.ide_getip,
            detalle_getip,
            p.codigo_geper,
            p.nom_geper,
            nombre_getid,
            p.identificac_geper,
            p.nombre_compl_geper,
            p.contacto_geper,
            p.direccion_geper,
            nombre_geprov,
            nombre_gecan,
            p.correo_geper,
            p.telefono_geper,
            p.movil_geper,
            p.pagina_web_geper,
            repre_legal_geper,
            observacion_geper,
            p.fecha_ingre_geper,
            b.nombre_cndfp,
            p.limite_credito_geper,
            dias_credito_geper,
            c.nombre_vgven,
            activo_geper,
            requiere_actua_geper,
            nombre_getitp,
            nombre_cntco
        FROM
            gen_persona p
            LEFT JOIN con_deta_forma_pago b ON b.ide_cndfp = p.ide_cndfp
            LEFT JOIN ven_vendedor c ON c.ide_vgven = p.ide_vgven
            LEFT JOIN gen_tipo_persona d ON p.ide_getip = d.ide_getip
            LEFT JOIN gen_provincia e ON p.ide_geprov = e.ide_geprov
            LEFT JOIN gen_canton f ON p.ide_gecant = f.ide_gecant
            LEFT JOIN gen_titulo_persona g ON p.ide_getitp = g.ide_getitp
            LEFT JOIN gen_tipo_identifi h ON p.ide_getip = h.ide_getid
            LEFT JOIN con_tipo_contribu i ON p.ide_cntco = i.ide_cntco
        WHERE  
            uuid = $1`
        );
        query.addStringParam(1, dtoIn.uuid);

        const res = await this.dataSource.createSingleQuery(query);
        if (res) {
            return {
                rowCount: 1,
                row: {
                    cliente: res,
                },
                message: 'ok'
            } as ResultQuery

        }
        else {
            throw new BadRequestException(`No existe el cliente`);
        }
    }


    /**
    * Retorna el listado de clientes 
    * @param dtoIn 
    * @returns 
    */
    async getClientes(dtoIn: ServiceDto) {
        const query = new SelectQuery(`
        SELECT
            p.ide_geper,
            p.uuid,
            p.nom_geper,
            nombre_getid,
            p.identificac_geper,
            detalle_getip,
            p.correo_geper,
            p.fecha_ingre_geper,
            b.nombre_cndfp,
            c.nombre_vgven,
            activo_geper
        FROM
            gen_persona p
            LEFT JOIN con_deta_forma_pago b ON b.ide_cndfp = p.ide_cndfp
            LEFT JOIN ven_vendedor c ON c.ide_vgven = p.ide_vgven
            LEFT JOIN gen_tipo_persona d on p.ide_getip = d.ide_getip
            LEFT JOIN gen_tipo_identifi h on p.ide_getip = h.ide_getid
        WHERE
            p.es_cliente_geper = true
            AND p.identificac_geper IS NOT NULL
            AND p.nivel_geper = 'HIJO'
            AND P.ide_empr = ${dtoIn.ideEmpr}
        ORDER BY
            p.nom_geper
        `, dtoIn);

        return await this.dataSource.createQuery(query);
    }


    /**
     * Retorna el listado de clientes 
     * @param dtoIn 
     * @returns 
     */
    async getSaldosClientes(dtoIn: ServiceDto) {
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
            WHERE 
                dt.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY
                ide_geper
        )
        SELECT
            p.ide_geper,
            p.uuid,
            p.nom_geper,
            nombre_getid,
            p.identificac_geper,
            detalle_getip,
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
            LEFT JOIN gen_tipo_persona d on p.ide_getip = d.ide_getip
            LEFT JOIN gen_tipo_identifi h on p.ide_getip = h.ide_getid
        WHERE
            p.es_cliente_geper = true
            AND p.identificac_geper IS NOT NULL
            AND p.nivel_geper = 'HIJO'
            AND P.ide_empr = ${dtoIn.ideEmpr}
            AND COALESCE(s.saldo, 0) != 0
        ORDER BY
            p.nom_geper
        `, dtoIn);

        return await this.dataSource.createQuery(query);
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
                AND dt.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY 
                ide_geper
        ),
        movimientos AS (
            SELECT 
                a.ide_ccdtr,
                fecha_trans_ccdtr,
                docum_relac_ccdtr, 
                observacion_ccdtr AS observacion,
                nombre_ccttr AS transaccion,            
                CASE WHEN signo_ccttr = 1 THEN valor_ccdtr END AS debe,
                CASE WHEN signo_ccttr = -1 THEN valor_ccdtr END AS haber,
                0 as saldo,
                fecha_venci_ccdtr,
                ide_teclb,
                ide_cnccc
            FROM 
                cxc_detall_transa a
                INNER JOIN cxc_tipo_transacc b ON a.ide_ccttr = b.ide_ccttr
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
            NULL AS docum_relac_ccdtr,
            'SALDO INICIAL AL ${getDateFormatFront(dtoIn.fechaInicio)} ' AS  observacion,
            'Saldo Inicial' AS transaccion,
            NULL AS debe,
            NULL AS haber,
            saldo_inicial.saldo_inicial AS saldo,
            NULL AS fecha_venci_ccdtr,
            NULL AS ide_teclb,
            NULL AS ide_cnccc
        FROM 
            saldo_inicial
        
        UNION ALL
        
        SELECT 
            mov.ide_ccdtr,
            mov.fecha_trans_ccdtr,
            mov.docum_relac_ccdtr,
            mov.observacion,
            mov.transaccion,
            mov.debe,
            mov.haber,
            saldo_inicial.saldo_inicial + COALESCE(SUM(mov.debe) OVER (ORDER BY mov.fecha_trans_ccdtr, mov.ide_ccdtr), 0) - COALESCE(SUM(mov.haber) OVER (ORDER BY mov.fecha_trans_ccdtr, mov.ide_ccdtr), 0) AS saldo,
            mov.fecha_venci_ccdtr,
            mov.ide_teclb,
            mov.ide_cnccc
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
        return await this.dataSource.createQuery(query);
    }


    /**
     * Retorna el detalle de facturas de ventas del cliente en un rango de fechas
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
            AND cf.ide_empr = ${dtoIn.ideEmpr}
        ORDER BY 
            cf.fecha_emisi_cccfa desc, serie_ccdaf,secuencial_ccdfa
        `, dtoIn);
        query.addIntParam(1, dtoIn.ide_geper);
        query.addDateParam(2, dtoIn.fechaInicio);
        query.addDateParam(3, dtoIn.fechaFin);
        return await this.dataSource.createQuery(query);
    }


    /**
     * Retorna el saldo del cliente
     * @param dtoIn 
     * @returns 
     */
    async getSaldo(dtoIn: IdClienteDto) {
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
                AND ct.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY   
                ide_geper
            `);
        query.addIntParam(1, dtoIn.ide_geper);
        return await this.dataSource.createQuery(query, false);
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
            AND a.ide_empr = ${dtoIn.ideEmpr} 
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
            AND b.ide_empr = ${dtoIn.ideEmpr} 
        )
        SELECT DISTINCT 
            uv.ide_inarti,
            c.nombre_inarti,
            uv.fecha_ultima_venta,
            dv.ultimo_precio,
            dv.ultima_cantidad,
            dv.siglas_inuni,
            dv.ide_cccfa,
            c.foto_inarti,
            CONCAT(
                SUBSTRING(dv.serie_ccdaf FROM 1 FOR 3), '-', 
                SUBSTRING(dv.serie_ccdaf FROM 4 FOR 3), '-', 
                dv.secuencial_cccfa
            ) AS secuencial  
        FROM UltimasVentas uv
        INNER JOIN inv_articulo c ON uv.ide_inarti = c.ide_inarti
        LEFT JOIN DetallesUltimaVenta dv ON uv.ide_inarti = dv.ide_inarti AND uv.fecha_ultima_venta = dv.fecha_ultima_venta
        ORDER BY c.nombre_inarti
        `
            , dtoIn);
        query.addIntParam(1, dtoIn.ide_geper);
        query.addIntParam(2, dtoIn.ide_geper);
        const rows = await this.dataSource.createSelectQuery(query);
        return {
            rows,
            rowCount: rows.length || 0
        }
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
                AND ide_empr = ${dtoIn.ideEmpr}
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
        return await this.dataSource.createQuery(query);
    }

    async save(dtoIn: SaveClienteDto) {

        if (dtoIn.isUpdate === true) {
            // Actualiza el cliente
            const isValid = await this.validateUpdateCliente(dtoIn.data, dtoIn.ideEmpr);
            if (isValid) {
                const ide_geper = dtoIn.data.ide_geper;
                // delete dtoIn.data.ide_geper;
                // delete dtoIn.data.uuid;
                const objQuery = {
                    operation: "update",
                    tableName: "gen_persona",
                    primaryKey: "ide_geper",
                    object: dtoIn.data,
                    condition: `ide_geper = ${ide_geper}`
                } as ObjectQueryDto;
                return await this.core.save({
                    ...dtoIn, listQuery: [objQuery], audit: false
                });
            }
        }
        else {
            // Crea el cliente
            const isValid = await this.validateInsertCliente(dtoIn.data, dtoIn.ideEmpr);
            if (isValid === true) {
                const objQuery = {
                    operation: "insert",
                    tableName: "gen_persona",
                    primaryKey: "ide_geper",
                    object: dtoIn.data,
                } as ObjectQueryDto;
                return await this.core.save({
                    ...dtoIn, listQuery: [objQuery], audit: true
                });
            }
        }

    }

    async getVentasConUtilidad(dtoIn: TrnClienteDto) {
        // Ajustar el porcentaje según  criterio 30% margen
        const query = new SelectQuery(`
        WITH precios_compra AS (
            SELECT
                ide_geper,
                precio_cpdfa,
                fecha_emisi_cpcfa
            FROM cxp_detall_factur df
            INNER JOIN cxp_cabece_factur cf ON df.ide_cpcfa = cf.ide_cpcfa
            WHERE ide_cpefa  =  ${this.variables.get('p_cxp_estado_factura_normal')} 
            AND ide_geper = $1
            AND fecha_emisi_cpcfa BETWEEN $2 AND $3
            AND cf.ide_empr = ${dtoIn.ideEmpr}
            ORDER BY fecha_emisi_cpcfa 
        ),
        datos_completos AS (
            SELECT
                cdf.ide_ccdfa,
                cf.fecha_emisi_cccfa,
                secuencial_cccfa,
                nombre_inarti,
                cdf.cantidad_ccdfa,
                siglas_inuni,
                cdf.precio_ccdfa AS precio_venta,
                cdf.total_ccdfa,
                iart.uuid,
                COALESCE((
                  SELECT pc.precio_cpdfa 
                  FROM precios_compra pc
                  WHERE pc.ide_geper = cf.ide_geper 
                  AND pc.fecha_emisi_cpcfa <= cf.fecha_emisi_cccfa + INTERVAL '7 days'
                  ORDER BY pc.fecha_emisi_cpcfa desc
                  LIMIT 1), 0) AS PRECIO_COMPRA
            FROM
                cxc_deta_factura cdf
            INNER JOIN cxc_cabece_factura cf ON cf.ide_cccfa = cdf.ide_cccfa
            INNER JOIN inv_articulo iart ON iart.ide_inarti = cdf.ide_inarti
            LEFT JOIN inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
            WHERE
                cf.ide_geper = $4
                AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                AND cf.fecha_emisi_cccfa BETWEEN $5 AND $6
                AND cf.ide_empr = ${dtoIn.ideEmpr}
        )
        SELECT
            dc.ide_ccdfa,
            dc.fecha_emisi_cccfa,
            dc.secuencial_cccfa,
            dc.nombre_inarti,
            dc.cantidad_ccdfa,
            dc.siglas_inuni,
            dc.precio_venta,
            dc.total_ccdfa,
            dc.uuid,
            dc.precio_compra,
            ( dc.precio_venta - dc.precio_compra )  as utilidad ,
            CASE 
                WHEN dc.precio_compra > 0 THEN ROUND(((dc.precio_venta - dc.precio_compra) / dc.precio_compra) * 100, 2)
                ELSE 0 
            END AS porcentaje_utilidad,
            ROUND((dc.precio_venta - dc.precio_compra) * dc.cantidad_ccdfa, 2) AS utilidad_neta
        FROM datos_completos dc
        ORDER BY 
            dc.fecha_emisi_cccfa DESC, dc.secuencial_cccfa
            `);
        query.addIntParam(1, dtoIn.ide_geper);
        query.addDateParam(2, dtoIn.fechaInicio);
        query.addDateParam(3, dtoIn.fechaFin);
        query.addIntParam(4, dtoIn.ide_geper);
        query.addDateParam(5, dtoIn.fechaInicio);
        query.addDateParam(6, dtoIn.fechaFin);
        return await this.dataSource.createQuery(query);
    }


    // -------------------------------- PRIVATE FUNCTIONS ---------------------------- //

    /**
     * Validación para crear cliente
     * @param data 
     */
    private async validateInsertCliente(data: any, ideEmpr: number) {

        const colReq = ['identificac_geper', 'nom_geper', 'nombre_compl_geper', 'codigo_geper', 'ide_getid', 'ide_cntco', 'direccion_geper',
            'telefono_geper'];

        const resColReq = validateDataRequiere(data, colReq);

        if (resColReq.length > 0) {
            throw new BadRequestException(resColReq);
        }
        // Valida identificacion
        if (data.ide_getid == this.variables.get('p_gen_tipo_identificacion_cedula')) {
            const valid = validateCedula(data.identificac_geper);
            if (valid === false) {
                throw new BadRequestException(`Cédula ${data.identificac_geper} no válida`);
            }
        }
        else if (data.ide_getid == this.variables.get('p_gen_tipo_identificacion_ruc')) {
            const result = validateRUC(data.identificac_geper, false);
            if (result.isValid === false) {
                throw new BadRequestException(`${result.type} no válido`);
            }
        }

        // validar que no exista el cliente en la misma empresa
        const queryClie = new SelectQuery(`
            select
                1
            from
                gen_persona
            where
                identificac_geper = $1
            and ide_empr = $2
            `);
        queryClie.addParam(1, data.identificac_geper);
        queryClie.addParam(2, ideEmpr);
        const resClie = await this.dataSource.createSelectQuery(queryClie);
        if (resClie.length > 0) {
            throw new BadRequestException(`El cliente ${data.identificac_geper} ya existe`);
        }


        return true;
    }

    private async validateUpdateCliente(data: any, ideEmpr: number) {

        const colReq = ['ide_geper', 'ide_getid', 'identificac_geper'];

        const resColReq = validateDataRequiere(data, colReq);

        if (resColReq.length > 0) {
            throw new BadRequestException(resColReq);
        }


        // Valida identificacion
        if (data.ide_getid == this.variables.get('p_gen_tipo_identificacion_cedula')) {
            const valid = validateCedula(data.identificac_geper);
            if (valid === false) {
                throw new BadRequestException(`Cédula ${data.identificac_geper} no válida`);
            }
        }
        else if (data.ide_getid == this.variables.get('p_gen_tipo_identificacion_ruc')) {
            const result = validateRUC(data.identificac_geper, false);
            if (result.isValid === false) {
                throw new BadRequestException(`${result.type} no válido`);
            }
        }

        // validar que el cliente exista
        const queryClieE = new SelectQuery(`
        select
            1
        from
            gen_persona
        where
            identificac_geper = $1
        and ide_empr = $2 and ide_geper = $3
        `);
        queryClieE.addParam(1, data.identificac_geper);
        queryClieE.addParam(2, ideEmpr);
        queryClieE.addParam(3, data.ide_geper);
        const resClieE = await this.dataSource.createSelectQuery(queryClieE);
        if (resClieE.length === 0) {
            throw new BadRequestException(`El cliente ${data.identificac_geper} no existe`);
        }



        // validar que algun otro cliente no tenga la misma identificacion
        const queryClie = new SelectQuery(`
            select
                1
            from
                gen_persona
            where
                identificac_geper = $1
            and ide_empr = $2
            and ide_geper != $3
            `);
        queryClie.addParam(1, data.identificac_geper);
        queryClie.addParam(2, ideEmpr);
        queryClie.addParam(3, data.ide_geper);
        const resClie = await this.dataSource.createSelectQuery(queryClie);
        if (resClie.length > 0) {
            throw new BadRequestException(`Otro cliente ya existe con el néumro de identificación ${data.identificac_geper}`);
        }


        return true;
    }



}
