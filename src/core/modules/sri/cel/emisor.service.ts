import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { SelectQuery } from 'src/core/connection/helpers';

import { BaseService } from '../../../../common/base-service';
import { DataSourceService } from '../../../connection/datasource.service';

import { EmisorDto } from './dto/emisor.dto';

@Injectable()
export class EmisorService extends BaseService {
  constructor(
    private readonly dataSource: DataSourceService,
    @Inject('REDIS_CLIENT') private readonly redisClient: Redis,
  ) {
    super();
  }

  /**
   * El emisor SRI se configura por sucursal (un RUC/ambiente por sucursal), no por empresa:
   * sri_emisor no tiene columnas propias de RUC/razón social, se obtienen de sis_sucursal.
   */
  async getEmisor(dtoIn: QueryOptionsDto & HeaderParamsDto): Promise<EmisorDto> {
    const cacheKey = `emisor_${dtoIn.ideSucu}`;
    // Check cache
    const cachedEmisor = await this.redisClient.get(cacheKey);
    if (cachedEmisor) {
      return JSON.parse(cachedEmisor);
    }
    const query = new SelectQuery(
      `
        SELECT
            se.ide_sremi AS "codigoEmisor",
            su.identicicacion_sucu AS ruc,
            su.nom_sucu AS "razonSocial",
            su.nombre_comercial_sucu AS "nombreComercial",
            su.direccion_sucu AS "dirMatriz",
            su.contribuyenteespecial_sucu AS "contribuyenteEspecial",
            su.obligadocontabilidad_sucu AS "obligadoContabilidad",
            se.tiempo_espera_sremi AS "tiempoMaxEspera",
            se.ambiente_sremi AS ambiente,
            se.wsdl_recep_offline_sremi AS "wsdlRecepcion",
            se.wsdl_autori_offline_sremi AS "wsdlAutorizacion"
        FROM
            sri_emisor se
        INNER JOIN
            sis_sucursal su ON se.ide_sucu = su.ide_sucu
        WHERE
            se.ide_sucu = ${dtoIn.ideSucu}
            `,
      dtoIn,
    );

    const res = await this.dataSource.createSingleQuery(query);
    if (res) {
      // Save cache
      await this.redisClient.set(cacheKey, JSON.stringify(res));
      return res;
    } else {
      throw new BadRequestException(`No existe Emisor SRI para la sucursal: ${dtoIn.ideSucu}`);
    }
  }

  async clearCacheEmisor(_dtoIn: QueryOptionsDto & HeaderParamsDto) {
    // Obtener todas las claves que coinciden con el patrón 'emisor_*'
    const keys = await this.redisClient.keys('emisor_*');

    // Si se encuentran claves, eliminarlas
    if (keys.length > 0) {
      await this.redisClient.del(...keys);
    }
    return {
      message: 'ok',
    };
  }
}
