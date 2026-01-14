import { Injectable } from '@nestjs/common';
import { SelectQuery } from '../helpers';
import { DEFAULT_PAGE_SIZE } from '../constants/datasource.constants';

/**
 * Servicio responsable de toda la lógica de paginación
 * Sigue SRP - solo maneja paginación
 */
@Injectable()
export class PaginationService {
    /**
     * Calcula el offset basado en pageSize y pageIndex
     */
    calculateOffset(pageSize: number, pageIndex: number): number {
        return pageSize * pageIndex;
    }

    /**
     * Calcula el número total de páginas
     */
    calculateTotalPages(totalRecords: number, pageSize: number): number {
        if (pageSize <= 0) {
            throw new Error('pageSize debe ser mayor que 0');
        }
        return Math.ceil(totalRecords / pageSize);
    }

    /**
     * Calcula el offset para la última página
     */
    calculateLastPageOffset(totalRecords: number, pageSize: number): number {
        const totalPages = this.calculateTotalPages(totalRecords, pageSize);
        const lastPageIndex = totalPages - 1;
        return Math.max(0, lastPageIndex * pageSize);
    }

    /**
     * Inicializa paginación por defecto si no existe
     */
    initializeDefaultPagination(selectQuery: SelectQuery): void {
        if (!selectQuery.pagination && selectQuery.isLazy) {
            selectQuery.setPagination(DEFAULT_PAGE_SIZE, 0);
        }
    }

    /**
     * Establece los metadatos de paginación en el query
     */
    setMetadata(selectQuery: SelectQuery, totalRecords: number): void {
        if (!selectQuery.pagination) {
            return;
        }

        const totalPages = this.calculateTotalPages(
            totalRecords,
            selectQuery.pagination.pageSize,
        );

        selectQuery.setIsPreviousPage(selectQuery.pagination.pageIndex > 0);
        selectQuery.setIsNextPage(selectQuery.pagination.pageIndex < totalPages - 1);
        selectQuery.setTotalPages(totalPages);
    }

    /**
     * Obtiene el SQL LIMIT OFFSET basado en paginación y lastPage flag
     */
    getSqlPaginationClause(
        selectQuery: SelectQuery,
        totalRecords?: number,
    ): string {
        if (!selectQuery.pagination || !selectQuery.isLazy) {
            return '';
        }

        let offset = selectQuery.pagination.offset;
        const pageSize = selectQuery.pagination.pageSize;

        // Si lastPage es true, calcular el offset para la última página
        if (selectQuery.lastPage && totalRecords !== undefined) {
            offset = this.calculateLastPageOffset(totalRecords, pageSize);
            selectQuery.setPagination(pageSize, Math.ceil(totalRecords / pageSize) - 1);
        }

        return ` OFFSET ${offset} LIMIT ${pageSize}`;
    }
}
