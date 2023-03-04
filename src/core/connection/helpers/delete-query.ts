import { Query } from "./query";

export class DeleteQuery extends Query {

    table: string;
    where: string;

    constructor(table: string) {
        super();
        this.table = table;
    }
}

