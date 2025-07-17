import { BadRequestException,  Injectable } from '@nestjs/common';
import { Console } from 'console';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { removeEqualsElements } from 'src/util/helpers/array-util';
import { GetVariableDto } from './dto/get-variable.dto';

@Injectable()
export class VariablesService {
    private static instance: VariablesService;
    private readonly CACHE_PREFIX = 'var_';

     constructor(
        private readonly dataSource: DataSourceService,
    ) {}

    public static getInstance(
        dataSource: DataSourceService,
    ): VariablesService {
        if (!VariablesService.instance) {
            VariablesService.instance = new VariablesService(dataSource);
        }
        return VariablesService.instance;
    }

    async getVariable(dto: GetVariableDto): Promise<string | null> {
        const cacheKey = this.getCacheKey(dto.name);
        console.log(cacheKey);
        try {
            const cachedValue = await this.dataSource.redisClient.get(cacheKey);
            console.log('redis');
            if (cachedValue !== null) {
                return cachedValue;
            }
        } catch (redisError) {
            console.error(`Redis error for ${dto.name}:`, redisError);
        }
    
        try {
            console.log('bdd');
            const value = await this.fetchVariableFromDB(dto.name);
            if (value !== null) {
                await this.cacheVariable(dto.name, value);
            }
            return value;
        } catch (dbError) {
            // console.error(`DB error for ${dto.name}:`, dbError);
            throw new BadRequestException(dbError.message);
        }
    }

    async getVariables(listVariables: string[]): Promise<Map<string, string>> {
        listVariables = removeEqualsElements(listVariables);
        const lowercaseArray = listVariables.map(item => item.toLowerCase());
        
        const resultMap = new Map();
        const variablesToFetch = await this.checkCacheForVariables(lowercaseArray, resultMap);
        
        if (variablesToFetch.length > 0) {
            await this.fetchAndCacheVariablesFromDB(variablesToFetch, resultMap);
        }
        
        return resultMap;
    }

    async clearCacheVariables(variableNames: string[]): Promise<{ message: string, deleted: number }> {
        if (!Array.isArray(variableNames)) {
            throw new BadRequestException('Invalid input: array expected');
        }
    
        const cacheKeys = variableNames.map(name => this.getCacheKey(name));
        
        try {
            const deletedCount = await this.dataSource.redisClient.del(...cacheKeys);
            return {
                message: `Deleted ${deletedCount} variables`,
                deleted: deletedCount
            };
        } catch (error) {
            console.error('Cache clear error:', error);
            throw new BadRequestException('Failed to clear cache');
        }
    }

    async clearAllCacheVariables(): Promise<{ message: string }> {
        try {
            const totalDeleted = await this.clearCacheByPattern(`${this.CACHE_PREFIX}*`);
            return {
                message: `Cleared ${totalDeleted} variables`
            };
        } catch (error) {
            console.error('Full cache clear error:', error);
            throw new BadRequestException('Failed to clear all cache');
        }
    }

    // ============ Métodos privados ============
    
    private getCacheKey(variableName: string): string {
        return `${this.CACHE_PREFIX}${variableName.toLowerCase()}`;
    }

    private async fetchVariableFromDB(variableName: string): Promise<string | null> {
        const pq = new SelectQuery(`SELECT f_get_variable($1)`);
        pq.addParam(1, variableName);
        const result = await this.dataSource.createSelectQuery(pq);
        return result[0]?.f_get_variable ?? null;
    }

    private async cacheVariable(variableName: string, value: string): Promise<void> {
        const cacheKey = this.getCacheKey(variableName);
        try {
            await this.dataSource.redisClient.set(cacheKey, value);
        } catch (error) {
            console.error(`Caching error for ${variableName}:`, error);
        }
    }

    private async checkCacheForVariables(
        variables: string[],
        resultMap: Map<string, string>
    ): Promise<string[]> {
        const variablesToFetch: string[] = [];
        
        await Promise.all(variables.map(async (variable) => {
            const cacheKey = this.getCacheKey(variable);
            try {
                const cachedValue = await this.dataSource.redisClient.get(cacheKey);
                if (cachedValue !== null) {
                    resultMap.set(variable, cachedValue);
                } else {
                    variablesToFetch.push(variable);
                }
            } catch (error) {
                console.error(`Cache check error for ${variable}:`, error);
                variablesToFetch.push(variable);
            }
        }));
        
        return variablesToFetch;
    }

    private async fetchAndCacheVariablesFromDB(
        variables: string[],
        resultMap: Map<string, string>
    ): Promise<void> {
        const pq = new SelectQuery(`
            SELECT nom_para, valor_para, empresa_para
            FROM sis_parametros
            WHERE LOWER(nom_para) = ANY ($1)`);
        pq.addArrayStringParam(1, variables);
        
        try {
            const dbResults = await this.dataSource.createSelectQuery(pq);
            const cachePromises: Promise<void>[] = [];
            
            dbResults.forEach(data => {
                if (data.empresa_para === true) {
                    const varName = data.nom_para.toLowerCase();
                    const varValue = data.valor_para;
                    resultMap.set(varName, varValue);
                    cachePromises.push(this.cacheVariable(varName, varValue));
                } else {
                    console.error(`Company variable ${data.nom_para} skipped`);
                }
            });
            
            await Promise.all(cachePromises);
            
            const missingVars = variables.filter(v => !resultMap.has(v));
            if (missingVars.length > 0) {
                console.error(`Missing variables: ${missingVars.join(', ')}`);
            }
        } catch (error) {
            console.error('DB fetch error:', error);
            throw new BadRequestException('Failed to fetch variables');
        }
    }

    private async clearCacheByPattern(pattern: string): Promise<number> {
        const stream = this.dataSource.redisClient.scanStream({ match: pattern });
        let totalDeleted = 0;
        
        for await (const keys of stream) {
            if (keys.length) {
                const deleted = await this.dataSource.redisClient.del(...keys);
                totalDeleted += deleted;
            }
        }
        
        return totalDeleted;
    }
}