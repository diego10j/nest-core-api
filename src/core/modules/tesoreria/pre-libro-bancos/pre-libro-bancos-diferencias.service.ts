import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { getCurrentDate } from 'src/util/helpers/date-util';

import { GetDiferenciasContablesDto } from './dto/get-diferencias-contables.dto';

const TOLERANCIA = 0.01;

const DESCRIPCIONES: Record<string, string> = {
    MOVIMIENTO_SIN_ASIENTO:
        'Movimiento del libro bancos en estado normal sin asiento contable asociado (ide_cnccc nulo). No se contabilizó la transacción.',
    ASIENTO_NO_EXISTE:
        'El movimiento referencia un asiento contable (ide_cnccc) que no existe en con_cab_comp_cont. El asiento fue eliminado físicamente.',
    ASIENTO_ANULADO_O_INACTIVO:
        'El movimiento está en estado normal pero su asiento contable está anulado o en un estado no válido para el cálculo contable.',
    ASIENTO_NO_AFECTA_CUENTA_BANCO:
        'El asiento asociado al movimiento no tiene ningún detalle en la cuenta contable configurada de la cuenta bancaria (cuenta contable mal referenciada o cambiada después de contabilizar).',
    DIFERENCIA_VALOR:
        'El valor del movimiento de tesorería no coincide con la suma del detalle contable del asiento en la cuenta del banco.',
    ASIENTO_SIN_MOVIMIENTO_TESORERIA:
        'Asiento contable vigente que afecta la cuenta contable del banco y ningún movimiento vigente del libro bancos lo referencia (asiento directo en contabilidad, saldo inicial, ajuste, o movimiento eliminado).',
    MOVIMIENTO_ANULADO_CON_ASIENTO_ACTIVO:
        'Movimiento anulado o inactivo cuyo asiento contable sigue vigente: la contabilidad refleja un movimiento que tesorería ya no tiene.',
    CUENTA_SIN_CUENTA_CONTABLE:
        'La cuenta bancaria no tiene cuenta contable configurada (ide_cndpc nulo): sus movimientos nunca afectan el saldo contable.',
    MOVIMIENTO_CON_FECHA_FUTURA:
        'Movimiento del libro bancos con fecha futura (fecha de transacción posterior a la fecha de corte). Tesorería lo suma al saldo registrado, pero contabilidad no lo incluye en el saldo contable.',
};

