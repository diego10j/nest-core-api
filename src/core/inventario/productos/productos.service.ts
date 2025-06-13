import { fShortDate, fDate, getDateFormatFront, addDaysDate } from 'src/util/helpers/date-util';
import { ResultQuery } from './../../connection/interfaces/resultQuery';
import { Injectable, BadRequestException } from '@nestjs/common';
import { DataSourceService } from '../../connection/datasource.service';
import { SelectQuery } from '../../connection/helpers/select-query';
import { TrnProductoDto } from './dto/trn-producto.dto';
import { IdProductoDto } from './dto/id-producto.dto';
import { QueryOptionsDto } from '../../../common/dto/query-options.dto';
import { VentasMensualesDto } from './dto/ventas-mensuales.dto';
import { PreciosProductoDto } from './dto/precios-producto.dto';
import { BaseService } from '../../../common/base-service';
import { AuditService } from '../../audit/audit.service';
import { formatBarChartData, formatPieChartData } from '../../../util/helpers/charts-utils';
import { UuidDto } from '../../../common/dto/uuid.dto';
import { fNumber } from 'src/util/helpers/number-util';
import { ClientesProductoDto } from './dto/clientes-producto.dto';
import { BusquedaPorNombreDto } from './dto/buscar-nombre.dto';
import { CoreService } from 'src/core/core.service';
import { CategoriasDto } from './dto/categorias.dto';
import { isDefined } from 'src/util/helpers/common-util';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { SaldoProducto } from './interfaces/productos';
import { getYear } from 'date-fns';
import { PrecioVentaProductoDto } from './dto/precio-venta-producto.dto';
import { GeneraConfigPreciosVentaDto } from './dto/genera-config-precio.dto';
import { IdeDto } from 'src/common/dto/ide.dto';
import { GetSaldoProductoDto } from './dto/get-saldo.dto';


@Injectable()
export class ProductosService extends BaseService {

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly audit: AuditService,
        private readonly core: CoreService
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


    // -------------------------------- CATEGORIAS ---------------------------- //
    async getTableQueryCategorias(dto: CategoriasDto & HeaderParamsDto) {
        const invIdeIncateCondition = isDefined(dto.inv_ide_incate)
            ? `inv_ide_incate = ${dto.inv_ide_incate}`
            : 'inv_ide_incate IS NULL';

        const condition = `ide_empr = ${dto.ideEmpr} AND ${invIdeIncateCondition}`;
        const dtoIn = {
            ...dto,
            module: 'inv',
            tableName: 'categoria',
            primaryKey: 'ide_incate',
            orderBy: { column: 'nombre_incate' },
            condition,
        };

        return this.core.getTableQuery(dtoIn);
    }

    async getTreeModelCategorias(dto: CategoriasDto & HeaderParamsDto) {
        const invIdeIncateCondition = isDefined(dto.inv_ide_incate)
            ? `inv_ide_incate = ${dto.inv_ide_incate}`
            : 'inv_ide_incate IS NULL';

        const condition = `ide_empr = ${dto.ideEmpr} AND ${invIdeIncateCondition}`;

        const dtoIn = { ...dto, module: 'inv', tableName: 'categoria', primaryKey: 'ide_incate', columnName: 'nombre_incate', columnNode: 'inv_ide_incate', condition: `${condition}`, orderBy: { column: 'nombre_incate' } }
        return this.core.getTreeModel(dtoIn);
    }


    // -------------------------------- PRODUCTOS ---------------------------- //


    async getProductoByUuid(dtoIn: UuidDto & HeaderParamsDto) {
        let whereClause = `ide_inarti = -1`;
        if (dtoIn.uuid) {
            whereClause = `uuid = $1`;
        }
        const query = new SelectQuery(`SELECT * FROM inv_articulo WHERE ${whereClause}`);
        if (dtoIn.uuid) {
            query.addStringParam(1, dtoIn.uuid);
        }
        const res = await this.dataSource.createQuery(query);

        if (dtoIn.uuid) {
            if (res.rowCount !== 1) {
                throw new BadRequestException(`No existe el producto`);
            }
        }

        return {
            row: res.rows[0],
            columns: res.columns,
            key: res.key
        }
    }


    /**
    * Retorna el listado de Productos
    * @returns 
    */
    async getProductos(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        const query = new SelectQuery(`
        SELECT
            ARTICULO.ide_inarti,
            ARTICULO.uuid,
            ARTICULO.nombre_inarti,
            nombre_incate,
            ARTICULO.codigo_inarti,
            ARTICULO.foto_inarti,
            UNIDAD.nombre_inuni,
            ARTICULO.activo_inarti,
            otro_nombre_inarti,
            ARTICULO.ide_incate
        FROM
            inv_articulo ARTICULO
            LEFT JOIN inv_unidad UNIDAD ON ARTICULO.ide_inuni = UNIDAD.ide_inuni
            LEFT JOIN inv_categoria c ON ARTICULO.ide_incate  = c.ide_incate
        WHERE
            ARTICULO.ide_intpr = 1 -- solo productos
            AND ARTICULO.nivel_inarti = 'HIJO'
            AND ARTICULO.ide_empr = ${dtoIn.ideEmpr}
        ORDER BY
            ARTICULO.nombre_inarti
`, dtoIn);

        return await this.dataSource.createQuery(query);


    }



    async getCatalogoProductos(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        const query = new SelectQuery(`
        SELECT
            ide_inarti,
            nombre_inarti,
            precio_inarti,
            foto_inarti,
            a.ide_incate,
            nombre_incate
        FROM
            inv_articulo a
            LEFT JOIN inv_categoria b ON a.ide_incate = b.ide_incate
        WHERE
            ide_intpr = 1 -- solo productos
            AND nivel_inarti = 'HIJO'
            AND a.ide_empr  = ${dtoIn.ideEmpr}
            AND activo_inarti = TRUE
            -- AND a.ide_incate IS NULL
        ORDER BY
            nombre_inarti
        `, dtoIn);

        return await this.dataSource.createSelectQuery(query);

    }

    async getProductosPorNombre(dtoIn: BusquedaPorNombreDto & HeaderParamsDto) {
        const query = new SelectQuery(`
        SELECT
            ide_inarti,
            foto_inarti,
            nombre_inarti,
            otro_nombre_inarti,
            uuid
        FROM
            inv_articulo
        WHERE ide_empr = ${dtoIn.ideEmpr} 
        AND    
            immutable_unaccent_replace (nombre_inarti)
            ILIKE immutable_unaccent_replace ($1)
            OR immutable_unaccent_replace (otro_nombre_inarti)
            ILIKE immutable_unaccent_replace ($2)
        ORDER BY nombre_inarti
        LIMIT ${dtoIn.limit}
        `
        );
        query.addStringParam(1, `%${dtoIn.nombre}%`);
        query.addStringParam(2, `%${dtoIn.nombre}%`);
        return await this.dataSource.createSelectQuery(query);
    }

