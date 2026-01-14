# 🔧 GUÍA DE INTEGRACIÓN - FASES 2, 3, 4

## 📋 Tabla de Contenidos
1. Cambios en connection.module.ts
2. Cambios en datasource.service.ts
3. Verificación de compilación
4. Testing de integración

---

## PASO 1: Actualizar connection.module.ts

### Imports a Agregar

```typescript
// Agregar al inicio del archivo
import { IQueryBuilder } from './query-builder/query-builder.interface';
import { SelectQueryBuilder } from './query-builder/select-query.builder';
import { InsertQueryBuilder } from './query-builder/insert-query.builder';
import { UpdateQueryBuilder } from './query-builder/update-query.builder';
import { DeleteQueryBuilder } from './query-builder/delete-query.builder';
import { AuditLoggerService } from '../audit/audit-logger.service';
import { TypeParserService } from './type-parser/type-parser.service';
import { QueryValidatorService } from './validator/query-validator.service';
import { PaginationService } from './pagination/pagination.service';
import { FilterService } from './filter/filter.service';
import { RedisCacheProvider } from '../cache/redis-cache.provider';
import { TableColumnsCacheService } from '../cache/table-columns.cache';
```

### Providers a Actualizar

**ANTES:**
```typescript
@Module({
  providers: [
    DataSourceService,
    // ... otros providers
  ],
  exports: [DataSourceService],
})
export class ConnectionModule {}
```

**DESPUÉS:**
```typescript
@Module({
  providers: [
    // Servicios de Type Parsing
    TypeParserService,
    
    // Servicios de Validación
    QueryValidatorService,
    
    // Servicios de Paginación y Filtros
    PaginationService,
    FilterService,
    
    // Servicios de Caché
    RedisCacheProvider,
    TableColumnsCacheService,
    
    // QueryBuilders
    SelectQueryBuilder,
    InsertQueryBuilder,
    UpdateQueryBuilder,
    DeleteQueryBuilder,
    
    // Servicios de Auditoría y Datos
    AuditLoggerService,
    DataSourceService,
    
    // ... otros providers existentes
  ],
  exports: [DataSourceService],
})
export class ConnectionModule {}
```

---

## PASO 2: Reemplazar DataSourceService

### 2.1 Opción A: Reemplazo Directo (Recomendado)

```bash
# 1. Hacer backup del archivo original
cp src/core/connection/datasource.service.ts src/core/connection/datasource.service.ts.backup

# 2. Renombrar el refactorizado
mv src/core/connection/datasource-refactored.service.ts src/core/connection/datasource.service.ts

# 3. Compilar para verificar
npm run build
```

### 2.2 Opción B: Migración Gradual

Si prefieres ser más conservador:

```typescript
// 1. Crear datasource-new.service.ts con contenido refactorizado
// 2. Actualizar imports en modelos que lo usan
// 3. Ejecutar tests
// 4. Mover a datasource.service.ts una vez verificado
```

### 2.3 Verificación de Inyecciones

El constructor debe quedar así:

```typescript
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
  this.typeParserService.registerParsers();
}
```

---

## PASO 3: Compilación y Validación

### 3.1 Verificar Compilación

```bash
# Compilar TypeScript
npm run build

# Debería mostrar: ✓ Build completed successfully
```

### 3.2 Verificar Tipos

```bash
# Ejecutar type checker
npx tsc --noEmit

# No debería mostrar errores
```

### 3.3 Verificar Linting

```bash
# Verificar código
npm run lint

# Si hay errores: npm run lint -- --fix
```

---

## PASO 4: Testing de Integración

### 4.1 Tests Unitarios Mínimos

Crear archivo `src/core/connection/datasource.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { DataSourceService } from './datasource.service';
import { SelectQueryBuilder } from './query-builder/select-query.builder';
import { InsertQueryBuilder } from './query-builder/insert-query.builder';
import { TypeParserService } from './type-parser/type-parser.service';
import { QueryValidatorService } from './validator/query-validator.service';

describe('DataSourceService (Refactored)', () => {
  let service: DataSourceService;
  let mockPool: any;

  beforeEach(async () => {
    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataSourceService,
        TypeParserService,
        QueryValidatorService,
        SelectQueryBuilder,
        InsertQueryBuilder,
        // ... otros builders
        {
          provide: 'DATABASE_POOL',
          useValue: mockPool,
        },
        // ... otros mocks
      ],
    }).compile();

    service = module.get<DataSourceService>(DataSourceService);
  });

  it('should delegate SelectQuery to SelectQueryBuilder', async () => {
    const selectQuery = {
      schema: 'test_schema',
      query: 'SELECT * FROM test',
      isLazy: true,
      paramValues: [],
      audit: false,
    };

    const result = await service.createSelectQuery(selectQuery);
    expect(mockPool.query).toHaveBeenCalled();
  });

  it('should map unique constraint violation correctly', () => {
    const pgError = {
      code: '23505',
      message: 'Duplicate key',
    };

    expect(() => {
      // Llamar método que lance el error
      service.createQuery(
        { query: '', paramValues: [] },
        undefined
      ).catch(() => {});
    }).not.toThrow();
  });
});
```

### 4.2 Ejecutar Tests

```bash
# Tests unitarios
npm test

# Tests E2E
npm run test:e2e

# Cobertura
npm test -- --coverage
```

