"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataSourceService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const columns_table_dto_1 = require("./dto/columns-table.dto");
const util_service_1 = require("../util/util.service");
const helpers_1 = require("../connection/helpers");
const pg_1 = require("pg");
let DataSourceService = class DataSourceService {
    constructor(dataSource, util) {
        this.dataSource = dataSource;
        this.util = util;
        this.pool = new pg_1.Pool({
            user: process.env.DB_USERNAME,
            host: process.env.DB_HOST,
            database: process.env.DB_NAME,
            password: process.env.DB_PASSWORD,
            port: process.env.DB_PORT,
        });
        this.logger = new common_1.Logger('DataSourceService');
    }
    async getColumnsTable(dto) {
        await this.util.validateDTO(columns_table_dto_1.ColumnsTableDto, dto);
        const pq = new helpers_1.SelectQuery(`SELECT 
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
        if (data.length === 0) {
            throw new common_1.BadRequestException(`No se encontraron resultados para la tabla: ${dto.tableName}, columnas: ${dto.columns}`);
        }
        if (dto.columns) {
            if (data.length != dto.columns.length) {
                throw new common_1.BadRequestException(`No se encontraron todas las columnas: ${dto.columns}`);
            }
        }
        await this.getSeqTable("sis_usuario", "ide_usua");
        return data;
    }
    async createQuery(query) {
        this.formatSqlQuery(query);
        try {
            const data = await this.dataSource.query(query.query, query.paramValues);
            return data;
        }
        catch (error) {
            this.logger.error(error);
            throw new common_1.InternalServerErrorException(`[ERROR] createQuery - ${error}`);
        }
    }
    async createQueryPG(query) {
        this.formatSqlQuery(query);
        try {
            const res = await this.pool.query(query.query, query.params.map(_param => _param.value));
            const typesCols = res._types._types.builtins;
            const cols = res.fields.map(function (_col) {
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
            };
        }
        catch (error) {
            this.logger.error(error);
            throw new common_1.InternalServerErrorException(`[ERROR] createQueryPG - ${error}`);
        }
    }
    async formatSqlQuery(query) {
        if (query instanceof helpers_1.InsertQuery)
            this.util.SQL_UTIL.getSqlInsert(query);
        else if (query instanceof helpers_1.UpdateQuery)
            this.util.SQL_UTIL.getSqlUpdate(query);
        else if (query instanceof helpers_1.DeleteQuery)
            this.util.SQL_UTIL.getSqlDelete(query);
        else if (query instanceof helpers_1.SelectQuery)
            this.util.SQL_UTIL.getSqlSelect(query);
        const countParams = this.util.STRING_UTIL.getCountStringInText("$", query.query);
        if (countParams !== query.paramValues.length) {
            throw new common_1.InternalServerErrorException("[ERROR] Número de parámetros es diferente a la cantidad $ en el query");
        }
    }
    async createSingleQuery(query) {
        const data = await this.createQuery(query);
        if (data.length > 0) {
            return data[0];
        }
        return null;
    }
    async createListQuery(listQuery) {
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
        }
        catch (error) {
            await queryRunner.rollbackTransaction();
            await queryRunner.release();
            this.logger.error(error);
            throw new common_1.InternalServerErrorException(`[ERROR] createQueryList - ${error}`);
        }
        return false;
    }
    async findOneBy(tableName, primaryKey, valuePrimaryKey) {
        const query = new helpers_1.SelectQuery(`SELECT * from ${tableName} where ${primaryKey} = $1 `);
        query.addNumberParam(1, valuePrimaryKey);
        return await this.createSingleQuery(query);
    }
    async getSeqTable(tableName, primaryKey, numberRowsAdded = 1) {
        {
            let seq = 0;
            const query = new helpers_1.SelectQuery(`select maximo_bloq from sis_bloqueo where tabla_bloq = $1 `);
            query.addStringParam(1, tableName.toUpperCase());
            const data = await this.createQuery(query);
            if (data.length > 0) {
                seq = parseInt(data[0].maximo_bloq);
                const queryUpdate = new helpers_1.UpdateQuery("sis_bloqueo");
                queryUpdate.values.set("maximo_bloq", (seq + numberRowsAdded));
                queryUpdate.where = "tabla_bloq = $1";
                queryUpdate.addStringParam(1, tableName.toUpperCase());
                await this.createQuery(queryUpdate);
            }
            else {
                const queryCon = new helpers_1.SelectQuery(`SELECT COALESCE(MAX(${primaryKey}),0) AS max FROM ${tableName}`);
                const dataCon = await this.createQuery(queryCon);
                if (dataCon.length > 0) {
                    seq = parseInt(dataCon[0].max);
                }
                const queryMax = new helpers_1.SelectQuery(`SELECT COALESCE(MAX(ide_bloq),0)+1 AS max FROM sis_bloqueo`);
                const dataMax = await this.createQuery(queryMax);
                const queryInsert = new helpers_1.InsertQuery("sis_bloqueo");
                queryInsert.values.set("maximo_bloq", (seq + numberRowsAdded));
                queryInsert.values.set("tabla_bloq", tableName.toUpperCase());
                queryInsert.values.set("ide_bloq", (dataMax[0].max));
                queryInsert.values.set("usuario_bloq", "sa");
                await this.createQuery(queryInsert);
            }
            seq++;
            return seq;
        }
    }
    async executeDataStore(...dataStore) {
        let listQuery = [];
        for (let ds of dataStore) {
            if (ds.listQuery.length > 0) {
                listQuery.push(...ds.listQuery);
            }
        }
        await this.createListQuery(listQuery);
    }
};
DataSourceService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.DataSource,
        util_service_1.UtilService])
], DataSourceService);
exports.DataSourceService = DataSourceService;
//# sourceMappingURL=datasource.service.js.map