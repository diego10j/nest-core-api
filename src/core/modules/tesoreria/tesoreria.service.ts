import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';

@Injectable()
export class TesoreriaService extends BaseService {
    constructor(private readonly dataSource: DataSourceService) {
        super();
    }

    /**
     * Retorna las cuentas bancarias habilitadas para pagos
     * (hace_pagos_tecba = true)
     */
    async getCuentasBancoPagos(dtoIn: HeaderParamsDto) {
        const query = new SelectQuery(
            `
      SELECT
        cb.ide_tecba,
        cb.nombre_tecba,
        b.nombre_teban,
        b.foto_teban,
        color_teban
      FROM tes_cuenta_banco cb
      LEFT JOIN tes_banco b ON b.ide_teban = cb.ide_teban
      WHERE cb.hace_pagos_tecba = true
        AND cb.ide_empr = $1
        AND cb.ide_sucu = $2
        AND activo_tecba = true
      ORDER BY cb.nombre_tecba
      `,
        );
        query.addIntParam(1, dtoIn.ideEmpr);
        query.addIntParam(2, dtoIn.ideSucu);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Retorna todas las cuentas bancarias sin filtro de pagos
     */
    async getCuentasBanco(dtoIn: HeaderParamsDto) {
        const query = new SelectQuery(
            `
      SELECT
        cb.ide_tecba,
        cb.nombre_tecba,
        b.nombre_teban,
        b.foto_teban,
        color_teban
      FROM tes_cuenta_banco cb
      LEFT JOIN tes_banco b ON b.ide_teban = cb.ide_teban
      WHERE cb.ide_empr = $1
        AND cb.ide_sucu = $2
        AND activo_tecba = true
      ORDER BY cb.nombre_tecba
      `,
        );
        query.addIntParam(1, dtoIn.ideEmpr);
        query.addIntParam(2, dtoIn.ideSucu);
        return this.dataSource.createSelectQuery(query);
    }
}
