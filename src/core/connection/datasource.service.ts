import { createHash } from 'crypto';

import { Injectable, InternalServerErrorException, Inject, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { Pool, types } from 'pg';
import { envs } from 'src/config/envs';

import { ErrorsLoggerService } from '../../errors/errors-logger.service';
import { removeEqualsElements } from '../../util/helpers/array-util';
import { isDefined } from '../../util/helpers/common-util';
import {
  getCurrentDateTime,
  getDateTimeFormat,
  getTimeFormat,
  getTimeISOFormat,
  getDateFormat,
} from '../../util/helpers/date-util';
import {
  getTypeCoreColumn,
  getAlignCoreColumn,
  getSizeCoreColumn,
  getDefaultValueColumn,
  getComponentColumn,
  getVisibleCoreColumn,
  getSqlInsert,
  getSqlUpdate,
  getSqlDelete,
  getTypeFilterColumn,
} from '../../util/helpers/sql-util';
import { Query, UpdateQuery, InsertQuery, DeleteQuery, SelectQuery, DataStore } from '../connection/helpers';

import { ResultQuery } from './interfaces/resultQuery';

@Injectable()
export class DataSourceService {
  private readonly logger = new Logger(DataSourceService.name);

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
    @Inject('REDIS_CLIENT') public readonly redisClient: Redis,
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
   * @param queryName nombre explícito de la query (opcional)
   * @returns Array data
   */
  async createSelectQuery(query: SelectQuery, queryName: string = undefined): Promise<any[]> {
    query.isLazy = false;
    query.isSchema = false;
    const result = await this.createQuery(query, undefined, queryName);
    return result.rows || [];
  }

  /**
   * Retorna la data de una consulta en la base de datos mediante el Pool pg
   * @param Query
   * @param ref referencia cuando se utiliza una función getTableQuery para poder identificarla
   * @param queryName nombre explícito de la query (opcional)
   * @returns Array data
   */
  async createQuery(query: Query, ref = undefined, queryName: string = undefined): Promise<ResultQuery> {
    await this.formatSqlQuery(query);

    try {
      let primaryKey: string | undefined;
      let columns: any[] | undefined;
      let finalQueryName: string | undefined;
      let message = 'ok';
      let finalQuery = query.query;
      let totalRecords: number | undefined;
      let totalFilterRecords: number | undefined;
      // Handle SelectQuery specific logic
      if (query instanceof SelectQuery) {
        const selectQuery = query as SelectQuery;

        // Initialize default pagination if needed
        if (!selectQuery.pagination && selectQuery.isLazy) {
          selectQuery.setPagination(this.SIZE_DEFAULT, 0);
        }

        // Prepare base query
        finalQuery = this.prepareBaseQuery(selectQuery);

        // Apply filters and ordering
        finalQuery = this.applyFiltersAndOrdering(selectQuery, finalQuery);

        // Calculate total records
        if (selectQuery.isLazy) {
          // Total sin filtros (totalRecords)
          totalRecords = await this.calculateTotalRecordsWithoutFilters(selectQuery);

          // Total con filtros (totalFilterRecords) solo si hay filtros aplicados
          if (selectQuery.filters?.length > 0 || selectQuery.globalFilter) {
            totalFilterRecords = await this.calculateTotalRecordsWithFilters(selectQuery, finalQuery);
          }
        }

        // Apply pagination
        if (selectQuery.isLazy && selectQuery.pagination) {
          finalQuery = this.applyPagination(selectQuery, finalQuery, totalRecords);
        }

        // Set pagination metadata
        if (selectQuery.isLazy && selectQuery.pagination && totalRecords !== undefined) {
          this.setPaginationMetadata(selectQuery, totalRecords);
        }
      }

      // Execute the final query
      const res = await this.pool.query(
        finalQuery,
        query.params.map((_param) => _param.value),
      );

      // Set total records for non-lazy select queries
      if (query instanceof SelectQuery && !query.isLazy) {
        totalRecords = res.rowCount;
      }

      // Set appropriate message based on query type
      message = this.getResultMessage(query, res.rowCount);

      // Obtener información del esquema si es necesario
      if (query instanceof SelectQuery && query.isSchema) {
        // Usar el queryName proporcionado, o generar uno basado en el contenido SQL
        finalQueryName = queryName || this.generateQueryNameFromSQL(query.query);

        if (isDefined(ref)) {
          finalQueryName = `${finalQueryName}.${ref}`;
        }
        columns = await this.getSchemaQuery(finalQueryName, primaryKey, res);
        if (columns && columns.length > 0) {
          // Elimina id duplicados
          const seen = new Set();
          columns = columns.filter((col) => {
            if (seen.has(col.name)) {
              return false;
            }
            seen.add(col.name);
            return true;
          });
        }
        if (columns.length > 0) {
          primaryKey = columns[0].name;
        }
      }

      // Handle audit logging
      if (query.audit) {
        await this.handleAuditLogging(query);
      }

      return {
        totalRecords: query instanceof SelectQuery ? totalRecords : undefined,
        totalFilterRecords: query instanceof SelectQuery ? totalFilterRecords : undefined,
        pagination: query instanceof SelectQuery ? query.getPagination() : undefined,
        rowCount: res.rowCount,
        rows: query instanceof SelectQuery ? res.rows : undefined,
        message,
        columns: query instanceof SelectQuery ? columns : undefined,
        key: query instanceof SelectQuery ? primaryKey : undefined,
        queryName: query instanceof SelectQuery ? finalQueryName : undefined,
      } as ResultQuery;
    } catch (error) {
      // console.error(query);
      // console.error(error);
      this.errorsLoggerService.createErrorLog(`[ERROR] createQuery`, error);
      throw new InternalServerErrorException(`${error}`);
    }
  }

  // Helper methods extracted from the main function:

  private prepareBaseQuery(selectQuery: SelectQuery): string {
    let query = selectQuery.query.trim();
    if (query.endsWith(';')) {
      query = query.slice(0, -1);
    }
    return `SELECT * FROM (${query}) AS wrapped_query`;
  }

  private applyFiltersAndOrdering(selectQuery: SelectQuery, baseQuery: string): string {
    let query = baseQuery;

    // Apply individual filters
    if (selectQuery.filters?.length > 0) {
      const filterConditions = selectQuery.filters
        .map((filter) =>
          filter.operator === 'ILIKE'
            ? `wrapped_query.${filter.column}::text ILIKE '%${filter.value}%'`
            : `wrapped_query.${filter.column} ${filter.operator} ${filter.value}`,
        )
        .join(' AND ');
      query += ` WHERE ${filterConditions}`;
    }

    // Apply global filter
    if (selectQuery.globalFilter) {
      const globalFilterConditions = selectQuery.globalFilter.columns
        .map((column) => `wrapped_query.${column}::text ILIKE '%${selectQuery.globalFilter.value}%'`)
        .join(' OR ');
      query += selectQuery.filters?.length ? ` AND (${globalFilterConditions})` : ` WHERE (${globalFilterConditions})`;
    }

    // Apply ordering
    if (selectQuery.orderBy) {
      const direction = selectQuery.orderBy.direction || 'ASC';
      query += ` ORDER BY wrapped_query.${selectQuery.orderBy.column} ${direction}`;
    }

    return query;
  }

  // calcular los totales
  private async calculateTotalRecordsWithoutFilters(selectQuery: SelectQuery): Promise<number> {
    const countQuery = `SELECT COUNT(*) FROM (${selectQuery.query}) AS count_query`;
    const countResult = await this.pool.query(
      countQuery,
      selectQuery.params.map((_param) => _param.value),
    );
    return parseInt(countResult.rows[0].count, 10);
  }

  private async calculateTotalRecordsWithFilters(selectQuery: SelectQuery, filteredQuery: string): Promise<number> {
    const countQuery = `SELECT COUNT(*) FROM (${filteredQuery}) AS count_query`;
    const countResult = await this.pool.query(
      countQuery,
      selectQuery.params.map((_param) => _param.value),
    );
    return parseInt(countResult.rows[0].count, 10);
  }

  private applyPagination(selectQuery: SelectQuery, query: string, totalRecords?: number): string {
    if (!selectQuery.pagination) {
      return query;
    }

    // Si lastPage es true y tenemos totalRecords, calculamos la última página
    if (selectQuery.lastPage && totalRecords !== undefined) {
      const pageSize = selectQuery.pagination.pageSize;
      const lastPageIndex = Math.ceil(totalRecords / pageSize) - 1;
      const lastPageOffset = Math.max(0, lastPageIndex * pageSize);

      // Actualizamos la paginación
      selectQuery.setPagination(pageSize, lastPageIndex);
      selectQuery.setTotalPages(Math.ceil(totalRecords / pageSize));
      selectQuery.setIsNextPage(false);
      selectQuery.setIsPreviousPage(lastPageIndex > 0);

      return `${query} OFFSET ${lastPageOffset} LIMIT ${pageSize}`;
    }

    // Comportamiento normal si lastPage es false o no tenemos totalRecords
    selectQuery.setPagination(selectQuery.pagination.pageSize, selectQuery.pagination.pageIndex);
    return `${query} OFFSET ${selectQuery.pagination.offset} LIMIT ${selectQuery.pagination.pageSize}`;
  }

  private setPaginationMetadata(selectQuery: SelectQuery, totalRecords: number): void {
    const totalPages = Math.ceil(totalRecords / selectQuery.pagination.pageSize);
    selectQuery.setIsPreviousPage(selectQuery.pagination.pageIndex > 1);
    selectQuery.setIsNextPage(selectQuery.pagination.pageIndex < totalPages);
    selectQuery.setTotalPages(totalPages);
  }

  private getResultMessage(query: Query, rowCount: number): string {
    if (query instanceof UpdateQuery) {
      return rowCount > 0
        ? `Actualización exitosa, ${rowCount} registros afectados`
        : 'No se actualizó ningún registro';
    }
    if (query instanceof DeleteQuery) {
      return rowCount > 0 ? `Eliminación exitosa, ${rowCount} registros afectados` : 'No se eliminó ningún registro';
    }
    if (query instanceof SelectQuery && rowCount === 0) {
      return 'No existen registros';
    }
    return 'ok';
  }

  private async handleAuditLogging(query: Query): Promise<void> {
    let activityQuery: InsertQuery | UpdateQuery | DeleteQuery;
    if (query instanceof InsertQuery) {
      activityQuery = this.getInsertActivityTable(query);
    } else if (query instanceof UpdateQuery) {
      activityQuery = await this.getUpdateActivityTable(query);
    } else if (query instanceof DeleteQuery) {
      activityQuery = this.getDeleteActivityTable(query);
    }

    if (activityQuery) {
      await this.formatSqlQuery(activityQuery);
      await this.pool.query(activityQuery.query, activityQuery.paramValues);
    }
  }

  /**
   * Retorna el primer registro de una consulta en la base de datos
   * @query SelectQuery
   * @param queryName nombre explícito de la query (opcional)
   * @returns Object data
   */
  async createSingleQuery(query: SelectQuery, queryName: string = undefined): Promise<any> {
    const data = await this.createSelectQuery(query, queryName);
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
        //  console.log(currentQuery);
        const res = await queryRunner.query(currentQuery.query, currentQuery.paramValues);

        // Registra  Actividad Auditoria
        if (currentQuery.audit) {
          let activityQuery: InsertQuery | undefined;
          if (currentQuery instanceof InsertQuery) {
            activityQuery = this.getInsertActivityTable(currentQuery);
          } else if (currentQuery instanceof UpdateQuery) {
            activityQuery = await this.getUpdateActivityTable(currentQuery);
          } else if (currentQuery instanceof DeleteQuery) {
            activityQuery = this.getDeleteActivityTable(currentQuery);
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
          message =
            res.rowCount > 0
              ? `Actualización exitosa, ${res.rowCount} registros afectados`
              : 'No se actualizó ningún registro';

        if (currentQuery instanceof DeleteQuery)
          message =
            res.rowCount > 0
              ? `Eliminación exitosa, ${res.rowCount} registros afectados`
              : 'No se eliminó ningún registro';

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
  async getSeqTable(
    tableName: string,
    primaryKey: string,
    numberRowsAdded: number = 1,
    login: string = 'sa',
  ): Promise<number> {
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
        throw new InternalServerErrorException(`[ERROR] getSeqTable - ${error}`);
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
      throw new InternalServerErrorException(`Restricción eliminar - ${error}`);
    } finally {
      if (validate === true) {
        await queryRunner.query('ROLLBACK');
      }
      await queryRunner.release();
    }
  }

  // --------------------------- PRIVATE FUNCTIONS  ------------------------------

  /**
   * Genera un nombre único para la query basado en su contenido SQL
   * Usa un hash corto del SQL para identificación en cache
   * @param sqlQuery 
   * @returns 
   */
  private generateQueryNameFromSQL(sqlQuery: string): string {
    // Normalizar la query: quitar espacios extras, saltos de línea
    const normalized = sqlQuery
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    // Generar hash corto (primeros 8 caracteres)
    const hash = createHash('md5').update(normalized).digest('hex').substring(0, 8);

    // Intentar extraer nombre de tabla principal
    const tableMatch = normalized.match(/from\s+([a-z_]+)/);
    const tableName = tableMatch ? tableMatch[1] : 'query';

    return `${tableName}_${hash}`;
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
          query.columns = await this.getTableColumns(query.table);
        }
        const keysToDelete = [];
        // Elimina valores que no existan en las columnas de la tabla
        query.values.forEach((_value, key) => {
          if (!query.columns.includes(key)) {
            keysToDelete.push(key);
          }
        });
        keysToDelete.forEach((key) => query.values.delete(key));

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
      } else if (query instanceof UpdateQuery) {
        const cols: string[] = await this.getTableColumns(query.table);
        const keysToDelete = [];
        // Elimina valores que no existan en las columnas de la tabla
        query.values.forEach((_value, key) => {
          if (!cols.includes(key)) {
            keysToDelete.push(key);
          }
        });
        keysToDelete.forEach((key) => query.values.delete(key));

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
      } else if (query instanceof DeleteQuery) getSqlDelete(query);
      //  else if (query instanceof SelectQuery) getSqlSelect(query);
    } catch (error) {
      console.error(error);
      this.errorsLoggerService.createErrorLog(`[ERROR] formatSqlQuery`, error);
      throw new InternalServerErrorException(error);
    }
    //Valida que exista el mismo numero de $ con los valores de los parámetros
    // Permite reusar el mismo parámetro múltiples veces (ej: $1 aparece 2 veces)
    const parameterMatches = query.query.match(/\$(\d+)/g);

    if (parameterMatches) {
      // Obtener índices únicos (puede haber $1 repetido múltiples veces)
      const uniqueIndices = new Set(
        parameterMatches.map(param => parseInt(param.substring(1)))
      );

      if (uniqueIndices.size !== query.paramValues.length) {
        console.error(query);
        throw new InternalServerErrorException(
          `[ERROR] Query espera ${uniqueIndices.size} parámetros únicos pero se proporcionaron ${query.paramValues.length}`
        );
      }
    } else if (query.paramValues.length > 0) {
      console.error(query);
      throw new InternalServerErrorException('[ERROR] Query no contiene parámetros pero se proporcionaron valores');
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
    const columns = result.rows.map((row) => row.column_name);

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
    const columnsNames: string[] = res.fields.map((field) => field.name);
    const tablesID: number[] = res.fields.map((field) => field.tableID);
    const resSchema = await this.getColumnsSchema(removeEqualsElements(columnsNames), removeEqualsElements(tablesID));
    const typesCols = res._types._types.builtins;
    const columns = res.fields.map((_col, index) => {
      if (index === 0) primaryKey = _col.name;
      const dataTypeCore = getTypeCoreColumn(Object.keys(typesCols).find((key) => typesCols[key] === _col.dataTypeID));
      const alignColumn = getAlignCoreColumn(dataTypeCore);
      const filterType = getTypeFilterColumn(dataTypeCore);
      const [colSchema] = resSchema.filter((_element) => _element['name'] === _col.name);
      const sizeColumn = getSizeCoreColumn(dataTypeCore, colSchema?.length || 0);
      const defaultValue = getDefaultValueColumn(
        Object.keys(typesCols).find((key) => typesCols[key] === _col.dataTypeID),
      );
      const componentCore = getComponentColumn(
        Object.keys(typesCols).find((key) => typesCols[key] === _col.dataTypeID),
      );
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
        filterFn: filterType,
      };
    });
    // await this.redisClient.set(cacheKey, JSON.stringify(columns), 'EX', 3600); // Cache for 1 hour
    await this.redisClient.set(cacheKey, JSON.stringify(columns));
    return columns;
  }

  async clearCacheRedis() {
    const patterns = ['schema:*', 'table_columns:*', 'whatsapp_config:*', 'empresa:*'];

    for (const pattern of patterns) {
      const keys = await this.redisClient.keys(pattern);
      if (keys.length > 0) {
        await this.redisClient.del(...keys);
      }
    }

    return {
      message: 'Multiple Redis key patterns cleared successfully',
    };
  }

  // --------------------------- END REDIS  ----------------------------

  // --------------------------- AUDIT ---------------------------------
  getInsertActivityTable(objInsert: InsertQuery): InsertQuery {
    const valuesObject = Object.fromEntries(objInsert.values);
    const insertQuery = new InsertQuery('sis_actividad', 'ide_acti');
    insertQuery.values.set('tabla_acti', objInsert.table);
    insertQuery.values.set('valor_pk_acti', objInsert.values.get(objInsert.primaryKey));
    insertQuery.values.set('nom_acti', 'Registro Creado');
    insertQuery.values.set('ide_actti', 1); // Registro creado
    insertQuery.values.set('ide_actes', 2); // Finalizado
    insertQuery.values.set('fecha_actividad_acti', getCurrentDateTime());
    insertQuery.values.set('activo_acti', true);
    insertQuery.values.set('usuario_ingre', objInsert.values.get('usuario_ingre'));
    insertQuery.values.set('historial_acti', JSON.stringify(valuesObject));
    return insertQuery;
  }

  getDeleteActivityTable(objDelete: DeleteQuery): InsertQuery {
    this.logger.debug('Generando query de actividad para eliminación');
    const deletetQuery = new InsertQuery('sis_actividad', 'ide_acti');
    deletetQuery.values.set('tabla_acti', objDelete.table);
    deletetQuery.values.set('valor_pk_acti', objDelete.ide);
    deletetQuery.values.set('nom_acti', 'Registro Eliminado');
    deletetQuery.values.set('ide_actti', 3); // Registro eliminado
    deletetQuery.values.set('ide_actes', 2); // Finalizado
    deletetQuery.values.set('fecha_actividad_acti', getCurrentDateTime());
    deletetQuery.values.set('activo_acti', true);
    deletetQuery.values.set('usuario_ingre', objDelete.header.login);
    return deletetQuery;
  }

  async getUpdateActivityTable(objUpdate: UpdateQuery): Promise<InsertQuery> {
    // Extraer y eliminar valores innecesarios del Map
    const usuarioActua = objUpdate.values.get('usuario_actua');
    const keysToDelete = ['fecha_actua', 'hora_actua', 'usuario_actua'];
    keysToDelete.forEach((key) => objUpdate.values.delete(key));

    // Crear una lista de columnas restantes
    const keysArray = [...objUpdate.values.keys()];

    // Construir la consulta para obtener los valores actuales en la base de datos
    const keysString = keysArray.join(', ');
    const query = new SelectQuery(
      `SELECT ${keysString} FROM ${objUpdate.table} WHERE ${objUpdate.primaryKey} = ${objUpdate.valuePrimaryKey}`,
    );
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
