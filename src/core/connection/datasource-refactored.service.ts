import { Injectable, InternalServerErrorException, Inject } from '@nestjs/common';
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
import { getCountStringInText } from '../../util/helpers/string-util';
import { Query, UpdateQuery, InsertQuery, DeleteQuery, SelectQuery, DataStore } from '../connection/helpers';

import { ResultQuery } from './interfaces/resultQuery';
import { TypeParserService } from './type-parser/type-parser.service';
import { QueryValidatorService } from './validator/query-validator.service';
import { SelectQueryBuilder } from './query-builder/select-query.builder';
import { InsertQueryBuilder } from './query-builder/insert-query.builder';
import { UpdateQueryBuilder } from './query-builder/update-query.builder';
import { DeleteQueryBuilder } from './query-builder/delete-query.builder';
import { AuditLoggerService } from '../audit/audit-logger.service';
import { ICacheProvider } from '../cache/cache.interface';
import { TableColumnsCacheService } from '../cache/table-columns.cache';
import { IQueryBuilder } from './query-builder/query-builder.interface';
import { DatabaseException } from './exceptions/database.exception';
import { UniqueConstraintViolationException } from './exceptions/unique-constraint.exception';
import { ForeignKeyViolationException } from './exceptions/foreign-key.exception';
import { InvalidQueryParametersException } from './exceptions/invalid-parameters.exception';

/**
 * DataSourceService Refactorizado
 * 
 * Responsabilidades:
 * - Orquestación de queries
 * - Delegación a QueryBuilders
 * - Mapeo de errores
 * - Gestión de transacciones
 * 
 * NO MANEJA DIRECTAMENTE:
 * - Validación (QueryValidatorService)
 * - Paginación (PaginationService)
 * - Filtros (FilterService)
 * - Type parsing (TypeParserService)
 * - Caché (CacheProvider)
 * - Auditoría (AuditLoggerService)
 */
@Injectable()
export class DataSourceService {
  public pool = new Pool({
    connectionString: envs.bdUrlPool,
  });

  constructor(
    private readonly typeParserService: TypeParserService,
    private readonly queryValidator: QueryValidatorService,
    private readonly selectQueryBuilder: SelectQueryBuilder,
    private readonly insertQueryBuilder: InsertQueryBuilder,
    private readonly updateQueryBuilder: UpdateQueryBuilder,
    private readonly deleteQueryBuilder: DeleteQueryBuilder,
    private readonly auditLogger: AuditLoggerService,
    private readonly errorsLoggerService: ErrorsLoggerService,
    private readonly cacheProvider: ICacheProvider,
    private readonly tableColumnsCacheService: TableColumnsCacheService,
    @Inject('REDIS_CLIENT') public readonly redisClient: Redis,
  ) {
    // Registrar type parsers una sola vez
    this.typeParserService.registerParsers();
  }

  /**
   * Método principal: ejecuta cualquier tipo de query
   */
  async createQuery(query: Query, ref?: string): Promise<ResultQuery> {
    try {
      // 1. VALIDAR parámetros (Early fail)
      this.queryValidator.validateQuery(query);

      // 2. FORMATEAR SQL
      await this.formatSqlQuery(query);

      // 3. CONSTRUIR Y EJECUTAR usando QueryBuilder
      const result = await this.getQueryBuilder(query).build(query);

      // 4. AUDITAR si aplica
      if (query.audit) {
        await this.auditLogger.log(query);
      }

      return result;
    } catch (error) {
      this.errorsLoggerService.createErrorLog(`[createQuery]`, error);
      throw this.mapDatabaseError(error);
    }
  }

  /**
   * Retorna el QueryBuilder correspondiente según el tipo de query
   */
  private getQueryBuilder(query: Query): IQueryBuilder {
    if (query instanceof SelectQuery) {
      return this.selectQueryBuilder;
    }
    if (query instanceof InsertQuery) {
      return this.insertQueryBuilder;
    }
    if (query instanceof UpdateQuery) {
      return this.updateQueryBuilder;
    }
    if (query instanceof DeleteQuery) {
      return this.deleteQueryBuilder;
    }

    throw new InvalidQueryParametersException('Tipo de query no soportado');
  }

  /**
   * Mapea errores de PostgreSQL a excepciones específicas
   */
  private mapDatabaseError(error: any): Error {
    // Unique constraint violation
    if (error.code === '23505') {
      return new UniqueConstraintViolationException(
        `Violación de restricción única: ${error.detail || error.message}`,
      );
    }

    // Foreign key violation
    if (error.code === '23503') {
      return new ForeignKeyViolationException(
        `Violación de clave foránea: ${error.detail || error.message}`,
      );
    }

    // Invalid type conversion
    if (error.code === '22P02') {
      return new InvalidQueryParametersException(
        `Conversión de tipo inválida: ${error.message}`,
      );
    }

    // Generic database error
    if (error instanceof InternalServerErrorException) {
      return error;
    }

    return new DatabaseException(error.message || 'Error desconocido en base de datos');
  }

