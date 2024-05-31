import { Query } from "./query";
import { ServiceDto } from '../../../common/dto/service.dto';
import { isDefined } from '../../util/helpers/common-util';

export class SelectQuery extends Query {

    pagination?: {
        offset: number;
        rows: number;
        page: number;
    }

    constructor(query: string, dto?: ServiceDto) {
        super();
        this.query = query;
        if (dto) {
            // Asigna valores paginador
            const { pagination } = dto;
            if (isDefined(pagination)) {
                this.pagination = {
                    rows: pagination.rows,
                    page: pagination.page,
                    offset: this.calculateOffset(pagination.rows, pagination.page)
                }
            }
        }
    }

    private calculateOffset(rows: number, page: number): number {
        return (page - 1) * rows;
    }

    getPagination() {
        return this.pagination;
    }

}