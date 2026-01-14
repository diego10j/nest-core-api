import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { DeleteQuery } from '../helpers';
import { ResultQuery } from '../interfaces/resultQuery';
import { IQueryBuilder } from './query-builder.interface';
import { QueryValidatorService } from '../validator/query-validator.service';
import { ErrorsLoggerService } from '../../../errors/errors-logger.service';

/**
 * QueryBuilder para DELETE queries
 * Responsable de: validación, ejecución, respuesta
 */
@Injectable()
export class DeleteQueryBuilder implements IQueryBuilder {
  constructor(
    @Inject('DATABASE_POOL') private readonly pool: Pool,
    private readonly queryValidator: QueryValidatorService,
    private readonly errorsLogger: ErrorsLoggerService,
  ) {}

  /**
   * Valida un DeleteQuery
   */
  validate(query: DeleteQuery): void {
    this.queryValidator.validateDeleteQuery(query);
  }

  /**
   * Construye y ejecuta un DeleteQuery
   */
  async build(query: DeleteQuery): Promise<ResultQuery> {
    try {
      // Ejecutar query
      const result = await this.pool.query(query.query, query.paramValues);

      return {
        rowCount: result.rowCount,
        message: this.getResultMessage(result.rowCount),
      };
    } catch (error) {
      this.errorsLogger.createErrorLog('[DeleteQueryBuilder]', error);
      throw error;
    }
  }

  /**
   * Mensaje según el número de registros eliminados
   */
  private getResultMessage(rowCount: number): string {
    if (rowCount > 0) {
      return `Eliminación exitosa, ${rowCount} registro(s) afectado(s)`;
    }
    return 'No se eliminó ningún registro';
  }
}
