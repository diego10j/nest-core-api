import { Injectable, InternalServerErrorException, Inject } from '@nestjs/common';
import { Query, UpdateQuery, InsertQuery, DeleteQuery, SelectQuery, DataStore } from '../connection/helpers';
import { Pool, types } from "pg";
import { ResultQuery } from './interfaces/resultQuery';
import { ErrorsLoggerService } from '../../errors/errors-logger.service';
import { removeEqualsElements } from '../../util/helpers/array-util';
import { getCurrentDateTime, getDateTimeFormat, getTimeFormat, getTimeISOFormat, getDateFormat } from '../../util/helpers/date-util';
import { getCountStringInText } from '../../util/helpers/string-util';
import { getTypeCoreColumn, getAlignCoreColumn, getSizeCoreColumn, getDefaultValueColumn, getComponentColumn, getVisibleCoreColumn, getSqlInsert, getSqlUpdate, getSqlDelete, getSqlSelect, getTypeFilterColumn } from '../../util/helpers/sql-util';
import { Redis } from 'ioredis';
import { isDefined } from '../../util/helpers/common-util';
import { envs } from 'src/config/envs';

@Injectable()
export class DataSourceService {


    public pool = new Pool({
        // user: envs.dbUsername,
        // host: envs.dbHost,
        // database: envs.dbName,
        // password: envs.dbPassword,
        // port: envs.dbPort,
        connectionString: envs.bdUrlPool,
        // ssl: {
        //     rejectUnauthorized: false, // If you're connecting to an SSL-enabled database
        // },
    });
    private TYPE_DATESTAMP = 1082;
    private TYPE_TIMESTAMP = 1114;
    private TYPE_TIMESTAMPTZ = 1184;
    private TIME_OID = 1083;
    private NUMERIC_OID = 1700;
    private FLOAT8_OID = 701;
    private INT8_OID = 20;
    private INT2_OID = 21;
    private INT4_OID = 23;

    private SIZE_DEFAULT = 100;

    constructor(
        private readonly errorsLoggerService: ErrorsLoggerService,
        @Inject('REDIS_CLIENT') public readonly redisClient: Redis
    ) {
        // Parse types bdd
        // DATE
        //   types.setTypeParser(this.TYPE_DATESTAMP, (date) => getDateFormat(date));
        //   types.setTypeParser(this.TYPE_TIMESTAMP, (date) => getDateTimeFormat(date));
        //   types.setTypeParser(this.TYPE_TIMESTAMPTZ, (date) => getTimeFormat(date));
        types.setTypeParser(this.TIME_OID, (val) => getTimeISOFormat(val));
        // NUMBERS
        types.setTypeParser(this.NUMERIC_OID, (val) => parseFloat(val));
        types.setTypeParser(this.FLOAT8_OID, (val) => parseFloat(val));
        types.setTypeParser(this.INT8_OID, (val) => parseInt(val, 10));
        types.setTypeParser(this.INT2_OID, (val) => parseInt(val, 10));
        types.setTypeParser(this.INT4_OID, (val) => parseInt(val, 10));
    }

    /**
     * Retorna la data de una consulta en la base de datos, no retorna esquema y no hace autopaginacion
     * @param Query 
     * @returns Array data
     */
    async createSelectQuery(query: SelectQuery): Promise<any[]> {
        query.isAutoPagination = false;
        query.isSchema = false;
        query.isWrappedQuery = false;
        const result = await this.createQuery(query);
        return result.rows || [];
    }

