import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { removeEqualsElements } from 'src/util/helpers/array-util';

import { INVENTARIO_VARS } from './data/1-inv-var';
import { GetVariableDto } from './dto/get-variable.dto';
import { Parametro } from './interfaces/parametro.interface';
import { getModuloDefinition, toModuleID } from './modulos';
import { IMPORTACIONES_VARS } from './data/14-imp-var';

@Injectable()
export class VariablesService {
  private readonly logger = new Logger(VariablesService.name);
  private readonly CACHE_PREFIX = 'var_';

  constructor(private readonly dataSource: DataSourceService) { }

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

    const uniqueNames = removeEqualsElements(variableNames.map((v) => v.toLowerCase()));
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
      const cacheKeys = variableNames.map((name) => this.getCacheKey(name));
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

  async getModulosSistema() {
    const query = new SelectQuery(`
      SELECT ide_modu, nom_modu
      FROM sis_modulo
      ORDER BY ide_modu
    `);
    return this.dataSource.createSelectQuery(query);
  }

  async getVariablesModulo(ideModu: number) {
    const query = new SelectQuery(`
      SELECT ide_modu, nom_para, descripcion_para, valor_para,
             tabla_para, campo_codigo_para, campo_nombre_para,
             activo_para, es_empr_para
      FROM sis_parametros
      WHERE ide_modu = $1
      ORDER BY nom_para
    `);
    query.addIntParam(1, ideModu);
    return this.dataSource.createSelectQuery(query);
  }

  // Inserta en la BD las variables que aún no existen; las ya existentes se omiten.
  public async updateVariables(dto: HeaderParamsDto) {
    const allLocalVars = this.getAllVariables();
    const totalLocal = allLocalVars.length;

    if (totalLocal === 0) {
      return { message: 'No hay variables definidas en el sistema.' };
    }

    // 1. Obtener nombres de variables que ya existen en la BD (globales + de esta empresa)
    const existingQuery = new SelectQuery(`
      SELECT nom_para, es_empr_para
      FROM sis_parametros
      WHERE es_empr_para = false
         OR (es_empr_para = true AND ide_empr = $1)
    `);
    existingQuery.addParam(1, dto.ideEmpr);
    const existingRows: { nom_para: string; es_empr_para: boolean }[] =
      await this.dataSource.createSelectQuery(existingQuery);

    const globalSet = new Set<string>();
    const empresaSet = new Set<string>();
    for (const row of existingRows) {
      if (row.es_empr_para) {
        empresaSet.add(row.nom_para.toLowerCase());
      } else {
        globalSet.add(row.nom_para.toLowerCase());
      }
    }

    // 2. Filtrar solo las variables nuevas
    const newVars = allLocalVars.filter((v) => {
      const key = v.nom_para.toLowerCase();
      return v.es_empr_para ? !empresaSet.has(key) : !globalSet.has(key);
    });

    if (newVars.length === 0) {
      return {
        message: `El sistema ya cuenta con todas las variables registradas (${totalLocal} en total). No se realizaron inserciones.`,
      };
    }

    try {
      this.validateParameters(newVars);

      const query = new SelectQuery(`SELECT f_update_variables($1, $2, $3)`);
      query.addParam(1, dto.ideEmpr);
      query.addParam(2, JSON.stringify(newVars));
      query.addParam(3, dto.login);

      const result = await this.dataSource.createSelectQuery(query);
      const inserted: number = result[0]?.f_update_variables ?? newVars.length;

      return {
        message: `Se crearon ${inserted} variable(s) nueva(s). El sistema ahora cuenta con ${existingRows.length + inserted} variable(s) registrada(s) de un total de ${totalLocal} definida(s).`,
        inserted,
        total: totalLocal,
        existing: existingRows.length,
      };
    } catch (error) {
      this.logger.error('Error actualizando variables:', error);
      throw error;
    }
  }

  // ============ Private Methods ============

  private getCacheKey(variableName: string): string {
    return `${this.CACHE_PREFIX}${variableName.toLowerCase()}`;
  }

  private async fetchVariableFromDB(variableName: string): Promise<string | null> {
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
      await this.dataSource.redisClient.set(this.getCacheKey(variableName), value);
    } catch (error) {
      this.logger.warn(`Failed to cache variable ${variableName}: ${error.message}`);
    }
  }

  private async checkCacheForVariables(variables: string[], resultMap: Map<string, string>): Promise<string[]> {
    const variablesToFetch: string[] = [];

    await Promise.all(
      variables.map(async (variable) => {
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
      }),
    );

    return variablesToFetch;
  }

  private async fetchAndCacheVariablesFromDB(variables: string[], resultMap: Map<string, string>): Promise<void> {
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
        }),
      );

      // Check for missing variables
      const missingVars = variables.filter((v) => !resultMap.has(v));
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
      ...IMPORTACIONES_VARS,
      // Agregar más conjuntos de variables
    ];
  }

  /**
   * Función de validación principal
   * @param parameters Array de parámetros a validar
   * @returns true si todas las validaciones pasan
   * @throws Error con mensaje descriptivo si alguna validación falla
   */
  private validateParameters(parameters: Parametro[]): boolean {
    const nombresVariables = new Set<string>();
    const modulePrefixCache = new Map<number, { normal: string; empresa: string }>();

    for (const [index, param] of parameters.entries()) {
      try {
        this.validateSingleParameter(param, nombresVariables, modulePrefixCache);
      } catch (error) {
        throw this.buildValidationError(param, index, error);
      }
    }
    return true;
  }

  private validateSingleParameter(
    param: Parametro,
    nombresVariables: Set<string>,
    prefixCache: Map<number, { normal: string; empresa: string }>,
  ): void {
    // Validación de nombre duplicado
    if (nombresVariables.has(param.nom_para)) {
      throw new Error(`Nombre de parámetro duplicado`);
    }
    nombresVariables.add(param.nom_para);

    // Validación y obtención del módulo
    const moduleId = toModuleID(param.ide_modu);
    const modulo = getModuloDefinition(moduleId);

    // Validación de prefijo (con caché para mejor performance)
    let prefixes = prefixCache.get(moduleId);
    if (!prefixes) {
      prefixes = {
        normal: `p_${modulo.SIGLAS}_`,
        empresa: `pe_${modulo.SIGLAS}_`,
      };
      prefixCache.set(moduleId, prefixes);
    }

    const prefijoEsperado = param.es_empr_para ? prefixes.empresa : prefixes.normal;
    if (!param.nom_para.startsWith(prefijoEsperado)) {
      throw new Error(`El prefijo debe ser '${prefijoEsperado}'`);
    }

    // Validaciones adicionales podrían ir aquí
  }

  private buildValidationError(param: Parametro, index: number, error: unknown): Error {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Error(
      `Error en validación de parámetro #${index + 1}:\n` +
      `- Nombre: ${param.nom_para}\n` +
      `- Módulo ID: ${param.ide_modu}\n` +
      `- es_empr_para: ${param.es_empr_para}\n` +
      `- Descripción: ${param.descripcion_para}\n` +
      `- Error: ${errorMessage}`,
    );
  }
}
