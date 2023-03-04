import { InternalServerErrorException } from '@nestjs/common';
import { UpdateQuery, InsertQuery, DeleteQuery, SelectQuery } from '../../connection/helpers';

export class SqlUtil {

    /**
     * Retorna la sentencia SQL del objeto UpdateQuery
     * @param query  UpdateQuery
     * @returns 
     */
    getSqlUpdate(query: UpdateQuery) {
        query.query = `UPDATE ${query.table} SET `;
        let sqlSetValues = "";
        let cont = query.params.length;
        for (let [key, value] of query.values) {
            sqlSetValues = sqlSetValues !== "" ? sqlSetValues + "," : sqlSetValues;
            cont++;
            sqlSetValues += `${key} = $${cont}`;
            query.params.push({ index: cont, value })
        }
        if (query.where) {
            query.where = `WHERE 1=1 AND ${query.where}`;
        } else {
            throw new InternalServerErrorException(
                `[ERROR]: No existen condiciones en el UPDATE`
            );
        }
        query.query += `${sqlSetValues} ${query.where} `;
        return query;
    }


    /**
     * Retorna la sentencia SQL del objeto InsertQuery
     * @param query  InsertQuery
     * @returns 
     */
    getSqlInsert(query: InsertQuery) {
        query.query = `INSERT INTO ${query.table} ( `;
        let sqlColumns = "";
        let sqlValues = "";
        let cont = query.params.length;
        //Si nos se definieron las columnas se obtiene de los values
        query.columns = query.columns.length === 0 ? Array.from(query.values.keys()) : query.columns;
        for (let [key, value] of query.values) {
            if (query.columns.indexOf(key) > -1) {
                sqlColumns = sqlColumns !== "" ? sqlColumns + "," : sqlColumns;
                sqlValues = sqlValues !== "" ? sqlValues + "," : sqlValues;
                cont++;
                sqlColumns += `${key}`;
                sqlValues += `$${cont}`;
                query.params.push({ index: cont, value })
            }
        }
        query.query += `${sqlColumns} ) VALUES ( ${sqlValues} )`;
        return query;
    }


    /**
     * Retorna la sentencia SQL del objeto DeleteQuery
     * @param query  DeleteQuery
     * @returns 
     */
    getSqlDelete(query: DeleteQuery) {
        query.query = `DELETE FROM ${query.table} `;
        if (query.where) {
            query.where = `WHERE 1=1 AND ${query.where}`;
        } else {
            throw new InternalServerErrorException(
                `[ERROR]: No existen condiciones en el DELETE`
            );
        }
        query.query += query.where;
        return query;
    }

    /**
     * Retorna la sentencia SQL del objeto SelectQuery
     * @param query  SelectQuery
     * @returns 
     */
    getSqlSelect(query: SelectQuery) {
        if (!isNaN(query.rows)) {
            query.offset = query.rows * (query.page - 1);
            query.query += ` OFFSET ${query.offset} LIMIT ${query.rows}`;
        }
        return query;
    }

}