import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../../connection/datasource.service';
import { DeleteQuery, InsertQuery, SelectQuery } from '../../connection/helpers';
import { EventosAuditoriaDto } from './dto/eventos-auditoria.dto';
import { DeleteAuditoriaDto } from './dto/delete-auditoria.dto';
import { EventAudit } from './enum/event-audit';
import { getCurrentDate, getCurrentTime } from '../../../util/helpers/date-util';
import { isDefined } from '../../../util/helpers/common-util';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

@Injectable()
export class AuditService {

    constructor(
        private readonly dataSource: DataSourceService
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
        const insertQuery = new InsertQuery('sis_auditoria_acceso', 'ide_auac');
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
    async getEventosAuditoria(dtoIn: EventosAuditoriaDto & HeaderParamsDto) {
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
        queryPass.addParam(1, fechaInicio);
        queryPass.addParam(2, fechaFin);
        if (isDefined(ide_usua))
            queryPass.addIntParam(3, ide_usua);
        return await this.dataSource.createQuery(queryPass);
    }

    /**
     * Elimina los registros de auditoria en un rango de fechas
     * @param dtoIn 
     * @returns 
     */
    async deleteEventosAuditoria(dtoIn: DeleteAuditoriaDto & HeaderParamsDto) {
        const dq = new DeleteQuery("sis_auditoria_acceso");
        dq.where = "fecha_auac BETWEEN $1 AND $2";
        dq.addParam(1, dtoIn.fechaInicio);
        dq.addParam(2, dtoIn.fechaFin);
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


    getQueryActividadesPorTabla(tableName: string, valor: number) {
        const query = new SelectQuery(`     
    SELECT
        a.ide_acti,
        a.nom_acti,
        a.ide_usua,
        a.sis_ide_usua,
        a.descripcion_acti,
        a.fecha_creacion_acti,
        a.fecha_completada_acti,
        a.historial_acti,
        a.usuario_ingre,
        a.usuario_actua,
        at.nom_actti,
        ae.nom_actes,
        a.descripcion_acti,
        a.fecha_actividad_acti,
        COALESCE(
            json_agg(
                json_build_object(
                    'ide_actco', c.ide_actco,
                    'comentario_actco', c.comentario_actco,
                    'fecha_comentario_actco', c.fecha_comentario_actco,
                    'usuario_ingre', c.usuario_ingre
                )
            ) FILTER (WHERE c.ide_actco IS NOT NULL),
            NULL
        ) AS comentarios
    FROM
        sis_actividad a
        JOIN sis_actividad_tipo at ON a.ide_actti = at.ide_actti
        JOIN sis_actividad_estado ae ON a.ide_actes = ae.ide_actes
        LEFT JOIN sis_actividad_comentario c ON c.ide_acti = a.ide_acti
    WHERE
        a.tabla_acti = $1
        AND a.valor_pk_acti = $2
    GROUP BY
        a.ide_acti,
        a.nom_acti,
        a.ide_usua,
        a.sis_ide_usua,
        a.descripcion_acti,
        a.fecha_creacion_acti,
        a.fecha_completada_acti,
        a.historial_acti,
        a.usuario_ingre,
        a.usuario_actua,
        at.nom_actti,
        ae.nom_actes,
        a.fecha_actividad_acti
        `);
        query.addStringParam(1, tableName);
        query.addIntParam(2, valor);
        return query;
    }


}