    /**
     * Retorna la información de un producto
     * @param dtoIn 
     * @returns 
     */
    async getProducto(dtoIn: UuidDto & HeaderParamsDto) {
        const query = new SelectQuery(`
        SELECT
            a.ide_inarti,
            uuid,
            codigo_inarti,
            nombre_inarti,
            nombre_intpr,
            nombre_invmar,
            nombre_inuni,
            siglas_inuni,
            iva_inarti,
            observacion_inarti,
            ice_inarti,
            hace_kardex_inarti,
            activo_inarti,
            foto_inarti,
            publicacion_inarti,
            cant_stock1_inarti,
            cant_stock2_inarti,
            nombre_incate,
            tags_inarti,
            url_inarti,
            se_vende_inarti,
            se_compra_inarti,
            nombre_inbod,
            nombre_infab,
            cod_barras_inarti,
            notas_inarti,
            publicado_inarti,
            total_vistas_inarti,
            otro_nombre_inarti,
            total_ratings_inarti,
            fotos_inarti,
            desc_corta_inarti
        FROM
            inv_articulo a
            left join inv_marca b on a.ide_inmar = b.ide_inmar
            left join inv_unidad c on a.ide_inuni = c.ide_inuni
            left join inv_tipo_producto d on a.ide_intpr = d.ide_intpr
            left join inv_categoria e on a.ide_incate = e.ide_incate
            left join inv_bodega f on a.ide_inbod = f.ide_inbod
            left join inv_fabricante g on a.ide_infab = g.ide_infab
        where
            uuid = $1`
        );
        query.addStringParam(1, dtoIn.uuid);

        const res = await this.dataSource.createSingleQuery(query);
        if (res) {
            const ide_inarti = res.ide_inarti;
            const queryCarac = new SelectQuery(`
            select
                a.ide_inarc,
                nombre_incar,
                detalle_inarc
            from
                inv_articulo_carac a
                inner join inv_caracteristica b on a.ide_incar = b.ide_incar
                inner join inv_articulo c on a.ide_inarti = c.ide_inarti
            where
                uuid = $1
            `);
            queryCarac.addStringParam(1, dtoIn.uuid);
            const resCarac = await this.dataSource.createSelectQuery(queryCarac);

            const queryConve = new SelectQuery(`
            select
                a.ide_incon,
                cantidad_incon,
                b.nombre_inuni AS unidad_origen,
                d.nombre_inuni AS unidad_destino,
                valor_incon,
                observacion,
                nombre_inarti
            from
                inv_conversion_unidad a
                inner join inv_unidad b on a.ide_inuni = b.ide_inuni
                inner join inv_articulo c on a.ide_inarti = c.ide_inarti
                inner join inv_unidad d on a.inv_ide_inuni = d.ide_inuni
            where
                uuid = $1
            `);
            queryConve.addStringParam(1, dtoIn.uuid);
            const resConve = await this.dataSource.createSelectQuery(queryConve);

            // Stock
            const saldoProducto = await this.getStock(ide_inarti);
            const stock = saldoProducto?.saldo || 0;
            const stockMinimo = res.cant_stock1_inarti ? Number(res.cant_stock1_inarti) : null;
            const stockIdeal = res.cant_stock2_inarti ? Number(res.cant_stock2_inarti) : null;

            let detalle_stock = stock > 0 ? 'EN STOCK' : 'SIN STOCK';
            let color_stock = stock > 0 ? 'success.main' : 'error.main';

            // Si hay valores definidos para stockMinimo o stockIdeal, se procede con las validaciones
            if (stockMinimo !== null || stockIdeal !== null) {
                if (stockMinimo !== null && stock < stockMinimo) {
                    detalle_stock = 'STOCK BAJO';
                    color_stock = 'warning.main';
                }

                if (stockIdeal !== null) {
                    color_stock = 'success.main';
                    if (stock > stockIdeal) {
                        detalle_stock = 'STOCK EXTRA';
                    } else if (stock === stockIdeal) {
                        detalle_stock = 'STOCK IDEAL';
                    } else if (stock > stockMinimo && stock < stockIdeal) {
                        detalle_stock = 'STOCK ÓPTIMO';
                    }
                }
            }

            // Total clientes
            const total_clientes = await this.getTotalClientesProducto(ide_inarti);

            // Ultima Trn

            const resUltimaVentaCompra = await this.getUltimaVentaCompra(ide_inarti, saldoProducto?.decim_stock_inarti);

            return {
                rowCount: 1,
                row: {
                    producto: res,
                    caracteristicas: resCarac,
                    conversion: resConve,
                    stock: {
                        stock,
                        detalle_stock,
                        color_stock
                    },
                    datos: { total_clientes, ...resUltimaVentaCompra },
                },
                message: 'ok'
            } as ResultQuery

        }
        else {
            throw new BadRequestException(`No existe el producto`);
        }
    }

    /**
     * Retorna las transacciones de ingreso/egreso de un producto en un rango de fechas
     * @param dtoIn 
     * @returns 
     */
    async getTrnProducto(dtoIn: TrnProductoDto & HeaderParamsDto) {

        const whereClause = dtoIn.ide_inbod ? ` AND dci.ide_inbod = ${dtoIn.ide_inbod}` : '';

        const query = new SelectQuery(`
        WITH saldo_inicial AS (
            SELECT 
                dci.ide_inarti,
                f_redondeo(SUM(cantidad_indci * signo_intci), decim_stock_inarti) AS saldo
            FROM
                inv_det_comp_inve dci
                INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                INNER JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                LEFT JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                INNER JOIN inv_articulo iart ON iart.ide_inarti = dci.ide_inarti
            WHERE
                dci.ide_inarti = $1
                AND fecha_trans_incci < $2
                AND ide_inepi = ${this.variables.get('p_inv_estado_normal')} 
                AND dci.ide_empr =  ${dtoIn.ideEmpr}
                ${whereClause}
            GROUP BY
                dci.ide_inarti,decim_stock_inarti
        ),
        movimientos AS (
            SELECT
                dci.ide_indci,
                dci.ide_inarti,
                cci.ide_incci,
                cci.fecha_trans_incci,
                cci.ide_inbod,
                bod.nombre_inbod,
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
                cantidad_indci * signo_intci AS movimiento,
                decim_stock_inarti
            FROM
                inv_det_comp_inve dci
                INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                LEFT JOIN gen_persona gpe ON cci.ide_geper = gpe.ide_geper
                LEFT JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                LEFT JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                INNER JOIN inv_articulo arti ON dci.ide_inarti = arti.ide_inarti
                inner join inv_bodega bod on cci.ide_inbod = bod.ide_inbod
            WHERE
                dci.ide_inarti = $3
                AND arti.ide_empr = ${dtoIn.ideEmpr}        
                AND fecha_trans_incci BETWEEN $4 AND $5
                AND ide_inepi = ${this.variables.get('p_inv_estado_normal')} 
                AND dci.ide_sucu =  ${dtoIn.ideSucu}
                ${whereClause}
        ),
        saldo_movimientos AS (
            SELECT
                ide_indci AS ide_indci,
                mov.ide_inarti,
                ide_incci AS ide_incci,
                mov.fecha_trans_incci,
                mov.ide_inbod,
                mov.nombre_inbod,
                mov.NUM_DOCUMENTO,
                mov.nom_geper,
                mov.nombre_intti,
                mov.PRECIO,
                f_decimales(mov.INGRESO, mov.decim_stock_inarti)::numeric as ingreso,
                f_decimales(mov.EGRESO, mov.decim_stock_inarti)::numeric as egreso,                
                (COALESCE(saldo_inicial.saldo, 0) + SUM(mov.movimiento) OVER (ORDER BY mov.fecha_trans_incci, mov.ide_indci)) AS SALDO
            FROM
                movimientos mov
                LEFT JOIN saldo_inicial ON mov.ide_inarti = saldo_inicial.ide_inarti
            UNION ALL
            SELECT
                -1 AS ide_indci,
                saldo_inicial.ide_inarti,
                NULL AS ide_incci,
                '${fDate(dtoIn.fechaInicio)}' AS fecha_trans_incci,
                NULL as ide_inbod,
                NULL as nombre_inbod,
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
        `, dtoIn);
        query.addIntParam(1, dtoIn.ide_inarti);
        query.addParam(2, dtoIn.fechaInicio);
        query.addIntParam(3, dtoIn.ide_inarti);
        query.addParam(4, dtoIn.fechaInicio);
        query.addParam(5, dtoIn.fechaFin);

        return await this.dataSource.createQuery(query);


    }

