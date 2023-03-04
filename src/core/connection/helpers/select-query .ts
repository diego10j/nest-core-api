import { Query } from "./query";

export class SelectQuery extends Query {

    offset?: number;
    limmit?: number;

    constructor(query: string) {
        super();
        this.query = query;
    }
}

