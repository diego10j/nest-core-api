# 🎯 PLAN IMPLEMENTACIÓN FASE 1: Refactorización DataSource

## 📋 CAMBIOS A REALIZAR EN ORDEN DE PRIORIDAD

### ✅ IMPLEMENTADO (FASE 1)

1. **TypeParserService** ✓
   - Extrae la configuración de type parsers de PostgreSQL
   - Centraliza todos los OID en constantes
   - Responsable únicamente de registrar parsers

2. **QueryValidatorService** ✓
   - Valida parámetros antes de ejecutar queries
   - Valida integridad según tipo de query
   - Lanza excepciones específicas

3. **PaginationService** ✓
   - Calcula offsets y límites
   - Gestiona metadatos de paginación
   - Maneja lastPage flag

4. **FilterService** ✓
   - Construye cláusulas WHERE
   - Soporta filtros individuales y globales
   - Maneja múltiples operadores

5. **Cache Abstraction** ✓
   - ICacheProvider (interfaz)
   - RedisCacheProvider (implementación)
   - TableColumnsCacheService (caso de uso específico)

6. **Custom Exceptions** ✓
   - InvalidQueryException
   - InvalidQueryParametersException
   - UniqueConstraintViolationException
   - ForeignKeyViolationException
   - DatabaseException

---

## 📝 PRÓXIMAS FASES (NO IMPLEMENTADAS AÚN)

### FASE 2: QueryBuilders

```typescript
// core/connection/query-builder/query-builder.interface.ts
export interface IQueryBuilder {
  validate(query: Query): void;
  build(query: Query): Promise<ResultQuery>;
}

// core/connection/query-builder/select-query.builder.ts
@Injectable()
export class SelectQueryBuilder implements IQueryBuilder {
  constructor(
    private readonly paginationService: PaginationService,
    private readonly filterService: FilterService,
    private readonly queryValidator: QueryValidatorService,
    private readonly pool: Pool,
    private readonly cacheProvider: ICacheProvider,
  ) {}

  async build(query: SelectQuery): Promise<ResultQuery> {
    // 1. Inicializar paginación por defecto
    this.paginationService.initializeDefaultPagination(query);

    // 2. Preparar query base
    const baseQuery = this.prepareBaseQuery(query);

    // 3. Aplicar filtros y ordenamiento
    const filteredQuery = this.filterService.applyFilters(baseQuery, query);

    // 4. Calcular totales
    const totalRecords = await this.calculateTotalRecords(query);
    const totalFilterRecords = this.shouldCalculateFilterTotal(query)
      ? await this.calculateFilteredTotal(filteredQuery, query)
      : undefined;

    // 5. Aplicar paginación
    const paginationClause = this.paginationService.getSqlPaginationClause(
      query,
      totalRecords,
    );
    const finalQuery = filteredQuery + paginationClause;

    // 6. Ejecutar
    const result = await this.pool.query(
      finalQuery,
      query.paramValues,
    );

    // 7. Establecer metadatos
    this.paginationService.setMetadata(query, totalRecords);

    // 8. Obtener esquema si es necesario
    const columns = query.isSchema ? await this.getSchemaColumns(result) : undefined;

    return {
      totalRecords,
      totalFilterRecords,
      pagination: query.getPagination(),
      rowCount: result.rowCount,
      rows: result.rows,
      message: this.getResultMessage(result.rowCount),
      columns,
    };
  }

  private prepareBaseQuery(selectQuery: SelectQuery): string {
    let query = selectQuery.query.trim();
    if (query.endsWith(';')) {
      query = query.slice(0, -1);
    }
    return `SELECT * FROM (${query}) AS wrapped_query`;
  }

  private async calculateTotalRecords(selectQuery: SelectQuery): Promise<number> {
    const countQuery = `SELECT COUNT(*) as count FROM (${selectQuery.query}) AS count_query`;
    const result = await this.pool.query(countQuery, selectQuery.paramValues);
    return parseInt(result.rows[0].count, 10);
  }

  private shouldCalculateFilterTotal(selectQuery: SelectQuery): boolean {
    return (selectQuery.filters?.length || 0) > 0 || !!selectQuery.globalFilter;
  }

  // ... más métodos
}

// core/connection/query-builder/insert-query.builder.ts
@Injectable()
export class InsertQueryBuilder implements IQueryBuilder {
  // Similar structure
}

// core/connection/query-builder/update-query.builder.ts
@Injectable()
export class UpdateQueryBuilder implements IQueryBuilder {
  // Similar structure
}

// core/connection/query-builder/delete-query.builder.ts
@Injectable()
export class DeleteQueryBuilder implements IQueryBuilder {
  // Similar structure
}
```

