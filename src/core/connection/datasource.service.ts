import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ColumnsTableDto } from './dto/columns-table.dto';
import { UtilService } from '../util/util.service';
import { Query, UpdateQuery, InsertQuery, DeleteQuery, SelectQuery, DataStore } from '../connection/helpers';
import { Pool } from "pg";
import { ResultQuery } from './interfaces/resultQuery';
import { Column } from './interfaces/column';


@Injectable()
export class DataSourceService {

    private pool = new Pool({
        user: process.env.DB_USERNAME,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
    });


    private readonly logger = new Logger('DataSourceService');

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        readonly util: UtilService,
    ) { }


    /**
     * Retorna las columnas de una tabla
     * @param ColumnsTableDto 
     * @returns listado de columnas
     */
    async getColumnsTable(dto: ColumnsTableDto) {
        //Valida DTO
        await this.util.validateDTO(ColumnsTableDto, dto);

        const pq = new SelectQuery(`SELECT 
                    lower(column_name)  as nombre, 
                    upper(column_name)  as nombreVisual, 
                    ordinal_position  as orden,
                    CASE WHEN is_nullable = 'YES' THEN false
                    ELSE true end as requerida,
                    data_type  as tipo,
                    character_maximum_lengtH as  longitud,
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
                    COALESCE(character_maximum_lengtH ,8)as anchoColumna,
                    CASE WHEN numeric_precision isnull THEN false 
                    ELSE true end as isNumber,
                    numeric_scale as decimales,
                    CASE WHEN datetime_precision isnull THEN false 
                    ELSE true end as isDate,
                    CASE WHEN data_type = 'boolean' THEN true 
                    ELSE false end as isBoolean
                    FROM information_schema.columns a       
                    WHERE table_name  = $1 `);

        pq.addStringParam(1, dto.tableName);
        pq.setPaginator(2);
        if (dto.columns) {
            pq.query += ` AND column_name = ANY ($2)`;
            pq.addArrayStringParam(2, dto.columns);
        }
        const data = await this.createQuery(pq);
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
        await this.getSeqTable("sis_usuario", "ide_usua");
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
     * Retorna la data de una consulta en la base de datos
     * @param Query 
     * @returns Array data
     */
    async createQuery(query: Query): Promise<any[]> {
        this.formatSqlQuery(query);
        //Ejecuta el query
        try {
            //console.log(query.query);
            const data = await this.dataSource.query(query.query, query.paramValues);
            return data;
        } catch (error) {
            this.logger.error(error);
            throw new InternalServerErrorException(
                `[ERROR] createQuery - ${error}`
            );
        }
    }


    /**
 * Retorna la data de una consulta en la base de datos mediante el Pool pg
 * @param SelectQuery 
 * @returns Array data
 */
    async createQueryPG(query: SelectQuery): Promise<ResultQuery> {
        this.formatSqlQuery(query);
        //Ejecuta el query
        try {
            //console.log(query.query);

            const res = await this.pool.query(query.query, query.params.map(_param => _param.value));

            const typesCols = res._types._types.builtins;

            const cols: Column[] = res.fields.map(function (_col) {
                return {
                    name: _col.name,
                    tableID: _col.tableID,
                    dataTypeID: _col.dataTypeID,
                    dataType: Object.keys(typesCols).find(key => typesCols[key] === _col.dataTypeID),
                    order: _col.columnID,
                    label: _col.name,
                };
            });

            return {
                rowCount: res.rowCount,
                data: res.rows,
                columns: cols

            } as ResultQuery;

        } catch (error) {
            this.logger.error(error);
            throw new InternalServerErrorException(
                `[ERROR] createQueryPG - ${error}`
            );
        }
    }

    private async formatSqlQuery(query: Query) {
        //Forma sentencia sql
        if (query instanceof InsertQuery) this.util.SQL_UTIL.getSqlInsert(query);
        else if (query instanceof UpdateQuery) this.util.SQL_UTIL.getSqlUpdate(query);
        else if (query instanceof DeleteQuery) this.util.SQL_UTIL.getSqlDelete(query);
        else if (query instanceof SelectQuery) this.util.SQL_UTIL.getSqlSelect(query);
        //Valida que exista el mismo numero de $ con los valores de los parámetros
        const countParams = this.util.STRING_UTIL.getCountStringInText("$", query.query);
        if (countParams !== query.paramValues.length) {
            throw new InternalServerErrorException(
                "[ERROR] Número de parámetros es diferente a la cantidad $ en el query"
            );
        }
    }

    /**
     * Retorna el primer registro de una consulta en la base de datos
     * @param SelectQuery 
     * @returns Object data
     */
    async createSingleQuery(query: Query): Promise<any> {
        const data = await this.createQuery(query);
        if (data.length > 0) {
            return data[0];
        }
        return null;
    }


    async createListQuery(listQuery: Query[]): Promise<boolean> {
        const queryRunner = this.dataSource.createQueryRunner();
        try {
            await queryRunner.connect();
            await queryRunner.startTransaction();
            for (let currentQuery of listQuery) {
                this.formatSqlQuery(currentQuery);
                await queryRunner.manager.query(currentQuery.query, currentQuery.paramValues);
            }
            await queryRunner.commitTransaction();
            await queryRunner.release();
            return true;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            await queryRunner.release();
            this.logger.error(error);
            throw new InternalServerErrorException(
                `[ERROR] createQueryList - ${error}`
            );
        }
        return false;
    }


    /**
     * Busca un registro de una tabla
     * @param tableName 
     * @param primaryKey 
     * @param valuePrimaryKey 
     * @returns Object data
     */
    async findOneBy(tableName: string, primaryKey: string, valuePrimaryKey: any) {
        const query = new SelectQuery(`SELECT * from ${tableName} where ${primaryKey} = $1 `);
        query.addNumberParam(1, valuePrimaryKey);
        return await this.createSingleQuery(query);
    }

    /**
     * Retorna el secuencial para el campo primario de una tabla
     * @param tableName 
     * @param primaryKey 
     * @param numberRowsAdded 
     * @returns 
     */
    async getSeqTable(tableName: string, primaryKey: string, numberRowsAdded: number = 1): Promise<number> {
        {
            let seq = 0;
            //Busca maximo en la tabla sis_bloqueo
            const query = new SelectQuery(`select maximo_bloq from sis_bloqueo where tabla_bloq = $1 `);
            query.addStringParam(1, tableName.toUpperCase());
            const data = await this.createQuery(query);
            if (data.length > 0) {
                //Calcula el secuencial de la tabla
                seq = parseInt(data[0].maximo_bloq);
                //Actualiza secuencial en la tabla sis_bloqueo
                const queryUpdate = new UpdateQuery("sis_bloqueo");
                queryUpdate.values.set("maximo_bloq", (seq + numberRowsAdded));
                queryUpdate.where = "tabla_bloq = $1";
                queryUpdate.addStringParam(1, tableName.toUpperCase());
                await this.createQuery(queryUpdate);
            }
            else {
                //Si no existe busca el maximo de la tabla
                const queryCon = new SelectQuery(`SELECT COALESCE(MAX(${primaryKey}),0) AS max FROM ${tableName}`);
                const dataCon = await this.createQuery(queryCon);
                if (dataCon.length > 0) {
                    seq = parseInt(dataCon[0].max);
                }
                //Inserta secuencial en la tabla sis_bloqueo
                const queryMax = new SelectQuery(`SELECT COALESCE(MAX(ide_bloq),0)+1 AS max FROM sis_bloqueo`);
                const dataMax = await this.createQuery(queryMax);
                const queryInsert = new InsertQuery("sis_bloqueo");
                queryInsert.values.set("maximo_bloq", (seq + numberRowsAdded));
                queryInsert.values.set("tabla_bloq", tableName.toUpperCase());
                queryInsert.values.set("ide_bloq", (dataMax[0].max));
                queryInsert.values.set("usuario_bloq", "sa");  //-----
                await this.createQuery(queryInsert);
            }
            seq++;
            return seq;
        }
    }


    async executeDataStore(...dataStore: DataStore[]) {
        let listQuery: Query[] = [];
        for (let ds of dataStore) {
            if (ds.listQuery.length > 0) {
                listQuery.push(...ds.listQuery);
            }
        }
        await this.createListQuery(listQuery);
    }
}