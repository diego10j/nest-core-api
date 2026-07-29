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

import { EnviarSriNotaCreditoDto } from './dto/enviar-sri-nota-credito.dto';
import { AnularNotaCreditoDto, DetalleNotaCreditoDto, SaveNotaCreditoDto } from './dto/save-nota-credito.dto';

const TABLE_NC_CAB = 'cxp_cabecera_nota';
const PK_NC_CAB = 'ide_cpcno';
const TABLE_NC_DET = 'cxp_detalle_nota';
const PK_NC_DET = 'ide_cpdno';
/** codDoc SRI de la factura (documento que la NC modifica), fijo (paridad legacy). */
const CODDOC_FACTURA = '01';
/** Estado "normal" / "anulado" de cxp_cabecera_nota.ide_cpeno (literal en el legacy, no hay variable de sistema). */
const IDE_CPENO_NORMAL = 1;
const IDE_CPENO_ANULADO = 0;
const TARIFA_IVA_DEFAULT = 15;

/**
 * Persistencia de la Nota de Crédito de venta (CxC). Migrado de pre_nota_credito.java +
 * ServicioCuentasCxC.generarTransaccionNotaCredito + ServicioComprobanteElectronico.
 * generarNotaCreditoElectronica (legacy sigafi-war/sigafi-ejb).
 *
 * Nota: las tablas cxp_cabecera_nota/cxp_detalle_nota son de VENTAS (CxC) pese al
 * prefijo "cxp_" — resabio histórico del esquema legacy, confirmado por uso real
 * (join con cxc_cabece_factura, gen_persona vía cliente, etc.), no un error de esta
 * migración.
 *
 * Simplificaciones deliberadas respecto al legacy (ver investigación de migración):
 *  - La NC siempre se aplica contra la transacción CxC de la PROPIA factura relacionada
 *    (equivalente a la "bandera 0" del legacy). El legacy también contemplaba redirigir
 *    el crédito a otra factura pendiente del cliente ("bandera 1") o crear saldo a favor
 *    sin factura ("bandera 2") cuando la factura ya estaba pagada — no se replica esa
 *    reasignación automática; si la factura ya está pagada, la NC simplemente dejará su
 *    saldo en negativo (crédito a favor del cliente, trazable a esa factura).
 *  - Kardex (reverso de inventario) y asiento contable NO se generan aquí: en el legacy
 *    tampoco se generan en el guardado (kardex depende del éxito del envío SRI vía un
 *    flujo separado; el asiento es un proceso batch mensual manual). Quedan pendientes
 *    como procesos posteriores, igual que en el legacy.
 */
