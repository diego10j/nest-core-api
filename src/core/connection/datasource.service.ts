import { Injectable, InternalServerErrorException, Inject } from '@nestjs/common';
import { Query, UpdateQuery, InsertQuery, DeleteQuery, SelectQuery, DataStore } from '../connection/helpers';
import { Pool, types } from "pg";
import { ResultQuery } from './interfaces/resultQuery';
import { ErrorsLoggerService } from '../../errors/errors-logger.service';
import { removeEqualsElements } from '../util/helpers/array-util';
import { getDateFormatFront, getDateTimeFormatFront, getTimeFormat } from '../util/helpers/date-util';
import { getCountStringInText } from '../util/helpers/string-util';
import { getTypeCoreColumn, getAlignCoreColumn, getSizeCoreColumn, getDefaultValueColumn, getComponentColumn, getVisibleCoreColumn, getSqlInsert, getSqlUpdate, getSqlDelete, getSqlSelect } from '../util/helpers/sql-util';
import { Redis } from 'ioredis';

@Injectable()
export class DataSourceService {


    private pool = new Pool({
        user: process.env.DB_USERNAME,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
    });
    private TYPE_DATESTAMP = 1082;
    private TYPE_TIMESTAMP = 1114;
    private TYPE_TIMESTAMPTZ = 1184;
    private NUMERIC_OID = 1700;
    private FLOAT8_OID = 701;
    private INT8_OID = 20;
    private INT2_OID = 21;
    private INT4_OID = 23;

    constructor(
        private readonly errorsLoggerService: ErrorsLoggerService,
        @Inject('REDIS_CLIENT') private readonly redisClient: Redis
    ) {
        // Parse types bdd
        // DATE
        // types.setTypeParser(this.TYPE_DATESTAMP, (date) => getDateFormatFront(date));
        // types.setTypeParser(this.TYPE_TIMESTAMP, (date) => getDateTimeFormatFront(date));
        // types.setTypeParser(this.TYPE_TIMESTAMPTZ, (date) => getTimeFormat(date));
        // NUMBERS
        types.setTypeParser(this.NUMERIC_OID, (val) => parseFloat(val));
        types.setTypeParser(this.FLOAT8_OID, (val) => parseFloat(val));
        types.setTypeParser(this.INT8_OID, (val) => parseInt(val, 10));
        types.setTypeParser(this.INT2_OID, (val) => parseInt(val, 10));
        types.setTypeParser(this.INT4_OID, (val) => parseInt(val, 10));

    }


    /**
     * Retorna la data de una consulta en la base de datos
     * @param Query 
     * @returns Array data
     */
    async createQuery(query: Query): Promise<any[]> {
        await this.formatSqlQuery(query);
        try {
            // console.log(query.query);
            const result = await this.pool.query(query.query, query.params.map(_param => _param.value));
            console.log(result);
            return result.rows || [];
        } catch (error) {
            this.errorsLoggerService.createErrorLog(`[ERROR] createQuery`, error);
            throw new InternalServerErrorException(
                `[ERROR] createQuery - ${error}`
            );
        }
    }

    /**
     * Retorna la data de una consulta en la base de datos mediante el Pool pg
     * @param SelectQuery  primer campo del select debe ser el campo primaryKey de la consulta
     * @param isSchema  por defecto consulta propiedades adicionales de las columnas 
     * @returns Array data
     */
    async createQueryPG(query: SelectQuery, isSchema = true): Promise<ResultQuery> {
        await this.formatSqlQuery(query);
        //Ejecuta el query
        try {
            // console.log(query.query);
            let primaryKey = "id";
            const res = await this.pool.query(query.query, query.params.map(_param => _param.value));
            const columnsNames: string[] = res.fields.map(field => field.name);
            const tablesID: number[] = res.fields.map(field => field.tableID);
            const resSchema = isSchema ? await this.getColumnsSchema(removeEqualsElements(columnsNames), removeEqualsElements(tablesID)) : [];
            const typesCols = res._types._types.builtins;
            const cols = res.fields.map((_col, index) => {
                if (index === 0) primaryKey = _col.name;
                const dataTypeCore = getTypeCoreColumn(Object.keys(typesCols).find(key => typesCols[key] === _col.dataTypeID));
                const alignColumn = getAlignCoreColumn(dataTypeCore);
                const [colSchema] = isSchema ? resSchema.filter(_element => _element['name'] === _col.name) : [{}];
                const sizeColumn = getSizeCoreColumn(dataTypeCore, colSchema?.length || 0);
                const defaultValue = getDefaultValueColumn(Object.keys(typesCols).find(key => typesCols[key] === _col.dataTypeID));
                const componentCore = getComponentColumn(Object.keys(typesCols).find(key => typesCols[key] === _col.dataTypeID));
                const visible = _col.name === primaryKey ? false : getVisibleCoreColumn(_col.name);
                return {
                    name: _col.name,
                    tableID: _col.tableID,
                    dataTypeID: _col.dataTypeID,
                    dataType: dataTypeCore,
                    order: index,
                    label: _col.name,
                    required: !colSchema?.nullable || false,
                    visible,
                    length: colSchema?.length,
                    precision: colSchema?.precision,
                    decimals: colSchema?.decimals,
                    disabled: false,
                    filter: false,
                    comment: '',
                    component: componentCore,
                    upperCase: false,
                    orderable: true,
                    size: sizeColumn,
                    align: alignColumn,
                    defaultValue,
                    header: _col.name,
                    accessorKey: _col.name
                };
            });
            return {
                rowCount: res.rowCount,
                rows: res.rows,
                columns: cols,
                key: primaryKey,
                pagination: query.getPagination()
            } as ResultQuery;

        } catch (error) {
            console.error(error);
            this.errorsLoggerService.createErrorLog(`[ERROR] createQueryPG`, error);
            throw new InternalServerErrorException(
                `[ERROR] createQueryPG - ${error}`
            );
        }
    }

