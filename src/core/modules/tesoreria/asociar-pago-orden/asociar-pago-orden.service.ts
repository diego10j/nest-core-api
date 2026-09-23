import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { CoreService } from 'src/core/core.service';
import { getCurrentDate } from 'src/util/helpers/date-util';
import type { PoolClient } from 'pg';

import {
    AsociarPagosOrdenDto,
    DesasociarPagosOrdenDto,
    GetMovimientosAsociablesDto,
} from './dto/asociar-pago-orden.dto';

/** Tolerancia (USD) para que lo aplicado a una factura "cubra" su valor planificado. */
const TOLERANCIA_LINEA = 0.02;

const IDE_CPEO_GENERADA = 1;
const IDE_CPEO_PAGADA = 3;
const IDE_CPEO_ANULADA = 4;

interface LineaPendiente {
    ide_cpcdop: number;
    ide_cpctr: number;
    numero_cpcfa: string | null;
    planificado: number;
}

export interface MovimientoElegible {
    ide_teclb: number;
    fecha_trans_teclb: string;
    numero_teclb: string | null;
    valor_teclb: number;
    observacion_teclb: string | null;
    ide_tecba: number | null;
    ide_tettb: number | null;
    nombre_tecba: string | null;
    nombre_teban: string | null;
    foto_teban: string | null;
    color_teban: string | null;
    nombre_tettb: string | null;
    foto: string | null;
    valor_aplicado: number;
    aplicado_detalle: Array<{ ide_cpctr: number; valor: number }>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * "Asociar pago": completa el pago pendiente de un proveedor en una orden de pago con pagos que YA
 * existen en Tesorería (movimientos de tes_cab_libr_banc), en vez de registrar un pago nuevo desde
 * la orden. Caso típico: el proveedor se pagó en varias transferencias (una por error de menos y otra
 * que completa) hechas desde Tesorería > Cuentas por pagar, que sí admite N pagos por documento.
 *
 * Los ids de los movimientos asociados se guardan en cxp_det_orden_pago.ide_teclb_asoc_cpcdop
 * (BIGINT[]). Valor, fecha y comprobante siempre se leen de Tesorería: nada queda desactualizado.
 */
@Injectable()
export class AsociarPagoOrdenService extends BaseService {
    private readonly logger = new Logger(AsociarPagoOrdenService.name);

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
     * Movimientos de Tesorería que el usuario puede asociar al pago pendiente de un proveedor.
     * Solo se listan los ELEGIBLES:
     *   - pagos reales (tipo de transacción con signo negativo, numero_pago > 0) aplicados a las
     *     cuentas por pagar de los detalles pendientes del proveedor en esta orden;
     *   - movimientos en estado normal (no anulados);
     *   - que no estén ya asociados a ningún detalle de ninguna orden;
     *   - que no sean el pago propio que una orden registró desde su diálogo (mismo comprobante y
     *     cuenta que un detalle de orden de esa misma cuenta por pagar).
     */
    async getMovimientosAsociables(dtoIn: GetMovimientosAsociablesDto & HeaderParamsDto) {
        const { lineas } = await this.getLineasPendientes(dtoIn.ide_cpcop, dtoIn.ide_geper, dtoIn);
        const movimientos = await this.consultarMovimientos(lineas.map((l) => l.ide_cpctr), null);
        const totalRequerido = round2(lineas.reduce((acc, l) => acc + l.planificado, 0));
        return { total_requerido: totalRequerido, movimientos };
    }

