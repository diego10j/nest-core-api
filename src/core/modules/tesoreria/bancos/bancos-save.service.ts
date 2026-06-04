import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { CoreService } from 'src/core/core.service';

import { SaveBancoDto } from './dto/save-banco.dto';
import { SaveCuentaBancoDto } from './dto/save-cuenta-banco.dto';
import { SetActivoDto } from './dto/set-activo.dto';

@Injectable()
export class BancosSaveService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
    }

    // ─── BANCO (tes_banco) ───────────────────────────────────────────────────

    async saveBanco(dtoIn: SaveBancoDto & HeaderParamsDto) {
        const isUpdate = dtoIn.ideTeban != null;
        const listQuery: ObjectQueryDto[] = [];
        let ideTeban: number;

        const object: Record<string, unknown> = {
            ide_empr: dtoIn.ideEmpr,
            ide_sucu: dtoIn.ideSucu,
            nombre_teban: dtoIn.nombreTeban,
            contacto_teban: dtoIn.contactoTeban ?? null,
            telefono_teban: dtoIn.telefonoTeban ?? null,
            es_caja_teban: false,
            foto_teban: dtoIn.fotoTeban ?? null,
            color_teban: dtoIn.colorTeban ?? null,
        };

        if (isUpdate) {
            ideTeban = dtoIn.ideTeban!;
            object.ide_teban = ideTeban;
            listQuery.push({
                operation: 'update',
                module: 'tes',
                tableName: 'banco',
                primaryKey: 'ide_teban',
                object,
            });
        } else {
            ideTeban = await this.dataSource.getSeqTable('tes_banco', 'ide_teban', 1, dtoIn.login);
            object.ide_teban = ideTeban;
            listQuery.push({
                operation: 'insert',
                module: 'tes',
                tableName: 'banco',
                primaryKey: 'ide_teban',
                object,
            });
        }

        await this.core.save({ ...dtoIn, listQuery, audit: false });
        return { message: 'ok', ideTeban };
    }

    async updateFotoBanco(ideTeban: number, fileName: string, dtoIn: HeaderParamsDto) {
        const listQuery: ObjectQueryDto[] = [{
            operation: 'update',
            module: 'tes',
            tableName: 'banco',
            primaryKey: 'ide_teban',
            object: { ide_teban: ideTeban, foto_teban: fileName },
        }];
        await this.core.save({ ...dtoIn, listQuery, audit: false });
        return { message: 'ok', ideTeban, fotoTeban: fileName };
    }

    // ─── CUENTA BANCARIA (tes_cuenta_banco) ──────────────────────────────────

    async saveCuentaBanco(dtoIn: SaveCuentaBancoDto & HeaderParamsDto) {
        const isUpdate = dtoIn.ideTecba != null;
        const listQuery: ObjectQueryDto[] = [];
        let ideTecba: number;

        const object: Record<string, unknown> = {
            ide_empr: dtoIn.ideEmpr,
            ide_sucu: dtoIn.ideSucu,
            ide_tetcb: dtoIn.ideTetcb ?? null,
            ide_teban: dtoIn.ideTeban,
            ide_cndpc: dtoIn.ideCndpc ?? null,
            nombre_tecba: dtoIn.nombreTecba,
            observacion_tecba: dtoIn.observacionTecba ?? null,
            hace_pagos_tecba: dtoIn.hacePagosTecba ?? false,
            hace_cheque_tecba: dtoIn.haceChequeTecba ?? false,
            activo_tecba: dtoIn.activoTecba ?? true,
        };

        if (isUpdate) {
            ideTecba = dtoIn.ideTecba!;
            object.ide_tecba = ideTecba;
            listQuery.push({
                operation: 'update',
                module: 'tes',
                tableName: 'cuenta_banco',
                primaryKey: 'ide_tecba',
                object,
            });
        } else {
            ideTecba = await this.dataSource.getSeqTable('tes_cuenta_banco', 'ide_tecba', 1, dtoIn.login);
            object.ide_tecba = ideTecba;
            listQuery.push({
                operation: 'insert',
                module: 'tes',
                tableName: 'cuenta_banco',
                primaryKey: 'ide_tecba',
                object,
            });
        }

        await this.core.save({ ...dtoIn, listQuery, audit: false });
        return { message: 'ok', ideTecba };
    }

    async setActivoCuentaBanco(dtoIn: SetActivoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE tes_cuenta_banco SET activo_tecba = $1 WHERE ide_tecba = $2`,
            [dtoIn.activo, dtoIn.ide],
        );
        return { message: 'ok' };
    }
}
