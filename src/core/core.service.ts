import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { DataSourceService } from './connection/datasource.service';
import { UpdateQuery, DeleteQuery, InsertQuery, SelectQuery, Query } from './connection/helpers';
import { ColumnsTableDto, TableQueryDto, SaveListDto, UniqueDto, DeleteDto, SeqTableDto, ListDataValuesDto, ObjectQueryDto, FindByUuidDto } from './connection/dto';
import { validate } from 'class-validator';
import { ClassConstructor, plainToClass } from "class-transformer";
import { getDateFormat, getTimeFormat } from './util/helpers/date-util';
import { toObjectTable } from './util/helpers/sql-util';
import { isDefined } from './util/helpers/common-util';
import { ResultQuery } from './connection/interfaces/resultQuery';

@Injectable()
export class CoreService {

    constructor(private readonly dataSource: DataSourceService) {
    }

    /**
     * Retorna una lista de datos para componentes como Select, Autocomplete
     * @param dto 
     * @returns 
     */
    async getListDataValues(dto: ListDataValuesDto) {
        const where = dto.where && ` WHERE 1=1 AND ${dto.where}`;
        const orderBy = dto.orderBy || dto.columnLabel;
        const pq = new SelectQuery(`SELECT ${dto.primaryKey} as value, ${dto.columnLabel} as label 
                                    FROM ${dto.tableName}  ${where} ORDER BY ${orderBy}`);
        const data: any[] = await this.dataSource.createSelectQuery(pq);
        // data.unshift({ value: '', label: '' }); //Add empty select option
        return data;
    }

    /**
     * Retorna  resultado de un Query
     * @param dto 
     * @returns 
     */
    async getTableQuery(dto: TableQueryDto) {
        const { columns, tableName, where, orderBy, primaryKey } = dto;
        // Default values
        const selectedColumns = columns || '*';
        const whereClause = where || '1=1';
        const orderByClause = orderBy || primaryKey;

        const pgq = new SelectQuery(`        
        SELECT ${selectedColumns} 
        FROM ${tableName} 
        WHERE ${whereClause} 
        ORDER BY ${orderByClause}    
        `, dto);
        const result = await this.dataSource.createQuery(pgq, true, tableName);
        result.key = primaryKey;
        result.ref = tableName;
        return result
    }


    /**
     * Transforma a Query un SaveObjectDto
     * @param dto 
     * @param ideEmpr 
     * @param ideSucu 
     * @param login 
     * @returns 
     */
    toQuery(dto: ObjectQueryDto, ideEmpr: number, ideSucu: number, login: string): UpdateQuery | DeleteQuery | InsertQuery {
        dto.primaryKey = dto.primaryKey.toLocaleLowerCase();
        const mapObject = new Map(Object.entries(toObjectTable(dto.object)));
        const valuePrimaryKey = mapObject.get(dto.primaryKey);
        if (dto.operation === 'update') {
            // asigna valores update campos del core            
            mapObject.set('fecha_actua', getDateFormat(new Date()));
            mapObject.set('hora_actua', getTimeFormat(new Date()));
            mapObject.set('usuario_actua', login);
            const updateQuery = new UpdateQuery(dto.tableName);
            mapObject.delete(dto.primaryKey);
            updateQuery.where = `${dto.primaryKey} = $1`
            updateQuery.addParam(1, valuePrimaryKey);
            updateQuery.values = mapObject;
            return updateQuery;
        }
        else if (dto.operation === 'insert') {
            // insert
            const insertQuery = new InsertQuery(dto.tableName)
            //  asigna valores update campos del core
            mapObject.set('ide_empr', ideEmpr);
            mapObject.set('ide_sucu', ideSucu);
            mapObject.set('fecha_ingre', getDateFormat(new Date()));
            mapObject.set('hora_ingre', getTimeFormat(new Date()));
            mapObject.set('usuario_ingre', login);
            insertQuery.values = mapObject;
            return insertQuery;
        }
        else if (dto.operation === 'delete') {
            const deleteQuery = new DeleteQuery(dto.tableName)
            deleteQuery.where = `${dto.primaryKey} = $1`
            deleteQuery.addParam(1, valuePrimaryKey);
            return deleteQuery;
        }
    }

