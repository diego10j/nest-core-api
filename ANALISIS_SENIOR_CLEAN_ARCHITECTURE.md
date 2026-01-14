# 🏗️ Análisis Senior: Optimización de DataSource Service & Clean Architecture

## 📊 ANÁLISIS ACTUAL DEL CÓDIGO

### Problemas Identificados:

#### 1. **VIOLACIÓN SRP (Single Responsibility Principle)**
```typescript
// ❌ PROBLEMA: DataSourceService tiene múltiples responsabilidades
- Manejo de conexión DB
- Formateo de queries SQL
- Caching con Redis
- Auditoria
- Esquema de columnas
- Paginación
- Filtros
```

#### 2. **VIOLACIÓN DRY (Don't Repeat Yourself)**
```typescript
// ❌ PROBLEMA: Lógica de auditoria duplicada en createQuery() y createListQuery()
if (query instanceof InsertQuery) {
  activityQuery = this.getInsertActivityTable(query);
} else if (query instanceof UpdateQuery) {
  activityQuery = await this.getUpdateActivityTable(query);
} else if (query instanceof DeleteQuery) {
  activityQuery = this.getDeleteActivityTable(query);
}
```

#### 3. **TYPE PARSING HARDCODED**
```typescript
// ❌ PROBLEMA: Magic numbers sin documentación
private TYPE_DATESTAMP = 1082;
private TYPE_TIMESTAMP = 1114;
private NUMERIC_OID = 1700; // ¿Qué significa 1700?
```

#### 4. **MÉTODOS MUY LARGOS (God Methods)**
```typescript
// ❌ PROBLEMA: createQuery() tiene 300+ líneas
async createQuery(query: Query, ref = undefined): Promise<ResultQuery>
// - Maneja SelectQuery
// - Maneja InsertQuery
// - Maneja UpdateQuery
// - Maneja DeleteQuery
// - Calcula totales
// - Aplica filtros
// - Aplica paginación
```

#### 5. **FALTA DE ABSTRACCIÓN**
```typescript
// ❌ PROBLEMA: Cálculos de paginación acoplados
if (selectQuery.lastPage && totalRecords !== undefined) {
  const pageSize = selectQuery.pagination.pageSize;
  const lastPageIndex = Math.ceil(totalRecords / pageSize) - 1;
  // ...
}
```

#### 6. **ACOPLAMIENTO FUERTE A REDIS**
```typescript
// ❌ PROBLEMA: Redis está directamente inyectado
@Inject('REDIS_CLIENT') public readonly redisClient: Redis

// Debería ser abstraído con un servicio de caché
```

#### 7. **FALTA DE VALIDACIÓN DE PARÁMETROS**
```typescript
// ❌ PROBLEMA: No valida integridad de parámetros
const countParams = getCountStringInText('$', query.query);
if (countParams !== query.paramValues.length) {
  throw new InternalServerErrorException(...)
}
// Esto solo se ejecuta después de intentar la query
```

#### 8. **MANEJO DE ERRORES GENÉRICO**
```typescript
// ❌ PROBLEMA: Todos los errores son InternalServerErrorException
throw new InternalServerErrorException(`${error}`);
// Debería haber excepciones específicas
```

---

## ✅ SOLUCIONES PROPUESTAS (Clean Architecture)

### 1. **Extraer Servicio de TypeParser**
```typescript
// core/connection/type-parser/type-parser.service.ts
@Injectable()
export class TypeParserService {
  private readonly typeConfig = {
    TIME_OID: 1083,
    NUMERIC_OID: 1700,
    FLOAT8_OID: 701,
    INT8_OID: 20,
    INT2_OID: 21,
    INT4_OID: 23,
  };

  registerParsers(types: typeof pg.types) {
    types.setTypeParser(this.typeConfig.TIME_OID, (val) => getTimeISOFormat(val));
    types.setTypeParser(this.typeConfig.NUMERIC_OID, (val) => parseFloat(val));
    // ...
  }
}
```

### 2. **Crear QueryBuilder Pattern**
```typescript
// core/connection/query-builder/query-builder.interface.ts
export interface IQueryBuilder {
  build(query: Query): Promise<ResultQuery>;
}

// core/connection/query-builder/select-query.builder.ts
@Injectable()
export class SelectQueryBuilder implements IQueryBuilder {
  constructor(
    private readonly paginationService: PaginationService,
    private readonly filterService: FilterService,
  ) {}

  async build(query: SelectQuery): Promise<ResultQuery> {
    // Solo responsable de queries SELECT
  }
}

// core/connection/query-builder/insert-query.builder.ts
@Injectable()
export class InsertQueryBuilder implements IQueryBuilder {
  async build(query: InsertQuery): Promise<ResultQuery> {
    // Solo responsable de queries INSERT
  }
}
```

