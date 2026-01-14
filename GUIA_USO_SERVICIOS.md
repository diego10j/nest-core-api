# 📚 GUÍA DE USO: Nuevos Servicios (FASE 1)

## 🎯 Introducción

Esta guía muestra cómo usar los nuevos servicios implementados en FASE 1. Todos están listos para integración inmediata.

---

## 1️⃣ TypeParserService

### Propósito
Centraliza la configuración de type parsers para PostgreSQL.

### Uso en Módulo
```typescript
// connection.module.ts
import { TypeParserService } from './type-parser/type-parser.service';

@Module({
  providers: [
    TypeParserService,
    DataSourceService,
    // ...
  ],
})
export class ConnectionModule {}
```

### Uso en DataSourceService
```typescript
// datasource.service.ts
@Injectable()
export class DataSourceService {
  constructor(
    private readonly typeParserService: TypeParserService,
  ) {
    // Al instanciar, registra todos los parsers
    this.typeParserService.registerParsers();
  }
}
```

### Cómo Agregar Nuevos Type Parsers
```typescript
// type-parser.service.ts
private registerJsonParser(): void {
  types.setTypeParser(
    PG_TYPE_CONFIG.JSON_OID, // Agregar a constants
    (val) => JSON.parse(val),
  );
}
```

---

## 2️⃣ QueryValidatorService

### Propósito
Valida la integridad de los queries ANTES de ejecutarlos (early fail).

### Uso Básico
```typescript
// datasource.service.ts
async createQuery(query: Query): Promise<ResultQuery> {
  try {
    // Validar primero
    this.queryValidator.validateQuery(query);
    
    // Luego ejecutar
    await this.formatSqlQuery(query);
    // ...
  } catch (error) {
    // ...
  }
}
```

### Validar SelectQuery
```typescript
const selectQuery = new SelectQuery('SELECT * FROM usuarios');
selectQuery.setPagination(10, 0);
selectQuery.isLazy = true;

// Valida:
// - Parámetros coinciden
// - isLazy con pagination configurada
// - Query no está vacío
this.queryValidator.validateSelectQuery(selectQuery);
```

### Validar UpdateQuery
```typescript
const updateQuery = new UpdateQuery('sis_usuario', 'ide_usua');
updateQuery.values.set('nom_usua', 'Nuevo Nombre');
updateQuery.where = 'ide_usua = $1';
updateQuery.addNumberParam(1, 123);

// Valida:
// - WHERE clause existe
// - Values no está vacío
// - Tabla está configurada
this.queryValidator.validateUpdateQuery(updateQuery);
```

### Capturar Excepciones
```typescript
try {
  queryValidator.validateQuery(query);
} catch (error) {
  if (error instanceof InvalidQueryParametersException) {
    // Manejar parámetros incorrectos
  } else if (error instanceof InvalidQueryException) {
    // Manejar query inválido
  }
}
```

---

## 3️⃣ PaginationService

### Propósito
Centraliza toda la lógica de paginación.

### Calcular Offset
```typescript
// Página 0 (primera) con 10 registros por página
const offset = paginationService.calculateOffset(10, 0); // 0

// Página 2 con 10 registros por página
const offset = paginationService.calculateOffset(10, 2); // 20

// Página 5 con 50 registros por página
const offset = paginationService.calculateOffset(50, 5); // 250
```

### Calcular Total de Páginas
```typescript
const totalRecords = 145;
const pageSize = 10;

const totalPages = paginationService.calculateTotalPages(
  totalRecords,
  pageSize,
);
// totalPages = 15 (145 / 10 = 14.5 → 15 páginas)
```

### Obtener Offset de Última Página
```typescript
const lastPageOffset = paginationService.calculateLastPageOffset(145, 10);
// Retorna offset para página 14 (offset = 140)
```

### Inicializar Paginación por Defecto
```typescript
const selectQuery = new SelectQuery('SELECT * FROM usuarios');

// Si no tiene paginación y es lazy, agrega paginación por defecto
paginationService.initializeDefaultPagination(selectQuery);
// Ahora tiene: pageSize=100, pageIndex=0
```

