import { Query } from "./query";
export declare class DeleteQuery extends Query {
    table: string;
    where: string;
    constructor(table: string);
}