### 3. **Extraer Servicio de Caché**
```typescript
// core/cache/cache.interface.ts
export interface ICacheProvider {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  delPattern(pattern: string): Promise<void>;
}

// core/cache/redis-cache.provider.ts
@Injectable()
export class RedisCacheProvider implements ICacheProvider {
  constructor(@Inject('REDIS_CLIENT') private redis: Redis) {}
  
  async get<T>(key: string): Promise<T | null> {
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }
  // ...
}
```

### 4. **Extraer Servicio de Auditoría**
```typescript
// core/audit/audit-logger.service.ts
@Injectable()
export class AuditLoggerService {
  constructor(private dataSource: DataSourceService) {}

  async logInsert(query: InsertQuery): Promise<void> {
    const activityQuery = this.buildInsertActivity(query);
    await this.dataSource.createQuery(activityQuery);
  }

  async logUpdate(query: UpdateQuery): Promise<void> {
    // ...
  }

  async logDelete(query: DeleteQuery): Promise<void> {
    // ...
  }

  private buildInsertActivity(query: InsertQuery): InsertQuery {
    // ...
  }
}
```

### 5. **Crear PaginationService**
```typescript
// core/connection/pagination/pagination.service.ts
@Injectable()
export class PaginationService {
  calculateOffset(pageSize: number, pageIndex: number): number {
    return pageSize * pageIndex;
  }

  calculateTotalPages(totalRecords: number, pageSize: number): number {
    return Math.ceil(totalRecords / pageSize);
  }

  calculateLastPageOffset(totalRecords: number, pageSize: number): number {
    const lastPageIndex = this.calculateTotalPages(totalRecords, pageSize) - 1;
    return Math.max(0, lastPageIndex * pageSize);
  }

  setMetadata(query: SelectQuery, totalRecords: number): void {
    const totalPages = this.calculateTotalPages(totalRecords, query.pagination.pageSize);
    query.setIsPreviousPage(query.pagination.pageIndex > 1);
    query.setIsNextPage(query.pagination.pageIndex < totalPages);
    query.setTotalPages(totalPages);
  }
}
```

### 6. **Crear FilterService**
```typescript
// core/connection/filter/filter.service.ts
@Injectable()
export class FilterService {
  applyFilters(query: string, selectQuery: SelectQuery): string {
    if (!selectQuery.filters?.length && !selectQuery.globalFilter) {
      return query;
    }

    let filteredQuery = query;

    if (selectQuery.filters?.length > 0) {
      const conditions = this.buildFilterConditions(selectQuery.filters);
      filteredQuery += ` WHERE ${conditions}`;
    }

    if (selectQuery.globalFilter) {
      const globalConditions = this.buildGlobalFilterConditions(selectQuery.globalFilter);
      filteredQuery += selectQuery.filters?.length ? ` AND (${globalConditions})` : ` WHERE (${globalConditions})`;
    }

    return filteredQuery;
  }

  private buildFilterConditions(filters: FilterDto[]): string {
    return filters
      .map((f) => this.buildCondition(f))
      .join(' AND ');
  }

  private buildCondition(filter: FilterDto): string {
    return filter.operator === 'ILIKE'
      ? `wrapped_query.${filter.column}::text ILIKE '%${filter.value}%'`
      : `wrapped_query.${filter.column} ${filter.operator} ${filter.value}`;
  }
}
```

### 7. **Crear QueryValidator**
```typescript
// core/connection/validator/query-validator.service.ts
@Injectable()
export class QueryValidatorService {
  validateParameters(query: Query): void {
    const countParams = getCountStringInText('$', query.query);
    if (countParams !== query.paramValues.length) {
      throw new InvalidQueryParametersException(
        `Query tiene ${countParams} parámetros pero se proporcionaron ${query.paramValues.length}`,
      );
    }
  }

  validateSelectQuery(selectQuery: SelectQuery): void {
    if (selectQuery.isLazy && !selectQuery.pagination) {
      throw new InvalidQueryException('SelectQuery lazy requiere paginación');
    }
  }

  validateUpdateQuery(updateQuery: UpdateQuery): void {
    if (!updateQuery.where) {
      throw new InvalidQueryException('UpdateQuery requiere condición WHERE');
    }
    if (updateQuery.values.size === 0) {
      throw new InvalidQueryException('UpdateQuery no tiene valores para actualizar');
    }
  }

  validateDeleteQuery(deleteQuery: DeleteQuery): void {
    if (!deleteQuery.where) {
      throw new InvalidQueryException('DeleteQuery requiere condición WHERE');
    }
  }
}
```

