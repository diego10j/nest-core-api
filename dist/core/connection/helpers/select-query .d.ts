import { Query } from "./query";
export declare class SelectQuery extends Query {
    offset?: number;
    limmit?: number;
    constructor(query: string);
}
