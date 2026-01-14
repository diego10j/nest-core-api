import { ResultQuery } from '../interfaces/resultQuery';
import { Query, SelectQuery, InsertQuery, UpdateQuery, DeleteQuery } from '../helpers';

/**
 * Interfaz que define el contrato para todos los QueryBuilders
 * Sigue el patrón Strategy para encapsular la construcción de cada tipo de query
 */
export interface IQueryBuilder {
  /**
   * Valida que el query sea correcto antes de construirlo
   */
  validate(query: Query): void;

  /**
   * Construye y ejecuta el query, retornando el resultado
   */
  build(query: Query): Promise<ResultQuery>;
}