@Injectable()
export class NotasCreditoSaveService extends BaseService {
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
                'p_con_tipo_documento_nota_credito',
                'p_cxc_tipo_trans_pago',
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
     * Crea una nota de crédito de venta: cabecera + detalle + comprobante SRI
     * pendiente (tipo 04) + aplicación contra la transacción CxC de la factura
     * relacionada, en una única transacción.
     */
    async saveNotaCredito(dtoIn: SaveNotaCreditoDto & HeaderParamsDto) {
        try {
            // ── Factura relacionada ─────────────────────────────────────────
            const qFactura = new SelectQuery(`
                SELECT cf.ide_cccfa, cf.ide_geper, cf.secuencial_cccfa, cf.total_cccfa,
                       cf.fecha_emisi_cccfa, cf.ide_ccdaf, d.establecimiento_ccdfa, d.pto_emision_ccdfa,
                       p.correo_geper, p.identificac_geper
                FROM cxc_cabece_factura cf
                INNER JOIN cxc_datos_fac d ON cf.ide_ccdaf = d.ide_ccdaf
                LEFT JOIN gen_persona p ON p.ide_geper = cf.ide_geper
                WHERE cf.ide_cccfa = $1 AND cf.ide_empr = $2 AND cf.ide_sucu = $3
            `);
            qFactura.addIntParam(1, dtoIn.ide_cccfa);
            qFactura.addIntParam(2, dtoIn.ideEmpr);
            qFactura.addIntParam(3, dtoIn.ideSucu);
            const factura = await this.dataSource.createSingleQuery(qFactura);
            if (!factura) {
                throw new BadRequestException(`La factura ide_cccfa=${dtoIn.ide_cccfa} no existe.`);
            }

            // ── Transacción CxC de la factura (a la que se aplica la NC) ────
            const qTrn = new SelectQuery(`SELECT ide_ccctr FROM cxc_cabece_transa WHERE ide_cccfa = $1 LIMIT 1`);
            qTrn.addIntParam(1, dtoIn.ide_cccfa);
            const trn = await this.dataSource.createSingleQuery(qTrn);
            if (!trn) {
                throw new BadRequestException('La factura no tiene transacción de cuenta por cobrar asociada.');
            }

            // ── Motivo ───────────────────────────────────────────────────────
            const qMotivo = new SelectQuery(`SELECT nombre_cpmno FROM cxp_motivo_nota WHERE ide_cpmno = $1`);
            qMotivo.addIntParam(1, dtoIn.ide_cpmno);
            const motivo = await this.dataSource.createSingleQuery(qMotivo);
            if (!motivo) {
                throw new BadRequestException(`El motivo ide_cpmno=${dtoIn.ide_cpmno} no existe.`);
            }

            // ── Detalle (copiado de la factura si no se envía) ──────────────
            const detalles = dtoIn.detalles?.length ? dtoIn.detalles : await this.copiarDetalleFactura(dtoIn.ide_cccfa);
            if (!detalles.length) {
                throw new BadRequestException('Debe ingresar al menos un detalle a la nota de crédito');
            }

            const fechaEmision = toPgDate(dtoIn.fecha_emisi_cpcno) || getCurrentDate();
            const tarifaIva = isDefined(dtoIn.tarifa_iva_cpcno) ? Number(dtoIn.tarifa_iva_cpcno) : TARIFA_IVA_DEFAULT;
            const totales = this.calcularTotales(detalles, tarifaIva);
            if (totales.total <= 0) {
                throw new BadRequestException('El valor de la nota de crédito debe ser mayor a cero');
            }

            // ── Secuenciales ─────────────────────────────────────────────────
            const ideCpcno = await this.dataSource.getSeqTable(TABLE_NC_CAB, PK_NC_CAB, 1, dtoIn.login);
            const baseIdeCpdno = await this.dataSource.getSeqTable(TABLE_NC_DET, PK_NC_DET, detalles.length, dtoIn.login);
            const ideCcdtr = await this.dataSource.getSeqTable('cxc_detall_transa', 'ide_ccdtr', 1, dtoIn.login);

            // ── Comprobante electrónico SRI (tipo 04, siempre) ──────────────
            const emisor = await this.emisorService.getEmisor(dtoIn);
            const estab = String(factura.establecimiento_ccdfa);
            const ptoEmi = String(factura.pto_emision_ccdfa);
            const numDocModificado = `${estab}-${ptoEmi}-${String(factura.secuencial_cccfa).padStart(9, '0')}`;

            const built = await this.sriComprobanteCabeceraService.buildInsertPendiente(
                {
                    ideEmpr: dtoIn.ideEmpr,
                    ideSucu: dtoIn.ideSucu,
                    login: dtoIn.login,
                    ip: dtoIn.ip,
                    ideSresc: EstadoComprobanteEnum.PENDIENTE.codigo,
                    ideCntdo: this.getVar('p_con_tipo_documento_nota_credito'),
                    ideGeper: Number(factura.ide_geper),
                    coddoc: '04',
                    fechaEmision,
                    estab,
                    ptoEmi,
                    subtotal0: totales.baseTarifa0,
                    baseGrabada: totales.baseGrabada,
                    iva: totales.iva,
                    total: totales.total,
                    identificacion: factura.identificac_geper ?? '',
                    correo: dtoIn.correo_cpcno ?? factura.correo_geper,
                    motivo: motivo.nombre_cpmno,
                    coddocModificado: CODDOC_FACTURA,
                    numDocModificado,
                    fechaEmisionDocSustento: toPgDate(factura.fecha_emisi_cccfa) ?? fechaEmision,
                    valorModificacion: Number(factura.total_cccfa),
                },
                emisor,
            );
            const numeroNc = `${estab}${ptoEmi}${built.secuencial}`;

            // ── Construcción de la transacción ───────────────────────────────
            const listQuery: Query[] = [];

            const insCab = new InsertQuery(TABLE_NC_CAB, PK_NC_CAB, dtoIn);
            insCab.values.set(PK_NC_CAB, ideCpcno);
            insCab.values.set('ide_cccfa', dtoIn.ide_cccfa);
            insCab.values.set('ide_geper', factura.ide_geper);
            insCab.values.set('ide_ccdaf', dtoIn.ide_ccdaf);
            insCab.values.set('ide_cpmno', dtoIn.ide_cpmno);
            insCab.values.set('ide_cndfp', dtoIn.ide_cndfp);
            insCab.values.set('ide_cpeno', IDE_CPENO_NORMAL);
            insCab.values.set('fecha_emisi_cpcno', fechaEmision);
            insCab.values.set('fecha_trans_cpcno', getCurrentDate());
            insCab.values.set('numero_cpcno', numeroNc);
            insCab.values.set('num_doc_mod_cpcno', numDocModificado);
            insCab.values.set('fecha_emision_mod_cpcno', factura.fecha_emisi_cccfa);
            insCab.values.set('valor_mod_cpcno', factura.total_cccfa);
            insCab.values.set('base_grabada_cpcno', totales.baseGrabada);
            insCab.values.set('base_tarifa0_cpcno', totales.baseTarifa0);
            insCab.values.set('base_no_objeto_iva_cpcno', totales.baseNoObjeto);
            insCab.values.set('valor_iva_cpcno', totales.iva);
            insCab.values.set('total_cpcno', totales.total);
            insCab.values.set('tarifa_iva_cpcno', tarifaIva);
            insCab.values.set('observacion_cpcno', dtoIn.observacion_cpcno ?? null);
            insCab.values.set('correo_cpcno', dtoIn.correo_cpcno ?? null);
            insCab.values.set('ide_cntdo', this.getVar('p_con_tipo_documento_nota_credito'));
            insCab.values.set('ide_srcom', built.ideSrcom);
            insCab.values.set('fecha_ingre', getCurrentDate());
            insCab.values.set('hora_ingre', getCurrentTime());
            listQuery.push(insCab);
            listQuery.push(built.query);

            detalles.forEach((det, idx) => {
                const insDet = new InsertQuery(TABLE_NC_DET, PK_NC_DET, dtoIn);
                insDet.values.set(PK_NC_DET, baseIdeCpdno + idx);
                insDet.values.set(PK_NC_CAB, ideCpcno);
                insDet.values.set('ide_inarti', det.ide_inarti);
                insDet.values.set('ide_inuni', det.ide_inuni ?? null);
                insDet.values.set('cantidad_cpdno', det.cantidad_cpdno);
                insDet.values.set('precio_cpdno', det.precio_cpdno);
                insDet.values.set('valor_cpdno', this.valorDetalle(det));
                insDet.values.set('iva_inarti_cpdno', det.iva_inarti_cpdno);
                insDet.values.set('observacion_cpdno', det.observacion_cpdno ?? null);
                insDet.values.set('fecha_ingre', getCurrentDate());
                insDet.values.set('hora_ingre', getCurrentTime());
                listQuery.push(insDet);
            });

            // Aplica la NC contra la transacción CxC de la propia factura (reduce el saldo)
            const insTrnDet = new InsertQuery('cxc_detall_transa', 'ide_ccdtr', dtoIn);
            insTrnDet.values.set('ide_ccdtr', ideCcdtr);
            insTrnDet.values.set('ide_cccfa', dtoIn.ide_cccfa);
            insTrnDet.values.set('ide_ccctr', Number(trn.ide_ccctr));
            insTrnDet.values.set('ide_ccttr', this.getVar('p_cxc_tipo_trans_pago'));
            insTrnDet.values.set('ide_usua', dtoIn.ideUsua);
            insTrnDet.values.set('valor_ccdtr', totales.total);
            insTrnDet.values.set('observacion_ccdtr', `V/. NOTA DE CREDITO N. ${numeroNc}`);
            insTrnDet.values.set('numero_pago_ccdtr', 0);
            insTrnDet.values.set('fecha_trans_ccdtr', fechaEmision);
            insTrnDet.values.set('fecha_venci_ccdtr', fechaEmision);
            insTrnDet.values.set('docum_relac_ccdtr', numeroNc);
            insTrnDet.values.set('fecha_ingre', getCurrentDate());
            insTrnDet.values.set('hora_ingre', getCurrentTime());
            listQuery.push(insTrnDet);

            await this.dataSource.createListQuery(listQuery);

            // Si el saldo de la factura queda en cero o menos, se marca como pagada (paridad saveCobroCxC)
            await this.actualizarPagadoSiCorresponde(dtoIn.ide_cccfa);

            // El guardado NO envía automáticamente al SRI: el envío es bajo demanda vía
            // enviarSRI(ide_cpcno), que encola (firma + recepción + autorización + correo).
            return {
                message: 'ok',
                ide_cpcno: ideCpcno,
                ide_cccfa: dtoIn.ide_cccfa,
                numero_cpcno: numeroNc,
                total_cpcno: totales.total,
                clave_acceso_sri: built.claveAcceso,
            };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar la nota de crédito: ${msg}`);
        }
    }

    /**
     * Envía bajo demanda una nota de crédito electrónica al SRI: resuelve su clave de acceso
     * y la encola (firma + recepción + autorización); al autorizarse se envía el correo con
     * PDF+XML automáticamente (ComprobanteAutorizadoEmitter / ComprobanteEmailListener).
     */
    async enviarSRI(dtoIn: EnviarSriNotaCreditoDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT s.claveacceso_srcom
            FROM ${TABLE_NC_CAB} a
            INNER JOIN sri_comprobante s ON a.ide_srcom = s.ide_srcom
            WHERE a.ide_cpcno = $1
        `);
        query.addIntParam(1, dtoIn.ide_cpcno);
        const row = await this.dataSource.createSingleQuery(query);
        if (!row?.claveacceso_srcom) {
            throw new BadRequestException(`La nota de crédito ide_cpcno=${dtoIn.ide_cpcno} no existe.`);
        }
        this.sriEnvioQueueService.encolar(row.claveacceso_srcom, dtoIn);
        return { message: 'ok', ide_cpcno: dtoIn.ide_cpcno, clave_acceso_sri: row.claveacceso_srcom };
    }

