import { Injectable, Logger } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { CoreService } from 'src/core/core.service';

import { SavePosPuntoVentaDto } from './dto/save-pos-punto-venta.dto';
import { SaveUsuarioPuntoVentaDto } from './dto/save-usuario-punto-venta.dto';
import { IdPosPuntoVentaDto, IdUsuarioPuntoVentaDto, SetActivoPosPuntoVentaDto } from './dto/set-activo-pos-punto-venta.dto';

const MODULE = 'ven';
const TABLE_POS = 'pos_punto_venta';
const TABLE_USUARIO = 'usuario_punto_venta';
const PK_POS = 'ide_vgpos';
const PK_USUARIO = 'ide_vgupvt';

@Injectable()
export class PosPuntoVentaSaveService extends BaseService {
    private readonly logger = new Logger(PosPuntoVentaSaveService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
    }

    async savePosPuntoVenta(dtoIn: SavePosPuntoVentaDto & HeaderParamsDto) {
        const isUpdate = dtoIn.ide_vgpos != null;
        const listQuery: ObjectQueryDto[] = [];
        let ideVgpos: number;

        const object: Record<string, unknown> = {
            nombre_vgpos: dtoIn.nombre_vgpos,
            printer_url_vgpos: dtoIn.printer_url_vgpos ?? null,
            printer_token_vgpos: dtoIn.printer_token_vgpos ?? null,
            ide_ccdaf: dtoIn.ide_ccdaf ?? null,
            activo_vgpos: true,
        };

        if (isUpdate) {
            ideVgpos = dtoIn.ide_vgpos!;
            object.ide_vgpos = ideVgpos;
            listQuery.push({
                operation: 'update',
                module: MODULE,
                tableName: TABLE_POS,
                primaryKey: PK_POS,
                object,
                condition: `${PK_POS} = ${ideVgpos}`,
            });
        } else {
            ideVgpos = await this.dataSource.getSeqTable(
                `${MODULE}_${TABLE_POS}`,
                PK_POS,
                1,
                dtoIn.login,
            );
            object.ide_vgpos = ideVgpos;
            listQuery.push({
                operation: 'insert',
                module: MODULE,
                tableName: TABLE_POS,
                primaryKey: PK_POS,
                object,
            });
        }

        await this.core.save({ ...dtoIn, listQuery, audit: false });
        return { message: 'ok', ide_vgpos: ideVgpos };
    }

    async saveUsuarioPuntoVenta(dtoIn: SaveUsuarioPuntoVentaDto & HeaderParamsDto) {
        const isUpdate = dtoIn.ide_vgupvt != null;
        const listQuery: ObjectQueryDto[] = [];
        let ideVgupvt: number;

        const object: Record<string, unknown> = {
            ide_vgpos: dtoIn.ide_vgpos,
            ide_usua: dtoIn.ide_usua,
            activo_vgupvt: true,
        };

        if (isUpdate) {
            ideVgupvt = dtoIn.ide_vgupvt!;
            object.ide_vgupvt = ideVgupvt;
            listQuery.push({
                operation: 'update',
                module: MODULE,
                tableName: TABLE_USUARIO,
                primaryKey: PK_USUARIO,
                object,
                condition: `${PK_USUARIO} = ${ideVgupvt}`,
            });
        } else {
            ideVgupvt = await this.dataSource.getSeqTable(
                `${MODULE}_${TABLE_USUARIO}`,
                PK_USUARIO,
                1,
                dtoIn.login,
            );
            object.ide_vgupvt = ideVgupvt;
            listQuery.push({
                operation: 'insert',
                module: MODULE,
                tableName: TABLE_USUARIO,
                primaryKey: PK_USUARIO,
                object,
            });
        }

        await this.core.save({ ...dtoIn, listQuery, audit: false });

        await this._invalidateCache(dtoIn.ide_usua);

        return { message: 'ok', ide_vgupvt: ideVgupvt };
    }

    async setActivoPosPuntoVenta(dtoIn: SetActivoPosPuntoVentaDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE ${MODULE}_${TABLE_POS}
             SET activo_vgpos = $1,
                 usuario_actua = $3,
                 hora_actua = NOW()
             WHERE ${PK_POS} = $2`,
            [dtoIn.activo, dtoIn.ide, dtoIn.login],
        );
        return { message: 'ok' };
    }

    async setActivoUsuarioPuntoVenta(dtoIn: SetActivoPosPuntoVentaDto & HeaderParamsDto) {
        const result = await this.dataSource.pool.query(
            `SELECT ide_usua FROM ${MODULE}_${TABLE_USUARIO} WHERE ${PK_USUARIO} = $1`,
            [dtoIn.ide],
        );

        await this.dataSource.pool.query(
            `UPDATE ${MODULE}_${TABLE_USUARIO}
             SET activo_vgupvt = $1,
                 usuario_actua = $3,
                 hora_actua = NOW()
             WHERE ${PK_USUARIO} = $2`,
            [dtoIn.activo, dtoIn.ide, dtoIn.login],
        );

        if (result.rows.length > 0 && result.rows[0].ide_usua) {
            await this._invalidateCache(result.rows[0].ide_usua);
        }

        return { message: 'ok' };
    }

    async deletePosPuntoVenta(dtoIn: IdPosPuntoVentaDto & HeaderParamsDto) {
        const usuarios = await this.dataSource.pool.query(
            `SELECT ide_usua FROM ${MODULE}_${TABLE_USUARIO} WHERE ${PK_POS} = $1`,
            [dtoIn.ide_vgpos],
        );

        await this.dataSource.pool.query(
            `DELETE FROM ${MODULE}_${TABLE_USUARIO} WHERE ${PK_POS} = $1`,
            [dtoIn.ide_vgpos],
        );
        await this.dataSource.pool.query(
            `DELETE FROM ${MODULE}_${TABLE_POS} WHERE ${PK_POS} = $1`,
            [dtoIn.ide_vgpos],
        );

        for (const row of usuarios.rows) {
            if (row.ide_usua) await this._invalidateCache(row.ide_usua);
        }

        return { message: 'ok', rowCount: 1 };
    }

    async deleteUsuarioPuntoVenta(dtoIn: IdUsuarioPuntoVentaDto & HeaderParamsDto) {
        const result = await this.dataSource.pool.query(
            `SELECT ide_usua FROM ${MODULE}_${TABLE_USUARIO} WHERE ${PK_USUARIO} = $1`,
            [dtoIn.ide_vgupvt],
        );

        await this.dataSource.pool.query(
            `DELETE FROM ${MODULE}_${TABLE_USUARIO} WHERE ${PK_USUARIO} = $1`,
            [dtoIn.ide_vgupvt],
        );

        if (result.rows.length > 0 && result.rows[0].ide_usua) {
            await this._invalidateCache(result.rows[0].ide_usua);
        }

        return { message: 'ok', rowCount: 1 };
    }

    private async _invalidateCache(ideUsua: number): Promise<void> {
        try {
            await this.dataSource.redisClient.del(`pos_config:usuario:${ideUsua}`);
        } catch {
            this.logger.warn(`Error invalidating Redis cache for ide_usua=${ideUsua}`);
        }
    }
}
