---
name: nestjs-crud
description: "Crear DTO de tabla para operaciones CRUD (save/insert/update/delete) en este proyecto NestJS ProERP. Usar cuando: crear DTO de save para una tabla nueva, implementar método save en service, implementar método delete en service, crear endpoint CRUD en controller, generar boilerplate de insert/update/delete con DataSourceService, getSeqTable, core.save, DeleteQuery. Palabras clave: save, DTO, CRUD, tabla, insert, update, delete, service, controller."
argument-hint: "Nombre de la tabla (ej: con_flujo_cuenta_clasif) o descripción del módulo"
---

# NestJS CRUD — ProERP

## Cuándo usar esta skill

- Crear DTO de datos para una tabla nueva (`*DataDto` + `SaveXxxDto`)
- Implementar `saveXxx()` en un service (insert/update con `core.save`)
- Implementar `deleteXxx()` en un service (con `DeleteQuery`)
- Agregar endpoints en un controller (`@Post('saveXxx')`, `@Delete('deleteXxx')`)

---

## Convenciones del proyecto

| Concepto | Regla |
|----------|-------|
| Nombre tabla | `<modulo>_<entidad>` (ej: `con_flujo_cuenta_clasif`) |
| Módulo corto | Prefijo de 2-3 letras: `con`, `tes`, `ven`, `cxp`... |
| PK secuencial | `getSeqTable('<modulo>_<tabla>', '<pk>', 1, login)` |
| Multi-tenancy | Toda tabla lleva `ide_empr` + `ide_sucu` |
| Auditoría | `usuario_ingre`, `hora_ingre`, `usuario_actua`, `hora_actua`, `fecha_ingre`, `fecha_actua` — **NUNCA en el DTO**; se inyectan desde `HeaderParamsDto` en el service |
| Save unificado | `isUpdate: boolean` en el DTO determina INSERT vs UPDATE |
| Imports | Orden: builtin → external → internal (`@/**`) → parent → sibling |

---

## Paso 1 — Crear el DTO

### Estructura del archivo

```typescript
// tabla: <modulo>_<tabla>
import { Type } from 'class-transformer';
import {
    IsBoolean, IsInt, IsNotEmpty, IsObject,
    IsOptional, IsString, MaxLength, ValidateNested,
} from 'class-validator';
import { SaveDto } from 'src/common/dto/save.dto';

/** Campos de la tabla */
export class <Modulo><Tabla>DataDto {
    @IsInt()
    @IsOptional()
    ide_<pk>?: number;           // PK — opcional (se genera en insert)

    // NUNCA incluir en el DTO:
    //   - ide_empr, ide_sucu        → vienen de HeaderParamsDto (dtoIn.ideEmpr, dtoIn.ideSucu)
    //   - usuario_ingre, usuario_actua → vienen de HeaderParamsDto (dtoIn.login)
    //   - hora_ingre, hora_actua      → los asigna core.save / el service con new Date()
    //   - fecha_ingre, fecha_actua    → ídem

    // --- campos de negocio ---
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    nombre_<tabla>: string;      // campos requeridos SIN @IsOptional()

    @IsBoolean()
    @IsOptional()
    activo_<tabla>?: boolean;
    // ... resto de columnas
}

/** DTO de save (envuelve el data + isUpdate) */
export class Save<Modulo><Tabla>Dto extends SaveDto {
    @IsObject()
    @IsNotEmpty()
    @ValidateNested()
    @Type(() => <Modulo><Tabla>DataDto)
    declare data: <Modulo><Tabla>DataDto;
}
```

### Reglas de validadores por tipo PostgreSQL

| Tipo PG | Validador class-validator |
|---------|--------------------------|
| `int4 / int8` | `@IsInt()` + `@Type(() => Number)` |
| `varchar(n)` | `@IsString()` + `@MaxLength(n)` |
| `bool` | `@IsBoolean()` |
| `date / timestamp` | `@IsDateString()` |
| `numeric` | `@IsNumber()` + `@Type(() => Number)` |
| FK opcional | `@IsInt()` + `@IsOptional()` |
| FK requerido | `@IsInt()` + `@IsNotEmpty()` |

---

## Paso 2 — Método `saveXxx()` en el Service

```typescript
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { DeleteQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { DataSourceService } from 'src/core/connection/datasource.service';

// Constantes del módulo (definir al inicio del archivo del service)
const MODULE   = '<modulo>';          // ej: 'con'
const TABLE    = '<tabla>';           // ej: 'flujo_cuenta_clasif'
const PK       = 'ide_<tabla>';       // ej: 'ide_cnfcc'

async saveXxx(dto: HeaderParamsDto & { data: XxxDataDto }) {
    try {
        const listQuery: ObjectQueryDto[] = [];
        const isUpdate = !!dto.data[PK];          // o usar dto.isUpdate si viene del SaveDto

        if (isUpdate) {
            listQuery.push({
                operation: 'update',
                module: MODULE,
                tableName: TABLE,
                primaryKey: PK,
                object: dto.data,
                condition: `${PK} = ${dto.data[PK]} AND ide_sucu = ${dto.ideSucu}`,
            });
        } else {
            const newId = await this.dataSource.getSeqTable(
                `${MODULE}_${TABLE}`, PK, 1, dto.login,
            );
            dto.data[PK]            = newId;
            dto.data['ide_empr']    = dto.ideEmpr;
            dto.data['ide_sucu']    = dto.ideSucu;
            dto.data['usuario_ingre'] = dto.login;

            listQuery.push({
                operation: 'insert',
                module: MODULE,
                tableName: TABLE,
                primaryKey: PK,
                object: dto.data,
            });
        }

        return this.core.save({ ...dto, listQuery, audit: true });
    } catch (error) {
        if (error instanceof BadRequestException) throw error;
        const msg = error instanceof Error ? error.message : String(error);
        throw new InternalServerErrorException(`Error al guardar Xxx: ${msg}`);
    }
}
```

