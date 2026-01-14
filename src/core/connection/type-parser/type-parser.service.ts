import { Injectable } from '@nestjs/common';
import { types } from 'pg';
import { getTimeISOFormat } from '../../../util/helpers/date-util';
import { PG_TYPE_CONFIG } from '../constants/datasource.constants';

/**
 * Servicio responsable de registrar y configurar los parsers de tipos
 * para PostgreSQL. Sigue SRP (Single Responsibility Principle)
 */
@Injectable()
export class TypeParserService {
  /**
   * Registra los parsers de tipos personalizados
   */
  registerParsers(): void {
    this.registerTimeParser();
    this.registerNumericParsers();
    this.registerIntegerParsers();
  }

  /**
   * Parser para tipos TIME
   */
  private registerTimeParser(): void {
    types.setTypeParser(
      PG_TYPE_CONFIG.TIME_OID,
      (val) => getTimeISOFormat(val),
    );
  }

  /**
   * Parsers para tipos numéricos (NUMERIC, FLOAT, etc)
   */
  private registerNumericParsers(): void {
    types.setTypeParser(
      PG_TYPE_CONFIG.NUMERIC_OID,
      (val) => parseFloat(val),
    );

    types.setTypeParser(
      PG_TYPE_CONFIG.FLOAT8_OID,
      (val) => parseFloat(val),
    );
  }

  /**
   * Parsers para tipos enteros (INT2, INT4, INT8)
   */
  private registerIntegerParsers(): void {
    types.setTypeParser(
      PG_TYPE_CONFIG.INT8_OID,
      (val) => parseInt(val, 10),
    );

    types.setTypeParser(
      PG_TYPE_CONFIG.INT2_OID,
      (val) => parseInt(val, 10),
    );

    types.setTypeParser(
      PG_TYPE_CONFIG.INT4_OID,
      (val) => parseInt(val, 10),
    );
  }
}
