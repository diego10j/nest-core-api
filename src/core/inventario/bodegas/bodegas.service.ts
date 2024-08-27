import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../../connection/datasource.service';
import { BaseService } from '../../../common/base-service';
import { ServiceDto } from '../../../common/dto/service.dto';
import { SelectQuery } from '../../connection/helpers/select-query';
import { MovimientosInvDto } from './dto/movimientos-inv.dto';
import { MovimientosBodegaDto } from './dto/mov-bodega.dto';


@Injectable()
export class BodegasService extends BaseService {


    constructor(
        private readonly dataSource: DataSourceService,
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
        f.nom_geper,
        a.observacion_incci,
        a.ide_cnccc,
        a.usuario_ingre,
        g.uuid,
        a.ide_inbod
    from
        inv_cab_comp_inve a
        inner join inv_det_comp_inve b on a.ide_incci = b.ide_incci
        inner join inv_bodega c on a.ide_inbod = c.ide_inbod
        inner join inv_tip_tran_inve d on a.ide_intti = d.ide_intti
        inner join inv_tip_comp_inve e on d.ide_intci = e.ide_intci
        inner join gen_persona f on a.ide_geper = f.ide_geper
        inner join inv_articulo g on b.ide_inarti = g.ide_inarti
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



}
