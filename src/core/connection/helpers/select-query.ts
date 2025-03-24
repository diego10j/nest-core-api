import { Query } from "./query";
import { ServiceDto } from '../../../common/dto/service.dto';
import { isDefined } from 'src/util/helpers/common-util';
import { GlobalFilterDto } from "src/common/dto/global-filter.dto";
import { FilterDto } from "src/common/dto/filter.dto";
import { OrderByDto } from "src/common/dto/order-by.dto";

export class SelectQuery extends Query {

    pagination?: {
        offset: number;
        rows: number;
        page: number;
        totalPages?: number; // Total de páginas calculadas
        next?: boolean; // Indica si hay una siguiente página    
        previous?: boolean; // Indica si hay una página anterior
    };

    globalFilter?: GlobalFilterDto;

    orderBy?: OrderByDto;

    filters?: FilterDto[];

    constructor(query: string, dto?: ServiceDto) {
        super();
        this.query = query;
        if (dto) {
            // Asigna valores paginador
            const { pagination, globalFilter, orderBy, filters } = dto;

            if (isDefined(pagination)) {
                this.pagination = {
                    rows: pagination.rows,
                    page: pagination.page,
                    offset: this.calculateOffset(pagination.rows, pagination.page)
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

    private calculateOffset(rows: number, page: number): number {
        return (page - 1) * rows;
    }

    getPagination() {
        return this.pagination;
    }

    setPagination(rows: number, page: number) {
        this.pagination = {
            rows,
            page,
            offset: this.calculateOffset(rows, page)
        };
    }
    setIsNextPage(next: boolean) {
        if (this.pagination) {
            this.pagination.next = next;
        }
    }

    setIsPreviousPage(previous: boolean) {
        if (this.pagination) {
            this.pagination.previous = previous;
        }
    }

    setTotalPages(totalPages: number) {
        if (this.pagination) {
            this.pagination.totalPages = totalPages;
        }
    }

}