import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../connection/datasource.service';
import { InsertQuery } from '../connection/helpers';

@Injectable()
export class AuditService {

    constructor(private readonly dataSource: DataSourceService) {
    }

    async saveAccessAudit(ide_usua: number, ide_acau: number, ip: string, detalle_auac: string, dispositivo: string, fin_auac: boolean = true) {
        /** 
         const ds_auditoria = new DataStore(this.dataSource);
         ds_auditoria.setDataStoreTable('sis_auditoria_acceso', 'ide_auac');
         ds_auditoria.setWhereTable('ide_auac = -1');
         await ds_auditoria.execute();
         ds_auditoria.insert();
         ds_auditoria.setValue(0, 'ide_usua', ide_usua);
         ds_auditoria.setValue(0, 'ide_acau', ide_acau);
         ds_auditoria.setValue(0, 'fecha_auac', this.dataSource.util.DATE_UTIL.getCurrentDate());
         ds_auditoria.setValue(0, 'hora_auac', this.dataSource.util.DATE_UTIL.getCurrentTime());
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
        insertQuery.values.set('fecha_auac', this.dataSource.util.DATE_UTIL.getCurrentDate());
        insertQuery.values.set('hora_auac', this.dataSource.util.DATE_UTIL.getCurrentTime());
        insertQuery.values.set('ip_auac', ip);
        insertQuery.values.set('fin_auac', fin_auac);
        insertQuery.values.set('id_session_auac', dispositivo);
        insertQuery.values.set('detalle_auac', detalle_auac);
        insertQuery.values.set('ide_auac', await this.dataSource.getSeqTable('sis_auditoria_acceso', 'ide_auac'));
        this.dataSource.createQuery(insertQuery);


    }

}
