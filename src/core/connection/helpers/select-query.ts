import { FilterDto } from 'src/common/dto/filter.dto';
import { GlobalFilterDto } from 'src/common/dto/global-filter.dto';
import { OrderByDto } from 'src/common/dto/order-by.dto';
import { isDefined } from 'src/util/helpers/common-util';

import { QueryOptionsDto } from '../../../common/dto/query-options.dto';

import { Query } from './query';

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
  isLazy?: boolean;

  lastPage?: boolean;

  constructor(query: string, dto?: QueryOptionsDto) {
    super();
    this.isSchema = true; // Por defecto retorna el esquema de la consulta
    this.isLazy = true; // Por defecto lazy, crea WrappedQuery del query incial para paginacion, orden, filtro
    this.query = query;
    this.lastPage = false; // para cargar la ultima página
    if (dto) {
      // Asigna valores paginador
      const { pagination, globalFilter, orderBy, filters, lazy } = dto;

      if (isDefined(lazy)) {
        this.isLazy = lazy === 'true';
      }
      if (this.isLazy === true) {
        if (isDefined(pagination)) {
          this.pagination = {
            pageSize: pagination.pageSize,
            pageIndex: pagination.pageIndex,
            offset: this.calculateOffset(pagination.pageSize, pagination.pageIndex),
          };
          this.lastPage = pagination.lastPage ? pagination.lastPage === 'true' : false;
        }
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
    if (this.isLazy === true) {
      if (this.pagination.totalPages && this.pagination.totalPages > 1) {
        return this.pagination;
      }
    }
    return undefined;
  }

  setPagination(pageSize: number, pageIndex: number) {
    if (this.isLazy === true) {
      this.pagination = {
        pageSize,
        pageIndex,
        offset: this.calculateOffset(pageSize, pageIndex),
      };
    }
  }
  setIsNextPage(next: boolean) {
    if (this.isLazy === true && this.pagination) {
      this.pagination.hasNextPage = next;
    }
  }

  setIsPreviousPage(previous: boolean) {
    if (this.isLazy === true && this.pagination) {
      this.pagination.hasPreviousPage = previous;
    }
  }

  setTotalPages(totalPages: number) {
    if (this.isLazy === true && this.pagination) {
      this.pagination.totalPages = totalPages;
    }
  }

  setFindSchema(isSchema: boolean) {
    this.isSchema = isSchema;
  }

  setLazy(lazy: boolean) {
    this.isLazy = lazy;
    if (lazy === false) {
      this.pagination = undefined;
    }
  }
}
