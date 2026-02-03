import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';

import { ErrorsLoggerService } from '../../../errors/errors-logger.service';
import { InsertQuery } from '../helpers';
import { ResultQuery } from '../interfaces/resultQuery';
import { QueryValidatorService } from '../validator/query-validator.service';

import { IQueryBuilder } from './query-builder.interface';

/**
 * QueryBuilder para INSERT queries
 * Responsable de: validación, ejecución, respuesta
 */
@Injectable()
export class InsertQueryBuilder implements IQueryBuilder {
    constructor(
        @Inject('DATABASE_POOL') private readonly pool: Pool,
        private readonly queryValidator: QueryValidatorService,
        private readonly errorsLogger: ErrorsLoggerService,
    ) { }

    /**
     * Valida un InsertQuery
     */
    validate(query: InsertQuery): void {
        this.queryValidator.validateInsertQuery(query);
    }

    /**
     * Construye y ejecuta un InsertQuery
     */
    async build(query: InsertQuery): Promise<ResultQuery> {
        try {
            // Ejecutar query
            const result = await this.pool.query(query.query, query.paramValues);

            return {
                rowCount: result.rowCount,
                message: this.getResultMessage(result.rowCount),
                rows: result.rows || [],
            };
        } catch (error) {
            this.errorsLogger.createErrorLog('[InsertQueryBuilder]', error);
            throw error;
        }
    }

    /**
     * Mensaje según el número de registros insertados
     */
    private getResultMessage(rowCount: number): string {
        if (rowCount > 0) {
            return `Creación exitosa, ${rowCount} registro(s) insertado(s)`;
        }
        return 'No se insertó ningún registro';
    }
}
