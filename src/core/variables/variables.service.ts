import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { removeEqualsElements } from 'src/util/helpers/array-util';
import { GetVariableDto } from './dto/get-variable.dto';
import * as fs from 'fs';
import * as path from 'path';
import { INVENTARIO_VARS } from './data/1-inventario-var';
import { Parametro } from './interfaces/parametro.interface';


@Injectable()
export class VariablesService {
    private readonly logger = new Logger(VariablesService.name);
    private readonly CACHE_PREFIX = 'var_';

    constructor(
        private readonly dataSource: DataSourceService,
    ) { }

    async getVariable(dto: GetVariableDto & HeaderParamsDto): Promise<string | null> {
        const cacheKey = this.getCacheKey(dto.name);

        try {
            // Intenta obtener de Redis primero
            const cachedValue = await this.dataSource.redisClient.get(cacheKey);
            if (cachedValue !== null) {
                return cachedValue;
            }

            // Si no está en cache, busca en DB
            const dbValue = await this.fetchVariableFromDB(dto.name);
            if (dbValue !== null) {
                await this.cacheVariable(dto.name, dbValue);
            }
            return dbValue;

        } catch (error) {
            this.logger.error(`Error getting variable ${dto.name}: ${error.message}`);
            throw new BadRequestException(error.message);
        }
    }


    async getVariableEmpresa(dto: GetVariableDto & HeaderParamsDto): Promise<string | null> {
        const cacheKey = `${this.getCacheKey(dto.name)}_${dto.ideEmpr}`;

        try {
            // Intenta obtener de Redis primero
            const cachedValue = await this.dataSource.redisClient.get(cacheKey);
            if (cachedValue !== null) {
                return cachedValue;
            }

            // Si no está en cache, busca en DB
            const dbValue = await this.fetchVariableEmpresaFromDB(dto.name, dto.ideEmpr);
            if (dbValue !== null) {
                await this.cacheVariable(dto.name, dbValue);
            }
            return dbValue;

        } catch (error) {
            this.logger.error(`Error getting variable ${dto.name}: ${error.message}`);
            throw new BadRequestException(error.message);
        }
    }

    async getVariables(variableNames: string[]): Promise<Map<string, string>> {
        if (!Array.isArray(variableNames)) {
            throw new BadRequestException('Input must be an array of variable names');
        }

        const uniqueNames = removeEqualsElements(variableNames.map(v => v.toLowerCase()));
        const resultMap = new Map<string, string>();

        try {
            // 1. Check Redis cache first
            const variablesToFetch = await this.checkCacheForVariables(uniqueNames, resultMap);

            // 2. Fetch remaining from DB if needed
            if (variablesToFetch.length > 0) {
                await this.fetchAndCacheVariablesFromDB(variablesToFetch, resultMap);
            }

            return resultMap;
        } catch (error) {
            this.logger.error(`Error getting multiple variables: ${error.message}`);
            throw new BadRequestException('Failed to get variables');
        }
    }

    async clearCacheVariables(variableNames: string[]): Promise<{ deleted: number }> {
        if (!Array.isArray(variableNames)) {
            throw new BadRequestException('Input must be an array');
        }

        try {
            const cacheKeys = variableNames.map(name => this.getCacheKey(name));
            const deletedCount = await this.dataSource.redisClient.del(...cacheKeys);
            return { deleted: deletedCount };
        } catch (error) {
            this.logger.error(`Cache clear error: ${error.message}`);
            throw new BadRequestException('Failed to clear cache');
        }
    }

    async clearAllCacheVariables(): Promise<{ deleted: number }> {
        try {
            const totalDeleted = await this.clearCacheByPattern(`${this.CACHE_PREFIX}*`);
            return { deleted: totalDeleted };
        } catch (error) {
            this.logger.error(`Full cache clear error: ${error.message}`);
            throw new BadRequestException('Failed to clear all cache');
        }
    }



