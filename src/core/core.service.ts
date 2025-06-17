import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { DataSourceService } from './connection/datasource.service';
import { UpdateQuery, DeleteQuery, InsertQuery, SelectQuery, Query } from './connection/helpers';
import { ColumnsTableDto, TableQueryDto, SaveListDto, UniqueDto, DeleteDto, SeqTableDto, ListDataValuesDto, ObjectQueryDto, FindByUuidDto, FindByIdDto, UpdateColumnsDto } from './connection/dto';
import { validate } from 'class-validator';
import { ClassConstructor, plainToClass } from "class-transformer";
import { toObjectTable, toStringColumns } from '../util/helpers/sql-util';
import { ResultQuery } from './connection/interfaces/resultQuery';
import { TreeDto } from './connection/dto/tree-dto';
import { isDefined } from '../util/helpers/common-util';
import { SearchTableDto } from 'src/common/dto/search-table.dto';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

@Injectable()
export class CoreService {

    constructor(private readonly dataSource: DataSourceService) {
    }

    /**
     * Retorna una lista de datos para componentes como Select, Autocomplete
     * @param dto 
     * @returns 
     */
    async getListDataValues(dto: ListDataValuesDto & HeaderParamsDto) {
        const condition = dto.condition && ` WHERE 1=1 AND ${dto.condition}`;
        const columnOrder = dto.columnOrder || dto.columnLabel;
        const pq = new SelectQuery(`SELECT CAST(${dto.primaryKey} AS VARCHAR) as value, ${dto.columnLabel} as label 
                                    FROM ${dto.module}_${dto.tableName}  ${condition} ORDER BY ${columnOrder}`);
        const data: any[] = await this.dataSource.createSelectQuery(pq);
        // data.unshift({ value: '', label: '' }); //Add empty select option
        return data;
    }

    /**
     * Retorna todos los registros 
     * @param dto 
     * @returns 
     */
    async getTableQuery(dto: TableQueryDto & HeaderParamsDto) {
        const { columns, module, tableName, condition, orderBy, primaryKey } = dto;
        // Default values
        const selectedColumns = columns || '*';
        const whereClause = condition || '1=1';
        const orderByClause = orderBy?.column || primaryKey;

        const pgq = new SelectQuery(`        
        SELECT ${selectedColumns} 
        FROM ${module}_${tableName} 
        WHERE 1=1 AND ${whereClause} 
        ORDER BY ${orderByClause}
        `, dto);
        // ide_empr = ${dto.ideEmpr} AND 
        const result = await this.dataSource.createQuery(pgq, `${module}_${tableName}`);
        result.key = primaryKey;
        result.ref = `${module}_${tableName}`;
        return result
    }


    async getTableQueryByUuid(dto: FindByUuidDto & HeaderParamsDto) {
        let whereClause = `uuid = '${dto.uuid}'`;
        if (isDefined(dto.uuid) === false) {
            whereClause = `${dto.primaryKey} = -1`;
        }
        const dtoIn = { ...dto, condition: `${whereClause}` }
        return this.getTableQuery(dtoIn);
    }


    async getTableQueryById(dto: FindByIdDto & HeaderParamsDto) {

        const whereClause = `${dto.primaryKey} = ${dto.value}`;
        const dtoIn = { ...dto, condition: `${whereClause}` }
        return await this.getTableQuery(dtoIn);
    }


