import { Injectable } from '@nestjs/common';
import { InsertQuery, SelectQuery } from '../connection/helpers';
import { getCurrentDateTime } from '../../util/helpers/date-util';
import { UpdateQuery } from '../connection/helpers/update-query';

@Injectable()
export class ActivityService {

    constructor() {
    }


    getInsertActivityTable(objInsert: InsertQuery): InsertQuery {
        const insertQuery = new InsertQuery('sis_archivo', 'ide_arch');
        insertQuery.values.set('tabla_acti', objInsert.table);
        insertQuery.values.set('valor_pk_acti', objInsert.values.get(objInsert.primaryKey));
        insertQuery.values.set('nom_acti', 'Registro Creado');
        insertQuery.values.set('ide_actti', 1); // Registro creado
        insertQuery.values.set('ide_actes', 2); // Finalizado
        insertQuery.values.set('fecha_actividad_acti', getCurrentDateTime());
        insertQuery.values.set('activo_acti', true);
        return insertQuery;
    }

    async getUpdateActivityTable(objUpdate: UpdateQuery): Promise<InsertQuery> {
        // Consulta valores modificados antes
        const keysArray = [...objUpdate.values.keys()];
        // Unir las claves en una cadena con el formato deseado
        const keysString = keysArray.map(key => `'${key}'`).join(', ');
        const query = new SelectQuery(`SELECT ${keysString} from ${objUpdate.table} where ${objUpdate.primaryKey} = $1 `);
        query.addParam(1, objUpdate.values.get(objUpdate.primaryKey));
        // const result = await this.dataSource.createSingleQuery(query);
        // const arrayChanges = [];
        // for (const key of keysArray) {
        //     arrayChanges.push(
        //         {
        //             campo_modificado: key,
        //             valor_anterior: result[key],
        //             valor_nuevo: objUpdate.values.get(key),
        //             fecha_cambio: getCurrentDateTime(),
        //             usuario_actua: objUpdate.values.get('usuario_actua')
        //         }
        //     );
        // }
        const insertQuery = new InsertQuery('sis_archivo', 'ide_arch');
        // insertQuery.values.set('tabla_acti', objUpdate.table);
        // insertQuery.values.set('valor_pk_acti', objUpdate.values.get(objUpdate.primaryKey));
        // insertQuery.values.set('nom_acti', 'Registro Modificado');
        // insertQuery.values.set('ide_actti', 2); // Registro modificado
        // insertQuery.values.set('ide_actes', 2); // Finalizado
        // insertQuery.values.set('fecha_actividad_acti', getCurrentDateTime());
        // insertQuery.values.set('activo_acti', true);
        // insertQuery.values.set('historial_acti', JSON.stringify(arrayChanges));
        return insertQuery;
    }

}
