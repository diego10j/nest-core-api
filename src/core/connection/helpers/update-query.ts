import { Query } from "./query";

export class UpdateQuery extends Query {


    table: string;
    values = new Map<string, any>();
    where: string;

    constructor(table: string) {
        super();
        this.table = table;
    }
}