  /**
   * Retorna la data de una consulta SIN paginación ni esquema
   */
  async createSelectQuery(query: SelectQuery): Promise<any[]> {
    query.isLazy = false;
    query.isSchema = false;
    const result = await this.createQuery(query);
    return result.rows || [];
  }

  /**
   * Retorna un único registro de una consulta
   */
  async createSingleQuery(query: SelectQuery): Promise<any> {
    const data = await this.createSelectQuery(query);
    return data.length > 0 ? data[0] : null;
  }

  /**
   * Ejecuta una lista de queries en transacción
   */
  async createListQuery(listQuery: Query[]): Promise<string[]> {
    const queryRunner = await this.pool.connect();
    const messages: string[] = [];

    try {
      await queryRunner.query('BEGIN');

      for (const currentQuery of listQuery) {
        await this.formatSqlQuery(currentQuery);

        const res = await queryRunner.query(
          currentQuery.query,
          currentQuery.paramValues,
        );

        // Registra auditoría si aplica
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

        const message = this.getTransactionResultMessage(currentQuery, res.rowCount);
        messages.push(message);
      }

      await queryRunner.query('COMMIT');
      return messages;
    } catch (error) {
      console.error(error);
      await queryRunner.query('ROLLBACK');
      this.errorsLoggerService.createErrorLog(`[createListQuery]`, error);
      throw new DatabaseException(`[ERROR] createListQuery - ${error}`);
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Busca un registro por clave primaria
   */
  async findOneBy(
    tableName: string,
    primaryKey: string,
    valuePrimaryKey: any,
  ): Promise<any> {
    const query = new SelectQuery(
      `SELECT * from ${tableName} where ${primaryKey} = $1`,
    );
    query.addNumberParam(1, valuePrimaryKey);
    return await this.createSingleQuery(query);
  }

  /**
   * Retorna el secuencial para el campo primario de una tabla
   */
  async getSeqTable(
    tableName: string,
    primaryKey: string,
    numberRowsAdded: number = 1,
    login: string = 'sa',
  ): Promise<number> {
    let seq = 1;
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
      throw new DatabaseException(`[ERROR] getSeqTable - ${error}`);
    }

    return seq;
  }

  /**
   * Ejecuta múltiples DataStore
   */
  async executeDataStore(...dataStore: DataStore[]) {
    let listQuery: Query[] = [];
    for (let ds of dataStore) {
      if (ds.listQuery.length > 0) {
        listQuery.push(...ds.listQuery);
      }
    }
    await this.createListQuery(listQuery);
  }

  /**
   * Valida si un DELETE es posible (sin ejecutar)
   */
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
      throw new DatabaseException(`Restricción eliminar - ${error}`);
    } finally {
      if (validate === true) {
        await queryRunner.query('ROLLBACK');
      }
      await queryRunner.release();
    }
  }

  /**
   * Obtiene las columnas de una tabla (con caché)
   */
  async getTableColumns(tableName: string): Promise<string[]> {
    // 1. Intentar obtener del caché
    let columns = await this.tableColumnsCacheService.getTableColumns(tableName);

    if (columns) {
      return columns;
    }

    // 2. Obtener de BD
    columns = await this.fetchAndCacheTableColumns(tableName);

    // 3. Guardar en caché
    await this.tableColumnsCacheService.setTableColumns(tableName, columns);

    return columns;
  }

  /**
   * Actualiza el caché de columnas de una tabla
   */
  async updateTableColumnsCache(tableName: string): Promise<string[]> {
    await this.tableColumnsCacheService.invalidateTableColumns(tableName);
    return await this.fetchAndCacheTableColumns(tableName);
  }

  /**
   * Limpia todo el caché de Redis
   */
  async clearCacheRedis() {
    const patterns = ['schema:*', 'table_columns:*', 'whatsapp_config:*', 'empresa:*'];

    for (const pattern of patterns) {
      await this.cacheProvider.delPattern(pattern);
    }

    return {
      message: 'Multiple Redis key patterns cleared successfully',
    };
  }

  // ======================== PRIVATE METHODS ========================

  /**
   * Formatea el SQL query según su tipo
   */
  private async formatSqlQuery(query: Query) {
    try {
      if (query instanceof InsertQuery) {
        await this.formatInsertQuery(query);
      } else if (query instanceof UpdateQuery) {
        await this.formatUpdateQuery(query);
      } else if (query instanceof DeleteQuery) {
        getSqlDelete(query);
      }
    } catch (error) {
      console.error(error);
      this.errorsLoggerService.createErrorLog(`[formatSqlQuery]`, error);
      throw new DatabaseException(error);
    }

    // Validar que número de parámetros coincida
    const countParams = getCountStringInText('$', query.query);
    if (countParams !== query.paramValues.length) {
      console.error(query);
      throw new InvalidQueryParametersException(
        `[ERROR] Número de parámetros (${countParams}) no coincide con valores (${query.paramValues.length})`,
      );
    }
  }

  private async formatInsertQuery(query: InsertQuery) {
    if (query.columns.length === 0) {
      query.columns = await this.getTableColumns(query.table);
    }

    const keysToDelete = [];
    query.values.forEach((_value, key) => {
      if (!query.columns.includes(key)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((key) => query.values.delete(key));

    // Auditoría: fecha_ingre y hora_ingre
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

  private async formatUpdateQuery(query: UpdateQuery) {
    const cols: string[] = await this.getTableColumns(query.table);
    const keysToDelete = [];

    query.values.forEach((_value, key) => {
      if (!cols.includes(key)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((key) => query.values.delete(key));

    // Auditoría: fecha_actua y hora_actua
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

  private async fetchAndCacheTableColumns(tableName: string): Promise<string[]> {
    const query = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
    `;
    const result = await this.pool.query(query, [tableName]);
    return result.rows.map((row) => row.column_name);
  }

  private getTransactionResultMessage(query: Query, rowCount: number): string {
    if (query instanceof InsertQuery) {
      return rowCount > 0
        ? `Creación exitosa, ${rowCount} registro afectado`
        : 'No se insertó ningún registro';
    }

    if (query instanceof UpdateQuery) {
      return rowCount > 0
        ? `Actualización exitosa, ${rowCount} registros afectados`
        : 'No se actualizó ningún registro';
    }

    if (query instanceof DeleteQuery) {
      return rowCount > 0
        ? `Eliminación exitosa, ${rowCount} registros afectados`
        : 'No se eliminó ningún registro';
    }

    return 'ok';
  }

  // Legacy methods para backward compatibility
  private getInsertActivityTable(objInsert: InsertQuery): InsertQuery {
    const valuesObject = Object.fromEntries(objInsert.values);
    const insertQuery = new InsertQuery('sis_actividad', 'ide_acti');
    insertQuery.values.set('tabla_acti', objInsert.table);
    insertQuery.values.set('valor_pk_acti', objInsert.values.get(objInsert.primaryKey));
    insertQuery.values.set('nom_acti', 'Registro Creado');
    insertQuery.values.set('ide_actti', 1);
    insertQuery.values.set('ide_actes', 2);
    insertQuery.values.set('fecha_actividad_acti', getCurrentDateTime());
    insertQuery.values.set('activo_acti', true);
    insertQuery.values.set('usuario_ingre', objInsert.values.get('usuario_ingre'));
    insertQuery.values.set('historial_acti', JSON.stringify(valuesObject));
    return insertQuery;
  }

  private getDeleteActivityTable(objDelete: DeleteQuery): InsertQuery {
    const deletetQuery = new InsertQuery('sis_actividad', 'ide_acti');
    deletetQuery.values.set('tabla_acti', objDelete.table);
    deletetQuery.values.set('valor_pk_acti', objDelete.ide);
    deletetQuery.values.set('nom_acti', 'Registro Eliminado');
    deletetQuery.values.set('ide_actti', 3);
    deletetQuery.values.set('ide_actes', 2);
    deletetQuery.values.set('fecha_actividad_acti', getCurrentDateTime());
    deletetQuery.values.set('activo_acti', true);
    deletetQuery.values.set('usuario_ingre', objDelete.header?.login);
    return deletetQuery;
  }

  private async getUpdateActivityTable(objUpdate: UpdateQuery): Promise<InsertQuery | undefined> {
    const usuarioActua = objUpdate.values.get('usuario_actua');
    const keysToDelete = ['fecha_actua', 'hora_actua', 'usuario_actua'];
    keysToDelete.forEach((key) => objUpdate.values.delete(key));

    const keysArray = [...objUpdate.values.keys()];
    const keysString = keysArray.join(', ');
    const query = new SelectQuery(
      `SELECT ${keysString} FROM ${objUpdate.table} WHERE ${objUpdate.primaryKey} = ${objUpdate.valuePrimaryKey}`,
    );
    const result = await this.createSingleQuery(query);

    if (!isDefined(result)) {
      return undefined;
    }

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

    if (arrayChanges.length === 0) {
      return undefined;
    }

    const insertQuery = new InsertQuery('sis_actividad', 'ide_acti');
    insertQuery.values.set('tabla_acti', objUpdate.table);
    insertQuery.values.set('valor_pk_acti', objUpdate.valuePrimaryKey);
    insertQuery.values.set('nom_acti', 'Registro Modificado');
    insertQuery.values.set('ide_actti', 2);
    insertQuery.values.set('ide_actes', 2);
    insertQuery.values.set('fecha_actividad_acti', getCurrentDateTime());
    insertQuery.values.set('activo_acti', true);
    insertQuery.values.set('historial_acti', JSON.stringify(arrayChanges));
    insertQuery.values.set('usuario_ingre', usuarioActua);
    return insertQuery;
  }
}