    /**
     * Asocia movimientos al pago pendiente de un proveedor en la orden. Regla: lo que los
     * movimientos seleccionados aplican a las cuentas por pagar de la orden debe sumar el total del
     * detalle (y cubrir cada factura). Todos los detalles pendientes del proveedor pasan a PAGADA.
     */
    async asociarPagos(dtoIn: AsociarPagosOrdenDto & HeaderParamsDto) {
        const ids = [...new Set(dtoIn.ide_teclb.map(Number))];
        const { lineas } = await this.getLineasPendientes(dtoIn.ide_cpcop, dtoIn.ide_geper, dtoIn);

        // Revalida elegibilidad en el servidor (la lista del frontend pudo quedar vieja).
        const movimientos = await this.consultarMovimientos(lineas.map((l) => l.ide_cpctr), ids);
        const encontrados = new Set(movimientos.map((m) => m.ide_teclb));
        const noDisponibles = ids.filter((id) => !encontrados.has(id));
        if (noDisponibles.length) {
            throw new BadRequestException(
                `Los movimientos [${noDisponibles.join(', ')}] ya no están disponibles para asociar `
                + '(ya fueron asociados a otra orden, se anularon o no corresponden a las facturas de este proveedor).',
            );
        }

        // Aplicado por factura (ide_cpctr) sumando todos los movimientos seleccionados.
        const aplicadoPorCtr = new Map<number, number>();
        for (const mov of movimientos) {
            for (const item of mov.aplicado_detalle) {
                aplicadoPorCtr.set(item.ide_cpctr, (aplicadoPorCtr.get(item.ide_cpctr) ?? 0) + Number(item.valor));
            }
        }

        const totalPlanificado = round2(lineas.reduce((acc, l) => acc + l.planificado, 0));
        const totalAplicado = round2(lineas.reduce((acc, l) => acc + (aplicadoPorCtr.get(l.ide_cpctr) ?? 0), 0));
        const tolerancia = Math.max(0.01, lineas.length * 0.005);

        if (Math.abs(totalAplicado - totalPlanificado) > tolerancia) {
            throw new BadRequestException(
                `Los pagos seleccionados aplican $${totalAplicado.toFixed(2)} a las facturas de esta orden, `
                + `pero el total del detalle es $${totalPlanificado.toFixed(2)}. Deben sumar exactamente el total.`,
            );
        }
        for (const linea of lineas) {
            const aplicado = round2(aplicadoPorCtr.get(linea.ide_cpctr) ?? 0);
            if (aplicado < linea.planificado - TOLERANCIA_LINEA) {
                throw new BadRequestException(
                    `Los pagos seleccionados aplican $${aplicado.toFixed(2)} a la factura ${linea.numero_cpcfa ?? linea.ide_cpctr}, `
                    + `que en la orden es de $${linea.planificado.toFixed(2)}.`,
                );
            }
        }

        // Datos "de cabecera" del pago que se muestran en la orden: los del movimiento más reciente.
        const ordenados = [...movimientos].sort(
            (a, b) => String(a.fecha_trans_teclb).localeCompare(String(b.fecha_trans_teclb)) || a.ide_teclb - b.ide_teclb,
        );
        const ultimo = ordenados[ordenados.length - 1];
        const numeros = [...new Set(ordenados.map((m) => m.numero_teclb ?? 's/n'))].join(' / ');
        const foto = [...ordenados].reverse().find((m) => m.foto)?.foto ?? null;

        const client = await this.dataSource.pool.connect();
        let cerrada = false;
        try {
            await client.query('BEGIN');

            for (const linea of lineas) {
                await client.query(
                    `UPDATE cxp_det_orden_pago
                        SET ide_cpeo                  = $2,
                            fecha_pago_cpcdop         = $3::date,
                            num_comprobante_cpcdop    = $4,
                            valor_pagado_banco_cpcdop = $5,
                            saldo_pendiente_cpcdop    = 0,
                            ide_tecba                 = $6,
                            ide_tettb                 = $7,
                            observacion_cpcdop        = COALESCE(NULLIF(observacion_cpcdop, ''), $8),
                            foto_cpcdop               = $9,
                            ide_teclb_asoc_cpcdop     = $10::int8[],
                            usuario_actua             = $11,
                            hora_actua                = NOW()
                      WHERE ide_cpcdop = $1`,
                    [
                        linea.ide_cpcdop,
                        IDE_CPEO_PAGADA,
                        ultimo.fecha_trans_teclb,
                        numeros.slice(0, 50),
                        round2(aplicadoPorCtr.get(linea.ide_cpctr) ?? 0),
                        ultimo.ide_tecba,
                        ultimo.ide_tettb,
                        `Pago asociado desde Tesorería (mov. ${numeros})`.slice(0, 250),
                        foto ? foto.slice(0, 200) : null,
                        ids,
                        dtoIn.login,
                    ],
                );
            }

            // Cierra la orden si ya no quedan detalles pendientes (misma regla que saveDetalleOrden).
            const pendientes = await client.query(
                `SELECT COUNT(*)::int AS total
                   FROM cxp_det_orden_pago
                  WHERE ide_cpcop = $1 AND activo_cpcdop = true AND ide_cpeo <> $2`,
                [dtoIn.ide_cpcop, IDE_CPEO_PAGADA],
            );
            if (Number(pendientes.rows[0]?.total ?? 1) === 0) {
                await client.query(
                    `UPDATE cxp_cab_orden_pago
                        SET ide_cpeo                  = $2,
                            fecha_pago_cpcop          = $3::date,
                            fecha_efectiva_pago_cpcop = (
                                SELECT MAX(fecha_pago_cpcdop) FROM cxp_det_orden_pago
                                 WHERE ide_cpcop = $1 AND activo_cpcdop = true),
                            usuario_actua             = $4,
                            hora_actua                = NOW()
                      WHERE ide_cpcop = $1 AND ide_empr = $5`,
                    [dtoIn.ide_cpcop, IDE_CPEO_PAGADA, getCurrentDate(), dtoIn.login, dtoIn.ideEmpr],
                );
                cerrada = true;
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

        return {
            message: 'ok',
            rowCount: lineas.length,
            total_aplicado: totalAplicado,
            cerrada,
        };
    }

    /**
     * Quita los pagos asociados de un proveedor en una orden: sus detalles vuelven a pendiente
     * (GENERADA) y, si la orden estaba cerrada como PAGADA, se reabre. No toca Tesorería.
     */
    async desasociarPagos(dtoIn: DesasociarPagosOrdenDto & HeaderParamsDto) {
        await this.validarOrdenEditable(dtoIn.ide_cpcop, dtoIn);

        const client = await this.dataSource.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query(
                `UPDATE cxp_det_orden_pago det
                    SET ide_cpeo                  = $3,
                        ide_teclb_asoc_cpcdop     = '{}',
                        ${this.SQL_RESET_CAMPOS_PAGO},
                        usuario_actua             = $4,
                        hora_actua                = NOW()
                   FROM cxp_cabece_transa ct
                  WHERE ct.ide_cpctr = det.ide_cpctr
                    AND det.ide_cpcop = $1
                    AND ct.ide_geper = $2
                    AND cardinality(det.ide_teclb_asoc_cpcdop) > 0`,
                [dtoIn.ide_cpcop, dtoIn.ide_geper, IDE_CPEO_GENERADA, dtoIn.login],
            );
            if (!result.rowCount) {
                throw new BadRequestException('El proveedor no tiene pagos asociados en esta orden.');
            }
            await this.reabrirOrdenes(client, [dtoIn.ide_cpcop], dtoIn.login);
            await client.query('COMMIT');
            return { message: 'ok', rowCount: result.rowCount };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Llamado al ANULAR un movimiento de Tesorería: si estaba asociado a detalles de orden, se
     * desvinculan (los detalles vuelven a pendiente y la orden se reabre si estaba cerrada) para no
     * dejar una orden "pagada" apoyada en un pago que ya no existe. Devuelve los ide_cpcdop afectados.
     */
    async desvincularMovimiento(ideTeclb: number, login: string): Promise<number[]> {
        const client = await this.dataSource.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query(
                `UPDATE cxp_det_orden_pago
                    SET ide_cpeo                  = $2,
                        ide_teclb_asoc_cpcdop     = '{}',
                        ${this.SQL_RESET_CAMPOS_PAGO},
                        usuario_actua             = $3,
                        hora_actua                = NOW()
                  WHERE $1 = ANY(ide_teclb_asoc_cpcdop)
              RETURNING ide_cpcdop, ide_cpcop`,
                [ideTeclb, IDE_CPEO_GENERADA, login],
            );
            if (result.rowCount) {
                const ordenes: number[] = [...new Set<number>(result.rows.map((r) => Number(r.ide_cpcop)))];
                await this.reabrirOrdenes(client, ordenes, login);
                this.logger.warn(
                    `Movimiento ${ideTeclb} anulado: se desvincularon los detalles de orden [${result.rows.map((r) => r.ide_cpcdop).join(', ')}]`,
                );
            }
            await client.query('COMMIT');
            return result.rows.map((r) => Number(r.ide_cpcdop));
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // ─── PRIVADOS ─────────────────────────────────────────────────────────────

    /** Campos de pago que se limpian cuando un detalle vuelve a pendiente (igual que al anular la orden). */
    private readonly SQL_RESET_CAMPOS_PAGO = `
                        ide_tecba                 = NULL,
                        ide_tettb                 = NULL,
                        valor_pagado_banco_cpcdop = NULL,
                        saldo_pendiente_cpcdop    = NULL,
                        num_comprobante_cpcdop    = NULL,
                        fecha_pago_cpcdop         = NULL,
                        fecha_cheque_cpcdop       = NULL,
                        observacion_cpcdop        = NULL,
                        foto_cpcdop               = NULL`;

    private async reabrirOrdenes(client: PoolClient, ideCpcopList: number[], login: string) {
        await client.query(
            `UPDATE cxp_cab_orden_pago
                SET ide_cpeo                  = $2,
                    fecha_pago_cpcop          = NULL,
                    fecha_efectiva_pago_cpcop = NULL,
                    usuario_actua             = $3,
                    hora_actua                = NOW()
              WHERE ide_cpcop = ANY($1::int8[]) AND ide_cpeo = $4`,
            [ideCpcopList, IDE_CPEO_GENERADA, login, IDE_CPEO_PAGADA],
        );
    }

    private async validarOrdenEditable(ideCpcop: number, dtoIn: HeaderParamsDto) {
        const cab = await this.dataSource.pool.query(
            `SELECT ide_cpeo FROM cxp_cab_orden_pago
              WHERE ide_cpcop = $1 AND ide_empr = $2 AND ide_sucu = $3`,
            [ideCpcop, dtoIn.ideEmpr, dtoIn.ideSucu],
        );
        if (!cab.rows.length) {
            throw new BadRequestException(`Orden de pago ${ideCpcop} no encontrada`);
        }
        if (Number(cab.rows[0].ide_cpeo) === IDE_CPEO_ANULADA) {
            throw new BadRequestException('La orden de pago está anulada.');
        }
    }

    /** Detalles del proveedor en la orden que aún no tienen pago (ni registrado ni asociado). */
    private async getLineasPendientes(
        ideCpcop: number,
        ideGeper: number,
        dtoIn: HeaderParamsDto,
    ): Promise<{ lineas: LineaPendiente[] }> {
        await this.validarOrdenEditable(ideCpcop, dtoIn);

        const result = await this.dataSource.pool.query(
            `SELECT det.ide_cpcdop,
                    det.ide_cpctr,
                    cf.numero_cpcfa,
                    COALESCE(det.valor_pagado_cpcdop, 0) AS planificado
               FROM cxp_det_orden_pago det
               JOIN cxp_cabece_transa ct ON ct.ide_cpctr = det.ide_cpctr
               LEFT JOIN cxp_cabece_factur cf ON cf.ide_cpcfa = ct.ide_cpcfa
              WHERE det.ide_cpcop = $1
                AND ct.ide_geper = $2
                AND det.activo_cpcdop = true
                AND det.ide_cpeo <> $3
                AND det.valor_pagado_banco_cpcdop IS NULL
                AND det.num_comprobante_cpcdop IS NULL
                AND cardinality(det.ide_teclb_asoc_cpcdop) = 0
              ORDER BY det.ide_cpcdop`,
            [ideCpcop, ideGeper, IDE_CPEO_PAGADA],
        );
        if (!result.rows.length) {
            throw new BadRequestException('El proveedor no tiene detalles pendientes de pago en esta orden.');
        }

        const lineas: LineaPendiente[] = result.rows.map((r) => ({
            ide_cpcdop: Number(r.ide_cpcdop),
            ide_cpctr: Number(r.ide_cpctr),
            numero_cpcfa: r.numero_cpcfa ?? null,
            planificado: round2(Number(r.planificado)),
        }));

        if (lineas.some((l) => !(l.planificado > 0))) {
            throw new BadRequestException('Hay detalles de la orden sin valor a pagar; no se pueden asociar pagos.');
        }
        if (new Set(lineas.map((l) => l.ide_cpctr)).size !== lineas.length) {
            throw new BadRequestException('La orden repite una misma cuenta por pagar; no se pueden asociar pagos.');
        }
        return { lineas };
    }

    /**
     * Movimientos elegibles sobre un conjunto de cuentas por pagar (ver getMovimientosAsociables).
     * `soloIds` limita el resultado (revalidación al asociar).
     */
    private async consultarMovimientos(ideCpctrList: number[], soloIds: number[] | null): Promise<MovimientoElegible[]> {
        const estadoNormal = Number(this.variables.get('p_tes_estado_lib_banco_normal'));

        const result = await this.dataSource.pool.query(
            `SELECT lb.ide_teclb,
                    lb.fecha_trans_teclb,
                    lb.numero_teclb,
                    lb.valor_teclb,
                    lb.observacion_teclb,
                    lb.ide_tecba,
                    lb.ide_tettb,
                    cb.nombre_tecba,
                    b.nombre_teban,
                    b.foto_teban,
                    b.color_teban,
                    ttb.nombre_tettb,
                    ic.foto_teincb                                                   AS foto,
                    SUM(dt.valor_cpdtr)                                              AS valor_aplicado,
                    jsonb_agg(jsonb_build_object('ide_cpctr', dt.ide_cpctr, 'valor', dt.valor_cpdtr)) AS aplicado_detalle
               FROM cxp_detall_transa dt
               JOIN cxp_tipo_transacc tt   ON tt.ide_cpttr = dt.ide_cpttr AND tt.signo_cpttr < 0
               JOIN tes_cab_libr_banc lb   ON lb.ide_teclb = dt.ide_teclb
               LEFT JOIN tes_cuenta_banco cb    ON cb.ide_tecba = lb.ide_tecba
               LEFT JOIN tes_banco b            ON b.ide_teban  = cb.ide_teban
               LEFT JOIN tes_tip_tran_banc ttb  ON ttb.ide_tettb = lb.ide_tettb
               LEFT JOIN LATERAL (
                    SELECT i.foto_teincb
                      FROM tes_info_comprobante_banco i
                     WHERE i.ide_teclb = lb.ide_teclb
                       AND i.foto_teincb IS NOT NULL
                     ORDER BY i.ide_teincb DESC
                     LIMIT 1
               ) ic ON true
              WHERE dt.ide_cpctr = ANY($1::int8[])
                AND dt.numero_pago_cpdtr > 0
                AND ($2::int8[] IS NULL OR lb.ide_teclb = ANY($2::int8[]))
                AND ($3::int IS NULL OR lb.ide_teelb = $3::int)
                AND NOT EXISTS (
                    SELECT 1 FROM cxp_det_orden_pago d2
                     WHERE lb.ide_teclb = ANY(d2.ide_teclb_asoc_cpcdop))
                AND NOT EXISTS (
                    SELECT 1 FROM cxp_det_orden_pago d3
                     WHERE d3.ide_cpctr = dt.ide_cpctr
                       AND d3.num_comprobante_cpcdop IS NOT NULL
                       AND d3.ide_tecba = lb.ide_tecba
                       AND d3.num_comprobante_cpcdop = lb.numero_teclb)
              GROUP BY lb.ide_teclb, lb.fecha_trans_teclb, lb.numero_teclb, lb.valor_teclb,
                       lb.observacion_teclb, lb.ide_tecba, lb.ide_tettb, cb.nombre_tecba,
                       b.nombre_teban, b.foto_teban, b.color_teban, ttb.nombre_tettb, ic.foto_teincb
              ORDER BY lb.fecha_trans_teclb DESC, lb.ide_teclb DESC`,
            [ideCpctrList, soloIds, Number.isFinite(estadoNormal) ? estadoNormal : null],
        );

        return result.rows.map((r) => ({
            ...r,
            ide_teclb: Number(r.ide_teclb),
            valor_teclb: Number(r.valor_teclb),
            valor_aplicado: round2(Number(r.valor_aplicado)),
            aplicado_detalle: (r.aplicado_detalle as Array<{ ide_cpctr: number; valor: number }>).map((d) => ({
                ide_cpctr: Number(d.ide_cpctr),
                valor: Number(d.valor),
            })),
        }));
    }
}