    /**
     * Retorna la data de una consulta en la base de datos mediante el Pool pg
     * @param Query  
     * @param ref referencia cuando se utiliza una función getTableQuery para poder identificarla
     * @returns Array data
     */
    async createQuery(query: Query, ref = undefined): Promise<ResultQuery> {

        await this.formatSqlQuery(query);

        try {
            let primaryKey: string | undefined = undefined;
            let columns: any[] | undefined = undefined;
            let queryName: string | undefined = undefined;
            let message = 'ok';

            // Envolver la consulta original en una subconsulta
            let finalQuery = query.query;
            let totalRecords: number | undefined = undefined;
            // Para autopaginacion, establecer un valor predeterminado
            if (query instanceof SelectQuery && !query.pagination) {
                if (query.isAutoPagination === true) {
                    query.setPagination(this.SIZE_DEFAULT, 0);
                }
            }

            if (query instanceof SelectQuery && query.isWrappedQuery === true) {
                if (query instanceof SelectQuery) {
                    query.query = query.query.trim();
                    if (query.query.endsWith(';')) {
                        query.query = query.query.slice(0, -1);
                    }
                    finalQuery = `SELECT * FROM (${query.query}) AS wrapped_query`;
                }

                // Aplicar filtros dinámicos
                if (query instanceof SelectQuery && query.filters && query.filters.length > 0) {
                    const filterConditions = query.filters.map(filter => {
                        if (filter.operator === 'ILIKE') {
                            return `wrapped_query.${filter.column}::text ILIKE '%${filter.value}%'`;
                        } else {
                            return `wrapped_query.${filter.column} ${filter.operator} ${filter.value}`;
                        }
                    }).join(' AND ');
                    finalQuery += ` WHERE ${filterConditions}`;
                }

                // Aplicar filtro global
                if (query instanceof SelectQuery && query.globalFilter) {
                    const globalFilterConditions = query.globalFilter.columns
                        .map(column => `wrapped_query.${column}::text ILIKE '%${query.globalFilter.value}%'`)
                        .join(' OR ');
                    finalQuery += query.filters && query.filters.length > 0 ? ` AND (${globalFilterConditions})` : ` WHERE (${globalFilterConditions})`;
                }

                // Aplicar orden dinámico
                if (query instanceof SelectQuery && query.orderBy) {
                    const direction = query.orderBy.direction || 'ASC ';
                    finalQuery += ` ORDER BY wrapped_query.${query.orderBy.column} ${direction}`;
                }

                // Contar el total de registros     
                if (query instanceof SelectQuery) {
                    // Si no hay filtros ni filtro global, contar sobre la consulta original
                    if (!query.filters?.length && !query.globalFilter) {
                        const countQuery = `SELECT COUNT(*) FROM (${query.query}) AS count_query`;
                        const countResult = await this.pool.query(countQuery, query.params.map(_param => _param.value));
                        totalRecords = parseInt(countResult.rows[0].count, 10);
                    } else {
                        // Si hay filtros o filtro global, contar sobre la consulta final (sin paginación)
                        const countQuery = `SELECT COUNT(*) FROM (${finalQuery}) AS count_query`;
                        const countResult = await this.pool.query(countQuery, query.params.map(_param => _param.value));
                        totalRecords = parseInt(countResult.rows[0].count, 10);
                    }
                }

                // Aplicar paginación dinámica
                if (query instanceof SelectQuery && query.pagination) {
                    if (query.isAutoPagination === true) {
                        query.setPagination(query.pagination.pageSize, query.pagination.pageIndex);
                        finalQuery += ` OFFSET ${query.pagination.offset} LIMIT ${query.pagination.pageSize}`;
                    }
                }

            }

            // console.log(finalQuery);
            // Ejecutar la consulta final
            const res = await this.pool.query(finalQuery, query.params.map(_param => _param.value));

            if (query instanceof SelectQuery && query.isWrappedQuery === false) {
                totalRecords = res.rowCount;
            }

            if (query instanceof SelectQuery && query.isWrappedQuery === true) {
                if (query.pagination && totalRecords !== undefined) {
                    if (query.isAutoPagination === true) {
                        const totalPages = Math.ceil(totalRecords / query.pagination.pageSize);
                        query.setIsPreviousPage(query.pagination.pageIndex > 1);
                        query.setIsNextPage(query.pagination.pageIndex < totalPages);
                        query.setTotalPages(totalPages);
                    }
                }
            }

            // Obtener información del esquema si es necesario
            if (query instanceof SelectQuery && query.isSchema) {
                queryName = this.extractCallerInfo();
                if (isDefined(ref)) {
                    queryName = `${queryName}.${ref}`;
                }
                columns = await this.getSchemaQuery(queryName, primaryKey, res);
                if (columns.length > 0) {
                    primaryKey = columns[0].name;
                }
            }

            // Manejar auditoría
            if (query.audit) {
                let activityQuery: InsertQuery | undefined;
                if (query instanceof InsertQuery) {
                    activityQuery = this.getInsertActivityTable(query);
                } else if (query instanceof UpdateQuery) {
                    activityQuery = await this.getUpdateActivityTable(query);
                }
                if (activityQuery) {
                    await this.formatSqlQuery(activityQuery);
                    await this.pool.query(activityQuery.query, activityQuery.paramValues);
                }
            }

            // Establecer mensajes apropiados según el tipo de consulta
            if (query instanceof UpdateQuery) {
                message = res.rowCount > 0 ? `Actualización exitosa, ${res.rowCount} registros afectados` : 'No se actualizó ningún registro';
            }

            if (query instanceof DeleteQuery) {
                message = res.rowCount > 0 ? `Eliminación exitosa, ${res.rowCount} registros afectados` : 'No se eliminó ningún registro';
            }

            if (query instanceof SelectQuery && res.rowCount === 0) {
                message = `No existen registros`;
            }

            return {
                totalRecords: query instanceof SelectQuery ? totalRecords : undefined,
                pagination: query instanceof SelectQuery ? query.getPagination() : undefined,
                rowCount: res.rowCount,
                rows: query instanceof SelectQuery ? res.rows : undefined,
                message,
                columns: query instanceof SelectQuery ? columns : undefined,
                key: query instanceof SelectQuery ? primaryKey : undefined,
                queryName: query instanceof SelectQuery ? queryName : undefined,
            } as ResultQuery;

        } catch (error) {
            console.error(query);
            console.error(error);
            this.errorsLoggerService.createErrorLog(`[ERROR] createQuery`, error);
            throw new InternalServerErrorException(`[ERROR] createQuery - ${error}`);
        }
    }


