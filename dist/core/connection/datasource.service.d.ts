import { DataSource } from 'typeorm';
import { ColumnsTableDto } from './dto/columns-table.dto';
import { UtilService } from '../util/util.service';
import { Query, SelectQuery, DataStore } from '../connection/helpers';
import { ResultQuery } from './interfaces/resultQuery';
export declare class DataSourceService {
    private readonly dataSource;
    readonly util: UtilService;
    private pool;
    private readonly logger;
    constructor(dataSource: DataSource, util: UtilService);
    getColumnsTable(dto: ColumnsTableDto): Promise<any[]>;
    createQuery(query: Query): Promise<any[]>;
    createQueryPG(query: SelectQuery): Promise<ResultQuery>;
    private formatSqlQuery;
    createSingleQuery(query: Query): Promise<any>;
    createListQuery(listQuery: Query[]): Promise<boolean>;
    findOneBy(tableName: string, primaryKey: string, valuePrimaryKey: number): Promise<any>;
    getSeqTable(tableName: string, primaryKey: string, numberRowsAdded?: number): Promise<number>;
    executeDataStore(...dataStore: DataStore[]): Promise<void>;
}
