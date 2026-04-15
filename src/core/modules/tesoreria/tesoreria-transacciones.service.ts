import { BadRequestException, Injectable } from '@nestjs/common';

import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { getCurrentDate, getCurrentTime } from 'src/util/helpers/date-util';

/** ide_tettb para cheque posfechado (hardcoded en el sistema legado) */
const IDE_TETTB_CHEQUE_POSFECHADO = 14;
/** ide_cpttr para cheque posfechado en CxP */
const IDE_CPTTR_CHEQUE_POSFECHADO = 19;

@Injectable()
export class TransaccionesTesoreriaService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        // Carga variables del sistema al iniciar el servicio
        this.core
            .getVariables([
                'p_tes_estado_lib_banco_normal', // Estado normal del libro de banco
                'p_cxp_tipo_trans_pago',         // Tipo de transacción PAGO en CxP
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    /**
     * Guarda o actualiza el movimiento de banco (tes_cab_libr_banc) y la
     * transacción de CxP (cxp_detall_transa) para cada detalle activo de
     * una orden de pago.
     * - Si el registro ya existe en cxp_detall_transa → actualiza ambas tablas.
     * - Si no existe → inserta en tes_cab_libr_banc y luego en cxp_detall_transa.
     * @param dtoIn ide_cpcop + ide_cpcdop_list (ids de detalles pagados) + parámetros de cabecera
     */
    async saveTransaccionOrdenPagoCxP(
        dtoIn: { ide_cpcop: number; ide_cpcdop_list: number[] } & HeaderParamsDto,
    ) {
        const ide_teelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));
        const ide_cpttr_pago = Number(this.variables.get('p_cxp_tipo_trans_pago'));

        // Obtiene solo los detalles que se están pagando en esta solicitud
        const detallesQuery = new SelectQuery(`
            SELECT
                det.ide_cpcdop,
                det.ide_cpctr,
                det.ide_tecba,
                det.ide_tettb,
                det.fecha_pago_cpcdop,
                det.num_comprobante_cpcdop,
                det.valor_pagado_banco_cpcdop,
                det.observacion_cpcdop,
                det.fecha_cheque_cpcdop,
                ct.ide_cpcfa,
                COALESCE(p.nom_geper, '')      AS beneficiari_teclb,
                COALESCE(cf.numero_cpcfa, '')  AS num_documento_factura
            FROM  cxp_det_orden_pago  det
            JOIN  cxp_cabece_transa   ct  ON ct.ide_cpctr  = det.ide_cpctr
            LEFT JOIN cxp_cabece_factur cf ON cf.ide_cpcfa  = ct.ide_cpcfa
            LEFT JOIN gen_persona        p  ON p.ide_geper   = ct.ide_geper
            WHERE det.ide_cpcop     = $1
              AND det.activo_cpcdop = true
              AND det.ide_cpcdop    = ANY($2)
        `);
        detallesQuery.addIntParam(1, dtoIn.ide_cpcop);
        detallesQuery.addArrayNumberParam(2, dtoIn.ide_cpcdop_list);
        const detalles = await this.dataSource.createSelectQuery(detallesQuery);

        const results: Array<{
            ide_cpctr: number;
            ide_teclb: number;
            ide_cpdtr: number;
            operacion: 'insert' | 'update';
        }> = [];

        for (const det of detalles) {
            const esChequePosf = Number(det.ide_tettb) === IDE_TETTB_CHEQUE_POSFECHADO;
            const ide_cpttr = esChequePosf ? IDE_CPTTR_CHEQUE_POSFECHADO : ide_cpttr_pago;
            const fecha_venci_cpdtr = esChequePosf ? det.fecha_cheque_cpcdop : getCurrentDate();
            const numero = det.num_comprobante_cpcdop ?? '000000';
            const doc_relac = det.num_comprobante_cpcdop || det.num_documento_factura || '';

            // Busca el registro de PAGO (numero_pago_cpdtr = 1) para este ide_cpctr.
            // El registro de la factura original NO se toca; solo se trabaja con el de pago.
            const existeQuery = new SelectQuery(`
                SELECT ide_cpdtr, ide_teclb
                FROM   cxp_detall_transa
                WHERE  ide_cpctr         = $1
                  AND  numero_pago_cpdtr = 1
                LIMIT  1
            `);
            existeQuery.addIntParam(1, det.ide_cpctr);
            const existe = await this.dataSource.createSingleQuery(existeQuery);

            if (existe) {
                // ─── UPDATE ──────────────────────────────────────────────────────────

                // Si el registro CxP existe pero no tiene ide_teclb (creado antes sin libro banco),
                // hay que insertar en tes_cab_libr_banc; si ya tiene ide_teclb, actualizar.
                let ide_teclb_efectivo: number;

                if (existe.ide_teclb) {
                    // Actualiza el movimiento existente en el libro de banco
                    const tesUpd: ObjectQueryDto = {
                        operation: 'update',
                        module: 'tes',
                        tableName: 'cab_libr_banc',
                        primaryKey: 'ide_teclb',
                        object: {
                            ide_teclb: existe.ide_teclb,
                            ide_teelb,
                            ide_tecba: det.ide_tecba,
                            ide_tettb: det.ide_tettb,
                            valor_teclb: det.valor_pagado_banco_cpcdop,
                            numero_teclb: numero,
                            fecha_trans_teclb: det.fecha_pago_cpcdop,
                            fecha_venci_teclb: det.fecha_pago_cpcdop,
                            fec_cam_est_teclb: det.fecha_pago_cpcdop,
                            beneficiari_teclb: det.beneficiari_teclb,
                            observacion_teclb: det.observacion_cpcdop ?? null,
                            conciliado_teclb: false,
                            num_comprobante_teclb: numero,
                            depositado_teclb: false,
                            devuelto_teclb: false,
                        },
                    };
                    await this.core.save({ ...dtoIn, listQuery: [tesUpd], audit: false });
                    ide_teclb_efectivo = existe.ide_teclb;
                } else {
                    // No hay movimiento bancario previo → crear uno nuevo
                    ide_teclb_efectivo = await this.dataSource.getSeqTable(
                        'tes_cab_libr_banc',
                        'ide_teclb',
                        1,
                        dtoIn.login,
                    );
                    const tesIns: ObjectQueryDto = {
                        operation: 'insert',
                        module: 'tes',
                        tableName: 'cab_libr_banc',
                        primaryKey: 'ide_teclb',
                        object: {
                            ide_teclb: ide_teclb_efectivo,
                            ide_teelb,
                            ide_tecba: det.ide_tecba,
                            ide_tettb: det.ide_tettb,
                            valor_teclb: det.valor_pagado_banco_cpcdop,
                            numero_teclb: numero,
                            fecha_trans_teclb: det.fecha_pago_cpcdop,
                            fecha_venci_teclb: det.fecha_pago_cpcdop,
                            fec_cam_est_teclb: det.fecha_pago_cpcdop,
                            beneficiari_teclb: det.beneficiari_teclb,
                            observacion_teclb: det.observacion_cpcdop ?? null,
                            conciliado_teclb: false,
                            num_comprobante_teclb: numero,
                            depositado_teclb: false,
                            devuelto_teclb: false,
                            hora_ingre: getCurrentTime(),
                        },
                    };
                    await this.core.save({ ...dtoIn, listQuery: [tesIns], audit: false });
                }

                // Actualiza la transacción en CxP con el ide_teclb resuelto
                const cxpUpd: ObjectQueryDto = {
                    operation: 'update',
                    module: 'cxp',
                    tableName: 'detall_transa',
                    primaryKey: 'ide_cpdtr',
                    object: {
                        ide_cpdtr: existe.ide_cpdtr,
                        ide_teclb: ide_teclb_efectivo,
                        ide_cpcfa: det.ide_cpcfa ?? null,
                        ide_usua: dtoIn.ideUsua,
                        ide_cpttr,
                        ide_cpctr: det.ide_cpctr,
                        fecha_trans_cpdtr: det.fecha_pago_cpcdop,
                        fecha_venci_cpdtr,
                        valor_cpdtr: det.valor_pagado_banco_cpcdop,
                        observacion_cpdtr: det.observacion_cpcdop ?? null,
                        docum_relac_cpdtr: doc_relac,
                    },
                };
                await this.core.save({ ...dtoIn, listQuery: [cxpUpd], audit: false });

                results.push({
                    ide_cpctr: det.ide_cpctr,
                    ide_teclb: ide_teclb_efectivo,
                    ide_cpdtr: existe.ide_cpdtr,
                    operacion: 'update',
                });
            } else {
                // ─── INSERT ──────────────────────────────────────────────────────────

                // Inserta el movimiento en el libro de banco
                const ide_teclb = await this.dataSource.getSeqTable(
                    'tes_cab_libr_banc',
                    'ide_teclb',
                    1,
                    dtoIn.login,
                );
                const tesIns: ObjectQueryDto = {
                    operation: 'insert',
                    module: 'tes',
                    tableName: 'cab_libr_banc',
                    primaryKey: 'ide_teclb',
                    object: {
                        ide_teclb,
                        ide_teelb,
                        ide_tecba: det.ide_tecba,
                        ide_tettb: det.ide_tettb,
                        valor_teclb: det.valor_pagado_banco_cpcdop,
                        numero_teclb: numero,
                        fecha_trans_teclb: det.fecha_pago_cpcdop,
                        fecha_venci_teclb: det.fecha_pago_cpcdop,
                        fec_cam_est_teclb: det.fecha_pago_cpcdop,
                        beneficiari_teclb: det.beneficiari_teclb,
                        observacion_teclb: det.observacion_cpcdop ?? null,
                        conciliado_teclb: false,
                        num_comprobante_teclb: numero,
                        depositado_teclb: false,
                        devuelto_teclb: false,
                        hora_ingre: getCurrentTime(),
                    },
                };
                await this.core.save({ ...dtoIn, listQuery: [tesIns], audit: false });

                // Inserta la transacción en CxP con numero_pago = 1 (primer pago)
                const ide_cpdtr = await this.dataSource.getSeqTable(
                    'cxp_detall_transa',
                    'ide_cpdtr',
                    1,
                    dtoIn.login,
                );
                const cxpIns: ObjectQueryDto = {
                    operation: 'insert',
                    module: 'cxp',
                    tableName: 'detall_transa',
                    primaryKey: 'ide_cpdtr',
                    object: {
                        ide_cpdtr,
                        ide_teclb,
                        ide_cpcfa: det.ide_cpcfa ?? null,
                        ide_usua: dtoIn.ideUsua,
                        ide_cpttr,
                        ide_cpctr: det.ide_cpctr,
                        fecha_trans_cpdtr: det.fecha_pago_cpcdop,
                        fecha_venci_cpdtr,
                        valor_cpdtr: det.valor_pagado_banco_cpcdop,
                        observacion_cpdtr: det.observacion_cpcdop ?? null,
                        numero_pago_cpdtr: 1,
                        docum_relac_cpdtr: doc_relac,
                        hora_ingre: getCurrentTime(),
                    },
                };
                await this.core.save({ ...dtoIn, listQuery: [cxpIns], audit: false });

                results.push({ ide_cpctr: det.ide_cpctr, ide_teclb, ide_cpdtr, operacion: 'insert' });
            }
        }
        console.log('Resultados de transacciones guardadas/actualizadas:', results);
        return { message: 'ok', rowCount: results.length, results };
    }

    /**
     * Revierte las transacciones bancarias (tes_cab_libr_banc) y de CxP (cxp_detall_transa)
     * de todos los detalles PAGADOS de una orden de pago al anularla.
     * Lanza excepción si algún movimiento bancario ya fue contabilizado (tiene ide_cnccc).
     */
    async anularTransaccionesOrdenPagoCxP(ide_cpcop: number, login: string): Promise<void> {
        // 1. Obtener detalles pagados (ide_cpeo = 3) de la orden
        const pagadosQuery = new SelectQuery(`
            SELECT ide_cpctr
            FROM   cxp_det_orden_pago
            WHERE  ide_cpcop = $1
              AND  ide_cpeo  = 3
        `);
        pagadosQuery.addIntParam(1, ide_cpcop);
        const pagados = await this.dataSource.createSelectQuery(pagadosQuery);

        if (pagados.length === 0) return;

        // 2. Para cada detalle pagado, localizar el registro de pago en cxp_detall_transa
        const transacciones: Array<{ ide_cpdtr: number; ide_teclb: number | null }> = [];

        for (const det of pagados) {
            const transQuery = new SelectQuery(`
                SELECT ide_cpdtr, ide_teclb
                FROM   cxp_detall_transa
                WHERE  ide_cpctr         = $1
                  AND  numero_pago_cpdtr = 1
                LIMIT  1
            `);
            transQuery.addIntParam(1, det.ide_cpctr);
            const trans = await this.dataSource.createSingleQuery(transQuery);
            if (trans) {
                transacciones.push({ ide_cpdtr: trans.ide_cpdtr, ide_teclb: trans.ide_teclb });
            }
        }

        // 3. Verificar PRIMERO que ningún movimiento bancario haya sido contabilizado
        for (const t of transacciones) {
            if (!t.ide_teclb) continue;
            const libroQuery = new SelectQuery(`
                SELECT ide_cnccc
                FROM   tes_cab_libr_banc
                WHERE  ide_teclb = $1
            `);
            libroQuery.addIntParam(1, t.ide_teclb);
            const libro = await this.dataSource.createSingleQuery(libroQuery);
            if (libro?.ide_cnccc) {
                throw new BadRequestException(
                    'La orden de pago tiene detalles que han sido contabilizados y no se puede anular',
                );
            }
        }

        // 4. Eliminar: primero cxp_detall_transa (FK → tes_cab_libr_banc), luego tes_cab_libr_banc
        for (const t of transacciones) {
            await this.dataSource.pool.query(
                `DELETE FROM cxp_detall_transa WHERE ide_cpdtr = $1`,
                [t.ide_cpdtr],
            );
            if (t.ide_teclb) {
                await this.dataSource.pool.query(
                    `DELETE FROM tes_cab_libr_banc WHERE ide_teclb = $1`,
                    [t.ide_teclb],
                );
            }
        }

        // 5. Limpiar los campos de pago en TODOS los detalles de la orden y
        //    restablecer el estado a GENERADA (1)
        await this.dataSource.pool.query(
            `UPDATE cxp_det_orden_pago
             SET    ide_cpeo                  = 1,
                    ide_tecba                 = NULL,
                    ide_tettb                 = NULL,
                    valor_pagado_banco_cpcdop = NULL,
                    saldo_pendiente_cpcdop    = NULL,
                    num_comprobante_cpcdop    = NULL,
                    fecha_pago_cpcdop         = NULL,
                    fecha_cheque_cpcdop       = NULL,
                    observacion_cpcdop        = NULL,
                    foto_cpcdop               = NULL,
                    usuario_actua             = $2,
                    hora_actua                = NOW()
             WHERE  ide_cpcop = $1`,
            [ide_cpcop, login],
        );
    }

}