### Establecer Metadatos
```typescript
const selectQuery = new SelectQuery('SELECT * FROM usuarios');
selectQuery.setPagination(10, 1); // Página 1, 10 registros

const totalRecords = 145;

// Establece: totalPages, hasNextPage, hasPreviousPage
paginationService.setMetadata(selectQuery, totalRecords);

console.log(selectQuery.getPagination());
// {
//   pageSize: 10,
//   pageIndex: 1,
//   offset: 10,
//   totalPages: 15,
//   hasNextPage: true,
//   hasPreviousPage: true
// }
```

### Obtener Clause SQL
```typescript
const selectQuery = new SelectQuery('SELECT * FROM usuarios');
selectQuery.setPagination(10, 2);

const sqlClause = paginationService.getSqlPaginationClause(selectQuery);
// Retorna: " OFFSET 20 LIMIT 10"

// Con lastPage = true
selectQuery.lastPage = true;
const totalRecords = 145;

const sqlClause = paginationService.getSqlPaginationClause(selectQuery, totalRecords);
// Retorna: " OFFSET 140 LIMIT 10" (última página)
```

---

## 4️⃣ FilterService

### Propósito
Construye cláusulas WHERE de forma flexible y segura.

### Filtros Individuales
```typescript
const selectQuery = new SelectQuery('SELECT * FROM usuarios');
selectQuery.filters = [
  {
    column: 'estado_usua',
    operator: '=',
    value: 'true',
  },
  {
    column: 'nom_usua',
    operator: 'ILIKE',
    value: '%Juan%',
  },
];

const baseQuery = 'SELECT * FROM (SELECT * FROM usuarios) AS wrapped_query';
const filteredQuery = filterService.applyFilters(baseQuery, selectQuery);
// WHERE wrapped_query.estado_usua = true AND wrapped_query.nom_usua::text ILIKE '%Juan%'
```

### Filtro Global
```typescript
selectQuery.globalFilter = {
  columns: ['nom_usua', 'mail_usua'],
  value: 'juan',
};

const filteredQuery = filterService.applyFilters(baseQuery, selectQuery);
// WHERE (wrapped_query.nom_usua::text ILIKE '%juan%' OR wrapped_query.mail_usua::text ILIKE '%juan%')
```

### Operadores Soportados
```typescript
// ILIKE - Case insensitive like (PostgreSQL)
{ operator: 'ILIKE', value: '%text%' }

// LIKE - Case sensitive like
{ operator: 'LIKE', value: '%text%' }

// Comparadores
{ operator: '=', value: 'value' }
{ operator: '!=', value: 'value' }
{ operator: '>', value: '100' }
{ operator: '<', value: '100' }
{ operator: '>=', value: '100' }
{ operator: '<=', value: '100' }

// Arrays
{ operator: 'IN', value: '(1,2,3)' }

// Rangos
{ operator: 'BETWEEN', value: '1 AND 10' }
```

---

## 5️⃣ Cache Services

### RedisCacheProvider

```typescript
// Obtener del caché
const columns = await cacheProvider.get<string[]>('table_columns:sis_usuario');

// Guardar en caché (sin TTL - indefinido)
await cacheProvider.set('table_columns:sis_usuario', ['ide_usua', 'nom_usua']);

// Guardar con TTL (3600 segundos = 1 hora)
await cacheProvider.set('table_columns:sis_usuario', columns, 3600);

// Eliminar clave
await cacheProvider.del('table_columns:sis_usuario');

// Eliminar patrón
await cacheProvider.delPattern('table_columns:*');

// Limpiar todo
await cacheProvider.clear();
```

### TableColumnsCacheService

```typescript
// Obtener columnas (si están en caché, retorna de caché)
const columns = await tableColumnsCacheService.getTableColumns('sis_usuario');

// Guardar en caché
await tableColumnsCacheService.setTableColumns('sis_usuario', [
  'ide_usua',
  'nom_usua',
  'mail_usua',
]);

// Invalidar caché de una tabla
await tableColumnsCacheService.invalidateTableColumns('sis_usuario');

// Invalidar todas las tablas
await tableColumnsCacheService.invalidateAllTableColumns();
```

