import { Query } from "./query";
import { QueryOptionsDto } from '../../../common/dto/query-options.dto';
import { isDefined } from 'src/util/helpers/common-util';
import { GlobalFilterDto } from "src/common/dto/global-filter.dto";
import { FilterDto } from "src/common/dto/filter.dto";
import { OrderByDto } from "src/common/dto/order-by.dto";

export class SelectQuery extends Query {

    pagination?: {
        offset: number;
        pageSize: number;
        pageIndex: number;
        totalPages?: number; // Total de páginas calculadas
        hasNextPage?: boolean; // Indica si hay una siguiente página    
        hasPreviousPage?: boolean; // Indica si hay una página anterior
    };

    globalFilter?: GlobalFilterDto;

    orderBy?: OrderByDto;

    filters?: FilterDto[];

    isSchema?: boolean;
    isAutoPagination?: boolean;

    isWrappedQuery?: boolean;

    constructor(query: string, dto?: QueryOptionsDto) {
        super();
        this.isSchema = true;  // Por defecto retorna el esquema de la consulta
        this.isAutoPagination = true;    // Por defecto autopaginacion calculada
        this.isWrappedQuery = true;    // Por defecto para paginacion, orden, filtro global
        this.query = query;
        if (dto) {
            // Asigna valores paginador
            const { pagination, globalFilter, orderBy, filters } = dto;

            if (isDefined(pagination)) {
                this.pagination = {
                    pageSize: pagination.pageSize,
                    pageIndex: pagination.pageIndex,
                    offset: this.calculateOffset(pagination.pageSize, pagination.pageIndex)
                };
            }

            if (isDefined(globalFilter)) {
                this.globalFilter = globalFilter;
            }

            if (isDefined(orderBy)) {
                this.orderBy = orderBy;
            }

            if (isDefined(filters)) {
                this.filters = filters;
            }
        }
    }


    private calculateOffset(pageSize: number, pageIndex: number): number {
        return pageIndex > 0 ? pageIndex * pageSize : 0;
    }

    getPagination() {
        if (this.isAutoPagination === true) {
            if (this.pagination.totalPages && this.pagination.totalPages > 1) {
                return this.pagination;
            }
        }

        return undefined;
    }

    setPagination(pageSize: number, pageIndex: number) {
        this.pagination = {
            pageSize,
            pageIndex,
            offset: this.calculateOffset(pageSize, pageIndex)
        };
    }
    setIsNextPage(next: boolean) {
        if (this.pagination) {
            this.pagination.hasNextPage = next;
        }
    }

    setIsPreviousPage(previous: boolean) {
        if (this.pagination) {
            this.pagination.hasPreviousPage = previous;
        }
    }

    setTotalPages(totalPages: number) {
        if (this.pagination) {
            this.pagination.totalPages = totalPages;
        }
    }

    setFindSchema(isSchema: boolean) {
        this.isSchema = isSchema;
    }

    setWrappedQuery(isWrappedQuery: boolean) {
        this.isWrappedQuery = isWrappedQuery;
    }

    setAutoPagination(isAutoPagination: boolean) {
        this.isAutoPagination = isAutoPagination;
        if (isAutoPagination === true) {
            this.pagination = undefined;
        }
    }

}