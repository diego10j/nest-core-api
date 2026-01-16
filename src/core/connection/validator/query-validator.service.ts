import { Injectable } from '@nestjs/common';
import { Query, SelectQuery, InsertQuery, UpdateQuery, DeleteQuery } from '../helpers';
import { InvalidQueryException } from '../exceptions/invalid-query.exception';
import { InvalidQueryParametersException } from '../exceptions/invalid-parameters.exception';
import { getCountStringInText } from '../../../util/helpers/string-util';

/**
 * Servicio responsable de validar la integridad de los queries
 * antes de ser ejecutados. Sigue SRP.
 */
@Injectable()
export class QueryValidatorService {
    /**
     * Valida que el número de parámetros en el query coincida
     * con los valores proporcionados.
     * Permite reusar el mismo parámetro múltiples veces (ej: $1 aparece 2 veces)
     */
    validateParameters(query: Query): void {
        // Extraer todos los índices únicos de parámetros del query (ej: $1, $2, $3)
        const parameterMatches = query.query.match(/\$(\d+)/g);

        if (!parameterMatches && query.paramValues.length === 0) {
            // Query sin parámetros es válido
            return;
        }

        if (!parameterMatches && query.paramValues.length > 0) {
            throw new InvalidQueryParametersException(
                `Query no contiene parámetros pero se proporcionaron ${query.paramValues.length}`,
            );
        }

        if (parameterMatches && query.paramValues.length === 0) {
            throw new InvalidQueryParametersException(
                `Query contiene parámetros pero no se proporcionaron valores`,
            );
        }

        // Obtener índices únicos (puede haber $1 repetido múltiples veces)
        const uniqueIndices = new Set(
            parameterMatches.map(param => parseInt(param.substring(1)))
        );

        const maxIndex = Math.max(...Array.from(uniqueIndices));
        const providedParams = query.paramValues.length;

        // Validar que todos los índices desde 1 hasta maxIndex estén presentes
        for (let i = 1; i <= maxIndex; i++) {
            if (!uniqueIndices.has(i)) {
                throw new InvalidQueryParametersException(
                    `Query tiene parámetros no consecutivos. Falta $${i}`,
                );
            }
        }

        // Validar que se proporcionen exactamente los parámetros necesarios
        if (uniqueIndices.size !== providedParams) {
            throw new InvalidQueryParametersException(
                `Query espera ${uniqueIndices.size} parámetros únicos pero se proporcionaron ${providedParams}`,
            );
        }
    }

    /**
     * Valida un SelectQuery
     */
    validateSelectQuery(selectQuery: SelectQuery): void {
        if (selectQuery.isLazy && !selectQuery.pagination) {
            throw new InvalidQueryException(
                'SelectQuery con lazy=true requiere configuración de paginación',
            );
        }

        if (!selectQuery.query || selectQuery.query.trim().length === 0) {
            throw new InvalidQueryException('SelectQuery no puede tener un query vacío');
        }
    }

    /**
     * Valida un UpdateQuery
     */
    validateUpdateQuery(updateQuery: UpdateQuery): void {
        if (!updateQuery.where || updateQuery.where.trim().length === 0) {
            throw new InvalidQueryException(
                'UpdateQuery requiere una condición WHERE',
            );
        }

        if (updateQuery.values.size === 0) {
            throw new InvalidQueryException(
                'UpdateQuery no tiene valores para actualizar',
            );
        }

        if (!updateQuery.table || updateQuery.table.trim().length === 0) {
            throw new InvalidQueryException('UpdateQuery requiere nombre de tabla');
        }
    }

    /**
     * Valida un InsertQuery
     */
    validateInsertQuery(insertQuery: InsertQuery): void {
        if (!insertQuery.table || insertQuery.table.trim().length === 0) {
            throw new InvalidQueryException('InsertQuery requiere nombre de tabla');
        }

        if (insertQuery.values.size === 0) {
            throw new InvalidQueryException(
                'InsertQuery no tiene valores para insertar',
            );
        }

        if (!insertQuery.primaryKey || insertQuery.primaryKey.trim().length === 0) {
            throw new InvalidQueryException('InsertQuery requiere clave primaria');
        }
    }

    /**
     * Valida un DeleteQuery
     */
    validateDeleteQuery(deleteQuery: DeleteQuery): void {
        if (!deleteQuery.where || deleteQuery.where.trim().length === 0) {
            throw new InvalidQueryException(
                'DeleteQuery requiere una condición WHERE',
            );
        }

        if (!deleteQuery.table || deleteQuery.table.trim().length === 0) {
            throw new InvalidQueryException('DeleteQuery requiere nombre de tabla');
        }
    }

    /**
     * Valida el query genérico basado en su tipo
     */
    validateQuery(query: Query): void {
        this.validateParameters(query);

        if (query instanceof SelectQuery) {
            this.validateSelectQuery(query);
        } else if (query instanceof InsertQuery) {
            this.validateInsertQuery(query);
        } else if (query instanceof UpdateQuery) {
            this.validateUpdateQuery(query);
        } else if (query instanceof DeleteQuery) {
            this.validateDeleteQuery(query);
        }
    }
}
