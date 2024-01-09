import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UtilService } from '../util/util.service';
import { Query, UpdateQuery, InsertQuery, DeleteQuery, SelectQuery, DataStore } from '../connection/helpers';
import { Pool, types } from "pg";
import { ResultQuery } from './interfaces/resultQuery';
import { ErrorsLoggerService } from '../../errors/errors-logger.service';

@Injectable()
export class DataSourceService {


    private pool = new Pool({
        user: process.env.DB_USERNAME,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
    });
    private TYPE_DATESTAMP = 1082;
    private TYPE_TIMESTAMP = 1114;
    private TYPE_TIMESTAMPTZ = 1184;
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly errorsLoggerService: ErrorsLoggerService,
        readonly util: UtilService,
    ) {
        // Parse types bdd
        types.setTypeParser(this.TYPE_DATESTAMP, (date) => this.util.DATE_UTIL.getDateFormatFront(date));
        types.setTypeParser(this.TYPE_TIMESTAMP, (date) => this.util.DATE_UTIL.getDateTimeFormatFront(date));
        types.setTypeParser(this.TYPE_TIMESTAMPTZ, (date) => this.util.DATE_UTIL.getTimeFormat(date));
    }


    /**
     * Retorna la data de una consulta en la base de datos
     * @param Query 
     * @returns Array data
     */
    async createQuery(query: Query): Promise<any[]> {
        this.formatSqlQuery(query);
        try {
            //console.log(query.query);
            const data = await this.dataSource.query(query.query, query.paramValues);
            return data;
        } catch (error) {
            this.errorsLoggerService.createErrorLog(`[ERROR] createQuery`, error);
            throw new InternalServerErrorException(
                `[ERROR] createQuery - ${error}`
            );
        }
    }

    /**
     * Retorna la data de una consulta en la base de datos mediante el Pool pg
     * @param SelectQuery  primer campo del select debe ser el campo primaryKey de la consulta
     * @param isSchema  por defecto consulta propiedades adicionales de las columnas 
     * @returns Array data
     */
    async createQueryPG(query: SelectQuery, isSchema = true): Promise<ResultQuery> {
        this.formatSqlQuery(query);
        //Ejecuta el query
        try {
            // console.log(query.query);
            let primaryKey = "id";
            const res = await this.pool.query(query.query, query.params.map(_param => _param.value));
            const columnsNames: string[] = res.fields.map(_element => {
                return _element['name'];
            });
            const tablesID: number[] = res.fields.map(_element => {
                return _element['tableID'];
            });
            const resSchema = isSchema ? await this.getColumnsSchema(this.util.ARRAY_UTIL.removeEqualsElements(columnsNames), this.util.ARRAY_UTIL.removeEqualsElements(tablesID)) : [];
            const typesCols = res._types._types.builtins;
            const cols = res.fields.map((_col, index) => {
                if (index === 0) primaryKey = _col.name;
                const dataTypeCore = this.util.SQL_UTIL.getTypeCoreColumn(Object.keys(typesCols).find(key => typesCols[key] === _col.dataTypeID));
                const alignColumn = this.util.SQL_UTIL.getAlignCoreColumn(dataTypeCore);
                const [colSchema] = isSchema ? resSchema.filter(_element => _element['name'] === _col.name) : [{}];
                const sizeColumn = this.util.SQL_UTIL.getSizeCoreColumn(dataTypeCore, colSchema?.length || 0);
                const defaultValue = this.util.SQL_UTIL.getDefaultValueColumn(Object.keys(typesCols).find(key => typesCols[key] === _col.dataTypeID));
                const componentCore = this.util.SQL_UTIL.getComponentColumn(Object.keys(typesCols).find(key => typesCols[key] === _col.dataTypeID));
                const visible = _col.name === primaryKey ? false : this.util.SQL_UTIL.getVisibleCoreColumn(_col.name);

                return {
                    name: _col.name,
                    tableID: _col.tableID,
                    dataTypeID: _col.dataTypeID,
                    dataType: dataTypeCore,
                    order: index,
                    label: _col.name,
                    required: !colSchema?.nullable || false,
                    visible,
                    length: colSchema?.length || 0,
                    decimals: colSchema?.decimals,
                    disabled: false,
                    filter: false,
                    comment: '',
                    component: componentCore,
                    upperCase: false,
                    orderable: true,
                    size: sizeColumn,
                    align: alignColumn,
                    defaultValue,
                    header: _col.name,
                    accessorKey: _col.name
                };
            });
            return {
                rowCount: res.rowCount,
                rows: res.rows,
                columns: cols,
                key: primaryKey
            } as ResultQuery;

        } catch (error) {
            this.errorsLoggerService.createErrorLog(`[ERROR] createQueryPG`, error);
            throw new InternalServerErrorException(
                `[ERROR] createQueryPG - ${error}`
            );
        }
    }

    private async formatSqlQuery(query: Query) {
        //Forma sentencia sql
        try {
            if (query instanceof InsertQuery) this.util.SQL_UTIL.getSqlInsert(query);
            else if (query instanceof UpdateQuery) this.util.SQL_UTIL.getSqlUpdate(query);
            else if (query instanceof DeleteQuery) this.util.SQL_UTIL.getSqlDelete(query);
            else if (query instanceof SelectQuery) this.util.SQL_UTIL.getSqlSelect(query);
        }
        catch (error) {
            this.errorsLoggerService.createErrorLog(`[ERROR] formatSqlQuery`, error);
            throw new InternalServerErrorException(error);
        }
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
            this.errorsLoggerService.createErrorLog(`[ERROR] createQueryList`, error);
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

    /**
     * Retorna propiedades de las columnas 
     * @param columnsName 
     * @param tablesID 
     * @returns 
     */
    private async getColumnsSchema(columnsName: string[], tablesID: number[]) {
        const pq = new SelectQuery(`
        SELECT 
        column_name as name,
        character_maximum_lengtH as length,
        numeric_scale  as decimals,
        CASE WHEN is_nullable = 'NO' THEN false  ELSE true  END as  nullable,
        table_name as table,
        data_type as type     
        FROM information_schema.columns a        
        WHERE table_name IN (SELECT relname FROM pg_class WHERE oid  = ANY ($1))
        AND column_name = ANY ($2)`);
        pq.addArrayNumberParam(1, tablesID);
        pq.addArrayStringParam(2, columnsName);
        return await this.createQuery(pq);
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


    async isDelete(dq: DeleteQuery) {
        const queryRunner = this.dataSource.createQueryRunner();
        try {
            await queryRunner.connect();
            await queryRunner.startTransaction();
            this.formatSqlQuery(dq);
            await queryRunner.manager.query(dq.query, dq.paramValues);
            await queryRunner.rollbackTransaction();
            await queryRunner.release();
        } catch (error) {
            await queryRunner.rollbackTransaction();
            await queryRunner.release();
            throw new InternalServerErrorException(
                `Restricción eliminar - ${error}`
            );
        }
    }

    /**
     * Recupera los valores de un listado de variables
     * @param listVariables 
     * @returns 
     */
    async getVariables(listVariables: string[]) {
        listVariables = this.util.ARRAY_UTIL.removeEqualsElements(listVariables);
        const lowercaseArray = listVariables.map(item => item.toLowerCase());
        const pq = new SelectQuery(`
            SELECT nom_para,valor_para
            FROM sis_parametros
            WHERE LOWER(nom_para) = ANY ($1)`);
        pq.addArrayStringParam(1, lowercaseArray);
        const resp = await this.createQuery(pq);
        const respMap = new Map();
        resp.forEach(data => {
            respMap.set(data.nom_para, data.valor_para);
        });
        if (lowercaseArray.length !== respMap.size) {
            console.log(
                `No se encontraron todas las variables del sistema`
            );
        }
        return respMap;
    }

}