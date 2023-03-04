import { Query } from "./query";
export declare class PreparedQuery extends Query {
    offset?: number;
    limmit?: number;
    constructor(query: string);
}
