import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../../connection/datasource.service';
import { BaseService } from '../../../common/base-service';
import { SelectQuery } from '../../connection/helpers/select-query';
import { CabComprobanteInventarioDto } from './dto/cab-compr-inv.dto';
import { ComprobantesInvDto } from './dto/comprobantes-inv.dto';
import { CoreService } from '../../core.service';
import { ServiceDto } from '../../../common/dto/service.dto';

@Injectable()
export class ComprobantesInvService extends BaseService {


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
        * Retorna los comprovantes de inventario en todas las bodegas en un rango de fechas
        * @param dtoIn 
        * @returns 
        */
    async getComprobantesInventario(dtoIn: ComprobantesInvDto) {
        const condBodega = dtoIn.ide_inbod ? `AND a.ide_inbod = ${dtoIn.ide_inbod}` : '';

        const condEstado = dtoIn.ide_inepi ? `AND a.ide_inepi = ${dtoIn.ide_inepi}` : '';
        const query = new SelectQuery(`
    select
        a.ide_incci,
        a.numero_incci,
        a.fecha_trans_incci,
        c.nombre_inbod,
        d.nombre_intti,
        f.nom_geper,
        a.observacion_incci,
        a.ide_cnccc,
        g.nombre_inepi,
        automatico_incci,
        a.usuario_ingre,
        f.uuid
    from
        inv_cab_comp_inve a
        inner join inv_bodega c on a.ide_inbod = c.ide_inbod
        inner join inv_tip_tran_inve d on a.ide_intti = d.ide_intti
        inner join inv_tip_comp_inve e on d.ide_intci = e.ide_intci
        inner join gen_persona f on a.ide_geper = f.ide_geper
        inner join inv_est_prev_inve g on a.ide_inepi = g.ide_inepi
    where
        fecha_trans_incci BETWEEN $1  and $2
        and a.ide_empr = $3
        ${condBodega}
        ${condEstado}
        order by  fecha_trans_incci desc, ide_incci desc
    `, dtoIn);

        query.addDateParam(1, dtoIn.fechaInicio);
        query.addDateParam(2, dtoIn.fechaFin);
        query.addIntParam(3, dtoIn.ideEmpr);

        return await this.dataSource.createQuery(query);
    }

    /**
     * Retorna el detalle de productos de un comprobante de inventario
     * @param dtoIn 
     * @returns 
     */
    async getDetComprobanteInventario(dtoIn: CabComprobanteInventarioDto) {
        const query = new SelectQuery(`
    select
        b.ide_incci,
        d.nombre_intti,
        g.nombre_inarti,
        case
            when signo_intci = 1 THEN b.cantidad_indci
        end as INGRESO,
        case
            when signo_intci = -1 THEN b.cantidad_indci
        end as EGRESO,
		precio_indci,
		valor_indci,
		b.observacion_indci,
		referencia_incci,
        g.uuid
    from
        inv_cab_comp_inve a
        inner join inv_det_comp_inve b on a.ide_incci = b.ide_incci
        inner join inv_tip_tran_inve d on a.ide_intti = d.ide_intti
        inner join inv_tip_comp_inve e on d.ide_intci = e.ide_intci
        inner join inv_articulo g on b.ide_inarti = g.ide_inarti
    where
		a.ide_incci = $1
        and hace_kardex_inarti = true
        order by  g.nombre_inarti
    `, dtoIn);
        query.addIntParam(1, dtoIn.ide_incci);
        return await this.dataSource.createQuery(query);
    }


    /**
        * Retorna los comprovantes de inventario en todas las bodegas en un rango de fechas
        * @param dtoIn 
        * @returns 
        */
    async getCabComprobanteInventario(dtoIn: CabComprobanteInventarioDto) {
        const query = new SelectQuery(`
        select
            a.ide_incci,
            a.numero_incci,
            a.fecha_trans_incci,
            c.nombre_inbod,
            d.nombre_intti,
            f.nom_geper,
            a.observacion_incci,
            a.ide_cnccc,
            g.nombre_inepi,
            automatico_incci,
            a.usuario_ingre,
            f.uuid
        from
            inv_cab_comp_inve a
            inner join inv_bodega c on a.ide_inbod = c.ide_inbod
            inner join inv_tip_tran_inve d on a.ide_intti = d.ide_intti
            inner join inv_tip_comp_inve e on d.ide_intci = e.ide_intci
            inner join gen_persona f on a.ide_geper = f.ide_geper
            inner join inv_est_prev_inve g on a.ide_inepi = g.ide_inepi
        where
            a.ide_incci = $1
    `,dtoIn);
        query.addIntParam(1, dtoIn.ide_incci);
        return await this.dataSource.createQuery(query);
    }



    // ==================================ListData==============================
    /**
    * Retorna las estados de los comprobantes de inventario
    * @returns 
    */
    async getListDataEstadosComprobantes(dto?: ServiceDto) {
        const dtoIn = { ...dto, module: 'inv', tableName: 'est_prev_inve', primaryKey: 'ide_inepi', columnLabel: 'nombre_inepi' }
        return this.core.getListDataValues(dtoIn);
    }


}
