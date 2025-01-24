import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../../connection/datasource.service';
import { BaseService } from '../../../common/base-service';
import { ServiceDto } from '../../../common/dto/service.dto';
import { SelectQuery } from '../../connection/helpers/select-query';
import { MovimientosInvDto } from './dto/movimientos-inv.dto';
import { MovimientosBodegaDto } from './dto/mov-bodega.dto';
import { CoreService } from '../../core.service';
import { IdeDto } from 'src/common/dto/ide.dto';
import { StockProductosDto } from './dto/stock-productos.dto';
import { fDate } from 'src/util/helpers/date-util';

@Injectable()
export class BodegasService extends BaseService {


    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService
    ) {
        super();
        // obtiene las variables del sistema para el servicio
        this.dataSource.getVariables([
            'p_inv_estado_normal',  // 1
        ]).then(result => {
            this.variables = result;
        });
    }


    /**
    * Retorna listado de bodegas de la empresa
    * @returns 
    */
    async getBodegas(dtoIn?: ServiceDto) {
        const query = new SelectQuery(`
        select
            ide_inbod,
            nombre_inbod,
            nombre_geprov,
            nombre_gecan,
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
    `, dtoIn);
        query.addIntParam(1, dtoIn.ideEmpr);
        return await this.dataSource.createQuery(query);
    }

    /**
     * Retorna una bodega
     * @param dto 
     * @returns 
     */
    async getBodega(dto: IdeDto) {
        const dtoIn = { ...dto, module: 'inv', tableName: 'bodega', primaryKey: 'ide_inbod', condition: `ide_inbod = ${dto.ide}` }
        return this.core.getTableQuery(dtoIn);
    }


    /**
     * Retorna los movimientos de inventario en todas las bodegas en un rango de fechas
     * @param dtoIn 
     * @returns 
     */
    async getMovimientos(dtoIn: MovimientosInvDto) {
        const condBodega = dtoIn.ide_inbod ? 'AND a.ide_inbod = $4' : '';
        const query = new SelectQuery(`
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
        `);

        query.addDateParam(1, dtoIn.fechaInicio);
        query.addDateParam(2, dtoIn.fechaFin);
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
    async getMovimientosBodega(dtoIn: MovimientosBodegaDto) {
        return await this.getMovimientos(dtoIn);
    }



    /**
  * Retorna el listado de Stock de Productos 
  * @returns 
  */
    async getStockProductos(dtoIn: StockProductosDto) {

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

        const query = new SelectQuery(`
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
            COALESCE(existencia_cte.existencia, 0) AS existencia,
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
            nombre_incate, ARTICULO.nombre_inarti;
        `, dtoIn);

        query.addDateParam(1, fechaCorte);
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
    async getListDataBodegas(dto?: ServiceDto) {
        const dtoIn = { ...dto, module: 'inv', tableName: 'bodega', primaryKey: 'ide_inbod', columnLabel: 'nombre_inbod', condition: `ide_empr = ${dto.ideEmpr} and activo_inbod = true` }
        return this.core.getListDataValues(dtoIn);
    }


    async getListDataDetalleStock(_dto?: ServiceDto) {
        return [
            {
                "value": 1,
                "label": "EN STOCK"
            },
            {
                "value": 2,
                "label": "STOCK EXTRA"
            },
            {
                "value": 3,
                "label": "STOCK IDEAL"
            },
            {
                "value": 4,
                "label": "STOCK ÓPTIMO"
            },
            {
                "value": 5,
                "label": "STOCK BAJO"
            },
            {
                "value": 6,
                "label": "SIN STOCK"
            }
        ]
    }

}
