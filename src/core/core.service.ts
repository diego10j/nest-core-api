import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { DataSourceService } from './connection/datasource.service';
import { UpdateQuery, DeleteQuery, InsertQuery, SelectQuery, Query } from './connection/helpers';
import { ColumnsTableDto, TableQueryDto, SaveListDto, UniqueDto, DeleteDto, SeqTableDto, ListDataValuesDto, ObjectQueryDto, FindByUuidDto } from './connection/dto';
import { validate } from 'class-validator';
import { ClassConstructor, plainToClass } from "class-transformer";
import { getDateFormat, getTimeFormat } from '../util/helpers/date-util';
import { toObjectTable } from '../util/helpers/sql-util';
import { ResultQuery } from './connection/interfaces/resultQuery';
import { TreeDto } from './connection/dto/tree-dto';

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
        const condition = dto.condition && ` WHERE 1=1 AND ${dto.condition}`;
        const orderBy = dto.orderBy || dto.columnLabel;
        const pq = new SelectQuery(`SELECT ${dto.primaryKey} as value, ${dto.columnLabel} as label 
                                    FROM ${dto.tableName}  ${condition} ORDER BY ${orderBy}`);
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
        const { columns, tableName, condition, orderBy, primaryKey } = dto;
        // Default values
        const selectedColumns = columns || '*';
        const whereClause = condition || '1=1';
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
     * Transforma a Query un ObjectQueryDto
     * @param dto 
     * @param ideEmpr 
     * @param ideSucu 
     * @param login 
     * @returns 
     */
    toQuery(dto: ObjectQueryDto, ideEmpr: number, ideSucu: number, login: string, audit: boolean): UpdateQuery | DeleteQuery | InsertQuery {
        dto.primaryKey = dto.primaryKey.toLocaleLowerCase();
        const mapObject = new Map(Object.entries(toObjectTable(dto.object)));
        const valuePrimaryKey = mapObject.get(dto.primaryKey);

        if (dto.operation === 'update') {
            // asigna valores update campos del core            
            mapObject.set('fecha_actua', getDateFormat(new Date()));
            mapObject.set('hora_actua', getTimeFormat(new Date()));
            mapObject.set('usuario_actua', login);
            const updateQuery = new UpdateQuery(dto.tableName, dto.primaryKey);
            updateQuery.setAudit(audit);
            mapObject.delete(dto.primaryKey);
            if (dto.condition)
                updateQuery.where = dto.condition;
            else
                updateQuery.where = `${dto.primaryKey} = ${valuePrimaryKey}`

            // updateQuery.addParam(1, valuePrimaryKey);
            updateQuery.values = mapObject;
            updateQuery.valuePrimaryKey = valuePrimaryKey;
            return updateQuery;
        }
        else if (dto.operation === 'insert') {
            // insert
            const insertQuery = new InsertQuery(dto.tableName, dto.primaryKey)
            insertQuery.setAudit(audit);
            //  asigna valores update campos del core
            if (dto.primaryKey !== 'ide_empr')
                mapObject.set('ide_empr', ideEmpr);
            if (dto.primaryKey !== 'ide_sucu')
                mapObject.set('ide_sucu', ideSucu);
            mapObject.set('fecha_ingre', getDateFormat(new Date()));
            mapObject.set('hora_ingre', getTimeFormat(new Date()));
            mapObject.set('usuario_ingre', login);
            insertQuery.values = mapObject;
            return insertQuery;
        }
        else if (dto.operation === 'delete') {
            const deleteQuery = new DeleteQuery(dto.tableName)
            deleteQuery.setAudit(audit);
            if (dto.condition)
                deleteQuery.where = dto.condition;
            else
                deleteQuery.where = `${dto.primaryKey} = ${valuePrimaryKey}`
            // deleteQuery.addParam(1, valuePrimaryKey);
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
            return this.toQuery(_obj, dto.ideEmpr, dto.ideSucu, dto.login, dto.audit);
        });

        const messages = await this.dataSource.createListQuery(listQuery);

        return {
            message: 'ok',
            rowCount: listQuery.length,
            resultMessage: messages,
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
    async canDelete(dto: DeleteDto) {
        const dq = new DeleteQuery(dto.tableName);
        dq.where = `${dto.primaryKey} = ANY($1)`;
        dq.addParam(1, dto.values);
        await this.dataSource.canDelete(dq)
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



    async getTreeModel(dtoIn: TreeDto) {
        const conditionClause = dtoIn.condition ? `AND ${dtoIn.condition}` : '';
        const orderColumn = dtoIn.orderBy ? dtoIn.orderBy : dtoIn.columnName;

        const query = new SelectQuery(`
    WITH RECURSIVE tree AS (
        -- Selección inicial para los nodos raíz
        SELECT 
            ${dtoIn.primaryKey} AS id,
            ${dtoIn.columnName} AS label,
            ${dtoIn.columnNode} AS parent_id,
            ${orderColumn} AS order_column,
            ARRAY[${dtoIn.primaryKey}] AS path,
            1 AS level
        FROM 
            ${dtoIn.tableName}
        WHERE 
            ${dtoIn.columnNode} IS NULL -- Considerando que los nodos raíz tienen NULL
            ${conditionClause}
        UNION ALL            
        -- Selección recursiva para obtener los hijos
        SELECT 
            child.${dtoIn.primaryKey} AS id,
            child.${dtoIn.columnName} AS label,
            child.${dtoIn.columnNode} AS parent_id,
            child.${orderColumn} AS order_column,
            parent.path || child.${dtoIn.primaryKey},
            parent.level + 1
        FROM 
            ${dtoIn.tableName} child
        JOIN 
            tree parent ON child.${dtoIn.columnNode} = parent.id
        WHERE NOT child.${dtoIn.primaryKey} = ANY(parent.path)
            ${conditionClause}
    )        
    -- Consulta final para construir la vista en formato JSON
    SELECT 
        json_agg(
            json_build_object(
                'id', root.id::text,
                'label', root.label::text,
                'children', (
                    SELECT
                        CASE
                            WHEN COUNT(child.id) > 0 THEN
                                json_agg(
                                    json_build_object(
                                        'id', child.id::text,
                                        'label', child.label::text,
                                        'children', (
                                            SELECT json_agg(
                                                json_build_object(
                                                    'id', grandchild.id::text,
                                                    'label', grandchild.label::text,
                                                    'children', (
                                                        SELECT json_agg(
                                                            json_build_object(
                                                                'id', greatgrandchild.id::text,
                                                                'label', greatgrandchild.label::text
                                                            ) 
                                                        )
                                                        FROM tree greatgrandchild
                                                        WHERE greatgrandchild.parent_id = grandchild.id
                                                    )
                                                )
                                            )
                                            FROM tree grandchild
                                            WHERE grandchild.parent_id = child.id
                                        )
                                    ) 
                                    ORDER BY child.order_column
                                )
                            ELSE NULL
                        END
                    FROM tree child
                    WHERE child.parent_id = root.id
                )
            )
        ORDER BY root.order_column
        ) AS tree_view
    FROM 
        tree root
    WHERE 
        root.level = 1
    `);

        // const data = await this.dataSource.createSingleQuery(query);

        // // Post-procesamiento para eliminar 'children' si es NULL
        // const removeNullChildren = (item) => {
        //     if (item.children === null) {
        //         delete item.children;
        //     }
        //     if (item.children && Array.isArray(item.children)) {
        //         item.children.forEach(removeNullChildren);
        //     }
        //     return item;
        // };

        // const result = data.tree_view.map(removeNullChildren);

        // return {
        //     rowCount: 1,
        //     rows: result || []
        // } as ResultQuery;



        const data = await this.dataSource.createSingleQuery(query);
        return {
            rowCount: 1,
            rows: data.tree_view || []
        } as ResultQuery;
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