    /**
     * Retorna el primer registro de una consulta en la base de datos
     * @query SelectQuery 
     * @returns Object data
     */
    async createSingleQuery(query: SelectQuery): Promise<any> {
        const data = await this.createSelectQuery(query);
        return data.length > 0 ? data[0] : null;
    }

    /**
     * Ejecuta un listado de objetos Query, control de transaccionalidad con Begin, commit, rollback
     * @param listQuery 
     * @returns 
     */
    async createListQuery(listQuery: Query[]): Promise<string[]> {
        const queryRunner = await this.pool.connect();
        const messages: string[] = [];
        try {
            await queryRunner.query('BEGIN');

            for (const currentQuery of listQuery) {
                await this.formatSqlQuery(currentQuery);
                // console.log(currentQuery);
                const res = await queryRunner.query(currentQuery.query, currentQuery.paramValues);

                // Registra  Actividad Auditoria
                if (currentQuery.audit) {
                    let activityQuery: InsertQuery | undefined;
                    if (currentQuery instanceof InsertQuery) {
                        activityQuery = this.getInsertActivityTable(currentQuery);
                    } else if (currentQuery instanceof UpdateQuery) {
                        activityQuery = await this.getUpdateActivityTable(currentQuery);
                    }
                    if (activityQuery) {
                        await this.formatSqlQuery(activityQuery);
                        await queryRunner.query(activityQuery.query, activityQuery.paramValues);
                    }
                }
                let message = 'ok';
                if (currentQuery instanceof InsertQuery)
                    message = res.rowCount > 0 ? `Creación exitosa, 1 registro afectado` : 'No se insertó ningún registro';

                if (currentQuery instanceof UpdateQuery)
                    message = res.rowCount > 0 ? `Actualización exitosa, ${res.rowCount} registros afectados` : 'No se actualizó ningún registro';

                if (currentQuery instanceof DeleteQuery)
                    message = res.rowCount > 0 ? `Eliminación exitosa, ${res.rowCount} registros afectados` : 'No se eliminó ningún registro';

                messages.push(message);
            }

            await queryRunner.query('COMMIT');
            return messages;
        } catch (error) {
            console.error(error);
            await queryRunner.query('ROLLBACK');
            this.errorsLoggerService.createErrorLog(`[ERROR] createQueryList`, error);
            throw new InternalServerErrorException(`[ERROR] createQueryList - ${error}`);
        } finally {
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

    async executeDataStore(...dataStore: DataStore[]) {
        let listQuery: Query[] = [];
        for (let ds of dataStore) {
            if (ds.listQuery.length > 0) {
                listQuery.push(...ds.listQuery);
            }
        }
        await this.createListQuery(listQuery);
    }

    async canDelete(dq: DeleteQuery, validate: boolean = true) {
        const queryRunner = await this.pool.connect();
        try {
            await queryRunner.query('BEGIN');
            await this.formatSqlQuery(dq);
            await queryRunner.query(dq.query, dq.paramValues);
            if (validate === false) {
                await queryRunner.query('COMMIT');
            }
        } catch (error) {
            if (validate === false) {
                await queryRunner.query('ROLLBACK');
            }
            throw new InternalServerErrorException(
                `Restricción eliminar - ${error}`
            );
        }
        finally {
            if (validate === true) {
                await queryRunner.query('ROLLBACK');
            }
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
        const resp = await this.createSelectQuery(pq);
        const respMap = new Map();
        resp.forEach(data => {
            respMap.set(data.nom_para, data.valor_para);
        });
        if (lowercaseArray.length !== respMap.size) {
            console.error(
                `No se encontraron todas las variables del sistema`
            );
        }
        return respMap;
    }

    // --------------------------- PRIVATE FUNCTIONS  ------------------------------ 

    /**
    * Retorna el nombre de la función que lo invoca
    * @returns 
    */
    private extractCallerInfo(): string {
        const err = new Error();
        const stackTrace = err.stack?.split('\n');

        if (stackTrace && stackTrace.length > 4) {
            const callerLine = stackTrace[4]; // Línea que contiene la información del llamador

            // Expresión regular mejorada para capturar el nombre de la función
            const match = callerLine.match(/at\s+(?:async\s+)?([^\s(]+)/);

            if (match && match[1]) {
                // Eliminamos el prefijo "async " si existe y devolvemos solo el nombre
                return match[1].trim();
            } else {
                // Log y excepción si no se puede extraer el nombre
                this.errorsLoggerService.createErrorLog(`[ERROR] No se pudo extraer el nombre del servicio: ${callerLine}`);
                throw new InternalServerErrorException(`[ERROR] No se pudo extraer el nombre del servicio`);
            }
        }

        // Log y excepción si no hay suficiente información en el stack trace
        this.errorsLoggerService.createErrorLog(`[ERROR] Stack trace insuficiente para obtener el nombre del servicio`);
        throw new InternalServerErrorException(`[ERROR] Stack trace insuficiente para obtener el nombre del servicio`);
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
        return await this.createSelectQuery(pq);
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
                const keysToDelete = [];
                // Elimina valores que no existan en las columnas de la tabla
                query.values.forEach((_value, key) => {
                    if (!query.columns.includes(key)) {
                        keysToDelete.push(key);
                    }
                });
                keysToDelete.forEach(key => query.values.delete(key));

                // Pistas de auditoría
                const tieneFechaIngre = query.columns.includes('fecha_ingre');
                const tieneHoraIngre = query.columns.includes('hora_ingre');
                const now = new Date();

                if (tieneHoraIngre && !tieneFechaIngre) {
                    query.values.set('hora_ingre', getDateTimeFormat(now));
                } else if (tieneHoraIngre && tieneFechaIngre) {
                    query.values.set('fecha_ingre', getDateFormat(now));
                    query.values.set('hora_ingre', getTimeFormat(now));
                }
                query.values.delete('hora_actua');
                query.values.delete('fecha_actua');
                getSqlInsert(query);
            }
            else if (query instanceof UpdateQuery) {
                const cols: string[] = await this.getTableColumns(query.table)
                const keysToDelete = [];
                // Elimina valores que no existan en las columnas de la tabla
                query.values.forEach((_value, key) => {
                    if (!cols.includes(key)) {
                        keysToDelete.push(key);
                    }
                });
                keysToDelete.forEach(key => query.values.delete(key));

                // Pistas de auditoría
                const tieneFechaActua = cols.includes('fecha_actua');
                const tieneHoraActua = cols.includes('hora_actua');
                const now = new Date();

                if (tieneHoraActua && !tieneFechaActua) {
                    query.values.set('hora_actua', getDateTimeFormat(now));
                } else if (tieneHoraActua && tieneFechaActua) {
                    query.values.set('fecha_actua', getDateFormat(now));
                    query.values.set('hora_actua', getTimeFormat(now));
                }
                query.values.delete('hora_ingre');
                query.values.delete('fecha_ingre');
                getSqlUpdate(query);
            }
            else if (query instanceof DeleteQuery) getSqlDelete(query);
            //  else if (query instanceof SelectQuery) getSqlSelect(query);
        }
        catch (error) {
            console.error(error);
            this.errorsLoggerService.createErrorLog(`[ERROR] formatSqlQuery`, error);
            throw new InternalServerErrorException(error);
        }
        //Valida que exista el mismo numero de $ con los valores de los parámetros
        const countParams = getCountStringInText("$", query.query);
        if (countParams !== query.paramValues.length) {
            console.error(query);
            throw new InternalServerErrorException(
                "[ERROR] Número de parámetros es diferente a la cantidad $ en el query"
            );
        }
    }

    // --------------------------- END PRIVATE FUNCTIONS  ------------------------------ 

    // --------------------------- REDIS  ------------------------------

    /**
     * Crea un key de cahce para table_columns
     * @param tableName 
     * @returns 
     */
    private getCacheKeyTableColumns(tableName: string): string {
        return `table_columns:${tableName}`;
    }

    async getTableColumns(tableName: string): Promise<string[]> {
        const cacheKey = this.getCacheKeyTableColumns(tableName);

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
        const cacheKey = this.getCacheKeyTableColumns(tableName);
        // await this.redisClient.set(cacheKey, JSON.stringify(columns), 'EX', 3600); // Cache for 1 hour
        await this.redisClient.set(cacheKey, JSON.stringify(columns));
        return columns;
    }

    /**
     * Actualiza cache de Redis de las columnas de una tabla
     */
    async updateTableColumnsCache(tableName: string): Promise<string[]> {
        const cacheKey = this.getCacheKeyTableColumns(tableName);

        // Invalidate cache
        await this.redisClient.del(cacheKey);

        // Fetch and cache the new data
        return this.fetchAndCacheTableColumns(tableName);
    }



    /**
    * Crea un key de cahce para table_columns
    * @param queryName 
    * @returns 
     */
    private getCacheKeySchemaQuery(queryName: string): string {
        return `schema:${queryName}`;
    }

    async getSchemaQuery(queryName: string, primaryKey: string, res: any): Promise<any[]> {
        const cacheKey = this.getCacheKeySchemaQuery(queryName);
        // Check cache
        const cachedSchema = await this.redisClient.get(cacheKey);
        if (cachedSchema) {
            return JSON.parse(cachedSchema);
        }
        const columnsNames: string[] = res.fields.map(field => field.name);
        const tablesID: number[] = res.fields.map(field => field.tableID);
        const resSchema = await this.getColumnsSchema(removeEqualsElements(columnsNames), removeEqualsElements(tablesID));
        const typesCols = res._types._types.builtins;
        const columns = res.fields.map((_col, index) => {
            if (index === 0) primaryKey = _col.name;
            const dataTypeCore = getTypeCoreColumn(Object.keys(typesCols).find(key => typesCols[key] === _col.dataTypeID));
            const alignColumn = getAlignCoreColumn(dataTypeCore);
            const filterType = getTypeFilterColumn(dataTypeCore);
            const [colSchema] = resSchema.filter(_element => _element['name'] === _col.name);
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
                accessorKey: _col.name,
                filterFn: filterType
            };
        });
        // await this.redisClient.set(cacheKey, JSON.stringify(columns), 'EX', 3600); // Cache for 1 hour
        await this.redisClient.set(cacheKey, JSON.stringify(columns));
        return columns;
    }

    async clearCacheRedis() {

        const patterns = ['schema:*','table_columns:*','whatsapp_config:*'];

        for (const pattern of patterns) {
            const keys = await this.redisClient.keys(pattern);
            if (keys.length > 0) {
                await this.redisClient.del(...keys);
            }
        }

        return {
            message: 'Multiple Redis key patterns cleared successfully'
        };

    }

    // --------------------------- END REDIS  ----------------------------

    // --------------------------- AUDIT ---------------------------------
    getInsertActivityTable(objInsert: InsertQuery): InsertQuery {
        const insertQuery = new InsertQuery('sis_actividad', 'ide_acti');
        insertQuery.values.set('tabla_acti', objInsert.table);
        insertQuery.values.set('valor_pk_acti', objInsert.values.get(objInsert.primaryKey));
        insertQuery.values.set('nom_acti', 'Registro Creado');
        insertQuery.values.set('ide_actti', 1); // Registro creado
        insertQuery.values.set('ide_actes', 2); // Finalizado
        insertQuery.values.set('fecha_actividad_acti', getCurrentDateTime());
        insertQuery.values.set('activo_acti', true);
        insertQuery.values.set('usuario_ingre', objInsert.values.get('usuario_ingre'));
        return insertQuery;
    }

    async getUpdateActivityTable(objUpdate: UpdateQuery): Promise<InsertQuery> {
        // Extraer y eliminar valores innecesarios del Map
        const usuarioActua = objUpdate.values.get('usuario_actua');
        const keysToDelete = ['fecha_actua', 'hora_actua', 'usuario_actua'];
        keysToDelete.forEach(key => objUpdate.values.delete(key));

        // Crear una lista de columnas restantes
        const keysArray = [...objUpdate.values.keys()];

        // Construir la consulta para obtener los valores actuales en la base de datos
        const keysString = keysArray.join(', ');
        const query = new SelectQuery(`SELECT ${keysString} FROM ${objUpdate.table} WHERE ${objUpdate.primaryKey} = ${objUpdate.valuePrimaryKey}`);
        const result = await this.createSingleQuery(query);

        // No existe registro a actualizar
        if (!isDefined(result)) {
            return undefined;
        }

        // Comparar valores y construir el historial de cambios
        const arrayChanges = keysArray.reduce((changes, key) => {
            const newValue = objUpdate.values.get(key);
            if (result[key] !== newValue) {
                changes.push({
                    campo_modificado: key,
                    valor_anterior: result[key],
                    valor_nuevo: newValue,
                    fecha_cambio: getCurrentDateTime(),
                    usuario_actua: usuarioActua,
                });
            }
            return changes;
        }, []);

        // Si no hay cambios, retornar undefined
        if (arrayChanges.length === 0) {
            return undefined;
        }

        // Construir la consulta de inserción para registrar la actividad
        const insertQuery = new InsertQuery('sis_actividad', 'ide_acti');
        insertQuery.values.set('tabla_acti', objUpdate.table);
        insertQuery.values.set('valor_pk_acti', objUpdate.valuePrimaryKey);
        insertQuery.values.set('nom_acti', 'Registro Modificado');
        insertQuery.values.set('ide_actti', 2); // Registro modificado
        insertQuery.values.set('ide_actes', 2); // Finalizado
        insertQuery.values.set('fecha_actividad_acti', getCurrentDateTime());
        insertQuery.values.set('activo_acti', true);
        insertQuery.values.set('historial_acti', JSON.stringify(arrayChanges));
        insertQuery.values.set('usuario_ingre', usuarioActua);
        return insertQuery;
    }

    // --------------------------- END AUDIT  ----------------------------
}
