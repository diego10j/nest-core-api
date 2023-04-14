import { Column } from "./column";

export interface ResultQuery {
    rowCount: number;
    rows: any[];
    columns: Column[];
    primaryKey:string;
}
