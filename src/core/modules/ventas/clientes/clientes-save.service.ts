import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { CoreService } from 'src/core/core.service';

import { SaveDireccionPersonaDto } from './dto/save-direccion-persona.dto';
import { SetActivoDireccionDto } from './dto/set-activo-direccion.dto';

const TABLE_NAME = 'direccion_persona';
const FULL_TABLE_NAME = 'gen_direccion_persona';
const PRIMARY_KEY = 'ide_gedirp';

@Injectable()
export class ClientesSaveService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
    }

    async saveDireccionPersona(dtoIn: SaveDireccionPersonaDto & HeaderParamsDto) {
        const isUpdate = dtoIn.ide_gedirp != null;
        const listQuery: ObjectQueryDto[] = [];
        let ide_gedirp: number;

        const object: Record<string, unknown> = {
            ide_geper: dtoIn.ide_geper,
            ide_getidi: dtoIn.ide_getidi ?? null,
            ide_gepais: dtoIn.ide_gepais ?? null,
            ide_geprov: dtoIn.ide_geprov ?? null,
            ide_gecant: dtoIn.ide_gecant ?? null,
            nombre_dir_gedirp: dtoIn.nombre_dir_gedirp ?? null,
            correo_gedirp: dtoIn.correo_gedirp ?? null,
            direccion_gedirp: dtoIn.direccion_gedirp ?? null,
            referencia_gedirp: dtoIn.referencia_gedirp ?? null,
            longitud_gedirp: dtoIn.longitud_gedirp ?? null,
            latitud_gedirp: dtoIn.latitud_gedirp ?? null,
            telefono_gedirp: dtoIn.telefono_gedirp ?? null,
            movil_gedirp: dtoIn.movil_gedirp ?? null,
            defecto_gedirp: dtoIn.defecto_gedirp ?? false,
            ide_gegen: dtoIn.ide_gegen ?? null,
        };

        if (isUpdate) {
            ide_gedirp = dtoIn.ide_gedirp!;
            object.ide_gedirp = ide_gedirp;
            listQuery.push({
                operation: 'update',
                module: 'gen',
                tableName: TABLE_NAME,
                primaryKey: PRIMARY_KEY,
                object,
            });
        } else {
            ide_gedirp = await this.dataSource.getSeqTable(TABLE_NAME, PRIMARY_KEY, 1, dtoIn.login);
            object.ide_gedirp = ide_gedirp;
            listQuery.push({
                operation: 'insert',
                module: 'gen',
                tableName: TABLE_NAME,
                primaryKey: PRIMARY_KEY,
                object,
            });
        }

        await this.core.save({ ...dtoIn, listQuery, audit: false });
        return { message: 'ok', ide_gedirp };
    }

    async setActivoDireccionPersona(dtoIn: SetActivoDireccionDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE ${FULL_TABLE_NAME} SET activo_gedirp = $1 WHERE ${PRIMARY_KEY} = $2`,
            [dtoIn.activo, dtoIn.ide],
        );
        return { message: 'ok' };
    }

    async deleteDireccionPersona(dtoIn: SetActivoDireccionDto & HeaderParamsDto) {
        const listQuery: ObjectQueryDto[] = [{
            operation: 'delete',
            module: 'gen',
            tableName: TABLE_NAME,
            primaryKey: PRIMARY_KEY,
            object: { ide_gedirp: dtoIn.ide },
            condition: `${PRIMARY_KEY} = ${dtoIn.ide}`,
        }];

        await this.core.save({ ...dtoIn, listQuery, audit: false });
        return { message: 'ok' };
    }
}
