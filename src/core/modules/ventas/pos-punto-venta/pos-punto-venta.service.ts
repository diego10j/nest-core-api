import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { ResultQuery } from 'src/core/connection/interfaces/resultQuery';
import { CoreService } from 'src/core/core.service';

const CACHE_KEY_PREFIX = 'pos_config:usuario';

@Injectable()
export class PosPuntoVentaService extends BaseService {
    private readonly logger = new Logger(PosPuntoVentaService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        @Inject('REDIS_CLIENT') private readonly redis: Redis,
    ) {
        super();
    }

    async getTableQueryPosPuntoVenta(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                p.ide_vgpos,
                p.nombre_vgpos,
                p.printer_url_vgpos,
                p.printer_token_vgpos,
                p.ide_ccdaf,
                df.serie_ccdaf,
                p.activo_vgpos,
                p.ide_empr,
                p.ide_sucu,
                (SELECT COUNT(*) FROM ven_usuario_punto_venta u
                 WHERE u.ide_vgpos = p.ide_vgpos) AS total_usuarios
            FROM ven_pos_punto_venta p
            LEFT JOIN cxc_datos_fac df ON df.ide_ccdaf = p.ide_ccdaf
            WHERE p.ide_empr = $1
            ORDER BY p.nombre_vgpos
        `, dtoIn);
        query.addIntParam(1, dtoIn.ideEmpr);
        return this.dataSource.createQuery(query, 'ven_pos_punto_venta');
    }

    async getListDataPosPuntoVenta(dtoIn: HeaderParamsDto) {
        return this.core.getListDataValues({
            ...dtoIn,
            module: 'ven',
            tableName: 'pos_punto_venta',
            primaryKey: 'ide_vgpos',
            columnLabel: 'nombre_vgpos',
            condition: `activo_vgpos = true AND ide_empr = ${dtoIn.ideEmpr}`,
            columnOrder: 'nombre_vgpos',
        });
    }

    async getTableQueryUsuarioPuntoVenta(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                u.ide_vgupvt,
                u.ide_vgpos,
                u.ide_usua,
                u.activo_vgupvt,
                u.ide_empr,
                u.ide_sucu,
                p.nombre_vgpos,
                s.nom_usua
            FROM ven_usuario_punto_venta u
            INNER JOIN ven_pos_punto_venta p ON p.ide_vgpos = u.ide_vgpos
            LEFT JOIN sis_usuario s ON s.ide_usua = u.ide_usua
            WHERE u.ide_empr = $1
            ORDER BY p.nombre_vgpos, s.nom_usua
        `, dtoIn);
        query.addIntParam(1, dtoIn.ideEmpr);
        return this.dataSource.createQuery(query, 'ven_usuario_punto_venta');
    }

    async getListDataUsuarioPuntoVenta(dtoIn: HeaderParamsDto) {
        return this.core.getListDataValues({
            ...dtoIn,
            module: 'ven',
            tableName: 'usuario_punto_venta',
            primaryKey: 'ide_vgupvt',
            columnLabel: 'ide_vgupvt',
            condition: `activo_vgupvt = true AND ide_empr = ${dtoIn.ideEmpr}`,
            columnOrder: 'ide_vgupvt',
        });
    }

    async getConfigPOS(ideUsua: number): Promise<ResultQuery> {
        const cacheKey = `${CACHE_KEY_PREFIX}:${ideUsua}`;

        try {
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                const data = JSON.parse(cached);
                return { row: data, error: false, message: 'ok' };
            }
        } catch {
            this.logger.warn(`Error reading Redis cache key: ${cacheKey}`);
        }

        const query = new SelectQuery(`
            SELECT
                p.printer_url_vgpos,
                p.printer_token_vgpos
            FROM ven_pos_punto_venta p
            INNER JOIN ven_usuario_punto_venta u ON u.ide_vgpos = p.ide_vgpos
            WHERE u.ide_usua = $1
              AND p.activo_vgpos = true
              AND u.activo_vgupvt = true
            LIMIT 1
        `);
        query.addIntParam(1, ideUsua);
        const result = await this.dataSource.createSingleQuery(query);

        if (result) {
            const data = {
                printer_url_vgpos: result.printer_url_vgpos ?? null,
                printer_token_vgpos: result.printer_token_vgpos ?? null,
            };
            try {
                await this.redis.set(cacheKey, JSON.stringify(data));
            } catch {
                this.logger.warn(`Error writing Redis cache key: ${cacheKey}`);
            }
            return { row: data, error: false, message: 'ok' };
        }

        return { row: null, error: false, message: 'no existe configuracion' };
    }
}
