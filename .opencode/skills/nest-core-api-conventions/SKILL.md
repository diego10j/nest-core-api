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
// SELECT with parameters — pass DTO to enable pagination/filters/ordering
const query = new SelectQuery(`
    SELECT c.ide_tecba, c.nombre_tecba, b.nombre_teban
    FROM tes_cuenta_banco c
    INNER JOIN tes_banco b ON b.ide_teban = c.ide_teban
    WHERE c.ide_empr = $1 AND c.ide_sucu = $2 AND c.activo_tecba = true
`, dtoIn);                               // ✅ DTO for pagination/filters
query.addIntParam(1, dtoIn.ideEmpr);
query.addIntParam(2, dtoIn.ideSucu);

// Paginated result (with QueryOptionsDto pagination, filters, ordering)
return this.dataSource.createQuery(query, 'tes_cuenta_banco');

// Raw result (flat array of rows)
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

**Every endpoint (GET, POST, PUT, PATCH, DELETE) MUST receive `@AppHeaders() h: HeaderParamsDto`.** This ensures headers (`ide_empr`, `ide_sucu`, `login`, `ide_usua`, `ide_perf`, `ip`, `device`) are always available for multi-tenancy, logging, and audit.

### Header params are REQUIRED on every controller method — NO exceptions.

`HeaderParamsDto` fields (from `src/common/dto/common-params.dto`):
- `ideUsua` — ID del usuario (required, number)
- `ideEmpr` — ID de la empresa (required, number)
- `ideSucu` — ID de la sucursal (required, number)
- `idePerf` — ID del perfil/rol (required, number)
- `login` — Login del usuario (required, string)
- `ip` — IP del cliente (optional, default `'127.0.0.1'`)
- `device` — Identificador del terminal (optional, default `'PC'`)

### Pattern 1: Merge headers with DTO for service call

```typescript
// GET endpoints with query params — DTO extends QueryOptionsDto
@Get('getBancos')
@ApiOperation({ summary: 'Listar bancos con paginación y filtros' })
getBancos(
    @AppHeaders() h: HeaderParamsDto,
    @Query() dto: GetBancosDto,
) {
    return this.service.getBancos({ ...h, ...dto });  // ✅ Merge headers into DTO
}

// POST endpoints with body
@Post('saveBanco')
@ApiOperation({ summary: 'Crear o actualizar un banco' })
saveBanco(
    @AppHeaders() h: HeaderParamsDto,
    @Body() dto: SaveBancoDto,
) {
    return this.saveService.saveBanco({ ...h, ...dto });
}
```

### Pattern 2: Unused headers — prefix with underscore `_h`

When the service method doesn't need the headers (e.g. combos without multi-tenancy filtering, or static file serving), use `_h` prefix to signal it's intentionally unused:

```typescript
// GET endpoint with path param — headers received but not passed to service
@Get('getBancoById/:ideTeban')
@ApiOperation({ summary: 'Obtener banco por ID' })
getBancoById(
    @AppHeaders() _h: HeaderParamsDto,    // ✅ Received but unused (prefix _)
    @Param('ideTeban', ParseIntPipe) ideTeban: number,
) {
    return this.service.getBancoById(ideTeban);
}

// Simple combo list — no multi-tenancy filter needed
@Get('getListDataBancos')
@ApiOperation({ summary: 'Listar bancos para combos' })
getListDataBancos(@AppHeaders() _h: HeaderParamsDto) {
    return this.service.getListDataBancos();
}
```

### Pattern 3: Bare @Query params — use DTOs instead

**Every GET endpoint MUST use its own DTO class that extends `QueryOptionsDto`.** Never use `@Query('paramName')` bare parameters. The DTO passed to `@Query()` provides automatic validation, Swagger documentation, and pagination/filtering/ordering support.

```typescript
// CORRECT — DTO extends QueryOptionsDto
@Get('getDocumentos')
getDocumentos(
    @AppHeaders() h: HeaderParamsDto,
    @Query() dtoIn: GetDocumentosCxPDto,      // ✅ DTO
) { ... }

// CORRECT — bare @Query is OK only as supplement alongside a DTO
@Get('getPorcentajeIva')
getPorcentajeIva(
    @AppHeaders() _h: HeaderParamsDto,
    @Query('fecha') fecha: string,             // ✅ Simple scalar + @AppHeaders
) { ... }

// WRONG — missing @AppHeaders
@Get('getById/:id')
getById(@Param('id') id: number) { ... }       // ❌

// WRONG — bare @Query without @AppHeaders
@Get('getSomething')
getSomething(@Query('name') name: string) { ... }  // ❌
```

### Pattern 4: File upload endpoints

File upload endpoints also need `@AppHeaders`. Use `diskStorage` with UUID naming for persistent files:

```typescript
import { v4 as uuid } from 'uuid';
import { diskStorage } from 'multer';
import path from 'node:path';

@Post('uploadFotoBanco/:ideTeban')
@ApiConsumes('multipart/form-data')
@UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, BANCOS_DIR),
        filename: (_req, file, cb) => {
            const ext = file.mimetype.split('/')[1].replace('jpeg', 'jpg');
            cb(null, `${uuid()}.${ext}`);
        },
    }),
}))
async uploadFotoBanco(
    @AppHeaders() h: HeaderParamsDto,
    @Param('ideTeban', ParseIntPipe) ideTeban: number,
    @UploadedFile() file: Express.Multer.File,
) {
    return this.saveService.updateFotoBanco(ideTeban, file.filename, h);
}
```

### Pattern 5: Nullable query parameters

Use `query.addParam()` (not `addIntParam`/`addBooleanParam`) when parameters can be NULL:

```typescript
// $3::int8 IS NULL OR cb.ide_teban = $3 pattern for optional filters
query.addIntParam(1, dtoIn.ideEmpr);           // ✅ Always present
query.addIntParam(2, dtoIn.ideSucu);           // ✅ Always present
query.addParam(3, dtoIn.ideTeban ?? null);     // ✅ Nullable — use addParam
query.addParam(4, dtoIn.hacePagos ?? null);    // ✅ Nullable — use addParam
```

### Pattern 6: Controller import order (lint-enforced)

```
builtin → external → internal (src/) → sibling (./)
```

```typescript
// ✅ CORRECT import order
import path from 'node:path';                              // builtin

import { Body, Controller, Get, Post, Query } from '@nestjs/common';  // external
import { FileInterceptor } from '@nestjs/platform-express'; // external
import { ApiOperation, ApiTags } from '@nestjs/swagger';   // external
import { diskStorage } from 'multer';                       // external
import { v4 as uuid } from 'uuid';                          // external
import { AppHeaders } from 'src/common/decorators/header-params.decorator';  // internal
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';        // internal
import { envs } from 'src/config/envs';                     // internal

import { BancosSaveService } from './bancos-save.service';  // sibling
import { GetBancosDto } from './dto/get-bancos.dto';       // sibling
```

## 4. DTOs Pattern

**All GET DTOs MUST extend `QueryOptionsDto`** to enable pagination, filtering, globalFilter, and ordering. POST/save DTOs should only contain business fields.

```typescript
import { IsInt, IsString, IsOptional, IsNumber, Min, IsNotEmpty } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

// GET DTO — extends QueryOptionsDto for pagination/filters/ordering
export class SomeDto extends QueryOptionsDto {
    @IsInt()
    @IsNotEmpty()
    ide: number;

    @IsString()
    @IsOptional()
    observacion?: string;
}

// SAVE DTO — only business fields, no audit fields
export class SaveDto {
    @IsInt()
    @IsNotEmpty()
    id: number;

    @IsString()
    @IsOptional()
    nombre?: string;

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

**Always pass the DTO as the second argument to `new SelectQuery(sql, dto)`.** This enables pagination, filtering, globalFilter, and ordering from the frontend's `QueryOptionsDto`. Use `createSelectQuery` for raw rows or `createQuery` for paginated results.

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
        this.core.getVariables(['p_var_name']).then((result) => {
            this.variables = result;
        });
    }

    // GET with pagination — pass dto to SelectQuery + createQuery
    async get(dtoIn: SomeDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT col1, col2
            FROM some_table
            WHERE ide_modu = $1
            ORDER BY col1
        `, dtoIn);                          // ✅ DTO enables pagination/filters/ordering
        query.addIntParam(1, dtoIn.ideModu);
        return this.dataSource.createQuery(query, 'some_table');
    }

    // GET without pagination (raw rows) — pass dto to SelectQuery + createSelectQuery
    async getList(dtoIn: SomeDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT col1, col2
            FROM some_table
            ORDER BY col1
        `, dtoIn);                          // ✅ Still pass DTO
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

## 8. Create vs Update Detection — NEVER use `!!` on IDs

When a save method must distinguish between insert and update based on whether the
primary key is provided, **ALWAYS use `!= null`** instead of `!!` or `Boolean()`.
The value `0` is a valid primary key in PostgreSQL and `!!0` evaluates to `false`,
which would incorrectly trigger an insert instead of an update.

```typescript
// WRONG — 0 is a valid PK, !!0 is false → inserts instead of updating
const isUpdate = !!dtoIn.ideTeban;
const isUpdate = Boolean(dtoIn.ideTeban);

// CORRECT — checks for null/undefined only, 0 passes as truthy
const isUpdate = dtoIn.ideTeban != null;
```

This applies to **every** save method that uses the presence of an ID to decide
between insert and update. Check all `ide*` fields in save DTOs.