    /**
     * Da formato sql al query dependiendo del tipo
     */
    private async formatSqlQuery(query: Query) {
        //Forma sentencia sql
        try {
            if (query instanceof InsertQuery) {
                if (query.columns.length === 0) {
                    query.columns = await this.getTableColumns(query.table)
                }
                getSqlInsert(query);
            }
            else if (query instanceof UpdateQuery) getSqlUpdate(query);
            else if (query instanceof DeleteQuery) getSqlDelete(query);
            else if (query instanceof SelectQuery) getSqlSelect(query);
        }
        catch (error) {
            this.errorsLoggerService.createErrorLog(`[ERROR] formatSqlQuery`, error);
            throw new InternalServerErrorException(error);
        }
        //Valida que exista el mismo numero de $ con los valores de los parámetros
        const countParams = getCountStringInText("$", query.query);
        if (countParams !== query.paramValues.length) {
            throw new InternalServerErrorException(
                "[ERROR] Número de parámetros es diferente a la cantidad $ en el query"
            );
        }
    }

    /**
     * Retorna el primer registro de una consulta en la base de datos
     * @param SelectQuery 
     * @returns Object data
     */
    async createSingleQuery(query: Query): Promise<any> {
        const data = await this.createQuery(query);
        return data.length > 0 ? data[0] : null;
    }


    async createListQuery(listQuery: Query[]): Promise<boolean> {
        const queryRunner = await this.pool.connect();
        try {
            await queryRunner.query('BEGIN');
            for (let currentQuery of listQuery) {
                await this.formatSqlQuery(currentQuery);
                await queryRunner.query(currentQuery.query, currentQuery.paramValues);
            }
            await queryRunner.query('COMMIT');
            return true;
        } catch (error) {
            await queryRunner.query('ROLLBACK');
            this.errorsLoggerService.createErrorLog(`[ERROR] createQueryList`, error);
            throw new InternalServerErrorException(
                `[ERROR] createQueryList - ${error}`
            );
        }
        finally {
            await queryRunner.release();
        }
    }


    /**
     * Busca un registro de una tabla
     * @param tableName 
     * @param primaryKey 
     * @param valuePrimaryKey 
     * @returns Object data
     */
    async findOneBy(tableName: string, primaryKey: string, valuePrimaryKey: any) {
        const query = new SelectQuery(`SELECT * from ${tableName} where ${primaryKey} = $1 `);
        query.addNumberParam(1, valuePrimaryKey);
        return await this.createSingleQuery(query);
    }

    /**
     * Retorna el secuencial para el campo primario de una tabla
     * @param tableName 
     * @param primaryKey 
     * @param numberRowsAdded 
     * @returns 
     */
    async getSeqTable(tableName: string, primaryKey: string, numberRowsAdded: number = 1, login: string = 'sa'): Promise<number> {
        {
            let seq = 1;
            // Busca maximo en la tabla sis_bloqueo
            const query = new SelectQuery(`SELECT get_seq_table($1, $2, $3, $4) AS seq`);
            query.addStringParam(1, tableName);
            query.addStringParam(2, primaryKey);
            query.addIntParam(3, numberRowsAdded);
            query.addStringParam(4, login);
            try {
                const data = await this.createSingleQuery(query);
                if (data) {
                    seq = parseInt(data.seq);
                }
            } catch (error) {
                throw new InternalServerErrorException(
                    `[ERROR] getSeqTable - ${error}`
                );
            }
            return seq;
        }
    }

