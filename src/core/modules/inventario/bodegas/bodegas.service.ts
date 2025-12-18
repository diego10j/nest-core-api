import { BadRequestException, Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { IdeDto } from 'src/common/dto/ide.dto';
import { ResultQuery } from 'src/core/connection/interfaces/resultQuery';
import { fDate } from 'src/util/helpers/date-util';

import { BaseService } from '../../../../common/base-service';
import { QueryOptionsDto } from '../../../../common/dto/query-options.dto';
import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery } from '../../../connection/helpers/select-query';
import { CoreService } from '../../../core.service';
import { GeneraConteoInvDto } from './dto/genera-conteo-inv.dto';
import { GetConteosInventarioDto } from './dto/get-conteos-inv.dto';
import { GetDetallesConteoDto } from './dto/get-detalles-conteo.dto';

import { MovimientosBodegaDto } from './dto/mov-bodega.dto';
import { MovimientosInvDto } from './dto/movimientos-inv.dto';
import { RegistrarConteoFisicoDto } from './dto/registrar-conteo.dto';
import { StockProductosDto } from './dto/stock-productos.dto';

@Injectable()
export class BodegasService extends BaseService {
  constructor(
    private readonly dataSource: DataSourceService,
    private readonly core: CoreService,
  ) {
    super();
    // obtiene las variables del sistema para el servicio
    this.core
      .getVariables([
        'p_inv_estado_normal', // 1
      ])
      .then((result) => {
        this.variables = result;
      });
  }

