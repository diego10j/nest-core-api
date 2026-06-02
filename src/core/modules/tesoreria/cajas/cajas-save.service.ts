import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { CoreService } from 'src/core/core.service';

import { SaveCajaDto } from './dto/save-caja.dto';

@Injectable()
export class CajasSaveService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
    }

    async saveCaja(dtoIn: SaveCajaDto & HeaderParamsDto) {
        const isUpdate = dtoIn.ideTeban != null;
        const listQuery: ObjectQueryDto[] = [];
        let ideTeban: number;

        const object: Record<string, unknown> = {
            ide_empr: dtoIn.ideEmpr,
            ide_sucu: dtoIn.ideSucu,
            nombre_teban: dtoIn.nombreTeban,
            contacto_teban: dtoIn.contactoTeban ?? null,
            telefono_teban: dtoIn.telefonoTeban ?? null,
            es_caja_teban: true,
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

    async updateFotoCaja(ideTeban: number, fileName: string, dtoIn: HeaderParamsDto) {
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
}
