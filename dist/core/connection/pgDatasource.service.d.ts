import { Pool } from "pg";
export declare class PGDataSourceService {
    private pool;
    constructor();
    getPool(): Pool;
}
