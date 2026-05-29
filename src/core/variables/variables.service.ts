import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { removeEqualsElements } from 'src/util/helpers/array-util';

import { INVENTARIO_VARS } from './data/1-inv-var';
import { IMPORTACIONES_VARS } from './data/14-imp-var';
import { CUENTAS_POR_PAGAR_VARS } from './data/2-cxp-var';
import { CUENTAS_POR_COBRAR_VARS } from './data/3-cxc-var';
import { ActualizarVariableDto } from './dto/actualizar-variable.dto';
import { GetConfiguracionTablaVariableDto } from './dto/get-configuracion-tabla-variable.dto';
import { GetVariableDto } from './dto/get-variable.dto';
import { GetVariablesModuloDto } from './dto/get-variables-modulo.dto';
import { SaveVariableDto } from './dto/save-variable.dto';
import { Parametro } from './interfaces/parametro.interface';
import { getModuloDefinition, toModuleID } from './modulos';

@Injectable()
export class VariablesService {
  private readonly logger = new Logger(VariablesService.name);
  private readonly CACHE_PREFIX = 'var_';

  constructor(private readonly dataSource: DataSourceService) { }

  async getVariable(dto: GetVariableDto & HeaderParamsDto): Promise<string> {
    try {
      const result = await this.resolveVariable(dto.name, dto.ideEmpr);
      return result.valor;
    } catch (error) {
      const msg = (error as Error).message;
      this.logger.error(`Error getting variable ${dto.name}: ${msg}`);
      throw new BadRequestException(msg);
    }
  }

  async getVariableDetail(dto: GetVariableDto & HeaderParamsDto): Promise<{ valor: string; descripcion: string; scope: string; cache: boolean }> {
    try {
      return await this.resolveVariable(dto.name, dto.ideEmpr);
    } catch (error) {
      const msg = (error as Error).message;
      this.logger.error(`Error getting variable ${dto.name}: ${msg}`);
      throw new BadRequestException(msg);
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
      this.logger.error(`Error getting multiple variables: ${(error as Error).message}`);
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
      this.logger.error(`Cache clear error: ${(error as Error).message}`);
      throw new BadRequestException('Failed to clear cache');
    }
  }