    /**
     * Retorna las facturas de ventas de un producto determinado en un rango de fechas
     * @param dtoIn 
     * @returns 
     */
    async getVentasProducto(dtoIn: PreciosProductoDto & HeaderParamsDto) {

        // Ajustar el porcentaje según  criterio 30% margen
        const whereCantidad = dtoIn.cantidad ? `AND ABS(cantidad_ccdfa - ${dtoIn.cantidad}) <= 0.3 * ${dtoIn.cantidad} ` : '';

        const query = new SelectQuery(`
        SELECT
            cdf.ide_ccdfa,
            cf.fecha_emisi_cccfa,
            secuencial_cccfa,
            nom_geper,
            f_decimales(cdf.cantidad_ccdfa, decim_stock_inarti)::numeric as cantidad_ccdfa,
            siglas_inuni,
            cdf.precio_ccdfa,
            cdf.total_ccdfa,
            ven.nombre_vgven,
            p.uuid
        FROM
            cxc_deta_factura cdf
        INNER join cxc_cabece_factura cf on cf.ide_cccfa = cdf.ide_cccfa
        INNER join inv_articulo iart on iart.ide_inarti = cdf.ide_inarti
        LEFT JOIN inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
        INNER join gen_persona p on cf.ide_geper = p.ide_geper
        LEFT JOIN ven_vendedor ven ON cf.ide_vgven = ven.ide_vgven
        WHERE
            cdf.ide_inarti =  $1
            AND iart.ide_empr = ${dtoIn.ideEmpr}  
            and cf.ide_ccefa =  ${this.variables.get('p_cxc_estado_factura_normal')} 
            and cf.fecha_emisi_cccfa BETWEEN $2 AND $3
            ${whereCantidad}
        ORDER BY 
            cf.fecha_emisi_cccfa desc, secuencial_cccfa desc`, dtoIn);
        query.addIntParam(1, dtoIn.ide_inarti);
        query.addParam(2, dtoIn.fechaInicio);
        query.addParam(3, dtoIn.fechaFin);
        return await this.dataSource.createQuery(query);
    }


    async getVentasProductoUtilidad(dtoIn: PreciosProductoDto & HeaderParamsDto) {
        // Ajustar el porcentaje según  criterio 30% margen
        const whereCantidad = dtoIn.cantidad ? `WHERE ABS(cantidad_ccdfa - ${dtoIn.cantidad}) <= 0.3 * ${dtoIn.cantidad} ` : '';

        const query = new SelectQuery(`
        SELECT 
            uv.ide_ccdfa,
            uv.ide_inarti,
            uv.fecha_emisi_cccfa,
            uv.secuencial_cccfa,
            uv.nom_geper,
            uv.nombre_inarti,
            uv.cantidad_ccdfa,
            uv.siglas_inuni,
            uv.precio_venta,
            uv.total_ccdfa,
            uv.nombre_vgven,
            uv.hace_kardex_inarti,
            uv.precio_compra,
            uv.utilidad,
            uv.utilidad_neta,
            uv.porcentaje_utilidad,
            uv.nota_credito,
            uv.fecha_ultima_compra
        FROM f_utilidad_ventas($1,$2,$3,$4) uv
             ${whereCantidad}
            `, dtoIn);
        query.addParam(1, dtoIn.ideEmpr);
        query.addParam(2, dtoIn.fechaInicio);
        query.addParam(3, dtoIn.fechaFin);
        query.addIntParam(4, dtoIn.ide_inarti);
        const res = await this.dataSource.createQuery(query);

        res.row = {
            precio_minimo_venta: 0,
            precio_maximo_venta: 0,
            promedio_precio: 0,
            precio_sugerido: 0,
        }
        // Filtrar los datos por cantidad
        const margin = 0.2; // 20% de margen
        if (res.rowCount > 0 && dtoIn.cantidad) {
            const filteredSales = res.rows.filter(sale => Math.abs(sale.cantidad_ccdfa - dtoIn.cantidad) <= margin * dtoIn.cantidad);

            // Encontrar precios minimos y maximos
            const precios_venta = filteredSales.map(sale => sale.precio_venta);
            const precio_minimo_venta = Math.min(...precios_venta);
            const precio_maximo_venta = Math.max(...precios_venta);

            // Calcular el promedio
            const promedio_precio = precios_venta.reduce((a, b) => a + b, 0) / precios_venta.length;

            // Sugestión de precio
            let precio_sugerido;
            if (precio_minimo_venta && precio_maximo_venta) {
                precio_sugerido = (precio_minimo_venta + precio_maximo_venta) / 2;
            } else {
                precio_sugerido = promedio_precio;
            }
            res.row = {
                precio_minimo_venta,
                precio_maximo_venta,
                promedio_precio: Number(fNumber(promedio_precio)),
                precio_sugerido: Number(fNumber(precio_sugerido))
            }
        }

        return res
    }

    /**
     * Retorna las facturas de compras de un producto determinado en un rango de fechas
     * @param dtoIn 
     * @returns 
     */
    async getComprasProducto(dtoIn: TrnProductoDto & HeaderParamsDto) {
        const query = new SelectQuery(`
    SELECT
        cdf.ide_cpdfa,
        cf.fecha_emisi_cpcfa,
        numero_cpcfa,
        nom_geper,
        f_decimales(cdf.cantidad_cpdfa, iart.decim_stock_inarti)::numeric as cantidad_cpdfa,
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
        AND iart.ide_empr = ${dtoIn.ideEmpr} 
        and cf.ide_cpefa =  ${this.variables.get('p_cxp_estado_factura_normal')} 
        and cf.fecha_emisi_cpcfa BETWEEN $2 AND $3
    ORDER BY 
        cf.fecha_emisi_cpcfa desc, numero_cpcfa`
            , dtoIn);
        query.addIntParam(1, dtoIn.ide_inarti);
        query.addParam(2, dtoIn.fechaInicio);
        query.addParam(3, dtoIn.fechaFin);
        return await this.dataSource.createQuery(query);
    }

