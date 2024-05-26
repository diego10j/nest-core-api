import { isDefined } from "class-validator";
import { Query } from "./query";
import { getDateFormat, getTimeFormat } from "src/core/util/helpers/date-util";

export class UpdateQuery extends Query {


    table: string;
    values = new Map<string, any>();
    where: string;

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
                this.values.set('usuario_actua', mapObject.get('login'));

            this.values.set('fecha_actua', getDateFormat(new Date()));
            this.values.set('hora_actua', getTimeFormat(new Date()));
        }
    }
}