  async clearAllCacheVariables(): Promise<{ deleted: number }> {
    try {
      const totalDeleted = await this.clearCacheByPattern(`${this.CACHE_PREFIX}*`);
      return { deleted: totalDeleted };
    } catch (error) {
      this.logger.error(`Full cache clear error: ${(error as Error).message}`);
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

  async getVariablesModulo(dto: GetVariablesModuloDto & HeaderParamsDto) {
    const query = new SelectQuery(`
      SELECT ide_modu, nom_para, descripcion_para, valor_para,
             tabla_para, campo_codigo_para, campo_nombre_para,
             activo_para, es_empr_para
      FROM sis_parametros
      WHERE ide_modu = $1
        AND (es_empr_para = false OR (es_empr_para = true AND ide_empr = $2))
      ORDER BY nom_para
    `, dto);
    query.addIntParam(1, dto.ideModu);
    query.addIntParam(2, dto.ideEmpr);
    return this.dataSource.createQuery(query, 'sis_parametros');
  }

  async getConfiguracionTablaVariable(dto: GetConfiguracionTablaVariableDto & HeaderParamsDto) {
    const configQuery = new SelectQuery(`
      SELECT tabla_para, campo_codigo_para, campo_nombre_para, es_empr_para
      FROM sis_parametros
      WHERE nom_para = $1
    `, dto);
    configQuery.addStringParam(1, dto.nom_para);
    const config = await this.dataSource.createSingleQuery(configQuery);

    if (!config || !config.tabla_para || !config.campo_codigo_para || !config.campo_nombre_para) {
      throw new BadRequestException(
        `La variable "${dto.nom_para}" no tiene configurada una tabla de referencia.`,
      );
    }

    const whereClause = config.es_empr_para
      ? `WHERE ide_sucu = $1`
      : '';

    const query = new SelectQuery(`
      SELECT ${config.campo_codigo_para}, ${config.campo_nombre_para}
      FROM ${config.tabla_para}
      ${whereClause}
      ORDER BY ${config.campo_nombre_para}
    `, dto);
    query.isLazy = false;
    if (config.es_empr_para) {
      query.addIntParam(1, dto.ideSucu);
    }

    return this.dataSource.createQuery(query, config.tabla_para);
  }

  async saveVariable(dtoIn: SaveVariableDto & HeaderParamsDto) {
    const isEmpresa = dtoIn.es_empr_para ?? false;
    const nomPara = dtoIn.nom_para.trim();
    const nomParaLower = nomPara.toLowerCase();

    const existingQuery = isEmpresa
      ? {
        sql: `
            SELECT ide_para
            FROM sis_parametros
            WHERE ide_modu = $1
              AND LOWER(nom_para) = $2
              AND es_empr_para = true
              AND ide_empr = $3
            LIMIT 1
          `,
        params: [dtoIn.ide_modu, nomParaLower, dtoIn.ideEmpr],
      }
      : {
        sql: `
            SELECT ide_para
            FROM sis_parametros
            WHERE ide_modu = $1
              AND LOWER(nom_para) = $2
              AND es_empr_para = false
            LIMIT 1
          `,
        params: [dtoIn.ide_modu, nomParaLower],
      };

    const existingResult = await this.dataSource.pool.query(existingQuery.sql, existingQuery.params);
    const existingIdePara = existingResult.rows?.[0]?.ide_para as number | undefined;

    if (existingIdePara) {
      await this.dataSource.pool.query(
        `
          UPDATE sis_parametros
          SET valor_para = $2,
              descripcion_para = $3,
              activo_para = COALESCE($4, activo_para),
              usuario_actua = $5,
              hora_actua = NOW()
          WHERE ide_para = $1
        `,
        [
          existingIdePara,
          dtoIn.valor_para,
          dtoIn.descripcion_para,
          dtoIn.activo_para ?? null,
          dtoIn.login,
        ],
      );

      await this.clearCacheVariables([nomPara]);
      if (isEmpresa) {
        await this.clearEmpresaCacheVariable(nomPara, dtoIn.ideEmpr);
      }

      return {
        message: `Variable actualizada: ${nomPara}`,
        ide_para: existingIdePara,
        action: 'updated',
      };
    }

    const idePara = await this.dataSource.getSeqTable('sis_parametros', 'ide_para', 1, dtoIn.login);

    await this.dataSource.pool.query(
      `
        INSERT INTO sis_parametros (
          ide_para,
          ide_empr,
          ide_modu,
          nom_para,
          descripcion_para,
          valor_para,
          tabla_para,
          campo_codigo_para,
          campo_nombre_para,
          activo_para,
          usuario_ingre,
          hora_ingre,
          es_empr_para
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),$12)
      `,
      [
        idePara,
        isEmpresa ? dtoIn.ideEmpr : null,
        dtoIn.ide_modu,
        nomPara,
        dtoIn.descripcion_para,
        dtoIn.valor_para,
        dtoIn.tabla_para ?? null,
        dtoIn.campo_codigo_para ?? null,
        dtoIn.campo_nombre_para ?? null,
        dtoIn.activo_para ?? true,
        dtoIn.login,
        isEmpresa,
      ],
    );

    await this.clearCacheVariables([nomPara]);
    if (isEmpresa) {
      await this.clearEmpresaCacheVariable(nomPara, dtoIn.ideEmpr);
    }

    return {
      message: `Variable creada: ${nomPara}`,
      ide_para: idePara,
      action: 'inserted',
    };
  }

  async actualizarVariable(dtoIn: ActualizarVariableDto & HeaderParamsDto) {
    const nomPara = dtoIn.nom_para.trim();
    const nomParaLower = nomPara.toLowerCase();

    // Intenta actualizar variable de empresa primero (evita SELECT previo usando rowCount)
    const empresaResult = await this.dataSource.pool.query(
      `
        UPDATE sis_parametros
        SET valor_para    = $3,
            usuario_actua = $4,
            hora_actua    = NOW()
        WHERE LOWER(nom_para) = $1
          AND es_empr_para    = true
          AND ide_empr        = $2
      `,
      [nomParaLower, dtoIn.ideEmpr, dtoIn.valor_para, dtoIn.login],
    );

    if ((empresaResult.rowCount ?? 0) > 0) {
      await this.clearEmpresaCacheVariable(nomPara, dtoIn.ideEmpr);
      return {
        message: `Variable de empresa actualizada: ${nomPara}`,
        scope: 'empresa',
        ide_empr: dtoIn.ideEmpr,
      };
    }

    // Si no era de empresa, intenta variable global
    const globalResult = await this.dataSource.pool.query(
      `
        UPDATE sis_parametros
        SET valor_para    = $2,
            usuario_actua = $3,
            hora_actua    = NOW()
        WHERE LOWER(nom_para) = $1
          AND es_empr_para    = false
      `,
      [nomParaLower, dtoIn.valor_para, dtoIn.login],
    );

    if ((globalResult.rowCount ?? 0) > 0) {
      await this.clearCacheVariables([nomPara]);
      return {
        message: `Variable global actualizada: ${nomPara}`,
        scope: 'global',
      };
    }

    throw new BadRequestException(
      `No existe la variable "${nomPara}" para actualizar (global ni en empresa ${dtoIn.ideEmpr}).`,
    );
  }

  // Inserta en la BD las variables que aún no existen; las ya existentes se omiten.
  // Si la variable es de empresa (es_empr_para=true) se crea en TODAS las empresas donde no exista.
  public async updateVariables(dto: HeaderParamsDto) {
    const allLocalVars = this.getAllVariables();
    const totalLocal = allLocalVars.length;

    if (totalLocal === 0) {
      return { message: 'No hay variables definidas en el sistema.' };
    }

    const globalVars = allLocalVars.filter((v) => !v.es_empr_para);
    const empresaVars = allLocalVars.filter((v) => v.es_empr_para);

    this.validateParameters(allLocalVars);

    // 1. Obtener todas las empresas activas
    const empresasResult = await this.dataSource.pool.query(
      `SELECT ide_empr FROM sis_empresa WHERE activo_empr = true`,
    );
    const empresaIds: number[] = empresasResult.rows.map((row) => Number(row.ide_empr));

    // 2. Variables globales que ya existen (ide_empr IS NULL)
    let existingGlobalCount = 0;
    let newGlobalCount = 0;

    if (globalVars.length > 0) {
      const globalVarNamesLower = globalVars.map((variable) => variable.nom_para.toLowerCase());
      const existingGlobalResult = await this.dataSource.pool.query(`
        SELECT LOWER(nom_para) AS nom_para
        FROM sis_parametros
        WHERE es_empr_para = false
          AND LOWER(nom_para) = ANY($1)
      `, [globalVarNamesLower]);
      const existingGlobalRows: { nom_para: string }[] = existingGlobalResult.rows;
      const globalSet = new Set(existingGlobalRows.map((r) => r.nom_para.toLowerCase()));
      existingGlobalCount = existingGlobalRows.length;

      const newGlobalVars = globalVars.filter(
        (v) => !globalSet.has(v.nom_para.toLowerCase()),
      );

      if (newGlobalVars.length > 0) {
        const query = new SelectQuery(`SELECT f_update_variables($1, $2, $3)`);
        query.addParam(1, dto.ideEmpr);
        query.addParam(2, JSON.stringify(newGlobalVars));
        query.addParam(3, dto.login);
        await this.dataSource.createSelectQuery(query);
        newGlobalCount = newGlobalVars.length;
      }
    }

    // 3. Variables de empresa: crear en cada empresa donde no existan
    let empresaInsertedCount = 0;
    let empresaExistingCount = 0;

    if (empresaVars.length > 0 && empresaIds.length > 0) {
      const empresaVarNamesLower = empresaVars.map((variable) => variable.nom_para.toLowerCase());
      const existingEmpResult = await this.dataSource.pool.query(
        `
          SELECT ide_empr, LOWER(nom_para) AS nom_para
          FROM sis_parametros
          WHERE es_empr_para = true
            AND ide_empr = ANY($1)
            AND LOWER(nom_para) = ANY($2)
        `,
        [empresaIds, empresaVarNamesLower],
      );

      const existingByEmpresa = new Map<number, Set<string>>();
      for (const row of existingEmpResult.rows as { ide_empr: number; nom_para: string }[]) {
        const ideEmpr = Number(row.ide_empr);
        if (!existingByEmpresa.has(ideEmpr)) {
          existingByEmpresa.set(ideEmpr, new Set<string>());
        }
        existingByEmpresa.get(ideEmpr)?.add(row.nom_para.toLowerCase());
      }

      empresaExistingCount = existingEmpResult.rows.length;

      const empresaVarsWithLower = empresaVars.map((variable) => ({
        variable,
        nomParaLower: variable.nom_para.toLowerCase(),
      }));

      const insertTasks: Array<() => Promise<number>> = [];

      for (const ideEmpr of empresaIds) {
        const existingSet = existingByEmpresa.get(ideEmpr) ?? new Set<string>();
        const newEmpVars = empresaVarsWithLower
          .filter(({ nomParaLower }) => !existingSet.has(nomParaLower))
          .map(({ variable }) => variable);

        if (newEmpVars.length === 0) {
          continue;
        }

        insertTasks.push(async () => {
          const query = new SelectQuery(`SELECT f_update_variables($1, $2, $3)`);
          query.addParam(1, ideEmpr);
          query.addParam(2, JSON.stringify(newEmpVars));
          query.addParam(3, dto.login);
          await this.dataSource.createSelectQuery(query);
          return newEmpVars.length;
        });
      }

      empresaInsertedCount = await this.runInsertTasksInBatches(insertTasks, 8);
    }

    const totalInserted = newGlobalCount + empresaInsertedCount;
    const totalExisting = existingGlobalCount + empresaExistingCount;

    if (totalInserted === 0) {
      return {
        message: `El sistema ya cuenta con todas las variables registradas. No se realizaron inserciones.`,
      };
    }

    return {
      message: `Se crearon ${totalInserted} variable(s) nueva(s). El sistema ahora cuenta con ${totalExisting + totalInserted} variable(s) registrada(s) de un total de ${totalLocal} definida(s).`,
      inserted: totalInserted,
      total: totalLocal,
      existing: totalExisting,
    };
  }

  private async runInsertTasksInBatches(
    tasks: Array<() => Promise<number>>,
    batchSize: number,
  ): Promise<number> {
    if (tasks.length === 0) {
      return 0;
    }

    let total = 0;

    for (let i = 0; i < tasks.length; i += batchSize) {
      const chunk = tasks.slice(i, i + batchSize);
      const insertedByChunk = await Promise.all(chunk.map((task) => task()));
      total += insertedByChunk.reduce((sum, inserted) => sum + inserted, 0);
    }

    return total;
  }

  // ============ Private Methods ============

  private getCacheKey(name: string): string {
    return `${this.CACHE_PREFIX}${name.toLowerCase()}`;
  }

  private getEmpresaCacheKey(name: string, ideEmpr: number): string {
    return `${this.getCacheKey(name)}_${ideEmpr}`;
  }

  /**
   * Lee una entrada de caché (JSON { valor, descripcion }).
   * Retorna null si no existe o si falla Redis.
   */
  private async readCache(key: string): Promise<{ valor: string; descripcion: string } | null> {
    try {
      const raw = await this.dataSource.redisClient.get(key);
      if (raw === null) return null;
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || typeof parsed.valor !== 'string') {
        // Formato antiguo (string plano) o inválido — invalida la entrada
        await this.dataSource.redisClient.del(key);
        return null;
      }
      return parsed as { valor: string; descripcion: string };
    } catch {
      return null;
    }
  }

  /** Escribe una entrada de caché con fallo silencioso. */
  private async writeCache(key: string, valor: string, descripcion: string): Promise<void> {
    try {
      await this.dataSource.redisClient.set(key, JSON.stringify({ valor, descripcion }));
    } catch (error) {
      this.logger.warn(`Failed to write cache ${key}: ${(error as Error).message}`);
    }
  }

  /**
   * Resuelve una variable con prioridad:
   * 1. Caché empresa específica (si ideEmpr != 0)
   * 2. Caché empresa default (ide_empr=0)
   * 3. Caché global
   * 4. BD — una sola query con ORDER BY prioridad
   */
  private async resolveVariable(
    variableName: string,
    ideEmpr?: number,
  ): Promise<{ valor: string; descripcion: string; scope: string; cache: boolean }> {
    const hasEmpr = ideEmpr !== undefined && ideEmpr !== null;

    // 1. Caché empresa específica
    if (hasEmpr && ideEmpr !== 0) {
      const cached = await this.readCache(this.getEmpresaCacheKey(variableName, ideEmpr));
      if (cached) return { ...cached, scope: 'empresa', cache: true };
    }

    // 2. Caché empresa default (ide_empr=0)
    if (hasEmpr) {
      const cached = await this.readCache(this.getEmpresaCacheKey(variableName, 0));
      if (cached) {
        if (ideEmpr !== 0) {
          await this.writeCache(this.getEmpresaCacheKey(variableName, ideEmpr!), cached.valor, cached.descripcion);
        }
        return { ...cached, scope: ideEmpr === 0 ? 'empresa' : 'empresa_default', cache: true };
      }
    }

    // 3. Caché global
    const globalCached = await this.readCache(this.getCacheKey(variableName));
    if (globalCached) return { ...globalCached, scope: 'global', cache: true };

    // 4. Base de datos
    return this.resolveVariableFromDB(variableName, ideEmpr);
  }

  /**
   * Busca en BD con prioridad: empresa exacta → empresa default (ide_empr=0) → global.
   * Una sola query SQL, sin try/catch anidados.
   */
  private async resolveVariableFromDB(
    variableName: string,
    ideEmpr?: number,
  ): Promise<{ valor: string; descripcion: string; scope: string; cache: boolean }> {
    const ideEmprParam = ideEmpr ?? 0;

    const result = await this.dataSource.pool.query<{
      valor_para: string;
      descripcion_para: string;
      es_empr_para: boolean;
      ide_empr: number;
    }>(
      `SELECT valor_para, COALESCE(descripcion_para, '') AS descripcion_para,
              es_empr_para, ide_empr
       FROM sis_parametros
       WHERE LOWER(nom_para) = LOWER($1)
         AND (
           (es_empr_para = false)
           OR (es_empr_para = true AND ide_empr = $2)
           OR (es_empr_para = true AND ide_empr = 0)
         )
       ORDER BY
         CASE
           WHEN es_empr_para = true AND ide_empr = $2 THEN 1
           WHEN es_empr_para = true AND ide_empr = 0  THEN 2
           ELSE 3
         END
       LIMIT 1`,
      [variableName, ideEmprParam],
    );

    const row = result.rows?.[0];
    if (!row) {
      throw new Error(`El parámetro ${variableName} no se encuentra configurado`);
    }

    const { valor_para: valor, descripcion_para: descripcion, es_empr_para: esEmpr, ide_empr: dbIdeEmpr } = row;

    if (!esEmpr) {
      await this.writeCache(this.getCacheKey(variableName), valor, descripcion);
      return { valor, descripcion, scope: 'global', cache: false };
    }

    // Cachear para el ide_empr encontrado en BD (puede ser 0)
    await this.writeCache(this.getEmpresaCacheKey(variableName, dbIdeEmpr), valor, descripcion);
    // Propagación: cachear también para el ide_empr solicitado
    if (ideEmpr !== undefined && ideEmpr !== dbIdeEmpr) {
      await this.writeCache(this.getEmpresaCacheKey(variableName, ideEmpr), valor, descripcion);
    }

    const scope = dbIdeEmpr === 0 && ideEmprParam !== 0 ? 'empresa_default' : 'empresa';
    return { valor, descripcion, scope, cache: false };
  }

  private async cacheVariable(variableName: string, value: string, descripcion: string): Promise<void> {
    await this.writeCache(this.getCacheKey(variableName), value, descripcion);
  }

  private async cacheVariableEmpresa(variableName: string, ideEmpr: number, value: string, descripcion: string): Promise<void> {
    await this.writeCache(this.getEmpresaCacheKey(variableName, ideEmpr), value, descripcion);
  }

  private async clearEmpresaCacheVariable(variableName: string, ideEmpr: number): Promise<void> {
    try {
      await this.dataSource.redisClient.del(this.getEmpresaCacheKey(variableName, ideEmpr));
    } catch (error) {
      this.logger.warn(`Failed to clear empresa cache variable ${variableName}_${ideEmpr}: ${(error as Error).message}`);
    }
  }

  private async checkCacheForVariables(variables: string[], resultMap: Map<string, string>): Promise<string[]> {
    const variablesToFetch: string[] = [];

    await Promise.all(
      variables.map(async (variable) => {
        const cached = await this.readCache(this.getCacheKey(variable));
        if (cached !== null) {
          resultMap.set(variable, cached.valor);
        } else {
          variablesToFetch.push(variable);
        }
      }),
    );

    return variablesToFetch;
  }

  private async fetchAndCacheVariablesFromDB(variables: string[], resultMap: Map<string, string>): Promise<void> {
    const query = new SelectQuery(`
            SELECT nom_para, valor_para, COALESCE(descripcion_para, '') AS descripcion_para
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
          await this.cacheVariable(varName, varValue, row.descripcion_para ?? '');
        }),
      );

      // Check for missing variables
      const missingVars = variables.filter((v) => !resultMap.has(v));
      if (missingVars.length > 0) {
        this.logger.warn(`Missing variables in DB: ${missingVars.join(', ')}`);
      }
    } catch (error) {
      this.logger.error(`DB fetch failed: ${(error as Error).message}`);
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
      ...CUENTAS_POR_COBRAR_VARS,
      ...CUENTAS_POR_PAGAR_VARS,
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
