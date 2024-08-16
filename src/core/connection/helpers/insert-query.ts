import { Query } from "./query";
import { isDefined } from 'src/util/helpers/common-util';
import { getDateFormat, getTimeFormat } from 'src/util/helpers/date-util';

export class InsertQuery extends Query {


    table: string;
    primaryKey: string;
    values = new Map<string, any>();
    columns: string[] = [];
    audit: boolean = true;

    constructor(table: string, primaryKey: string, dto?: object) {
        super();
        this.table = table;
        this.primaryKey = primaryKey;
        if (dto) {
            // Asigna variables enviadas en el dto Base
            const mapObject = new Map(Object.entries(dto));
            if (isDefined(mapObject.get('ideEmpr')))
                this.values.set('ide_empr', mapObject.get('ideEmpr'));
            if (isDefined(mapObject.get('ideSucu')))
                this.values.set('ide_sucu', mapObject.get('ideSucu'));
            if (isDefined(mapObject.get('login')))
                this.values.set('usuario_ingre', mapObject.get('login'));

            this.values.set('fecha_ingre', getDateFormat(new Date()));
            this.values.set('hora_ingre', getTimeFormat(new Date()));
        }
    }

    setAudit(audit: boolean = true) {
        this.audit = audit;
    }

}

