import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { DeleteQuery, InsertQuery, Query, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { EmisorService } from 'src/core/modules/sri/cel/emisor.service';
import { EstadoComprobanteEnum } from 'src/core/modules/sri/cel/enum/estado-comprobante.enum';
import { SriComprobanteCabeceraService } from 'src/core/modules/sri/cel/sri-comprobante-cabecera.service';
import { SriEnvioQueueService } from 'src/core/modules/sri/envio/sri-envio-queue.service';
import { PreLibroBancosSaveService } from 'src/core/modules/tesoreria/pre-libro-bancos/pre-libro-bancos-save.service';
import { isDefined } from 'src/util/helpers/common-util';
import { getCurrentDate, getCurrentTime, toPgDate } from 'src/util/helpers/date-util';

import { DocumentosCxPService } from './documentos-cxp.service';
import { AnularDocumentoCxPDto } from './dto/anular-documento-cxp.dto';
import { EnviarSriDocumentoCxPDto } from './dto/enviar-sri-documento-cxp.dto';
import {
    CabDocumentoCxPDto,
    DetalleDocumentoCxPDto,
    ReembolsoDocumentoCxPDto,
    ReembolsoLiquidacionCompraDto,
    SaveDocumentoCxPDto,
} from './dto/save-documento-cxp.dto';

// ─── Constantes de tablas ────────────────────────────────────────────────────
const MODULE = 'cxp';
const TABLE_CAB = 'cabece_factur';
const TABLE_DET = 'detall_factur';
const PK_CAB = 'ide_cpcfa';
const PK_DET = 'ide_cpdfa';
const TABLE_TRN_CAB = 'cxp_cabece_transa';
const TABLE_TRN_DET = 'cxp_detall_transa';
const PK_TRN_CAB = 'ide_cpctr';
const PK_TRN_DET = 'ide_cpdtr';
const TABLE_INV_CAB = 'inv_cab_comp_inve';
const TABLE_INV_DET = 'inv_det_comp_inve';
const PK_INV_CAB = 'ide_incci';
const PK_INV_DET = 'ide_indci';
/** Reembolso de gastos de Liquidación de Compra (Anexo 17 SRI), tabla ya existente en el core. */
const TABLE_REEMBOLSO_LIQUIDACION = 'cxp_datos_com_reembolso';
const PK_REEMBOLSO_LIQUIDACION = 'ide_cpdcr';

// ─── Valores heredados del sistema legacy (ServicioCuentasCxP / ServicioInventario) ──
/** Tipo de transacción CxP para nota de crédito (hardcoded en el legacy) */
const IDE_CPTTR_NOTA_CREDITO = 2;
/** Tipo de transacción de inventario "reversa" usado para notas de crédito */
const IDE_INTTI_REVERSA_NC = 13;
/** Motivo de NC que no mueve stock: solo actualiza precios de la compra original */
const MOTIVO_NC_DESCUENTO_PRECIO = 'DESCUENTO EN PRECIO';
/** Longitudes válidas de la autorización SRI: 10 (física), 37/49 (clave de acceso) */
const LONGITUDES_AUTORIZACION = [10, 37, 49];
/** codDoc SRI de Liquidación de Compra (Tabla 4 ficha técnica) */
const COD_DOC_LIQUIDACION_COMPRA = '03';

// ─── Tipos internos ──────────────────────────────────────────────────────────
type Totales = ReturnType<DocumentosCxPSaveService['calcularTotales']>;

interface TrnResuelta {
    /** ide_cpctr a usar; null → se debe crear una cabecera nueva */
    ideCpctr: number | null;
    /** ide_cpcfa de la factura original (solo notas de crédito) */
    ideCpcfaFacturaOriginal: number | null;
}

/**
 * Servicio de persistencia para documentos CxP.
 *
 * Flujo del saveDocumento (migrado de componentes/DocumentoCxP.java del legacy):
 *  1. cxp_cabece_factur + cxp_detall_factur   → el documento
 *  2. cxp_cabece_factur (filas hijas)          → comprobantes de reembolso
 *  3. cxp_cabece_transa + cxp_detall_transa    → la cuenta por pagar (una cuota)
 *  4. inv_cab_comp_inve + inv_det_comp_inve    → kardex (si algún artículo lo maneja)
 * Todo se ejecuta en una única transacción (createListQuery).
 * El asiento contable y la retención se generan en procesos posteriores.
 */
@Injectable()
export class DocumentosCxPSaveService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly consultas: DocumentosCxPService,
        private readonly emisorService: EmisorService,
        private readonly sriComprobanteCabeceraService: SriComprobanteCabeceraService,
        private readonly sriEnvioQueueService: SriEnvioQueueService,
        private readonly preLibroBancosSaveService: PreLibroBancosSaveService,
    ) {
        super();
        this.core
            .getVariables([
                'p_cxp_estado_factura_normal',
                'p_cxp_estado_factura_anulada',
                'p_cxp_tipo_trans_factura',
                'p_con_estado_comprobante_anulado',
                'p_con_tipo_documento_nota_credito',
                'p_con_tipo_documento_reembolso',
                'p_con_tipo_documento_liquidacion_compra',
                'p_inv_estado_normal',
                'p_inv_estado_anulado',
                'p_inv_tipo_transaccion_compra',
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    // ─── Getters de variables ────────────────────────────────────────────────

    private getVar(name: string): number {
        const val = this.variables.get(name);
        if (!isDefined(val)) {
            throw new InternalServerErrorException(
                `Variable del sistema '${name}' no configurada. Contacte al administrador.`,
            );
        }
        return Number(val);
    }

    private get ideEstadoNormal(): number {
        return this.getVar('p_cxp_estado_factura_normal');
    }

    private get ideEstadoAnulada(): number {
        return this.getVar('p_cxp_estado_factura_anulada');
    }

    private get ideTipoTransFactura(): number {
        return this.getVar('p_cxp_tipo_trans_factura');
    }

    private get ideTipoDocNotaCredito(): number {
        return this.getVar('p_con_tipo_documento_nota_credito');
    }

    private get ideTipoDocReembolso(): number {
        return this.getVar('p_con_tipo_documento_reembolso');
    }

    private get ideTipoDocLiquidacionCompra(): number {
        return this.getVar('p_con_tipo_documento_liquidacion_compra');
    }

    private get ideEstadoNormalInv(): number {
        return this.getVar('p_inv_estado_normal');
    }

    private get ideEstadoAnuladoInv(): number {
        return this.getVar('p_inv_estado_anulado');
    }

    private get ideTipoTransaccionCompraInv(): number {
        return this.getVar('p_inv_tipo_transaccion_compra');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PÚBLICO: saveDocumento
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Crea o actualiza un documento CxP completo con su cuenta por pagar,
     * comprobantes de reembolso y comprobante de inventario en una única
     * transacción atómica.
     */
    async saveDocumento(dtoIn: SaveDocumentoCxPDto & HeaderParamsDto) {
        try {
            const { cabecera, detalles } = dtoIn;
            if (!cabecera) throw new BadRequestException('La cabecera del documento es requerida');
            if (!detalles || detalles.length === 0) {
                throw new BadRequestException('Debe ingresar al menos un detalle');
            }
            const isUpdate = !!dtoIn.isUpdate && !!cabecera.ide_cpcfa;

            const esNotaCredito = cabecera.ide_cntdo === this.ideTipoDocNotaCredito;
            const esReembolso = cabecera.ide_cntdo === this.ideTipoDocReembolso;
            const esLiquidacionCompra = cabecera.ide_cntdo === this.ideTipoDocLiquidacionCompra;
            // Reembolso obligatorio (todo el documento es un reembolso, tipo REEMBOLSOS del ATS,
            // mecanismo self-referencing en cxp_cabece_factur — sin cambios).
            const reembolsos = esReembolso ? (dtoIn.reembolsos ?? []) : [];
            // Líneas de reembolso opcionales dentro de una Liquidación de Compra (Anexo 17 SRI),
            // en cxp_datos_com_reembolso (tabla ya existente en el core para este propósito).
            const reembolsosLiquidacion = esLiquidacionCompra ? (dtoIn.reembolsosLiquidacion ?? []) : [];
            // Liquidación de Compra electrónica: numero_cpcfa/autorizacio_cpcfa no vienen del
            // usuario (a diferencia del resto de documentos CxP, recibidos de terceros) — se
            // generan al guardar mediante el generador de cabecera SRI (paridad Retención CxP).
            const esElectronica = esLiquidacionCompra && !isUpdate
                && !cabecera.numero_cpcfa && !cabecera.autorizacio_cpcfa;

            // ── Sanitizar fechas ─────────────────────────────────────────────
            cabecera.fecha_emisi_cpcfa = toPgDate(cabecera.fecha_emisi_cpcfa) || getCurrentDate();
            if (cabecera.fecha_emision_nc_cpcfa) {
                cabecera.fecha_emision_nc_cpcfa =
                    toPgDate(cabecera.fecha_emision_nc_cpcfa) || cabecera.fecha_emisi_cpcfa;
            }
            for (const r of reembolsos) {
                r.fecha_emisi_cpcfa = toPgDate(r.fecha_emisi_cpcfa) || cabecera.fecha_emisi_cpcfa;
            }
            for (const r of reembolsosLiquidacion) {
                if (r.fecha) r.fecha = toPgDate(r.fecha) || cabecera.fecha_emisi_cpcfa;
            }

            // ── Totales (paridad legacy: el descuento solo reduce la base del IVA) ──
            const tarifaIva = isDefined(cabecera.tarifa_iva_cpcfa)
                ? Number(cabecera.tarifa_iva_cpcfa)
                : await this.consultas.getPorcentajeIva(cabecera.fecha_emisi_cpcfa);
            const totales = this.calcularTotales(
                detalles,
                tarifaIva,
                cabecera.descuento_cpcfa ?? 0,
                cabecera.otros_cpcfa ?? 0,
            );

            await this.validarDocumento(
                cabecera, detalles, reembolsos, reembolsosLiquidacion, totales,
                esNotaCredito, esReembolso, isUpdate, esElectronica,
            );

            if (isDefined(dtoIn.ide_cctfa) && !isUpdate) {
                await this.validarEnvioTransporte(dtoIn.ide_cctfa);
            }

            const diasCredito = isDefined(cabecera.dias_credito_cpcfa)
                ? Number(cabecera.dias_credito_cpcfa)
                : await this.consultas.getDiasCreditoFormaPago(cabecera.ide_cndfp1);
            const fechaVencimiento = this.sumarDias(cabecera.fecha_emisi_cpcfa, diasCredito);

            // ── Comprobante electrónico SRI (Liquidación de Compra) ──────────
            // Genera la cabecera sri_comprobante PENDIENTE con su propio secuencial +
            // clave de acceso, que reemplazan numero_cpcfa/autorizacio_cpcfa del documento.
            let claveAccesoSri: string | undefined;
            let ideSrcomElectronico: number | undefined;
            let sriHeaderQuery: InsertQuery | undefined;
            if (esElectronica) {
                if (!dtoIn.ide_ccdaf) {
                    throw new BadRequestException(
                        'Debe seleccionar el punto de emisión (ide_ccdaf) para la Liquidación de Compra electrónica.',
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
                qProveedor.addIntParam(1, cabecera.ide_geper);
                const proveedor = await this.dataSource.createSingleQuery(qProveedor);

                const emisor = await this.emisorService.getEmisor(dtoIn);
                const fechaEmisionStr = String(cabecera.fecha_emisi_cpcfa);
                const periodoFiscal = `${fechaEmisionStr.slice(5, 7)}/${fechaEmisionStr.slice(0, 4)}`;

                const built = await this.sriComprobanteCabeceraService.buildInsertPendiente(
                    {
                        ideEmpr: dtoIn.ideEmpr,
                        ideSucu: dtoIn.ideSucu,
                        login: dtoIn.login,
                        ip: dtoIn.ip,
                        ideSresc: EstadoComprobanteEnum.PENDIENTE.codigo,
                        ideCntdo: cabecera.ide_cntdo,
                        ideGeper: cabecera.ide_geper,
                        coddoc: COD_DOC_LIQUIDACION_COMPRA,
                        fechaEmision: fechaEmisionStr,
                        estab,
                        ptoEmi,
                        subtotal0: totales.base_tarifa0,
                        baseGrabada: totales.base_grabada,
                        iva: totales.valor_iva,
                        total: totales.total,
                        identificacion: proveedor?.identificac_geper ?? '',
                        correo: proveedor?.correo_geper,
                        periodoFiscal,
                    },
                    emisor,
                );
                sriHeaderQuery = built.query;
                claveAccesoSri = built.claveAcceso;
                ideSrcomElectronico = built.ideSrcom;
                cabecera.numero_cpcfa = `${estab}-${ptoEmi}-${built.secuencial}`;
                cabecera.autorizacio_cpcfa = claveAccesoSri;
            }

            // ── Kardex ───────────────────────────────────────────────────────
            // Paridad legacy: si al menos un artículo hace kardex, el comprobante
            // de inventario incluye TODOS los detalles del documento.
            const detallesConKardex = await this.getDetallesConKardex(detalles);
            const tieneKardex = detallesConKardex.length > 0;
            const esNcDescuentoPrecio =
                esNotaCredito &&
                (cabecera.motivo_nc_cpcfa ?? '').trim().toUpperCase() === MOTIVO_NC_DESCUENTO_PRECIO;
            const generaComprobanteInv = tieneKardex && !esNcDescuentoPrecio;

            // ── Resolver cabecera de transacción CxP ─────────────────────────
            const trn = await this.resolverCabeceraTransaccion(cabecera, esNotaCredito, isUpdate, dtoIn);

            // ── Reservar secuenciales ────────────────────────────────────────
            const ideCpcfa = isUpdate
                ? Number(cabecera.ide_cpcfa)
                : await this.dataSource.getSeqTable(`${MODULE}_${TABLE_CAB}`, PK_CAB, 1, dtoIn.login);
            // En update, el detalle se reconcilia diferencialmente (ver buildDiffDetalle) y
            // reserva sus propios PKs nuevos ahí mismo, solo para las líneas realmente nuevas.
            const baseIdeCpdfa = !isUpdate
                ? await this.dataSource.getSeqTable(`${MODULE}_${TABLE_DET}`, PK_DET, detalles.length, dtoIn.login)
                : null;
            const baseIdeReembolso = reembolsos.length > 0
                ? await this.dataSource.getSeqTable(`${MODULE}_${TABLE_CAB}`, PK_CAB, reembolsos.length, dtoIn.login)
                : null;
            const baseIdeReembolsoLiquidacion = reembolsosLiquidacion.length > 0
                ? await this.dataSource.getSeqTable(TABLE_REEMBOLSO_LIQUIDACION, PK_REEMBOLSO_LIQUIDACION, reembolsosLiquidacion.length, dtoIn.login)
                : null;
            const ideCpctr = trn.ideCpctr ?? await this.dataSource.getSeqTable(TABLE_TRN_CAB, PK_TRN_CAB, 1, dtoIn.login);
            const ideCpdtr = await this.dataSource.getSeqTable(TABLE_TRN_DET, PK_TRN_DET, 1, dtoIn.login);
            const ideIncci = generaComprobanteInv
                ? await this.dataSource.getSeqTable(TABLE_INV_CAB, PK_INV_CAB, 1, dtoIn.login)
                : null;
            const baseIdeIndci = generaComprobanteInv
                ? await this.dataSource.getSeqTable(TABLE_INV_DET, PK_INV_DET, detalles.length, dtoIn.login)
                : null;

            // ── Construir la lista de queries de la transacción ──────────────
            const listQuery: Query[] = [];

            if (isUpdate) {
                listQuery.push(this.buildUpdateCabecera(ideCpcfa, cabecera, totales, tarifaIva, diasCredito, dtoIn));
                listQuery.push(...this.buildDeleteDependencias(ideCpcfa, trn.ideCpctr));
            } else {
                listQuery.push(
                    this.buildInsertCabecera(ideCpcfa, cabecera, totales, tarifaIva, diasCredito, dtoIn, ideSrcomElectronico),
                );
            }
            if (sriHeaderQuery) {
                listQuery.push(sriHeaderQuery);
            }

            let detallesIdeCpdfa: number[] | undefined;
            if (isUpdate) {
                listQuery.push(...(await this.buildDiffDetalle(ideCpcfa, detalles, dtoIn)));
            } else {
                detallesIdeCpdfa = detalles.map((_, idx) => baseIdeCpdfa! + idx);
                detalles.forEach((det, idx) => {
                    listQuery.push(this.buildInsertDetalle(ideCpcfa, baseIdeCpdfa! + idx, det, dtoIn));
                });
            }

            for (let idx = 0; idx < reembolsos.length; idx++) {
                listQuery.push(await this.buildInsertReembolso(ideCpcfa, baseIdeReembolso! + idx, reembolsos[idx], cabecera, dtoIn));
            }

            for (let idx = 0; idx < reembolsosLiquidacion.length; idx++) {
                listQuery.push(await this.buildInsertReembolsoLiquidacion(
                    baseIdeReembolsoLiquidacion! + idx, ideCpcfa, reembolsosLiquidacion[idx], dtoIn,
                ));
            }

            // Cuenta por pagar: cabecera nueva salvo NC (reutiliza la de la factura
            // original) o compra con anticipo (usa la cabecera del anticipo)
            if (trn.ideCpctr === null) {
                listQuery.push(this.buildInsertTrnCabecera(ideCpctr, ideCpcfa, cabecera, esNotaCredito, dtoIn));
            }
            const ideCpcfaTrnDetalle = esNotaCredito && trn.ideCpcfaFacturaOriginal !== null
                ? trn.ideCpcfaFacturaOriginal
                : ideCpcfa;
            listQuery.push(this.buildInsertTrnDetalle(
                ideCpdtr, ideCpctr, ideCpcfaTrnDetalle, cabecera, totales.total,
                fechaVencimiento, esNotaCredito, dtoIn,
            ));

            // Inventario
            if (generaComprobanteInv && ideIncci !== null && baseIdeIndci !== null) {
                const ideBodega = await this.getBodegaSucursal(dtoIn.ideSucu);
                const numeroIncci = await this.getSecuencialComprobanteInventario(ideBodega);
                listQuery.push(...this.buildKardexQueries(
                    ideIncci, baseIdeIndci, ideCpcfa, numeroIncci, ideBodega,
                    cabecera, detalles, esNotaCredito, dtoIn,
                ));
            } else if (tieneKardex && esNcDescuentoPrecio) {
                listQuery.push(...await this.buildNcDescuentoPrecioQueries(cabecera, detalles));
            }

            // Envío del Reporte de Envío de Facturas (flete): enlaza la factura recién
            // creada y actualiza los valores reales de flete cobrados por el transportista
            if (isDefined(dtoIn.ide_cctfa) && !isUpdate) {
                listQuery.push(this.buildUpdateEnvioTransporte(dtoIn.ide_cctfa!, ideCpcfa, totales, dtoIn));
            }

            // ── Ejecutar todo en una única transacción ───────────────────────
            await this.dataSource.createListQuery(listQuery);

            // El guardado NO envía automáticamente al SRI: el envío es bajo demanda vía
            // enviarSRI(ide_cpcfa), que encola (firma + recepción + autorización + correo).
            return {
                message: 'ok',
                ide_cpcfa: ideCpcfa,
                ide_cpctr: ideCpctr,
                kardex_generado: generaComprobanteInv,
                totales,
                clave_acceso_sri: claveAccesoSri,
                // Solo en creación: ide_cpdfa generado por línea, en el mismo orden que
                // dtoIn.detalles - permite a callers como crearFacturaFleteConsolidada
                // vincular cada línea recién creada sin adivinar el PK.
                detalles_ide_cpdfa: detallesIdeCpdfa,
            };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar el documento CxP: ${msg}`);
        }
    }

    /**
     * Envía bajo demanda una Liquidación de Compra electrónica al SRI: resuelve su clave de
     * acceso y la encola (firma + recepción + autorización); al autorizarse se envía el correo
     * con PDF+XML automáticamente (ComprobanteAutorizadoEmitter / ComprobanteEmailListener).
     */
    async enviarSRI(dtoIn: EnviarSriDocumentoCxPDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT s.claveacceso_srcom
            FROM cxp_cabece_factur a
            INNER JOIN sri_comprobante s ON a.ide_srcom = s.ide_srcom
            WHERE a.ide_cpcfa = $1
        `);
        query.addIntParam(1, dtoIn.ide_cpcfa);
        const row = await this.dataSource.createSingleQuery(query);
        if (!row?.claveacceso_srcom) {
            throw new BadRequestException(
                `El documento ide_cpcfa=${dtoIn.ide_cpcfa} no es una Liquidación de Compra electrónica o no existe.`,
            );
        }
        this.sriEnvioQueueService.encolar(row.claveacceso_srcom, dtoIn);
        return { message: 'ok', ide_cpcfa: dtoIn.ide_cpcfa, clave_acceso_sri: row.claveacceso_srcom };
    }

    /**
     * Anula un documento CxP: cambia estado, anula asiento contable, reversa los
     * pagos de tesorería ya registrados (si existen) y elimina transacciones CxP
     * y de inventario asociadas.
     */
    async anularDocumento(dtoIn: AnularDocumentoCxPDto & HeaderParamsDto) {
        // El documento no puede anularse si tiene un comprobante de retención
        // registrado: primero debe anularse la retención (paridad legacy)
        const qDoc = new SelectQuery(`
            SELECT ide_cncre, ide_cpefa FROM cxp_cabece_factur WHERE ide_cpcfa = $1
        `);
        qDoc.addIntParam(1, dtoIn.ide_cpcfa);
        const doc = await this.dataSource.createSingleQuery(qDoc);
        if (!doc) {
            throw new BadRequestException(`El documento ide_cpcfa=${dtoIn.ide_cpcfa} no existe.`);
        }
        if (doc.ide_cncre) {
            throw new BadRequestException(
                'El documento tiene una retención registrada. Primero anule el comprobante de retención.',
            );
        }
        if (Number(doc.ide_cpefa) === this.ideEstadoAnulada) {
            throw new BadRequestException('El documento ya se encuentra anulado.');
        }

        // Reversar primero los pagos de tesorería ya registrados contra este documento
        // (si existen): cada uno cambia de estado tes_cab_libr_banc, anula su propio
        // asiento contable y elimina su fila de aplicación en cxp_detall_transa. Sin este
        // paso, la eliminación masiva del punto 3 dejaría esos movimientos de banco/caja
        // huérfanos (activos, con asiento vigente) sin ninguna cuenta por pagar que los
        // respalde — paridad con pre_factura_cxp.eliminarFactura() del legacy.
        const pagosQuery = new SelectQuery(`
            SELECT DISTINCT ide_teclb
            FROM cxp_detall_transa
            WHERE ide_cpcfa = $1 AND numero_pago_cpdtr > 0 AND ide_teclb IS NOT NULL
        `);
        pagosQuery.addIntParam(1, dtoIn.ide_cpcfa);
        const pagos = await this.dataSource.createSelectQuery(pagosQuery);
        for (const pago of pagos) {
            await this.preLibroBancosSaveService.anularMovimiento({
                ...dtoIn,
                ideTeclb: Number(pago.ide_teclb),
            });
        }

        const listQuery: ObjectQueryDto[] = [];

        // 1. Marcar factura como anulada
        listQuery.push({
            operation: 'update',
            module: 'cxp',
            tableName: 'cabece_factur',
            primaryKey: 'ide_cpcfa',
            object: {
                ide_cpcfa: dtoIn.ide_cpcfa,
                ide_cpefa: this.ideEstadoAnulada,
            },
        });

        // 2. Buscar y anular asiento contable asociado
        const asientoQuery = new SelectQuery(`
            SELECT ide_cnccc FROM cxp_cabece_factur WHERE ide_cpcfa = $1
        `);
        asientoQuery.addIntParam(1, dtoIn.ide_cpcfa);
        const asiento = await this.dataSource.createSingleQuery(asientoQuery);

        if (asiento?.ide_cnccc) {
            const pEstadoAnulado = this.variables.get('p_con_estado_comprobante_anulado');
            listQuery.push({
                operation: 'update',
                module: 'con',
                tableName: 'cab_comp_cont',
                primaryKey: 'ide_cnccc',
                object: {
                    ide_cnccc: asiento.ide_cnccc,
                    ide_cneco: Number(pEstadoAnulado),
                },
            });
            await this.dataSource.pool.query(
                `UPDATE con_det_comp_cont SET valor_cndcc = 0 WHERE ide_cnccc = $1`,
                [asiento.ide_cnccc],
            );
        }

        // 3. Eliminar transacciones CxP de detalle y cabecera (a esta altura ya sin
        //    filas de pago activas: solo queda el cargo original y, si aplica, la
        //    retención)
        await this.dataSource.pool.query(
            `DELETE FROM cxp_detall_transa WHERE ide_cpcfa = $1`,
            [dtoIn.ide_cpcfa],
        );
        await this.dataSource.pool.query(
            `DELETE FROM cxp_cabece_transa WHERE ide_cpcfa = $1`,
            [dtoIn.ide_cpcfa],
        );

        // 4. Anular comprobante de inventario si existe
        await this.dataSource.pool.query(
            `UPDATE inv_cab_comp_inve
             SET ide_inepi = $2
             WHERE ide_incci IN (
                 SELECT ide_incci FROM inv_det_comp_inve WHERE ide_cpcfa = $1 GROUP BY ide_incci
             )`,
            [dtoIn.ide_cpcfa, this.ideEstadoAnuladoInv],
        );

        return this.core.save({ ...dtoIn, listQuery, audit: false });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIVADO: validaciones
    // ─────────────────────────────────────────────────────────────────────────

    /** Validaciones de negocio migradas de DocumentoCxP.validarDocumento() */
    private async validarDocumento(
        cabecera: CabDocumentoCxPDto,
        detalles: DetalleDocumentoCxPDto[],
        reembolsos: ReembolsoDocumentoCxPDto[],
        reembolsosLiquidacion: ReembolsoLiquidacionCompraDto[],
        totales: Totales,
        esNotaCredito: boolean,
        esReembolso: boolean,
        isUpdate: boolean,
        esElectronica: boolean,
    ) {
        // Proveedor
        const qProv = new SelectQuery(`
            SELECT ide_geper, nom_geper, identificac_geper
            FROM gen_persona
            WHERE ide_geper = $1
        `);
        qProv.addIntParam(1, cabecera.ide_geper);
        const proveedor = await this.dataSource.createSingleQuery(qProv);
        if (!proveedor) {
            throw new BadRequestException(`El proveedor ide_geper=${cabecera.ide_geper} no existe.`);
        }

        // Autorización SRI: en Liquidación de Compra electrónica se genera al guardar, no se valida aquí.
        if (!esElectronica) {
            if (!cabecera.numero_cpcfa || !cabecera.autorizacio_cpcfa) {
                throw new BadRequestException('Debe ingresar el número y la autorización del documento.');
            }
            this.validarLongitudAutorizacion(cabecera.autorizacio_cpcfa, 'del documento');
        }

        // Detalles
        for (const det of detalles) {
            if (!isDefined(det.cantidad_cpdfa) || Number(det.cantidad_cpdfa) <= 0) {
                throw new BadRequestException(
                    `La cantidad del artículo ide_inarti=${det.ide_inarti} debe ser mayor a 0.`,
                );
            }
            if (!isDefined(det.precio_cpdfa) || Number(det.precio_cpdfa) < 0) {
                throw new BadRequestException(
                    `El precio del artículo ide_inarti=${det.ide_inarti} no puede ser negativo.`,
                );
            }
        }

        if (totales.total <= 0) {
            throw new BadRequestException('El total del documento debe ser mayor a 0.');
        }

        // Documento duplicado (mismo número + proveedor + autorización, en estado normal).
        // No aplica a Liquidación de Compra electrónica: numero/autorización aún no existen.
        if (!esElectronica) {
            const qDup = new SelectQuery(`
                SELECT ide_cpcfa
                FROM cxp_cabece_factur
                WHERE numero_cpcfa = $1
                  AND ide_geper = $2
                  AND autorizacio_cpcfa = $3
                  AND ide_cpefa = $4
                LIMIT 1
            `);
            qDup.addStringParam(1, cabecera.numero_cpcfa);
            qDup.addIntParam(2, cabecera.ide_geper);
            qDup.addStringParam(3, cabecera.autorizacio_cpcfa);
            qDup.addIntParam(4, this.ideEstadoNormal);
            const duplicado = await this.dataSource.createSingleQuery(qDup);
            if (duplicado && (!isUpdate || Number(duplicado.ide_cpcfa) !== Number(cabecera.ide_cpcfa))) {
                throw new BadRequestException(
                    `El documento ${cabecera.numero_cpcfa} del proveedor ya se encuentra registrado.`,
                );
            }
        }

        // Nota de crédito: datos de la factura original
        if (esNotaCredito) {
            if (!isDefined(cabecera.ide_cntdo_nc_cpcfa))
                throw new BadRequestException('Debe ingresar el tipo de documento de la factura original de la nota de crédito.');
            if (!cabecera.fecha_emision_nc_cpcfa)
                throw new BadRequestException('Debe ingresar la fecha de emisión de la factura original de la nota de crédito.');
            if (!cabecera.numero_nc_cpcfa)
                throw new BadRequestException('Debe ingresar el número de la factura original de la nota de crédito.');
            if (!cabecera.motivo_nc_cpcfa)
                throw new BadRequestException('Debe ingresar el motivo de la nota de crédito.');
            if (!cabecera.autorizacio_nc_cpcfa)
                throw new BadRequestException('Debe ingresar la autorización de la factura original de la nota de crédito.');
            this.validarLongitudAutorizacion(cabecera.autorizacio_nc_cpcfa, 'de la factura original');
        }

        // Reembolso (tipo de documento REEMBOLSOS, ATS): filas obligatorias y cuadre de totales
        if (esReembolso) {
            if (reembolsos.length === 0) {
                throw new BadRequestException('Debe ingresar al menos un comprobante de reembolso.');
            }
            let totalReembolsos = 0;
            for (const r of reembolsos) {
                totalReembolsos += await this.validarLineaReembolso(r);
            }
            if (Math.abs(totalReembolsos - totales.total) > 0.01) {
                throw new BadRequestException(
                    `La suma de los comprobantes de reembolso (${totalReembolsos.toFixed(2)}) no coincide con el total del documento (${totales.total.toFixed(2)}).`,
                );
            }
        }

        // Líneas de reembolso opcionales dentro de una Liquidación de Compra (Anexo 17 SRI):
        // no son obligatorias ni deben cuadrar con el total del documento.
        for (const r of reembolsosLiquidacion) {
            await this.validarLineaReembolsoLiquidacion(r);
        }
    }

    /**
     * Valida una línea de reembolso y retorna su total. En modo referenciado
     * (ide_cpcfa_referencia) verifica que el documento CxP exista y no haya
     * sido reembolsado ya en otro documento; en modo manual valida los campos
     * ingresados a mano (paridad con el comportamiento original).
     */
    private async validarLineaReembolso(r: ReembolsoDocumentoCxPDto): Promise<number> {
        if (isDefined(r.ide_cpcfa_referencia)) {
            const qRef = new SelectQuery(`
                SELECT total_cpcfa, numero_cpcfa, autorizacio_cpcfa FROM cxp_cabece_factur WHERE ide_cpcfa = $1
            `);
            qRef.addIntParam(1, r.ide_cpcfa_referencia);
            const referencia = await this.dataSource.createSingleQuery(qRef);
            if (!referencia) {
                throw new BadRequestException(`El documento de compra ide_cpcfa=${r.ide_cpcfa_referencia} no existe.`);
            }
            // Duplicado: ¿ya existe una fila hija de reembolso (ide_rem_cpcfa) con el mismo
            // número+autorización del documento referenciado?
            const qDup = new SelectQuery(`
                SELECT ide_cpcfa FROM cxp_cabece_factur
                WHERE ide_rem_cpcfa IS NOT NULL AND numero_cpcfa = $1 AND autorizacio_cpcfa = $2
            `);
            qDup.addStringParam(1, referencia.numero_cpcfa);
            qDup.addStringParam(2, referencia.autorizacio_cpcfa);
            const duplicado = await this.dataSource.createSingleQuery(qDup);
            if (duplicado) {
                throw new BadRequestException(`El documento de compra ide_cpcfa=${r.ide_cpcfa_referencia} ya fue reembolsado en otro documento.`);
            }
            return Number(referencia.total_cpcfa ?? 0);
        }

        if (!isDefined(r.ide_cntdo) || !r.identificacion || !r.numero_cpcfa || !r.fecha_emisi_cpcfa || !r.autorizacio_cpcfa) {
            throw new BadRequestException('Debe ingresar ide_cpcfa_referencia o los datos completos del comprobante de reembolso.');
        }
        this.validarLongitudAutorizacion(r.autorizacio_cpcfa, `del reembolso ${r.numero_cpcfa}`);
        return Number(r.total_cpcfa ?? 0);
    }

    /**
     * Valida una línea de reembolso de Liquidación de Compra (Anexo 17 SRI). En modo
     * referenciado (ide_cpcfa_sustento) verifica que el documento exista y no haya sido
     * reembolsado ya en otro documento; en modo manual valida los campos ingresados a mano
     * (paridad con pre_factura_cxp.java).
     */
    private async validarLineaReembolsoLiquidacion(r: ReembolsoLiquidacionCompraDto): Promise<void> {
        if (isDefined(r.ide_cpcfa_sustento)) {
            const qRef = new SelectQuery(`SELECT ide_cpcfa FROM cxp_cabece_factur WHERE ide_cpcfa = $1`);
            qRef.addIntParam(1, r.ide_cpcfa_sustento);
            const referencia = await this.dataSource.createSingleQuery(qRef);
            if (!referencia) {
                throw new BadRequestException(`El documento de compra ide_cpcfa=${r.ide_cpcfa_sustento} no existe.`);
            }
            const qDup = new SelectQuery(`SELECT ide_cpdcr FROM ${TABLE_REEMBOLSO_LIQUIDACION} WHERE ide_cpcfa_sustento = $1`);
            qDup.addIntParam(1, r.ide_cpcfa_sustento);
            const duplicado = await this.dataSource.createSingleQuery(qDup);
            if (duplicado) {
                throw new BadRequestException(`El documento de compra ide_cpcfa=${r.ide_cpcfa_sustento} ya fue reembolsado en otro documento.`);
            }
            return;
        }

        if (!isDefined(r.ide_cntdo) || !isDefined(r.ide_getid) || !r.identificacion || !r.serie || !r.secuencial || !r.autorizacion || !r.fecha) {
            throw new BadRequestException('Debe ingresar ide_cpcfa_sustento o los datos completos de la línea de reembolso.');
        }
        this.validarLongitudAutorizacion(r.autorizacion, `del reembolso ${r.serie}${r.secuencial}`);
    }

    private validarLongitudAutorizacion(autorizacion: string, contexto: string) {
        if (!LONGITUDES_AUTORIZACION.includes((autorizacion ?? '').trim().length)) {
            throw new BadRequestException(
                `La autorización ${contexto} debe tener 10, 37 o 49 dígitos.`,
            );
        }
    }

    /** Valida que el envío exista y todavía no tenga una factura de flete registrada. */
    private async validarEnvioTransporte(ideCctfa: number): Promise<void> {
        const q = new SelectQuery(`SELECT ide_cpcfa FROM cxc_transporte_factura WHERE ide_cctfa = $1`);
        q.addIntParam(1, ideCctfa);
        const envio = await this.dataSource.createSingleQuery(q);
        if (!envio) {
            throw new BadRequestException(`El envío ide_cctfa=${ideCctfa} no existe.`);
        }
        if (envio.ide_cpcfa) {
            throw new BadRequestException('Este envío ya tiene una factura por pagar registrada.');
        }
    }

    /**
     * Enlaza la factura recién creada al envío y traslada los valores reales del
     * flete (lo que efectivamente facturó el transportista) a cxc_transporte_factura.
     */
    private buildUpdateEnvioTransporte(
        ideCctfa: number,
        ideCpcfa: number,
        totales: Totales,
        dtoIn: SaveDocumentoCxPDto & HeaderParamsDto,
    ): UpdateQuery {
        const q = new UpdateQuery('cxc_transporte_factura', 'ide_cctfa', dtoIn);
        q.values.set('ide_cpcfa', ideCpcfa);
        q.values.set('base_flete_real_cctfa', totales.base_grabada + totales.base_tarifa0 + totales.base_no_objeto_iva);
        q.values.set('valor_iva_flete_real_cctfa', totales.valor_iva);
        q.values.set('total_flete_real_cctfa', totales.total);
        q.values.set('fecha_actua', getCurrentDate());
        q.values.set('hora_actua', getCurrentTime());
        q.where = `ide_cctfa = $1`;
        q.addIntParam(1, ideCctfa);
        return q;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIVADO: resolución de la cabecera de transacción CxP
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Determina la cabecera de cxp_cabece_transa a utilizar:
     *  - Compra con anticipo: usa la cabecera del anticipo seleccionado (no crea una nueva)
     *  - Nota de crédito: reutiliza la cabecera de la factura original (error si no existe)
     *  - Update: reutiliza la cabecera ya asociada al documento
     *  - Resto: siempre se crea una cabecera nueva (ideCpctr = null)
     */
    private async resolverCabeceraTransaccion(
        cabecera: CabDocumentoCxPDto,
        esNotaCredito: boolean,
        isUpdate: boolean,
        dtoIn: SaveDocumentoCxPDto & HeaderParamsDto,
    ): Promise<TrnResuelta> {
        if (isDefined(dtoIn.ide_cpctr_anticipo)) {
            const q = new SelectQuery(`
                SELECT ide_cpctr
                FROM ${TABLE_TRN_CAB}
                WHERE ide_cpctr = $1
                  AND ide_geper = $2
                  AND ide_cpcfa IS NULL
            `);
            q.addIntParam(1, dtoIn.ide_cpctr_anticipo);
            q.addIntParam(2, cabecera.ide_geper);
            const anticipo = await this.dataSource.createSingleQuery(q);
            if (!anticipo) {
                throw new BadRequestException(
                    `El anticipo ide_cpctr=${dtoIn.ide_cpctr_anticipo} no existe, no pertenece al proveedor o ya está asociado a un documento.`,
                );
            }
            return { ideCpctr: Number(anticipo.ide_cpctr), ideCpcfaFacturaOriginal: null };
        }

        if (esNotaCredito) {
            const q = new SelectQuery(`
                SELECT ide_cpctr, ide_cpcfa
                FROM ${TABLE_TRN_CAB}
                WHERE ide_cpcfa IN (
                    SELECT ide_cpcfa
                    FROM cxp_cabece_factur
                    WHERE numero_cpcfa = $1 AND autorizacio_cpcfa = $2
                )
                LIMIT 1
            `);
            q.addStringParam(1, cabecera.numero_nc_cpcfa);
            q.addStringParam(2, cabecera.autorizacio_nc_cpcfa);
            const original = await this.dataSource.createSingleQuery(q);
            if (!original) {
                throw new BadRequestException(
                    `No existe la transacción de la factura original ${cabecera.numero_nc_cpcfa} para registrar la nota de crédito.`,
                );
            }
            return {
                ideCpctr: Number(original.ide_cpctr),
                ideCpcfaFacturaOriginal: Number(original.ide_cpcfa),
            };
        }

        if (isUpdate) {
            const q = new SelectQuery(`
                SELECT ide_cpctr FROM ${TABLE_TRN_CAB} WHERE ide_cpcfa = $1 LIMIT 1
            `);
            q.addIntParam(1, cabecera.ide_cpcfa);
            const existente = await this.dataSource.createSingleQuery(q);
            if (existente) {
                return { ideCpctr: Number(existente.ide_cpctr), ideCpcfaFacturaOriginal: null };
            }
        }

        return { ideCpctr: null, ideCpcfaFacturaOriginal: null };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BUILDERS: constructores de InsertQuery / UpdateQuery / DeleteQuery
    // ─────────────────────────────────────────────────────────────────────────

    private buildInsertCabecera(
        ideCpcfa: number,
        cabecera: CabDocumentoCxPDto,
        totales: Totales,
        tarifaIva: number,
        diasCredito: number,
        dtoIn: SaveDocumentoCxPDto & HeaderParamsDto,
        ideSrcom?: number,
    ): InsertQuery {
        const q = new InsertQuery(`${MODULE}_${TABLE_CAB}`, PK_CAB, dtoIn);
        q.values.set(PK_CAB, ideCpcfa);
        q.values.set('ide_srcom', ideSrcom ?? null);
        q.values.set('ide_cntdo', cabecera.ide_cntdo);
        q.values.set('ide_geper', cabecera.ide_geper);
        q.values.set('ide_cpefa', this.ideEstadoNormal);
        q.values.set('ide_cndfp', cabecera.ide_cndfp);
        q.values.set('ide_cndfp1', cabecera.ide_cndfp1);
        q.values.set('ide_srtst', cabecera.ide_srtst ?? 6);
        q.values.set('ide_usua', dtoIn.ideUsua);
        q.values.set('numero_cpcfa', cabecera.numero_cpcfa);
        q.values.set('autorizacio_cpcfa', cabecera.autorizacio_cpcfa);
        q.values.set('fecha_emisi_cpcfa', cabecera.fecha_emisi_cpcfa);
        // fecha_trans_cpcfa debe coincidir con la fecha de emisión del XML del proveedor
        // (declaraciones SRI / conciliaciones dependen de esto) - antes usaba getCurrentDate(),
        // que solo coincidía con la emisión si la factura se registraba el mismo día.
        q.values.set('fecha_trans_cpcfa', cabecera.fecha_emisi_cpcfa);
        q.values.set('observacion_cpcfa', cabecera.observacion_cpcfa);
        q.values.set('base_grabada_cpcfa', totales.base_grabada);
        q.values.set('base_no_objeto_iva_cpcfa', totales.base_no_objeto_iva);
        q.values.set('base_tarifa0_cpcfa', totales.base_tarifa0);
        q.values.set('valor_iva_cpcfa', totales.valor_iva);
        q.values.set('total_cpcfa', totales.total);
        q.values.set('descuento_cpcfa', cabecera.descuento_cpcfa ?? 0);
        q.values.set('porcen_desc_cpcfa', cabecera.porcen_desc_cpcfa ?? 0);
        q.values.set('otros_cpcfa', cabecera.otros_cpcfa ?? 0);
        q.values.set('valor_ice_cpcfa', cabecera.valor_ice_cpcfa ?? 0);
        // La tarifa se persiste como fracción (0.15), no como porcentaje
        q.values.set('tarifa_iva_cpcfa', tarifaIva);
        q.values.set('dias_credito_cpcfa', diasCredito);
        q.values.set('pagado_cpcfa', false);
        // Nota de crédito
        q.values.set('ide_cntdo_nc_cpcfa', cabecera.ide_cntdo_nc_cpcfa ?? null);
        q.values.set('fecha_emision_nc_cpcfa', cabecera.fecha_emision_nc_cpcfa ?? null);
        q.values.set('numero_nc_cpcfa', cabecera.numero_nc_cpcfa ?? null);
        q.values.set('autorizacio_nc_cpcfa', cabecera.autorizacio_nc_cpcfa ?? null);
        q.values.set('motivo_nc_cpcfa', cabecera.motivo_nc_cpcfa ?? null);
        q.values.set('fecha_ingre', getCurrentDate());
        q.values.set('hora_ingre', getCurrentTime());
        return q;
    }

    private buildUpdateCabecera(
        ideCpcfa: number,
        cabecera: CabDocumentoCxPDto,
        totales: Totales,
        tarifaIva: number,
        diasCredito: number,
        dtoIn: SaveDocumentoCxPDto & HeaderParamsDto,
    ): UpdateQuery {
        const q = new UpdateQuery(`${MODULE}_${TABLE_CAB}`, PK_CAB, dtoIn);
        q.values.set('ide_cntdo', cabecera.ide_cntdo);
        q.values.set('ide_geper', cabecera.ide_geper);
        q.values.set('ide_cndfp', cabecera.ide_cndfp);
        q.values.set('ide_cndfp1', cabecera.ide_cndfp1);
        q.values.set('ide_srtst', cabecera.ide_srtst ?? 6);
        q.values.set('numero_cpcfa', cabecera.numero_cpcfa);
        q.values.set('autorizacio_cpcfa', cabecera.autorizacio_cpcfa);
        q.values.set('fecha_emisi_cpcfa', cabecera.fecha_emisi_cpcfa);
        q.values.set('observacion_cpcfa', cabecera.observacion_cpcfa);
        q.values.set('base_grabada_cpcfa', totales.base_grabada);
        q.values.set('base_no_objeto_iva_cpcfa', totales.base_no_objeto_iva);
        q.values.set('base_tarifa0_cpcfa', totales.base_tarifa0);
        q.values.set('valor_iva_cpcfa', totales.valor_iva);
        q.values.set('total_cpcfa', totales.total);
        q.values.set('descuento_cpcfa', cabecera.descuento_cpcfa ?? 0);
        q.values.set('porcen_desc_cpcfa', cabecera.porcen_desc_cpcfa ?? 0);
        q.values.set('otros_cpcfa', cabecera.otros_cpcfa ?? 0);
        q.values.set('valor_ice_cpcfa', cabecera.valor_ice_cpcfa ?? 0);
        q.values.set('tarifa_iva_cpcfa', tarifaIva);
        q.values.set('dias_credito_cpcfa', diasCredito);
        q.values.set('ide_cntdo_nc_cpcfa', cabecera.ide_cntdo_nc_cpcfa ?? null);
        q.values.set('fecha_emision_nc_cpcfa', cabecera.fecha_emision_nc_cpcfa ?? null);
        q.values.set('numero_nc_cpcfa', cabecera.numero_nc_cpcfa ?? null);
        q.values.set('autorizacio_nc_cpcfa', cabecera.autorizacio_nc_cpcfa ?? null);
        q.values.set('motivo_nc_cpcfa', cabecera.motivo_nc_cpcfa ?? null);
        q.values.set('fecha_actua', getCurrentDate());
        q.values.set('hora_actua', getCurrentTime());
        q.where = `${PK_CAB} = $1 AND ide_empr = $2`;
        q.addIntParam(1, ideCpcfa);
        q.addIntParam(2, dtoIn.ideEmpr);
        return q;
    }

    /**
     * En update se recrean las dependencias del documento: filas de reembolso, el
     * detalle de la transacción CxP (solo el cargo original, numero_pago = 0) y el
     * comprobante de inventario. El detalle (cxp_detall_factur) NO se recrea acá -
     * se actualiza de forma diferencial en buildDiffDetalle para preservar el
     * ide_cpdfa de las líneas que no cambiaron (ver saveDocumento).
     */
    private buildDeleteDependencias(ideCpcfa: number, ideCpctr: number | null): DeleteQuery[] {
        const queries: DeleteQuery[] = [];

        const delReembolsos = new DeleteQuery(`${MODULE}_${TABLE_CAB}`);
        delReembolsos.where = `ide_rem_cpcfa = $1`;
        delReembolsos.addIntParam(1, ideCpcfa);
        queries.push(delReembolsos);

        const delReembolsosLiquidacion = new DeleteQuery(TABLE_REEMBOLSO_LIQUIDACION);
        delReembolsosLiquidacion.where = `ide_cpcfa = $1`;
        delReembolsosLiquidacion.addIntParam(1, ideCpcfa);
        queries.push(delReembolsosLiquidacion);

        if (ideCpctr !== null) {
            const delTrnDet = new DeleteQuery(TABLE_TRN_DET);
            delTrnDet.where = `ide_cpctr = $1 AND ide_cpcfa = $2 AND numero_pago_cpdtr = 0`;
            delTrnDet.addIntParam(1, ideCpctr);
            delTrnDet.addIntParam(2, ideCpcfa);
            queries.push(delTrnDet);
        }

        // El comprobante de inventario se elimina (cabecera vía subconsulta antes
        // que el detalle) y se vuelve a generar con los nuevos detalles
        const delInvCab = new DeleteQuery(TABLE_INV_CAB);
        delInvCab.where = `${PK_INV_CAB} IN (SELECT ${PK_INV_CAB} FROM ${TABLE_INV_DET} WHERE ${PK_CAB} = $1)`;
        delInvCab.addIntParam(1, ideCpcfa);
        queries.push(delInvCab);

        const delInvDet = new DeleteQuery(TABLE_INV_DET);
        delInvDet.where = `${PK_CAB} = $1`;
        delInvDet.addIntParam(1, ideCpcfa);
        queries.push(delInvDet);

        return queries;
    }

    private buildInsertDetalle(
        ideCpcfa: number,
        ideCpdfa: number,
        det: DetalleDocumentoCxPDto,
        dtoIn: SaveDocumentoCxPDto & HeaderParamsDto,
    ): InsertQuery {
        const q = new InsertQuery(`${MODULE}_${TABLE_DET}`, PK_DET, dtoIn);
        q.values.set(PK_DET, ideCpdfa);
        q.values.set(PK_CAB, ideCpcfa);
        q.values.set('ide_inarti', det.ide_inarti);
        q.values.set('ide_inuni', det.ide_inuni ?? null);
        q.values.set('cantidad_cpdfa', det.cantidad_cpdfa);
        q.values.set('precio_cpdfa', det.precio_cpdfa);
        q.values.set('valor_cpdfa', Number(((det.cantidad_cpdfa || 0) * (det.precio_cpdfa || 0)).toFixed(2)));
        q.values.set('iva_inarti_cpdfa', det.iva_inarti_cpdfa);
        q.values.set('observacion_cpdfa', det.observacion_cpdfa ?? null);
        q.values.set('secuencial_cpdfa', det.secuencial_cpdfa ?? null);
        q.values.set('alter_tribu_cpdfa', det.alter_tribu_cpdfa ?? '00');
        q.values.set('devolucion_cpdfa', false);
        q.values.set('credit_tribu_cpdfa', null);
        q.values.set('fecha_ingre', getCurrentDate());
        q.values.set('hora_ingre', getCurrentTime());
        return q;
    }

    private buildUpdateDetalle(
        ideCpcfa: number,
        ideCpdfa: number,
        det: DetalleDocumentoCxPDto,
        dtoIn: SaveDocumentoCxPDto & HeaderParamsDto,
    ): UpdateQuery {
        const q = new UpdateQuery(`${MODULE}_${TABLE_DET}`, PK_DET, dtoIn);
        q.where = `${PK_DET} = $1 AND ${PK_CAB} = $2`;
        q.addIntParam(1, ideCpdfa);
        q.addIntParam(2, ideCpcfa);
        q.values.set('ide_inarti', det.ide_inarti);
        q.values.set('ide_inuni', det.ide_inuni ?? null);
        q.values.set('cantidad_cpdfa', det.cantidad_cpdfa);
        q.values.set('precio_cpdfa', det.precio_cpdfa);
        q.values.set('valor_cpdfa', Number(((det.cantidad_cpdfa || 0) * (det.precio_cpdfa || 0)).toFixed(2)));
        q.values.set('iva_inarti_cpdfa', det.iva_inarti_cpdfa);
        q.values.set('observacion_cpdfa', det.observacion_cpdfa ?? null);
        q.values.set('secuencial_cpdfa', det.secuencial_cpdfa ?? null);
        q.values.set('alter_tribu_cpdfa', det.alter_tribu_cpdfa ?? '00');
        return q;
    }

    /**
     * Antes de borrar líneas de cxp_detall_factur (ver buildDiffDetalle), verifica que
     * ninguna esté vinculada a un proceso de "Registrar Pago Consolidado" activo
     * (cxp_det_flete_cons.ide_cpdfa, ON DELETE RESTRICT) y lanza un error claro en vez
     * de dejar que reviente como violación de FK cruda contra el usuario.
     */
    private async validarSinReferenciasHijas(ideCpdfaEliminar: number[]): Promise<void> {
        const q = new SelectQuery(
            `SELECT ide_cpcfc FROM cxp_det_flete_cons WHERE ide_cpdfa = ANY($1) LIMIT 1`,
        );
        q.addParam(1, ideCpdfaEliminar);
        const row = await this.dataSource.createSingleQuery(q);
        if (row) {
            throw new BadRequestException(
                `Esta línea pertenece al proceso de Pago Consolidado de Flete #${row.ide_cpcfc}. ` +
                'Anule ese proceso primero si necesita modificarla o eliminarla.',
            );
        }
    }

    /**
     * Actualización diferencial de cxp_detall_factur para el update de un documento:
     * a diferencia de las demás dependencias (ver buildDeleteDependencias), el detalle
     * NO se borra y recrea completo en cada edición - se compara contra lo que ya
     * existe en la BD para preservar el ide_cpdfa de las líneas no tocadas. Esto es lo
     * que permite que otras tablas (como cxp_det_flete_cons) puedan referenciar una
     * línea de factura de forma estable entre ediciones.
     *  - Línea entrante CON ide_cpdfa que ya existe en este documento → UPDATE en el
     *    lugar (mismo PK).
     *  - Línea entrante SIN ide_cpdfa → INSERT (PK nuevo).
     *  - Línea existente en BD que no vino en el payload → DELETE (solo esa fila).
     *  - Línea entrante CON ide_cpdfa que NO pertenece a este documento (payload
     *    manipulado o repetido) → rechazada de una, sin escribir nada.
     */
    /**
     * true si `det` no aporta ningún cambio real respecto a la fila ya guardada - en ese caso
     * buildDiffDetalle se salta el UPDATE por completo. Sin esto, guardar una edición sin tocar
     * una línea igual la marcaría como "modificada" (UpdateQuery pisa usuario_actua/hora_actua
     * de forma automática, ver update-query.ts) y generaría una escritura MVCC sin necesidad.
     */
    private detalleSinCambios(det: DetalleDocumentoCxPDto, existente: Record<string, any>): boolean {
        const norm = (v: unknown) => (v === undefined ? null : v);
        return (
            Number(det.ide_inarti) === Number(existente.ide_inarti) &&
            Number(norm(det.ide_inuni) ?? -1) === Number(existente.ide_inuni ?? -1) &&
            Number(det.cantidad_cpdfa) === Number(existente.cantidad_cpdfa) &&
            Number(det.precio_cpdfa) === Number(existente.precio_cpdfa) &&
            Number(det.iva_inarti_cpdfa) === Number(existente.iva_inarti_cpdfa) &&
            String(norm(det.observacion_cpdfa) ?? '') === String(existente.observacion_cpdfa ?? '') &&
            String(norm(det.secuencial_cpdfa) ?? '') === String(existente.secuencial_cpdfa ?? '') &&
            String(det.alter_tribu_cpdfa ?? '00') === String(existente.alter_tribu_cpdfa ?? '00')
        );
    }

    private async buildDiffDetalle(
        ideCpcfa: number,
        detalles: DetalleDocumentoCxPDto[],
        dtoIn: SaveDocumentoCxPDto & HeaderParamsDto,
    ): Promise<Query[]> {
        const qExistentes = new SelectQuery(`
            SELECT ${PK_DET}, ide_inarti, ide_inuni, cantidad_cpdfa, precio_cpdfa, iva_inarti_cpdfa,
                   observacion_cpdfa, secuencial_cpdfa, alter_tribu_cpdfa
            FROM ${MODULE}_${TABLE_DET}
            WHERE ${PK_CAB} = $1
        `);
        qExistentes.addIntParam(1, ideCpcfa);
        const existentes: Record<string, any>[] = await this.dataSource.createSelectQuery(qExistentes);
        const existentesPorId = new Map(existentes.map((r) => [Number(r.ide_cpdfa), r]));
        const idsExistentes = new Set(existentesPorId.keys());

        const toUpdate = detalles.filter((d) => isDefined(d.ide_cpdfa));
        const toInsert = detalles.filter((d) => !isDefined(d.ide_cpdfa));

        const idsIncoming = new Set<number>();
        for (const d of toUpdate) {
            const id = Number(d.ide_cpdfa);
            if (!idsExistentes.has(id)) {
                throw new BadRequestException(
                    `La línea ide_cpdfa=${id} no pertenece al documento ide_cpcfa=${ideCpcfa}.`,
                );
            }
            if (idsIncoming.has(id)) {
                throw new BadRequestException(`La línea ide_cpdfa=${id} está repetida en el detalle enviado.`);
            }
            idsIncoming.add(id);
        }

        const toDeleteIds = [...idsExistentes].filter((id) => !idsIncoming.has(id));
        if (toDeleteIds.length > 0) {
            await this.validarSinReferenciasHijas(toDeleteIds);
        }

        const queries: Query[] = [];

        if (toDeleteIds.length > 0) {
            const delDetalles = new DeleteQuery(`${MODULE}_${TABLE_DET}`);
            delDetalles.where = `${PK_DET} = ANY($1) AND ${PK_CAB} = $2`;
            delDetalles.addParam(1, toDeleteIds);
            delDetalles.addIntParam(2, ideCpcfa);
            queries.push(delDetalles);
        }

        for (const d of toUpdate) {
            const id = Number(d.ide_cpdfa);
            if (this.detalleSinCambios(d, existentesPorId.get(id)!)) continue;
            queries.push(this.buildUpdateDetalle(ideCpcfa, id, d, dtoIn));
        }

        if (toInsert.length > 0) {
            const baseIdeCpdfaNuevo = await this.dataSource.getSeqTable(
                `${MODULE}_${TABLE_DET}`, PK_DET, toInsert.length, dtoIn.login,
            );
            toInsert.forEach((det, idx) => {
                queries.push(this.buildInsertDetalle(ideCpcfa, baseIdeCpdfaNuevo + idx, det, dtoIn));
            });
        }

        return queries;
    }

    /**
     * Fila hija de reembolso en cxp_cabece_factur, enlazada al documento padre por
     * ide_rem_cpcfa. Usado únicamente por el tipo de documento REEMBOLSOS (ATS) —
     * excluye estas sub-facturas de ATS/Formulario 103/104 (paridad legacy,
     * componentes/DocumentoCxP.java). Para Liquidación de Compra ver
     * buildInsertReembolsoLiquidacion (Anexo 17 SRI, cxp_datos_com_reembolso).
     *
     * Modo referenciado (r.ide_cpcfa_referencia): copia proveedor/documento/impuestos
     * del documento CxP real referenciado — a diferencia del modo manual, ide_geper es
     * el proveedor REAL del documento reembolsado, no el del documento padre.
     * Modo manual: comportamiento original (paridad legacy), identificación del emisor
     * en motivo_nc_cpcfa.
     */
    private async buildInsertReembolso(
        ideCpcfaPadre: number,
        ideCpcfaHijo: number,
        r: ReembolsoDocumentoCxPDto,
        cabecera: CabDocumentoCxPDto,
        dtoIn: SaveDocumentoCxPDto & HeaderParamsDto,
    ): Promise<InsertQuery> {
        const q = new InsertQuery(`${MODULE}_${TABLE_CAB}`, PK_CAB, dtoIn);
        q.values.set(PK_CAB, ideCpcfaHijo);
        q.values.set('ide_rem_cpcfa', ideCpcfaPadre);
        q.values.set('ide_cpefa', this.ideEstadoNormal);
        q.values.set('ide_usua', dtoIn.ideUsua);
        q.values.set('fecha_trans_cpcfa', getCurrentDate());
        q.values.set('pagado_cpcfa', false);
        q.values.set('fecha_ingre', getCurrentDate());
        q.values.set('hora_ingre', getCurrentTime());

        if (isDefined(r.ide_cpcfa_referencia)) {
            const qDoc = new SelectQuery(`
                SELECT ide_geper, ide_cntdo, numero_cpcfa, autorizacio_cpcfa, fecha_emisi_cpcfa,
                       base_grabada_cpcfa, base_no_objeto_iva_cpcfa, base_tarifa0_cpcfa,
                       valor_iva_cpcfa, valor_ice_cpcfa, total_cpcfa
                FROM cxp_cabece_factur WHERE ide_cpcfa = $1
            `);
            qDoc.addIntParam(1, r.ide_cpcfa_referencia);
            const doc = await this.dataSource.createSingleQuery(qDoc);

            const qProv = new SelectQuery(`
                SELECT identificac_geper
                FROM gen_persona
                WHERE ide_geper = $1
            `);
            qProv.addIntParam(1, doc.ide_geper);
            const prov = await this.dataSource.createSingleQuery(qProv);

            q.values.set('ide_cntdo', doc.ide_cntdo);
            q.values.set('ide_geper', doc.ide_geper);
            q.values.set('numero_cpcfa', doc.numero_cpcfa);
            q.values.set('autorizacio_cpcfa', doc.autorizacio_cpcfa);
            q.values.set('fecha_emisi_cpcfa', doc.fecha_emisi_cpcfa);
            q.values.set('motivo_nc_cpcfa', prov?.identificac_geper ?? null);
            q.values.set('base_grabada_cpcfa', doc.base_grabada_cpcfa ?? 0);
            q.values.set('base_no_objeto_iva_cpcfa', doc.base_no_objeto_iva_cpcfa ?? 0);
            q.values.set('base_tarifa0_cpcfa', doc.base_tarifa0_cpcfa ?? 0);
            q.values.set('valor_iva_cpcfa', doc.valor_iva_cpcfa ?? 0);
            q.values.set('valor_ice_cpcfa', doc.valor_ice_cpcfa ?? 0);
            q.values.set('total_cpcfa', doc.total_cpcfa);
        } else {
            q.values.set('ide_cntdo', r.ide_cntdo);
            q.values.set('ide_geper', cabecera.ide_geper);
            q.values.set('numero_cpcfa', r.numero_cpcfa);
            q.values.set('autorizacio_cpcfa', r.autorizacio_cpcfa);
            q.values.set('fecha_emisi_cpcfa', r.fecha_emisi_cpcfa);
            q.values.set('motivo_nc_cpcfa', r.identificacion);
            q.values.set('base_grabada_cpcfa', r.base_grabada_cpcfa ?? 0);
            q.values.set('base_no_objeto_iva_cpcfa', r.base_no_objeto_iva_cpcfa ?? 0);
            q.values.set('base_tarifa0_cpcfa', r.base_tarifa0_cpcfa ?? 0);
            q.values.set('valor_iva_cpcfa', r.valor_iva_cpcfa ?? 0);
            q.values.set('valor_ice_cpcfa', r.valor_ice_cpcfa ?? 0);
            q.values.set('total_cpcfa', r.total_cpcfa);
        }
        return q;
    }

    /**
     * Línea de reembolso de gastos de una Liquidación de Compra (Anexo 17 SRI), en
     * cxp_datos_com_reembolso (tabla ya existente en el core, usada por
     * pkg_cuentas_x_pagar/pre_factura_cxp.java del legacy para este mismo propósito).
     *
     * Modo referenciado (r.ide_cpcfa_sustento): copia proveedor/documento/impuestos del
     * documento CxP real referenciado. Modo manual: los campos se ingresan a mano
     * (paridad legacy). tipoProveedorReembolso (Tabla 26 SRI) no se guarda: se deriva al
     * armar el XML a partir de ide_getid + identificacion_cpdcr (ver comprobantes-elec.service.ts).
     */
    private async buildInsertReembolsoLiquidacion(
        ideCpdcr: number,
        ideCpcfaPadre: number,
        r: ReembolsoLiquidacionCompraDto,
        dtoIn: SaveDocumentoCxPDto & HeaderParamsDto,
    ): Promise<InsertQuery> {
        const q = new InsertQuery(TABLE_REEMBOLSO_LIQUIDACION, PK_REEMBOLSO_LIQUIDACION, dtoIn);
        q.values.set(PK_REEMBOLSO_LIQUIDACION, ideCpdcr);
        q.values.set('ide_cpcfa', ideCpcfaPadre);
        q.values.set('ide_empr', dtoIn.ideEmpr);
        q.values.set('ide_sucu', dtoIn.ideSucu);
        q.values.set('cod_pais_pago_cpdcr', r.cod_pais_pago ?? 593);

        if (isDefined(r.ide_cpcfa_sustento)) {
            const qDoc = new SelectQuery(`
                SELECT d.ide_cntdo, d.numero_cpcfa, d.autorizacio_cpcfa, d.fecha_emisi_cpcfa,
                       d.base_no_objeto_iva_cpcfa, d.base_tarifa0_cpcfa, d.base_grabada_cpcfa,
                       d.valor_iva_cpcfa, d.valor_ice_cpcfa,
                       p.identificac_geper, p.ide_getid
                FROM cxp_cabece_factur d
                INNER JOIN gen_persona p ON d.ide_geper = p.ide_geper
                WHERE d.ide_cpcfa = $1
            `);
            qDoc.addIntParam(1, r.ide_cpcfa_sustento);
            const doc = await this.dataSource.createSingleQuery(qDoc);

            const { estab, ptoEmi, secuencial } = this.splitNumeroDocumento(doc.numero_cpcfa);
            q.values.set('ide_cpcfa_sustento', r.ide_cpcfa_sustento);
            q.values.set('ide_cntdo', doc.ide_cntdo);
            q.values.set('ide_getid', doc.ide_getid);
            q.values.set('identificacion_cpdcr', doc.identificac_geper);
            q.values.set('serie_cpdcr', `${estab}${ptoEmi}`);
            q.values.set('secuencial_cpdcr', secuencial);
            q.values.set('autorizacion_cpdcr', doc.autorizacio_cpcfa);
            q.values.set('fecha_cpdcr', doc.fecha_emisi_cpcfa);
            q.values.set('base_no_objeto_cpdcr', doc.base_no_objeto_iva_cpcfa ?? 0);
            q.values.set('base_tarifa0_cpdcr', doc.base_tarifa0_cpcfa ?? 0);
            q.values.set('base_imponible_cpdcr', doc.base_grabada_cpcfa ?? 0);
            q.values.set('valor_iva_cpdcr', doc.valor_iva_cpcfa ?? 0);
            q.values.set('valor_ice_cpdcr', doc.valor_ice_cpcfa ?? 0);
        } else {
            q.values.set('ide_cpcfa_sustento', null);
            q.values.set('ide_cntdo', r.ide_cntdo);
            q.values.set('ide_getid', r.ide_getid);
            q.values.set('identificacion_cpdcr', r.identificacion);
            q.values.set('serie_cpdcr', r.serie);
            q.values.set('secuencial_cpdcr', r.secuencial);
            q.values.set('autorizacion_cpdcr', r.autorizacion);
            q.values.set('fecha_cpdcr', r.fecha);
            q.values.set('base_no_objeto_cpdcr', r.base_no_objeto ?? 0);
            q.values.set('base_tarifa0_cpdcr', r.base_tarifa0 ?? 0);
            q.values.set('base_imponible_cpdcr', r.base_imponible ?? 0);
            q.values.set('valor_iva_cpdcr', r.valor_iva ?? 0);
            q.values.set('valor_ice_cpdcr', r.valor_ice ?? 0);
        }
        return q;
    }

    /**
     * Cabecera de la transacción CxP (cxp_cabece_transa).
     * Siempre se crea una nueva, salvo NC (reutiliza la de la factura original)
     * y compra con anticipo (usa la del anticipo).
     */
    private buildInsertTrnCabecera(
        ideCpctr: number,
        ideCpcfa: number,
        cabecera: CabDocumentoCxPDto,
        esNotaCredito: boolean,
        dtoIn: SaveDocumentoCxPDto & HeaderParamsDto,
    ): InsertQuery {
        const q = new InsertQuery(TABLE_TRN_CAB, PK_TRN_CAB, dtoIn);
        q.values.set(PK_TRN_CAB, ideCpctr);
        q.values.set(PK_CAB, ideCpcfa);
        q.values.set('ide_geper', cabecera.ide_geper);
        q.values.set('ide_cpttr', esNotaCredito ? IDE_CPTTR_NOTA_CREDITO : this.ideTipoTransFactura);
        q.values.set('fecha_trans_cpctr', getCurrentDate());
        q.values.set(
            'observacion_cpctr',
            esNotaCredito
                ? `V/. NOTA DE CREDITO ${cabecera.numero_cpcfa}`
                : `V/. FACTURA ${cabecera.numero_cpcfa}`,
        );
        q.values.set('fecha_ingre', getCurrentDate());
        q.values.set('hora_ingre', getCurrentTime());
        return q;
    }

    /**
     * Detalle de la transacción CxP (cxp_detall_transa): la cuota única del
     * documento. fecha_venci = fecha emisión + días crédito, numero_pago = 0.
     */
    private buildInsertTrnDetalle(
        ideCpdtr: number,
        ideCpctr: number,
        ideCpcfa: number,
        cabecera: CabDocumentoCxPDto,
        valorTotal: number,
        fechaVencimiento: string,
        esNotaCredito: boolean,
        dtoIn: SaveDocumentoCxPDto & HeaderParamsDto,
    ): InsertQuery {
        const q = new InsertQuery(TABLE_TRN_DET, PK_TRN_DET, dtoIn);
        q.values.set(PK_TRN_DET, ideCpdtr);
        q.values.set(PK_TRN_CAB, ideCpctr);
        q.values.set(PK_CAB, ideCpcfa);
        q.values.set('ide_cpttr', esNotaCredito ? IDE_CPTTR_NOTA_CREDITO : this.ideTipoTransFactura);
        q.values.set('ide_usua', dtoIn.ideUsua);
        q.values.set('fecha_trans_cpdtr', getCurrentDate());
        q.values.set('fecha_venci_cpdtr', fechaVencimiento);
        q.values.set('valor_cpdtr', valorTotal);
        q.values.set('observacion_cpdtr', cabecera.observacion_cpcfa);
        q.values.set('numero_pago_cpdtr', 0);
        q.values.set('docum_relac_cpdtr', cabecera.numero_cpcfa);
        q.values.set('valor_anticipo_cpdtr', 0);
        q.values.set('fecha_ingre', getCurrentDate());
        q.values.set('hora_ingre', getCurrentTime());
        // ide_cnccc (asiento contable) queda NULL: se vincula al contabilizar
        return q;
    }

    /**
     * Comprobante de inventario del documento (ingreso por compra, o reversa 13
     * cuando es nota de crédito). Paridad legacy: incluye TODOS los detalles y
     * aplica el descuento porcentual de la cabecera al precio de cada línea.
     */
    private buildKardexQueries(
        ideIncci: number,
        baseIdeIndci: number,
        ideCpcfa: number,
        numeroIncci: string,
        ideBodega: number,
        cabecera: CabDocumentoCxPDto,
        detalles: DetalleDocumentoCxPDto[],
        esNotaCredito: boolean,
        dtoIn: SaveDocumentoCxPDto & HeaderParamsDto,
    ): InsertQuery[] {
        const queries: InsertQuery[] = [];
        const observacion = esNotaCredito
            ? `V/. NOTA DE CREDITO FAC. ${cabecera.numero_cpcfa}`
            : cabecera.observacion_cpcfa;

        const qCab = new InsertQuery(TABLE_INV_CAB, PK_INV_CAB, dtoIn);
        qCab.values.set(PK_INV_CAB, ideIncci);
        qCab.values.set('ide_geper', cabecera.ide_geper);
        qCab.values.set('ide_intti', esNotaCredito ? IDE_INTTI_REVERSA_NC : this.ideTipoTransaccionCompraInv);
        qCab.values.set('ide_inbod', ideBodega);
        qCab.values.set('ide_inepi', this.ideEstadoNormalInv);
        qCab.values.set('ide_usua', dtoIn.ideUsua);
        qCab.values.set('numero_incci', numeroIncci);
        qCab.values.set('fecha_trans_incci', cabecera.fecha_emisi_cpcfa);
        qCab.values.set('fecha_efect_incci', cabecera.fecha_emisi_cpcfa);
        qCab.values.set('observacion_incci', observacion);
        qCab.values.set('referencia_incci', cabecera.numero_cpcfa.slice(-12));
        qCab.values.set('automatico_incci', true);
        qCab.values.set('verifica_incci', false);
        qCab.values.set('fecha_ingre', getCurrentDate());
        qCab.values.set('hora_ingre', getCurrentTime());
        queries.push(qCab);

        const porceDescuento = Number(cabecera.porcen_desc_cpcfa ?? 0);

        detalles.forEach((det, idx) => {
            let precio = Number(det.precio_cpdfa);
            if (porceDescuento > 0) {
                precio = precio - precio * (porceDescuento / 100);
            }
            const valor = Number((Number(det.cantidad_cpdfa) * precio).toFixed(2));

            const qDet = new InsertQuery(TABLE_INV_DET, PK_INV_DET, dtoIn);
            qDet.values.set(PK_INV_DET, baseIdeIndci + idx);
            qDet.values.set(PK_INV_CAB, ideIncci);
            qDet.values.set('ide_inarti', det.ide_inarti);
            qDet.values.set(PK_CAB, ideCpcfa);
            qDet.values.set('secuencial_indci', String(idx + 1).padStart(6, '0'));
            qDet.values.set('cantidad_indci', Number(Number(det.cantidad_cpdfa).toFixed(3)));
            qDet.values.set('precio_indci', precio);
            qDet.values.set('valor_indci', valor);
            qDet.values.set('observacion_indci', det.observacion_cpdfa ?? null);
            qDet.values.set('fecha_ingre', getCurrentDate());
            qDet.values.set('hora_ingre', getCurrentTime());
            queries.push(qDet);
        });

        return queries;
    }

    /**
     * Nota de crédito por 'DESCUENTO EN PRECIO': no mueve stock. Actualiza
     * cantidad/precio/valor de los inv_det_comp_inve de la factura original
     * (localizada por numero_nc_cpcfa + proveedor), matcheando por artículo.
     */
    private async buildNcDescuentoPrecioQueries(
        cabecera: CabDocumentoCxPDto,
        detalles: DetalleDocumentoCxPDto[],
    ): Promise<UpdateQuery[]> {
        const qFactura = new SelectQuery(`
            SELECT ide_cpcfa
            FROM cxp_cabece_factur
            WHERE numero_cpcfa = $1 AND ide_geper = $2
            LIMIT 1
        `);
        qFactura.addStringParam(1, cabecera.numero_nc_cpcfa);
        qFactura.addIntParam(2, cabecera.ide_geper);
        const facturaOriginal = await this.dataSource.createSingleQuery(qFactura);
        if (!facturaOriginal) return [];

        const qInvDet = new SelectQuery(`
            SELECT ide_indci, ide_inarti
            FROM ${TABLE_INV_DET}
            WHERE ${PK_CAB} = $1
        `);
        qInvDet.addIntParam(1, Number(facturaOriginal.ide_cpcfa));
        const invDetalles = await this.dataSource.createSelectQuery(qInvDet);

        const observacion = `V/. NOTA DE CREDITO FAC. ${cabecera.numero_cpcfa}`;
        const queries: UpdateQuery[] = [];

        for (const invDet of invDetalles) {
            const det = detalles.find((d) => Number(d.ide_inarti) === Number(invDet.ide_inarti));
            if (!det) continue;
            const cantidad = Number(det.cantidad_cpdfa);
            const precio = Number(det.precio_cpdfa);
            const q = new UpdateQuery(TABLE_INV_DET, PK_INV_DET);
            q.values.set('cantidad_indci', Number(cantidad.toFixed(3)));
            q.values.set('precio_indci', precio);
            q.values.set('valor_indci', Number((cantidad * precio).toFixed(2)));
            q.values.set('observacion_indci', observacion);
            q.where = `${PK_INV_DET} = $1`;
            q.addIntParam(1, Number(invDet.ide_indci));
            queries.push(q);
        }
        return queries;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS PRIVADOS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Calcula bases, IVA y total. El descuento reduce tanto la base gravada usada para
     * el IVA como el total del documento (a diferencia de calcularTotalDocumento del
     * legacy, que solo lo aplicaba al IVA y dejaba el campo como puramente informativo —
     * un defecto heredado: Descuento/Otros Valores existen para poder cuadrar el total
     * contra la factura real del proveedor, así que sí deben afectar el total). La
     * tarifa se maneja como fracción (ej. 0.15).
     */
    private calcularTotales(
        detalles: DetalleDocumentoCxPDto[],
        tarifaIva: number,
        descuento: number,
        otros: number,
    ) {
        let baseGrabada = 0;
        let baseTarifa0 = 0;
        let baseNoObjeto = 0;

        for (const det of detalles) {
            const valor = (Number(det.cantidad_cpdfa) || 0) * (Number(det.precio_cpdfa) || 0);
            switch (det.iva_inarti_cpdfa) {
                case '1':
                    baseGrabada += valor;
                    break;
                case '-1':
                    baseTarifa0 += valor;
                    break;
                case '0':
                    baseNoObjeto += valor;
                    break;
            }
        }

        const valorIva = Number(((baseGrabada - descuento) * tarifaIva).toFixed(2));
        const total = Number(
            (baseGrabada - descuento + baseNoObjeto + baseTarifa0 + valorIva + otros).toFixed(2),
        );

        return {
            base_grabada: Number(baseGrabada.toFixed(2)),
            base_tarifa0: Number(baseTarifa0.toFixed(2)),
            base_no_objeto_iva: Number(baseNoObjeto.toFixed(2)),
            valor_iva: valorIva,
            total,
        };
    }

    /**
     * Retorna los detalles cuyos artículos tienen hace_kardex_inarti = true
     * (una sola query con ANY para evitar N+1).
     */
    private async getDetallesConKardex(
        detalles: DetalleDocumentoCxPDto[],
    ): Promise<DetalleDocumentoCxPDto[]> {
        if (!detalles.length) return [];

        const ids = [...new Set(detalles.map((d) => d.ide_inarti))];
        const q = new SelectQuery(`
            SELECT ide_inarti
            FROM inv_articulo
            WHERE ide_inarti = ANY($1)
              AND hace_kardex_inarti = true
        `);
        q.addParam(1, ids);
        const resultado = await this.dataSource.createSelectQuery(q);
        const idsConKardex = new Set(resultado.map((r: any) => Number(r.ide_inarti)));
        return detalles.filter((d) => idsConKardex.has(d.ide_inarti));
    }

    private async getBodegaSucursal(ideSucu: number): Promise<number> {
        const q = new SelectQuery(`
            SELECT ide_inbod FROM inv_bodega
            WHERE ide_sucu = $1 AND activo_inbod = true
            LIMIT 1
        `);
        q.addIntParam(1, ideSucu);
        const row = await this.dataSource.createSingleQuery(q);
        if (!row) throw new BadRequestException(`No existe bodega activa para la sucursal ${ideSucu}`);
        return Number(row.ide_inbod);
    }

    /**
     * Secuencial del comprobante de inventario por bodega: max + 1 con padding
     * a 10 dígitos (paridad legacy getSecuencialComprobanteInventario).
     */
    private async getSecuencialComprobanteInventario(ideBodega: number): Promise<string> {
        const q = new SelectQuery(`
            SELECT MAX(numero_incci) AS maximo
            FROM ${TABLE_INV_CAB}
            WHERE ide_inbod = $1
        `);
        q.addIntParam(1, ideBodega);
        const row = await this.dataSource.createSingleQuery(q);
        const maximo = Number.parseInt(row?.maximo ?? '0', 10) || 0;
        return String(maximo + 1).padStart(10, '0');
    }

    /** Suma N días a una fecha YYYY-MM-DD y retorna el resultado en el mismo formato. */
    private sumarDias(fecha: string, dias: number): string {
        if (!dias || dias <= 0) return fecha;
        const d = new Date(`${fecha}T00:00:00`);
        d.setDate(d.getDate() + dias);
        return d.toISOString().split('T')[0];
    }

    /**
     * Separa un número de documento en establecimiento/ptoEmisión/secuencial. Soporta tanto
     * el formato con guiones ("001-001-000000001") como el heredado sin separador (dígitos
     * contiguos, ancho fijo 3+3+resto).
     */
    private splitNumeroDocumento(numero: string | null | undefined): { estab: string; ptoEmi: string; secuencial: string } {
        const limpio = (numero ?? '').trim();
        if (limpio.includes('-')) {
            const partes = limpio.split('-');
            if (partes.length === 3) {
                return { estab: partes[0], ptoEmi: partes[1], secuencial: partes[2] };
            }
        }
        return { estab: limpio.slice(0, 3), ptoEmi: limpio.slice(3, 6), secuencial: limpio.slice(6) };
    }
}