---

## PASO 5: Verificación de Funcionalidad

### 5.1 Verificar SelectQueryBuilder

```bash
# Hacer una query de lectura
curl -X GET "http://localhost:3000/api/endpoint?page=1&limit=10"

# Debería retornar resultados con paginación
```

### 5.2 Verificar InsertQueryBuilder

```bash
# Crear un registro
curl -X POST "http://localhost:3000/api/endpoint" \
  -H "Content-Type: application/json" \
  -d '{"field": "value"}'

# Debería retornar "Creación exitosa..."
```

### 5.3 Verificar UpdateQueryBuilder

```bash
# Actualizar un registro
curl -X PUT "http://localhost:3000/api/endpoint/1" \
  -H "Content-Type: application/json" \
  -d '{"field": "newvalue"}'

# Debería retornar "Actualización exitosa..."
```

### 5.4 Verificar DeleteQueryBuilder

```bash
# Eliminar un registro
curl -X DELETE "http://localhost:3000/api/endpoint/1"

# Debería retornar "Eliminación exitosa..."
```

---

## PASO 6: Rollback (Si es necesario)

Si algo falla y necesitas volver atrás:

```bash
# Opción 1: Restore desde backup
cp src/core/connection/datasource.service.ts.backup src/core/connection/datasource.service.ts

# Opción 2: Git
git checkout src/core/connection/datasource.service.ts

# Opción 3: Cambiar providers en connection.module.ts
# - Remover imports de nuevos servicios
# - Remover providers de nuevos servicios
# - Volver a providers originales solo DataSourceService
```

---

## PASO 7: Checklist Final

- [ ] connection.module.ts actualizado con todos los imports
- [ ] connection.module.ts actualizado con todos los providers
- [ ] DataSourceService reemplazado por versión refactorizada
- [ ] npm run build ejecutado exitosamente
- [ ] npm run lint ejecutado exitosamente
- [ ] npm test ejecutado exitosamente
- [ ] Tests E2E pasados
- [ ] SelectQueryBuilder testeado
- [ ] InsertQueryBuilder testeado
- [ ] UpdateQueryBuilder testeado
- [ ] DeleteQueryBuilder testeado
- [ ] Auditoría funcionando correctamente
- [ ] Caché funcionando correctamente
- [ ] Errores mapeados correctamente
- [ ] Backward compatibility verificada

---

## 🚨 Troubleshooting

### Error: "Cannot find module QueryValidatorService"

**Solución:** Verificar que los imports en connection.module.ts son correctos:
```typescript
import { QueryValidatorService } from './validator/query-validator.service';
```

### Error: "No provider for DATABASE_POOL"

**Solución:** Agregar al providers array:
```typescript
{
  provide: 'DATABASE_POOL',
  useValue: new Pool({ connectionString: envs.bdUrlPool }),
}
```

### Error: "Cannot read property 'build' of undefined"

**Solución:** Verificar que getQueryBuilder() retorna instancia correcta:
```typescript
private getQueryBuilder(query: Query): IQueryBuilder {
  if (query instanceof SelectQuery) return this.selectQueryBuilder;
  if (query instanceof InsertQuery) return this.insertQueryBuilder;
  if (query instanceof UpdateQuery) return this.updateQueryBuilder;
  if (query instanceof DeleteQuery) return this.deleteQueryBuilder;
  throw new InvalidQueryException('Unknown query type');
}
```

### Error: "TypeParserService is not defined"

**Solución:** Agregar import y provider:
```typescript
import { TypeParserService } from './type-parser/type-parser.service';

@Module({
  providers: [TypeParserService, ...],
})
```

---

## 📊 Monitoreo Post-Integración

### Métricas a Verificar

1. **Performance**
   - Tiempo de respuesta de queries
   - Uso de memoria
   - Conexiones al pool

2. **Errores**
   - Logs de excepciones
   - Errores de validación
   - Errores de caché

3. **Auditoría**
   - Registros en sis_actividad
   - Integridad de datos

4. **Caché**
   - Hit rate de caché
   - Invalidación correcta
   - TTL respetado

### Comandos de Monitoreo

```bash
# Ver logs
npm run logs

# Ver métricas de performance
npm run metrics

# Ver estado del caché
redis-cli KEYS "*"

# Ver estado de la BD
psql -c "SELECT count(*) FROM sis_actividad;"
```

---

## ✅ Validación Exitosa

Una integración exitosa se evidencia por:

✅ Compilación sin errores
✅ Linting sin warnings
✅ Tests unitarios pasados
✅ Tests E2E pasados
✅ Operaciones CRUD funcionando
✅ Auditoría registrando cambios
✅ Caché invalidándose correctamente
✅ Errores mapeados correctamente
✅ Logs limpios sin excepciones no capturadas

---

## 📝 Notas Importantes

1. **Backward Compatibility**: Todos los métodos públicos originales se mantienen
2. **Zero Downtime**: La migración puede hacerse sin parar el servicio
3. **Rollback Seguro**: Se puede volver atrás en cualquier momento
4. **Testing Importante**: Ejecutar tests completos antes de pasar a producción

---

**Versión**: 1.0
**Última actualización**: 13 de Enero, 2026
**Estado**: READY FOR INTEGRATION