    // Actualizar variables en la base de datos
    public async updateVariables(dto: HeaderParamsDto) {
        const variables = this.getAllVariables();

        if (variables.length === 0) {
            console.log('No se encontraron variables para actualizar');
            return;
        }
        console.log(variables);
        try {
            const query = new SelectQuery(`SELECT f_update_variables($1, $2)`);
            query.addParam(1, dto.ideEmpr);
            query.addParam(2, JSON.stringify(variables));

            await this.dataSource.createSelectQuery(query);
            return {
                message: `Variables actualizadas para empresa ${dto.ideEmpr}`
            }
        } catch (error) {
            console.error('Error actualizando variables:', error);
            throw error;
        }
    }

    // ============ Private Methods ============

    private getCacheKey(variableName: string): string {
        return `${this.CACHE_PREFIX}${variableName.toLowerCase()}`;
    }

    private async fetchVariableFromDB(variableName: string,): Promise<string | null> {
        const query = new SelectQuery(`SELECT f_get_variable($1)`);
        query.addParam(1, variableName);
        const result = await this.dataSource.createSelectQuery(query);
        return result[0]?.f_get_variable ?? null;
    }

    private async fetchVariableEmpresaFromDB(variableName: string, ideEmpr: number): Promise<string | null> {
        const query = new SelectQuery(`SELECT f_get_variable_empresa($1,$2)`);
        query.addParam(1, variableName);
        query.addParam(2, ideEmpr);
        const result = await this.dataSource.createSelectQuery(query);
        return result[0]?.f_get_variable ?? null;
    }

    private async cacheVariable(variableName: string, value: string): Promise<void> {
        try {
            await this.dataSource.redisClient.set(
                this.getCacheKey(variableName),
                value
            );
        } catch (error) {
            this.logger.warn(`Failed to cache variable ${variableName}: ${error.message}`);
        }
    }

    private async checkCacheForVariables(
        variables: string[],
        resultMap: Map<string, string>
    ): Promise<string[]> {
        const variablesToFetch: string[] = [];

        await Promise.all(variables.map(async (variable) => {
            try {
                const cachedValue = await this.dataSource.redisClient.get(this.getCacheKey(variable));
                if (cachedValue !== null) {
                    resultMap.set(variable, cachedValue);
                } else {
                    variablesToFetch.push(variable);
                }
            } catch (error) {
                this.logger.warn(`Cache check failed for ${variable}: ${error.message}`);
                variablesToFetch.push(variable);
            }
        }));

        return variablesToFetch;
    }

    private async fetchAndCacheVariablesFromDB(
        variables: string[],
        resultMap: Map<string, string>
    ): Promise<void> {
        const query = new SelectQuery(`
            SELECT nom_para, valor_para 
            FROM sis_parametros 
            WHERE LOWER(nom_para) = ANY($1)`);
        query.addArrayStringParam(1, variables);

        try {
            const dbResults = await this.dataSource.createSelectQuery(query);

            await Promise.all(
                dbResults.map(async (row) => {
                    const varName = row.nom_para.toLowerCase();
                    const varValue = row.valor_para;
                    resultMap.set(varName, varValue);
                    await this.cacheVariable(varName, varValue);
                })
            );

            // Check for missing variables
            const missingVars = variables.filter(v => !resultMap.has(v));
            if (missingVars.length > 0) {
                this.logger.warn(`Missing variables in DB: ${missingVars.join(', ')}`);
            }
        } catch (error) {
            this.logger.error(`DB fetch failed: ${error.message}`);
            throw error;
        }
    }

    private async clearCacheByPattern(pattern: string): Promise<number> {
        let totalDeleted = 0;
        const stream = this.dataSource.redisClient.scanStream({ match: pattern });

        for await (const keys of stream) {
            if (keys.length > 0) {
                const deleted = await this.dataSource.redisClient.del(...keys);
                totalDeleted += deleted;
            }
        }

        return totalDeleted;
    }


    // Cargar todos los parámetros desde los archivos JSON
    private getAllVariables(): Parametro[] {
        return [
            ...INVENTARIO_VARS,
            // Agregar más conjuntos de variables 
        ];
    }
}