### FASE 3: AuditLoggerService Refactorizado

```typescript
// core/audit/audit-logger.service.ts
@Injectable()
export class AuditLoggerService {
  constructor(
    private readonly dataSource: DataSourceService,
  ) {}

  async log(query: Query): Promise<void> {
    if (query instanceof InsertQuery) {
      await this.logInsert(query);
    } else if (query instanceof UpdateQuery) {
      await this.logUpdate(query);
    } else if (query instanceof DeleteQuery) {
      await this.logDelete(query);
    }
  }

  private async logInsert(query: InsertQuery): Promise<void> {
    const activityQuery = new InsertQuery('sis_actividad', 'ide_acti');
    // ... construir query
    await this.dataSource.createQuery(activityQuery);
  }

  private async logUpdate(query: UpdateQuery): Promise<void> {
    // Obtener valores anteriores
    const previousValues = await this.getPreviousValues(query);
    
    const changes = this.calculateChanges(query, previousValues);
    
    if (changes.length === 0) {
      return; // No hay cambios
    }

    const activityQuery = new InsertQuery('sis_actividad', 'ide_acti');
    // ... construir query con cambios
    await this.dataSource.createQuery(activityQuery);
  }

  private async logDelete(query: DeleteQuery): Promise<void> {
    const activityQuery = new InsertQuery('sis_actividad', 'ide_acti');
    // ... construir query
    await this.dataSource.createQuery(activityQuery);
  }

  private calculateChanges(query: UpdateQuery, previousValues: any): any[] {
    // Lógica de cálculo de cambios
  }
}
```

### FASE 4: Refactorizar DataSourceService

```typescript
// core/connection/datasource.service.ts (REFACTORIZADO)
@Injectable()
export class DataSourceService {
  constructor(
    private readonly pool: Pool,
    private readonly typeParserService: TypeParserService,
    private readonly cacheProvider: ICacheProvider,
    private readonly tableColumnsCacheService: TableColumnsCacheService,
    private readonly queryValidator: QueryValidatorService,
    private readonly selectQueryBuilder: SelectQueryBuilder,
    private readonly insertQueryBuilder: InsertQueryBuilder,
    private readonly updateQueryBuilder: UpdateQueryBuilder,
    private readonly deleteQueryBuilder: DeleteQueryBuilder,
    private readonly auditLogger: AuditLoggerService,
    private readonly errorsLogger: ErrorsLoggerService,
  ) {
    this.typeParserService.registerParsers();
  }

  /**
   * Ejecuta un query y retorna el resultado
   */
  async createQuery(query: Query, ref?: string): Promise<ResultQuery> {
    try {
      // 1. Validar
      this.queryValidator.validateQuery(query);

      // 2. Formatear
      await this.formatSqlQuery(query);

      // 3. Construir y ejecutar
      const result = await this.getQueryBuilder(query).build(query);

      // 4. Auditar si aplica
      if (query.audit) {
        await this.auditLogger.log(query);
      }

      return result;
    } catch (error) {
      this.errorsLogger.createErrorLog('createQuery', error);
      throw this.mapDatabaseError(error);
    }
  }

  private getQueryBuilder(query: Query): IQueryBuilder {
    if (query instanceof SelectQuery) return this.selectQueryBuilder;
    if (query instanceof InsertQuery) return this.insertQueryBuilder;
    if (query instanceof UpdateQuery) return this.updateQueryBuilder;
    if (query instanceof DeleteQuery) return this.deleteQueryBuilder;
    
    throw new InvalidQueryException('Tipo de query no soportado');
  }

  private mapDatabaseError(error: any): Error {
    // Mapear errores específicos de PostgreSQL
    if (error.code === '23505') {
      return new UniqueConstraintViolationException(
        `Violación de restricción única: ${error.detail}`,
      );
    }
    if (error.code === '23503') {
      return new ForeignKeyViolationException(
        `Violación de clave foránea: ${error.detail}`,
      );
    }
    if (error.code === '22P02') {
      return new InvalidQueryParametersException(
        `Conversión de tipo inválida: ${error.message}`,
      );
    }
    return new DatabaseException(error.message);
  }

  private async formatSqlQuery(query: Query): Promise<void> {
    // ... lógica de formateo (igual a actual)
  }

  // Métodos heredados
  async createSelectQuery(query: SelectQuery): Promise<any[]> {
    query.isLazy = false;
    query.isSchema = false;
    const result = await this.createQuery(query);
    return result.rows || [];
  }

  async createSingleQuery(query: SelectQuery): Promise<any> {
    const data = await this.createSelectQuery(query);
    return data.length > 0 ? data[0] : null;
  }

  async getTableColumns(tableName: string): Promise<string[]> {
    // Usar tableColumnsCacheService
    let columns = await this.tableColumnsCacheService.getTableColumns(tableName);
    
    if (!columns) {
      columns = await this.fetchTableColumns(tableName);
      await this.tableColumnsCacheService.setTableColumns(tableName, columns);
    }

    return columns;
  }

  async updateTableColumnsCache(tableName: string): Promise<string[]> {
    return await this.tableColumnsCacheService.invalidateTableColumns(tableName);
  }

  async clearCacheRedis(): Promise<any> {
    await this.tableColumnsCacheService.invalidateAllTableColumns();
    await this.cacheProvider.delPattern('schema:*');
    await this.cacheProvider.delPattern('whatsapp_config:*');
    await this.cacheProvider.delPattern('empresa:*');

    return {
      message: 'Multiple Redis key patterns cleared successfully',
    };
  }

  // ... más métodos
}
```

