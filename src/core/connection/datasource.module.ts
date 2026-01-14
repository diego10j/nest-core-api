// src/core/connection/datasource.module.ts
import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';
import { ErrorsModule } from 'src/errors/errors.module';
import { RedisModule } from 'src/redis/redis.module';
import { envs } from 'src/config/envs';

import { VariablesService } from '../variables/variables.service';
import { AuditLoggerService } from '../audit/audit-logger.service';

import { DataSourceService } from './datasource.service';
import { TypeParserService } from './type-parser/type-parser.service';
import { QueryValidatorService } from './validator/query-validator.service';
import { PaginationService } from './pagination/pagination.service';
import { FilterService } from './filter/filter.service';
import { SelectQueryBuilder } from './query-builder/select-query.builder';
import { InsertQueryBuilder } from './query-builder/insert-query.builder';
import { UpdateQueryBuilder } from './query-builder/update-query.builder';
import { DeleteQueryBuilder } from './query-builder/delete-query.builder';
import { RedisCacheProvider } from '../cache/redis-cache.provider';
import { TableColumnsCacheService } from '../cache/table-columns.cache';
import { ICacheProvider } from '../cache/cache.interface';

@Global() //  Hace que este módulo y sus exports sean globales
@Module({
  imports: [RedisModule, ErrorsModule], // Importa RedisModule para tener acceso al cliente Redis
  providers: [
    // Database Pool
    {
      provide: 'DATABASE_POOL',
      useValue: new Pool({
        connectionString: envs.bdUrlPool,
      }),
    },

    // Servicios de Type Parsing
    TypeParserService,

    // Servicios de Validación
    QueryValidatorService,

    // Servicios de Paginación y Filtros
    PaginationService,
    FilterService,

    // Servicios de Caché
    RedisCacheProvider,
    {
      provide: 'ICacheProvider',
      useExisting: RedisCacheProvider,
    },
    TableColumnsCacheService,

    // QueryBuilders
    SelectQueryBuilder,
    InsertQueryBuilder,
    UpdateQueryBuilder,
    DeleteQueryBuilder,

    // Servicios de Auditoría y Datos
    AuditLoggerService,
    DataSourceService,
    VariablesService,
  ],
  exports: [DataSourceService, VariablesService], //  Exporta el servicio para toda la app
})
export class DataSourceModule { }
