"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqlUtil = void 0;
const common_1 = require("@nestjs/common");
class SqlUtil {
    getSqlUpdate(query) {
        query.query = `UPDATE ${query.table} SET `;
        let sqlSetValues = "";
        let cont = query.params.length;
        for (let [key, value] of query.values) {
            sqlSetValues = sqlSetValues !== "" ? sqlSetValues + "," : sqlSetValues;
            cont++;
            sqlSetValues += `${key} = $${cont}`;
            query.params.push({ index: cont, value });
        }
        if (query.where) {
            query.where = `WHERE 1=1 AND ${query.where}`;
        }
        else {
            throw new common_1.InternalServerErrorException(`[ERROR]: No existen condiciones en el UPDATE`);
        }
        query.query += `${sqlSetValues} ${query.where} `;
        return query;
    }
    getSqlInsert(query) {
        query.query = `INSERT INTO ${query.table} ( `;
        let sqlColumns = "";
        let sqlValues = "";
        let cont = query.params.length;
        query.columns = query.columns.length === 0 ? Array.from(query.values.keys()) : query.columns;
        for (let [key, value] of query.values) {
            if (query.columns.indexOf(key) > -1) {
                sqlColumns = sqlColumns !== "" ? sqlColumns + "," : sqlColumns;
                sqlValues = sqlValues !== "" ? sqlValues + "," : sqlValues;
                cont++;
                sqlColumns += `${key}`;
                sqlValues += `$${cont}`;
                query.params.push({ index: cont, value });
            }
        }
        query.query += `${sqlColumns} ) VALUES ( ${sqlValues} )`;
        return query;
    }
    getSqlDelete(query) {
        query.query = `DELETE FROM ${query.table} `;
        if (query.where) {
            query.where = `WHERE 1=1 AND ${query.where}`;
        }
        else {
            throw new common_1.InternalServerErrorException(`[ERROR]: No existen condiciones en el DELETE`);
        }
        query.query += query.where;
        return query;
    }
    getSqlSelect(query) {
        if (!isNaN(query.rows)) {
            query.offset = query.rows * (query.page - 1);
            query.query += ` OFFSET ${query.offset} LIMIT ${query.rows}`;
        }
        return query;
    }
}
exports.SqlUtil = SqlUtil;
//# sourceMappingURL=sql-util.js.map