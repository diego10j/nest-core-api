import { Column } from "./column";

export interface ResultQuery {
    rowCount: number;
    rows: any[];
    columns?: Column[];
    key?: string;  // primaryKey
    ref?: string;  // tableName
    message?: string; // mensage para el front
}