  /**
   * Retorna listado de bodegas de la empresa
   * @returns
   */
  async getBodegas(dtoIn?: QueryOptionsDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
        select
            ide_inbod,
            nombre_inbod,
            nombre_geprov,
            nombre_gecant,
            activo_inbod,
            a.hora_ingre
        from
            inv_bodega a
            left join gen_provincia b on a.ide_geprov = b.ide_geprov
            left join gen_canton c on a.ide_gecant = c.ide_gecant
        where
            nivel_inbod = 'HIJO'
            and ide_empr = $1
        order by
            nombre_inbod
    `,
      dtoIn,
    );
    query.addIntParam(1, dtoIn.ideEmpr);
    return await this.dataSource.createQuery(query);
  }

  /**
   * Retorna una bodega
   * @param dto
   * @returns
   */
  async getBodega(dto: IdeDto & HeaderParamsDto) {
    const dtoIn = {
      ...dto,
      module: 'inv',
      tableName: 'bodega',
      primaryKey: 'ide_inbod',
      condition: `ide_inbod = ${dto.ide}`,
    };
    return this.core.getTableQuery(dtoIn);
  }

  /**
   * Retorna los movimientos de inventario en todas las bodegas en un rango de fechas
   * @param dtoIn
   * @returns
   */
  async getMovimientos(dtoIn: MovimientosInvDto & HeaderParamsDto) {
    const condBodega = dtoIn.ide_inbod ? 'AND a.ide_inbod = $4' : '';
    const query = new SelectQuery(
      `
    select
        a.ide_incci,
        a.numero_incci,
        a.fecha_trans_incci,
        c.nombre_inbod,
        d.nombre_intti,
        g.nombre_inarti,
        case
            when signo_intci = 1 THEN b.cantidad_indci
        end as INGRESO,
        case
            when signo_intci = -1 THEN b.cantidad_indci
        end as EGRESO,
        siglas_inuni,
        f.nom_geper,
        a.observacion_incci,
        a.ide_cnccc,
        a.usuario_ingre,
        g.uuid,
        a.ide_inbod,
        f.uuid as uuid_per
    from
        inv_cab_comp_inve a
        inner join inv_det_comp_inve b on a.ide_incci = b.ide_incci
        inner join inv_bodega c on a.ide_inbod = c.ide_inbod
        inner join inv_tip_tran_inve d on a.ide_intti = d.ide_intti
        inner join inv_tip_comp_inve e on d.ide_intci = e.ide_intci
        inner join gen_persona f on a.ide_geper = f.ide_geper
        inner join inv_articulo g on b.ide_inarti = g.ide_inarti
        LEFT JOIN inv_unidad h ON g.ide_inuni = h.ide_inuni
    where
        a.ide_inepi = ${this.variables.get('p_inv_estado_normal')} 
        and fecha_trans_incci BETWEEN $1 AND $2
        and hace_kardex_inarti = true
        and a.ide_empr = $3
        ${condBodega}
        order by  fecha_trans_incci desc, ide_incci desc
        `,
      dtoIn,
    );

    query.addParam(1, dtoIn.fechaInicio);
    query.addParam(2, dtoIn.fechaFin);
    query.addIntParam(3, dtoIn.ideEmpr);
    if (dtoIn.ide_inbod) {
      query.addIntParam(4, dtoIn.ide_inbod);
    }
    return await this.dataSource.createQuery(query);
  }

  /**
   * Retorna los movimientos de inventario de una bodega en un rango de fechas
   * @param dtoIn
   * @returns
   */
  async getMovimientosBodega(dtoIn: MovimientosBodegaDto & HeaderParamsDto) {
    return await this.getMovimientos(dtoIn);
  }

  /**
   * Retorna el listado de Stock de Productos
   * @returns
   */
  async getStockProductos(dtoIn: StockProductosDto & HeaderParamsDto) {
    let nombre_inbod = '';
    // Obtiene nombre de las bodegas consultadas
    if (dtoIn.ide_inbod) {
      const queryBod = new SelectQuery(`
            SELECT STRING_AGG(nombre_inbod, ', ') AS nombre_inbod
            FROM inv_bodega bod
            WHERE ide_inbod = ANY ($1)`);
      queryBod.addParam(1, dtoIn.ide_inbod);
      const res = await this.dataSource.createSingleQuery(queryBod);
      nombre_inbod = res.nombre_inbod;
    }

    const fechaCorte = dtoIn.fechaCorte ? dtoIn.fechaCorte : new Date();
    const conditionStock = dtoIn.onlyStock === true ? 'AND COALESCE(existencia_cte.existencia, 0) > 0 ' : '';
    const conditionBodega = dtoIn.ide_inbod ? `AND cci.ide_inbod = ANY($2)` : '';

    const query = new SelectQuery(
      `
        WITH existencia_cte AS (
            SELECT
                dci.ide_inarti,
                SUM(cantidad_indci * signo_intci) AS existencia                
            FROM
                inv_det_comp_inve dci
                INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                LEFT JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                LEFT JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
            WHERE
                ide_inepi = ${this.variables.get('p_inv_estado_normal')} 
                AND dci.ide_empr = ${dtoIn.ideEmpr}
                ${conditionBodega}
                AND fecha_trans_incci <= $1
            GROUP BY
                dci.ide_inarti
        )
        SELECT
            ARTICULO.ide_inarti,
            ARTICULO.uuid,
            ARTICULO.nombre_inarti,
            nombre_incate,
            ARTICULO.codigo_inarti,
            ARTICULO.decim_stock_inarti,
            COALESCE(f_redondeo(existencia_cte.existencia, ARTICULO.decim_stock_inarti) , 0) AS saldo,
            UNIDAD.siglas_inuni,            
            -- Calcular detalle_stock
            CASE
                WHEN COALESCE(existencia_cte.existencia, 0) <= 0 THEN 'SIN STOCK'
                WHEN ARTICULO.cant_stock1_inarti IS NULL AND ARTICULO.cant_stock2_inarti IS NULL THEN 'EN STOCK'
                WHEN COALESCE(existencia_cte.existencia, 0) > COALESCE(ARTICULO.cant_stock2_inarti, 0) THEN 'STOCK EXTRA'
                WHEN COALESCE(existencia_cte.existencia, 0) = COALESCE(ARTICULO.cant_stock2_inarti, 0) THEN 'STOCK IDEAL'
                WHEN COALESCE(existencia_cte.existencia, 0) BETWEEN COALESCE(ARTICULO.cant_stock1_inarti, 0) AND COALESCE(ARTICULO.cant_stock2_inarti, 0) THEN 'STOCK ÓPTIMO'
                WHEN COALESCE(existencia_cte.existencia, 0) < COALESCE(ARTICULO.cant_stock1_inarti, 0) THEN 'STOCK BAJO'
                ELSE 'EN STOCK'
            END AS detalle_stock,    
            -- Calcular color_stock
            CASE
                WHEN COALESCE(existencia_cte.existencia, 0) <= 0 THEN 'error.main'
                WHEN COALESCE(existencia_cte.existencia, 0) < COALESCE(ARTICULO.cant_stock1_inarti, 0) THEN 'warning.main'
                ELSE 'success.main'
            END AS color_stock,
            ARTICULO.cant_stock1_inarti AS stock_minimo,
            ARTICULO.cant_stock2_inarti AS stock_ideal,
            '${fDate(fechaCorte)}' AS fecha_corte,
            '${nombre_inbod}' as nombre_inbod,
            otro_nombre_inarti,
             ARTICULO.ide_incate
        FROM
            inv_articulo ARTICULO
            LEFT JOIN inv_unidad UNIDAD ON ARTICULO.ide_inuni = UNIDAD.ide_inuni
            LEFT JOIN inv_marca m ON ARTICULO.ide_inmar = m.ide_inmar
            LEFT JOIN existencia_cte ON ARTICULO.ide_inarti = existencia_cte.ide_inarti
            LEFT JOIN inv_categoria c ON ARTICULO.ide_incate = c.ide_incate
        WHERE
            ARTICULO.ide_intpr = 1 -- solo productos
            AND ARTICULO.nivel_inarti = 'HIJO'
            AND hace_kardex_inarti = true
            AND ARTICULO.ide_empr = ${dtoIn.ideEmpr}
            AND activo_inarti = true
            ${conditionStock} -- Filtro de existencia mayor a 0
        ORDER BY
            nombre_incate, ARTICULO.nombre_inarti
        `,
      dtoIn,
    );

    query.addParam(1, fechaCorte);
    if (dtoIn.ide_inbod) {
      query.addParam(2, dtoIn.ide_inbod);
    }
    return await this.dataSource.createQuery(query);
  }

  // ==================================ListData==============================
  /**
   * Retorna las bodegas activas de la empresa
   * @returns
   */
  async getListDataBodegas(dto?: QueryOptionsDto & HeaderParamsDto) {
    const dtoIn = {
      ...dto,
      module: 'inv',
      tableName: 'bodega',
      primaryKey: 'ide_inbod',
      columnLabel: 'nombre_inbod',
      condition: `ide_empr = ${dto.ideEmpr} and activo_inbod = true`,
    };
    return this.core.getListDataValues(dtoIn);
  }

  async getListDataDetalleStock(_dto?: QueryOptionsDto & HeaderParamsDto) {
    return [
      {
        value: 1,
        label: 'EN STOCK',
      },
      {
        value: 2,
        label: 'STOCK EXTRA',
      },
      {
        value: 3,
        label: 'STOCK IDEAL',
      },
      {
        value: 4,
        label: 'STOCK ÓPTIMO',
      },
      {
        value: 5,
        label: 'STOCK BAJO',
      },
      {
        value: 6,
        label: 'SIN STOCK',
      },
    ];
  }

  /**
   * Genera registros para conteo de inventario
   * @param dtoIn 
   * @returns 
   */
  async generarConteoInventario(dtoIn: GeneraConteoInvDto & HeaderParamsDto) {
    try {
      const query = new SelectQuery(
        `
      SELECT * FROM f_genera_conteo_inventario(
        p_ide_inbod := $1,
        p_fecha_corte_desde := $2,
        p_fecha_corte := $3,
        p_ide_usua := $4,
        p_ide_empr := $5,
        p_ide_sucu := $6,
        p_observacion := $7
      )
        `,
        dtoIn,
      );

      query.addParam(1, dtoIn.ide_inbod);
      query.addParam(2, dtoIn.fechaInicioCorte);
      query.addParam(3, dtoIn.fechaCorte);
      query.addIntParam(4, dtoIn.ideUsua);
      query.addIntParam(5, dtoIn.ideEmpr);
      query.addIntParam(6, dtoIn.ideSucu);
      query.addParam(7, dtoIn.observacion);

      const rows = await this.dataSource.createSelectQuery(query);
      return {
        rowCount: rows.length,
        data: rows,
        message: 'ok',
      } as ResultQuery;
    } catch (error) {
      console.log(error.message);
      throw new BadRequestException(`${error.message}`);
    }

  }


  async registrarConteoFisico(dtoIn: RegistrarConteoFisicoDto & HeaderParamsDto) {
    try {
      const query = new SelectQuery(
        `
        SELECT * FROM f_registrar_conteo_fisico(
          p_ide_indcf := $1,
          p_cantidad_contada := $2,
          p_observacion := $3,
          p_usuario_conteo := $4
      )
        `,
        dtoIn,
      );
      query.addParam(1, dtoIn.ide_indcf);
      query.addParam(2, dtoIn.cantidadContada);
      query.addParam(3, dtoIn.observacion);
      query.addParam(4, dtoIn.login);
      const rows = await this.dataSource.createSelectQuery(query);
      return {
        rowCount: rows.length,
        data: rows,
        message: 'ok',
      } as ResultQuery;
    } catch (error) {
      console.log(error.message);
      throw new BadRequestException(`${error.message}`);
    }

  }


  async registrarReconteoFisico(dtoIn: RegistrarConteoFisicoDto & HeaderParamsDto) {
    try {
      const query = new SelectQuery(
        `
        SELECT * FROM f_registrar_reconteo_fisico(
          p_ide_indcf := $1,
          p_cantidad_recontada := $2,
          p_observacion := $3,
          p_usuario_reconteo := $4
      )
        `,
        dtoIn,
      );
      query.addParam(1, dtoIn.ide_indcf);
      query.addParam(2, dtoIn.cantidadContada);
      query.addParam(3, dtoIn.observacion);
      query.addParam(4, dtoIn.login);
      const rows = await this.dataSource.createSelectQuery(query);
      return {
        rowCount: rows.length,
        data: rows,
        message: 'ok',
      } as ResultQuery;
    } catch (error) {
      console.log(error.message);
      throw new BadRequestException(`${error.message}`);
    }

  }


  /**
   * Retorna listado de conteos en una bodega en un rango de fechas
   * @param dtoIn 
   * @returns 
   */
  async getConteosInventario(dtoIn: GetConteosInventarioDto & HeaderParamsDto) {
    // Filtro de estados (array opcional de IDs)

    const conditionBodega = dtoIn.ide_inbod ? `AND cc.ide_inbod = ${dtoIn.ide_inbod}` : '';

    let condEstados = '';
    if (dtoIn.ide_inec && dtoIn.ide_inec.length > 0) {
      condEstados = `AND cc.ide_inec = ANY($3)`;
    }



    const query = new SelectQuery(
      `
      SELECT
          -- Identificación del conteo
          cc.ide_inccf,
          cc.secuencial_inccf,
          
          -- Bodega
          b.nombre_inbod,
          b.ide_inbod,
          
          -- Tipo de conteo
          tc.nombre_intc,
          tc.tolerancia_porcentaje_intc,
          
          -- Estado del conteo
          ec.ide_inec,
          ec.codigo_inec,
          ec.nombre_inec,
          
          -- Fechas importantes
          cc.fecha_corte_inccf,
          cc.fecha_ini_conteo_inccf,
          cc.fecha_fin_conteo_inccf,
          cc.fecha_cierre_inccf,
          
          -- Estadísticas del conteo (de la cabecera)
          cc.productos_estimados_inccf,
          cc.productos_contados_inccf,
          cc.productos_con_diferencia_inccf,
          cc.productos_ajustados_inccf,
          cc.valor_total_corte_inccf,
          cc.valor_total_fisico_inccf,
          cc.valor_total_diferencias_inccf,
          cc.porcentaje_exactitud_inccf,
          cc.porcentaje_avance_inccf,
          
          -- Observaciones y motivos
          cc.observacion_inccf,
          cc.motivo_cancelacion_inccf,
          
          -- Información de reconteo (si aplica)
          cc.es_reconteo_inccf,
          cc.conteo_numero_inccf,
          
          -- Auditoría
          cc.usuario_ingre,
          cc.fecha_ingre,
          cc.usuario_actua,
          cc.fecha_actua
          
      FROM inv_cab_conteo_fisico cc
      INNER JOIN inv_bodega b ON cc.ide_inbod = b.ide_inbod
      INNER JOIN inv_tipo_conteo tc ON cc.ide_intc = tc.ide_intc
      INNER JOIN inv_estado_conteo ec ON cc.ide_inec = ec.ide_inec
      
      WHERE cc.activo_inccf = true
          AND cc.fecha_corte_inccf BETWEEN $1 AND $2
          ${conditionBodega}
          AND cc.ide_empr = ${dtoIn.ideEmpr}
          ${condEstados}
          
      ORDER BY 
          cc.ide_inbod,
          cc.fecha_corte_inccf DESC,
          cc.secuencial_inccf DESC
      `,
      dtoIn,
    );

    // Parámetros base
    query.addParam(1, dtoIn.fechaInicio);
    query.addParam(2, dtoIn.fechaFin);

    // Parámetros de estados (si existen)
    if (dtoIn.ide_inec && dtoIn.ide_inec.length > 0) {
      query.addParam(3, dtoIn.ide_inec);
    }

    return await this.dataSource.createQuery(query);
  }



  async getDetalleConteo(dtoIn: GetDetallesConteoDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
      SELECT
          -- Cabecera del conteo
          cc.ide_inccf,
          cc.secuencial_inccf,
          cc.fecha_corte_inccf,
          cc.fecha_ini_conteo_inccf,
          cc.fecha_fin_conteo_inccf,
          cc.fecha_cierre_inccf,
          cc.observacion_inccf,
          cc.productos_estimados_inccf,
          cc.productos_contados_inccf,
          cc.productos_con_diferencia_inccf,
          cc.productos_ajustados_inccf,
          cc.porcentaje_avance_inccf,
          
          -- Bodega
          b.nombre_inbod,
          
          -- Tipo de conteo
          tc.nombre_intc,
          tc.tolerancia_porcentaje_intc,
          
          -- Estado
          ec.codigo_inec,
          ec.nombre_inec,
          
          -- Detalles de artículos
          d.ide_indcf,
          d.ide_inarti,
          a.codigo_inarti,
          a.nombre_inarti,
          u.siglas_inuni,
          d.saldo_corte_indcf,
          d.cantidad_fisica_indcf,
          d.saldo_conteo_indcf,
          d.fecha_conteo_indcf,
          d.usuario_conteo_indcf,
          d.estado_item_indcf,
          d.requiere_ajuste_indcf,
          
          -- Cálculos
          (d.cantidad_fisica_indcf - d.saldo_corte_indcf) as diferencia_cantidad,
          CASE 
              WHEN d.saldo_corte_indcf = 0 THEN 
                  CASE WHEN d.cantidad_fisica_indcf = 0 THEN 0 ELSE 100 END
              ELSE 
                  ABS(d.cantidad_fisica_indcf - d.saldo_corte_indcf) / d.saldo_corte_indcf * 100 
          END as porcentaje_diferencia,
          
          -- Costo y valor
          d.costo_unitario_indcf,
          (d.cantidad_fisica_indcf - d.saldo_corte_indcf) * d.costo_unitario_indcf as valor_diferencia_calculado,
          
          -- Reconteo (si aplica)
          d.cantidad_reconteo_indcf,
          d.numero_reconteos_indcf,
          d.fecha_reconteo_indcf,
          d.usuario_reconteo_indcf,
          d.motivo_diferencia_indcf,
          d.observacion_indcf
          
      FROM inv_cab_conteo_fisico cc
      INNER JOIN inv_bodega b ON cc.ide_inbod = b.ide_inbod
      INNER JOIN inv_tipo_conteo tc ON cc.ide_intc = tc.ide_intc
      INNER JOIN inv_estado_conteo ec ON cc.ide_inec = ec.ide_inec
      INNER JOIN inv_det_conteo_fisico d ON cc.ide_inccf = d.ide_inccf
      INNER JOIN inv_articulo a ON d.ide_inarti = a.ide_inarti
      LEFT JOIN inv_unidad u ON a.ide_inuni = u.ide_inuni
      
      WHERE cc.ide_inccf = $1
          AND cc.activo_inccf = true
          AND d.activo_indcf = true
      
      ORDER BY 
          a.nombre_inarti
      `,
      dtoIn
    );

