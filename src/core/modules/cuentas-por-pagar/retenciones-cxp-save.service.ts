import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { DeleteQuery, InsertQuery, Query, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { EmisorService } from 'src/core/modules/sri/cel/emisor.service';
import { EstadoComprobanteEnum } from 'src/core/modules/sri/cel/enum/estado-comprobante.enum';
import { SriComprobanteCabeceraService } from 'src/core/modules/sri/cel/sri-comprobante-cabecera.service';
import { SriEnvioQueueService } from 'src/core/modules/sri/envio/sri-envio-queue.service';
import { isDefined } from 'src/util/helpers/common-util';
import { getCurrentDate, getCurrentTime, toPgDate } from 'src/util/helpers/date-util';

import { EnviarSriRetencionCxPDto } from './dto/enviar-sri-retencion-cxp.dto';
import {
    AnularRetencionCxPDto,
    DetalleRetencionCxPDto,
    EditarRetencionCxPDto,
    SaveRetencionCxPDto,
} from './dto/save-retencion-cxp.dto';

const TABLE_RET_CAB = 'con_cabece_retenc';
const PK_RET_CAB = 'ide_cncre';
const TABLE_RET_DET = 'con_detall_retenc';
const PK_RET_DET = 'ide_cndre';
/** con_tipo_document.ide_cntdo para "Comprobante de Retención" (mismo valor ya usado en retenciones-cxp.service.ts). */
const IDE_CNTDO_RETENCION = 8;

/**
 * Persistencia del comprobante de retención en compras. Al guardar genera la
 * transacción de retención en la cuenta por pagar del documento y vincula la
 * retención a la factura. Migrado de Retencion.guardar() +
 * ServicioCuentasCxP.generarTransaccionRetencion del legacy.
 */
@Injectable()
export class RetencionesCxPSaveService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly emisorService: EmisorService,
        private readonly sriComprobanteCabeceraService: SriComprobanteCabeceraService,
        private readonly sriEnvioQueueService: SriEnvioQueueService,
    ) {
        super();
        this.core
            .getVariables([
                'p_con_estado_comprobante_rete_normal',
                'p_con_estado_comprobante_rete_anulado',
                'p_cxp_tipo_trans_retencion',
                'p_cxp_estado_factura_normal',
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    private getVar(name: string): number {
        const val = this.variables.get(name);
        if (!isDefined(val)) {
            throw new InternalServerErrorException(
                `Variable del sistema '${name}' no configurada. Contacte al administrador.`,
            );
        }
        return Number(val);
    }

    /**
     * Crea el comprobante de retención de un documento CxP en una única
     * transacción: con_cabece_retenc + con_detall_retenc + transacción CxP de
     * retención + vínculo del documento (ide_cncre)
     */
    async saveRetencion(dtoIn: SaveRetencionCxPDto & HeaderParamsDto) {
        try {
            const { detalles } = dtoIn;
            if (!detalles || detalles.length === 0) {
                throw new BadRequestException('Debe ingresar detalles al comprobante de retención');
            }

            // ── Documento ────────────────────────────────────────────────────
            const qDoc = new SelectQuery(`
                SELECT ide_cpcfa, ide_geper, numero_cpcfa, fecha_trans_cpcfa,
                       base_grabada_cpcfa, base_tarifa0_cpcfa, base_no_objeto_iva_cpcfa,
                       valor_iva_cpcfa, ide_cncre, ide_cnccc, ide_cpefa
                FROM cxp_cabece_factur
                WHERE ide_cpcfa = $1
            `);
            qDoc.addIntParam(1, dtoIn.ide_cpcfa);
            const doc = await this.dataSource.createSingleQuery(qDoc);
            if (!doc) throw new BadRequestException(`El documento ide_cpcfa=${dtoIn.ide_cpcfa} no existe.`);
            if (doc.ide_cncre) {
                throw new BadRequestException('El documento ya tiene un comprobante de retención registrado.');
            }
            if (Number(doc.ide_cpefa) !== this.getVar('p_cxp_estado_factura_normal')) {
                throw new BadRequestException('No se puede registrar la retención de un documento anulado.');
            }

            // ── Validaciones y totales ───────────────────────────────────────
            const fechaEmision = toPgDate(dtoIn.fecha_emisi_cncre) || getCurrentDate();
            await this.validarRetencion(dtoIn, doc, detalles);

            const totalRetencion = Number(
                detalles.reduce((sum, d) => sum + this.valorDetalle(d), 0).toFixed(2),
            );

            // Cabecera de transacción CxP del documento (donde se registra la retención)
            const qTrn = new SelectQuery(`
                SELECT ide_cpctr FROM cxp_cabece_transa WHERE ide_cpcfa = $1 LIMIT 1
            `);
            qTrn.addIntParam(1, dtoIn.ide_cpcfa);
            const trn = await this.dataSource.createSingleQuery(qTrn);
            if (!trn && totalRetencion > 0) {
                throw new BadRequestException('El documento no tiene transacción de cuenta por pagar asociada.');
            }

            // ── Secuenciales ─────────────────────────────────────────────────
            const ideCncre = await this.dataSource.getSeqTable(TABLE_RET_CAB, PK_RET_CAB, 1, dtoIn.login);
            const baseIdeCndre = await this.dataSource.getSeqTable(TABLE_RET_DET, PK_RET_DET, detalles.length, dtoIn.login);
            const ideCpdtr = totalRetencion > 0
                ? await this.dataSource.getSeqTable('cxp_detall_transa', 'ide_cpdtr', 1, dtoIn.login)
                : null;

            // ── Comprobante electrónico SRI ────────────────────────────────────
            // Solo cuando NO es retención física (numero_cncre/autorizacion_cncre
            // vienen del usuario). Genera la cabecera sri_comprobante PENDIENTE con
            // su propio secuencial + clave de acceso, que reemplazan numero_cncre/
            // autorizacion_cncre de la retención.
            let claveAccesoSri: string | undefined;
            let numeroRetencionSri: string | undefined;
            let sriHeaderQuery: InsertQuery | undefined;
            const esElectronica = !dtoIn.numero_cncre && !dtoIn.autorizacion_cncre;
            if (esElectronica) {
                if (!dtoIn.ide_ccdaf) {
                    throw new BadRequestException(
                        'Debe seleccionar el punto de emisión (ide_ccdaf) para la retención electrónica.',
                    );
                }
                const qSerie = new SelectQuery(`SELECT serie_ccdaf FROM cxc_datos_fac WHERE ide_ccdaf = $1`);
                qSerie.addIntParam(1, dtoIn.ide_ccdaf);
                const serieRow = await this.dataSource.createSingleQuery(qSerie);
                if (!serieRow?.serie_ccdaf) {
                    throw new BadRequestException(`No existe el punto de emisión ide_ccdaf=${dtoIn.ide_ccdaf}`);
                }
                const serie = String(serieRow.serie_ccdaf);
                const estab = serie.slice(0, 3);
                const ptoEmi = serie.slice(3, 6);

                const qProveedor = new SelectQuery(`SELECT identificac_geper, correo_geper FROM gen_persona WHERE ide_geper = $1`);
                qProveedor.addIntParam(1, Number(doc.ide_geper));
                const proveedor = await this.dataSource.createSingleQuery(qProveedor);

                const emisor = await this.emisorService.getEmisor(dtoIn);
                const fechaEmisionStr = String(fechaEmision);
                const periodoFiscal = `${fechaEmisionStr.slice(5, 7)}/${fechaEmisionStr.slice(0, 4)}`;

                const built = await this.sriComprobanteCabeceraService.buildInsertPendiente(
                    {
                        ideEmpr: dtoIn.ideEmpr,
                        ideSucu: dtoIn.ideSucu,
                        login: dtoIn.login,
                        ip: dtoIn.ip,
                        ideSresc: EstadoComprobanteEnum.PENDIENTE.codigo,
                        ideCntdo: IDE_CNTDO_RETENCION,
                        ideGeper: Number(doc.ide_geper),
                        coddoc: '07',
                        fechaEmision: fechaEmisionStr,
                        estab,
                        ptoEmi,
                        subtotal0: 0,
                        baseGrabada: 0,
                        iva: 0,
                        total: totalRetencion,
                        identificacion: proveedor?.identificac_geper ?? '',
                        correo: dtoIn.correo_cncre ?? proveedor?.correo_geper,
                        periodoFiscal,
                    },
                    emisor,
                );
                sriHeaderQuery = built.query;
                claveAccesoSri = built.claveAcceso;
                numeroRetencionSri = `${serie}${built.secuencial}`;
            }

            // ── Construcción de la transacción ───────────────────────────────
            const listQuery: Query[] = [];

            const insCab = new InsertQuery(TABLE_RET_CAB, PK_RET_CAB, dtoIn);
            insCab.values.set(PK_RET_CAB, ideCncre);
            insCab.values.set('ide_cnere', this.getVar('p_con_estado_comprobante_rete_normal'));
            insCab.values.set('es_venta_cncre', false);
            insCab.values.set('fecha_emisi_cncre', fechaEmision);
            insCab.values.set('numero_cncre', numeroRetencionSri ?? dtoIn.numero_cncre ?? null);
            insCab.values.set('autorizacion_cncre', claveAccesoSri ?? dtoIn.autorizacion_cncre ?? null);
            insCab.values.set(
                'observacion_cncre',
                dtoIn.observacion_cncre ?? `Retención Factura N. ${doc.numero_cpcfa}`,
            );
            insCab.values.set('correo_cncre', dtoIn.correo_cncre ?? null);
            insCab.values.set('ide_ccdaf', dtoIn.ide_ccdaf ?? null);
            insCab.values.set('fecha_ingre', getCurrentDate());
            insCab.values.set('hora_ingre', getCurrentTime());
            listQuery.push(insCab);
            if (sriHeaderQuery) {
                listQuery.push(sriHeaderQuery);
            }

            detalles.forEach((det, idx) => {
                const insDet = new InsertQuery(TABLE_RET_DET, PK_RET_DET, dtoIn);
                insDet.values.set(PK_RET_DET, baseIdeCndre + idx);
                insDet.values.set(PK_RET_CAB, ideCncre);
                insDet.values.set('ide_cncim', det.ide_cncim);
                insDet.values.set('porcentaje_cndre', det.porcentaje_cndre);
                insDet.values.set('base_cndre', det.base_cndre);
                insDet.values.set('valor_cndre', this.valorDetalle(det));
                insDet.values.set('fecha_ingre', getCurrentDate());
                insDet.values.set('hora_ingre', getCurrentTime());
                listQuery.push(insDet);
            });

            // Transacción CxP de retención (disminuye el saldo por pagar)
            if (totalRetencion > 0 && trn && ideCpdtr !== null) {
                const insTrn = new InsertQuery('cxp_detall_transa', 'ide_cpdtr', dtoIn);
                insTrn.values.set('ide_cpdtr', ideCpdtr);
                insTrn.values.set('ide_cpctr', Number(trn.ide_cpctr));
                insTrn.values.set('ide_cpcfa', dtoIn.ide_cpcfa);
                insTrn.values.set('ide_cpttr', this.getVar('p_cxp_tipo_trans_retencion'));
                insTrn.values.set('ide_usua', dtoIn.ideUsua);
                insTrn.values.set('fecha_trans_cpdtr', doc.fecha_trans_cpcfa ?? getCurrentDate());
                insTrn.values.set('fecha_venci_cpdtr', doc.fecha_trans_cpcfa ?? getCurrentDate());
                insTrn.values.set('valor_cpdtr', totalRetencion);
                insTrn.values.set('observacion_cpdtr', `V/. RETENCIÓN FACTURA N. ${doc.numero_cpcfa}`);
                insTrn.values.set('numero_pago_cpdtr', 0);
                insTrn.values.set('docum_relac_cpdtr', doc.numero_cpcfa);
                insTrn.values.set('ide_cnccc', doc.ide_cnccc ?? null);
                insTrn.values.set('valor_anticipo_cpdtr', 0);
                insTrn.values.set('fecha_ingre', getCurrentDate());
                insTrn.values.set('hora_ingre', getCurrentTime());
                listQuery.push(insTrn);
            }

            // Vincular la retención al documento
            const updDoc = new UpdateQuery('cxp_cabece_factur', 'ide_cpcfa', dtoIn);
            updDoc.values.set('ide_cncre', ideCncre);
            updDoc.where = 'ide_cpcfa = $1';
            updDoc.addIntParam(1, dtoIn.ide_cpcfa);
            listQuery.push(updDoc);

            await this.dataSource.createListQuery(listQuery);

            // El guardado NO envía automáticamente al SRI: el envío es bajo demanda vía
            // enviarSRI(ide_cncre), que encola (firma + recepción + autorización + correo).
            return {
                message: 'ok',
                ide_cncre: ideCncre,
                ide_cpcfa: dtoIn.ide_cpcfa,
                total_retencion: totalRetencion,
                clave_acceso_sri: claveAccesoSri,
            };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar la retención: ${msg}`);
        }
    }

    /**
     * Envía bajo demanda un comprobante de retención electrónico al SRI: resuelve su clave de
     * acceso y la encola (firma + recepción + autorización); al autorizarse se envía el correo
     * con PDF+XML automáticamente (ComprobanteAutorizadoEmitter / ComprobanteEmailListener).
     */
    async enviarSRI(dtoIn: EnviarSriRetencionCxPDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT s.claveacceso_srcom
            FROM con_cabece_retenc r
            INNER JOIN sri_comprobante s ON r.ide_srcom = s.ide_srcom
            WHERE r.ide_cncre = $1
        `);
        query.addIntParam(1, dtoIn.ide_cncre);
        const row = await this.dataSource.createSingleQuery(query);
        if (!row?.claveacceso_srcom) {
            throw new BadRequestException(
                `El comprobante de retención ide_cncre=${dtoIn.ide_cncre} no es electrónico o no existe.`,
            );
        }
        this.sriEnvioQueueService.encolar(row.claveacceso_srcom, dtoIn);
        return { message: 'ok', ide_cncre: dtoIn.ide_cncre, clave_acceso_sri: row.claveacceso_srcom };
    }

    /**
     * Anula un comprobante de retención: cambia su estado, desvincula el
     * documento y elimina la transacción CxP de retención para restituir el
     * saldo por pagar
     */
    async anularRetencion(dtoIn: AnularRetencionCxPDto & HeaderParamsDto) {
        const qRet = new SelectQuery(`
            SELECT r.ide_cncre, r.ide_cnere, s.ide_sresc
            FROM ${TABLE_RET_CAB} r
            LEFT JOIN sri_comprobante s ON r.ide_srcom = s.ide_srcom
            WHERE r.ide_cncre = $1
        `);
        qRet.addIntParam(1, dtoIn.ide_cncre);
        const retencion = await this.dataSource.createSingleQuery(qRet);
        if (!retencion) {
            throw new BadRequestException(`El comprobante de retención ide_cncre=${dtoIn.ide_cncre} no existe.`);
        }
        if (Number(retencion.ide_cnere) === this.getVar('p_con_estado_comprobante_rete_anulado')) {
            throw new BadRequestException('El comprobante de retención ya está anulado.');
        }
        if (Number(retencion.ide_sresc) === EstadoComprobanteEnum.AUTORIZADO.codigo && !dtoIn.confirmar_autorizado) {
            throw new BadRequestException(
                'El comprobante ya fue autorizado por el SRI. Anular aquí solo desvincula el registro local: '
                + 'el documento electrónico sigue siendo válido ante el SRI y su baja formal debe tramitarse '
                + 'por separado (proceso de "baja de comprobantes" del SRI). Confirme explícitamente para continuar.',
            );
        }

        const qDoc = new SelectQuery(`
            SELECT ide_cpcfa FROM cxp_cabece_factur WHERE ide_cncre = $1 LIMIT 1
        `);
        qDoc.addIntParam(1, dtoIn.ide_cncre);
        const doc = await this.dataSource.createSingleQuery(qDoc);

        const listQuery: Query[] = [];

        const updRet = new UpdateQuery(TABLE_RET_CAB, PK_RET_CAB, dtoIn);
        updRet.values.set('ide_cnere', this.getVar('p_con_estado_comprobante_rete_anulado'));
        updRet.where = 'ide_cncre = $1';
        updRet.addIntParam(1, dtoIn.ide_cncre);
        listQuery.push(updRet);

        if (doc?.ide_cpcfa) {
            const updDoc = new UpdateQuery('cxp_cabece_factur', 'ide_cpcfa', dtoIn);
            updDoc.values.set('ide_cncre', null);
            updDoc.where = 'ide_cpcfa = $1';
            updDoc.addIntParam(1, Number(doc.ide_cpcfa));
            listQuery.push(updDoc);

            const delTrn = new DeleteQuery('cxp_detall_transa');
            delTrn.where = 'ide_cpcfa = $1 AND ide_cpttr = $2 AND numero_pago_cpdtr = 0';
            delTrn.addIntParam(1, Number(doc.ide_cpcfa));
            delTrn.addIntParam(2, this.getVar('p_cxp_tipo_trans_retencion'));
            listQuery.push(delTrn);
        }

        await this.dataSource.createListQuery(listQuery);
        return { message: 'ok', ide_cncre: dtoIn.ide_cncre, ide_cpcfa: doc?.ide_cpcfa ?? null };
    }

    /**
     * Edita un comprobante de retención ya guardado. Migrado de
     * pre_modificar_retencion.java (legacy): reemplaza con_detall_retenc y recalcula la
     * transacción CxP de retención asociada.
     *
     * Reglas:
     * - No se puede editar un comprobante anulado.
     * - No se puede editar un comprobante electrónico ya AUTORIZADO por el SRI (el documento
     *   fiscal ya está emitido; para corregirlo hay que anular y generar uno nuevo).
     * - En un comprobante electrónico aún no autorizado, solo se permiten cambios cosméticos
     *   (fecha, observación, correo) - no se aceptan cambios de `detalles` porque el total ya
     *   quedó fijado en la cabecera `sri_comprobante` PENDIENTE al crearlo.
     * - En retención física, se permite editar todo (incluyendo número/autorización y detalles),
     *   siempre que la transacción CxP de retención no haya sido aplicada a un pago.
     */
    async editarRetencion(dtoIn: EditarRetencionCxPDto & HeaderParamsDto) {
        try {
            const qRet = new SelectQuery(`
                SELECT r.ide_cncre, r.ide_cnere, r.numero_cncre, r.autorizacion_cncre, r.ide_srcom,
                       s.ide_sresc,
                       d.ide_cpcfa, d.numero_cpcfa, d.fecha_trans_cpcfa, d.ide_cnccc,
                       d.base_grabada_cpcfa, d.base_tarifa0_cpcfa, d.base_no_objeto_iva_cpcfa, d.valor_iva_cpcfa
                FROM ${TABLE_RET_CAB} r
                LEFT JOIN sri_comprobante s ON r.ide_srcom = s.ide_srcom
                INNER JOIN cxp_cabece_factur d ON d.ide_cncre = r.ide_cncre
                WHERE r.ide_cncre = $1
            `);
            qRet.addIntParam(1, dtoIn.ide_cncre);
            const ret = await this.dataSource.createSingleQuery(qRet);
            if (!ret) {
                throw new BadRequestException(`El comprobante de retención ide_cncre=${dtoIn.ide_cncre} no existe.`);
            }
            if (Number(ret.ide_cnere) === this.getVar('p_con_estado_comprobante_rete_anulado')) {
                throw new BadRequestException('No se puede editar un comprobante de retención anulado.');
            }

            const esElectronica = isDefined(ret.ide_srcom);
            if (esElectronica && Number(ret.ide_sresc) === EstadoComprobanteEnum.AUTORIZADO.codigo) {
                throw new BadRequestException(
                    'El comprobante ya fue autorizado por el SRI y no puede editarse. Anule el comprobante y '
                    + 'registre uno nuevo con los valores correctos.',
                );
            }

            const listQuery: Query[] = [];
            const updCab = new UpdateQuery(TABLE_RET_CAB, PK_RET_CAB, dtoIn);
            if (isDefined(dtoIn.fecha_emisi_cncre)) {
                updCab.values.set('fecha_emisi_cncre', toPgDate(dtoIn.fecha_emisi_cncre));
            }
            if (isDefined(dtoIn.observacion_cncre)) updCab.values.set('observacion_cncre', dtoIn.observacion_cncre);
            if (isDefined(dtoIn.correo_cncre)) updCab.values.set('correo_cncre', dtoIn.correo_cncre);
            updCab.values.set('usuario_actua', dtoIn.login);
            updCab.values.set('fecha_actua', getCurrentDate());
            updCab.values.set('hora_actua', getCurrentTime());

            if (esElectronica) {
                // Comprobante electrónico aún no autorizado: solo cambios cosméticos, nunca
                // el detalle (el total ya quedó fijado en sri_comprobante PENDIENTE).
                if (dtoIn.detalles?.length || dtoIn.numero_cncre || dtoIn.autorizacion_cncre) {
                    throw new BadRequestException(
                        'Un comprobante de retención electrónico no admite cambios de detalle/valores ni de '
                        + 'número/autorización. Anule el comprobante y registre uno nuevo si necesita cambiar montos.',
                    );
                }
                updCab.where = 'ide_cncre = $1';
                updCab.addIntParam(1, dtoIn.ide_cncre);
                await this.dataSource.createQuery(updCab);
                return { message: 'ok', ide_cncre: dtoIn.ide_cncre, ide_cpcfa: Number(ret.ide_cpcfa) };
            }

            // ── Retención física: edición completa ──────────────────────────────
            if (!dtoIn.detalles?.length) {
                throw new BadRequestException('Debe ingresar detalles al comprobante de retención');
            }

            // La transacción de retención no debe haber sido aplicada a un pago
            const qPagada = new SelectQuery(`
                SELECT 1 AS existe FROM cxp_detall_transa
                WHERE ide_cpcfa = $1 AND ide_cpttr = $2 AND numero_pago_cpdtr <> 0
                LIMIT 1
            `);
            qPagada.addIntParam(1, Number(ret.ide_cpcfa));
            qPagada.addIntParam(2, this.getVar('p_cxp_tipo_trans_retencion'));
            const pagada = await this.dataSource.createSingleQuery(qPagada);
            if (pagada) {
                throw new BadRequestException(
                    'No se puede editar: la retención ya fue aplicada a un pago. Reverse el pago primero.',
                );
            }

            if (dtoIn.numero_cncre || dtoIn.autorizacion_cncre) {
                if (!dtoIn.numero_cncre) throw new BadRequestException('Debe ingresar el número de retención');
                if (!dtoIn.autorizacion_cncre) {
                    throw new BadRequestException('Debe ingresar el número de autorización de la retención');
                }
                const qDup = new SelectQuery(`
                    SELECT 1 AS existe FROM ${TABLE_RET_CAB}
                    WHERE autorizacion_cncre = $1 AND numero_cncre = $2 AND ide_cncre <> $3
                    LIMIT 1
                `);
                qDup.addStringParam(1, dtoIn.autorizacion_cncre);
                qDup.addStringParam(2, dtoIn.numero_cncre);
                qDup.addIntParam(3, dtoIn.ide_cncre);
                const dup = await this.dataSource.createSingleQuery(qDup);
                if (dup) throw new BadRequestException('El número de retención ya existe');
                updCab.values.set('numero_cncre', dtoIn.numero_cncre);
                updCab.values.set('autorizacion_cncre', dtoIn.autorizacion_cncre);
            }

            await this.validarCuadreBases(ret, dtoIn.detalles, dtoIn.validar_totales);

            const totalRetencion = Number(
                dtoIn.detalles.reduce((sum, d) => sum + this.valorDetalle(d), 0).toFixed(2),
            );

            updCab.where = 'ide_cncre = $1';
            updCab.addIntParam(1, dtoIn.ide_cncre);
            listQuery.push(updCab);

            const delDet = new DeleteQuery(TABLE_RET_DET);
            delDet.where = 'ide_cncre = $1';
            delDet.addIntParam(1, dtoIn.ide_cncre);
            listQuery.push(delDet);

            const baseIdeCndre = await this.dataSource.getSeqTable(TABLE_RET_DET, PK_RET_DET, dtoIn.detalles.length, dtoIn.login);
            dtoIn.detalles.forEach((det, idx) => {
                const insDet = new InsertQuery(TABLE_RET_DET, PK_RET_DET, dtoIn);
                insDet.values.set(PK_RET_DET, baseIdeCndre + idx);
                insDet.values.set(PK_RET_CAB, dtoIn.ide_cncre);
                insDet.values.set('ide_cncim', det.ide_cncim);
                insDet.values.set('porcentaje_cndre', det.porcentaje_cndre);
                insDet.values.set('base_cndre', det.base_cndre);
                insDet.values.set('valor_cndre', this.valorDetalle(det));
                insDet.values.set('fecha_ingre', getCurrentDate());
                insDet.values.set('hora_ingre', getCurrentTime());
                listQuery.push(insDet);
            });

            const delTrn = new DeleteQuery('cxp_detall_transa');
            delTrn.where = 'ide_cpcfa = $1 AND ide_cpttr = $2 AND numero_pago_cpdtr = 0';
            delTrn.addIntParam(1, Number(ret.ide_cpcfa));
            delTrn.addIntParam(2, this.getVar('p_cxp_tipo_trans_retencion'));
            listQuery.push(delTrn);

            if (totalRetencion > 0) {
                const qTrn = new SelectQuery(`SELECT ide_cpctr FROM cxp_cabece_transa WHERE ide_cpcfa = $1`);
                qTrn.addIntParam(1, Number(ret.ide_cpcfa));
                const trn = await this.dataSource.createSingleQuery(qTrn);
                if (!trn) throw new BadRequestException('El documento no tiene transacción de cuenta por pagar asociada.');

                const ideCpdtr = await this.dataSource.getSeqTable('cxp_detall_transa', 'ide_cpdtr', 1, dtoIn.login);
                const insTrn = new InsertQuery('cxp_detall_transa', 'ide_cpdtr', dtoIn);
                insTrn.values.set('ide_cpdtr', ideCpdtr);
                insTrn.values.set('ide_cpctr', Number(trn.ide_cpctr));
                insTrn.values.set('ide_cpcfa', Number(ret.ide_cpcfa));
                insTrn.values.set('ide_cpttr', this.getVar('p_cxp_tipo_trans_retencion'));
                insTrn.values.set('ide_usua', dtoIn.ideUsua);
                insTrn.values.set('fecha_trans_cpdtr', ret.fecha_trans_cpcfa ?? getCurrentDate());
                insTrn.values.set('fecha_venci_cpdtr', ret.fecha_trans_cpcfa ?? getCurrentDate());
                insTrn.values.set('valor_cpdtr', totalRetencion);
                insTrn.values.set('observacion_cpdtr', `V/. RETENCIÓN FACTURA N. ${ret.numero_cpcfa} (editada)`);
                insTrn.values.set('numero_pago_cpdtr', 0);
                insTrn.values.set('docum_relac_cpdtr', ret.numero_cpcfa);
                insTrn.values.set('ide_cnccc', ret.ide_cnccc ?? null);
                insTrn.values.set('valor_anticipo_cpdtr', 0);
                insTrn.values.set('fecha_ingre', getCurrentDate());
                insTrn.values.set('hora_ingre', getCurrentTime());
                listQuery.push(insTrn);
            }

            await this.dataSource.createListQuery(listQuery);
            return { message: 'ok', ide_cncre: dtoIn.ide_cncre, ide_cpcfa: Number(ret.ide_cpcfa), total_retencion: totalRetencion };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al editar la retención: ${msg}`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS PRIVADOS
    // ─────────────────────────────────────────────────────────────────────────

    private valorDetalle(det: DetalleRetencionCxPDto): number {
        if (isDefined(det.valor_cndre)) return Number(Number(det.valor_cndre).toFixed(2));
        return Number(((Number(det.base_cndre) * Number(det.porcentaje_cndre)) / 100).toFixed(2));
    }

    private async validarRetencion(
        dtoIn: SaveRetencionCxPDto & HeaderParamsDto,
        doc: any,
        detalles: DetalleRetencionCxPDto[],
    ) {
        // Retención física: número y autorización obligatorios + anti-duplicado
        if (dtoIn.numero_cncre || dtoIn.autorizacion_cncre) {
            if (!dtoIn.numero_cncre) {
                throw new BadRequestException('Debe ingresar el número de retención');
            }
            if (!dtoIn.autorizacion_cncre) {
                throw new BadRequestException('Debe ingresar el número de autorización de la retención');
            }
            const qDup = new SelectQuery(`
                SELECT 1 AS existe FROM ${TABLE_RET_CAB}
                WHERE autorizacion_cncre = $1 AND numero_cncre = $2
                LIMIT 1
            `);
            qDup.addStringParam(1, dtoIn.autorizacion_cncre);
            qDup.addStringParam(2, dtoIn.numero_cncre);
            const dup = await this.dataSource.createSingleQuery(qDup);
            if (dup) throw new BadRequestException('El número de retención ya existe');
        }

        // Cuadre de bases contra el documento (con_cabece_impues.ide_cnimp = 1 → renta)
        if (dtoIn.validar_totales === false) return;
        await this.validarCuadreBases(doc, detalles);
    }

    /** Cuadre de bases imponibles del detalle de retención contra el documento origen. */
    private async validarCuadreBases(
        doc: any,
        detalles: DetalleRetencionCxPDto[],
        validarTotales?: boolean,
    ) {
        if (validarTotales === false) return;

        const ids = [...new Set(detalles.map((d) => d.ide_cncim))];
        const qImp = new SelectQuery(`
            SELECT ide_cncim, ide_cnimp FROM con_cabece_impues WHERE ide_cncim = ANY($1)
        `);
        qImp.addParam(1, ids);
        const impuestos = await this.dataSource.createSelectQuery(qImp);
        const esRenta = new Map<number, boolean>(
            impuestos.map((r: any) => [Number(r.ide_cncim), Number(r.ide_cnimp) === 1]),
        );

        let sumaBaseRenta = 0;
        let sumaBaseIva = 0;
        for (const det of detalles) {
            if (esRenta.get(Number(det.ide_cncim))) sumaBaseRenta += Number(det.base_cndre);
            else sumaBaseIva += Number(det.base_cndre);
        }

        const baseRentaDoc = Number(doc.base_grabada_cpcfa || 0)
            + Number(doc.base_tarifa0_cpcfa || 0)
            + Number(doc.base_no_objeto_iva_cpcfa || 0);
        const baseIvaDoc = Number(doc.valor_iva_cpcfa || 0);

        if (Math.abs(sumaBaseRenta - baseRentaDoc) > 0.01) {
            throw new BadRequestException(
                `La suma de la base imponible de impuesto a la RENTA (${sumaBaseRenta.toFixed(2)}) debe ser igual a ${baseRentaDoc.toFixed(2)}`,
            );
        }
        if (sumaBaseIva > 0 && Math.abs(sumaBaseIva - baseIvaDoc) > 0.01) {
            throw new BadRequestException(
                `La suma de la base imponible de impuesto IVA (${sumaBaseIva.toFixed(2)}) debe ser igual a ${baseIvaDoc.toFixed(2)}`,
            );
        }
    }
}