@Injectable()
export class PreLibroBancosDiferenciasService extends BaseService {
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
     * Detecta las causas de diferencia entre el saldo contable y el saldo registrado
     * de las cuentas bancarias (misma base de cálculo que getPosicionConsolidada).
     *
     * Causas detectadas:
     *  1. Movimientos del libro bancos (estado normal) sin asiento contable.
     *  2. Movimientos que referencian un asiento inexistente (eliminado).
     *  3. Movimientos vigentes con asiento anulado o en estado no válido.
     *  4. Asientos que no afectan la cuenta contable del banco.
     *  5. Diferencia de valores entre el movimiento de tesorería y su asiento.
     *  6. Asientos vigentes que tocan la cuenta del banco sin movimientos en tesorería.
     *  7. Movimientos anulados cuyo asiento sigue vigente.
     *  8. Cuentas bancarias sin cuenta contable configurada.
     *  9. Movimientos con fecha futura (posteriores a la fecha de corte).
     */
    async getDiferenciasContables(dtoIn: GetDiferenciasContablesDto & HeaderParamsDto) {
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));
        const estadosContables = [
            Number(this.variables.get('p_con_estado_comp_inicial')),
            Number(this.variables.get('p_con_estado_comprobante_normal')),
            Number(this.variables.get('p_con_estado_comp_final')),
        ];
        const fechaFin = dtoIn.fechaFin ?? getCurrentDate();
        const fechaInicio = dtoIn.fechaInicio ?? `${new Date(fechaFin).getFullYear()}-01-01`;

        const [diferenciasMovimiento, asientosSinMovimiento, movAnuladosConAsiento, cuentasSinCuenta, movFechaFutura] =
            await Promise.all([
                this.getDiferenciasMovimientos(dtoIn, ideTeelb, estadosContables, fechaInicio, fechaFin),
                this.getAsientosSinMovimientoTesoreria(dtoIn, ideTeelb, estadosContables, fechaInicio, fechaFin),
                this.getMovimientosAnuladosConAsientoActivo(dtoIn, ideTeelb, estadosContables, fechaInicio, fechaFin),
                this.getCuentasSinCuentaContable(dtoIn, fechaInicio, fechaFin),
                this.getMovimientosFechaFutura(dtoIn, ideTeelb, fechaFin),
            ]);

        const diferencias = [
            ...diferenciasMovimiento,
            ...asientosSinMovimiento,
            ...movAnuladosConAsiento,
            ...cuentasSinCuenta,
            ...movFechaFutura,
        ];

        const conteoPorTipo = new Map<string, number>();
        for (const d of diferencias) {
            conteoPorTipo.set(d.tipo_diferencia, (conteoPorTipo.get(d.tipo_diferencia) ?? 0) + 1);
        }
        const resumenPorTipo = [...conteoPorTipo.entries()].map(([tipo, cantidad]) => ({
            tipo_diferencia: tipo,
            descripcion: DESCRIPCIONES[tipo] ?? tipo,
            cantidad,
        }));

        return {
            parametros: {
                ideSucu: dtoIn.ideSucu,
                ideTecba: dtoIn.ideTecba ?? null,
                fechaInicio,
                fechaFin,
            },
            cuadrado: diferencias.length === 0,
            totalDiferencias: diferencias.length,
            resumenPorTipo,
            diferencias,
        };
    }

    /**
     * Diferencias lado tesoreria: movimientos vigentes con problema de contabilizacion
     * (sin asiento, asiento inexistente/anulado, asiento que no toca la cuenta del banco
     * o valores distintos entre movimiento y asiento).
     */
    private async getDiferenciasMovimientos(
        dtoIn: GetDiferenciasContablesDto & HeaderParamsDto,
        ideTeelb: number,
        estadosContables: number[],
        fechaInicio: string,
        fechaFin: string,
    ) {
        const condicionCuenta = dtoIn.ideTecba ? 'AND a.ide_tecba = $6' : '';

        const query = new SelectQuery(`
            SELECT a.ide_teclb,
                   cb.ide_tecba,
                   b.nombre_teban,
                   cb.nombre_tecba,
                   a.fecha_trans_teclb AS fecha_transaccion,
                   a.numero_teclb      AS numero,
                   a.beneficiari_teclb AS beneficiario,
                   a.valor_teclb * t.signo_tettb AS valor_tesoreria,
                   a.ide_cnccc,
                   ccc.numero_cnccc    AS numero_asiento,
                   eco.nombre_cneco    AS estado_asiento,
                   COALESCE(val.valor_asiento, 0) AS valor_asiento,
                   COALESCE(val.tiene_detalle_banco, false) AS afecta_cuenta_banco,
                   CASE
                       WHEN a.ide_cnccc IS NULL THEN 'MOVIMIENTO_SIN_ASIENTO'
                       WHEN ccc.ide_cnccc IS NULL THEN 'ASIENTO_NO_EXISTE'
                       WHEN NOT (ccc.ide_cneco = ANY($5)) THEN 'ASIENTO_ANULADO_O_INACTIVO'
                       WHEN COALESCE(val.tiene_detalle_banco, false) = false THEN 'ASIENTO_NO_AFECTA_CUENTA_BANCO'
                       ELSE 'DIFERENCIA_VALOR'
                   END AS tipo_diferencia
            FROM tes_cab_libr_banc a
            INNER JOIN tes_tip_tran_banc t ON a.ide_tettb = t.ide_tettb
            INNER JOIN tes_cuenta_banco cb ON a.ide_tecba = cb.ide_tecba
            INNER JOIN tes_banco b ON cb.ide_teban = b.ide_teban
            LEFT JOIN con_cab_comp_cont ccc ON ccc.ide_cnccc = a.ide_cnccc
            LEFT JOIN con_estado_compro eco ON ccc.ide_cneco = eco.ide_cneco
            LEFT JOIN LATERAL (
                SELECT SUM(dcc.valor_cndcc * sc.signo_cnscu) AS valor_asiento,
                       COUNT(*) > 0 AS tiene_detalle_banco
                FROM con_det_comp_cont dcc
                INNER JOIN con_det_plan_cuen dpc ON dpc.ide_cndpc = dcc.ide_cndpc
                INNER JOIN con_tipo_cuenta tc ON dpc.ide_cntcu = tc.ide_cntcu
                INNER JOIN con_signo_cuenta sc ON tc.ide_cntcu = sc.ide_cntcu
                    AND dcc.ide_cnlap = sc.ide_cnlap
                WHERE dcc.ide_cnccc = a.ide_cnccc
                  AND dpc.ide_cndpc = cb.ide_cndpc
            ) val ON a.ide_cnccc IS NOT NULL
            WHERE a.ide_teelb = $1
              AND a.ide_sucu = $2
              AND a.fecha_trans_teclb BETWEEN $3 AND $4
              ${condicionCuenta}
              AND (
                  a.ide_cnccc IS NULL
                  OR ccc.ide_cnccc IS NULL
                  OR NOT (ccc.ide_cneco = ANY($5))
                  OR COALESCE(val.tiene_detalle_banco, false) = false
                  OR ABS(a.valor_teclb * t.signo_tettb - COALESCE(val.valor_asiento, 0)) > ${TOLERANCIA}
              )
            ORDER BY a.fecha_trans_teclb, a.ide_teclb
        `);
        query.addIntParam(1, ideTeelb);
        query.addIntParam(2, dtoIn.ideSucu);
        query.addStringParam(3, fechaInicio);
        query.addStringParam(4, fechaFin);
        query.addArrayNumberParam(5, estadosContables);
        if (dtoIn.ideTecba) {
            query.addIntParam(6, dtoIn.ideTecba);
        }
        const rows = await this.dataSource.createSelectQuery(query);
        return rows.map((r: Record<string, any>): Record<string, any> => ({
            ...r,
            diferencia_valor: Number(
                (Number(r.valor_tesoreria ?? 0) - Number(r.valor_asiento ?? 0)).toFixed(2),
            ),
            descripcion: DESCRIPCIONES[r.tipo_diferencia] ?? r.tipo_diferencia,
        }));
    }

    /**
     * Asientos contables vigentes que afectan la cuenta contable de una cuenta bancaria
     * y que ningun movimiento vigente del libro bancos referencia.
     */
    private async getAsientosSinMovimientoTesoreria(
        dtoIn: GetDiferenciasContablesDto & HeaderParamsDto,
        ideTeelb: number,
        estadosContables: number[],
        fechaInicio: string,
        fechaFin: string,
    ) {
        const condicionCuenta = dtoIn.ideTecba ? 'AND cb.ide_tecba = $6' : '';

        const query = new SelectQuery(`
            SELECT ccc.ide_cnccc,
                   ccc.numero_cnccc    AS numero_asiento,
                   ccc.fecha_trans_cnccc AS fecha_transaccion,
                   ccc.observacion_cnccc AS observacion,
                   eco.nombre_cneco    AS estado_asiento,
                   cb.ide_tecba,
                   b.nombre_teban,
                   cb.nombre_tecba,
                   SUM(dcc.valor_cndcc * sc.signo_cnscu) AS valor_asiento,
                   'ASIENTO_SIN_MOVIMIENTO_TESORERIA' AS tipo_diferencia
            FROM con_cab_comp_cont ccc
            INNER JOIN con_estado_compro eco ON ccc.ide_cneco = eco.ide_cneco
            INNER JOIN con_det_comp_cont dcc ON dcc.ide_cnccc = ccc.ide_cnccc
            INNER JOIN con_det_plan_cuen dpc ON dpc.ide_cndpc = dcc.ide_cndpc
            INNER JOIN con_tipo_cuenta tc ON dpc.ide_cntcu = tc.ide_cntcu
            INNER JOIN con_signo_cuenta sc ON tc.ide_cntcu = sc.ide_cntcu
                AND dcc.ide_cnlap = sc.ide_cnlap
            INNER JOIN tes_cuenta_banco cb ON cb.ide_cndpc = dpc.ide_cndpc
            INNER JOIN tes_banco b ON cb.ide_teban = b.ide_teban
            WHERE ccc.fecha_trans_cnccc BETWEEN $1 AND $2
              AND ccc.ide_cneco = ANY($3)
              AND cb.ide_sucu = $4
              ${condicionCuenta}
              AND NOT EXISTS (
                  SELECT 1 FROM tes_cab_libr_banc m
                  WHERE m.ide_cnccc = ccc.ide_cnccc
                    AND m.ide_teelb = $5
              )
            GROUP BY ccc.ide_cnccc, ccc.numero_cnccc, ccc.fecha_trans_cnccc,
                     ccc.observacion_cnccc, eco.nombre_cneco,
                     cb.ide_tecba, b.nombre_teban, cb.nombre_tecba
            ORDER BY ccc.fecha_trans_cnccc, ccc.ide_cnccc
        `);
        query.addStringParam(1, fechaInicio);
        query.addStringParam(2, fechaFin);
        query.addArrayNumberParam(3, estadosContables);
        query.addIntParam(4, dtoIn.ideSucu);
        query.addIntParam(5, ideTeelb);
        if (dtoIn.ideTecba) {
            query.addIntParam(6, dtoIn.ideTecba);
        }
        const rows = await this.dataSource.createSelectQuery(query);
        return rows.map((r: Record<string, any>): Record<string, any> => ({
            ...r,
            valor_tesoreria: 0,
            diferencia_valor: Number(Number(r.valor_asiento ?? 0).toFixed(2)),
            descripcion: DESCRIPCIONES[r.tipo_diferencia] ?? r.tipo_diferencia,
        }));
    }

    /**
     * Movimientos anulados/inactivos cuyo asiento contable sigue vigente:
     * contabilidad refleja algo que tesoreria ya reverso.
     */
    private async getMovimientosAnuladosConAsientoActivo(
        dtoIn: GetDiferenciasContablesDto & HeaderParamsDto,
        ideTeelb: number,
        estadosContables: number[],
        fechaInicio: string,
        fechaFin: string,
    ) {
        const condicionCuenta = dtoIn.ideTecba ? 'AND a.ide_tecba = $6' : '';

        const query = new SelectQuery(`
            SELECT a.ide_teclb,
                   cb.ide_tecba,
                   b.nombre_teban,
                   cb.nombre_tecba,
                   a.fecha_trans_teclb AS fecha_transaccion,
                   a.numero_teclb      AS numero,
                   a.beneficiari_teclb AS beneficiario,
                   est.nombre_teelb    AS estado_movimiento,
                   a.valor_teclb * t.signo_tettb AS valor_tesoreria,
                   a.ide_cnccc,
                   ccc.numero_cnccc    AS numero_asiento,
                   eco.nombre_cneco    AS estado_asiento,
                   'MOVIMIENTO_ANULADO_CON_ASIENTO_ACTIVO' AS tipo_diferencia
            FROM tes_cab_libr_banc a
            INNER JOIN tes_tip_tran_banc t ON a.ide_tettb = t.ide_tettb
            INNER JOIN tes_cuenta_banco cb ON a.ide_tecba = cb.ide_tecba
            INNER JOIN tes_banco b ON cb.ide_teban = b.ide_teban
            INNER JOIN tes_estado_libro_banco est ON a.ide_teelb = est.ide_teelb
            INNER JOIN con_cab_comp_cont ccc ON ccc.ide_cnccc = a.ide_cnccc
            INNER JOIN con_estado_compro eco ON ccc.ide_cneco = eco.ide_cneco
            WHERE a.ide_teelb <> $1
              AND a.ide_sucu = $2
              AND a.fecha_trans_teclb BETWEEN $3 AND $4
              AND ccc.ide_cneco = ANY($5)
              ${condicionCuenta}
            ORDER BY a.fecha_trans_teclb, a.ide_teclb
        `);
        query.addIntParam(1, ideTeelb);
        query.addIntParam(2, dtoIn.ideSucu);
        query.addStringParam(3, fechaInicio);
        query.addStringParam(4, fechaFin);
        query.addArrayNumberParam(5, estadosContables);
        if (dtoIn.ideTecba) {
            query.addIntParam(6, dtoIn.ideTecba);
        }
        const rows = await this.dataSource.createSelectQuery(query);
        return rows.map((r: Record<string, any>): Record<string, any> => ({
            ...r,
            valor_asiento: null,
            diferencia_valor: Number(r.valor_tesoreria ?? 0),
            descripcion: DESCRIPCIONES[r.tipo_diferencia] ?? r.tipo_diferencia,
        }));
    }

    /**
     * Cuentas bancarias activas sin cuenta contable configurada (con movimientos en el rango).
     */
    private async getCuentasSinCuentaContable(
        dtoIn: GetDiferenciasContablesDto & HeaderParamsDto,
        fechaInicio: string,
        fechaFin: string,
    ) {
        const condicionCuenta = dtoIn.ideTecba ? 'AND cb.ide_tecba = $4' : '';

        const query = new SelectQuery(`
            SELECT cb.ide_tecba,
                   b.nombre_teban,
                   cb.nombre_tecba,
                   (SELECT COUNT(*) FROM tes_cab_libr_banc m
                    WHERE m.ide_tecba = cb.ide_tecba
                      AND m.fecha_trans_teclb BETWEEN $2 AND $3) AS movimientos_rango,
                   'CUENTA_SIN_CUENTA_CONTABLE' AS tipo_diferencia
            FROM tes_cuenta_banco cb
            INNER JOIN tes_banco b ON cb.ide_teban = b.ide_teban
            WHERE cb.ide_sucu = $1
              AND cb.activo_tecba = true
              AND cb.ide_cndpc IS NULL
              ${condicionCuenta}
            ORDER BY b.nombre_teban, cb.nombre_tecba
        `);
        query.addIntParam(1, dtoIn.ideSucu);
        query.addStringParam(2, fechaInicio);
        query.addStringParam(3, fechaFin);
        if (dtoIn.ideTecba) {
            query.addIntParam(4, dtoIn.ideTecba);
        }
        const rows = await this.dataSource.createSelectQuery(query);
        return rows.map((r: Record<string, any>): Record<string, any> => ({
            ...r,
            descripcion: DESCRIPCIONES[r.tipo_diferencia] ?? r.tipo_diferencia,
        }));
    }

    /**
     * Movimientos vigentes con fecha de transaccion futura (posteriores a la fecha de corte):
     * por error se registran con fecha mayor al dia actual. El saldo registrado los suma
     * (no filtra por fecha) pero el saldo contable solo considera asientos hasta fechaFin,
     * generando diferencia.
     */
    private async getMovimientosFechaFutura(
        dtoIn: GetDiferenciasContablesDto & HeaderParamsDto,
        ideTeelb: number,
        fechaFin: string,
    ) {
        const condicionCuenta = dtoIn.ideTecba ? 'AND a.ide_tecba = $5' : '';

        const query = new SelectQuery(`
            SELECT a.ide_teclb,
                   cb.ide_tecba,
                   b.nombre_teban,
                   cb.nombre_tecba,
                   a.fecha_trans_teclb AS fecha_transaccion,
                   a.numero_teclb      AS numero,
                   a.beneficiari_teclb AS beneficiario,
                   a.valor_teclb * t.signo_tettb AS valor_tesoreria,
                   a.fecha_trans_teclb > $2::date AS fecha_futura,
                   a.ide_cnccc,
                   ccc.numero_cnccc    AS numero_asiento,
                   ccc.fecha_trans_cnccc > $2::date AS asiento_fecha_futura,
                   CASE
                       WHEN ccc.ide_cneco IS NULL OR ccc.ide_cneco = ANY($4) THEN false
                       ELSE true
                   END AS asiento_inactivo,
                   'MOVIMIENTO_CON_FECHA_FUTURA' AS tipo_diferencia
            FROM tes_cab_libr_banc a
            INNER JOIN tes_tip_tran_banc t ON a.ide_tettb = t.ide_tettb
            INNER JOIN tes_cuenta_banco cb ON a.ide_tecba = cb.ide_tecba
            INNER JOIN tes_banco b ON cb.ide_teban = b.ide_teban
            LEFT JOIN con_cab_comp_cont ccc ON ccc.ide_cnccc = a.ide_cnccc
            WHERE a.ide_teelb = $1
              AND a.ide_sucu = $3
              AND a.fecha_trans_teclb > $2::date
              ${condicionCuenta}
            ORDER BY a.fecha_trans_teclb DESC, a.ide_teclb
        `);
        query.addIntParam(1, ideTeelb);
        query.addStringParam(2, fechaFin);
        query.addIntParam(3, dtoIn.ideSucu);
        query.addArrayNumberParam(4, [
            Number(this.variables.get('p_con_estado_comp_inicial')),
            Number(this.variables.get('p_con_estado_comprobante_normal')),
            Number(this.variables.get('p_con_estado_comp_final')),
        ]);
        if (dtoIn.ideTecba) {
            query.addIntParam(5, dtoIn.ideTecba);
        }
        const rows = await this.dataSource.createSelectQuery(query);
        return rows.map((r: Record<string, any>): Record<string, any> => ({
            ...r,
            valor_asiento: null,
            diferencia_valor: Number(r.valor_tesoreria ?? 0),
            descripcion: DESCRIPCIONES[r.tipo_diferencia] ?? r.tipo_diferencia,
        }));
    }
}
