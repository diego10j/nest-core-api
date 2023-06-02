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

    getTypeCoreColumn(nameType: string) {
        // https://github.com/brianc/node-pg-types/blob/master/lib/builtins.js
        const TypesString = ['VARCHAR', 'TEXT', 'CHAR', 'XML', 'JSON', 'UUID'];
        const TypesNumber = ['FLOAT4', 'FLOAT8', 'MONEY', 'NUMERIC', 'INT8', 'INT2', 'INT4'];
        const TypesDate = ['DATE'];
        const TypesTime = ['TIME', 'TIMETZ'];
        const TypesDateTime = ['TIMESTAMP', 'TIMESTAMPTZ'];
        const TypesBoolean = ['BOOL', 'BIT'];
        if (TypesString.includes(nameType)) return "String"
        if (TypesNumber.includes(nameType)) return "Number"
        if (TypesDate.includes(nameType)) return "Date"
        if (TypesTime.includes(nameType)) return "Time"
        if (TypesDateTime.includes(nameType)) return "DateTime"
        if (TypesBoolean.includes(nameType)) return "Boolean"
        return "String";
    }


    getDefaultValueColumn(nameType: string) {
        const TypesString = ['VARCHAR', 'TEXT', 'CHAR', 'XML', 'JSON', 'UUID'];
        const TypesNumber = ['FLOAT4', 'FLOAT8', 'MONEY', 'NUMERIC', 'INT8', 'INT2', 'INT4'];
        const TypesDate = ['DATE', 'TIME', 'TIMETZ', 'TIMESTAMP', 'TIMESTAMPTZ'];
        const TypesBoolean = ['BOOL', 'BIT'];
        if (TypesString.includes(nameType)) return ""
        if (TypesNumber.includes(nameType)) return null
        if (TypesDate.includes(nameType)) return null
        if (TypesBoolean.includes(nameType)) return false
        return null;
    }

    getComponentColumn(nameType: string) {
        const TypesText = ['VARCHAR', 'TEXT', 'CHAR', 'XML', 'JSON', 'UUID', 'FLOAT4', 'FLOAT8', 'MONEY', 'NUMERIC', 'INT8', 'INT2', 'INT4'];
        const TypesDate = ['DATE'];
        const TypesTime = ['TIME', 'TIMETZ'];
        const TypesDateTime = ['TIMESTAMP', 'TIMESTAMPTZ'];
        const TypesBoolean = ['BOOL', 'BIT'];
        if (TypesText.includes(nameType)) return "Text"
        if (TypesDate.includes(nameType)) return "Calendar"
        if (TypesDateTime.includes(nameType)) return "CalendarTime"
        if (TypesTime.includes(nameType)) return "Time"
        if (TypesBoolean.includes(nameType)) return "Checkbox"
        return "Text";
    }

    getVisibleCoreColumn(nameColumn: string) {
        const hiddenColumns = ['ide_empr', 'ide_sucu', 'fecha_actua', 'hora_actua', 'usuario_actua', 'fecha_ingre', 'hora_ingre', 'usuario_ingre', 'uuid'];
        if (hiddenColumns.includes(nameColumn)) return false
        return true;
    }

    getAlignCoreColumn(nameType: string) {
        const LeftTypes = ['String', 'Date', 'Time', 'DateTime'];
        const RightTypes = ['Number', 'Integer'];
        const CenterTypes = ['Boolean'];
        if (LeftTypes.includes(nameType)) return "left"
        if (RightTypes.includes(nameType)) return "right"
        if (CenterTypes.includes(nameType)) return "center"
        return "left";
    }

    getSizeCoreColumn(nameType: string, length: number): number {
        const minSize = ['Date', 'Time', 'Boolean'];
        const medSize = ['DateTime', 'Number', 'Integer'];
        if (minSize.includes(nameType)) return 120;
        if (medSize.includes(nameType)) return 150;
        if (length > 0 && length < 20) return 150;
        if (length >= 20 && length < 30) return 190;
        if (length >= 30 && length < 50) return 230;
        if (length >= 50 && length < 70) return 270;
        if (length >= 70 && length < 90) return 300;
        if (length >= 90 && length < 100) return 240;
        if (length >= 100 && length < 150) return 380;
        if (length >= 150 && length < 180) return 420;
        if (length >= 180 && length < 200) return 460;
        if (length >= 200) return 500;
        return 200;
    }

    /**
     * Remplaza vacios por null, undefinded por null
     * @param value 
     * @returns 
     */
    toObjectTable(value: object): object {
        const cloneObjUpdate: any = { ...value };
        Object.keys(value).forEach(key => {
            if (cloneObjUpdate[key] === '') cloneObjUpdate[key] = null;
            if (cloneObjUpdate[key] === undefined) cloneObjUpdate[key] = null;
        });
        return cloneObjUpdate;
    }


}