    /**
     * Retorna propiedades de las columnas 
     * @param columnsName 
     * @param tablesID 
     * @returns 
     */
    private async getColumnsSchema(columnsName: string[], tablesID: number[]) {
        const pq = new SelectQuery(`
        SELECT
        a.attname AS name,
        CASE
            WHEN t.typname = 'varchar' OR t.typname = 'bpchar' THEN a.atttypmod - 4
            WHEN t.typname = 'uuid' THEN 36
        	ELSE NULL
        END AS length,
        CASE
            WHEN t.typname = 'numeric' THEN (a.atttypmod - 4) >> 16
            WHEN t.typname = 'int2' THEN ceil(log(2^15)::numeric / log(10)) 
	        WHEN t.typname = 'int4' THEN ceil(log(2^31)::numeric / log(10)) 
	        WHEN t.typname = 'int8' THEN ceil(log(2^63)::numeric / log(10)) 
            ELSE NULL
        END AS precision,
        CASE
            WHEN t.typname = 'numeric' THEN (a.atttypmod - 4) & 65535
            WHEN t.typname in ('int2','int4','int8') THEN 0
            ELSE NULL
        END AS decimals,
        NOT a.attnotnull AS nullable,
        c.relname AS table,
        t.typname AS type
    FROM
        pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
        JOIN pg_catalog.pg_type t ON a.atttypid = t.oid
    WHERE
        c.oid = ANY ($1)
        AND a.attname = ANY ($2)
        AND a.attnum > 0
        AND NOT a.attisdropped
    ORDER BY
        c.relname,
        a.attname      
        `);
        pq.addArrayNumberParam(1, tablesID);
        pq.addArrayStringParam(2, columnsName);
        return await this.createQuery(pq);
    }


    async executeDataStore(...dataStore: DataStore[]) {
        let listQuery: Query[] = [];
        for (let ds of dataStore) {
            if (ds.listQuery.length > 0) {
                listQuery.push(...ds.listQuery);
            }
        }
        await this.createListQuery(listQuery);
    }


    async isDelete(dq: DeleteQuery) {
        const queryRunner = await this.pool.connect();
        try {
            await queryRunner.query('BEGIN');
            await this.formatSqlQuery(dq);
            await queryRunner.manager.query(dq.query, dq.paramValues);
        } catch (error) {
            throw new InternalServerErrorException(
                `Restricción eliminar - ${error}`
            );
        }
        finally {
            await queryRunner.query('ROLLBACK');
            await queryRunner.release();
        }
    }

    /**
     * Recupera los valores de un listado de variables
     * @param listVariables 
     * @returns 
     */
    async getVariables(listVariables: string[]) {
        listVariables = removeEqualsElements(listVariables);
        const lowercaseArray = listVariables.map(item => item.toLowerCase());
        const pq = new SelectQuery(`
            SELECT nom_para,valor_para
            FROM sis_parametros
            WHERE LOWER(nom_para) = ANY ($1)`);
        pq.addArrayStringParam(1, lowercaseArray);
        const resp = await this.createQuery(pq);
        const respMap = new Map();
        resp.forEach(data => {
            respMap.set(data.nom_para, data.valor_para);
        });
        if (lowercaseArray.length !== respMap.size) {
            console.log(
                `No se encontraron todas las variables del sistema`
            );
        }
        return respMap;
    }

    // --------------------------- REDIS  ------------------------------

    /**
     * Crea un key de cahce para table_columns
     * @param tableName 
     * @returns 
     */
    private getCacheKey(tableName: string): string {
        return `table_columns:${tableName}`;
    }

    async getTableColumns(tableName: string): Promise<string[]> {
        const cacheKey = this.getCacheKey(tableName);

        // Check cache
        const cachedColumns = await this.redisClient.get(cacheKey);
        if (cachedColumns) {
            return JSON.parse(cachedColumns);
        }
        // Fetch from database if not cached
        return this.fetchAndCacheTableColumns(tableName);
    }

    private async fetchAndCacheTableColumns(tableName: string): Promise<string[]> {
        const query = `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = $1
        `;
        const result = await this.pool.query(query, [tableName]);
        const columns = result.rows.map(row => row.column_name);

        // Cache the result
        const cacheKey = this.getCacheKey(tableName);
        // await this.redisClient.set(cacheKey, JSON.stringify(columns), 'EX', 3600); // Cache for 1 hour
        await this.redisClient.set(cacheKey, JSON.stringify(columns));
        return columns;
    }

    async updateTableColumnsCache(tableName: string): Promise<string[]> {
        const cacheKey = this.getCacheKey(tableName);

        // Invalidate cache
        await this.redisClient.del(cacheKey);

        // Fetch and cache the new data
        return this.fetchAndCacheTableColumns(tableName);
    }


    async clearTableColumnsCache() {
        // Obtener todas las claves que coinciden con el patrón 'table_columns:*'
        const keys = await this.redisClient.keys('table_columns:*');

        // Si se encuentran claves, eliminarlas
        if (keys.length > 0) {
            await this.redisClient.del(...keys);
        }
        return {
            message: 'ok'
        }
    }


    // --------------------------- FIN REDIS  ----------------------------

}