    query.addIntParam(1, dtoIn.ide_inccf);

    return await this.dataSource.createQuery(query);
  }



  async getEstadisticasConteos(dtoIn: GetConteosInventarioDto & HeaderParamsDto) {
    const condBodega = dtoIn.ide_inbod ? `AND ide_inbod = ${dtoIn.ide_inbod}` : '';

    const query = new SelectQuery(
      `
      WITH conteos_ultimo_mes AS (
          SELECT 
              ide_inccf,
              ide_inec,
              ide_inbod,
              productos_contados_inccf,
              productos_estimados_inccf,
              productos_con_diferencia_inccf,
              valor_total_diferencias_inccf,
              fecha_corte_inccf
          FROM inv_cab_conteo_fisico
          WHERE activo_inccf = true
              AND fecha_corte_inccf BETWEEN $1 AND $2
              ${condBodega}
      )
      
      SELECT
          -- Conteos por estado
          (SELECT COUNT(*) FROM inv_cab_conteo_fisico 
           WHERE activo_inccf = true  ${condBodega}) as total_conteos,
          
          -- Conteos por estado
          (SELECT COUNT(*) FROM inv_cab_conteo_fisico 
           WHERE ide_inec = 1 AND activo_inccf = true  ${condBodega}) as conteos_pendientes,
          (SELECT COUNT(*) FROM inv_cab_conteo_fisico 
           WHERE ide_inec = 2 AND activo_inccf = true  ${condBodega}) as conteos_en_proceso,
          (SELECT COUNT(*) FROM inv_cab_conteo_fisico 
           WHERE ide_inec = 4 AND activo_inccf = true  ${condBodega}) as conteos_cerrados,
          (SELECT COUNT(*) FROM inv_cab_conteo_fisico 
           WHERE ide_inec = 5 AND activo_inccf = true  ${condBodega}) as conteos_ajustados,
          
          -- Estadísticas del último mes
          (SELECT COUNT(*) FROM conteos_ultimo_mes) as conteos_ultimo_mes,
          (SELECT COALESCE(SUM(productos_con_diferencia_inccf), 0) FROM conteos_ultimo_mes) as items_con_diferencia_ultimo_mes,
          (SELECT COALESCE(SUM(valor_total_diferencias_inccf), 0) FROM conteos_ultimo_mes) as valor_diferencia_ultimo_mes,
          
          -- Promedios
          (SELECT COALESCE(AVG(porcentaje_avance_inccf), 0) FROM inv_cab_conteo_fisico 
           WHERE ide_inec IN (2,3) AND activo_inccf = true  ${condBodega}) as promedio_avance,
          
          -- Reconteos
          (SELECT COUNT(*) FROM inv_cab_conteo_fisico 
           WHERE es_reconteo_inccf = true AND activo_inccf = true  ${condBodega}) as total_reconteos
      `,
    );

    query.addParam(1, dtoIn.fechaInicio);
    query.addParam(2, dtoIn.fechaFin);

    return await this.dataSource.createQuery(query);
  }


  async getListDataEstadosConteo(dto?: QueryOptionsDto & HeaderParamsDto) {
    const dtoIn = {
      ...dto,
      module: 'inv',
      tableName: 'estado_conteo',
      primaryKey: 'ide_inec',
      columnLabel: 'nombre_inec',
      condition: `activo_inec = true`,
    };
    return this.core.getListDataValues(dtoIn);
  }



}
