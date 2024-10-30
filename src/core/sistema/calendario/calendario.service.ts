import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../../connection/datasource.service';
import { ServiceDto } from '../../../common/dto/service.dto';
import { SelectQuery } from '../../connection/helpers/select-query';
import { InsertQuery } from '../../connection/helpers/insert-query';
import { UpdateQuery } from '../../connection/helpers/update-query';
import { DeleteQuery } from 'src/core/connection/helpers';
import { ResultQuery } from 'src/core/connection/interfaces/resultQuery';
import { CreateEventoDto } from './dto/create-evento.dto';
import { UpdateEventoDto } from './dto/update-evento.dto';

@Injectable()
export class CalendarioService {


    private tableName = 'sis_calendario';
    private primaryKey = 'ide_cale';

    constructor(private readonly dataSource: DataSourceService) { }

    /**
    * Retorna el listado de Usuarios
    * @returns 
    */
    async getEventos(dtoIn?: ServiceDto) {

        const query = new SelectQuery(`
        SELECT
            uuid as id,
            titulo_cale as title,
            descripcion_cale as description,
            fecha_inicio_cale as start,
            fecha_fin_cale as end,
            color_cale as color,
            todo_el_dia_cale as allday,
            ide_usua,
            ide_cale,
            publico_cale,
            notificar_cale
        FROM
            sis_calendario
        WHERE
            publico_cale = TRUE
            AND ide_empr = ${dtoIn.ideEmpr}
        ORDER BY fecha_inicio_cale
        `);
        return await this.dataSource.createQuery(query, false);
    }


    async createEvento(dto: CreateEventoDto): Promise<ResultQuery> {

        const insertQuery = new InsertQuery(this.tableName, this.primaryKey, dto)
        insertQuery.values.set('titulo_cale', dto.title);
        insertQuery.values.set('descripcion_cale', dto.description);
        insertQuery.values.set('fecha_inicio_cale', dto.start);
        insertQuery.values.set('fecha_fin_cale', dto.end);
        insertQuery.values.set('todo_el_dia_cale', dto.allday);
        insertQuery.values.set('color_cale', dto.color);
        insertQuery.values.set('ide_usua', dto.ide_usua);
        insertQuery.values.set('publico_cale', dto.publico_cale);
        insertQuery.values.set('notificar_cale', dto.notificar_cale);
        insertQuery.values.set(this.primaryKey, await this.dataSource.getSeqTable(this.tableName, this.primaryKey, 1, dto.login));
        return await this.dataSource.createQuery(insertQuery);
    }


    async updateEvento(dto: UpdateEventoDto): Promise<ResultQuery> {

        const updateQuery = new UpdateQuery(this.tableName, this.primaryKey, dto)
        updateQuery.values.set('titulo_cale', dto.title);
        updateQuery.values.set('descripcion_cale', dto.description);
        updateQuery.values.set('fecha_inicio_cale', dto.start);
        updateQuery.values.set('fecha_fin_cale', dto.end);
        updateQuery.values.set('todo_el_dia_cale', dto.allday);
        updateQuery.values.set('color_cale', dto.color);
        updateQuery.values.set('ide_usua', dto.ide_usua);
        updateQuery.values.set('publico_cale', dto.publico_cale);
        updateQuery.values.set('notificar_cale', dto.notificar_cale);
        updateQuery.where = `uuid = $1`
        updateQuery.addParam(1, dto.id);
        return await this.dataSource.createQuery(updateQuery);
    }

    async deleteEvento(dto: UpdateEventoDto): Promise<ResultQuery> {

        const deleteQuery = new DeleteQuery(this.tableName)
        deleteQuery.where = `uuid = $1`
        deleteQuery.addParam(1, dto.id);
        return await this.dataSource.createQuery(deleteQuery);
    }

}
