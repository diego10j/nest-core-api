import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { GetCajasDto } from './dto/get-cajas.dto';

@Injectable()
export class CajasService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
    }

    async getCajas(dtoIn: GetCajasDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                b.ide_teban,
                b.nombre_teban,
                b.contacto_teban,
                b.telefono_teban,
                b.es_caja_teban,
                b.foto_teban,
                b.color_teban
            FROM tes_banco b
            WHERE b.ide_empr = $1
              AND b.ide_sucu = $2
              AND b.es_caja_teban = true
            ORDER BY b.nombre_teban
        `, dtoIn);
        query.addIntParam(1, dtoIn.ideEmpr);
        query.addIntParam(2, dtoIn.ideSucu);
        return this.dataSource.createQuery(query, 'tes_banco');
    }

    async getListDataCajas(dtoIn: HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                CAST(b.ide_teban AS VARCHAR) AS value,
                b.nombre_teban              AS label
            FROM tes_banco b
            WHERE b.ide_empr = $1
              AND b.ide_sucu = $2
              AND b.es_caja_teban = true
            ORDER BY b.nombre_teban
        `);
        query.addIntParam(1, dtoIn.ideEmpr);
        query.addIntParam(2, dtoIn.ideSucu);
        return this.dataSource.createSelectQuery(query);
    }

    async getCajaById(ideTeban: number) {
        const query = new SelectQuery(`
            SELECT
                b.ide_teban,
                b.nombre_teban,
                b.contacto_teban,
                b.telefono_teban,
                b.es_caja_teban,
                b.foto_teban,
                b.color_teban
            FROM tes_banco b
            WHERE b.ide_teban = $1
              AND b.es_caja_teban = true
        `);
        query.addIntParam(1, ideTeban);
        return this.dataSource.createSingleQuery(query);
    }
}
