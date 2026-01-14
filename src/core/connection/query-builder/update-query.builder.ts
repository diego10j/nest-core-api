import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { UpdateQuery } from '../helpers';
import { ResultQuery } from '../interfaces/resultQuery';
import { IQueryBuilder } from './query-builder.interface';
import { QueryValidatorService } from '../validator/query-validator.service';
import { ErrorsLoggerService } from '../../../errors/errors-logger.service';

/**
 * QueryBuilder para UPDATE queries
 * Responsable de: validación, ejecución, respuesta
 */
@Injectable()
export class UpdateQueryBuilder implements IQueryBuilder {
  constructor(
    @Inject('DATABASE_POOL') private readonly pool: Pool,
    private readonly queryValidator: QueryValidatorService,
    private readonly errorsLogger: ErrorsLoggerService,
  ) {}

  /**
   * Valida un UpdateQuery
   */
  validate(query: UpdateQuery): void {
    this.queryValidator.validateUpdateQuery(query);
  }

  /**
   * Construye y ejecuta un UpdateQuery
   */
  async build(query: UpdateQuery): Promise<ResultQuery> {
    try {
      // Ejecutar query
      const result = await this.pool.query(query.query, query.paramValues);

      return {
        rowCount: result.rowCount,
        message: this.getResultMessage(result.rowCount),
      };
    } catch (error) {
      this.errorsLogger.createErrorLog('[UpdateQueryBuilder]', error);
      throw error;
    }
  }

  /**
   * Mensaje según el número de registros actualizados
   */
  private getResultMessage(rowCount: number): string {
    if (rowCount > 0) {
      return `Actualización exitosa, ${rowCount} registro(s) afectado(s)`;
    }
    return 'No se actualizó ningún registro';
  }
}
