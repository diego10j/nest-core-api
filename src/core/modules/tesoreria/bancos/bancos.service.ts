import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { GetBancosDto } from './dto/get-bancos.dto';
import { GetCuentasBancoDto } from './dto/get-cuentas-banco.dto';

@Injectable()
export class BancosService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
    }

    // ─── BANCOS (tes_banco) ──────────────────────────────────────────────────

    async getBancos(dtoIn: GetBancosDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                b.ide_teban,
                b.nombre_teban,
                b.contacto_teban,
                b.telefono_teban,
                b.es_caja_teban,
                b.foto_teban,
                b.color_teban,
        (select count(1) from tes_cuenta_banco cb where cb.ide_teban = b.ide_teban and cb.ide_empr = $1 and cb.ide_sucu = $2) as cantidad_cuentas
            FROM tes_banco b
            WHERE b.ide_empr = $1
              AND b.es_caja_teban = false
            ORDER BY b.nombre_teban
        `, dtoIn);
        query.addIntParam(1, dtoIn.ideEmpr);
        query.addIntParam(2, dtoIn.ideSucu);
        return this.dataSource.createQuery(query, 'tes_banco');
    }

    async getListDataBancos(dtoIn: HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                CAST(b.ide_teban AS VARCHAR) AS value,
                b.nombre_teban              AS label
            FROM tes_banco b
            WHERE b.ide_empr = $1
              AND b.es_caja_teban = false
            ORDER BY b.nombre_teban
        `);
        query.addIntParam(1, dtoIn.ideEmpr);
        return this.dataSource.createSelectQuery(query);
    }

    async getBancoById(ideTeban: number) {
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
        `);
        query.addIntParam(1, ideTeban);
        return this.dataSource.createSingleQuery(query);
    }

    // ─── CUENTAS BANCARIAS (tes_cuenta_banco) ───────────────────────────────

    async getCuentasBanco(dtoIn: GetCuentasBancoDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                cb.ide_tecba,
                cb.ide_tetcb,
                cb.ide_teban,
                cb.ide_cndpc,
                tcb.nombre_tetcb,
                cb.nombre_tecba,
                cb.observacion_tecba,
                cb.hace_pagos_tecba,
                cb.hace_cheque_tecba,
                cta.codig_recur_cndpc || ' - ' || cta.nombre_cndpc AS cuenta,
                cb.activo_tecba,
                b.nombre_teban,
                b.color_teban,
                b.foto_teban
            FROM tes_cuenta_banco cb
            LEFT JOIN tes_banco b ON b.ide_teban = cb.ide_teban
            LEFT JOIN con_det_plan_cuen cta ON cta.ide_cndpc = cb.ide_cndpc
            LEFT JOIN tes_tip_cuen_banc tcb ON tcb.ide_tetcb = cb.ide_tetcb
            WHERE cb.ide_empr = $1
              AND cb.ide_sucu = $2
              AND ($3::int8 IS NULL OR cb.ide_teban = $3)
              AND ($4::boolean IS NULL OR cb.hace_pagos_tecba = $4)
              AND ($5::boolean IS NULL OR cb.hace_cheque_tecba = $5)
            ORDER BY b.nombre_teban, cb.nombre_tecba
        `, dtoIn);
        query.addIntParam(1, dtoIn.ideEmpr);
        query.addIntParam(2, dtoIn.ideSucu);
        query.addParam(3, dtoIn.ideTeban ?? null);
        query.addParam(4, dtoIn.hacePagos ?? null);
        query.addParam(5, dtoIn.haceCheque ?? null);
        return this.dataSource.createQuery(query, 'tes_cuenta_banco');
    }

    async getListDataCuentasBanco(dtoIn: HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                CAST(cb.ide_tecba AS VARCHAR) AS value,
                cb.nombre_tecba              AS label
            FROM tes_cuenta_banco cb
            WHERE cb.ide_empr = $1
              AND cb.ide_sucu = $2
              AND cb.activo_tecba = true
            ORDER BY cb.nombre_tecba
        `);
        query.addIntParam(1, dtoIn.ideEmpr);
        query.addIntParam(2, dtoIn.ideSucu);
        return this.dataSource.createSelectQuery(query);
    }

    async getCuentaBancoById(ideTecba: number) {
        const query = new SelectQuery(`
            SELECT
                cb.ide_tecba,
                cb.ide_tetcb,
                cb.ide_teban,
                cb.ide_cndpc,
                cb.nombre_tecba,
                cb.observacion_tecba,
                cb.hace_pagos_tecba,
                cb.hace_cheque_tecba,
                cb.activo_tecba,
                b.nombre_teban
            FROM tes_cuenta_banco cb
            LEFT JOIN tes_banco b ON b.ide_teban = cb.ide_teban
            WHERE cb.ide_tecba = $1
        `);
        query.addIntParam(1, ideTecba);
        return this.dataSource.createSingleQuery(query);
    }
}
