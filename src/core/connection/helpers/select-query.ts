import { Query } from "./query";

export class SelectQuery extends Query {

    offset?: number;
    rows?: number;
    page?: number;

    constructor(query: string) {
        super();
        this.query = query;
    }

    setPaginator(rows: number) {
        this.rows = rows;
        this.offset = 0;
        this.page= 1;
    }
}

