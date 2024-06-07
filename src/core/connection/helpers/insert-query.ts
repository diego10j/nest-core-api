import { Query } from "./query";
import { isDefined } from '../../util/helpers/common-util';
import { getDateFormat, getTimeFormat } from '../../util/helpers/date-util';

export class InsertQuery extends Query {


    table: string;
    values = new Map<string, any>();
    columns: string[] = [];

    constructor(table: string, dto?: object) {
        super();
        this.table = table;
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

    /**
     * Asigna los valores 
     * @param entry 
     */
    setValues(entry: object) {
        // Iterar sobre las propiedades del objeto 'entry'
        for (const [key, value] of Object.entries(entry)) {
            this.values.set(key, value);
        }
    }


}

