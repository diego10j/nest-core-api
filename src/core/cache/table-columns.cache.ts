import { Injectable } from '@nestjs/common';
import { ICacheProvider } from './cache.interface';

/**
 * Servicio para gestionar caché de columnas de tabla
 * Proporciona métodos específicos de dominio para tabla columnas
 */
@Injectable()
export class TableColumnsCacheService {
  private readonly CACHE_KEY_PREFIX = 'table_columns';
  private readonly CACHE_TTL = 3600; // 1 hora

  constructor(private readonly cacheProvider: ICacheProvider) {}

  /**
   * Obtiene las columnas en caché de una tabla
   */
  async getTableColumns(tableName: string): Promise<string[] | null> {
    const cacheKey = this.getCacheKey(tableName);
    return this.cacheProvider.get<string[]>(cacheKey);
  }

  /**
   * Almacena las columnas de una tabla en caché
   */
  async setTableColumns(tableName: string, columns: string[]): Promise<void> {
    const cacheKey = this.getCacheKey(tableName);
    await this.cacheProvider.set(cacheKey, columns, this.CACHE_TTL);
  }

  /**
   * Invalida el caché de una tabla
   */
  async invalidateTableColumns(tableName: string): Promise<void> {
    const cacheKey = this.getCacheKey(tableName);
    await this.cacheProvider.del(cacheKey);
  }

  /**
   * Invalida todas las columnas cacheadas
   */
  async invalidateAllTableColumns(): Promise<void> {
    await this.cacheProvider.delPattern(`${this.CACHE_KEY_PREFIX}:*`);
  }

  /**
   * Genera la clave de caché para una tabla
   */
  private getCacheKey(tableName: string): string {
    return `${this.CACHE_KEY_PREFIX}:${tableName}`;
  }
}
