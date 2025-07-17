import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DataSourceService } from '../../../connection/datasource.service';

import { BaseService } from '../../../../common/base-service';

import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { Redis } from 'ioredis';
import { SelectQuery } from 'src/core/connection/helpers';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';


@Injectable()
export class EmisorService extends BaseService {


    constructor(private readonly dataSource: DataSourceService,
        @Inject('REDIS_CLIENT') private readonly redisClient: Redis
    ) {
        super();
    }


    async getEmisor(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        const cacheKey = `emisor_${dtoIn.ideEmpr}`;
        // Check cache
        const cachedEmisor = await this.redisClient.get(cacheKey);
        if (cachedEmisor) {
            return JSON.parse(cachedEmisor);
        }
        const query = new SelectQuery(`
        SELECT
            *
        FROM
            sri_emisor
        WHERE
            ide_empr = ${dtoIn.ideEmpr}
            `, dtoIn);

        const res = await this.dataSource.createSingleQuery(query);
        if (res) {
            // Save cache
            await this.redisClient.set(cacheKey, JSON.stringify(res));
            return res;
        }
        else {
            throw new BadRequestException(`No existe Emisor: ${dtoIn.ideEmpr}`);
        }
    }


    async clearCacheEmisor(_dtoIn: QueryOptionsDto  & HeaderParamsDto) {
        // Obtener todas las claves que coinciden con el patrón 'schema:*'
        const keys = await this.redisClient.keys('emisor_:*');

        // Si se encuentran claves, eliminarlas
        if (keys.length > 0) {
            await this.redisClient.del(...keys);
        }
        return {
            message: 'ok'
        }
    }

}