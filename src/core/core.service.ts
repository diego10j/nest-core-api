import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { DataSourceService } from './connection/datasource.service';
import { UpdateQuery, DeleteQuery, InsertQuery, SelectQuery, Query } from './connection/helpers';
import { ColumnsTableDto, TableQueryDto, SaveListDto, UniqueDto, DeleteDto, SeqTableDto, ListDataValuesDto, ObjectQueryDto, FindByUuidDto } from './connection/dto';
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
        const data: any[] = await this.dataSource.createQuery(pq);
        data.unshift({ value: '', label: '' }); //Add empty select option
        return data
    }

    /**
     * Retorna  resultado de un Query
     * @param dto 
     * @returns 
     */
    async getTableQuery(dto: TableQueryDto) {
        const columns = dto.columns || '*'; // all columns
        const where = dto.where || '1=1'; // default where
        const orderBy = dto.orderBy || dto.primaryKey;
        const limit = dto.limit ? `LIMIT ${dto.limit}` : '';
        const pgq = new SelectQuery(`SELECT ${columns} FROM ${dto.tableName} WHERE ${where} ORDER BY ${orderBy} ${limit}`);
        return await this.dataSource.createQueryPG(pgq);
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
        const mapObject = new Map(Object.entries(this.dataSource.util.SQL_UTIL.toObjectTable(dto.object)));
        const valuePrimaryKey = mapObject.get(dto.primaryKey);
        if (dto.operation === 'update') {
            // asigna valores del core            
            if (mapObject.has('fecha_actua')) mapObject.set('fecha_actua', this.dataSource.util.DATE_UTIL.getDateFormat(new Date()));
            if (mapObject.has('hora_actua')) mapObject.set('hora_actua', this.dataSource.util.DATE_UTIL.getTimeFormat(new Date()));
            if (mapObject.has('usuario_actua')) mapObject.set('usuario_actua', login);
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
            // asigna valores del core
            if (!this.dataSource.util.isDefined(mapObject.get('ide_empr')))
                if (mapObject.has('ide_empr')) mapObject.set('ide_empr', ideEmpr);
            if (!this.dataSource.util.isDefined(mapObject.get('ide_sucu')))
                if (mapObject.has('ide_sucu')) mapObject.set('ide_sucu', ideSucu);
            if (mapObject.has('fecha_ingre')) mapObject.set('fecha_ingre', this.dataSource.util.DATE_UTIL.getDateFormat(new Date()));
            if (mapObject.has('hora_ingre')) mapObject.set('hora_ingre', this.dataSource.util.DATE_UTIL.getTimeFormat(new Date()));
            if (mapObject.has('usuario_ingre')) mapObject.set('usuario_ingre', login);
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
        const sq = new SelectQuery(`SELECT (1) FROM ${dto.tableName} WHERE ${dto.columnName} = $1`);
        sq.addParam(1, dto.value);
        const data = await this.dataSource.createQuery(sq);
        if (data.length > 0) {
            throw new InternalServerErrorException(`Restricción única, ya existe un registro con el valor ${dto.value} en la columna ${dto.columnName}`);
        } else {
            return {
                message: 'ok'
            };
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
        const queryRunner = await this.dataSource.isDelete(dq)
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
    async findByUuid(dto: FindByUuidDto) {
        const columns = dto.columns || '*'; // all columns
        const pgq = new SelectQuery(`SELECT ${columns} FROM ${dto.tableName} WHERE uuid = $1`);
        pgq.addParam(1, dto.uuid);
        return await this.dataSource.createSingleQuery(pgq);
    }


    /**  xxxxxxxxxxxxxxxxxxxxxxx
      * Retorna las columnas de una tabla
      * @param ColumnsTableDto 
      * @returns listado de columnas
      */
    async getColumnsTable(dto: ColumnsTableDto) {
        //Valida DTO
        await this.dataSource.util.validateDTO(ColumnsTableDto, dto);

        const pq = new SelectQuery(`SELECT 
                    lower(column_name) as nombre,
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
        const data = await this.dataSource.createQuery(pq);
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







}
