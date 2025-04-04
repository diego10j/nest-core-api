import { Column } from "./column";

export interface ResultQuery {
    rowCount?: number;
    totalRecords?: number;
    rows?: any[];
    charts?: any[];
    columns?: Column[];
    key?: string;  // primaryKey
    ref?: string;  // tableName
    message?: string; // mensage para el front
    row?: object; //cuando se requiere retornar data que no sea de un Query
    error?: boolean;
}
