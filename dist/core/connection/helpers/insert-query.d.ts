import { Query } from "./query";
export declare class InsertQuery extends Query {
    table: string;
    values: Map<string, any>;
    columns: string[];
    constructor(table: string);
}
