import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';

import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { InsertQuery, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { isDefined } from 'src/util/helpers/common-util';
import { getCurrentDate, getCurrentTime } from 'src/util/helpers/date-util';
import { SriFacturaService } from 'src/core/modules/sri/cel/sri-factura.service';

import { DetaFacturaDto, GuiaRemisionDto, SaveFacturaDto } from './dto/save-factura.dto';

// ─── Constantes de tablas ────────────────────────────────────────────────────
const MODULE          = 'cxc';
const TABLE_CAB       = 'cabece_factura';
const TABLE_DET       = 'deta_factura';
const PK_CAB          = 'ide_cccfa';
const PK_DET          = 'ide_ccdfa';
const TABLE_TRN_CAB   = 'cxc_cabece_transa';
const TABLE_TRN_DET   = 'cxc_detall_transa';
const PK_TRN_CAB      = 'ide_ccctr';
const PK_TRN_DET      = 'ide_ccdtr';
const TABLE_INV_CAB   = 'inv_cab_comp_inve';
const TABLE_INV_DET   = 'inv_det_comp_inve';
const PK_INV_CAB      = 'ide_incci';
const PK_INV_DET      = 'ide_indci';
const TABLE_GUIA      = 'cxc_guia';
const PK_GUIA         = 'ide_ccgui';

// ─── Tipos internos ──────────────────────────────────────────────────────────
type Totales = ReturnType<FacturasSaveService['calcularTotales']>;

@Injectable()
export class FacturasSaveService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly sriFacturaService: SriFacturaService,
    ) {
        super();
        this.core
            .getVariables([
                'p_cxc_estado_factura_normal',      // estado normal factura (ide_ccefa)
                'p_con_tipo_documento_factura',     // tipo documento factura (ide_cntdo)
                'p_sri_estado_comprobante_creado',  // estado SRI al crear (ide_sresc)
                'p_cxc_tipo_trans_factura',         // tipo transacción cargo CxC (ide_ccttr)
                'p_inv_tipo_comp_venta',            // tipo comprobante inventario venta (ide_intti)
                'p_inv_bodega_activa',              // bodega por defecto para salidas (ide_inbod)
                'p_inv_estado_normal',              // estado normal de comprobante inventario (ide_inepi)
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    // ─── Getters de variables ────────────────────────────────────────────────

    private getVar(name: string): number {
        const val = this.variables.get(name);
        if (!val) throw new InternalServerErrorException(`Variable del sistema '${name}' no configurada. Contacte al administrador.`);
        return Number(val);
    }

    private get ideEstadoNormal(): number {
        return this.getVar('p_cxc_estado_factura_normal');
    }

    private get ideTipoDocFactura(): number {
        return this.getVar('p_con_tipo_documento_factura');
    }

    private get ideSriEstadoCreado(): number {
        return this.getVar('p_sri_estado_comprobante_creado');
    }

    private get ideTipoTransFactura(): number {
        return this.getVar('p_cxc_tipo_trans_factura');
    }

    private get ideTipoCompVenta(): number {
        return this.getVar('p_inv_tipo_comp_venta');
    }

    private get ideBodegaActiva(): number {
        return this.getVar('p_inv_bodega_activa');
    }

    private get ideEstadoNormalInv(): number {
        return this.getVar('p_inv_estado_normal');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PÚBLICO: save
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Punto de entrada unificado para crear o actualizar una factura.
     *
     * Flujo crear:
     *  1. Validar punto de emisión + cliente
     *  2. Calcular totales (base0, base grabada, IVA, total)
     *  3. Obtener secuenciales en paralelo
     *  4. Construir INSERT sri_comprobante
     *  5. Construir INSERT cxc_cabece_factura
     *  6. Construir INSERT cxc_deta_factura × N
     *  7. Construir INSERT cxc_cabece_transa + cxc_detall_transa  ← genera CxC
     *  8. Construir INSERT inv_cab/det_comp_inve (solo artículos con kardex)
     *  9. Construir INSERT cxc_guia (si se envió guia en el DTO)
     * 10. UPDATE cxc_datos_fac (incrementar secuencial)
     * 11. createListQuery → transacción atómica
     */
    async save(dtoIn: SaveFacturaDto & HeaderParamsDto) {
        try {
            if (!dtoIn.data) throw new BadRequestException('El campo data es requerido');
            if (!dtoIn.detalles || dtoIn.detalles.length === 0) {
                throw new BadRequestException('La factura debe tener al menos un ítem en el detalle.');
            }

            const { data, detalles } = dtoIn;
            const isUpdate = dtoIn.isUpdate && !!data.ide_cccfa;

            const { ptoEmision, cliente } = await this.validarFactura(dtoIn);

            const tarifaIva = isDefined(data.tarifa_iva_cccfa) ? Number(data.tarifa_iva_cccfa) : 15;
            const totales   = this.calcularTotales(detalles, tarifaIva);

            for (const det of detalles) {
                if (det.cantidad_ccdfa <= 0) {
                    throw new BadRequestException(
                        `La cantidad del artículo ide_inarti=${det.ide_inarti} debe ser mayor a 0.`,
                    );
                }
                if (det.precio_ccdfa < 0) {
                    throw new BadRequestException(
                        `El precio del artículo ide_inarti=${det.ide_inarti} no puede ser negativo.`,
                    );
                }
            }

            data.ide_cntdo = this.ideTipoDocFactura;
            data.ide_ccefa = this.ideEstadoNormal;
            data.ide_usua  = dtoIn.ideUsua;

            if (isUpdate) {
                return this.actualizarFactura(data.ide_cccfa!, data, detalles, totales, tarifaIva, cliente, dtoIn);
            }

            return this.crearFactura(data, detalles, totales, tarifaIva, ptoEmision, cliente, dtoIn);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar la factura: ${msg}`);
        }
    }

    /**
     * Elimina una o varias facturas (cabecera + detalle).
     *
     * ⚠️ RECOMENDACIÓN ERP: considerar anular en lugar de eliminar físicamente
     * para mantener trazabilidad contable y de inventario.
     */
    async deleteFacturas(dtoIn: { ide: number[] } & HeaderParamsDto) {
        if (!dtoIn.ide || dtoIn.ide.length === 0) {
            throw new BadRequestException('Debe proporcionar al menos un ide_cccfa para eliminar');
        }
        try {
            const deleteDet = new SelectQuery(`
                DELETE FROM cxc_deta_factura
                WHERE ide_cccfa = ANY ($1)
            `);
            deleteDet.addParam(1, dtoIn.ide);
            await this.dataSource.createSelectQuery(deleteDet);

            const deleteCab = new SelectQuery(`
                DELETE FROM cxc_cabece_factura
                WHERE ide_cccfa = ANY ($1) AND ide_sucu = $2
            `);
            deleteCab.addParam(1, dtoIn.ide);
            deleteCab.addIntParam(2, dtoIn.ideSucu);
            return this.dataSource.createQuery(deleteCab);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al eliminar facturas: ${msg}`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIVADO: crear factura
    // ─────────────────────────────────────────────────────────────────────────

    private async crearFactura(
        data: SaveFacturaDto['data'],
        detalles: DetaFacturaDto[],
        totales: Totales,
        tarifaIva: number,
        ptoEmision: any,
        cliente: any,
        dtoIn: SaveFacturaDto & HeaderParamsDto,
    ) {
        const numActual  = Number(ptoEmision.num_actual_ccdfa) + 1;
        const secuencial = String(numActual).padStart(9, '0');
        data.secuencial_cccfa = secuencial;

        // ── 1. Detectar artículos con control de inventario (kardex) ──────────
        const detallesConKardex = await this.getDetallesConKardex(detalles);
        const tieneKardex       = detallesConKardex.length > 0;
        const tieneGuia         = !!dtoIn.guia;

        // ── 2. Obtener todos los secuenciales secuencialmente (evita race condition en sis_bloqueo)
        const ideSrcom      = await this.sriFacturaService.getSecuencialSriComprobante(dtoIn.login);
        const ideCccfa      = await this.dataSource.getSeqTable(`${MODULE}_${TABLE_CAB}`, PK_CAB, 1, dtoIn.login);
        const baseIdeCcdfa  = await this.dataSource.getSeqTable(`${MODULE}_${TABLE_DET}`, PK_DET, detalles.length, dtoIn.login);
        const ideCcctr      = await this.dataSource.getSeqTable(TABLE_TRN_CAB, PK_TRN_CAB, 1, dtoIn.login);
        const ideCcdtr      = await this.dataSource.getSeqTable(TABLE_TRN_DET, PK_TRN_DET, 1, dtoIn.login);
        const ideIncci      = tieneKardex ? await this.dataSource.getSeqTable(TABLE_INV_CAB, PK_INV_CAB, 1, dtoIn.login) : null;
        const baseIdeIndci  = tieneKardex ? await this.dataSource.getSeqTable(TABLE_INV_DET, PK_INV_DET, detallesConKardex.length, dtoIn.login) : null;
        const ideGuia       = tieneGuia   ? await this.dataSource.getSeqTable(TABLE_GUIA, PK_GUIA, 1, dtoIn.login) : null;

        data.ide_cccfa = ideCccfa;
        data.ide_srcom = ideSrcom;

        // ── 3. Calcular fecha de vencimiento ──────────────────────────────────
        const diasCredito      = data.dias_credito_cccfa ?? 0;
        const fechaVencimiento = this.sumarDias(data.fecha_emisi_cccfa, diasCredito);

        // ── 4. Construir queries en memoria ───────────────────────────────────

        // sri_comprobante
        const insertSriComp = await this.sriFacturaService.buildSriComprobanteInsert(
            {
                ideEmpr      : dtoIn.ideEmpr,
                ideSucu      : dtoIn.ideSucu,
                login        : dtoIn.login,
                ide_sresc    : this.ideSriEstadoCreado,
                ide_cntdo    : this.ideTipoDocFactura,
                ide_geper    : data.ide_geper,
                fecha_emisi  : data.fecha_emisi_cccfa,
                estab        : ptoEmision.establecimiento_ccdfa,
                pto_emi      : ptoEmision.pto_emision_ccdfa,
                secuencial,
                subtotal0    : totales.base_tarifa0,
                base_grabada : totales.base_grabada,
                iva          : totales.valor_iva,
                total        : totales.total,
                identificacion: cliente.identificac_geper,
                forma_cobro  : data.ide_cndfp1 ? String(data.ide_cndfp1) : '01',
                dias_credito : diasCredito,
                correo       : data.correo_cccfa ?? cliente.correo_geper,
            },
            ideSrcom,
        );

        // cxc_cabece_factura
        const insertCabecera = this.buildInsertCabecera(data, totales, tarifaIva, dtoIn);

        // cxc_deta_factura × N
        const insertDetalles = detalles.map((det, idx) =>
            this.buildInsertDetalle(ideCccfa, baseIdeCcdfa + idx, det, dtoIn),
        );

        // cxc_cabece_transa (registro de cargo CxC — genera la cuenta por cobrar)
        const insertTrnCab = this.buildInsertTrnCabecera(
            ideCcctr, ideCccfa, cliente.ide_geper, data.fecha_emisi_cccfa, secuencial, dtoIn,
        );

        // cxc_detall_transa (detalle del cargo: valor total de la factura)
        const insertTrnDet = this.buildInsertTrnDetalle(
            ideCcdtr, ideCcctr, ideCccfa, totales.total,
            data.fecha_emisi_cccfa, fechaVencimiento, secuencial, dtoIn,
        );

        // inv_cab/det_comp_inve (comprobante de salida de inventario)
        const kardexQueries = tieneKardex && ideIncci !== null && baseIdeIndci !== null
            ? this.buildKardexQueries(
                ideIncci, baseIdeIndci, ideCccfa, secuencial,
                data, cliente, detallesConKardex, dtoIn,
              )
            : [];

        // cxc_guia (guía de remisión)
        const guiaQuery = tieneGuia && ideGuia !== null
            ? this.buildInsertGuia(ideGuia, ideCccfa, cliente, data, dtoIn)
            : null;

        // UPDATE cxc_datos_fac → avanzar secuencial del punto de emisión
        const updatePto = new UpdateQuery('cxc_datos_fac', 'ide_ccdaf', dtoIn);
        updatePto.values.set('num_actual_ccdfa', numActual);
        updatePto.where = `ide_ccdaf = ${data.ide_ccdaf}`;

        // ── 5. Ejecutar todo en una sola transacción ──────────────────────────
        // Orden: respetar FKs → sri primero, luego cabecera, luego todo lo que depende de ella
        await this.dataSource.createListQuery([
            insertSriComp,
            insertCabecera,
            ...insertDetalles,
            insertTrnCab,
            insertTrnDet,
            ...kardexQueries,
            ...(guiaQuery ? [guiaQuery] : []),
            updatePto,
        ]);

        return {
            message: 'ok',
            rowCount: 1,
            ide_cccfa          : ideCccfa,
            ide_srcom          : ideSrcom,
            ide_ccctr          : ideCcctr,
            ide_ccgui          : ideGuia,
            secuencial_cccfa   : secuencial,
            numero_completo    : `${ptoEmision.establecimiento_ccdfa}-${ptoEmision.pto_emision_ccdfa}-${secuencial}`,
            total              : totales.total,
            kardex_generado    : tieneKardex,
            guia_generada      : tieneGuia,
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIVADO: actualizar factura
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Actualiza cabecera + reemplaza detalles + actualiza sri_comprobante.
     *
     * ⚠️ NOTA: La actualización NO recrea la transacción CxC ni el kardex de inventario.
     * Para sistemas ERP productivos se recomienda anular + recrear en lugar de editar
     * facturas que ya tengan transacciones o movimientos de stock asociados.
     */
    private async actualizarFactura(
        ideCccfa: number,
        data: SaveFacturaDto['data'],
        detalles: DetaFacturaDto[],
        totales: Totales,
        tarifaIva: number,
        _cliente: any,
        dtoIn: SaveFacturaDto & HeaderParamsDto,
    ) {
        const qExiste = new SelectQuery(
            `SELECT ide_cccfa, ide_srcom FROM cxc_cabece_factura WHERE ide_cccfa = $1 AND ide_empr = $2`,
        );
        qExiste.addIntParam(1, ideCccfa);
        qExiste.addIntParam(2, dtoIn.ideEmpr);
        const existe = await this.dataSource.createSingleQuery(qExiste);

        if (!existe) {
            throw new BadRequestException(`La factura ide_cccfa=${ideCccfa} no existe`);
        }

        if (existe.ide_srcom) {
            const updSri = new UpdateQuery('sri_comprobante', 'ide_srcom');
            updSri.values.set('subtotal0_srcom',   totales.base_tarifa0);
            updSri.values.set('base_grabada_srcom', totales.base_grabada);
            updSri.values.set('iva_srcom',          totales.valor_iva);
            updSri.values.set('total_srcom',        totales.total);
            updSri.where = `ide_srcom = ${existe.ide_srcom}`;
            await this.dataSource.createQuery(updSri);
        }

        const updCab = this.buildUpdateCabecera(ideCccfa, data, totales, tarifaIva, dtoIn);
        await this.dataSource.createQuery(updCab);

        if (detalles.length > 0) {
            await this.dataSource.pool.query(
                `DELETE FROM cxc_deta_factura WHERE ide_cccfa = $1`,
                [ideCccfa],
            );

            for (let idx = 0; idx < detalles.length; idx++) {
                const ideCcdfa = await this.dataSource.getSeqTable(
                    `${MODULE}_${TABLE_DET}`, PK_DET, 1, dtoIn.login,
                );
                const insertDet = this.buildInsertDetalle(ideCccfa, ideCcdfa, detalles[idx], dtoIn);
                await this.dataSource.createQuery(insertDet);
            }
        }

        return {
            message  : 'ok',
            rowCount : 1,
            ide_cccfa: ideCccfa,
            total    : totales.total,
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BUILDERS: constructores de InsertQuery / UpdateQuery
    // ─────────────────────────────────────────────────────────────────────────

    private buildInsertCabecera(
        data: SaveFacturaDto['data'],
        totales: Totales,
        tarifaIva: number,
        dtoIn: SaveFacturaDto & HeaderParamsDto,
    ): InsertQuery {
        const q = new InsertQuery(`${MODULE}_${TABLE_CAB}`, PK_CAB, dtoIn);
        q.values.set('ide_cccfa',              data.ide_cccfa);
        q.values.set('ide_ccdaf',              data.ide_ccdaf);
        q.values.set('ide_geper',              data.ide_geper);
        q.values.set('ide_cntdo',              data.ide_cntdo);
        q.values.set('ide_ccefa',              data.ide_ccefa);
        q.values.set('ide_srcom',              data.ide_srcom);
        q.values.set('ide_usua',               data.ide_usua);
        q.values.set('fecha_emisi_cccfa',      data.fecha_emisi_cccfa);
        q.values.set('secuencial_cccfa',       data.secuencial_cccfa);
        q.values.set('base_no_objeto_iva_cccfa', totales.base_no_objeto_iva);
        q.values.set('base_tarifa0_cccfa',     totales.base_tarifa0);
        q.values.set('base_grabada_cccfa',     totales.base_grabada);
        q.values.set('valor_iva_cccfa',        totales.valor_iva);
        q.values.set('tarifa_iva_cccfa',       tarifaIva);
        q.values.set('total_cccfa',            totales.total);
        q.values.set('dias_credito_cccfa',     data.dias_credito_cccfa ?? 0);
        q.values.set('pagado_cccfa',           false);
        q.values.set('solo_guardar_cccfa',     false);
        q.values.set('usuario_ingre',          dtoIn.login);
        q.values.set('fecha_ingre',            getCurrentDate());
        q.values.set('hora_ingre',             getCurrentTime());
        if (isDefined(data.ide_vgven))           q.values.set('ide_vgven',           data.ide_vgven);
        if (isDefined(data.ide_cndfp1))          q.values.set('ide_cndfp1',          data.ide_cndfp1);
        if (isDefined(data.observacion_cccfa))   q.values.set('observacion_cccfa',   data.observacion_cccfa);
        if (isDefined(data.direccion_cccfa))     q.values.set('direccion_cccfa',     data.direccion_cccfa);
        if (isDefined(data.correo_cccfa))        q.values.set('correo_cccfa',        data.correo_cccfa);
        if (isDefined(data.orden_compra_cccfa))  q.values.set('orden_compra_cccfa',  data.orden_compra_cccfa);
        if (isDefined(data.num_proforma_cccfa))  q.values.set('num_proforma_cccfa',  data.num_proforma_cccfa);
        return q;
    }

    private buildUpdateCabecera(
        ideCccfa: number,
        data: SaveFacturaDto['data'],
        totales: Totales,
        tarifaIva: number,
        dtoIn: SaveFacturaDto & HeaderParamsDto,
    ): UpdateQuery {
        const q = new UpdateQuery(`${MODULE}_${TABLE_CAB}`, PK_CAB, dtoIn);
        q.values.set('ide_ccdaf',              data.ide_ccdaf);
        q.values.set('ide_geper',              data.ide_geper);
        q.values.set('fecha_emisi_cccfa',      data.fecha_emisi_cccfa);
        q.values.set('base_no_objeto_iva_cccfa', totales.base_no_objeto_iva);
        q.values.set('base_tarifa0_cccfa',     totales.base_tarifa0);
        q.values.set('base_grabada_cccfa',     totales.base_grabada);
        q.values.set('valor_iva_cccfa',        totales.valor_iva);
        q.values.set('tarifa_iva_cccfa',       tarifaIva);
        q.values.set('total_cccfa',            totales.total);
        q.values.set('dias_credito_cccfa',     data.dias_credito_cccfa ?? 0);
        q.values.set('usuario_actua',          dtoIn.login);
        q.values.set('fecha_actua',            getCurrentDate());
        q.values.set('hora_actua',             getCurrentTime());
        if (isDefined(data.ide_vgven))           q.values.set('ide_vgven',           data.ide_vgven);
        if (isDefined(data.ide_cndfp1))          q.values.set('ide_cndfp1',          data.ide_cndfp1);
        if (isDefined(data.observacion_cccfa))   q.values.set('observacion_cccfa',   data.observacion_cccfa);
        if (isDefined(data.direccion_cccfa))     q.values.set('direccion_cccfa',     data.direccion_cccfa);
        if (isDefined(data.correo_cccfa))        q.values.set('correo_cccfa',        data.correo_cccfa);
        if (isDefined(data.orden_compra_cccfa))  q.values.set('orden_compra_cccfa',  data.orden_compra_cccfa);
        if (isDefined(data.num_proforma_cccfa))  q.values.set('num_proforma_cccfa',  data.num_proforma_cccfa);
        q.where = `${PK_CAB} = $1 AND ide_empr = $2`;
        q.addIntParam(1, ideCccfa);
        q.addIntParam(2, dtoIn.ideEmpr);
        return q;
    }

    private buildInsertDetalle(
        ideCccfa: number,
        ideCcdfa: number,
        det: DetaFacturaDto,
        dtoIn: SaveFacturaDto & HeaderParamsDto,
    ): InsertQuery {
        const q = new InsertQuery(`${MODULE}_${TABLE_DET}`, PK_DET, dtoIn);
        q.values.set('ide_ccdfa',                   ideCcdfa);
        q.values.set('ide_cccfa',                   ideCccfa);
        q.values.set('ide_inarti',                  det.ide_inarti);
        q.values.set('cantidad_ccdfa',              det.cantidad_ccdfa);
        q.values.set('precio_ccdfa',                det.precio_ccdfa);
        q.values.set('total_ccdfa',                 det.total_ccdfa);
        q.values.set('iva_inarti_ccdfa',            det.iva_inarti_ccdfa);
        q.values.set('credito_tributario_ccdfa',    det.credito_tributario_ccdfa ?? false);
        q.values.set('usuario_ingre',               dtoIn.login);
        q.values.set('fecha_ingre',                 getCurrentDate());
        q.values.set('hora_ingre',                  getCurrentTime());
        if (isDefined(det.observacion_ccdfa)) q.values.set('observacion_ccdfa', det.observacion_ccdfa);
        if (isDefined(det.ide_inuni))         q.values.set('ide_inuni',         det.ide_inuni);
        return q;
    }

    /**
     * Construye el INSERT de cabecera de transacción CxC.
     * Este registro crea la obligación (cuenta por cobrar) de la factura.
     */
    private buildInsertTrnCabecera(
        ideCcctr: number,
        ideCccfa: number,
        ideGeper: number,
        fechaTrans: string,
        secuencial: string,
        dtoIn: SaveFacturaDto & HeaderParamsDto,
    ): InsertQuery {
        const q = new InsertQuery(TABLE_TRN_CAB, PK_TRN_CAB, dtoIn);
        q.values.set('ide_ccctr',          ideCcctr);
        q.values.set('ide_geper',          ideGeper);
        q.values.set('ide_cccfa',          ideCccfa);
        q.values.set('fecha_trans_ccctr',  fechaTrans);
        q.values.set('observacion_ccctr',  `FACTURA ${secuencial}`);
        q.values.set('usuario_ingre',      dtoIn.login);
        q.values.set('fecha_ingre',        getCurrentDate());
        q.values.set('hora_ingre',         getCurrentTime());
        // ide_empr + ide_sucu los agrega InsertQuery automáticamente desde dtoIn
        return q;
    }

    /**
     * Construye el INSERT de detalle de transacción CxC.
     * Registra el cargo (valor total de la factura) que debe ser cobrado.
     * fecha_venci_ccdtr = fecha emisión + días crédito.
     */
    private buildInsertTrnDetalle(
        ideCcdtr: number,
        ideCcctr: number,
        ideCccfa: number,
        valorTotal: number,
        fechaTrans: string,
        fechaVenci: string,
        secuencial: string,
        dtoIn: SaveFacturaDto & HeaderParamsDto,
    ): InsertQuery {
        const q = new InsertQuery(TABLE_TRN_DET, PK_TRN_DET, dtoIn);
        q.values.set('ide_ccdtr',          ideCcdtr);
        q.values.set('ide_ccctr',          ideCcctr);
        q.values.set('ide_cccfa',          ideCccfa);
        q.values.set('ide_ccttr',          this.ideTipoTransFactura);
        q.values.set('ide_usua',           dtoIn.ideUsua);
        q.values.set('fecha_trans_ccdtr',  fechaTrans);
        q.values.set('fecha_venci_ccdtr',  fechaVenci);
        q.values.set('numero_pago_ccdtr',  1);
        q.values.set('valor_ccdtr',        valorTotal);
        q.values.set('docum_relac_ccdtr',  secuencial);
        q.values.set('observacion_ccdtr',  `FACTURA ${secuencial}`);
        q.values.set('usuario_ingre',      dtoIn.login);
        q.values.set('fecha_ingre',        getCurrentDate());
        q.values.set('hora_ingre',         getCurrentTime());
        // ide_cnccc (asiento contable) y ide_teclb (libro banco) quedan NULL
        // se vinculan cuando se contabiliza o se registra el pago
        return q;
    }

    /**
     * Construye los INSERTs del comprobante de inventario (kardex de salida por venta).
     * Solo se llama para artículos con hace_kardex_inarti = true.
     * Las cantidades y valores se guardan en NEGATIVO (representan salida de stock).
     */
    private buildKardexQueries(
        ideIncci: number,
        baseIdeIndci: number,
        ideCccfa: number,
        secuencial: string,
        data: SaveFacturaDto['data'],
        cliente: any,
        detallesKardex: DetaFacturaDto[],
        dtoIn: SaveFacturaDto & HeaderParamsDto,
    ): InsertQuery[] {
        const queries: InsertQuery[] = [];

        // Cabecera del comprobante de inventario
        const qCab = new InsertQuery(TABLE_INV_CAB, PK_INV_CAB, dtoIn);
        qCab.values.set('ide_incci',           ideIncci);
        qCab.values.set('ide_geper',           cliente.ide_geper);
        qCab.values.set('ide_intti',           this.ideTipoCompVenta);
        qCab.values.set('ide_inbod',           this.ideBodegaActiva);
        qCab.values.set('ide_inepi',           this.ideEstadoNormalInv);
        qCab.values.set('ide_usua',            dtoIn.ideUsua);
        qCab.values.set('numero_incci',        secuencial.slice(-10));  // max 10 chars
        qCab.values.set('fecha_trans_incci',   data.fecha_emisi_cccfa);
        qCab.values.set('fecha_efect_incci',   data.fecha_emisi_cccfa);
        qCab.values.set('observacion_incci',   `VENTA FACTURA ${secuencial}`);
        qCab.values.set('referencia_incci',    secuencial.slice(-12));   // max 12 chars
        qCab.values.set('automatico_incci',    true);
        qCab.values.set('verifica_incci',      false);
        qCab.values.set('usuario_ingre',       dtoIn.login);
        qCab.values.set('fecha_ingre',         getCurrentDate());
        qCab.values.set('hora_ingre',          getCurrentTime());
        queries.push(qCab);

        // Detalle por cada artículo con kardex
        detallesKardex.forEach((det, idx) => {
            const qDet = new InsertQuery(TABLE_INV_DET, PK_INV_DET, dtoIn);
            qDet.values.set('ide_indci',          baseIdeIndci + idx);
            qDet.values.set('ide_incci',          ideIncci);
            qDet.values.set('ide_inarti',         det.ide_inarti);
            qDet.values.set('ide_cccfa',          ideCccfa);
            qDet.values.set('secuencial_indci',   String(idx + 1).padStart(6, '0'));
            // Negativo: salida de bodega por venta
            qDet.values.set('cantidad_indci',     -Math.abs(det.cantidad_ccdfa));
            qDet.values.set('precio_indci',       det.precio_ccdfa);
            qDet.values.set('valor_indci',        -Math.abs(det.total_ccdfa));
            qDet.values.set('usuario_ingre',      dtoIn.login);
            qDet.values.set('fecha_ingre',        getCurrentDate());
            qDet.values.set('hora_ingre',         getCurrentTime());
            queries.push(qDet);
        });

        return queries;
    }

    /**
     * Construye el INSERT de guía de remisión vinculada a la factura.
     * El número de guía se genera consultando el último número para el punto de emisión + 1.
     * ide_srcom queda NULL: la guía electrónica se genera en un proceso posterior (SRI).
     */
    private buildInsertGuia(
        ideGuia: number,
        ideCccfa: number,
        cliente: any,
        data: SaveFacturaDto['data'],
        dtoIn: SaveFacturaDto & HeaderParamsDto,
    ): InsertQuery {
        const guia = dtoIn.guia!;
        const q = new InsertQuery(TABLE_GUIA, PK_GUIA, dtoIn);
        q.values.set('ide_ccgui',              ideGuia);
        q.values.set('ide_cccfa',              ideCccfa);
        q.values.set('ide_geper',              cliente.ide_geper);
        q.values.set('ide_cctgi',              guia.ide_cctgi);
        q.values.set('ide_ccdaf',              data.ide_ccdaf);
        q.values.set('fecha_emision_ccgui',    data.fecha_emisi_cccfa);
        q.values.set('fecha_ini_trasla_ccgui', guia.fecha_ini_trasla_ccgui);
        q.values.set('fecha_fin_trasla_ccgui', guia.fecha_fin_trasla_ccgui ?? guia.fecha_ini_trasla_ccgui);
        q.values.set('punto_partida_ccgui',    guia.punto_partida_ccgui);
        q.values.set('punto_llegada_ccgui',    guia.punto_llegada_ccgui);
        q.values.set('destinatario_ccgui',     guia.destinatario_ccgui ?? cliente.nom_geper);
        q.values.set('usuario_ingre',          dtoIn.login);
        q.values.set('fecha_ingre',            getCurrentDate());
        q.values.set('hora_ingre',             getCurrentTime());
        if (isDefined(guia.placa_gecam))     q.values.set('placa_gecam',    guia.placa_gecam);
        if (isDefined(guia.gen_ide_geper))   q.values.set('gen_ide_geper',  guia.gen_ide_geper);
        // ide_srcom queda NULL → se asignará al generar la guía electrónica en SriModule
        return q;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS PRIVADOS
    // ─────────────────────────────────────────────────────────────────────────

    /** Valida punto de emisión y cliente. Lanza BadRequestException si no son válidos. */
    private async validarFactura(
        dtoIn: SaveFacturaDto & HeaderParamsDto,
    ): Promise<{ ptoEmision: any; cliente: any }> {
        const qPto = new SelectQuery(`
            SELECT ide_ccdaf, establecimiento_ccdfa, pto_emision_ccdfa,
                   num_actual_ccdfa, ide_sucu
            FROM cxc_datos_fac
            WHERE ide_ccdaf = $1 AND ide_empr = $2
        `);
        qPto.addIntParam(1, dtoIn.data.ide_ccdaf);
        qPto.addIntParam(2, dtoIn.ideEmpr);

        const qCliente = new SelectQuery(`
            SELECT g.ide_geper, g.nom_geper, g.identificac_geper,
                   g.correo_geper, g.direccion_geper,
                   t.alterno2_getid AS tipo_identificacion
            FROM gen_persona g
            INNER JOIN gen_tipo_identifi t ON g.ide_getid = t.ide_getid
            WHERE g.ide_geper = $1
        `);
        qCliente.addIntParam(1, dtoIn.data.ide_geper);

        const [ptoEmision, cliente] = await Promise.all([
            this.dataSource.createSingleQuery(qPto),
            this.dataSource.createSingleQuery(qCliente),
        ]);

        if (!ptoEmision) {
            throw new BadRequestException(
                `El punto de emisión ide_ccdaf=${dtoIn.data.ide_ccdaf} no existe o no pertenece a la empresa.`,
            );
        }
        if (!cliente) {
            throw new BadRequestException(
                `El cliente ide_geper=${dtoIn.data.ide_geper} no existe.`,
            );
        }

        return { ptoEmision, cliente };
    }

    /** Calcula base tarifa 0%, base grabada, IVA y total a partir del detalle. */
    private calcularTotales(detalles: DetaFacturaDto[], tarifaIva: number) {
        let baseTarifa0 = 0;
        let baseGrabada = 0;

        for (const det of detalles) {
            if (det.iva_inarti_ccdfa > 0) {
                baseGrabada += Number(det.total_ccdfa);
            } else {
                baseTarifa0 += Number(det.total_ccdfa);
            }
        }

        const valorIva = Number((baseGrabada * (tarifaIva / 100)).toFixed(2));
        const total    = Number((baseTarifa0 + baseGrabada + valorIva).toFixed(2));

        return {
            base_no_objeto_iva: 0,
            base_tarifa0 : Number(baseTarifa0.toFixed(2)),
            base_grabada : Number(baseGrabada.toFixed(2)),
            valor_iva    : valorIva,
            total,
        };
    }

    /**
     * Filtra del array de detalles solo los artículos con hace_kardex_inarti = true.
     * Consulta ejecutada en una sola query con ANY para evitar N+1.
     */
    private async getDetallesConKardex(
        detalles: DetaFacturaDto[],
    ): Promise<DetaFacturaDto[]> {
        if (!detalles.length) return [];

        const ids = [...new Set(detalles.map(d => d.ide_inarti))];

        const q = new SelectQuery(`
            SELECT ide_inarti
            FROM inv_articulo
            WHERE ide_inarti = ANY($1)
              AND hace_kardex_inarti = true
        `);
        q.addParam(1, ids);

        const resultado = await this.dataSource.createSelectQuery(q);
        const idsConKardex = new Set(resultado.map((r: any) => Number(r.ide_inarti)));

        return detalles.filter(d => idsConKardex.has(d.ide_inarti));
    }

    /** Suma N días a una fecha en formato YYYY-MM-DD y retorna el resultado en el mismo formato. */
    private sumarDias(fecha: string, dias: number): string {
        if (dias <= 0) return fecha;
        const d = new Date(`${fecha}T00:00:00`);
        d.setDate(d.getDate() + dias);
        return d.toISOString().split('T')[0];
    }
}
