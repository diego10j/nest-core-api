---
name: nest-core-api-conventions
description: Use when generating or editing ANY TypeScript file in the nest-core-api NestJS project. Enforces patterns: raw pg SQL with SelectQuery, CoreService.save() for CRUD, DTOs with class-validator, audit fields NEVER in DTOs, GET endpoints with @Query(), POST with @Body(), module structure conventions, and PostgreSQL native patterns.
---

# NestJS Core API Conventions

This skill documents the project-specific conventions for the NestJS backend at
`D:\DIEGO2022\Varios\git\nest-core-api`. Apply these rules to EVERY file generated
or edited in this project.

## 1. Audit Fields — NEVER in DTOs or Manual Queries

**`usuario_ingre`, `usuario_actua`, `fecha_ingre`, `hora_ingre`, `fecha_actua`, `hora_actua`**

These fields are **automatically managed** by the system. They come from the
HTTP headers (`@AppHeaders()`) and are injected by:
- `CoreService.save()` for `ObjectQueryDto[]` operations
- `DataSourceService` for `InsertQuery`/`UpdateQuery` objects
- Database `DEFAULT CURRENT_TIMESTAMP` for TIMESTAMP columns

**Rules:**
1. **NEVER** include these fields in any DTO class
2. **NEVER** include them in `object: { ... }` passed to `CoreService.save()`
3. **NEVER** include them in raw `pool.query()` INSERT/UPDATE statements
4. The DB schema should have `DEFAULT CURRENT_TIMESTAMP` on `hora_ingre` and `hora_actua` columns
5. `usuario_ingre` and `usuario_actua` are populated by middleware, not by manual code

**Example (WRONG):**
```typescript
// DTO - WRONG: audit fields should not exist
export class SaveDto {
    usuario_ingre: string;    // ❌ NEVER in DTOs
    fecha_ingre: string;      // ❌ NEVER in DTOs
}

// Raw INSERT - WRONG
await this.dataSource.pool.query(
    `INSERT INTO tabla (col1, usuario_ingre, hora_ingre) VALUES ($1, $2, NOW())`,
    [value, dtoIn.login],     // ❌ NEVER include audit params
);
```

**Example (CORRECT):**
```typescript
// DTO - CORRECT: only business fields
export class SaveDto {
    @IsString()
    nombre: string;
    @IsNumber()
    valor: number;
}

// Raw INSERT - CORRECT: no audit fields
await this.dataSource.pool.query(
    `INSERT INTO tabla (nombre, valor) VALUES ($1, $2)`,
    [dtoIn.nombre, dtoIn.valor],
);

// Via CoreService - CORRECT: system handles audit
await this.core.save({
    ...dtoIn,
    listQuery: [{
        operation: 'insert',
        module: 'tes',
        tableName: 'cab_libr_banc',
        primaryKey: 'ide_teclb',
        object: {
            ide_teclb,                    // business fields only
            valor_teclb: 500,
            observacion_teclb: 'test',
            // NO usuario_ingre, NO hora_ingre, NO fecha_ingre
        },
    }],
    audit: false,
});
```

## 2. Database Layer (pg Native)

No ORM. All queries use:
- **SelectQuery** from `src/core/connection/helpers` for SELECT operations
- **CoreService.save()** with `ObjectQueryDto[]` for INSERT/UPDATE/DELETE
- **pool.query()** only for complex multi-table operations or mass updates/deletes

```typescript
// SELECT with parameters
const query = new SelectQuery(`
    SELECT c.ide_tecba, c.nombre_tecba, b.nombre_teban
    FROM tes_cuenta_banco c
    INNER JOIN tes_banco b ON b.ide_teban = c.ide_teban
    WHERE c.ide_empr = $1 AND c.ide_sucu = $2 AND c.activo_tecba = true
`);
query.addIntParam(1, dtoIn.ideEmpr);
query.addIntParam(2, dtoIn.ideSucu);
return this.dataSource.createSelectQuery(query);

// Single record
return this.dataSource.createSingleQuery(query);

// INSERT via CoreService
const objQuery: ObjectQueryDto = {
    operation: 'insert',
    module: 'tes',
    tableName: 'cab_libr_banc',
    primaryKey: 'ide_teclb',
    object: { ide_teclb, valor_teclb: 500 },
};
await this.core.save({ ...dtoIn, listQuery: [objQuery], audit: false });

// Sequence generation
const ide = await this.dataSource.getSeqTable('table', 'pk_column', 1, dtoIn.login);
```

## 3. Controllers — GET vs POST

```typescript
// GET endpoints with query params
@Get('getSomething')
getSomething(
    @AppHeaders() h: HeaderParamsDto,
    @Query() dto: SomeDto,
) {
    return this.service.getSomething({ ...h, ...dto });
}

// GET endpoints with path params (for single IDs)
@Get('getById/:id')
getById(@Param('id', ParseIntPipe) id: number) {
    return this.service.getById(id);
}

// POST endpoints with body
@Post('save')
save(
    @AppHeaders() h: HeaderParamsDto,
    @Body() dto: SaveDto,
) {
    return this.service.save({ ...h, ...dto });
}
```

## 4. DTOs Pattern

```typescript
import { IsInt, IsString, IsOptional, IsNumber, Min, IsDateString } from 'class-validator';

export class SomeDto {
    @IsInt()
    @IsNotEmpty()
    ide: number;

    @IsString()
    @IsOptional()
    observacion?: string;

    @IsNumber()
    @Min(0)
    @IsOptional()
    valor?: number;
}
```

**NEVER include in DTOs:** `ide_empr`, `ide_sucu`, `ide_usua`, `usuario_ingre`, `usuario_actua`,
`fecha_ingre`, `hora_ingre`, `fecha_actua`, `hora_actua`, `login`, `ip`, `device`.

These come from `HeaderParamsDto` via `@AppHeaders()` decorator.

## 5. Module Structure

```
src/core/modules/<module>/
├── <module>.module.ts
├── <module>.controller.ts
├── <module>.service.ts          # Queries (SelectQuery)
├── <module>-save.service.ts     # Mutations (CoreService.save / pool.query)
├── <module>-ld.service.ts       # ListData endpoints (combos)
└── dto/
    ├── get-*.dto.ts             # Query DTOs
    └── save-*.dto.ts            # Mutation DTOs
```

## 6. Service Pattern

```typescript
import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

@Injectable()
export class MyService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        // Load system variables
        this.core.getVariables(['p_var_name']).then((result) => {
            this.variables = result;
        });
    }

    async get(dtoIn: SomeDto & HeaderParamsDto) {
        const query = new SelectQuery(`...`);
        query.addIntParam(1, dtoIn.ideEmpr);
        return this.dataSource.createSelectQuery(query);
    }
}
```

## 7. MySQL → PostgreSQL Conversions

| MySQL | PostgreSQL |
|-------|-----------|
| `CONCAT(a, ' ', b)` | `a \|\| ' ' \|\| b` |
| Boolean as string `'true'` | Native `true`/`false` |
| `CASE WHEN cond THEN val END` | Same (compatible) |
| `COALESCE(val, 0)` | `COALESCE(val, 0)` |
| `MAX(pk)` for sequences | `getSeqTable()` method |
| `UNION` without aliases | Add explicit column aliases |
| String-based params `'${x}'` | `$N` parameterized params |