    /**
     * Anula una nota de crédito: cambia su estado y el del comprobante SRI si
     * seguía PENDIENTE, y revierte la aplicación en la transacción CxC.
     */
    async anularNotaCredito(dtoIn: AnularNotaCreditoDto & HeaderParamsDto) {
        const qNc = new SelectQuery(`SELECT ide_cpcno, ide_cccfa, ide_srcom, numero_cpcno FROM ${TABLE_NC_CAB} WHERE ide_cpcno = $1`);
        qNc.addIntParam(1, dtoIn.ide_cpcno);
        const nc = await this.dataSource.createSingleQuery(qNc);
        if (!nc) {
            throw new BadRequestException(`La nota de crédito ide_cpcno=${dtoIn.ide_cpcno} no existe.`);
        }

        const listQuery: Query[] = [];

        const updNc = new UpdateQuery(TABLE_NC_CAB, PK_NC_CAB, dtoIn);
        updNc.values.set('ide_cpeno', IDE_CPENO_ANULADO);
        updNc.where = 'ide_cpcno = $1';
        updNc.addIntParam(1, dtoIn.ide_cpcno);
        listQuery.push(updNc);

        const delTrn = new DeleteQuery('cxc_detall_transa');
        delTrn.where = 'ide_cccfa = $1 AND docum_relac_ccdtr = $2';
        delTrn.addIntParam(1, Number(nc.ide_cccfa));
        delTrn.addStringParam(2, nc.numero_cpcno);
        listQuery.push(delTrn);

        if (nc.ide_srcom) {
            const updSri = new UpdateQuery('sri_comprobante', 'ide_srcom');
            updSri.values.set('ide_sresc', EstadoComprobanteEnum.ANULADO.codigo);
            updSri.where = `ide_srcom = ${Number(nc.ide_srcom)} AND ide_sresc = ${EstadoComprobanteEnum.PENDIENTE.codigo}`;
            listQuery.push(updSri);
        }

        await this.dataSource.createListQuery(listQuery);
        await this.actualizarPagadoSiCorresponde(Number(nc.ide_cccfa));

        return { message: 'ok', ide_cpcno: dtoIn.ide_cpcno, ide_cccfa: nc.ide_cccfa };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS PRIVADOS
    // ─────────────────────────────────────────────────────────────────────────

    private valorDetalle(det: DetalleNotaCreditoDto): number {
        return Number((Number(det.cantidad_cpdno) * Number(det.precio_cpdno)).toFixed(2));
    }

    private calcularTotales(detalles: DetalleNotaCreditoDto[], tarifaIva: number) {
        let baseGrabada = 0;
        let baseTarifa0 = 0;
        let baseNoObjeto = 0;
        for (const det of detalles) {
            const valor = this.valorDetalle(det);
            if (det.iva_inarti_cpdno === '1') baseGrabada += valor;
            else if (det.iva_inarti_cpdno === '-1') baseTarifa0 += valor;
            else baseNoObjeto += valor;
        }
        const iva = Number(((baseGrabada * tarifaIva) / 100).toFixed(2));
        const total = Number((baseGrabada + baseTarifa0 + baseNoObjeto + iva).toFixed(2));
        return { baseGrabada, baseTarifa0, baseNoObjeto, iva, total };
    }

    private async copiarDetalleFactura(ideCccfa: number): Promise<DetalleNotaCreditoDto[]> {
        const query = new SelectQuery(`
            SELECT c.ide_inarti, c.ide_inuni, cantidad_ccdfa, precio_ccdfa, iva_inarti_ccdfa, observacion_ccdfa
            FROM cxc_deta_factura c
            WHERE c.ide_cccfa = $1
        `);
        query.addIntParam(1, ideCccfa);
        const res = await this.dataSource.createSelectQuery(query);
        return res.map((r: any) => ({
            ide_inarti: Number(r.ide_inarti),
            ide_inuni: r.ide_inuni ? Number(r.ide_inuni) : undefined,
            cantidad_cpdno: Number(r.cantidad_ccdfa),
            precio_cpdno: Number(r.precio_ccdfa),
            iva_inarti_cpdno: Number(r.iva_inarti_ccdfa) === 1 ? '1' : '-1',
            observacion_cpdno: r.observacion_ccdfa ?? undefined,
        }));
    }

    private async actualizarPagadoSiCorresponde(ideCccfa: number): Promise<void> {
        const qSaldo = new SelectQuery(`
            SELECT COALESCE(SUM(dt.valor_ccdtr * tt.signo_ccttr), 0) AS saldo
            FROM cxc_cabece_transa ct
            LEFT JOIN cxc_detall_transa dt ON dt.ide_ccctr = ct.ide_ccctr
            LEFT JOIN cxc_tipo_transacc tt ON tt.ide_ccttr = dt.ide_ccttr
            WHERE ct.ide_cccfa = $1
        `);
        qSaldo.addIntParam(1, ideCccfa);
        const row = await this.dataSource.createSingleQuery(qSaldo);
        const saldo = Number(row?.saldo ?? 0);

        const upd = new UpdateQuery('cxc_cabece_factura', 'ide_cccfa');
        upd.values.set('pagado_cccfa', saldo <= 0);
        upd.where = `ide_cccfa = ${ideCccfa}`;
        await this.dataSource.createQuery(upd);
    }
}