    /**
     * Retorna los últimos precios de compra a proveddores de un producto determinado
     * @param dtoIn 
     * @returns 
     */
    async getUltimosPreciosCompras(dtoIn: IdProductoDto & HeaderParamsDto) {
        const query = new SelectQuery(`
        WITH UltimaVenta AS (
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
        )
        SELECT
            b.ide_geper,
            c.nom_geper,
            MAX(b.fecha_emisi_cpcfa) AS fecha_ultima_venta,
            f_decimales(u.cantidad, iart.decim_stock_inarti)::numeric as cantidad,
            siglas_inuni,
            u.precio,
            u.total
        FROM 
            cxp_detall_factur a
            INNER JOIN cxp_cabece_factur b ON a.ide_cpcfa = b.ide_cpcfa
            INNER JOIN gen_persona c ON b.ide_geper = c.ide_geper
            left join inv_articulo iart on a.ide_inarti = iart.ide_inarti
            LEFT JOIN inv_unidad uni ON iart.ide_inuni = uni.ide_inuni
            LEFT JOIN UltimaVenta u ON u.ide_geper = b.ide_geper AND u.rn = 1
        WHERE
            b.ide_cpefa = ${this.variables.get('p_cxp_estado_factura_normal')}
            AND a.ide_inarti = $2
            AND b.ide_empr = ${dtoIn.ideEmpr}  
        GROUP BY 
            a.ide_inarti,
            decim_stock_inarti,
            b.ide_geper,
            c.nom_geper,
            u.cantidad,
            siglas_inuni,
            u.precio,
            u.total
        ORDER BY 
            3 DESC
        `, dtoIn);
        query.addIntParam(1, dtoIn.ide_inarti);
        query.addIntParam(2, dtoIn.ide_inarti);
        return await this.dataSource.createQuery(query);
    }

    /**
     * Retorna el saldo de un producto
     * @param dtoIn 
     * @returns 
     */
    async getSaldo(dtoIn: GetSaldoProductoDto & HeaderParamsDto) {
        const whereClause = dtoIn.ide_inarti ? "iart.ide_inarti = $1" : "iart.uuid = $1";

        const query = new SelectQuery(`     
    SELECT 
        iart.ide_inarti,
        nombre_inarti,
        f_redondeo(SUM(cantidad_indci * signo_intci), decim_stock_inarti) AS saldo,
        siglas_inuni,
        decim_stock_inarti,
        to_char(now(), 'YYYY-MM-DD HH24:MI:SS') AS fecha
    FROM
        inv_det_comp_inve dci
        INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
        INNER JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
        INNER JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
        INNER JOIN inv_articulo iart ON iart.ide_inarti = dci.ide_inarti
        LEFT JOIN inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
    WHERE
        ${whereClause}
        AND ide_inepi = ${this.variables.get('p_inv_estado_normal')}
        AND cci.ide_empr = ${dtoIn.ideEmpr}
    GROUP BY   
        iart.ide_inarti, nombre_inarti, siglas_inuni, decim_stock_inarti
    `);

        // Asegúrate de que el parámetro existe en dtoIn
        const paramValue = dtoIn.ide_inarti || dtoIn.uuid;
        if (!paramValue) {
            throw new Error("Se requiere ide_inarti o uuid en el DTO de entrada");
        }

        query.addParam(1, paramValue);
        return await this.dataSource.createSingleQuery(query) as SaldoProducto;
    }

    /**
     * Retorna el saldo de un producto por bodega
     * @param dtoIn 
     * @returns 
     */
    async getSaldoPorBodega(dtoIn: IdProductoDto & HeaderParamsDto) {
        const query = new SelectQuery(`     
        SELECT 
            cci.ide_inbod,
            nombre_inbod,
            nombre_inarti,
            f_decimales(SUM(cantidad_indci * signo_intci), decim_stock_inarti)::numeric AS saldo,
            decim_stock_inarti,
            siglas_inuni
        FROM
            inv_det_comp_inve dci
            inner join inv_cab_comp_inve cci on cci.ide_incci = dci.ide_incci
            inner join inv_bodega bod on cci.ide_inbod = bod.ide_inbod
            inner join inv_tip_tran_inve tti on tti.ide_intti = cci.ide_intti
            inner join inv_tip_comp_inve tci on tci.ide_intci = tti.ide_intci
            inner join inv_articulo iart on iart.ide_inarti = dci.ide_inarti
            left join inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
        WHERE
            dci.ide_inarti = $1
            AND ide_inepi =  ${this.variables.get('p_inv_estado_normal')} 
            AND cci.ide_empr = ${dtoIn.ideEmpr} 
        GROUP BY   
            cci.ide_inbod,nombre_inbod,nombre_inarti,siglas_inuni,decim_stock_inarti
        `, dtoIn);
        query.addIntParam(1, dtoIn.ide_inarti);
        return await this.dataSource.createQuery(query);
    }


    /**
       * Retorna el total de ventas mensuales de un producto en un periodo 
       * @param dtoIn 
       * @returns 
       */
    async getVentasMensuales(dtoIn: VentasMensualesDto & HeaderParamsDto) {
        if (dtoIn.periodo === 0) {
            dtoIn.periodo = getYear(new Date());
            dtoIn.ide_inarti = -1;
        }

        // para filtrar dotos de un cliente
        const conditionCliente = dtoIn.ide_geper ? `AND a.ide_geper = ${dtoIn.ide_geper}` : '';
        const query = new SelectQuery(`
        SELECT
            gm.nombre_gemes,
            ${dtoIn.periodo} as periodo,
            COALESCE(count(cdf.ide_ccdfa), 0) AS num_facturas,
            COALESCE(sum(cdf.cantidad_ccdfa), 0) AS cantidad,
            siglas_inuni,
            decim_stock_inarti,
            COALESCE(sum(cdf.total_ccdfa), 0) AS total
        FROM
            gen_mes gm
        LEFT JOIN (
            SELECT
                EXTRACT(MONTH FROM fecha_emisi_cccfa) AS mes,
                cdf.ide_ccdfa,
                cdf.cantidad_ccdfa,
                cdf.total_ccdfa,
                siglas_inuni,
                decim_stock_inarti
            FROM
                cxc_cabece_factura a
            INNER JOIN
                cxc_deta_factura cdf ON a.ide_cccfa = cdf.ide_cccfa
            INNER JOIN 
                inv_articulo d ON cdf.ide_inarti = d.ide_inarti
            LEFT JOIN 
                inv_unidad f ON d.ide_inuni = f.ide_inuni 
            WHERE
                fecha_emisi_cccfa  >=  $1 AND a.fecha_emisi_cccfa <=  $2 
                AND cdf.ide_inarti = $3
                AND ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                AND a.ide_empr = ${dtoIn.ideEmpr} 
                ${conditionCliente}
        ) cdf ON gm.ide_gemes = cdf.mes
        GROUP BY
            gm.nombre_gemes, gm.ide_gemes, siglas_inuni,decim_stock_inarti
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
    async getComprasMensuales(dtoIn: VentasMensualesDto & HeaderParamsDto) {

        if (dtoIn.periodo === 0) {
            dtoIn.periodo = getYear(new Date());
            dtoIn.ide_inarti = -1;
        }
        const query = new SelectQuery(`
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
        `, dtoIn);
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
    async getSumatoriaTrnPeriodo(dtoIn: VentasMensualesDto & HeaderParamsDto) {
        if (dtoIn.periodo === 0) {
            dtoIn.periodo = getYear(new Date());
            dtoIn.ide_inarti = -1;
        }
        const query = new SelectQuery(`
    SELECT
        COALESCE(v.siglas_inuni, c.siglas_inuni) AS unidad,
        COALESCE(v.fact_ventas,0) as fact_ventas,
        COALESCE(v.cantidad_ventas,0) as cantidad_ventas,
        COALESCE(v.total_ventas,0) as total_ventas,
        COALESCE(c.fact_compras,0) as fact_compras,
        COALESCE(c.cantidad_compras,0) as cantidad_compras,
        COALESCE(c.total_compras,0) as total_compras,
        v.total_ventas -  c.total_compras as margen
    FROM
        (
            SELECT
                count(1) AS fact_ventas,
                ROUND(SUM(cdf.cantidad_ccdfa), 0)  AS cantidad_ventas,
                ROUND(SUM(cdf.total_ccdfa), 0)  AS total_ventas,
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
                AND cf.ide_empr = ${dtoIn.ideEmpr} 
            GROUP BY
                siglas_inuni
        ) v FULL
        OUTER JOIN (
            SELECT
                count(1) AS fact_compras,
                ROUND(SUM(cdf.cantidad_cpdfa), 0) AS cantidad_compras,
                ROUND(SUM(cdf.valor_cpdfa), 0) AS total_compras,
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
                AND cf.ide_empr = ${dtoIn.ideEmpr} 
            GROUP BY
                siglas_inuni
        ) c ON v.siglas_inuni = c.siglas_inuni
        `, dtoIn);
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


    async getProveedores(dtoIn: IdProductoDto & HeaderParamsDto) {
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
            AND cf.ide_empr = ${dtoIn.ideEmpr} 
        GROUP BY
            p.ide_geper,
            p.nom_geper,
            p.identificac_geper,
            siglas_inuni,
            p.uuid
        ORDER BY
            p.nom_geper
        `, dtoIn);
        query.addIntParam(1, dtoIn.ide_inarti);

        return await this.dataSource.createQuery(query);
    }

