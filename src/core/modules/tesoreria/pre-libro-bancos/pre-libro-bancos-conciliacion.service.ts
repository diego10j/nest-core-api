import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { getCurrentDate, getCurrentTime } from 'src/util/helpers/date-util';

import { ConciliarMovimientosDto } from './dto/conciliar-movimientos.dto';
import { GetPosicionConsolidadaDto } from './dto/posicion-consolidada.dto';

@Injectable()
export class PreLibroBancosConciliacionService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        this.core
            .getVariables([
                'p_tes_estado_lib_banco_normal',
                'p_con_estado_comp_inicial',
                'p_con_estado_comprobante_normal',
                'p_con_estado_comp_final',
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    /**
     * Retorna las transacciones disponibles para conciliar en un rango de fechas
     */
    async getTransaccionesConciliarCuenta(
        dtoIn: { ideTecba: number; fechaInicio: string; fechaFin: string } & HeaderParamsDto,
    ) {
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));

        const query = new SelectQuery(`
            SELECT a.fecha_trans_teclb,
                   a.numero_teclb,
                   a.ide_cnccc,
                   a.beneficiari_teclb,
                   a.valor_teclb,
                   a.observacion_teclb,
                   a.ide_teclb,
                   a.conciliado_teclb AS conciliado
            FROM tes_cab_libr_banc a
            WHERE a.ide_tecba = $1
              AND a.ide_teelb  = $2
              AND a.fecha_trans_teclb BETWEEN $3 AND $4
            ORDER BY a.fecha_trans_teclb, a.ide_teclb
        `);
        query.addIntParam(1, dtoIn.ideTecba);
        query.addIntParam(2, ideTeelb);
        query.addStringParam(3, dtoIn.fechaInicio);
        query.addStringParam(4, dtoIn.fechaFin);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Retorna las transacciones encontradas por IDs para conciliacion
     */
    async getTransaccionesEncontradasConciliar(ideTeclbList: number[]) {
        const query = new SelectQuery(`
            SELECT a.fecha_trans_teclb,
                   a.numero_teclb,
                   a.valor_teclb,
                   a.beneficiari_teclb,
                   a.observacion_teclb,
                   a.ide_teclb
            FROM tes_cab_libr_banc a
            WHERE a.ide_teclb = ANY($1)
            ORDER BY a.fecha_trans_teclb, a.ide_teclb
        `);
        query.addArrayNumberParam(1, ideTeclbList);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Ejecuta la conciliacion de movimientos: marca conciliado=true + fecha
     */
    async conciliarMovimientos(dtoIn: ConciliarMovimientosDto & HeaderParamsDto) {
        const result = await this.dataSource.pool.query(
            `UPDATE tes_cab_libr_banc
             SET conciliado_teclb = true,
                 usuario_actua    = $2,
                 fecha_concilia_teclb = $3,
                 fecha_actua      = $4,
                 hora_actua       = $5
             WHERE ide_teclb = ANY($1)`,
            [dtoIn.ideTeclbList, dtoIn.login, dtoIn.fechaConcilia, getCurrentDate(), getCurrentTime()],
        );
        return { message: 'ok', rowCount: result.rowCount };
    }

    /**
     * Retorna el saldo inicial conciliado de una cuenta a una fecha
     */
    async getSaldoInicialConciliadoCuenta(ideTecba: number, fecha: string) {
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));

        const query = new SelectQuery(`
            SELECT COALESCE(SUM(a.valor_teclb * b.signo_tettb), 0) AS saldo
            FROM tes_cab_libr_banc a
            INNER JOIN tes_tip_tran_banc b ON a.ide_tettb = b.ide_tettb
            WHERE a.ide_tecba = $1
              AND a.ide_teelb  = $2
              AND a.fecha_trans_teclb <= $3
              AND a.conciliado_teclb = true
        `);
        query.addIntParam(1, ideTecba);
        query.addIntParam(2, ideTeelb);
        query.addStringParam(3, fecha);
        return this.dataSource.createSingleQuery(query);
    }

    /**
     * Retorna el saldo inicial del estado de cuenta (por fecha_concilia)
     */
    async getSaldoInicialEstadoCuenta(ideTecba: number, fecha: string) {
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));

        const query = new SelectQuery(`
            SELECT COALESCE(SUM(a.valor_teclb * b.signo_tettb), 0) AS saldo
            FROM tes_cab_libr_banc a
            INNER JOIN tes_tip_tran_banc b ON a.ide_tettb = b.ide_tettb
            WHERE a.ide_tecba = $1
              AND a.ide_teelb  = $2
              AND a.fecha_concilia_teclb <= $3
              AND a.conciliado_teclb = true
        `);
        query.addIntParam(1, ideTecba);
        query.addIntParam(2, ideTeelb);
        query.addStringParam(3, fecha);
        return this.dataSource.createSingleQuery(query);
    }

    /**
     * Retorna la posicion consolidada de cuentas bancarias
     * (saldo contable, saldo registrado, saldo disponible)
     */
    async getPosicionConsolidada(dtoIn: GetPosicionConsolidadaDto & HeaderParamsDto) {
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));
        const estadosContables = [
            Number(this.variables.get('p_con_estado_comp_inicial')),
            Number(this.variables.get('p_con_estado_comprobante_normal')),
            Number(this.variables.get('p_con_estado_comp_final')),
        ];
        const fechaFin = dtoIn.fechaFin ?? getCurrentDate();
        const anioInicio = `${new Date(fechaFin).getFullYear()}-01-01`;
        const condicion = dtoIn.ideTecba ? 'AND a.ide_tecba = $5' : '';

        const query = new SelectQuery(`
            SELECT
                a.ide_tecba,
                b.nombre_teban,
                a.nombre_tecba,
                c.nombre_tetcb,
                a.ide_cndpc,
                (
                    SELECT COALESCE(SUM(dcc.valor_cndcc * sc.signo_cnscu), 0)
                    FROM con_cab_comp_cont ccc
                    INNER JOIN con_det_comp_cont dcc ON ccc.ide_cnccc = dcc.ide_cnccc
                    INNER JOIN con_det_plan_cuen dpc ON dpc.ide_cndpc = dcc.ide_cndpc
                    INNER JOIN con_tipo_cuenta tc ON dpc.ide_cntcu = tc.ide_cntcu
                    INNER JOIN con_signo_cuenta sc ON tc.ide_cntcu = sc.ide_cntcu
                        AND dcc.ide_cnlap = sc.ide_cnlap
                    WHERE ccc.fecha_trans_cnccc BETWEEN $2 AND $3
                      AND ccc.ide_cneco = ANY($4)
                      AND dpc.ide_cndpc = a.ide_cndpc
                      AND ccc.activo_cnccc = true
                ) AS saldo_contable,
                COALESCE((
                    SELECT SUM(aa.valor_teclb * bb.signo_tettb)
                    FROM tes_cab_libr_banc aa
                    INNER JOIN tes_tip_tran_banc bb ON aa.ide_tettb = bb.ide_tettb
                    WHERE aa.ide_tecba = a.ide_tecba
                      AND aa.ide_teelb = ${ideTeelb}
                ), 0) AS saldo_registrado,
                COALESCE((
                    SELECT SUM(aa.valor_teclb * bb.signo_tettb)
                    FROM tes_cab_libr_banc aa
                    INNER JOIN tes_tip_tran_banc bb ON aa.ide_tettb = bb.ide_tettb
                    WHERE aa.ide_tecba = a.ide_tecba
                      AND aa.ide_teelb = ${ideTeelb}
                      AND (aa.fec_cam_est_teclb IS NULL OR aa.fec_cam_est_teclb <= $3)
                ), 0) AS saldo_disponible
            FROM tes_cuenta_banco a
            INNER JOIN tes_banco b ON a.ide_teban = b.ide_teban
            INNER JOIN tes_tip_cuen_banc c ON a.ide_tetcb = c.ide_tetcb
            WHERE a.ide_sucu = $1
              ${condicion}
            ORDER BY b.nombre_teban, a.nombre_tecba
        `);
        query.addIntParam(1, dtoIn.ideSucu);
        query.addStringParam(2, anioInicio);
        query.addStringParam(3, fechaFin);
        query.addArrayNumberParam(4, estadosContables);
        if (dtoIn.ideTecba) {
            query.addIntParam(5, dtoIn.ideTecba);
        }
        return this.dataSource.createSelectQuery(query);
    }
}
