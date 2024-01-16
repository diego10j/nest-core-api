import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../connection/datasource.service';
import { DeleteQuery, InsertQuery, SelectQuery } from '../connection/helpers';
import { EventosAuditoriaDto } from './dto/eventos-auditoria.dto';
import { DeleteAuditoriaDto } from './dto/delete-auditoria.dto';
import { EventAudit } from './enum/event-audit';
import { getCurrentDate, getCurrentTime } from '../util/helpers/date-util';
import { isDefined } from '../util/helpers/common-util';

@Injectable()
export class AuditService {

    constructor(private readonly dataSource: DataSourceService
    ) {
    }

    /**
     * Guarda una accion de Auditoria
     * @param ide_usua 
     * @param ide_acau 
     * @param ip 
     * @param detalle_auac 
     * @param dispositivo 
     * @param fin_auac 
     */
    async saveEventoAuditoria(ide_usua: number, ide_acau: number, ip: string, detalle_auac: string, dispositivo: string, fin_auac: boolean = true) {
        /** 
         const ds_auditoria = new DataStore(this.dataSource);
         ds_auditoria.setDataStoreTable('sis_auditoria_acceso', 'ide_auac');
         ds_auditoria.setWhereTable('ide_auac = -1');
         await ds_auditoria.execute();
         ds_auditoria.insert();
         ds_auditoria.setValue(0, 'ide_usua', ide_usua);
         ds_auditoria.setValue(0, 'ide_acau', ide_acau);
         ds_auditoria.setValue(0, 'fecha_auac', getCurrentDate());
         ds_auditoria.setValue(0, 'hora_auac', getCurrentTime());
         ds_auditoria.setValue(0, 'ip_auac', ip);
         ds_auditoria.setValue(0, 'fin_auac', fin_auac);
         ds_auditoria.setValue(0, 'id_session_auac', dispositivo);
         ds_auditoria.setValue(0, 'detalle_auac', detalle_auac);
         await ds_auditoria.save();
         await this.dataSource.executeDataStore(ds_auditoria)
        */
        const insertQuery = new InsertQuery('sis_auditoria_acceso');
        insertQuery.values.set('ide_usua', ide_usua);
        insertQuery.values.set('ide_acau', ide_acau);
        insertQuery.values.set('fecha_auac', getCurrentDate());
        insertQuery.values.set('hora_auac', getCurrentTime());
        insertQuery.values.set('ip_auac', ip);
        insertQuery.values.set('fin_auac', fin_auac);
        insertQuery.values.set('id_session_auac', dispositivo);
        insertQuery.values.set('detalle_auac', detalle_auac);
        insertQuery.values.set('ide_auac', await this.dataSource.getSeqTable('sis_auditoria_acceso', 'ide_auac'));
        this.dataSource.createQuery(insertQuery);
    }

    /**
     * Retorna las acciones de auditoria realizadas en un rango de fechas 
     * @param dtoIn 
     * @returns 
     */
    async getEventosAuditoria(dtoIn: EventosAuditoriaDto) {
        const { fechaInicio, fechaFin, ide_usua } = dtoIn;
        const condUsuario = isDefined(ide_usua) ? ' and a.ide_usua = $3' : '';
        const queryPass = new SelectQuery(`
        select a.ide_auac,fecha_auac,hora_auac,nom_usua,nom_acau,
        (select nom_opci from sis_opcion where ide_opci = CAST (a.detalle_auac as INTEGER) and a.ide_acau=11) as pantalla,
        ip_auac,detalle_auac
        from sis_auditoria_acceso a
        inner join sis_accion_auditoria b on a.ide_acau = b.ide_acau
        left join sis_usuario c on a.ide_usua = c.ide_usua
        where fecha_auac between $1 and $2
        ${condUsuario}
        order by fecha_auac desc ,hora_auac desc, nom_usua`);
        queryPass.addDateParam(1, fechaInicio);
        queryPass.addDateParam(2, fechaFin);
        if (isDefined(ide_usua))
            queryPass.addIntParam(3, ide_usua);
        return await this.dataSource.createQueryPG(queryPass);
    }

    /**
     * Elimina los registros de auditoria en un rango de fechas
     * @param dtoIn 
     * @returns 
     */
    async deleteEventosAuditoria(dtoIn: DeleteAuditoriaDto) {
        const dq = new DeleteQuery("sis_auditoria_acceso");
        dq.where = "fecha_auac BETWEEN $1 AND $2";
        dq.addDateParam(1, dtoIn.fechaInicio);
        dq.addDateParam(2, dtoIn.fechaFin);
        if (dtoIn.ide_auac) {
            dq.where += ' AND ide_auac = ANY($3)';
            dq.addArrayStringParam(3, dtoIn.ide_auac);
        }
        await this.dataSource.createQuery(dq);
        this.saveEventoAuditoria(
            dtoIn.ideUsua,
            EventAudit.DELETE_AUDIT,
            dtoIn.ip,
            `${dtoIn.login} Borra Auditoria`,
            dtoIn.device
        );
        return {
            message: 'ok'
        };
    }
}