    /**
     * Guarda el listado de objetos 
     * @param listDto 
     * @returns 
     */
    async save(dto: SaveListDto) {
        const listQuery = dto.listQuery.map(_obj => {
            return this.toQuery(_obj, dto.ideEmpr, dto.ideSucu, dto.login);
        });
        await this.dataSource.createListQuery(listQuery);
        return {
            message: 'ok'
        };
    }


    /**
     * Valida que un valor se único en la base de datos
     * @param dto 
     * @returns 
     */
    async isUnique(dto: UniqueDto) {
        const baseQuery = `SELECT ${dto.columns.map(col => col.columnName).join(', ')} FROM ${dto.tableName} WHERE `;
        const conditions = dto.columns.map((col, index) => `${col.columnName} = $${index + 1}`).join(' OR ');
        const params = dto.columns.map(col => col.value);

        let query = baseQuery + conditions;
        if (dto.id) {
            query += ` AND ${dto.primaryKey} != $${dto.columns.length + 1}`;
            params.push(dto.id);
        }

        try {
            const sq = new SelectQuery(query);
            params.forEach((param, index) => sq.addParam(index + 1, param));
            const result = await this.dataSource.createSelectQuery(sq);

            if (result.length > 0) {
                const duplicates: { columnName: string; value: any }[] = [];

                dto.columns.forEach(col => {
                    const duplicate = result.find(row => row[col.columnName] === col.value);
                    if (duplicate) {
                        duplicates.push({ columnName: col.columnName, value: col.value });
                    }
                });

                if (duplicates.length > 0) {
                    const duplicateRows = duplicates.map(dup => `${dup.value}`).join(', ');
                    return {
                        message: `No se puede guardar el registro debido a que ya existe otro con los mismos valores: ${duplicateRows}`,
                        rows: duplicates
                    } as ResultQuery;
                }
            }

            return { message: 'ok', rows: [] } as ResultQuery;
        } catch (error) {
            throw new InternalServerErrorException(`Error al verificar la unicidad: ${error.message}`);
        }
    }

    /**
     * Valida que se pueda eliminar un registro
     * @param dto 
     * @returns 
     */
    async isDelete(dto: DeleteDto) {
        const dq = new DeleteQuery(dto.tableName);
        dq.where = `${dto.primaryKey} = ANY($1)`;
        dq.addParam(1, dto.values);
        await this.dataSource.isDelete(dq)
        return {
            message: 'ok'
        };
    }

    /**
     * Retona el secuencial de la tabla
     * @param dto 
     * @returns 
     */
    async getSeqTable(dto: SeqTableDto) {
        const seqTable: number = await this.dataSource.getSeqTable(dto.tableName, dto.primaryKey, dto.numberRowsAdded);
        return {
            seqTable,
            message: 'ok'
        };
    }

    /**
     * Busca un regitro de una tabla por uuid
     * @param dto 
     * @returns 
     */
    async findByUuid(dtoIn: FindByUuidDto) {
        const columns = dtoIn.columns || '*'; // all columns
        const query = new SelectQuery(`SELECT ${columns} FROM ${dtoIn.tableName} WHERE uuid = $1`);
        query.addParam(1, dtoIn.uuid);
        return await this.dataSource.createSingleQuery(query);
    }

    async getTableColumns(dtoIn: ColumnsTableDto) {
        return await this.dataSource.getTableColumns(dtoIn.tableName);
    }

    async refreshTableColumns(dtoIn: ColumnsTableDto) {
        return await this.dataSource.updateTableColumnsCache(dtoIn.tableName);
    }

    async clearTableColumnsCache() {
        await this.dataSource.clearSchemaQueryCache();
        return await this.dataSource.clearTableColumnsCache();
    }