---

## 🔧 VENTAJAS DE ESTA ARQUITECTURA

✅ **SRP Mejorado**
- Cada servicio tiene una única responsabilidad
- DataSourceService delegará a QueryBuilders

✅ **Mayor Testabilidad**
- Cada servicio puede ser testeado independientemente
- Mocks fáciles de crear

✅ **Mantenibilidad**
- Código más limpio y modular
- Fácil de entender y modificar

✅ **Escalabilidad**
- Agregar nuevo tipo de query = nuevo QueryBuilder
- Cambiar cache = nueva implementación de ICacheProvider

✅ **Mejor Manejo de Errores**
- Excepciones específicas para cada tipo de error
- Mapeo automático de errores PostgreSQL

✅ **Performance Optimizado**
- Caché abstraído e inyectable
- Validación early fail

---

## 📊 ESTRUCTURA FINAL DE CARPETAS

```
src/core/connection/
├── datasource.service.ts
├── constants/
│   └── datasource.constants.ts
├── exceptions/
│   ├── database.exception.ts
│   ├── invalid-query.exception.ts
│   ├── invalid-parameters.exception.ts
│   ├── unique-constraint.exception.ts
│   └── foreign-key.exception.ts
├── type-parser/
│   └── type-parser.service.ts
├── validator/
│   └── query-validator.service.ts
├── pagination/
│   └── pagination.service.ts
├── filter/
│   └── filter.service.ts
├── cache/
│   ├── cache.interface.ts
│   ├── redis-cache.provider.ts
│   └── table-columns.cache.ts
├── query-builder/
│   ├── query-builder.interface.ts
│   ├── select-query.builder.ts
│   ├── insert-query.builder.ts
│   ├── update-query.builder.ts
│   └── delete-query.builder.ts
├── audit/
│   └── audit-logger.service.ts
├── helpers/
│   ├── query.ts
│   ├── select-query.ts
│   ├── insert-query.ts
│   ├── update-query.ts
│   ├── delete-query.ts
│   └── index.ts
├── interfaces/
│   └── resultQuery.ts
└── connection.module.ts
```

---

## ⏱️ ESTIMACIÓN DE TIEMPO

- **Fase 1 (Servicios Base)**: 2-3 horas ✓ COMPLETADA
- **Fase 2 (QueryBuilders)**: 4-5 horas
- **Fase 3 (AuditLogger)**: 1-2 horas
- **Fase 4 (DataSourceService)**: 2-3 horas
- **Fase 5 (Testing)**: 3-4 horas

**Total**: ~12-17 horas de desarrollo

---

## 🚀 PRÓXIMOS PASOS

1. Revisar el análisis
2. Crear los QueryBuilders (Fase 2)
3. Refactorizar DataSourceService
4. Migrar gradualmente el resto del proyecto
5. Agregar tests unitarios
