/**
 * Configuración de OID (Object Identifier) para PostgreSQL type parsing
 * Los OID son identificadores únicos para tipos de datos en PostgreSQL
 */
export const PG_TYPE_CONFIG = {
  TIME_OID: 1083, // time without time zone
  NUMERIC_OID: 1700, // numeric
  FLOAT8_OID: 701, // double precision
  INT8_OID: 20, // bigint
  INT2_OID: 21, // smallint
  INT4_OID: 23, // integer
  TIMESTAMP_OID: 1114, // timestamp without time zone
  TIMESTAMPTZ_OID: 1184, // timestamp with time zone
  DATE_OID: 1082, // date
} as const;

export const DEFAULT_PAGE_SIZE = 100;
