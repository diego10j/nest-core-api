import { Injectable, BadRequestException } from '@nestjs/common';
import { getYear } from 'date-fns';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { SearchDto } from 'src/common/dto/search.dto';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { CoreService } from 'src/core/core.service';
import { isDefined, validateDataRequiere } from 'src/util/helpers/common-util';
import { fShortDate, fDate, getDateFormatFront } from 'src/util/helpers/date-util';

import { BaseService } from '../../../../common/base-service';
import { QueryOptionsDto } from '../../../../common/dto/query-options.dto';
import { DataSourceService } from '../../../connection/datasource.service';
import { ResultQuery } from '../../../connection/interfaces/resultQuery';
import { SelectQuery } from '../../../connection/helpers/select-query';

import { AuditService } from '../../audit/audit.service';
import { IdProductoDto } from './dto/id-producto.dto';
import { TrnProductoDto } from './dto/trn-producto.dto';

import { VentasMensualesDto } from './dto/ventas-mensuales.dto';
import { PreciosProductoDto } from './dto/precios-producto.dto';

import { formatBarChartData, formatPieChartData } from '../../../../util/helpers/charts-utils';
import { UuidDto } from '../../../../common/dto/uuid.dto';

import { fNumber } from 'src/util/helpers/number-util';

import { ClientesProductoDto } from './dto/clientes-producto.dto';
import { CategoriasDto } from './dto/categorias.dto';
import { SaldoProducto } from './interfaces/productos';
import { GetSaldoProductoDto } from './dto/get-saldo.dto';

import { normalizeString } from 'src/util/helpers/sql-util';

import { GetProductoDto } from './dto/get-productos.dto';
import { InvArticulo, SaveProductoDto } from './dto/save-producto.dto';