### Implementar Patrón Cache-Aside
```typescript
async getTableColumns(tableName: string): Promise<string[]> {
  // 1. Intentar obtener del caché
  let columns = await this.tableColumnsCacheService.getTableColumns(tableName);
  
  if (!columns) {
    // 2. Si no está, obtener de BD
    columns = await this.fetchTableColumnsFromDatabase(tableName);
    
    // 3. Guardar en caché
    await this.tableColumnsCacheService.setTableColumns(tableName, columns);
  }
  
  return columns;
}
```

---

## 6️⃣ Custom Exceptions

### Usar Excepciones Específicas
```typescript
import { InvalidQueryException } from './exceptions/invalid-query.exception';
import { InvalidQueryParametersException } from './exceptions/invalid-parameters.exception';
import { UniqueConstraintViolationException } from './exceptions/unique-constraint.exception';
import { ForeignKeyViolationException } from './exceptions/foreign-key.exception';
import { DatabaseException } from './exceptions/database.exception';

// Lanzar excepciones
if (!query.where) {
  throw new InvalidQueryException('UPDATE requiere WHERE clause');
}

if (countParams !== providedParams) {
  throw new InvalidQueryParametersException(
    `Expected ${countParams} but got ${providedParams}`,
  );
}

// Mapear errores PostgreSQL
if (error.code === '23505') {
  throw new UniqueConstraintViolationException(error.detail);
}

if (error.code === '23503') {
  throw new ForeignKeyViolationException(error.detail);
}
```

### Capturar en Controller
```typescript
try {
  return await this.coreService.save(dto);
} catch (error) {
  if (error instanceof UniqueConstraintViolationException) {
    return { message: 'El registro ya existe', code: 'DUPLICATE' };
  }
  
  if (error instanceof ForeignKeyViolationException) {
    return { message: 'Referencia inválida', code: 'INVALID_FK' };
  }
  
  if (error instanceof InvalidQueryException) {
    return { message: 'Query inválido', code: 'INVALID_QUERY' };
  }
  
  throw error;
}
```

---

## 🔄 Flujo Completo (Ejemplo)

```typescript
// 1. Usuario solicita listado de usuarios con filtros
const dto = {
  pagination: { pageSize: 10, pageIndex: 2 },
  filters: [
    { column: 'estado_usua', operator: '=', value: 'true' },
  ],
  globalFilter: { columns: ['nom_usua'], value: 'juan' },
};

// 2. Crear SelectQuery
const selectQuery = new SelectQuery(
  'SELECT * FROM sis_usuario WHERE activo_usua = true',
  dto,
);

// 3. Validar
this.queryValidator.validateSelectQuery(selectQuery);
// ✅ Pasa validación

// 4. Inicializar paginación por defecto (si falta)
this.paginationService.initializeDefaultPagination(selectQuery);

// 5. Preparar base query
const baseQuery = 'SELECT * FROM (SELECT ...) AS wrapped_query';

// 6. Aplicar filtros
const filteredQuery = this.filterService.applyFilters(baseQuery, selectQuery);
// WHERE estado_usua = true AND (nom_usua ILIKE '%juan%')

// 7. Calcular totales
const totalRecords = 1500;
const totalFilterRecords = 25;

// 8. Aplicar paginación
const paginationClause = this.paginationService.getSqlPaginationClause(selectQuery);
// OFFSET 20 LIMIT 10

// 9. Ejecutar query final
const finalQuery = filteredQuery + paginationClause;
const result = await this.pool.query(finalQuery);

// 10. Establecer metadatos
this.paginationService.setMetadata(selectQuery, totalFilterRecords);

// 11. Retornar respuesta
return {
  rows: result.rows,
  totalRecords,
  totalFilterRecords,
  pagination: selectQuery.getPagination(),
  message: 'ok',
};
```

---

## 📝 Notas Importantes

✅ **TypeParserService** se ejecuta una sola vez al iniciar
✅ **QueryValidatorService** se ejecuta antes de cada query
✅ **PaginationService** es stateless y reutilizable
✅ **FilterService** construye SQL seguro
✅ **Cache** está abstraído para fácil cambio de implementación

---

## 🚀 Próximos Pasos

En **FASE 2**, estas clases serán usadas por:
- SelectQueryBuilder
- InsertQueryBuilder
- UpdateQueryBuilder
- DeleteQueryBuilder

Que delegarán a DataSourceService refactorizado.
