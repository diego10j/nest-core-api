import { Query } from "./query";
export declare class UpdateQuery extends Query {
    table: string;
    values: Map<string, any>;
    where: string;
    constructor(table: string);
}
