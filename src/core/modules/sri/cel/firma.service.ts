import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { SelectQuery } from 'src/core/connection/helpers';

import { BaseService } from '../../../../common/base-service';
import { DataSourceService } from '../../../connection/datasource.service';

@Injectable()
export class FirmaService extends BaseService {
  constructor(
    private readonly dataSource: DataSourceService,
    @Inject('REDIS_CLIENT') private readonly redisClient: Redis,
  ) {
    super();
  }

  private static readonly FIRMA_COLUMNS = `
            ide_srfid AS "codigoFirma",
            ruta_srfid AS "rutaFirma",
            password_srfid AS "claveFirma",
            fecha_ingreso_srfid AS "fechaIngreso",
            fecha_caduca_srfid AS "fechaCaducidad",
            nombre_representante_srfid AS "nombreRepresentante",
            correo_representante_srfid AS "correoRepresentante",
            disponible_srfid AS "disponibleFirma",
            ide_sucu AS "ideSucu"`;

  /** La firma digital se configura por sucursal, igual que el emisor. */
  async getFirma(dtoIn: QueryOptionsDto & HeaderParamsDto) {
    const cacheKey = `firma_${dtoIn.ideSucu}`;
    // Check cache
    const cachedFirma = await this.redisClient.get(cacheKey);
    if (cachedFirma) {
      return JSON.parse(cachedFirma);
    }
    const query = new SelectQuery(
      `
        SELECT
            ${FirmaService.FIRMA_COLUMNS}
        FROM
            sri_firma_digital
        WHERE
            disponible_srfid = true
            and CURRENT_DATE  <= fecha_caduca_srfid
            and ide_sucu = ${dtoIn.ideSucu}
        ORDER BY
            fecha_ingreso_srfid desc
            `,
      dtoIn,
    );

    const res = await this.dataSource.createSingleQuery(query);
    if (res) {
      // Save cache
      await this.redisClient.set(cacheKey, JSON.stringify(res));
      return res;
    } else {
      throw new BadRequestException(`No existe firma electrónica disponible para la sucursal: ${dtoIn.ideSucu}`);
    }
  }

  async getFirmas(dtoIn: QueryOptionsDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
        SELECT
            ${FirmaService.FIRMA_COLUMNS}
        FROM
            sri_firma_digital
        WHERE
            ide_sucu = ${dtoIn.ideSucu}
        ORDER BY
            fecha_ingreso_srfid desc
        `,
      dtoIn,
    );

    return this.dataSource.createQuery(query);
  }

  async clearCacheFirma(_dtoIn: QueryOptionsDto & HeaderParamsDto) {
    // Obtener todas las claves que coinciden con el patrón 'firma_*'
    const keys = await this.redisClient.keys('firma_*');

    // Si se encuentran claves, eliminarlas
    if (keys.length > 0) {
      await this.redisClient.del(...keys);
    }
    return {
      message: 'ok',
    };
  }
}
