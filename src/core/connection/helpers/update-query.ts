import { isDefined } from "class-validator";
import { Query } from "./query";
import { getDateFormat, getTimeFormat } from "src/util/helpers/date-util";

export class UpdateQuery extends Query {


    table: string;
    primaryKey: string;
    values = new Map<string, any>();
    where: string;

    valuePrimaryKey: number;

    constructor(table: string, primaryKey: string, dto?: object) {
        super();
        this.table = table;
        this.primaryKey = primaryKey;
        if (dto) {
            // Asigna variables enviadas en el dto Base
            const mapObject = new Map(Object.entries(dto));
            if (isDefined(mapObject.get('login')))
                this.values.set('usuario_actua', mapObject.get('login'));
        }
    }

    /**
     * Asigna los valores 
     * @param entry 
     */
    setValues(entry: Record<string, any>) {
        const keysToDelete = [
            'ip', 'device', 'login', 'pagination',
            'ideUsua', 'ideEmpr', 'ideSucu', 'idePerf',
            'hora_ingre', 'usuario_ingre', 'fecha_ingre', 'uuid'
        ];

        // Eliminar las claves no deseadas
        for (const key of keysToDelete) {
            delete entry[key];
        }
        // Iterar sobre las propiedades del objeto 'entry'
        for (const [key, value] of Object.entries(entry)) {
            this.values.set(key, value);
        }
    }



}

