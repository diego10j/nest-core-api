import { Injectable } from '@nestjs/common';
import { SelectQuery } from '../helpers';
import { FilterDto } from '../../../common/dto/filter.dto';

/**
 * Servicio responsable de construir y aplicar filtros a las queries
 * Sigue SRP - solo maneja filtros
 */
@Injectable()
export class FilterService {
    /**
     * Aplica filtros individuales y globales a un query
     */
    applyFilters(baseQuery: string, selectQuery: SelectQuery): string {
        if (!this.hasFilters(selectQuery)) {
            return baseQuery;
        }

        let query = baseQuery;

        // Aplicar filtros individuales
        if (selectQuery.filters?.length > 0) {
            const filterConditions = this.buildFilterConditions(selectQuery.filters);
            query += ` WHERE ${filterConditions}`;
        }

        // Aplicar filtro global
        if (selectQuery.globalFilter) {
            const globalConditions = this.buildGlobalFilterConditions(
                selectQuery.globalFilter,
            );
            query += selectQuery.filters?.length
                ? ` AND (${globalConditions})`
                : ` WHERE (${globalConditions})`;
        }

        return query;
    }

    /**
     * Verifica si el query tiene filtros
     */
    private hasFilters(selectQuery: SelectQuery): boolean {
        return (
            (selectQuery.filters && selectQuery.filters.length > 0) ||
            !!selectQuery.globalFilter
        );
    }

    /**
     * Construye las condiciones de filtro individual
     */
    private buildFilterConditions(filters: FilterDto[]): string {
        return filters.map((filter) => this.buildCondition(filter)).join(' AND ');
    }

    /**
     * Construye una condición individual
     */
    private buildCondition(filter: FilterDto): string {
        const column = `wrapped_query.${filter.column}`;

        switch (filter.operator) {
            case 'ILIKE':
                return `${column}::text ILIKE '%${filter.value}%'`;
            case 'LIKE':
                return `${column}::text LIKE '%${filter.value}%'`;
            case '=':
            case '!=':
            case '>':
            case '<':
            case '>=':
            case '<=':
                return `${column} ${filter.operator} ${filter.value}`;
            case 'IN':
                return `${column} IN (${filter.value})`;
            case 'BETWEEN':
                return `${column} BETWEEN ${filter.value}`;
            default:
                return `${column} ${filter.operator} ${filter.value}`;
        }
    }

    /**
     * Construye las condiciones del filtro global
     */
    private buildGlobalFilterConditions(globalFilter: any): string {
        return globalFilter.columns
            .map(
                (column) =>
                    `wrapped_query.${column}::text ILIKE '%${globalFilter.value}%'`,
            )
            .join(' OR ');
    }
}