    /**
     * Retorna top 10 mejores proveedores en un periodo
     * @param dtoIn 
     * @returns 
     */
    async getTopProveedores(dtoIn: VentasMensualesDto & HeaderParamsDto) {
        if (dtoIn.periodo === 0) {
            dtoIn.periodo = getYear(new Date());
            dtoIn.ide_inarti = -1;
        }
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
            AND cf.ide_empr = ${dtoIn.ideEmpr} 
        GROUP BY
            p.ide_geper,
            p.nom_geper,
            siglas_inuni
        ORDER BY
            total_valor DESC
        LIMIT 10
        `, dtoIn);
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
    async getTopClientes(dtoIn: VentasMensualesDto & HeaderParamsDto) {
        if (dtoIn.periodo === 0) {
            dtoIn.periodo = getYear(new Date());
            dtoIn.ide_inarti = -1;
        }
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
            AND cf.ide_empr = ${dtoIn.ideEmpr} 
        GROUP BY
            p.ide_geper,
            p.nom_geper,
            siglas_inuni
        ORDER BY
            total_valor DESC
        LIMIT 10
        `, dtoIn);
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
    async getClientes(dtoIn: ClientesProductoDto & HeaderParamsDto) {

        const sql = `            
        WITH
        datos_cliente AS (
            SELECT
                p.ide_geper,
                upper(p.nom_geper) AS nom_geper,
                COUNT(1) AS num_facturas,
                SUM(cdf.cantidad_ccdfa) AS total_cantidad,
                uni.siglas_inuni,
                SUM(cdf.cantidad_ccdfa * cdf.precio_ccdfa) AS total_valor,
                MIN(fecha_emisi_cccfa) AS fecha_primer_compra,
                MAX(fecha_emisi_cccfa) AS fecha_ultima_compra,
                ven.nombre_vgven,
                p.uuid,
                ARRAY_AGG(
                    fecha_emisi_cccfa
                    ORDER BY
                        fecha_emisi_cccfa
                ) AS fechas_compras,
                AVG(cdf.cantidad_ccdfa * cdf.precio_ccdfa) AS valor_promedio_compra,
                STDDEV(cdf.cantidad_ccdfa * cdf.precio_ccdfa) AS desviacion_valor_compra
            FROM
                cxc_deta_factura cdf
                INNER JOIN cxc_cabece_factura cf ON cf.ide_cccfa = cdf.ide_cccfa
                INNER JOIN inv_articulo iart ON iart.ide_inarti = cdf.ide_inarti
                LEFT JOIN inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
                INNER JOIN gen_persona p ON cf.ide_geper = p.ide_geper
                LEFT JOIN ven_vendedor ven ON cf.ide_vgven = ven.ide_vgven
            WHERE
                cdf.ide_inarti = $1
                AND cf.ide_ccefa =  ${this.variables.get('p_cxc_estado_factura_normal')} 
                AND cf.ide_empr = ${dtoIn.ideEmpr} 
            GROUP BY
                p.ide_geper,
                p.nom_geper,
                uni.siglas_inuni,
                ven.nombre_vgven,
                p.uuid
        ),
        avg_valor_compra AS (
            SELECT
                AVG(total_valor / num_facturas) AS avg_valor_promedio
            FROM
                datos_cliente
        ),
        clientes_unicos AS (
            SELECT
                dc.*,
                ROW_NUMBER() OVER (
                    PARTITION BY
                        dc.ide_geper
                    ORDER BY
                        dc.fecha_ultima_compra DESC,
                        dc.total_valor DESC
                ) AS rn
            FROM
                datos_cliente dc
        ),
        intervalos_compras AS (
            SELECT
                cu.ide_geper,
                cu.fechas_compras,
                CASE
                    WHEN array_length(cu.fechas_compras, 1) > 1 THEN (cu.fechas_compras[array_length(cu.fechas_compras, 1)] - cu.fechas_compras[1])::numeric / (array_length(cu.fechas_compras, 1) - 1)
                    ELSE NULL
                END AS intervalo_promedio_dias,
                CASE
                    WHEN array_length(cu.fechas_compras, 1) > 1 THEN cu.fechas_compras[array_length(cu.fechas_compras, 1)] + make_interval(days => ((cu.fechas_compras[array_length(cu.fechas_compras, 1)] - cu.fechas_compras[1])::numeric / (array_length(cu.fechas_compras, 1) - 1))::int)
                    ELSE NULL
                END AS fecha_proxima_compra_estimada,
                CASE
                    WHEN array_length(cu.fechas_compras, 1) = 1 THEN 'Compra única'
                    WHEN ((cu.fechas_compras[array_length(cu.fechas_compras, 1)] - cu.fechas_compras[1])::numeric / (array_length(cu.fechas_compras, 1) - 1)) <= 30 THEN 'Frecuente'
                    WHEN ((cu.fechas_compras[array_length(cu.fechas_compras, 1)] - cu.fechas_compras[1])::numeric / (array_length(cu.fechas_compras, 1) - 1)) <= 90 THEN 'Ocasional'
                    ELSE 'Esporádico'
                END AS frecuencia_compra
            FROM
                clientes_unicos cu
            WHERE
                cu.rn = 1
        ),
        tendencia_ventas AS (
            SELECT
                cu.ide_geper,
                CASE
                    WHEN cu.num_facturas >= 3 THEN CASE
                        WHEN (cu.total_valor / cu.num_facturas) > (
                            SELECT
                                avg_valor_promedio
                            FROM
                                avg_valor_compra
                        ) * 1.2 THEN 'Alta'
                        WHEN (cu.total_valor / cu.num_facturas) < (
                            SELECT
                                avg_valor_promedio
                            FROM
                                avg_valor_compra
                        ) * 0.8 THEN 'Baja'
                        ELSE 'Estable'
                    END
                    ELSE 'No aplica'
                END AS tendencia_valor_compra,
                CASE
                    WHEN cu.num_facturas >= 3 THEN CASE
                        WHEN (cu.fecha_ultima_compra - cu.fecha_primer_compra) < 180
                        AND cu.num_facturas > 5 THEN 'Creciente'
                        WHEN (cu.fecha_ultima_compra - cu.fecha_primer_compra) < 180
                        AND (((cu.fecha_ultima_compra - cu.fecha_primer_compra)::int / 30.0) / cu.num_facturas) < 0.5 THEN 'Decreciente'
                        ELSE 'Constante'
                    END
                    ELSE 'No aplica'
                END AS tendencia_frecuencia_compra
            FROM
                clientes_unicos cu
            WHERE
                cu.rn = 1
        )
    SELECT
        cu.ide_geper,
        cu.nom_geper,
        cu.num_facturas,
        f_decimales (cu.total_cantidad) AS total_cantidad,
        cu.siglas_inuni,
        f_redondeo (cu.total_valor, 2) AS total_valor,
        cu.fecha_primer_compra,
        cu.fecha_ultima_compra,
        cu.nombre_vgven,
        cu.uuid,
        f_redondeo (cu.valor_promedio_compra, 2) AS valor_promedio_compra,
        f_redondeo (cu.desviacion_valor_compra, 2) AS desviacion_valor_compra,
        f_redondeo (ic.intervalo_promedio_dias, 2) AS intervalo_promedio_dias,
        ic.fecha_proxima_compra_estimada,
        ic.frecuencia_compra,
        tt.tendencia_valor_compra,
        tt.tendencia_frecuencia_compra,
        CASE
            WHEN (CURRENT_DATE - cu.fecha_ultima_compra) > 365 THEN 'Inactivo'
            WHEN (CURRENT_DATE - cu.fecha_ultima_compra) > (ic.intervalo_promedio_dias * 1.5)
            AND ic.intervalo_promedio_dias IS NOT NULL THEN 'En riesgo'
            WHEN cu.num_facturas = 1 THEN 'Compra única'
            ELSE 'Activo'
        END AS estado_cliente,
        RANK() OVER (
            ORDER BY
                cu.total_valor DESC
        ) AS ranking_valor_total,
        RANK() OVER (
            ORDER BY
                cu.num_facturas DESC
        ) AS ranking_frecuencia,
        PERCENT_RANK() OVER (
            ORDER BY
                cu.total_valor
        ) AS percentil_valor
    FROM
        clientes_unicos cu
        JOIN intervalos_compras ic ON cu.ide_geper = ic.ide_geper
        JOIN tendencia_ventas tt ON cu.ide_geper = tt.ide_geper
    WHERE
        cu.rn = 1
    ORDER BY
        cu.fecha_ultima_compra DESC,
        cu.total_valor DESC
            `;
        const query = new SelectQuery(sql, dtoIn);
        query.addIntParam(1, dtoIn.ide_inarti);
        return await this.dataSource.createQuery(query);
    }

