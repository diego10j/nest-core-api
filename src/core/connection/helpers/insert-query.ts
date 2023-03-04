import { Query } from "./query";

export class InsertQuery extends Query {


    table: string;
    values = new Map<string, any>();
    columns: string[] = [];

    constructor(table: string) {
        super();
        this.table = table;
    }


}