@Injectable()
export class ProductosService extends BaseService {
  constructor(
    private readonly dataSource: DataSourceService,
    private readonly audit: AuditService,
    private readonly core: CoreService,
  ) {
    super();
    // obtiene las variables del sistema para el servicio
    this.core
      .getVariables([
        'p_inv_estado_normal', // 1
        'p_cxp_estado_factura_normal', // 0
        'p_cxc_estado_factura_normal', // 0
      ])
      .then((result) => {
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

    const dtoIn = {
      ...dto,
      module: 'inv',
      tableName: 'categoria',
      primaryKey: 'ide_incate',
      columnName: 'nombre_incate',
      columnNode: 'inv_ide_incate',
      condition: `${condition}`,
      orderBy: { column: 'nombre_incate' },
    };
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
      key: res.key,
    };
  }

  /**
   * Retorna el listado de Productos
   * @returns
   */
  async getProductos(dtoIn: GetProductoDto & HeaderParamsDto) {
    const query = this.getQueryProductos(dtoIn);
    return await this.dataSource.createQuery(query);
  }

  async getAllProductos(dtoIn: GetProductoDto & HeaderParamsDto) {
    const query = this.getQueryProductos(dtoIn);
    query.setLazy(false);
    return await this.dataSource.createSelectQuery(query);
  }

  private getQueryProductos(dtoIn: GetProductoDto & HeaderParamsDto) {
    const activeClause = dtoIn.activos ? 'and activo_inarti = true' : '';
    const query = new SelectQuery(
      `
        SELECT
            a.ide_inarti,
            a.uuid,
            a.nombre_inarti,
            nombre_incate,
            a.codigo_inarti,
            a.foto_inarti,
            UNIDAD.nombre_inuni,
            a.activo_inarti,
            otro_nombre_inarti,
            a.ide_incate,
            siglas_inuni,
            decim_stock_inarti
        FROM
            inv_articulo a
            LEFT JOIN inv_unidad UNIDAD ON a.ide_inuni = UNIDAD.ide_inuni
            LEFT JOIN inv_categoria c ON a.ide_incate  = c.ide_incate
        WHERE
            a.ide_intpr = 1 -- solo productos
            AND a.nivel_inarti = 'HIJO'
            AND a.ide_empr = ${dtoIn.ideEmpr}
            ${activeClause}
        ORDER BY
            unaccent(a.nombre_inarti)
        `,
      dtoIn,
    );
    return query;
  }

  async getCatalogoProductos(dtoIn: QueryOptionsDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
        SELECT
            ide_inarti,
            nombre_inarti,
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
            unaccent(nombre_inarti)
        `,
      dtoIn,
    );

    return await this.dataSource.createSelectQuery(query);
  }

  async searchProducto(dto: SearchDto & HeaderParamsDto) {
    const normalizedSearchValue = normalizeString(dto.value.trim());
    const sqlSearchValue = `%${normalizedSearchValue}%`;

    const query = new SelectQuery(
      `
        SELECT
            a.ide_inarti,
            a.uuid,
            a.nombre_inarti,
            c.nombre_incate,
            a.codigo_inarti,
            a.foto_inarti,
            u.nombre_inuni,
            a.activo_inarti,
            a.otro_nombre_inarti,
            a.ide_incate,
            u.siglas_inuni,
            a.decim_stock_inarti,
            COALESCE((
                SELECT f_redondeo(SUM(dci.cantidad_indci * tci.signo_intci), a.decim_stock_inarti)
                FROM inv_det_comp_inve dci
                INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                INNER JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                INNER JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                WHERE dci.ide_inarti = a.ide_inarti
                AND cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                AND cci.ide_empr = ${dto.ideEmpr}
            ), 0) AS saldo
        FROM
            inv_articulo a
            LEFT JOIN inv_unidad u ON a.ide_inuni = u.ide_inuni
            LEFT JOIN inv_categoria c ON a.ide_incate = c.ide_incate
        WHERE
            a.ide_intpr = 1 -- solo productos
            AND a.nivel_inarti = 'HIJO'
            AND a.ide_empr = ${dto.ideEmpr}
            AND a.activo_inarti = true
            AND (
                regexp_replace(unaccent(LOWER(a.nombre_inarti)), '[^a-z0-9]', '', 'g') LIKE $1
                OR regexp_replace(unaccent(LOWER(a.otro_nombre_inarti)), '[^a-z0-9]', '', 'g') LIKE $2
                OR regexp_replace(unaccent(LOWER(a.codigo_inarti)), '[^a-z0-9]', '', 'g') LIKE $3
            )
        ORDER BY
             unaccent(a.nombre_inarti)
        LIMIT ${dto.limit}
    `,
      dto,
    );

    // Añadir parámetros de búsqueda (mismo valor para los tres campos)
    query.addStringParam(1, sqlSearchValue);
    query.addStringParam(2, sqlSearchValue);
    query.addStringParam(3, sqlSearchValue);
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
            a.usuario_ingre,
            a.fecha_ingre,
            a.hora_ingre,
            a.usuario_actua,
            a.fecha_actua,
            a.hora_actua
        FROM
            inv_articulo a
            left join inv_marca b on a.ide_inmar = b.ide_inmar
            left join inv_unidad c on a.ide_inuni = c.ide_inuni
            left join inv_tipo_producto d on a.ide_intpr = d.ide_intpr
            left join inv_categoria e on a.ide_incate = e.ide_incate
            left join inv_bodega f on a.ide_inbod = f.ide_inbod
            left join inv_fabricante g on a.ide_infab = g.ide_infab
        where
            uuid = $1`);
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
            color_stock,
          },
          datos: { total_clientes, ...resUltimaVentaCompra },
        },
        message: 'ok',
      } as ResultQuery;
    } else {
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

    const query = new SelectQuery(
      `
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
                decim_stock_inarti,
                verifica_indci,
                dci.usuario_ingre,
                dci.fecha_ingre,
                dci.hora_ingre,
                dci.usuario_actua,
                dci.fecha_actua,
                dci.hora_actua
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
                (COALESCE(saldo_inicial.saldo, 0) + SUM(mov.movimiento) OVER (ORDER BY mov.fecha_trans_incci, mov.ide_indci)) AS SALDO,
                mov.verifica_indci,
                mov.usuario_ingre,
                mov.fecha_ingre,
                mov.hora_ingre,
                mov.usuario_actua,
                mov.fecha_actua,
                mov.hora_actua
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
                saldo_inicial.saldo AS SALDO,
                false as verifica_indci,
                null as usuario_ingre,
                null as fecha_ingre,
                null as hora_ingre,
                null as usuario_actua,
                null as fecha_actua,
                null as hora_actua
            FROM
                saldo_inicial
        )
        SELECT *
        FROM saldo_movimientos
        ORDER BY fecha_trans_incci, ide_indci 
        `,
      dtoIn,
    );
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
    const whereCantidad = dtoIn.cantidad
      ? `AND ABS(cantidad_ccdfa - ${dtoIn.cantidad}) <= 0.3 * ${dtoIn.cantidad} `
      : '';

    const query = new SelectQuery(
      `
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
            cf.fecha_emisi_cccfa desc, secuencial_cccfa desc`,
      dtoIn,
    );
    query.addIntParam(1, dtoIn.ide_inarti);
    query.addParam(2, dtoIn.fechaInicio);
    query.addParam(3, dtoIn.fechaFin);
    return await this.dataSource.createQuery(query);
  }

  async getVentasProductoUtilidad(dtoIn: PreciosProductoDto & HeaderParamsDto) {
    // Ajustar el porcentaje según  criterio 30% margen
    const whereCantidad = dtoIn.cantidad
      ? `WHERE ABS(cantidad_ccdfa - ${dtoIn.cantidad}) <= 0.3 * ${dtoIn.cantidad} `
      : '';

    const query = new SelectQuery(
      `
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
            `,
      dtoIn,
    );
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
    };
    // Filtrar los datos por cantidad
    const margin = 0.2; // 20% de margen
    if (res.rowCount > 0 && dtoIn.cantidad) {
      const filteredSales = res.rows.filter(
        (sale) => Math.abs(sale.cantidad_ccdfa - dtoIn.cantidad) <= margin * dtoIn.cantidad,
      );

      // Encontrar precios minimos y maximos
      const precios_venta = filteredSales.map((sale) => sale.precio_venta);
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
        precio_sugerido: Number(fNumber(precio_sugerido)),
      };
    }

    return res;
  }

  /**
   * Retorna las facturas de compras de un producto determinado en un rango de fechas
   * @param dtoIn
   * @returns
   */
  async getComprasProducto(dtoIn: TrnProductoDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
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
        cf.fecha_emisi_cpcfa desc, numero_cpcfa`,
      dtoIn,
    );
    query.addIntParam(1, dtoIn.ide_inarti);
    query.addParam(2, dtoIn.fechaInicio);
    query.addParam(3, dtoIn.fechaFin);
    return await this.dataSource.createQuery(query);
  }

  /**
   * Retorna los últimos precios de compra a PROVEEDORES de un producto determinado
   * @param dtoIn
   * @returns
   */
  async getUltimosPreciosCompras(dtoIn: IdProductoDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
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
        `,
      dtoIn,
    );
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
    const paramValue = dtoIn.ide_inarti || dtoIn.uuid;
    if (!paramValue) {
      throw new Error('Se requiere ide_inarti o uuid en el DTO de entrada');
    }

    const whereClause = dtoIn.ide_inarti ? 'iart.ide_inarti = $1' : 'iart.uuid = $1';

    const query = new SelectQuery(`     
            WITH
            compras_periodo AS (
                SELECT
                    d.ide_inarti,
                    c.fecha_trans_incci,
                    d.precio_indci
                FROM inv_det_comp_inve d
                JOIN inv_cab_comp_inve c ON d.ide_incci = c.ide_incci
                JOIN inv_tip_tran_inve t ON c.ide_intti = t.ide_intti
                JOIN inv_tip_comp_inve e ON t.ide_intci = e.ide_intci
                WHERE
                    c.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                    AND e.signo_intci = 1
                    AND d.precio_indci > 0
                    AND c.ide_intti IN (19, 16, 3025)
                    AND c.ide_empr = ${dtoIn.ideEmpr}
                ORDER BY c.fecha_trans_incci DESC
            )
            SELECT 
                iart.ide_inarti,
                nombre_inarti,
                f_redondeo(SUM(cantidad_indci * signo_intci), decim_stock_inarti) AS saldo,
                siglas_inuni,
                decim_stock_inarti,
                iart.cant_stock1_inarti AS stock_minimo,
                iart.cant_stock2_inarti AS stock_ideal,
                (SELECT cp.fecha_trans_incci FROM compras_periodo cp 
                 WHERE cp.ide_inarti = iart.ide_inarti LIMIT 1) AS ultima_fecha_compra,
                (SELECT cp.precio_indci FROM compras_periodo cp 
                 WHERE cp.ide_inarti = iart.ide_inarti LIMIT 1) AS ultimo_precio_compra,
                CASE
                    WHEN COALESCE(SUM(cantidad_indci * signo_intci), 0) <= 0 THEN 'SIN STOCK'
                    WHEN iart.cant_stock1_inarti IS NULL AND iart.cant_stock2_inarti IS NULL THEN 'EN STOCK'
                    WHEN COALESCE(SUM(cantidad_indci * signo_intci), 0) > COALESCE(iart.cant_stock2_inarti, 0) THEN 'STOCK EXTRA'
                    WHEN COALESCE(SUM(cantidad_indci * signo_intci), 0) = COALESCE(iart.cant_stock2_inarti, 0) THEN 'STOCK IDEAL'
                    WHEN COALESCE(SUM(cantidad_indci * signo_intci), 0) BETWEEN 
                         COALESCE(iart.cant_stock1_inarti, 0) AND COALESCE(iart.cant_stock2_inarti, 0) THEN 'STOCK ÓPTIMO'
                    WHEN COALESCE(SUM(cantidad_indci * signo_intci), 0) < COALESCE(iart.cant_stock1_inarti, 0) THEN 'STOCK BAJO'
                    ELSE 'EN STOCK'
                END AS detalle_stock
            FROM
                inv_det_comp_inve dci
                INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                INNER JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                INNER JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                INNER JOIN inv_articulo iart ON iart.ide_inarti = dci.ide_inarti
                LEFT JOIN inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
            WHERE
                ${whereClause}
                AND cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                AND cci.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY   
                iart.ide_inarti, nombre_inarti, siglas_inuni, decim_stock_inarti,
                iart.cant_stock1_inarti, iart.cant_stock2_inarti
        `);

    query.addParam(1, paramValue);
    return (await this.dataSource.createSingleQuery(query)) as SaldoProducto;
  }

  /**
   * Retorna el saldo de un producto por bodega
   * @param dtoIn
   * @returns
   */
  async getSaldoPorBodega(dtoIn: IdProductoDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `     
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
        `,
      dtoIn,
    );
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
   * Retorna la sumatoria de total ventas / compras en un periodo
   * @param dtoIn
   * @returns
   */
  async getSumatoriaTrnPeriodo(dtoIn: VentasMensualesDto & HeaderParamsDto) {
    if (dtoIn.periodo === 0) {
      dtoIn.periodo = getYear(new Date());
      dtoIn.ide_inarti = -1;
    }
    const query = new SelectQuery(
      `
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
        `,
      dtoIn,
    );
    query.addIntParam(1, dtoIn.ide_inarti);
    query.addStringParam(2, `${dtoIn.periodo}-01-01`);
    query.addStringParam(3, `${dtoIn.periodo}-12-31`);
    query.addIntParam(4, dtoIn.ide_inarti);
    query.addStringParam(5, `${dtoIn.periodo}-01-01`);
    query.addStringParam(6, `${dtoIn.periodo}-12-31`);

    const data = await this.dataSource.createSelectQuery(query);
    if (data.length === 0) {
      data.push({
        unidad: '',
        fact_ventas: '0',
        cantidad_ventas: '0',
        total_ventas: '0',
        fact_compras: '0',
        cantidad_compras: '0',
        total_compras: '0',
        margen: '0',
      });
    }

    return {
      rows: data,
      rowCount: data.length,
    } as ResultQuery;
  }

  async getProveedores(dtoIn: IdProductoDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
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
        `,
      dtoIn,
    );
    query.addIntParam(1, dtoIn.ide_inarti);

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
    const query = new SelectQuery(
      `
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
        `,
      dtoIn,
    );
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
                ven.ide_vgven,
                p.activo_geper,
                p.identificac_geper,
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
                ven.ide_vgven,
                p.activo_geper,
                p.identificac_geper,
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
        cu.ide_vgven,
        cu.activo_geper,
        cu.identificac_geper,
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
    const query = new SelectQuery(
      `
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

        `,
      dtoIn,
    );
    query.addIntParam(1, dtoIn.ide_inarti);
    const res = await this.dataSource.createSelectQuery(query);
    let charts = [];
    if (res) {
      // Obtener el total (precio del último registro)
      const total = res[res.length - 1].precio;

      // Obtener el percent (porcentaje_variacion del último registro)
      const percent = res[res.length - 1].porcentaje_variacion;

      // Formatear las fechas para las categorías en el formato 'Ene 2023'
      const categories = res.map((row) => fShortDate(row.fecha));

      // Obtener los precios para la serie
      const series = [
        {
          data: res.map((row) => row.precio),
        },
      ];
      charts = [
        {
          total,
          percent,
          categories,
          series,
        },
      ];
    }

    return {
      rowCount: charts.length,
      charts,
      message: 'ok',
    } as ResultQuery;
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

    return (await this.dataSource.createSingleQuery(querySaldoInicial)) as SaldoProducto;
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
   * Guarda una producto nueva o actualiza uno existente
   */
  async saveProducto(dtoIn: SaveProductoDto & HeaderParamsDto) {
    const module = 'inv';
    const tableName = 'articulo';
    const primaryKey = 'ide_inarti';
    if (dtoIn.isUpdate === true) {
      // Actualiza
      const isValid = await this.validateUpdateProducto(dtoIn.data, dtoIn.ideEmpr);
      if (isValid) {
        const ide_inarti = dtoIn.data.ide_inarti;
        // delete dtoIn.data.ide_inarti;
        // delete dtoIn.data.uuid;
        const objQuery = {
          operation: 'update',
          module,
          tableName,
          primaryKey,
          object: dtoIn.data,
          condition: `ide_inarti = ${ide_inarti}`,
        } as ObjectQueryDto;
        return await this.core.save({
          ...dtoIn,
          listQuery: [objQuery],
          audit: false,
        });
      }
    } else {
      // Inserta
      const isValid = await this.validateCreateProducto(dtoIn.data, dtoIn.ideEmpr);
      if (isValid === true) {
        const objQuery = {
          operation: 'insert',
          module,
          tableName,
          primaryKey,
          object: dtoIn.data,
        } as ObjectQueryDto;
        return await this.core.save({
          ...dtoIn,
          listQuery: [objQuery],
          audit: true,
        });
      }
    }
  }

  private async validateCreateProducto(data: InvArticulo, ideEmpr: number) {
    const colReq = ['ide_inarti', 'nombre_inarti', 'nivel_inarti', 'activo_inarti', 'ide_incate', 'ide_intpr'];

    const resColReq = validateDataRequiere(data, colReq);

    if (resColReq.length > 0) {
      throw new BadRequestException(resColReq);
    }

    // validar que el nombre del producto no exista
    const queryClie = new SelectQuery(`
        select
            1
        from
            inv_articulo
        where
            nombre_inarti = $1
        and ide_empr = $2
        `);
    queryClie.addParam(1, data.nombre_inarti);
    queryClie.addParam(2, ideEmpr);
    const resClie = await this.dataSource.createSelectQuery(queryClie);
    console.log(resClie);
    if (resClie.length > 0) {
      throw new BadRequestException(`Otro producto ya existe con el nombre ${data.nombre_inarti}`);
    }

    return true;
  }

  private async validateUpdateProducto(data: InvArticulo, ideEmpr: number) {
    const colReq = ['ide_inarti'];

    const resColReq = validateDataRequiere(data, colReq);

    if (resColReq.length > 0) {
      throw new BadRequestException(resColReq);
    }

    // Validar que venga al menos un campo además del ID
    const providedFields = Object.keys(data).filter(
      (key) => key !== 'ide_inarti' && data[key] !== undefined && data[key] !== null,
    );
    if (providedFields.length === 0) {
      throw new BadRequestException('Debe proporcionar al menos un campo para actualizar además del ID');
    }

    // validar que el cliente exista
    const queryClieE = new SelectQuery(`
        select
            1
        from
            inv_articulo
        where
            ide_inarti = $1
        and ide_empr = $2
        `);
    queryClieE.addParam(1, data.ide_inarti);
    queryClieE.addParam(2, ideEmpr);

    const resClieE = await this.dataSource.createSelectQuery(queryClieE);
    if (resClieE.length === 0) {
      throw new BadRequestException(`El producto ${data.ide_inarti} no existe`);
    }

    if (isDefined(data.nombre_inarti)) {
      // validar que el nombre del producto no exista
      const queryClie = new SelectQuery(`
            select
                1
            from
                inv_articulo
            where
            nombre_inarti = $1
            and ide_empr = $2
            and ide_inarti != $3
            `);
      queryClie.addParam(1, data.nombre_inarti);
      queryClie.addParam(2, ideEmpr);
      queryClie.addParam(3, data.ide_inarti);
      const resClie = await this.dataSource.createSelectQuery(queryClie);
      console.log(resClie);
      if (resClie.length > 0) {
        throw new BadRequestException(`Otro producto ya existe con el nombre ${data.nombre_inarti}`);
      }
    }

    return true;
  }


  async getLotesProducto(dtoIn: IdProductoDto & HeaderParamsDto) {

    const query = new SelectQuery(
      `
       SELECT 
            a.ide_inlot,
                a.lote_inlot,
                a.fecha_ingreso_inlot,
                a.fecha_caducidad_inlot,
                a.pais_inlot,
                a.peso_inlot,
                a.peso_tara_inlot,
                a.diferencia_peso_inlot,
                b.cantidad_indci,
                siglas_inuni,
                a.usuario_verif_inlot,
                a.fecha_verif_inlot,
                a.verificado_inlot,
                a.usuario_ingre,
                a.observacion_inlot,
                a.archivo1_inlot,
                a.archivo2_inlot,
                a.archivo3_inlot,
                a.fecha_ingre,
                a.usuario_actua,
                a.fecha_actua,
          e.nom_geper,
          f.numero_cpcfa,
          f.ide_cpcfa
      FROM inv_lote a
      inner join inv_det_comp_inve b on a.ide_indci_ingreso = b.ide_indci
      inner join inv_articulo c on b.ide_inarti = c.ide_inarti
      LEFT JOIN inv_unidad h ON c.ide_inuni = h.ide_inuni
      inner join inv_cab_comp_inve d on b.ide_incci = d.ide_incci
      inner join gen_persona e on d.ide_geper = e.ide_geper
      left join  cxp_cabece_factur f on b.ide_cpcfa = f.ide_cpcfa
      where b.ide_inarti = $1
      and a.activo_inlot = true
      order by fecha_ingreso_inlot desc
        `,
      dtoIn,
    );
    query.addParam(1, dtoIn.ide_inarti);
    return await this.dataSource.createQuery(query);
  }

}