    async chartVariacionPreciosCompras(dtoIn: IdProductoDto & HeaderParamsDto) {
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
                AND cf.ide_empr = ${dtoIn.ideEmpr} 
            ORDER BY fecha_emisi_cpcfa desc
            LIMIT 12
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
            fecha

        `, dtoIn);
        query.addIntParam(1, dtoIn.ide_inarti);
        const res = await this.dataSource.createSelectQuery(query);
        let charts = [];
        if (res) {
            // Obtener el total (precio del último registro)
            const total = res[res.length - 1].precio;

            // Obtener el percent (porcentaje_variacion del último registro)
            const percent = res[res.length - 1].porcentaje_variacion;

            // Formatear las fechas para las categorías en el formato 'Ene 2023'
            const categories = res.map(row => fShortDate(row.fecha));

            // Obtener los precios para la serie
            const series = [{
                data: res.map(row => row.precio)
            }];
            charts = [{
                total,
                percent,
                categories,
                series
            }]
        }

        return {
            rowCount: charts.length,
            charts,
            message: 'ok'
        } as ResultQuery
    }

    async getVariacionInventario(dtoIn: VentasMensualesDto & HeaderParamsDto) {
        if (dtoIn.periodo === 0) {
            dtoIn.periodo = getYear(new Date());
            dtoIn.ide_inarti = -1;
        }
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

        `, dtoIn);
        query.addIntParam(1, dtoIn.ide_inarti);
        return await this.dataSource.createSelectQuery(query);
    }

    /**
     * Retrona la actividades/log registradas sobre un producto
     * @param dtoIn 
     * @returns 
     */
    async getActividades(dtoIn: IdProductoDto & HeaderParamsDto) {
        const query = this.audit.getQueryActividadesPorTabla('inv_articulo', dtoIn.ide_inarti);
        return await this.dataSource.createQuery(query);
    }


    // =====================================================================

    /**
     * Retorna saldo inicial de un producto a una determinada fecha de corte
     * @param ide_inarti 
     * @param fechaCorte 
     * @returns 
     */
    async getStock(ide_inarti: number, fechaCorte?: Date): Promise<SaldoProducto> {
        const fecha = fechaCorte ? fechaCorte : new Date();
        const querySaldoInicial = new SelectQuery(`     
        SELECT 
            iart.ide_inarti,
            nombre_inarti,
            f_decimales(SUM(cantidad_indci * signo_intci), decim_stock_inarti)::numeric AS saldo,
            siglas_inuni,
            decim_stock_inarti,
            '${fDate(fecha)}' AS fecha
        FROM
            inv_det_comp_inve dci
            left join inv_cab_comp_inve cci on cci.ide_incci = dci.ide_incci
            left join inv_tip_tran_inve tti on tti.ide_intti = cci.ide_intti
            left join inv_tip_comp_inve tci on tci.ide_intci = tti.ide_intci
            inner join inv_articulo iart on iart.ide_inarti = dci.ide_inarti
            left join inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
        WHERE
            dci.ide_inarti = $1
            AND fecha_trans_incci <=  $2
            AND ide_inepi =  ${this.variables.get('p_inv_estado_normal')} 
        GROUP BY   
            iart.ide_inarti,nombre_inarti,siglas_inuni,decim_stock_inarti `);

        querySaldoInicial.addIntParam(1, ide_inarti);
        querySaldoInicial.addParam(2, fecha);

        return await this.dataSource.createSingleQuery(querySaldoInicial) as SaldoProducto;
    }

    /**
     * Retorna el total de clientes de un producto 
     * @param ide_inarti 
     * @returns 
     */
    async getTotalClientesProducto(ide_inarti: number): Promise<number> {
        let totalClientes = 0;

        const query = new SelectQuery(`     
        SELECT COUNT(DISTINCT cf.ide_geper) AS total_clientes
        FROM cxc_cabece_factura cf
        INNER JOIN cxc_deta_factura cdf ON cf.ide_cccfa = cdf.ide_cccfa
        WHERE cdf.ide_inarti = $1
        AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
            `);
        query.addIntParam(1, ide_inarti);
        const data = await this.dataSource.createSingleQuery(query);
        if (data) {
            totalClientes = Number(data.total_clientes);
        }
        return totalClientes;
    }



    async getUltimaVentaCompra(ide_inarti: number, decim_stock_inarti: number = 3) {
        const query = new SelectQuery(`
        SELECT
            -- Datos de ventas
            COUNT(DISTINCT cf.ide_cccfa) AS total_facturas,
            f_decimales(MAX(cdf.cantidad_ccdfa), ${decim_stock_inarti})::numeric AS max_cantidad_venta,
            f_decimales(MIN(cdf.cantidad_ccdfa), ${decim_stock_inarti})::numeric AS min_cantidad_venta,
            MIN(cf.fecha_emisi_cccfa) AS primera_fecha_venta,
            MAX(cf.fecha_emisi_cccfa) AS ultima_fecha_venta,
            -- Datos de compras
            f_decimales(MAX(cdp.cantidad_cpdfa), ${decim_stock_inarti})::numeric AS max_cantidad_compra,
            f_decimales(MIN(cdp.cantidad_cpdfa), ${decim_stock_inarti})::numeric AS min_cantidad_compra
        FROM
            cxc_deta_factura cdf
            INNER JOIN cxc_cabece_factura cf ON cf.ide_cccfa = cdf.ide_cccfa
            LEFT JOIN cxp_detall_factur cdp ON cdp.ide_inarti = cdf.ide_inarti
            LEFT JOIN cxp_cabece_factur cp ON cp.ide_cpcfa = cdp.ide_cpcfa
        WHERE
            cdf.ide_inarti = $1
            AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
            AND (cp.ide_cpefa = ${this.variables.get('p_cxp_estado_factura_normal')} OR cp.ide_cpefa IS NULL)
        GROUP BY
            cdf.ide_inarti
        `);
        query.addIntParam(1, ide_inarti);
        return await this.dataSource.createSingleQuery(query);
    }


    /**
     * Retorna el total de PROFORMAS mensuales de un producto en un periodo 
     * @param dtoIn 
     * @returns 
    */
    async getProformasMensuales(dtoIn: VentasMensualesDto & HeaderParamsDto) {
        if (dtoIn.periodo === 0) {
            dtoIn.periodo = getYear(new Date());
            dtoIn.ide_inarti = -1;
        }
        const query = new SelectQuery(`
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
        `, dtoIn);
        query.addStringParam(1, `${dtoIn.periodo}-01-01`);
        query.addStringParam(2, `${dtoIn.periodo}-12-31`);
        query.addIntParam(3, dtoIn.ide_inarti);
        query.addStringParam(4, `${dtoIn.periodo}-01-01`);
        query.addStringParam(5, `${dtoIn.periodo}-12-31`);
        query.addIntParam(6, dtoIn.ide_inarti);

        return await this.dataSource.createQuery(query);
    }


    async getTotalVentasPorFormaPago(dtoIn: VentasMensualesDto & HeaderParamsDto) {
        if (dtoIn.periodo === 0) {
            dtoIn.periodo = getYear(new Date());
            dtoIn.ide_inarti = -1;
        }
        const queryFormaPago = new SelectQuery(`
        SELECT
            a.ide_cndfp1,
            ${dtoIn.periodo} as periodo,
            c.nombre_cndfp,
            COUNT(1) AS num_facturas,
            SUM(b.cantidad_ccdfa) AS cantidad,
            SUM(a.total_cccfa) AS total
        FROM
            cxc_cabece_factura a
            INNER JOIN cxc_deta_factura b ON a.ide_cccfa = b.ide_cccfa
            inner join con_deta_forma_pago c on a.ide_cndfp1 = c.ide_cndfp
        WHERE
            a.fecha_emisi_cccfa >= $1
            AND a.fecha_emisi_cccfa <= $2
            AND b.ide_inarti = $3
            AND a.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
            AND a.ide_empr = ${dtoIn.ideEmpr} 
        GROUP BY
            a.ide_cndfp1,
            nombre_cndfp
        ORDER BY
            6 DESC
        LIMIT  20
        `);
        queryFormaPago.addStringParam(1, `${dtoIn.periodo}-01-01`);
        queryFormaPago.addStringParam(2, `${dtoIn.periodo}-12-31`);
        queryFormaPago.addIntParam(3, dtoIn.ide_inarti);

        return await this.dataSource.createSelectQuery(queryFormaPago);
    }


    async getTotalVentasPorIdCliente(dtoIn: VentasMensualesDto & HeaderParamsDto) {
        if (dtoIn.periodo === 0) {
            dtoIn.periodo = getYear(new Date());
            dtoIn.ide_inarti = -1;
        }
        const queryTipoId = new SelectQuery(`
        SELECT
            c.ide_getid,
            ${dtoIn.periodo} as periodo,
            nombre_getid,
            COUNT(1) AS num_facturas,
            SUM(b.cantidad_ccdfa) AS cantidad
        FROM
            cxc_cabece_factura a
            INNER JOIN cxc_deta_factura b ON a.ide_cccfa = b.ide_cccfa
            inner join gen_persona c on a.ide_geper = c.ide_geper
            inner join gen_tipo_identifi d on c.ide_getid = d.ide_getid
        WHERE
            a.fecha_emisi_cccfa >= $1
            AND a.fecha_emisi_cccfa <= $2
            AND b.ide_inarti = $3
            AND a.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
            AND a.ide_empr = ${dtoIn.ideEmpr} 
        GROUP BY
            c.ide_getid,
            nombre_getid    
        ORDER BY
            5 DESC    
        LIMIT
            20
        `);
        queryTipoId.addStringParam(1, `${dtoIn.periodo}-01-01`);
        queryTipoId.addStringParam(2, `${dtoIn.periodo}-12-31`);
        queryTipoId.addIntParam(3, dtoIn.ide_inarti);

        return await this.dataSource.createSelectQuery(queryTipoId);
    }

    async getTotalVentasPorVendedor(dtoIn: VentasMensualesDto & HeaderParamsDto) {
        if (dtoIn.periodo === 0) {
            dtoIn.periodo = getYear(new Date());
            dtoIn.ide_inarti = -1;
        }
        const queryVendedor = new SelectQuery(`
        SELECT
            a.ide_vgven,
            ${dtoIn.periodo} as periodo,
            nombre_vgven,
            COUNT(1) AS num_facturas,
            SUM(b.cantidad_ccdfa) AS cantidad,
            siglas_inuni
        FROM
            cxc_cabece_factura a
            INNER JOIN cxc_deta_factura b ON a.ide_cccfa = b.ide_cccfa
            INNER JOIN ven_vendedor c ON a.ide_vgven = c.ide_vgven
            INNER JOIN inv_articulo d ON b.ide_inarti = d.ide_inarti
            LEFT JOIN inv_unidad f ON d.ide_inuni = f.ide_inuni 
        WHERE
            a.fecha_emisi_cccfa >= $1
            AND a.fecha_emisi_cccfa <= $2
            AND b.ide_inarti = $3
            AND a.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
            AND a.ide_empr = ${dtoIn.ideEmpr} 
        GROUP BY
            a.ide_vgven,
            nombre_vgven,
            siglas_inuni
        ORDER BY
            5 DESC
        LIMIT 20     
        `);
        queryVendedor.addStringParam(1, `${dtoIn.periodo}-01-01`);
        queryVendedor.addStringParam(2, `${dtoIn.periodo}-12-31`);
        queryVendedor.addIntParam(3, dtoIn.ide_inarti);
        return await this.dataSource.createSelectQuery(queryVendedor);
    }


    /**
     * Retorna data para graficos relacionada a las ventas en un periodo
     * @param dtoIn 
     * @returns 
     */
    async chartVentasPeriodo(dtoIn: VentasMensualesDto & HeaderParamsDto) {
        // ---------------- POR VENDEDOR
        const dataTotalVendedor = await this.getTotalVentasPorVendedor(dtoIn);
        const data = dataTotalVendedor ? dataTotalVendedor[0] : {};
        const siglas_inuni = data ? data.siglas_inuni : '';

        const categoryField = "nombre_vgven";
        const seriesFields = new Map<string, string>([
            // ["Num. Facturas", "num_facturas"],
            [`Cantidad (${siglas_inuni})`, "cantidad"]
        ]);
        const barCharVendedor = formatBarChartData(dataTotalVendedor, categoryField, seriesFields)

        const pieChartVendedor = formatPieChartData(dataTotalVendedor, "nombre_vgven", "cantidad");

        // ---------------- POR FORMA DE PAGO
        const dataTotalPorFormaPago = await this.getTotalVentasPorFormaPago(dtoIn);
        const pieChartFormaPago = formatPieChartData(dataTotalPorFormaPago, "nombre_cndfp", "cantidad");

        // ---------------- POR TIPO IDENTIFICACIÓN CLIENTE
        const dataTotalPorIdClie = await this.getTotalVentasPorIdCliente(dtoIn);
        const pieChartTipoId = formatPieChartData(dataTotalPorIdClie, "nombre_getid", "cantidad");

        // ---------------- VARIACION DE INVENTARIO INGRESOS/EGRESOS POR MES
        const dataVaria = await this.getVariacionInventario(dtoIn);
        const seriesFieldsVaria = new Map<string, string>([
            [`Ingresos (${siglas_inuni})`, "ingresos"],
            [`Egresos (${siglas_inuni})`, "egresos"]
        ]);
        const barCharVaria = formatBarChartData(dataVaria, "nombre_gemes", seriesFieldsVaria)


        // ---------------- COMPRAS VS VENTAS 
        const { rows: dataVentas } = await this.getVentasMensuales(dtoIn);
        const seriesCantidadV = new Map<string, string>([
            [`Ventas (${siglas_inuni})`, "cantidad"]
        ]);
        const barCharVentas = formatBarChartData(dataVentas, "nombre_gemes", seriesCantidadV)

        const { rows: dataCompras } = await this.getComprasMensuales(dtoIn);
        const seriesCantidadC = new Map<string, string>([
            [`Compras (${siglas_inuni})`, "cantidad"]
        ]);
        const barCharCompras = formatBarChartData(dataCompras, "nombre_gemes", seriesCantidadC)

        // Unifica series
        const barCharVentComp = barCharVentas;
        barCharVentComp.series.push(barCharCompras.series[0]);

        // ---------------- PROFORMAS
        const { rows: dataProf } = await this.getProformasMensuales(dtoIn);
        const seriesCantidadP = new Map<string, string>([
            [`Proformas ${siglas_inuni}`, "cantidad"]
        ]);
        const barCharProf = formatBarChartData(dataProf, "nombre_gemes", seriesCantidadP)

        return {
            rowCount: 7,
            charts: [barCharVendedor, pieChartVendedor, pieChartFormaPago, pieChartTipoId, barCharVaria, barCharVentComp, barCharProf],
            message: 'ok'
        } as ResultQuery
    }


    /**
     * Retorna los 10 productos mas vendidos por la cantidad
     * @param dtoIn 
     * @returns 
     */
    async getTopProductosVendidos(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        const query = new SelectQuery(`
        SELECT
            iart.ide_inarti,
            upper(iart.nombre_inarti) as nombre_inarti,
            SUM(cdf.cantidad_ccdfa) AS total_cantidad,
            siglas_inuni
        FROM
            cxc_deta_factura cdf
            INNER JOIN cxc_cabece_factura cf ON cf.ide_cccfa = cdf.ide_cccfa
            INNER JOIN inv_articulo iart ON iart.ide_inarti = cdf.ide_inarti
            LEFT JOIN inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
        WHERE
            cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
            AND cf.ide_empr = ${dtoIn.ideEmpr} 
        GROUP BY
            iart.ide_inarti,
            iart.nombre_inarti,
            siglas_inuni
        ORDER BY
            total_cantidad DESC
        LIMIT 10       
        `, dtoIn);
        return await this.dataSource.createQuery(query);
    }

    /**
     * Retorna los productos mas facturados
     * @param dtoIn 
     * @returns 
     */
    async getTopProductosFacturados(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        const query = new SelectQuery(`
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
            cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
            AND cf.ide_empr = ${dtoIn.ideEmpr} 
        GROUP BY
            iart.ide_inarti,
            iart.nombre_inarti
        ORDER BY
            num_facturas  DESC
        LIMIT 10    
        `, dtoIn);
        return await this.dataSource.createQuery(query);
    }

    /**
     * Retorna data para graficos relacionada a los productos
     * @param dtoIn 
     * @returns 
     */
    async chartProductos(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        // ---------------- POR TIPO CATEGORIA
        const dataTotalProdCategoria = await this.getTotalProductosPorCategoria(dtoIn);

        const totalProductos = dataTotalProdCategoria.reduce((accumulator, item) => accumulator + item.cantidad, 0);
        const totalCategorias = dataTotalProdCategoria.length > 0 ? dataTotalProdCategoria.length - 1 : 0;

        const pieChartProdCategoria = formatPieChartData(dataTotalProdCategoria, "categoria", "cantidad");
        return {
            rowCount: 1,
            charts: [pieChartProdCategoria],
            message: 'ok',
            row: {
                totalProductos,
                totalCategorias
            }
        } as ResultQuery
    }


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
        GROUP BY 
            c.nombre_incate
        order by 2
        `);
        return await this.dataSource.createSelectQuery(query);
    }


    async getPrecioVentaProducto(dtoIn: PrecioVentaProductoDto & HeaderParamsDto) {
        const query = new SelectQuery(`
        SELECT
            precio_ultima_compra,
            fecha_ultima_compra,
            porcentaje_utilidad,
            cantidad,
            precio_venta_sin_iva,	
            porcentaje_iva,
            precio_venta_con_iva,
            valor_total_con_iva,
            utilidad
        FROM
            f_calcula_precio_venta ($1, $2);
        `);
        query.addParam(1, dtoIn.ide_inarti);
        query.addParam(2, dtoIn.cantidad);
        return await this.dataSource.createSelectQuery(query);
    }


    async generarConfigPreciosVenta(dtoIn: GeneraConfigPreciosVentaDto & HeaderParamsDto) {
        const query = new SelectQuery(`
        SELECT f_generar_config_precios($1, $2, $3, $4)`);
        query.addParam(1, dtoIn.ideEmpr);
        query.addParam(2, dtoIn.ide_inarti);
        query.addParam(3, dtoIn.fechaInicio);
        query.addParam(4, dtoIn.fechaFin);
        await this.dataSource.createSelectQuery(query);
        return { message: 'ok' };
    }


    async getConfigPreciosProducto(dtoIn: IdeDto & HeaderParamsDto) {
        const query = new SelectQuery(`
        SELECT
            ide_incpa,
            a.ide_inarti,
            rangos_incpa,
            rango1_cant_incpa,
            rango2_cant_incpa,
            siglas_inuni,
            precio_fijo_incpa,
            porcentaje_util_incpa,
            incluye_iva_incpa,
            observacion_incpa,
            activo_incpa,
            rango_infinito_incpa,
            autorizado_incpa,
            nombre_inarti,
            uuid,
            a.usuario_ingre,
            a.hora_ingre,
            a.usuario_actua,
            a.usuario_actua
        FROM
            inv_conf_precios_articulo a
            INNER JOIN inv_articulo b ON a.ide_inarti = b.ide_inarti
            LEFT JOIN inv_unidad c ON b.ide_inuni = c.ide_inuni
        WHERE
            a.ide_inarti = $1
        `, dtoIn);
        query.addParam(1, dtoIn.ide);
        return await this.dataSource.createQuery(query);
    }

}
