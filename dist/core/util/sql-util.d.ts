import { UpdateQuery, InsertQuery, DeleteQuery, SelectQuery } from '../connection/helpers';
export declare class SqlUtil {
    getSqlUpdate(query: UpdateQuery): UpdateQuery;
    getSqlInsert(query: InsertQuery): InsertQuery;
    getSqlDelete(query: DeleteQuery): DeleteQuery;
    getSqlSelect(query: SelectQuery): SelectQuery;
}