    /**  xxxxxxxxxxxxxxxxxxxxxxx
      * Retorna las columnas de una tabla
      * @param ColumnsTableDto 
      * @returns listado de columnas
      */
    async getColumnsTable(dto: ColumnsTableDto) {
        //Valida DTO
        await this.validateDTO(ColumnsTableDto, dto);

        const pq = new SelectQuery(`SELECT 
            column_name as nombre,
            upper(column_name) as nombreVisual,
            ordinal_position as orden,
            CASE WHEN is_nullable = 'YES' THEN false
                    ELSE true end as requerida,
            data_type as tipo,
            character_maximum_lengtH as longitud,
            CASE WHEN numeric_scale isnull THEN 0
                    ELSE numeric_scale end as decimales,
            'Texto' as componente,
            true as visible,
            false as lectura,
            null as valorDefecto,
            null as mascara,
            false as filtro,
            null as comentario,
            false as mayuscula,
            false as unico,
            true as ordenable,
            COALESCE(character_maximum_lengtH, 8) as anchoColumna,
            CASE WHEN numeric_precision isnull THEN false 
                    ELSE true end as isNumber,
            numeric_scale as decimales,
            CASE WHEN datetime_precision isnull THEN false 
                    ELSE true end as isDate,
            CASE WHEN data_type = 'boolean' THEN true 
                    ELSE false end as isBoolean
                    FROM information_schema.columns a       
                    WHERE table_name = $1`);

        pq.addStringParam(1, dto.tableName);
        if (dto.columns) {
            pq.query += ` AND column_name = ANY($2)`;
            pq.addArrayStringParam(2, dto.columns);
        }
        const data = await this.dataSource.createSelectQuery(pq);
        // Valida que retorne resultados 
        if (data.length === 0) {
            throw new BadRequestException(
                `No se encontraron resultados para la tabla: ${dto.tableName}, columnas: ${dto.columns}`
            );
        }

        if (dto.columns) {
            // Valida si se envia nombres de columnas se retorne la misma cantidad de columnas
            if (data.length != dto.columns.length) {
                throw new BadRequestException(
                    `No se encontraron todas las columnas: ${dto.columns}`
                );
            }
        }

        //borrar
        await this.dataSource.getSeqTable("sis_usuario", "ide_usua");
        /** 
        const pu = new UpdateQuery("sis_bloqueo");
        pu.values.set("maximo_bloq", 7);
        pu.where = "ide_bloq = $1 and 2=2";
        pu.addNumberParam(1, 68);        
        const r = await this.dataSource.query(pu.query, pu.paramValues);
        //console.log(pu.query);
        //console.log(pu.paramValues);
        console.log(r);
       
        const iq = new InsertQuery("sis_bloqueo");
        iq.values.set("ide_bloq", 1000)
        iq.values.set("ide_usua", 11)
        iq.values.set("tabla_bloq", "prueba")
        iq.values.set("maximo_bloq", 999)
        iq.values.set("usuario_bloq", "sa")
        const r = await this.createQuery(iq);
        console.log(iq.query);
        console.log(iq.paramValues);
        console.log(r);

        const dq = new DeleteQuery("sis_bloqueo");
        dq.where = "ide_bloq = $1 and 2=2";
        dq.addNumberParam(1, 1000);
        const r2 = await this.createQuery(dq);
        console.log(dq.query);
        console.log(dq.paramValues);
        console.log(r2);
         */
        //fin borrar

        return data;
    }




    /**
     * Valida que un objeto cumpla la estructura de la clase DTO
     */
    validateDTO = async <T extends ClassConstructor<any>>(
        dto: T,
        obj: Object
    ) => {
        // tranform the literal object to class object
        const objInstance = plainToClass(dto, obj);
        // validating and check the errors, throw the errors if exist
        const errors = await validate(objInstance);
        // errors is an array of validation errors
        if (errors.length > 0) {
            throw new BadRequestException(
                `${errors}`
            );
        }
    };


}