### 8. **Refactorizar DataSourceService**
```typescript
// core/connection/datasource.service.ts (REFACTORIZADO)
@Injectable()
export class DataSourceService {
  constructor(
    private readonly pool: Pool,
    private readonly typeParserService: TypeParserService,
    private readonly cacheProvider: ICacheProvider,
    private readonly queryValidator: QueryValidatorService,
    private readonly selectQueryBuilder: SelectQueryBuilder,
    private readonly insertQueryBuilder: InsertQueryBuilder,
    private readonly updateQueryBuilder: UpdateQueryBuilder,
    private readonly deleteQueryBuilder: DeleteQueryBuilder,
    private readonly auditLogger: AuditLoggerService,
    private readonly errorsLogger: ErrorsLoggerService,
  ) {
    this.typeParserService.registerParsers(types);
  }

  async createQuery(query: Query, ref?: string): Promise<ResultQuery> {
    try {
      // Validar parámetros
      this.queryValidator.validateParameters(query);

      // Formatear query
      await this.formatSqlQuery(query);

      // Delegar al builder correspondiente
      const result = await this.getQueryBuilder(query).build(query);

      // Registrar auditoría si aplica
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
      return new UniqueConstraintViolationException(error.message);
    }
    if (error.code === '23503') {
      return new ForeignKeyViolationException(error.message);
    }
    return new DatabaseException(error.message);
  }
}
```

### 9. **Crear Excepciones Específicas**
```typescript
// core/connection/exceptions/
export class InvalidQueryException extends BadRequestException {}
export class InvalidQueryParametersException extends BadRequestException {}
export class UniqueConstraintViolationException extends ConflictException {}
export class ForeignKeyViolationException extends ConflictException {}
export class DatabaseException extends InternalServerErrorException {}
```

---

## 🎯 VENTAJAS DE ESTA ARQUITECTURA

✅ **SRP**: Cada servicio tiene una única responsabilidad
✅ **Open/Closed**: Fácil agregar nuevos QueryBuilders
✅ **Dependency Inversion**: Depende de abstracciones, no de implementaciones
✅ **Testabilidad**: Cada componente es fácilmente testeable
✅ **Mantenibilidad**: Código modular y bien separado
✅ **Escalabilidad**: Fácil agregar nuevos tipos de queries o cachés

---

## 📦 ESTRUCTURA DE CARPETAS PROPUESTA

```
src/core/connection/
├── datasource.service.ts (REFACTORIZADO)
├── pool/
│   └── pool.factory.ts
├── type-parser/
│   ├── type-parser.interface.ts
│   └── type-parser.service.ts
├── query-builder/
│   ├── query-builder.interface.ts
│   ├── select-query.builder.ts
│   ├── insert-query.builder.ts
│   ├── update-query.builder.ts
│   └── delete-query.builder.ts
├── formatter/
│   ├── query-formatter.interface.ts
│   └── query-formatter.service.ts
├── cache/
│   ├── cache.interface.ts
│   ├── redis-cache.provider.ts
│   └── table-columns.cache.ts
├── filter/
│   └── filter.service.ts
├── pagination/
│   └── pagination.service.ts
├── validator/
│   └── query-validator.service.ts
├── exceptions/
│   ├── database.exception.ts
│   ├── invalid-query.exception.ts
│   └── constraint.exception.ts
└── connection.module.ts
```

---

## ⚠️ MIGRACIÓN GRADUAL

**Fase 1**: Extraer TypeParserService y QueryValidator
**Fase 2**: Extraer PaginationService y FilterService
**Fase 3**: Crear QueryBuilders
**Fase 4**: Refactorizar DataSourceService
**Fase 5**: Extraer AuditLoggerService

---

## 🚀 BENEFICIOS INMEDIATOS

- Código más testeable
- Mantenimiento más fácil
- Mejor performance (caché optimizado)
- Errores más descriptivos
- Escalabilidad mejorada
