import { Query } from "./query";
export declare class PreparedUpdate extends Query {
    table: string;
    values: Map<string, any>;
    where: string;
    constructor(table: string);
}
