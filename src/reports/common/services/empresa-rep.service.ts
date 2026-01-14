import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { Empresa } from 'src/core/modules/sistema/admin/interfaces/empresa';

@Injectable()
export class EmpresaRepService {
  constructor(private readonly dataSource: DataSourceService) {}

  private async fetchAndCacheEmpresa(ideEmpr: number): Promise<Empresa> {
    const query = new SelectQuery(`
          select
              ide_empr,
              nom_empr,
              identificacion_empr,
              nom_corto_empr,
              mail_empr,
              logotipo_empr,
              direccion_empr,
              pagina_empr,
              telefono_empr
          from
              sis_empresa
          where
              ide_empr = $1
              `);
    query.addParam(1, ideEmpr);
    const res = await this.dataSource.createSingleQuery(query);
    if (res === null) {
      throw new BadRequestException(`La empresa no existe`);
    }
    // Cache the result
    const cacheKey = this.getCacheKeyEmpresa(ideEmpr);
    await this.dataSource.redisClient.set(cacheKey, JSON.stringify(res));
    return res;
  }

  /**
   * Crea un key de cahce para las empresas
   * @param ideEmpr
   * @returns
   */
  private getCacheKeyEmpresa(ideEmpr: number): string {
    return `empresa:${ideEmpr}`;
  }

  async getEmpresaById(ideEmpr: number): Promise<Empresa> {
    const cacheKey = this.getCacheKeyEmpresa(ideEmpr);

    // Check cache
    const empresaData = await this.dataSource.redisClient.get(cacheKey);
    if (empresaData) {
      return JSON.parse(empresaData);
    }
    // Fetch from database if not cached
    return this.fetchAndCacheEmpresa(ideEmpr);
  }
}
