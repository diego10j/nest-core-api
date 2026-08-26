import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { GetDepositosCajaDto } from './dto/get-depositos-caja.dto';
import { GetMovimientosPendientesDepositoDto } from './dto/get-movimientos-pendientes-deposito.dto';

/**
 * Consultas de apoyo para el wizard de Depósitos de Caja. La persistencia/orquestación (generar/
 * completar/anular) vive en DepositoCajaSaveService.
 */
@Injectable()
export class DepositoCajaService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        this.core
            .getVariables(['p_tes_estado_lib_banco_normal'])
            .then((result) => {
                this.variables = result;
            });
    }

    /**
     * Movimientos de ingreso (signo_tettb=1) de una caja que aún no están depositados
     * (depositado_teclb=false) ni reservados por ningún depósito de caja no anulado (ver
     * NOT EXISTS) - primer paso del wizard (selección múltiple).
     */
    async getMovimientosPendientes(dtoIn: GetMovimientosPendientesDepositoDto & HeaderParamsDto) {
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));
        const query = new SelectQuery(`
            SELECT
                a.ide_teclb,
                a.fecha_trans_teclb,
                b.nombre_tettb AS transaccion,
                a.numero_teclb AS num_documento,
                a.beneficiari_teclb AS beneficiario,
                a.valor_teclb AS valor,
                a.observacion_teclb AS observacion
            FROM tes_cab_libr_banc a
            INNER JOIN tes_tip_tran_banc b ON a.ide_tettb = b.ide_tettb
            WHERE a.ide_tecba = $1
              AND a.ide_teelb = $2
              AND a.ide_sucu = $3
              AND b.signo_tettb = 1
              AND a.depositado_teclb = false
              AND ($4::date IS NULL OR a.fecha_trans_teclb >= $4)
              AND ($5::date IS NULL OR a.fecha_trans_teclb <= $5)
              AND NOT EXISTS (
                  SELECT 1 FROM tes_det_deposito_caja_mov dm
                  INNER JOIN tes_cab_deposito_caja dc ON dc.ide_tedca = dm.ide_tedca
                  WHERE dm.ide_teclb = a.ide_teclb AND dc.anulado_tedca = false
              )
            ORDER BY a.fecha_trans_teclb, a.ide_teclb
        `);
        query.addIntParam(1, dtoIn.ideTecba);
        query.addIntParam(2, ideTeelb);
        query.addIntParam(3, dtoIn.ideSucu);
        query.addParam(4, dtoIn.fechaDesde ?? null);
        query.addParam(5, dtoIn.fechaHasta ?? null);
        // createQuery (no createSelectQuery) - DataTableQuery/useDataTableQuery en el frontend
        // exige la forma paginada { rows, columns, pagination, ... }, no un array plano.
        return this.dataSource.createQuery(query);
    }

    /**
     * Info batch de validación server-side de los movimientos seleccionados en el wizard: mismo
     * criterio de "pendiente y no reservado" que getMovimientosPendientes, pero acotado a una
     * lista puntual de ide_teclb (evita confiar ciegamente en los valores que manda el frontend
     * al generar).
     */
    async getInfoMovimientosPendientes(ideTeclbList: number[], ideTecba: number, dtoIn: HeaderParamsDto) {
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));
        const query = new SelectQuery(`
            SELECT
                a.ide_teclb,
                a.valor_teclb,
                a.depositado_teclb,
                EXISTS (
                    SELECT 1 FROM tes_det_deposito_caja_mov dm
                    INNER JOIN tes_cab_deposito_caja dc ON dc.ide_tedca = dm.ide_tedca
                    WHERE dm.ide_teclb = a.ide_teclb AND dc.anulado_tedca = false
                ) AS ya_reservado
            FROM tes_cab_libr_banc a
            WHERE a.ide_tecba = $1
              AND a.ide_teelb = $2
              AND a.ide_teclb = ANY($3)
              AND a.ide_sucu = $4
        `);
        query.addIntParam(1, ideTecba);
        query.addIntParam(2, ideTeelb);
        query.addParam(3, ideTeclbList);
        query.addIntParam(4, dtoIn.ideSucu);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Retorna, para una cuenta puntual, si es de tipo caja (tes_banco.es_caja_teban) - usado
     * para validar que la cuenta origen elegida en el wizard realmente sea una caja.
     */
    async esCuentaCaja(ideTecba: number, dtoIn: HeaderParamsDto): Promise<boolean> {
        const query = new SelectQuery(`
            SELECT b.es_caja_teban
            FROM tes_cuenta_banco cb
            INNER JOIN tes_banco b ON b.ide_teban = cb.ide_teban
            WHERE cb.ide_tecba = $1 AND cb.ide_empr = $2 AND cb.ide_sucu = $3
        `);
        query.addIntParam(1, ideTecba);
        query.addIntParam(2, dtoIn.ideEmpr);
        query.addIntParam(3, dtoIn.ideSucu);
        const row = await this.dataSource.createSingleQuery(query);
        return row?.es_caja_teban === true;
    }

    /**
     * Retorna, para una cuenta puntual, si es de tipo banco real (tes_banco.es_caja_teban=false)
     * - usado para validar que la cuenta destino elegida en el wizard no sea otra caja.
     */
    async esCuentaBanco(ideTecba: number, dtoIn: HeaderParamsDto): Promise<boolean> {
        const query = new SelectQuery(`
            SELECT b.es_caja_teban
            FROM tes_cuenta_banco cb
            INNER JOIN tes_banco b ON b.ide_teban = cb.ide_teban
            WHERE cb.ide_tecba = $1 AND cb.ide_empr = $2 AND cb.ide_sucu = $3
        `);
        query.addIntParam(1, ideTecba);
        query.addIntParam(2, dtoIn.ideEmpr);
        query.addIntParam(3, dtoIn.ideSucu);
        const row = await this.dataSource.createSingleQuery(query);
        return row?.es_caja_teban === false;
    }

    /**
     * Listado de Depósitos de Caja ya registrados (página principal del módulo, patrón
     * "Devolución Cobros Tarjeta"): 3 estados posibles (Generado/Completado/Anulado).
     */
    async getDepositosCaja(dtoIn: GetDepositosCajaDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                c.ide_tedca,
                c.fecha_genera_tedca,
                c.fecha_tedca,
                c.numero_tedca,
                c.completado_tedca,
                c.anulado_tedca,
                CASE
                    WHEN c.anulado_tedca THEN 'Anulado'
                    WHEN c.completado_tedca THEN 'Completado'
                    ELSE 'Generado'
                END AS estado,
                CASE
                    WHEN c.anulado_tedca THEN 'error'
                    WHEN c.completado_tedca THEN 'success'
                    ELSE 'warning'
                END AS color_estado,
                c.ide_tecba_origen,
                co.nombre_tecba AS nombre_tecba_origen,
                c.ide_tecba_destino,
                cd.nombre_tecba AS nombre_tecba_destino,
                bd.nombre_teban AS nombre_teban_destino,
                bd.color_teban AS color_teban_destino,
                bd.foto_teban AS foto_teban_destino,
                c.valor_tedca,
                c.observacion_tedca,
                (SELECT COUNT(*) FROM tes_det_deposito_caja_mov d WHERE d.ide_tedca = c.ide_tedca) AS num_movimientos,
                c.hora_ingre
            FROM tes_cab_deposito_caja c
            INNER JOIN tes_cuenta_banco co ON co.ide_tecba = c.ide_tecba_origen
            INNER JOIN tes_cuenta_banco cd ON cd.ide_tecba = c.ide_tecba_destino
            INNER JOIN tes_banco bd ON bd.ide_teban = cd.ide_teban
            WHERE c.ide_empr = $1
              AND c.ide_sucu = $2
              AND ($3::date IS NULL OR c.fecha_genera_tedca >= $3)
              AND ($4::date IS NULL OR c.fecha_genera_tedca <= $4)
            ORDER BY c.hora_ingre DESC
        `);
        query.addIntParam(1, dtoIn.ideEmpr);
        query.addIntParam(2, dtoIn.ideSucu);
        query.addParam(3, dtoIn.fechaDesde ?? null);
        query.addParam(4, dtoIn.fechaHasta ?? null);
        return this.dataSource.createQuery(query);
    }

    /**
     * Detalle de un Depósito de Caja: cabecera (mismos campos que el listado, + comprobante) +
     * los movimientos de ingreso reservados/cubiertos - para la página de detalle/completar/anular.
     */
    async getDepositoCajaById(ideTedca: number, dtoIn: HeaderParamsDto) {
        const qCab = new SelectQuery(`
            SELECT
                c.ide_tedca,
                c.fecha_genera_tedca,
                c.fecha_tedca,
                c.numero_tedca,
                c.completado_tedca,
                c.fecha_completa_tedca,
                c.anulado_tedca,
                c.fecha_anula_tedca,
                c.motivo_anula_tedca,
                CASE
                    WHEN c.anulado_tedca THEN 'Anulado'
                    WHEN c.completado_tedca THEN 'Completado'
                    ELSE 'Generado'
                END AS estado,
                CASE
                    WHEN c.anulado_tedca THEN 'error'
                    WHEN c.completado_tedca THEN 'success'
                    ELSE 'warning'
                END AS color_estado,
                c.ide_tecba_origen,
                co.nombre_tecba AS nombre_tecba_origen,
                c.ide_tecba_destino,
                cd.nombre_tecba AS nombre_tecba_destino,
                bd.nombre_teban AS nombre_teban_destino,
                bd.color_teban AS color_teban_destino,
                bd.foto_teban AS foto_teban_destino,
                c.ide_teclb_retiro,
                c.ide_teclb_ingreso,
                c.ide_teincb,
                ti.foto_teincb,
                lbr.ide_cnccc,
                c.valor_tedca,
                c.observacion_tedca,
                c.hora_ingre
            FROM tes_cab_deposito_caja c
            INNER JOIN tes_cuenta_banco co ON co.ide_tecba = c.ide_tecba_origen
            INNER JOIN tes_cuenta_banco cd ON cd.ide_tecba = c.ide_tecba_destino
            INNER JOIN tes_banco bd ON bd.ide_teban = cd.ide_teban
            LEFT JOIN tes_info_comprobante_banco ti ON ti.ide_teincb = c.ide_teincb
            LEFT JOIN tes_cab_libr_banc lbr ON lbr.ide_teclb = c.ide_teclb_retiro
            WHERE c.ide_tedca = $1
              AND c.ide_empr = $2
              AND c.ide_sucu = $3
        `);
        qCab.addIntParam(1, ideTedca);
        qCab.addIntParam(2, dtoIn.ideEmpr);
        qCab.addIntParam(3, dtoIn.ideSucu);
        const cabecera = await this.dataSource.createSingleQuery(qCab);
        if (!cabecera) return null;

        const qDet = new SelectQuery(`
            SELECT
                d.ide_tedcm,
                d.ide_teclb,
                d.valor_tedcm,
                l.fecha_trans_teclb,
                l.numero_teclb,
                l.beneficiari_teclb,
                l.observacion_teclb,
                t.nombre_tettb
            FROM tes_det_deposito_caja_mov d
            INNER JOIN tes_cab_libr_banc l ON l.ide_teclb = d.ide_teclb
            INNER JOIN tes_tip_tran_banc t ON t.ide_tettb = l.ide_tettb
            WHERE d.ide_tedca = $1
            ORDER BY l.fecha_trans_teclb ASC, d.ide_teclb ASC
        `);
        qDet.addIntParam(1, ideTedca);
        const movimientos = await this.dataSource.createSelectQuery(qDet);

        return { ...cabecera, movimientos };
    }
}