    /**
     * Guarda el listado de objetos query
     * @param listDto 
     * @returns 
     */
    async save(dto: SaveListDto & HeaderParamsDto) {
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
    async isUnique(dto: UniqueDto & HeaderParamsDto) {
        const baseQuery = `SELECT ${dto.columns.map(col => col.columnName).join(', ')} FROM ${dto.module}_${dto.tableName} WHERE `;
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
    async canDelete(dto: DeleteDto & HeaderParamsDto) {
        const dq = new DeleteQuery(`${dto.module}_${dto.tableName}`);
        dq.where = `${dto.primaryKey} = ANY($1)`;
        dq.addParam(1, dto.values);
        await this.dataSource.canDelete(dq, dto.validate)
        return {
            message: 'ok'
        };
    }

    /**
     * Retona el secuencial de la tabla
     * @param dto 
     * @returns 
     */
    async getSeqTable(dto: SeqTableDto & HeaderParamsDto) {
        const seqTable: number = await this.dataSource.getSeqTable(`${dto.module}_${dto.tableName}`, dto.primaryKey, dto.numberRowsAdded);
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
    async findByUuid(dtoIn: FindByUuidDto & HeaderParamsDto) {
        const columns = dtoIn.columns || '*'; // all columns
        let whereClause = `uuid = '${dtoIn.uuid}'`;
        if (isDefined(dtoIn.uuid) === false) {
            whereClause = `${dtoIn.primaryKey} = -1`;
        }
        const query = new SelectQuery(`SELECT ${columns} FROM ${dtoIn.module}_${dtoIn.tableName} WHERE ${whereClause}`);
        return await this.dataSource.createSingleQuery(query);
    }

    async findById(dtoIn: FindByIdDto & HeaderParamsDto) {
        const columns = dtoIn.columns || '*'; // all columns
        const whereClause = `${dtoIn.primaryKey} = ${dtoIn.value}`;
        const query = new SelectQuery(`SELECT ${columns} FROM ${dtoIn.module}_${dtoIn.tableName} WHERE ${whereClause}`);
        const res = await this.dataSource.createSingleQuery(query);
        if (!isDefined(res)) {
            throw new BadRequestException(`Error no existe el registro con id ${dtoIn.value}`);
        }
        return res;
    }

    async search(dtoIn: SearchTableDto & HeaderParamsDto) {
        if (dtoIn.value === "") {
            return [];
        }

        // Normalizar el valor de búsqueda (quitar tildes y convertir a minúsculas)
        const normalizedSearchValue = this.normalizeString(dtoIn.value.trim());
        const sqlSearchValue = `%${normalizedSearchValue}%`;


        const selectClause = toStringColumns(dtoIn.columnsReturn);

        const whereClause = dtoIn.columnsSearch.map((col, index) =>
        `regexp_replace(unaccent(LOWER(${col})), '[^a-z0-9]', '', 'g') LIKE $${index + 1}`
        ).join(' OR ');

        const extraCondition = dtoIn.condition ? `AND ${dtoIn.condition} ` : '';

        const orderByClause = `ORDER BY ${dtoIn.columnOrder}`;

        const query = new SelectQuery(`
        SELECT ${selectClause}
        FROM ${dtoIn.module}_${dtoIn.tableName}
        WHERE ${whereClause}
        ${extraCondition}
        ${orderByClause}
        LIMIT ${dtoIn.limit}`, dtoIn);
        // console.log(query)

        // Añadir parámetros para cada columna de búsqueda (repetir el valor para cada columna)
        for (let i = 0; i < dtoIn.columnsSearch.length; i++) {
            query.addStringParam(i + 1, sqlSearchValue); // $1, $2, etc. con el mismo valor
        }
        return await this.dataSource.createSelectQuery(query);
    }

    // Método para normalizar strings (quitar tildes y caracteres especiales)
    private normalizeString(str: string): string {
        return str
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // Elimina diacríticos
            .replace(/[^a-z0-9]/g, "");     // Elimina todo lo que no sea alfanumérico
    }


    async getTableColumns(dtoIn: ColumnsTableDto & HeaderParamsDto) {
        return await this.dataSource.getTableColumns(`${dtoIn.module}_${dtoIn.tableName}`);
    }

    async refreshTableColumns(dtoIn: ColumnsTableDto & HeaderParamsDto) {
        return await this.dataSource.updateTableColumnsCache(`${dtoIn.module}_${dtoIn.tableName}`);
    }

    async clearCacheRedis() {
        return await this.dataSource.clearCacheRedis();
    }



    async getTreeModel(dtoIn: TreeDto & HeaderParamsDto) {
        const conditionClause = dtoIn.condition ? `AND ${dtoIn.condition}` : '';
        const orderColumn = dtoIn.orderBy ? dtoIn.orderBy.column : dtoIn.columnName;

        const query = new SelectQuery(`
    WITH RECURSIVE tree_items AS (
        -- Nodos raíz
        SELECT 
            ${dtoIn.primaryKey} AS id,
            ${dtoIn.columnName} AS label,
            ${dtoIn.columnNode} AS parent_id,
            ${orderColumn} AS order_column,
            1 AS level
        FROM 
            ${dtoIn.module}_${dtoIn.tableName}
        WHERE 
            ${dtoIn.columnNode} IS NULL
            ${conditionClause}
        
        UNION ALL
        
        -- Nodos hijos
        SELECT 
            child.${dtoIn.primaryKey} AS id,
            child.${dtoIn.columnName} AS label,
            child.${dtoIn.columnNode} AS parent_id,
            child.${orderColumn} AS order_column,
            parent.level + 1
        FROM 
            ${dtoIn.module}_${dtoIn.tableName} child
        JOIN 
            tree_items parent ON child.${dtoIn.columnNode} = parent.id
        WHERE 1=1
            ${conditionClause}
    ),
    -- Construcción del árbol JSON
    tree_json AS (
        SELECT 
            id,
            label,
            parent_id,
            order_column,
            level,
            json_build_object(
                'id', id::text,
                'label', label::text,
                'children', '[]'::json
            ) AS json_data
        FROM tree_items
    ),
    -- Unir hijos con padres
    tree_with_children AS (
        SELECT 
            t1.id,
            t1.label,
            t1.parent_id,
            t1.order_column,
            t1.level,
            CASE WHEN EXISTS (
                SELECT 1 FROM tree_json t2 
                WHERE t2.parent_id = t1.id
            ) THEN
                jsonb_set(
                    t1.json_data::jsonb,
                    '{children}',
                    (
                        SELECT jsonb_agg(t2.json_data ORDER BY t2.order_column)
                        FROM tree_json t2
                        WHERE t2.parent_id = t1.id
                    )
                )
            ELSE
                t1.json_data::jsonb
            END AS json_data
        FROM tree_json t1
    )
    SELECT json_agg(t.json_data ORDER BY t.order_column) AS tree_view
    FROM tree_with_children t
    WHERE t.level = 1;
    `);

        const data = await this.dataSource.createSingleQuery(query);

        return {
            rowCount: 1,
            rows: data.tree_view || []
        } as ResultQuery;
    }


    /**
     * Actualiza la configuracion de las columnas 
     * @param dtoIn 
     * @returns 
     */
    async updateColumns(dtoIn: UpdateColumnsDto & HeaderParamsDto) {
        let ide_tabl = -1;
        // Busca la tabla 
        const baseQuery = `
            SELECT ide_tabl 
            FROM sis_tabla 
            WHERE query_name_tabl = $1
            AND ide_opci ${dtoIn.ide_opci ? '= $2' : 'IS NULL'}`;

        const sq = new SelectQuery(baseQuery);
        sq.addStringParam(1, dtoIn.queryName);
        if (dtoIn.ide_opci) {
            sq.addNumberParam(2, dtoIn.ide_opci);
        }
        const result = await this.dataSource.createSingleQuery(sq);

        if (!isDefined(result)) {
            // Crea registro en sis_tabla
            const insertQuery = new InsertQuery('sis_tabla', 'ide_tabl', dtoIn)
            if (dtoIn.ide_opci) {
                insertQuery.values.set('ide_opci', dtoIn.ide_opci);
            }
            insertQuery.values.set('primaria_tabl', dtoIn.primaryKey);
            insertQuery.values.set('tabla_tabl', dtoIn.queryName);
            insertQuery.values.set('query_name_tabl', dtoIn.queryName);
            ide_tabl = await this.dataSource.getSeqTable('sis_tabla', 'ide_tabl', 1, dtoIn.login);
            insertQuery.values.set('ide_tabl', ide_tabl);
            await this.dataSource.createQuery(insertQuery);
        }
        else {
            ide_tabl = result.ide_tabl;
        }

        const listQuery: Query[] = [];
        // Elimina columnas existentes

        const dq = new DeleteQuery("sis_campo");
        dq.where = "ide_tabl = $1";
        dq.addIntParam(1, ide_tabl);
        listQuery.push(dq);

        // inserta columnas
        let ide_camp = await this.dataSource.getSeqTable('sis_campo', 'ide_camp', dtoIn.columns.length, dtoIn.login);

        dtoIn.columns.forEach((column) => {
            const insertQuery = new InsertQuery('sis_campo', 'ide_camp',);
            insertQuery.values.set('ide_camp', ide_camp);
            insertQuery.values.set('ide_tabl', ide_tabl);
            insertQuery.values.set('nom_camp', column.name);
            insertQuery.values.set('table_id_camp', column.tableID);
            insertQuery.values.set('data_type_id_camp', column.dataTypeID);
            insertQuery.values.set('data_type_camp', column.dataType);
            insertQuery.values.set('orden_camp', column.order);
            insertQuery.values.set('nom_visual_camp', column.label);
            insertQuery.values.set('requerido_camp', column.required);
            insertQuery.values.set('visible_camp', column.visible);
            insertQuery.values.set('length_camp', column.length);
            insertQuery.values.set('precision_camp', column.precision);
            insertQuery.values.set('decimals_camp', column.decimals);
            insertQuery.values.set('lectura_camp', column.disabled);
            // insertQuery.values.set('filtro_camp', column.filter);
            insertQuery.values.set('comentario_camp', column.comment);
            insertQuery.values.set('size_camp', column.size);
            insertQuery.values.set('align_camp', column.align);
            insertQuery.values.set('defecto_camp', column.defaultValue);
            insertQuery.values.set('mayuscula_camp', column.upperCase);
            insertQuery.values.set('mascara_camp', column.mask);
            insertQuery.values.set('usuario_ingre', dtoIn.login);
            listQuery.push(insertQuery);
            ide_camp = ide_camp + 1;
        });
        // Ejecuta querys
        const messages = await this.dataSource.createListQuery(listQuery);

        return {
            message: 'ok',
            rowCount: listQuery.length,
            resultMessage: messages,
        };

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



    /**
     * Transforma a Query un ObjectQueryDto
     * @param dto 
     * @param ideEmpr 
     * @param ideSucu 
     * @param login 
     * @returns 
     */
    private toQuery(dto: ObjectQueryDto, ideEmpr: number, ideSucu: number, login: string, audit: boolean): UpdateQuery | DeleteQuery | InsertQuery {
        dto.primaryKey = dto.primaryKey.toLocaleLowerCase();
        const tableName = `${dto.module}_${dto.tableName}`.toLocaleLowerCase();
        const mapObject = new Map(Object.entries(toObjectTable(dto.object)));
        const valuePrimaryKey = mapObject.get(dto.primaryKey);

        if (dto.operation === 'update') {
            // asigna valores update campos del core            
            mapObject.set('usuario_actua', login);
            const updateQuery = new UpdateQuery(tableName, dto.primaryKey);
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
            const insertQuery = new InsertQuery(tableName, dto.primaryKey)
            insertQuery.setAudit(audit);
            //  asigna valores update campos del core
            if (dto.primaryKey !== 'ide_empr')
                mapObject.set('ide_empr', ideEmpr);
            if (dto.primaryKey !== 'ide_sucu')
                mapObject.set('ide_sucu', ideSucu);
            mapObject.set('usuario_ingre', login);
            insertQuery.values = mapObject;
            return insertQuery;
        }
        else if (dto.operation === 'delete') {
            const deleteQuery = new DeleteQuery(tableName)
            deleteQuery.setAudit(audit);
            if (dto.condition)
                deleteQuery.where = dto.condition;
            else
                deleteQuery.where = `${dto.primaryKey} = ${valuePrimaryKey}`
            // deleteQuery.addParam(1, valuePrimaryKey);
            return deleteQuery;
        }
    }

}
