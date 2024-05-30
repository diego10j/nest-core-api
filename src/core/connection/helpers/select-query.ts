import { Query } from "./query";
import { ServiceDto } from '../../../common/dto/service.dto';

export class SelectQuery extends Query {

    offset?: number;
    rows?: number;
    page?: number;

    constructor(query: string, dto?: ServiceDto) {
        super();
        this.query = query;

        if (dto) {
            // Asigna valores paginador
            const { pagination } = dto;
            if (pagination) {
                const mapObject = new Map(Object.entries(pagination));
                this.rows = mapObject.get('rows')
                this.page = mapObject.get('page')
                this.offset = 0;
            }

        }
    }

    getPagination() {
        return {
            rows: this.rows,
            page: this.page,
            offset: this.offset
        }
    }

}