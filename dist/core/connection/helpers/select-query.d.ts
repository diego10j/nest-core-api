import { Query } from "./query";
export declare class SelectQuery extends Query {
    offset?: number;
    rows?: number;
    page?: number;
    constructor(query: string);
    setPaginator(rows: number): void;
}
