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
import { UpdateNotaCreditoDto } from './dto/update-nota-credito.dto';

const TABLE_NC_CAB = 'cxp_cabecera_nota';
const PK_NC_CAB = 'ide_cpcno';
const TABLE_NC_DET = 'cxp_detalle_nota';
const PK_NC_DET = 'ide_cpdno';
const TABLE_TRN_CAB = 'cxc_cabece_transa';
const PK_TRN_CAB = 'ide_ccctr';
const TABLE_TRN_DET = 'cxc_detall_transa';
const PK_TRN_DET = 'ide_ccdtr';
const TABLE_INV_CAB = 'inv_cab_comp_inve';
const PK_INV_CAB = 'ide_incci';
const TABLE_INV_DET = 'inv_det_comp_inve';
const PK_INV_DET = 'ide_indci';
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
                'p_gen_tipo_identif_consumidor_final',
                'p_inv_estado_normal',
                'p_inv_tipo_transaccion_devolucion_venta',
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
                       cf.fecha_emisi_cccfa, cf.ide_ccdaf, cf.pagado_cccfa, cf.ide_sucu,
                       d.establecimiento_ccdfa, d.pto_emision_ccdfa,
                       p.correo_geper, p.identificac_geper, p.ide_getid,
                       sc.ide_sresc
                FROM cxc_cabece_factura cf
                INNER JOIN cxc_datos_fac d ON cf.ide_ccdaf = d.ide_ccdaf
                LEFT JOIN gen_persona p ON p.ide_geper = cf.ide_geper
                LEFT JOIN sri_comprobante sc ON sc.ide_srcom = cf.ide_srcom
                WHERE cf.ide_cccfa = $1 AND cf.ide_empr = $2 AND cf.ide_sucu = $3
            `);
            qFactura.addIntParam(1, dtoIn.ide_cccfa);
            qFactura.addIntParam(2, dtoIn.ideEmpr);
            qFactura.addIntParam(3, dtoIn.ideSucu);
            const factura = await this.dataSource.createSingleQuery(qFactura);
            if (!factura) {
                throw new BadRequestException(`La factura ide_cccfa=${dtoIn.ide_cccfa} no existe.`);
            }

            // ── Reglas normativas SRI ────────────────────────────────────────
            // 1) No se puede emitir NC contra una factura NO autorizada por el SRI
            //    (pendiente, rechazada, no autorizada o anulada): el documento sustento
            //    debe existir legalmente antes de poder modificarlo.
            if (Number(factura.ide_sresc) !== EstadoComprobanteEnum.AUTORIZADO.codigo) {
                throw new BadRequestException(
                    'No se puede emitir una nota de crédito sobre una factura que no está autorizada por el SRI.',
                );
            }
            // 2) No se puede emitir NC contra una factura de "Consumidor Final": el
            //    comprador debe estar plenamente identificado (RUC/cédula/pasaporte)
            //    para que proceda una modificación del comprobante (normativa SRI).
            const ideGetidConsumidorFinal = this.getVar('p_gen_tipo_identif_consumidor_final');
            if (Number(factura.ide_getid) === ideGetidConsumidorFinal) {
                throw new BadRequestException(
                    'No se puede emitir una nota de crédito sobre una factura emitida a Consumidor Final.',
                );
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

            // 3) La nota de crédito (sumada a otras NC vigentes ya emitidas contra la
            //    misma factura, tipo ANULACION o DEVOLUCION) no puede superar el valor
            //    facturado — no se puede acreditar más de lo que se vendió.
            const qNotasPrevias = new SelectQuery(`
                SELECT COALESCE(SUM(total_cpcno), 0) AS total_notas_previas
                FROM cxp_cabecera_nota
                WHERE ide_cccfa = $1 AND ide_empr = $2 AND ide_cpeno = $3
            `);
            qNotasPrevias.addIntParam(1, dtoIn.ide_cccfa);
            qNotasPrevias.addIntParam(2, dtoIn.ideEmpr);
            qNotasPrevias.addIntParam(3, IDE_CPENO_NORMAL);
            const notasPrevias = await this.dataSource.createSingleQuery(qNotasPrevias);
            const totalNotasPrevias = Number(notasPrevias?.total_notas_previas ?? 0);
            const TOLERANCIA = 0.01;
            if (totalNotasPrevias + totales.total > Number(factura.total_cccfa) + TOLERANCIA) {
                const disponible = Math.max(0, Number(factura.total_cccfa) - totalNotasPrevias);
                throw new BadRequestException(
                    `La nota de crédito ($${totales.total.toFixed(2)}) supera el valor disponible de la factura ` +
                        `($${disponible.toFixed(2)} de $${Number(factura.total_cccfa).toFixed(2)}` +
                        (totalNotasPrevias > 0 ? `, ya se emitieron $${totalNotasPrevias.toFixed(2)} en notas previas` : '') +
                        `).`,
                );
            }

            // ── Kardex: solo artículos con hace_kardex_inarti = true ────────
            const detallesConKardex = await this.getDetallesConKardex(detalles);
            const tieneKardex = detallesConKardex.length > 0;

            // La factura ya estaba pagada ANTES de esta NC: el crédito no puede reducir
            // el saldo de una transacción que ya está en cero — se crea una transacción
            // CxC nueva e independiente (saldo a favor del cliente), no ligada a
            // trn.ide_ccctr (la transacción original, ya saldada).
            const facturaYaPagada = Boolean(factura.pagado_cccfa);

            // ── Secuenciales ─────────────────────────────────────────────────
            const ideCpcno = await this.dataSource.getSeqTable(TABLE_NC_CAB, PK_NC_CAB, 1, dtoIn.login);
            const baseIdeCpdno = await this.dataSource.getSeqTable(TABLE_NC_DET, PK_NC_DET, detalles.length, dtoIn.login);
            const ideCcdtr = await this.dataSource.getSeqTable(TABLE_TRN_DET, PK_TRN_DET, 1, dtoIn.login);
            const ideCcctrNuevo = facturaYaPagada
                ? await this.dataSource.getSeqTable(TABLE_TRN_CAB, PK_TRN_CAB, 1, dtoIn.login)
                : null;
            const ideBodega = tieneKardex ? await this.getBodegaSucursal(dtoIn.ideSucu) : 0;
            const ideIncci = tieneKardex ? await this.dataSource.getSeqTable(TABLE_INV_CAB, PK_INV_CAB, 1, dtoIn.login) : null;
            const baseIdeIndci = tieneKardex
                ? await this.dataSource.getSeqTable(TABLE_INV_DET, PK_INV_DET, detallesConKardex.length, dtoIn.login)
                : null;

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
            // Solo el secuencial (paridad legacy: "Nota de Crédito N.° 000000027", sin
            // prefijo de establecimiento/punto de emisión como en el número de factura).
            const numeroNc = built.secuencial;

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
            insCab.values.set('descuento_cpcno', totales.descuento);
            insCab.values.set('tarifa_iva_cpcno', tarifaIva);
            insCab.values.set('observacion_cpcno', dtoIn.observacion_cpcno ?? null);
            insCab.values.set('correo_cpcno', dtoIn.correo_cpcno ?? null);
            insCab.values.set('ide_cntdo', this.getVar('p_con_tipo_documento_nota_credito'));
            insCab.values.set('ide_srcom', built.ideSrcom);
            insCab.values.set('fecha_ingre', getCurrentDate());
            insCab.values.set('hora_ingre', getCurrentTime());
            // built.query (INSERT sri_comprobante) debe ejecutarse ANTES que insCab: la
            // cabecera de la NC referencia ide_srcom por FK. El orden invertido causaba
            // "cxp_cabecera_nota_ide_srcom_fkey" en cada guardado (createListQuery respeta
            // el orden del array dentro de la transacción).
            listQuery.push(built.query);
            listQuery.push(insCab);

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
                // NOT NULL sin default en BD; '00' es el único valor usado históricamente
                // (paridad con alterno_ccdfa de cxc_deta_factura, mismo propósito legacy).
                insDet.values.set('alter_tribu_cpdno', '00');
                insDet.values.set('observacion_cpdno', det.observacion_cpdno ?? null);
                insDet.values.set('descuento_cpdno', det.descuento_cpdno ?? null);
                insDet.values.set('porcentaje_descuento_cpdno', det.porcentaje_descuento_cpdno ?? null);
                insDet.values.set('fecha_ingre', getCurrentDate());
                insDet.values.set('hora_ingre', getCurrentTime());
                listQuery.push(insDet);
            });

            // Aplica la NC contra la transacción CxC. Si la factura YA estaba pagada, no
            // se puede reducir más su transacción (saldo ya en cero) — se crea una
            // cabecera cxc_cabece_transa NUEVA e independiente (saldo a favor del
            // cliente, trazable a esta factura vía ide_cccfa pero NO ligada a
            // trn.ide_ccctr). Si no estaba pagada, se aplica directo sobre la
            // transacción original (comportamiento previo, sin cambios).
            const ideCcttrPago = this.getVar('p_cxc_tipo_trans_pago');
            let ideCcctrDestino = Number(trn.ide_ccctr);

            if (facturaYaPagada && ideCcctrNuevo !== null) {
                ideCcctrDestino = ideCcctrNuevo;
                const insTrnCab = new InsertQuery(TABLE_TRN_CAB, PK_TRN_CAB, dtoIn);
                insTrnCab.values.set(PK_TRN_CAB, ideCcctrNuevo);
                insTrnCab.values.set('ide_geper', factura.ide_geper);
                insTrnCab.values.set('ide_cccfa', dtoIn.ide_cccfa);
                insTrnCab.values.set('ide_ccttr', ideCcttrPago);
                insTrnCab.values.set('fecha_trans_ccctr', fechaEmision);
                insTrnCab.values.set(
                    'observacion_ccctr',
                    `SALDO A FAVOR POR NOTA DE CREDITO N. ${numeroNc} (FACTURA ${factura.secuencial_cccfa} YA PAGADA)`,
                );
                insTrnCab.values.set('usuario_ingre', dtoIn.login);
                insTrnCab.values.set('fecha_ingre', getCurrentDate());
                insTrnCab.values.set('hora_ingre', getCurrentTime());
                listQuery.push(insTrnCab);
            }

            const insTrnDet = new InsertQuery(TABLE_TRN_DET, PK_TRN_DET, dtoIn);
            insTrnDet.values.set('ide_ccdtr', ideCcdtr);
            insTrnDet.values.set('ide_cccfa', dtoIn.ide_cccfa);
            insTrnDet.values.set('ide_ccctr', ideCcctrDestino);
            insTrnDet.values.set('ide_ccttr', ideCcttrPago);
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

            // ── Kardex: reversa (ENTRADA) de los artículos con control de inventario ──
            if (tieneKardex && ideIncci !== null && baseIdeIndci !== null) {
                const kardexQueries = await this.buildKardexQueries(
                    ideIncci,
                    baseIdeIndci,
                    dtoIn.ide_cccfa,
                    numeroNc,
                    fechaEmision,
                    Number(factura.ide_geper),
                    detallesConKardex,
                    dtoIn,
                    ideBodega,
                );
                listQuery.push(...kardexQueries);
            }

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
     * Edita una nota de crédito mientras su comprobante SRI sigue PENDIENTE (no enviada/
     * autorizada aún). No re-emite clave de acceso ni toca ide_srcom — reutiliza el
     * comprobante ya reservado, solo actualiza sus montos. Reemplaza detalle + aplicación
     * CxC + kardex con los valores recalculados (mismas reglas normativas y misma lógica
     * de kardex/CxC-bifurcada que saveNotaCredito, ver comentarios ahí).
     */
    async updateNotaCredito(dtoIn: UpdateNotaCreditoDto & HeaderParamsDto) {
        try {
            // ── NC existente ─────────────────────────────────────────────────
            const qNc = new SelectQuery(`
                SELECT a.ide_cpcno, a.ide_cccfa, a.ide_ccdaf, a.ide_srcom, a.numero_cpcno,
                       a.ide_cpeno, a.fecha_emisi_cpcno,
                       d.establecimiento_ccdfa, d.pto_emision_ccdfa,
                       s.ide_sresc
                FROM ${TABLE_NC_CAB} a
                INNER JOIN cxc_datos_fac d ON a.ide_ccdaf = d.ide_ccdaf
                LEFT JOIN sri_comprobante s ON s.ide_srcom = a.ide_srcom
                WHERE a.ide_cpcno = $1 AND a.ide_empr = $2
            `);
            qNc.addIntParam(1, dtoIn.ide_cpcno);
            qNc.addIntParam(2, dtoIn.ideEmpr);
            const nc = await this.dataSource.createSingleQuery(qNc);
            if (!nc) {
                throw new BadRequestException(`La nota de crédito ide_cpcno=${dtoIn.ide_cpcno} no existe.`);
            }
            if (Number(nc.ide_cpeno) !== IDE_CPENO_NORMAL) {
                throw new BadRequestException('No se puede editar una nota de crédito anulada.');
            }
            if (Number(nc.ide_sresc) !== EstadoComprobanteEnum.PENDIENTE.codigo) {
                throw new BadRequestException(
                    'No se puede editar una nota de crédito que ya fue enviada o autorizada por el SRI.',
                );
            }
            const ideCccfa = Number(nc.ide_cccfa);

            // ── Factura relacionada (misma factura, no se reasigna en la edición) ──
            const qFactura = new SelectQuery(`
                SELECT cf.ide_cccfa, cf.ide_geper, cf.secuencial_cccfa, cf.total_cccfa,
                       cf.fecha_emisi_cccfa, cf.pagado_cccfa,
                       p.correo_geper, p.identificac_geper, p.ide_getid,
                       sc.ide_sresc
                FROM cxc_cabece_factura cf
                LEFT JOIN gen_persona p ON p.ide_geper = cf.ide_geper
                LEFT JOIN sri_comprobante sc ON sc.ide_srcom = cf.ide_srcom
                WHERE cf.ide_cccfa = $1 AND cf.ide_empr = $2 AND cf.ide_sucu = $3
            `);
            qFactura.addIntParam(1, ideCccfa);
            qFactura.addIntParam(2, dtoIn.ideEmpr);
            qFactura.addIntParam(3, dtoIn.ideSucu);
            const factura = await this.dataSource.createSingleQuery(qFactura);
            if (!factura) {
                throw new BadRequestException(`La factura ide_cccfa=${ideCccfa} no existe.`);
            }

            // ── Reglas normativas SRI (mismas que al crear) ─────────────────
            if (Number(factura.ide_sresc) !== EstadoComprobanteEnum.AUTORIZADO.codigo) {
                throw new BadRequestException(
                    'No se puede emitir una nota de crédito sobre una factura que no está autorizada por el SRI.',
                );
            }
            const ideGetidConsumidorFinal = this.getVar('p_gen_tipo_identif_consumidor_final');
            if (Number(factura.ide_getid) === ideGetidConsumidorFinal) {
                throw new BadRequestException(
                    'No se puede emitir una nota de crédito sobre una factura emitida a Consumidor Final.',
                );
            }

            // ── Motivo ───────────────────────────────────────────────────────
            const qMotivo = new SelectQuery(`SELECT nombre_cpmno FROM cxp_motivo_nota WHERE ide_cpmno = $1`);
            qMotivo.addIntParam(1, dtoIn.ide_cpmno);
            const motivo = await this.dataSource.createSingleQuery(qMotivo);
            if (!motivo) {
                throw new BadRequestException(`El motivo ide_cpmno=${dtoIn.ide_cpmno} no existe.`);
            }

            // ── Detalle ──────────────────────────────────────────────────────
            const detalles = dtoIn.detalles?.length ? dtoIn.detalles : await this.copiarDetalleFactura(ideCccfa);
            if (!detalles.length) {
                throw new BadRequestException('Debe ingresar al menos un detalle a la nota de crédito');
            }

            const fechaEmision = toPgDate(dtoIn.fecha_emisi_cpcno) || toPgDate(nc.fecha_emisi_cpcno) || getCurrentDate();
            const tarifaIva = isDefined(dtoIn.tarifa_iva_cpcno) ? Number(dtoIn.tarifa_iva_cpcno) : TARIFA_IVA_DEFAULT;
            const totales = this.calcularTotales(detalles, tarifaIva);
            if (totales.total <= 0) {
                throw new BadRequestException('El valor de la nota de crédito debe ser mayor a cero');
            }

            // Igual que en creación, pero excluyendo esta misma NC de la suma de "notas
            // previas" (si no, siempre se rechazaría a sí misma al recalcular).
            const qNotasPrevias = new SelectQuery(`
                SELECT COALESCE(SUM(total_cpcno), 0) AS total_notas_previas
                FROM cxp_cabecera_nota
                WHERE ide_cccfa = $1 AND ide_empr = $2 AND ide_cpeno = $3 AND ide_cpcno <> $4
            `);
            qNotasPrevias.addIntParam(1, ideCccfa);
            qNotasPrevias.addIntParam(2, dtoIn.ideEmpr);
            qNotasPrevias.addIntParam(3, IDE_CPENO_NORMAL);
            qNotasPrevias.addIntParam(4, dtoIn.ide_cpcno);
            const notasPrevias = await this.dataSource.createSingleQuery(qNotasPrevias);
            const totalNotasPrevias = Number(notasPrevias?.total_notas_previas ?? 0);
            const TOLERANCIA = 0.01;
            if (totalNotasPrevias + totales.total > Number(factura.total_cccfa) + TOLERANCIA) {
                const disponible = Math.max(0, Number(factura.total_cccfa) - totalNotasPrevias);
                throw new BadRequestException(
                    `La nota de crédito ($${totales.total.toFixed(2)}) supera el valor disponible de la factura ` +
                        `($${disponible.toFixed(2)} de $${Number(factura.total_cccfa).toFixed(2)}` +
                        (totalNotasPrevias > 0 ? `, ya se emitieron $${totalNotasPrevias.toFixed(2)} en otras notas` : '') +
                        `).`,
                );
            }

            const detallesConKardex = await this.getDetallesConKardex(detalles);
            const tieneKardex = detallesConKardex.length > 0;
            const facturaYaPagada = Boolean(factura.pagado_cccfa);
            const numeroNc = String(nc.numero_cpcno);

            // ── Secuenciales para el detalle/kardex/CxC que se recrean ──────
            const baseIdeCpdno = await this.dataSource.getSeqTable(TABLE_NC_DET, PK_NC_DET, detalles.length, dtoIn.login);
            const ideCcdtr = await this.dataSource.getSeqTable(TABLE_TRN_DET, PK_TRN_DET, 1, dtoIn.login);
            const ideCcctrNuevo = facturaYaPagada
                ? await this.dataSource.getSeqTable(TABLE_TRN_CAB, PK_TRN_CAB, 1, dtoIn.login)
                : null;
            const ideBodega = tieneKardex ? await this.getBodegaSucursal(dtoIn.ideSucu) : 0;
            const ideIncci = tieneKardex ? await this.dataSource.getSeqTable(TABLE_INV_CAB, PK_INV_CAB, 1, dtoIn.login) : null;
            const baseIdeIndci = tieneKardex
                ? await this.dataSource.getSeqTable(TABLE_INV_DET, PK_INV_DET, detallesConKardex.length, dtoIn.login)
                : null;

            const listQuery: Query[] = [];

            // ── Reversar lo generado en la versión anterior de esta NC ──────
            // Detalle de la NC.
            const delDetNc = new DeleteQuery(TABLE_NC_DET);
            delDetNc.where = 'ide_cpcno = $1';
            delDetNc.addIntParam(1, dtoIn.ide_cpcno);
            listQuery.push(delDetNc);

            // Aplicación CxC previa (detalle), identificada por docum_relac_ccdtr = numero_cpcno
            // (mismo criterio que anularNotaCredito).
            const delTrnDet = new DeleteQuery(TABLE_TRN_DET);
            delTrnDet.where = 'ide_cccfa = $1 AND docum_relac_ccdtr = $2';
            delTrnDet.addIntParam(1, ideCccfa);
            delTrnDet.addStringParam(2, numeroNc);
            listQuery.push(delTrnDet);

            // Si la versión anterior había creado una cxc_cabece_transa "saldo a favor"
            // exclusiva de esta NC (paid-branch), se identifica por observación (única por
            // numero_cpcno) y se elimina — quedará huérfana una vez ejecute delTrnDet en
            // esta misma transacción (NO se puede comprobar el huérfano aquí con un
            // NOT EXISTS: delTrnDet todavía no corrió, solo está encolado en listQuery).
            const qCabPropia = new SelectQuery(`
                SELECT ide_ccctr FROM cxc_cabece_transa
                WHERE ide_cccfa = $1 AND observacion_ccctr LIKE $2
            `);
            qCabPropia.addIntParam(1, ideCccfa);
            qCabPropia.addStringParam(2, `%NOTA DE CREDITO N. ${numeroNc}%`);
            const cabsPropias = await this.dataSource.createSelectQuery(qCabPropia);
            for (const fila of cabsPropias as { ide_ccctr: number }[]) {
                const delCabPropia = new DeleteQuery(TABLE_TRN_CAB);
                delCabPropia.where = 'ide_ccctr = $1';
                delCabPropia.addIntParam(1, Number(fila.ide_ccctr));
                listQuery.push(delCabPropia);
            }

            // Kardex previo (ENTRADA por devolución), identificado por referencia_incci +
            // tipo de transacción de devolución (únicos por numero_cpcno).
            const qKardexPrevio = new SelectQuery(`
                SELECT ide_incci FROM ${TABLE_INV_CAB}
                WHERE referencia_incci = $1 AND ide_intti = $2
            `);
            qKardexPrevio.addStringParam(1, numeroNc.slice(-12));
            qKardexPrevio.addIntParam(2, this.getVar('p_inv_tipo_transaccion_devolucion_venta'));
            const kardexPrevio = await this.dataSource.createSingleQuery(qKardexPrevio);
            if (kardexPrevio) {
                const delIndciPrevio = new DeleteQuery(TABLE_INV_DET);
                delIndciPrevio.where = 'ide_incci = $1';
                delIndciPrevio.addIntParam(1, Number(kardexPrevio.ide_incci));
                listQuery.push(delIndciPrevio);

                const delIncciPrevio = new DeleteQuery(TABLE_INV_CAB);
                delIncciPrevio.where = 'ide_incci = $1';
                delIncciPrevio.addIntParam(1, Number(kardexPrevio.ide_incci));
                listQuery.push(delIncciPrevio);
            }

            // ── UPDATE cabecera NC (recalculada) ────────────────────────────
            const updCab = new UpdateQuery(TABLE_NC_CAB, PK_NC_CAB, dtoIn);
            updCab.values.set('ide_cpmno', dtoIn.ide_cpmno);
            updCab.values.set('ide_cndfp', dtoIn.ide_cndfp);
            updCab.values.set('fecha_emisi_cpcno', fechaEmision);
            updCab.values.set('base_grabada_cpcno', totales.baseGrabada);
            updCab.values.set('base_tarifa0_cpcno', totales.baseTarifa0);
            updCab.values.set('base_no_objeto_iva_cpcno', totales.baseNoObjeto);
            updCab.values.set('valor_iva_cpcno', totales.iva);
            updCab.values.set('total_cpcno', totales.total);
            updCab.values.set('descuento_cpcno', totales.descuento);
            updCab.values.set('tarifa_iva_cpcno', tarifaIva);
            updCab.values.set('observacion_cpcno', dtoIn.observacion_cpcno ?? null);
            updCab.values.set('correo_cpcno', dtoIn.correo_cpcno ?? null);
            updCab.where = 'ide_cpcno = $1';
            updCab.addIntParam(1, dtoIn.ide_cpcno);
            listQuery.push(updCab);

            // El comprobante SRI ya reservado guarda su propia copia de los montos (usada
            // al generar el XML en enviarSRI) — hay que mantenerla sincronizada, si no el
            // envío usaría los montos de la versión anterior de la NC.
            if (nc.ide_srcom) {
                const updSri = new UpdateQuery('sri_comprobante', 'ide_srcom');
                updSri.values.set('subtotal0_srcom', totales.baseTarifa0);
                updSri.values.set('base_grabada_srcom', totales.baseGrabada);
                updSri.values.set('subtotal_srcom', totales.baseGrabada + totales.baseTarifa0);
                updSri.values.set('iva_srcom', totales.iva);
                updSri.values.set('descuento_srcom', totales.descuento);
                updSri.values.set('total_srcom', totales.total);
                updSri.values.set('motivo_srcom', motivo.nombre_cpmno);
                updSri.where = `ide_srcom = ${Number(nc.ide_srcom)}`;
                listQuery.push(updSri);
            }

            // ── Recrear detalle ──────────────────────────────────────────────
            detalles.forEach((det, idx) => {
                const insDet = new InsertQuery(TABLE_NC_DET, PK_NC_DET, dtoIn);
                insDet.values.set(PK_NC_DET, baseIdeCpdno + idx);
                insDet.values.set(PK_NC_CAB, dtoIn.ide_cpcno);
                insDet.values.set('ide_inarti', det.ide_inarti);
                insDet.values.set('ide_inuni', det.ide_inuni ?? null);
                insDet.values.set('cantidad_cpdno', det.cantidad_cpdno);
                insDet.values.set('precio_cpdno', det.precio_cpdno);
                insDet.values.set('valor_cpdno', this.valorDetalle(det));
                insDet.values.set('iva_inarti_cpdno', det.iva_inarti_cpdno);
                insDet.values.set('alter_tribu_cpdno', '00');
                insDet.values.set('observacion_cpdno', det.observacion_cpdno ?? null);
                insDet.values.set('descuento_cpdno', det.descuento_cpdno ?? null);
                insDet.values.set('porcentaje_descuento_cpdno', det.porcentaje_descuento_cpdno ?? null);
                insDet.values.set('fecha_ingre', getCurrentDate());
                insDet.values.set('hora_ingre', getCurrentTime());
                listQuery.push(insDet);
            });

            // ── Recrear aplicación CxC (misma lógica bifurcada que al crear) ──
            const ideCcttrPago = this.getVar('p_cxc_tipo_trans_pago');
            let ideCcctrDestino: number;
            if (facturaYaPagada && ideCcctrNuevo !== null) {
                ideCcctrDestino = ideCcctrNuevo;
                const insTrnCab = new InsertQuery(TABLE_TRN_CAB, PK_TRN_CAB, dtoIn);
                insTrnCab.values.set(PK_TRN_CAB, ideCcctrNuevo);
                insTrnCab.values.set('ide_geper', factura.ide_geper);
                insTrnCab.values.set('ide_cccfa', ideCccfa);
                insTrnCab.values.set('ide_ccttr', ideCcttrPago);
                insTrnCab.values.set('fecha_trans_ccctr', fechaEmision);
                insTrnCab.values.set(
                    'observacion_ccctr',
                    `SALDO A FAVOR POR NOTA DE CREDITO N. ${numeroNc} (FACTURA ${factura.secuencial_cccfa} YA PAGADA)`,
                );
                insTrnCab.values.set('usuario_ingre', dtoIn.login);
                insTrnCab.values.set('fecha_ingre', getCurrentDate());
                insTrnCab.values.set('hora_ingre', getCurrentTime());
                listQuery.push(insTrnCab);
            } else {
                const qTrn = new SelectQuery(`SELECT ide_ccctr FROM cxc_cabece_transa WHERE ide_cccfa = $1 LIMIT 1`);
                qTrn.addIntParam(1, ideCccfa);
                const trn = await this.dataSource.createSingleQuery(qTrn);
                if (!trn) {
                    throw new BadRequestException('La factura no tiene transacción de cuenta por cobrar asociada.');
                }
                ideCcctrDestino = Number(trn.ide_ccctr);
            }

            const insTrnDet = new InsertQuery(TABLE_TRN_DET, PK_TRN_DET, dtoIn);
            insTrnDet.values.set('ide_ccdtr', ideCcdtr);
            insTrnDet.values.set('ide_cccfa', ideCccfa);
            insTrnDet.values.set('ide_ccctr', ideCcctrDestino);
            insTrnDet.values.set('ide_ccttr', ideCcttrPago);
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

            // ── Recrear kardex ───────────────────────────────────────────────
            if (tieneKardex && ideIncci !== null && baseIdeIndci !== null) {
                const kardexQueries = await this.buildKardexQueries(
                    ideIncci,
                    baseIdeIndci,
                    ideCccfa,
                    numeroNc,
                    fechaEmision,
                    Number(factura.ide_geper),
                    detallesConKardex,
                    dtoIn,
                    ideBodega,
                );
                listQuery.push(...kardexQueries);
            }

            await this.dataSource.createListQuery(listQuery);
            await this.actualizarPagadoSiCorresponde(ideCccfa);

            return {
                message: 'ok',
                ide_cpcno: dtoIn.ide_cpcno,
                ide_cccfa: ideCccfa,
                numero_cpcno: numeroNc,
                total_cpcno: totales.total,
            };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al editar la nota de crédito: ${msg}`);
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

    /**
     * `cantidad*precio - descuento` - sin restar el descuento, una NC de una factura
     * con descuento acreditaría el bruto en vez del neto realmente facturado (ver
     * plan de "Descuento en Ventas").
     */
    private valorDetalle(det: DetalleNotaCreditoDto): number {
        const bruto = Number(det.cantidad_cpdno) * Number(det.precio_cpdno);
        const descuento = Number(det.descuento_cpdno ?? 0);
        return Number((bruto - descuento).toFixed(2));
    }

    /** Bodega activa de la sucursal (paridad FacturasSaveService#getBodegaSucursal). */
    private async getBodegaSucursal(ideSucu: number): Promise<number> {
        const q = new SelectQuery(`
            SELECT ide_inbod FROM inv_bodega
            WHERE ide_sucu = $1 AND activo_inbod = true
            LIMIT 1
        `);
        q.addIntParam(1, ideSucu);
        q.setLazy(false);
        const row = await this.dataSource.createSingleQuery(q);
        if (!row) throw new BadRequestException(`No existe bodega activa para la sucursal ${ideSucu}`);
        return Number(row.ide_inbod);
    }

    /** Filtra del detalle de la NC solo los artículos con hace_kardex_inarti = true. */
    private async getDetallesConKardex(detalles: DetalleNotaCreditoDto[]): Promise<DetalleNotaCreditoDto[]> {
        if (!detalles.length) return [];
        const ids = [...new Set(detalles.map((d) => d.ide_inarti))];
        const q = new SelectQuery(`
            SELECT ide_inarti FROM inv_articulo WHERE ide_inarti = ANY($1) AND hace_kardex_inarti = true
        `);
        q.addParam(1, ids);
        const resultado = await this.dataSource.createSelectQuery(q);
        const idsConKardex = new Set(resultado.map((r: any) => Number(r.ide_inarti)));
        return detalles.filter((d) => idsConKardex.has(d.ide_inarti));
    }

    /** Factores de conversión de unidades (paridad FacturasSaveService#getConversionesUnidades). */
    private async getConversionesUnidades(detallesKardex: DetalleNotaCreditoDto[]): Promise<Map<string, number>> {
        const result = new Map<string, number>();
        if (!detallesKardex.length) return result;
        const idsArti = [...new Set(detallesKardex.map((d) => d.ide_inarti))];
        const q = new SelectQuery(`
            SELECT a.ide_inarti, cu.ide_inuni AS ide_inuni_origen, cu.cantidad_incon
            FROM inv_articulo a
            INNER JOIN inv_conversion_unidad cu ON cu.ide_inarti = a.ide_inarti AND cu.inv_ide_inuni = a.ide_inuni
            WHERE a.ide_inarti = ANY($1)
        `);
        q.addParam(1, idsArti);
        const rows = await this.dataSource.createSelectQuery(q);
        for (const row of rows) {
            if (row.ide_inuni_origen !== null && row.cantidad_incon !== null) {
                result.set(`${row.ide_inarti}_${row.ide_inuni_origen}`, Number(row.cantidad_incon));
            }
        }
        return result;
    }

    /**
     * Construye el comprobante de inventario de ENTRADA (kardex) que revierte al stock
     * lo acreditado por la NC — inverso del kardex de SALIDA que genera la factura
     * (FacturasSaveService#buildKardexQueries). Usa el tipo de transacción
     * 'p_inv_tipo_transaccion_devolucion_venta' (ide_intci=INGRESO), distinto del de
     * VENTA (ide_intci=EGRESO) — no existía en el catálogo un tipo de INGRESO para este
     * caso ("Anulación de factura" existente está clasificado como EGRESO, no aplica).
     */
    private async buildKardexQueries(
        ideIncci: number,
        baseIdeIndci: number,
        ideCccfa: number,
        numeroNc: string,
        fechaEmision: string,
        ideGeper: number,
        detallesKardex: DetalleNotaCreditoDto[],
        dtoIn: SaveNotaCreditoDto & HeaderParamsDto,
        ideBodega: number,
    ): Promise<InsertQuery[]> {
        const queries: InsertQuery[] = [];
        const conversiones = await this.getConversionesUnidades(detallesKardex);

        const qCab = new InsertQuery(TABLE_INV_CAB, PK_INV_CAB, dtoIn);
        qCab.values.set(PK_INV_CAB, ideIncci);
        qCab.values.set('ide_geper', ideGeper);
        qCab.values.set('ide_intti', this.getVar('p_inv_tipo_transaccion_devolucion_venta'));
        qCab.values.set('ide_inbod', ideBodega);
        qCab.values.set('ide_inepi', this.getVar('p_inv_estado_normal'));
        qCab.values.set('ide_usua', dtoIn.ideUsua);
        qCab.values.set('numero_incci', numeroNc.slice(-10));
        qCab.values.set('fecha_trans_incci', fechaEmision);
        qCab.values.set('fecha_efect_incci', fechaEmision);
        qCab.values.set('observacion_incci', `NOTA DE CREDITO ${numeroNc}`);
        qCab.values.set('referencia_incci', numeroNc.slice(-12));
        qCab.values.set('automatico_incci', true);
        qCab.values.set('verifica_incci', false);
        qCab.values.set('usuario_ingre', dtoIn.login);
        qCab.values.set('fecha_ingre', getCurrentDate());
        qCab.values.set('hora_ingre', getCurrentTime());
        queries.push(qCab);

        detallesKardex.forEach((det, idx) => {
            const key = `${det.ide_inarti}_${det.ide_inuni ?? ''}`;
            const conversion = conversiones.get(key);
            const cantidad = Number(det.cantidad_cpdno);
            const cantidadConvertida = conversion ? Number((cantidad * conversion).toFixed(6)) : cantidad;
            const valorNeto = Math.abs(this.valorDetalle(det));
            const valorConvertido = conversion
                ? Number((valorNeto * (cantidadConvertida / cantidad)).toFixed(2))
                : valorNeto;

            const qDet = new InsertQuery(TABLE_INV_DET, PK_INV_DET, dtoIn);
            qDet.values.set(PK_INV_DET, baseIdeIndci + idx);
            qDet.values.set('ide_incci', ideIncci);
            qDet.values.set('ide_inarti', det.ide_inarti);
            qDet.values.set('ide_cccfa', ideCccfa);
            qDet.values.set('secuencial_indci', String(idx + 1).padStart(6, '0'));
            qDet.values.set('cantidad_indci', Math.abs(cantidadConvertida));
            qDet.values.set('precio_indci', det.precio_cpdno);
            qDet.values.set('valor_indci', Math.abs(valorConvertido));
            qDet.values.set('usuario_ingre', dtoIn.login);
            qDet.values.set('fecha_ingre', getCurrentDate());
            qDet.values.set('hora_ingre', getCurrentTime());
            queries.push(qDet);
        });

        return queries;
    }

    private calcularTotales(detalles: DetalleNotaCreditoDto[], tarifaIva: number) {
        let baseGrabada = 0;
        let baseTarifa0 = 0;
        let baseNoObjeto = 0;
        let descuento = 0;
        for (const det of detalles) {
            const valor = this.valorDetalle(det);
            if (det.iva_inarti_cpdno === '1') baseGrabada += valor;
            else if (det.iva_inarti_cpdno === '-1') baseTarifa0 += valor;
            else baseNoObjeto += valor;
            descuento += Number(det.descuento_cpdno ?? 0);
        }
        const iva = Number(((baseGrabada * tarifaIva) / 100).toFixed(2));
        const total = Number((baseGrabada + baseTarifa0 + baseNoObjeto + iva).toFixed(2));
        return { baseGrabada, baseTarifa0, baseNoObjeto, iva, total, descuento: Number(descuento.toFixed(2)) };
    }

    private async copiarDetalleFactura(ideCccfa: number): Promise<DetalleNotaCreditoDto[]> {
        const query = new SelectQuery(`
            SELECT c.ide_inarti, c.ide_inuni, cantidad_ccdfa, precio_ccdfa, iva_inarti_ccdfa, observacion_ccdfa,
                   descuento_ccdfa, porcentaje_descuento_ccdfa
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
            descuento_cpdno: r.descuento_ccdfa != null ? Number(r.descuento_ccdfa) : undefined,
            porcentaje_descuento_cpdno:
                r.porcentaje_descuento_ccdfa != null ? Number(r.porcentaje_descuento_ccdfa) : undefined,
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