### Variantes comunes

**Garantizar un solo registro activo por empresa** (ej: plan activo):
```typescript
// Antes del insert, desactivar los demás
listQuery.push({
    operation: 'update', module: MODULE, tableName: TABLE, primaryKey: PK,
    object: { activo_<tabla>: false },
    condition: `ide_empr = ${dto.ideEmpr} AND ide_sucu = ${dto.ideSucu}`,
});
```

**Múltiples tablas en una transacción** (listQuery acepta N objetos):
```typescript
listQuery.push({ operation: 'insert', module: 'mod1', tableName: 'tabla1', ... });
listQuery.push({ operation: 'insert', module: 'mod2', tableName: 'tabla2', ... });
return this.core.save({ ...dto, listQuery, audit: true });
```

---

## Paso 3 — Método `deleteXxx()` en el Service

```typescript
async deleteXxx(dto: HeaderParamsDto & { ide: number[] }) {
    if (!dto.ide || dto.ide.length === 0) {
        throw new BadRequestException('Debe proporcionar al menos un id para eliminar');
    }
    try {
        const deleteQuery = new DeleteQuery(`${MODULE}_${TABLE}`, dto);
        deleteQuery.where = `${PK} = ANY ($1) AND ide_sucu = $2`;
        deleteQuery.addParam(1, dto.ide);
        deleteQuery.addIntParam(2, dto.ideSucu);
        return this.dataSource.createQuery(deleteQuery);
    } catch (error) {
        if (error instanceof BadRequestException) throw error;
        const msg = error instanceof Error ? error.message : String(error);
        throw new InternalServerErrorException(`Error al eliminar Xxx: ${msg}`);
    }
}
```

> Para eliminar con validación de FK existente usar `this.dataSource.canDelete(deleteQuery)` antes de ejecutar.

---

## Paso 4 — Endpoints en el Controller

```typescript
import { Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { Save<Modulo><Tabla>Dto } from './dto/save-xxx.dto';
import { XxxService } from './xxx.service';

@ApiTags('<Modulo>-<Entidad>')
@Controller('<modulo>/<entidad>')
export class XxxController {
    constructor(private readonly service: XxxService) {}

    @Post('saveXxx')
    @ApiOperation({ summary: 'Crear o actualizar Xxx' })
    saveXxx(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: Save<Modulo><Tabla>Dto,
    ) {
        return this.service.saveXxx({ ...headersParams, ...dtoIn });
    }

    @Delete('deleteXxx')
    @ApiOperation({ summary: 'Eliminar Xxx por IDs' })
    deleteXxx(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: ArrayIdeDto,          // { ide: number[] }
    ) {
        return this.service.deleteXxx({ ...headersParams, ...dtoIn });
    }
}
```

---

## Paso 5 — Registrar en el Module

```typescript
@Module({
  controllers: [..., XxxController],
  providers:   [..., XxxService],
  exports:     [...],          // solo si otro módulo necesita inyectar XxxService
})
export class XxxModule {}
```

---

## Checklist final

- [ ] DTO: `*DataDto` tiene todos los campos de la tabla (excepto `ide_empr`, `ide_sucu`, auditoria — se inyectan)
- [ ] DTO: campos requeridos en BD son `@IsNotEmpty()`, los opcionales `@IsOptional()`
- [ ] DTO: `SaveXxxDto extends SaveDto` con `declare data: XxxDataDto`
- [ ] Service: import `ObjectQueryDto` desde `src/core/connection/dto`
- [ ] Service: import `DeleteQuery` desde `src/core/connection/helpers`
- [ ] Service: `getSeqTable` se llama solo en el branch INSERT
- [ ] Service: `ide_empr`, `ide_sucu`, `usuario_ingre` se asignan en el service desde `HeaderParamsDto`, **nunca en el DTO**
- [ ] DTO: sin campos de auditoría (`usuario_ingre`, `usuario_actua`, `hora_ingre`, `hora_actua`, `fecha_ingre`, `fecha_actua`)
- [ ] Service: `catch` re-lanza `BadRequestException` y envuelve el resto en `InternalServerErrorException`
- [ ] Controller: usa `@AppHeaders()` para inyectar `HeaderParamsDto`
- [ ] Controller: save con `@Post` + `@Body`, delete con `@Delete` + `@Query`
- [ ] Module: controller y service registrados
- [ ] Compilación: `yarn build` sin errores
