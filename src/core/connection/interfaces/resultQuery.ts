import { Column } from './column';

export interface ResultQuery<T = any> {
  rowCount?: number;
  totalRecords?: number;
  totalFilterRecords?: number;
  rows?: T[]; // antes  any[];
  charts?: any[];
  columns?: Column[];
  key?: string; // primaryKey
  ref?: string; // tableName
  message?: string; // mensage para el front
  row?: Record<string, any>; //cuando se requiere retornar data que no sea de un Query
  error?: boolean;
}
