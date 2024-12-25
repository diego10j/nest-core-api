import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DataSourceService } from '../../connection/datasource.service';

import { BaseService } from '../../../common/base-service';

import { ServiceDto } from 'src/common/dto/service.dto';
import { SelectQuery } from 'src/core/connection/helpers';
import { Redis } from 'ioredis';


@Injectable()
export class FirmaService extends BaseService {


    constructor(private readonly dataSource: DataSourceService,
        @Inject('REDIS_CLIENT') private readonly redisClient: Redis
    ) {
        super();
    }


    async getFirma(dtoIn: ServiceDto) {
        const cacheKey = `firma_${dtoIn.ideEmpr}`;
        // Check cache
        const cachedFirma = await this.redisClient.get(cacheKey);
        if (cachedFirma) {
            return JSON.parse(cachedFirma);
        }
        const query = new SelectQuery(`
        SELECT
            *
        FROM
            sri_firma_digital
        WHERE
            disponible_srfid = true
            and CURRENT_DATE  <= fecha_caduca_srfid
            and ide_empr = ${dtoIn.ideEmpr}
        ORDER BY
            fecha_ingreso_srfid desc
            `, dtoIn);

        const res = await this.dataSource.createSingleQuery(query);
        if (res) {
            // Save cache
            await this.redisClient.set(cacheKey, JSON.stringify(res));
            return res;
        }
        else {
            throw new BadRequestException(`No existe firma electrónica: ${dtoIn.ideEmpr}`);
        }
    }

    async getFirmas(dtoIn: ServiceDto) {
        const query = new SelectQuery(`
        SELECT
            *
        FROM
            sri_firma_digital
        WHERE      
            ide_empr = ${dtoIn.ideEmpr}
        ORDER BY
            fecha_ingreso_srfid desc
        `, dtoIn);

        return await this.dataSource.createQuery(query);
    }

    async clearCacheFirma(_dtoIn: ServiceDto) {
        // Obtener todas las claves que coinciden con el patrón 'schema:*'
        const keys = await this.redisClient.keys('firma_:*');

        // Si se encuentran claves, eliminarlas
        if (keys.length > 0) {
            await this.redisClient.del(...keys);
        }
        return {
            message: 'ok'
        }
    }

}