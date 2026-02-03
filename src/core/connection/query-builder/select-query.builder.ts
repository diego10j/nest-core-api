import { Injectable, Inject } from '@nestjs/common';
import { Pool, QueryResult } from 'pg';

import { ErrorsLoggerService } from '../../../errors/errors-logger.service';
import {
    getTypeCoreColumn,
    getAlignCoreColumn,
    getSizeCoreColumn,
    getDefaultValueColumn,
    getComponentColumn,
    getVisibleCoreColumn,
    getTypeFilterColumn,
} from '../../../util/helpers/sql-util';
import { FilterService } from '../filter/filter.service';
import { SelectQuery } from '../helpers';
import { ResultQuery } from '../interfaces/resultQuery';
import { PaginationService } from '../pagination/pagination.service';
import { QueryValidatorService } from '../validator/query-validator.service';

import { IQueryBuilder } from './query-builder.interface';

/**
 * QueryBuilder para SELECT queries
 * Responsable de: paginación, filtros, esquema, totales
 */
@Injectable()
export class SelectQueryBuilder implements IQueryBuilder {
    constructor(
        @Inject('DATABASE_POOL') private readonly pool: Pool,
        private readonly paginationService: PaginationService,
        private readonly filterService: FilterService,
        private readonly queryValidator: QueryValidatorService,
        private readonly errorsLogger: ErrorsLoggerService,
    ) { }

    /**
     * Valida un SelectQuery
     */
    validate(query: SelectQuery): void {
        this.queryValidator.validateSelectQuery(query);
    }

    /**
     * Construye y ejecuta un SelectQuery
     */
    async build(query: SelectQuery): Promise<ResultQuery> {
        try {
            // 1. Inicializar paginación por defecto
            this.paginationService.initializeDefaultPagination(query);

            // 2. Preparar query base
            const baseQuery = this.prepareBaseQuery(query);

            // 3. Aplicar filtros y ordenamiento
            const filteredQuery = this.filterService.applyFilters(baseQuery, query);

            // 4. Calcular totales
            const totalRecords = await this.calculateTotalRecords(query);

            // 5. Calcular totales con filtro si aplica
            let totalFilterRecords: number | undefined;
            if (this.shouldCalculateFilterTotal(query)) {
                totalFilterRecords = await this.calculateFilteredTotal(
                    filteredQuery,
                    query,
                );
            }

            // 6. Aplicar paginación y obtener clause SQL
            const paginationClause = this.paginationService.getSqlPaginationClause(
                query,
                totalFilterRecords || totalRecords,
            );
            const finalQuery = filteredQuery + paginationClause;

            // 7. Ejecutar query
            const result = await this.pool.query(finalQuery, query.paramValues);

            // 8. Establecer metadatos de paginación
            this.paginationService.setMetadata(
                query,
                totalFilterRecords || totalRecords,
            );

            // 9. Obtener esquema si es necesario
            const columns = query.isSchema ? await this.getSchemaColumns(result) : undefined;

            return {
                totalRecords,
                totalFilterRecords,
                rowCount: result.rowCount,
                rows: result.rows,
                message: this.getResultMessage(result.rowCount),
                columns,
            };
        } catch (error) {
            this.errorsLogger.createErrorLog('[SelectQueryBuilder]', error);
            throw error;
        }
    }

    /**
     * Prepara el query base wrapeado
     */
    private prepareBaseQuery(selectQuery: SelectQuery): string {
        let query = selectQuery.query.trim();
        if (query.endsWith(';')) {
            query = query.slice(0, -1);
        }
        return `SELECT * FROM (${query}) AS wrapped_query`;
    }

    /**
     * Calcula el total de registros SIN filtros
     */
    private async calculateTotalRecords(selectQuery: SelectQuery): Promise<number> {
        const countQuery = `SELECT COUNT(*) as count FROM (${selectQuery.query}) AS count_query`;
        const result = await this.pool.query(countQuery, selectQuery.paramValues);
        return parseInt(result.rows[0].count, 10);
    }

    /**
     * Determina si debe calcular el total CON filtros
     */
    private shouldCalculateFilterTotal(selectQuery: SelectQuery): boolean {
        return (
            (selectQuery.filters && selectQuery.filters.length > 0) ||
            !!selectQuery.globalFilter
        );
    }

    /**
     * Calcula el total de registros CON filtros
     */
    private async calculateFilteredTotal(
        filteredQuery: string,
        selectQuery: SelectQuery,
    ): Promise<number> {
        const countQuery = `SELECT COUNT(*) as count FROM (${filteredQuery}) AS count_query`;
        const result = await this.pool.query(countQuery, selectQuery.paramValues);
        return parseInt(result.rows[0].count, 10);
    }

    /**
     * Obtiene el esquema de columnas del resultado
     */
    private async getSchemaColumns(result: QueryResult): Promise<any[]> {
        if (!result.fields || result.fields.length === 0) {
            return [];
        }

        const columnsNames = result.fields.map((field) => field.name);
        const tablesID = result.fields.map((field) => field.tableID);

        // Aquí va la lógica de getColumnsSchema del original
        // Por ahora retornamos estructura base
        let primaryKey: string | undefined;

        const columns = result.fields.map((_col, index) => {
            if (index === 0) primaryKey = _col.name;

            const typesCols = result._types._types.builtins;
            const dataTypeCore = getTypeCoreColumn(
                Object.keys(typesCols).find((key) => typesCols[key] === _col.dataTypeID),
            );
            const alignColumn = getAlignCoreColumn(dataTypeCore);
            const filterType = getTypeFilterColumn(dataTypeCore);
            const sizeColumn = getSizeCoreColumn(dataTypeCore, 0);
            const defaultValue = getDefaultValueColumn(
                Object.keys(typesCols).find((key) => typesCols[key] === _col.dataTypeID),
            );
            const componentCore = getComponentColumn(
                Object.keys(typesCols).find((key) => typesCols[key] === _col.dataTypeID),
            );
            const visible = _col.name === primaryKey ? false : getVisibleCoreColumn(_col.name);

            return {
                name: _col.name,
                tableID: _col.tableID,
                dataTypeID: _col.dataTypeID,
                dataType: dataTypeCore,
                order: index,
                label: _col.name,
                required: false,
                visible,
                length: undefined,
                precision: undefined,
                decimals: undefined,
                disabled: false,
                filter: false,
                comment: '',
                component: componentCore,
                upperCase: false,
                orderable: true,
                size: sizeColumn,
                align: alignColumn,
                defaultValue,
                header: _col.name,
                accessorKey: _col.name,
                filterFn: filterType,
            };
        });

        return columns;
    }

    /**
     * Mensaje según el número de registros
     */
    private getResultMessage(rowCount: number): string {
        if (rowCount === 0) {
            return 'No existen registros';
        }
        return 'ok';
    }
}
