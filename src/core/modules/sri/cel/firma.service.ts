import { BadRequestException, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { SelectQuery } from 'src/core/connection/helpers';

import { BaseService } from '../../../../common/base-service';
import { DataSourceService } from '../../../connection/datasource.service';
import { decrypt } from '../configuracion/crypto.util';

import { FirmaDto } from './dto/firma.dto';

@Injectable()
export class FirmaService extends BaseService implements OnModuleInit {
  private readonly logger = new Logger(FirmaService.name);

  constructor(
    private readonly dataSource: DataSourceService,
    @Inject('REDIS_CLIENT') private readonly redisClient: Redis,
  ) {
    super();
  }

  /**
   * Columnas que se pueden devolver por la API: NUNCA incluyen la clave de la firma
   * (password_srfid), ni cifrada ni descifrada.
   */
  private static readonly FIRMA_COLUMNS = `
            ide_srfid AS "codigoFirma",
            ruta_srfid AS "rutaFirma",
            fecha_ingreso_srfid AS "fechaIngreso",
            fecha_caduca_srfid AS "fechaCaducidad",
            nombre_representante_srfid AS "nombreRepresentante",
            correo_representante_srfid AS "correoRepresentante",
            disponible_srfid AS "disponibleFirma",
            ide_sucu AS "ideSucu"`;

  /** Solo para uso interno (firmar): incluye la clave tal como está guardada (cifrada). */
  private static readonly FIRMA_COLUMNS_CON_CLAVE = `${FirmaService.FIRMA_COLUMNS},
            password_srfid AS "claveFirma"`;

  /**
   * Prefijo de la caché. Las claves anteriores (`firma_<sucursal>`) guardaban la clave de la
   * firma DESCIFRADA y sin caducidad: no se leen más y se borran al iniciar.
   */
  private static readonly CACHE_PREFIX = 'firma_v2_';

  async onModuleInit(): Promise<void> {
    try {
      const legacy = (await this.redisClient.keys('firma_*')).filter(
        (key) => !key.startsWith(FirmaService.CACHE_PREFIX),
      );
      if (legacy.length > 0) {
        await this.redisClient.del(...legacy);
        this.logger.warn(`Se eliminaron ${legacy.length} entradas antiguas de caché de la firma (guardaban la clave en claro).`);
      }
    } catch (error) {
      this.logger.error(`No se pudo limpiar la caché antigua de la firma: ${(error as Error).message}`);
    }
  }

  /**
   * Fila de la firma vigente de la sucursal. La caché guarda la clave CIFRADA, igual que la BD:
   * descifrarla es responsabilidad de quien firma (getFirmaParaFirmar).
   */
  private async cargarFirma(dtoIn: QueryOptionsDto & HeaderParamsDto): Promise<FirmaDto> {
    const cacheKey = `${FirmaService.CACHE_PREFIX}${dtoIn.ideSucu}`;
    const cachedFirma = await this.redisClient.get(cacheKey);
    if (cachedFirma) {
      return JSON.parse(cachedFirma);
    }
    const query = new SelectQuery(
      `
        SELECT
            ${FirmaService.FIRMA_COLUMNS_CON_CLAVE}
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
    if (!res) {
      throw new BadRequestException(`No existe firma electrónica disponible para la sucursal: ${dtoIn.ideSucu}`);
    }
    await this.redisClient.set(cacheKey, JSON.stringify(res));
    return res;
  }

  /**
   * Firma vigente CON la clave descifrada. Solo para firmar comprobantes (FirmaXmlService).
   * No debe devolverse nunca por HTTP ni guardarse en caché.
   */
  async getFirmaParaFirmar(dtoIn: QueryOptionsDto & HeaderParamsDto): Promise<FirmaDto> {
    const firma = await this.cargarFirma(dtoIn);
    return { ...firma, claveFirma: decrypt(firma.claveFirma ?? '') };
  }

  /** Firma vigente de la sucursal para la API: sin la clave. */
  async getFirma(dtoIn: QueryOptionsDto & HeaderParamsDto): Promise<Omit<FirmaDto, 'claveFirma'>> {
    const { claveFirma: _omitida, ...firma } = await this.cargarFirma(dtoIn);
    return firma;
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
