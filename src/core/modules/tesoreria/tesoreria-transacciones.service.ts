import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { AsientosAutomaticosService } from 'src/core/modules/contabilidad/asientos-automaticos.service';
import { getCurrentDate, getCurrentTime } from 'src/util/helpers/date-util';

/** ide_tettb para cheque posfechado (hardcoded en el sistema legado) */
const IDE_TETTB_CHEQUE_POSFECHADO = 14;
/** ide_cpttr para cheque posfechado en CxP */
const IDE_CPTTR_CHEQUE_POSFECHADO = 19;

@Injectable()
export class TransaccionesTesoreriaService extends BaseService {
    private readonly logger = new Logger(TransaccionesTesoreriaService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly asientosAutomaticosService: AsientosAutomaticosService,
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
     * - Si el registro ya existe en cxp_detall_transa → actualiza ambas tablas (sin cambios,
     *   1 movimiento bancario por detalle, igual que antes de la consolidación).
     * - Si no existe (pago nuevo) → los detalles se AGRUPAN por "mismo pago físico"
     *   (mismo proveedor + cuenta + tipo de transacción + fecha + comprobante) y se crea UN
     *   solo movimiento en tes_cab_libr_banc por el valor TOTAL del grupo, distribuido en un
     *   registro de cxp_detall_transa por cada factura — igual criterio que el sistema legado
     *   (Java): el movimiento bancario es por el total pagado; en CxP se reparte para saldar
     *   cada factura, y la suma de esos detalles vuelve a dar el valor consolidado.
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
                ct.ide_geper,
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

        // Resuelve de antemano, por cada detalle, si YA existe un registro de pago
        // (numero_pago_cpdtr = 1) en cxp_detall_transa. Solo los que NO existen todavía entran
        // a la consolidación nueva — los que ya existen (edición de un pago previo, posiblemente
        // creado antes de esta consolidación) se actualizan uno por uno como siempre, para no
        // tocar/fusionar movimientos bancarios ya conciliados o contabilizados.
        const existentesPorDet = new Map<number, { ide_cpdtr: number; ide_teclb: number | null; ide_cnccc: number | null }>();
        for (const det of detalles) {
            const existeQuery = new SelectQuery(`
                SELECT det.ide_cpdtr, det.ide_teclb, lb.ide_cnccc
                FROM   cxp_detall_transa det
                LEFT JOIN tes_cab_libr_banc lb ON lb.ide_teclb = det.ide_teclb
                WHERE  det.ide_cpctr         = $1
                  AND  det.numero_pago_cpdtr = 1
                LIMIT  1
            `);
            existeQuery.addIntParam(1, det.ide_cpctr);
            const existe = await this.dataSource.createSingleQuery(existeQuery);
            if (existe) existentesPorDet.set(det.ide_cpcdop, existe);
        }

        /**
         * Genera/actualiza el asiento contable de UNA línea (best-effort: si falla, se registra
         * en el log y la línea queda con `ide_cnccc = null` — no bloquea el pago).
         * Se resuelve ANTES de insertar/actualizar tesorería/CxP (mismo orden que
         * CxpTransaccionesSaveService.savePagoCxP) para poder embeber el `ide_cnccc` ya
         * resuelto directamente en esos objetos, en vez de depender del `UPDATE ... WHERE
         * ide_cnccc IS NULL` interno de generarAsientoPagoCxP — que con varias líneas nuevas
         * compartiendo el mismo ide_teclb (todavía sin insertar ninguna) no podría distinguir
         * a cuál de ellas pertenece cada asiento.
         */
        const resolverAsiento = async (params: {
            ideTeclb: number;
            fecha: string;
            ideTecba: number;
            ideTettb: number;
            ideGeper: number;
            valor: number;
            observacion: string;
            ideCnccc: number | null;
        }): Promise<number | null> => {
            try {
                const datosAsiento = {
                    ideTeclb: params.ideTeclb,
                    fecha: params.fecha,
                    ideTecba: params.ideTecba,
                    ideTettb: params.ideTettb,
                    ideGeper: params.ideGeper,
                    valor: params.valor,
                    observacion: params.observacion,
                    ...dtoIn,
                };
                const result = params.ideCnccc
                    ? await this.asientosAutomaticosService.actualizarAsientoPagoCxP({
                        ...datosAsiento,
                        ideCnccc: params.ideCnccc,
                    })
                    : await this.asientosAutomaticosService.generarAsientoPagoCxP(datosAsiento);
                return result.generado ? (result.ide_cnccc ?? params.ideCnccc ?? null) : params.ideCnccc ?? null;
            } catch (error) {
                this.logger.warn(
                    `Error en asiento automático de pago de orden CxP para ide_teclb=${params.ideTeclb}: ${error}`,
                );
                return params.ideCnccc ?? null;
            }
        };

        // ─── DETALLES QUE YA TENÍAN UN PAGO REGISTRADO: actualizar uno por uno ────────────────
        // Tesorería + CxP se guardan en UN solo `core.save()` (mismo listQuery) para que ambas
        // escrituras corran en la MISMA transacción SQL (BEGIN/COMMIT/ROLLBACK vía
        // DataSourceService.createListQuery) — igual patrón que savePagoCxP/savePagoMultipleCxC.
        for (const det of detalles) {
            const existe = existentesPorDet.get(det.ide_cpcdop);
            if (!existe) continue;

            const esChequePosf = Number(det.ide_tettb) === IDE_TETTB_CHEQUE_POSFECHADO;
            const ide_cpttr = esChequePosf ? IDE_CPTTR_CHEQUE_POSFECHADO : ide_cpttr_pago;
            const fecha_venci_cpdtr = esChequePosf ? det.fecha_cheque_cpcdop : getCurrentDate();
            const numero = det.num_comprobante_cpcdop ?? '000000';
            const doc_relac = det.num_comprobante_cpcdop || det.num_documento_factura || '';
            // Una vez contabilizado, no se regenera el asiento al editar (evita uno duplicado/huérfano).
            const yaContabilizado = !!existe.ide_cnccc;

            // Si el registro CxP existe pero no tiene ide_teclb (creado antes sin libro banco),
            // hay que insertar en tes_cab_libr_banc; si ya tiene ide_teclb, actualizar.
            const ide_teclb_efectivo = existe.ide_teclb
                ?? await this.dataSource.getSeqTable('tes_cab_libr_banc', 'ide_teclb', 1, dtoIn.login);

            const ideCnccc = await resolverAsiento({
                ideTeclb: ide_teclb_efectivo,
                fecha: det.fecha_pago_cpcdop,
                ideTecba: det.ide_tecba,
                ideTettb: det.ide_tettb,
                ideGeper: det.ide_geper,
                valor: det.valor_pagado_banco_cpcdop,
                observacion: det.observacion_cpcdop || `Pago orden ${dtoIn.ide_cpcop}`,
                ideCnccc: yaContabilizado ? existe.ide_cnccc : null,
            });

            const listQuery: ObjectQueryDto[] = [
                existe.ide_teclb
                    ? {
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
                            ide_cnccc: ideCnccc,
                        },
                    }
                    : {
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
                            ide_cnccc: ideCnccc,
                        },
                    },
                {
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
                        ide_cnccc: ideCnccc,
                    },
                },
            ];
            await this.core.save({ ...dtoIn, listQuery, audit: false });

            results.push({
                ide_cpctr: det.ide_cpctr,
                ide_teclb: ide_teclb_efectivo,
                ide_cpdtr: existe.ide_cpdtr,
                operacion: 'update',
            });
        }

        // ─── DETALLES NUEVOS: agrupar por pago físico y consolidar en UN movimiento ───────────
        // El movimiento de tesorería (1) y TODAS las líneas CxP del grupo se guardan en un único
        // `core.save()` — una sola transacción SQL: o se registra el pago completo, o no queda
        // nada a medias.
        const detallesNuevos = detalles.filter((det) => !existentesPorDet.has(det.ide_cpcdop));
        const grupos = new Map<string, typeof detallesNuevos>();
        for (const det of detallesNuevos) {
            const clave = [det.ide_geper, det.ide_tecba, det.ide_tettb, det.fecha_pago_cpcdop, det.num_comprobante_cpcdop ?? '']
                .join('|');
            const grupo = grupos.get(clave);
            if (grupo) grupo.push(det);
            else grupos.set(clave, [det]);
        }

        for (const detsGrupo of grupos.values()) {
            const primero = detsGrupo[0];
            const valorTotalGrupo = detsGrupo.reduce((acc, d) => acc + Number(d.valor_pagado_banco_cpcdop), 0);
            const numero = primero.num_comprobante_cpcdop ?? '000000';

            const ide_teclb = await this.dataSource.getSeqTable('tes_cab_libr_banc', 'ide_teclb', 1, dtoIn.login);
            const baseIdeCpdtr = await this.dataSource.getSeqTable(
                'cxp_detall_transa', 'ide_cpdtr', detsGrupo.length, dtoIn.login,
            );

            // Un asiento contable POR FACTURA, resuelto antes de escribir (best-effort cada uno).
            const ideCnccPorDet: Array<number | null> = [];
            for (const det of detsGrupo) {
                ideCnccPorDet.push(
                    await resolverAsiento({
                        ideTeclb: ide_teclb,
                        fecha: det.fecha_pago_cpcdop,
                        ideTecba: det.ide_tecba,
                        ideTettb: det.ide_tettb,
                        ideGeper: det.ide_geper,
                        valor: det.valor_pagado_banco_cpcdop,
                        observacion: det.observacion_cpcdop || `Pago orden ${dtoIn.ide_cpcop}`,
                        ideCnccc: null,
                    }),
                );
            }

            const listQuery: ObjectQueryDto[] = [
                {
                    operation: 'insert',
                    module: 'tes',
                    tableName: 'cab_libr_banc',
                    primaryKey: 'ide_teclb',
                    object: {
                        ide_teclb,
                        ide_teelb,
                        ide_tecba: primero.ide_tecba,
                        ide_tettb: primero.ide_tettb,
                        valor_teclb: valorTotalGrupo,
                        numero_teclb: numero,
                        fecha_trans_teclb: primero.fecha_pago_cpcdop,
                        fecha_venci_teclb: primero.fecha_pago_cpcdop,
                        fec_cam_est_teclb: primero.fecha_pago_cpcdop,
                        beneficiari_teclb: primero.beneficiari_teclb,
                        observacion_teclb: primero.observacion_cpcdop ?? null,
                        conciliado_teclb: false,
                        num_comprobante_teclb: numero,
                        depositado_teclb: false,
                        devuelto_teclb: false,
                        hora_ingre: getCurrentTime(),
                        // La columna es única (un movimiento solo puede apuntar a un asiento):
                        // queda con el de la primera línea — el asiento real de cada factura vive
                        // en su propio cxp_detall_transa.ide_cnccc, seteado abajo individualmente.
                        ide_cnccc: ideCnccPorDet[0] ?? null,
                    },
                },
            ];

            // Distribuye el pago: un registro de cxp_detall_transa por factura, todos apuntando
            // al mismo ide_teclb consolidado — la suma de sus valor_cpdtr da valorTotalGrupo.
            detsGrupo.forEach((det, i) => {
                const esChequePosf = Number(det.ide_tettb) === IDE_TETTB_CHEQUE_POSFECHADO;
                const ide_cpttr = esChequePosf ? IDE_CPTTR_CHEQUE_POSFECHADO : ide_cpttr_pago;
                const fecha_venci_cpdtr = esChequePosf ? det.fecha_cheque_cpcdop : getCurrentDate();
                const doc_relac = det.num_comprobante_cpcdop || det.num_documento_factura || '';
                const ide_cpdtr = baseIdeCpdtr + i;

                listQuery.push({
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
                        ide_cnccc: ideCnccPorDet[i],
                    },
                });

                results.push({ ide_cpctr: det.ide_cpctr, ide_teclb, ide_cpdtr, operacion: 'insert' });
            });

            try {
                await this.core.save({ ...dtoIn, listQuery, audit: false });
            } catch (error) {
                // Los asientos ya se habían generado/confirmado (en su propia transacción) antes
                // de llegar acá - si el guardado de tesorería/CxP falla ahora, se revierten para
                // no dejar comprobantes contables huérfanos sin pago asociado.
                await Promise.all(
                    ideCnccPorDet
                        .filter((ideCnccc): ideCnccc is number => ideCnccc != null)
                        .map((ideCnccc) => this.asientosAutomaticosService.eliminarAsiento(ideCnccc, dtoIn)),
                );
                throw error;
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

