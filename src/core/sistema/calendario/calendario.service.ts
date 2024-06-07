import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../../connection/datasource.service';
import { ServiceDto } from '../../../common/dto/service.dto';
import { SelectQuery } from '../../connection/helpers/select-query';
import { ResultQuery } from '../../../../dist/core/connection/interfaces/resultQuery';
import { CreateEventDto } from './dto/event.dto';
import { InsertQuery } from '../../connection/helpers/insert-query';
import { ObjectQueryDto } from '../../connection/dto/object-query.dto';
import { UpdateQuery } from '../../connection/helpers/update-query';
import { DeleteQuery } from 'src/core/connection/helpers';

@Injectable()
export class CalendarioService {


    private tableName = 'sis_calendario';
    private primaryKey = 'ide_cale';

    constructor(private readonly dataSource: DataSourceService) { }

    /**
    * Retorna el listado de Usuarios
    * @returns 
    */
    async getEvents(_dtoIn?: ServiceDto) {

        const query = new SelectQuery(`
        SELECT
            uuid as id,
            titulo_cale as title,
            descripcion_cale as description,
            fecha_inicio_cale as start,
            fecha_fin_cale as end,
            color_cale as color,
            todo_el_dia_cale as allDay,
            ide_usua,
            ide_cale
        FROM
            sis_calendario
        WHERE
            fecha_inicio_cale >= '2020-01-01'
        AND publico_cale = TRUE
        ORDER BY fecha_inicio_cale
        `);
        const data = await this.dataSource.createQuery(query);


        return {
            rows: data,
            rowCount: data?.length
        } as ResultQuery;
    }


    async createEvent(dto: CreateEventDto): Promise<ResultQuery> {
        const { event, ide_inarti } = dto;
        const insertQuery = new InsertQuery(this.tableName, dto)
        delete event[`${this.primaryKey}`]
        insertQuery.setValues(event);
        insertQuery.values.set("ide_inarti", ide_inarti || null);
        insertQuery.values.set(this.primaryKey, await this.dataSource.getSeqTable(this.tableName, this.primaryKey, 1, dto.login));
        await this.dataSource.createQuery(insertQuery);
        return {
            message: `Evento creado exitosamente`
        } as ResultQuery;
    }


    async updateEvent(dto: CreateEventDto): Promise<ResultQuery> {
        const { event, ide_inarti } = dto;
        const updateQuery = new UpdateQuery(this.tableName, dto)
        delete event[`${this.primaryKey}`]
        updateQuery.setValues(event);
        updateQuery.values.set("ide_inarti", ide_inarti || null);
        updateQuery.where = `${this.primaryKey} = $1`
        updateQuery.addParam(1, event[`${this.primaryKey}`]);
        await this.dataSource.createQuery(updateQuery);
        return {
            message: `Evento actualizado exitosamente`
        } as ResultQuery;
    }

    async deleteEvent(dto: CreateEventDto): Promise<ResultQuery> {
        const { event } = dto;
        const deleteQuery = new DeleteQuery(this.tableName)
        deleteQuery.where = `${this.primaryKey} = $1`
        deleteQuery.addParam(1, event[`${this.primaryKey}`]);
        await this.dataSource.createQuery(deleteQuery);
        return {
            message: `Evento eliminado exitosamente`
        } as ResultQuery;
    }

}
