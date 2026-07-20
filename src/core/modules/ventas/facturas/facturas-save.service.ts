import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { InsertQuery, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { generarClaveAcceso } from 'src/core/modules/sri/cel/clave-acceso.util';
import { isDefined } from 'src/util/helpers/common-util';
import { getCurrentDate, getCurrentTime, toPgDate } from 'src/util/helpers/date-util';
import { validateCedula, validateRUC } from 'src/util/helpers/validations/cedula-ruc';

import { DetaFacturaDto, SaveFacturaDto } from './dto/save-factura.dto';

// ─── Constantes de tablas ────────────────────────────────────────────────────
const MODULE = 'cxc';
const TABLE_CAB = 'cabece_factura';
const TABLE_DET = 'deta_factura';
const PK_CAB = 'ide_cccfa';
const PK_DET = 'ide_ccdfa';
const TABLE_TRN_CAB = 'cxc_cabece_transa';
const TABLE_TRN_DET = 'cxc_detall_transa';
const PK_TRN_CAB = 'ide_ccctr';
const PK_TRN_DET = 'ide_ccdtr';
const TABLE_INV_CAB = 'inv_cab_comp_inve';
const TABLE_INV_DET = 'inv_det_comp_inve';
const PK_INV_CAB = 'ide_incci';
const PK_INV_DET = 'ide_indci';
const TABLE_GUIA = 'cxc_guia';
const PK_GUIA = 'ide_ccgui';

// ─── Tipos internos ──────────────────────────────────────────────────────────
type Totales = ReturnType<FacturasSaveService['calcularTotales']>;

@Injectable()
export class FacturasSaveService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        this.core
            .getVariables([
                'p_cxc_estado_factura_normal',      // estado normal factura (ide_ccefa)
                'p_cxc_tipo_trans_factura',         // tipo transacción cargo CxC (ide_ccttr)
                'p_inv_estado_normal',              // estado normal de comprobante inventario (ide_inepi)
                'p_inv_tipo_transaccion_venta',     // tipo transacción inventario venta (ide_intti)
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
        return 3;  // FACTURA
    }

    private get ideSriEstadoCreado(): number {
        return 5;
    }

    private get ideTipoTransFactura(): number {
        return this.getVar('p_cxc_tipo_trans_factura');
    }

    private get ideEstadoNormalInv(): number {
        return this.getVar('p_inv_estado_normal');
    }

    private get ideTipoTransaccionVenta(): number {
        return this.getVar('p_inv_tipo_transaccion_venta');
    }

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

            // Sanitizar fecha: normalizar a YYYY-MM-DD
            data.fecha_emisi_cccfa = toPgDate(data.fecha_emisi_cccfa) || getCurrentDate();
            if (dtoIn.guia) {
                dtoIn.guia.fecha_ini_trasla_ccgui = toPgDate(dtoIn.guia.fecha_ini_trasla_ccgui) || data.fecha_emisi_cccfa;
                if (dtoIn.guia.fecha_fin_trasla_ccgui) {
                    dtoIn.guia.fecha_fin_trasla_ccgui = toPgDate(dtoIn.guia.fecha_fin_trasla_ccgui) || dtoIn.guia.fecha_ini_trasla_ccgui;
                }
            }

            const { ptoEmision, cliente } = await this.validarFactura(dtoIn);

            if (!isUpdate) {
                if (!data.correo_cccfa) throw new BadRequestException('El correo electrónico es obligatorio.');
                if (!data.telefono_cccfa || data.telefono_cccfa.length < 6)
                    throw new BadRequestException('El teléfono es obligatorio (mínimo 6 caracteres).');
                if (!data.observacion_cccfa) throw new BadRequestException('La observación es obligatoria.');
                this.validarIdentificacion(cliente);

                if (dtoIn.guia) {
                    if (!dtoIn.guia.placa_gecam) throw new BadRequestException('La placa del vehículo es obligatoria para la guía.');
                    if (!dtoIn.guia.gen_ide_geper) throw new BadRequestException('El transportista es obligatorio para la guía.');
                }
            }

            const tarifaIva = isDefined(data.tarifa_iva_cccfa) ? Number(data.tarifa_iva_cccfa) : 15;
            const totales = this.calcularTotales(detalles, tarifaIva);

            if (totales.total <= 0) throw new BadRequestException('El total de la factura debe ser mayor a 0.');

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
            data.ide_usua = dtoIn.ideUsua;

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
        // ── 1. Detectar artículos con control de inventario (kardex) ──────────
        const detallesConKardex = await this.getDetallesConKardex(detalles);
        const tieneKardex = detallesConKardex.length > 0;
        const tieneGuia = !!dtoIn.guia;

        // ── 2. Obtener todos los secuenciales secuencialmente ──────────────────
        const ideSrcomFactura = await this.dataSource.getSeqTable('sri_comprobante', 'ide_srcom', 1, dtoIn.login);
        const ideSrcomGuia = tieneGuia ? await this.dataSource.getSeqTable('sri_comprobante', 'ide_srcom', 1, dtoIn.login) : null;
        const ideCccfa = await this.dataSource.getSeqTable(`${MODULE}_${TABLE_CAB}`, PK_CAB, 1, dtoIn.login);
        const baseIdeCcdfa = await this.dataSource.getSeqTable(`${MODULE}_${TABLE_DET}`, PK_DET, detalles.length, dtoIn.login);
        const ideCcctr = await this.dataSource.getSeqTable(TABLE_TRN_CAB, PK_TRN_CAB, 1, dtoIn.login);
        const ideCcdtr = await this.dataSource.getSeqTable(TABLE_TRN_DET, PK_TRN_DET, 1, dtoIn.login);
        const ideIncci = tieneKardex ? await this.dataSource.getSeqTable(TABLE_INV_CAB, PK_INV_CAB, 1, dtoIn.login) : null;
        const baseIdeIndci = tieneKardex ? await this.dataSource.getSeqTable(TABLE_INV_DET, PK_INV_DET, detallesConKardex.length, dtoIn.login) : null;
        const ideGuia = tieneGuia ? await this.dataSource.getSeqTable(TABLE_GUIA, PK_GUIA, 1, dtoIn.login) : null;

        data.ide_cccfa = ideCccfa;
        data.ide_cntdo = this.ideTipoDocFactura;
        data.ide_ccefa = this.ideEstadoNormal;
        data.ide_usua = dtoIn.ideUsua;

        const diasCredito = data.dias_credito_cccfa ?? 0;
        const fechaVencimiento = this.sumarDias(data.fecha_emisi_cccfa, diasCredito);
        const guiaQuery = tieneGuia && ideGuia !== null
            ? this.buildInsertGuia(ideGuia, ideCccfa, cliente, data, dtoIn)
            : null;

        // ── 3. TRANSACCIÓN 1: datos de negocio ──────────────────────────────────
        // Secuencial = NULL inicialmente; se asigna en Transacción 2 desde el SRI
        data.secuencial_cccfa = null as any;
        data.ide_srcom = null as any;

        const insertCabecera = this.buildInsertCabecera(data, totales, tarifaIva, dtoIn);

        const insertDetalles = detalles.map((det, idx) =>
            this.buildInsertDetalle(ideCccfa, baseIdeCcdfa + idx, det, dtoIn),
        );

        const insertTrnCab = this.buildInsertTrnCabecera(
            ideCcctr, ideCccfa, cliente.ide_geper, data.fecha_emisi_cccfa, '', dtoIn,
        );

        const insertTrnDet = this.buildInsertTrnDetalle(
            ideCcdtr, ideCcctr, ideCccfa, totales.total,
            data.fecha_emisi_cccfa, fechaVencimiento, '', dtoIn,
        );

        const ideBodega = tieneKardex ? await this.getBodegaSucursal(dtoIn.ideSucu) : 0;
        const kardexQueries = tieneKardex && ideIncci !== null && baseIdeIndci !== null
            ? await this.buildKardexQueries(
                ideIncci, baseIdeIndci, ideCccfa, '',
                data, cliente, detallesConKardex, dtoIn, ideBodega,
            )
            : [];

        // UPDATE gen_persona — solo si algún campo cambió
        const updCliente = new UpdateQuery('gen_persona', 'ide_geper', dtoIn);
        let tieneCambios = false;

        if (isDefined(data.direccion_cccfa) && data.direccion_cccfa !== (cliente.direccion_geper ?? '')) {
            updCliente.values.set('direccion_geper', data.direccion_cccfa);
            tieneCambios = true;
        }
        if (isDefined(data.telefono_cccfa) && data.telefono_cccfa !== (cliente.telefono_geper ?? '')) {
            updCliente.values.set('telefono_geper', data.telefono_cccfa);
            tieneCambios = true;
        }
        if (isDefined(data.correo_cccfa) && data.correo_cccfa !== (cliente.correo_geper ?? '')) {
            updCliente.values.set('correo_geper', data.correo_cccfa);
            tieneCambios = true;
        }
        if (isDefined(data.ide_cndfp1) && data.ide_cndfp1 !== (cliente.ide_cndfp ?? null)) {
            updCliente.values.set('ide_cndfp', data.ide_cndfp1);
            tieneCambios = true;
        }
        if (isDefined(data.ide_geprov) && data.ide_geprov !== (cliente.ide_geprov ?? null)) {
            updCliente.values.set('ide_geprov', data.ide_geprov);
            tieneCambios = true;
        }
        if (isDefined(data.ide_gecant) && data.ide_gecant !== (cliente.ide_gecant ?? null)) {
            updCliente.values.set('ide_gecant', data.ide_gecant);
            tieneCambios = true;
        }

        if (tieneCambios) {
            updCliente.where = `ide_geper = ${data.ide_geper}`;
        }

        // Ejecutar Transacción 1
        const transaccion1Queries: any[] = [
            insertCabecera,
            ...insertDetalles,
            insertTrnCab,
            insertTrnDet,
            ...kardexQueries,
        ];
        if (guiaQuery) transaccion1Queries.push(guiaQuery);
        if (tieneCambios) transaccion1Queries.push(updCliente);
        await this.dataSource.createListQuery(transaccion1Queries);

        // ── 4. TRANSACCIÓN 2: SRI comprobantes + asignación de secuenciales ────
        const queryRunner = await this.dataSource.pool.connect();
        try {
            await queryRunner.query('BEGIN');

            // 4-A. Obtener datos del emisor (RUC + ambiente)
            const emisorQuery = new SelectQuery(`
                SELECT
                    su.identicicacion_sucu AS ruc,
                    se.ambiente_sremi AS ambiente
                FROM sri_emisor se
                INNER JOIN sis_sucursal su ON se.ide_sucu = su.ide_sucu
                WHERE se.ide_sucu = $1
                LIMIT 1
            `);
            emisorQuery.addIntParam(1, dtoIn.ideSucu);
            await this.dataSource.formatSqlQuery(emisorQuery);
            const emisorRes = await queryRunner.query(emisorQuery.query, emisorQuery.paramValues);
            if (!emisorRes.rows || emisorRes.rows.length === 0) {
                throw new BadRequestException(`No existe configuración de emisor SRI para la sucursal ${dtoIn.ideSucu}`);
            }
            const emisor = emisorRes.rows[0];
            const rucEmisor = emisor.ruc;
            const ambienteSRI = String(emisor.ambiente || '1');

            const estab = ptoEmision.establecimiento_ccdfa;
            const ptoEmi = ptoEmision.pto_emision_ccdfa;
            const serie = `${estab}-${ptoEmi}`;

            // 4-A2. Obtener datos adicionales para infoadicional SRI
            const qVendedor = new SelectQuery(`
                SELECT nombre_vgven FROM ven_vendedor WHERE ide_vgven = $1 LIMIT 1
            `);
            qVendedor.addIntParam(1, data.ide_vgven ?? 0);
            await this.dataSource.formatSqlQuery(qVendedor);
            const vendedorRes = await queryRunner.query(qVendedor.query, qVendedor.paramValues);
            const nombreVendedor = vendedorRes.rows?.[0]?.nombre_vgven ?? '';

            const qFormaPago = new SelectQuery(`
                SELECT nombre_cndfp FROM con_deta_forma_pago WHERE ide_cndfp = $1 LIMIT 1
            `);
            qFormaPago.addIntParam(1, data.ide_cndfp1 ?? 0);
            await this.dataSource.formatSqlQuery(qFormaPago);
            const fpRes = await queryRunner.query(qFormaPago.query, qFormaPago.paramValues);
            const fpRow = fpRes.rows?.[0];
            const descFormaPago = fpRow?.nombre_cndfp ?? '';

            const qCodigoSri = new SelectQuery(`
                SELECT COALESCE(alterno_ats, '') AS codigo_sri
                FROM con_deta_forma_pago WHERE ide_cndfp = $1 LIMIT 1
            `);
            qCodigoSri.addIntParam(1, data.ide_cndfp ?? 0);
            await this.dataSource.formatSqlQuery(qCodigoSri);
            const csRes = await queryRunner.query(qCodigoSri.query, qCodigoSri.paramValues);
            const csRow = csRes.rows?.[0];
            const codigoSri = (csRow?.codigo_sri || String(data.ide_cndfp ?? 1)).padStart(2, '0');

            // 4-B. Obtener secuencial SRI factura con lock
            const secuencialFactura = await this.getNextSriSecuencialLock(
                queryRunner, '01', estab, ptoEmi, dtoIn.ideEmpr,
            );

            // 4-C. Generar clave de acceso factura
            const claveAccesoFactura = generarClaveAcceso({
                fechaEmision: data.fecha_emisi_cccfa,
                codDoc: '01',
                rucEmisor,
                ambiente: ambienteSRI,
                estab,
                ptoEmi,
                secuencial: secuencialFactura,
                tipoEmision: '1',
            });

            // 4-D. Obtener secuencial guía SRI con lock (antes de factura para num_guia_srcom)
            let secuencialGuia: string | null = null;
            let claveAccesoGuia: string | null = null;
            if (tieneGuia && ideSrcomGuia !== null && ideGuia !== null) {
                secuencialGuia = await this.getNextSriSecuencialLock(
                    queryRunner, '06', estab, ptoEmi, dtoIn.ideEmpr,
                );

                claveAccesoGuia = generarClaveAcceso({
                    fechaEmision: data.fecha_emisi_cccfa,
                    codDoc: '06',
                    rucEmisor,
                    ambiente: ambienteSRI,
                    estab,
                    ptoEmi,
                    secuencial: secuencialGuia,
                    tipoEmision: '1',
                });
            }

            // 4-E. INSERT sri_comprobante FACTURA
            const numGuiaFactura = secuencialGuia ? `${serie}-${secuencialGuia}` : null;

            const insertSriFac = this.buildSriFullInsert(
                ideSrcomFactura, '01', data.fecha_emisi_cccfa,
                estab, ptoEmi, secuencialFactura, claveAccesoFactura,
                this.ideSriEstadoCreado, dtoIn,
                totales, data, cliente, diasCredito,
                null, nombreVendedor, descFormaPago,
                numGuiaFactura, codigoSri,
            );
            await this.dataSource.formatSqlQuery(insertSriFac);
            await queryRunner.query(insertSriFac.query, insertSriFac.paramValues);

            // 4-E. UPDATE retroactivo de secuenciales factura
            await queryRunner.query(
                `UPDATE ${MODULE}_${TABLE_CAB} SET secuencial_cccfa = $1, ide_srcom = $2 WHERE ${PK_CAB} = $3`,
                [secuencialFactura, ideSrcomFactura, ideCccfa],
            );

            await queryRunner.query(
                `UPDATE ${TABLE_TRN_CAB} SET observacion_ccctr = $1 WHERE ${PK_TRN_CAB} = $2`,
                [`V/. FACTURA ${secuencialFactura}`, ideCcctr],
            );

            await queryRunner.query(
                `UPDATE ${TABLE_TRN_DET} SET docum_relac_ccdtr = $1, observacion_ccdtr = $2 WHERE ${PK_TRN_DET} = $3`,
                [secuencialFactura, `V/. FACTURA ${secuencialFactura}`, ideCcdtr],
            );

            // 4-F. SRI comprobante + UPDATE guía de remisión
            if (tieneGuia && ideSrcomGuia !== null && ideGuia !== null && secuencialGuia) {
                const insertSriGuia = this.buildSriFullInsert(
                    ideSrcomGuia, '06', data.fecha_emisi_cccfa,
                    estab, ptoEmi, secuencialGuia, claveAccesoGuia!,
                    this.ideSriEstadoCreado, dtoIn,
                    totales, data, cliente, 0,
                    ideSrcomFactura, '', '', null, codigoSri,
                );
                await this.dataSource.formatSqlQuery(insertSriGuia);
                await queryRunner.query(insertSriGuia.query, insertSriGuia.paramValues);

                await queryRunner.query(
                    `UPDATE ${TABLE_GUIA} SET numero_ccgui = $1, ide_srcom = $2 WHERE ${PK_GUIA} = $3`,
                    [secuencialGuia, ideSrcomGuia, ideGuia],
                );
            }

            // 4-G. UPDATE cxc_datos_fac (sincronizar num_actual_ccdfa)
            await queryRunner.query(
                `UPDATE cxc_datos_fac SET num_actual_ccdfa = $1 WHERE ide_ccdaf = $2`,
                [Number(secuencialFactura), data.ide_ccdaf],
            );

            await queryRunner.query('COMMIT');

            return {
                message: 'ok',
                rowCount: 1,
                ide_cccfa: ideCccfa,
                ide_srcom: ideSrcomFactura,
                ide_ccctr: ideCcctr,
                ide_ccgui: ideGuia,
                secuencial_cccfa: secuencialFactura,
                clave_acceso_factura: claveAccesoFactura,
                numero_completo: `${serie}-${secuencialFactura}`,
                total: totales.total,
                kardex_generado: tieneKardex,
                guia_generada: tieneGuia,
                secuencial_guia: secuencialGuia,
                clave_acceso_guia: claveAccesoGuia,
            };
        } catch (error) {
            await queryRunner.query('ROLLBACK');
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIVADO: actualizar factura
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Actualiza cabecera + merge de detalles + transacciones CxC + kardex + sri_comprobante.
     * Compara detalles antiguos vs nuevos: inserta, actualiza y elimina según corresponda.
     */
    private async actualizarFactura(
        ideCccfa: number,
        data: SaveFacturaDto['data'],
        detalles: DetaFacturaDto[],
        totales: Totales,
        tarifaIva: number,
        cliente: any,
        dtoIn: SaveFacturaDto & HeaderParamsDto,
    ) {
        const qExiste = new SelectQuery(
            `SELECT ide_cccfa, ide_srcom, secuencial_cccfa, total_cccfa
             FROM cxc_cabece_factura
             WHERE ide_cccfa = $1 AND ide_empr = $2`,
        );
        qExiste.addIntParam(1, ideCccfa);
        qExiste.addIntParam(2, dtoIn.ideEmpr);
        const existe = await this.dataSource.createSingleQuery(qExiste);

        if (!existe) {
            throw new BadRequestException(`La factura ide_cccfa=${ideCccfa} no existe`);
        }

        const totalAnterior = parseFloat(existe.total_cccfa) || 0;
        const totalCambio = Math.abs(totales.total - totalAnterior) > 0.001;

        // ── 1. sri_comprobante ──────────────────────────────────────────────
        if (existe.ide_srcom) {
            const updSri = new UpdateQuery('sri_comprobante', 'ide_srcom');
            updSri.values.set('subtotal0_srcom', totales.base_tarifa0);
            updSri.values.set('base_grabada_srcom', totales.base_grabada);
            updSri.values.set('subtotal_srcom', totales.base_grabada + totales.base_tarifa0);
            updSri.values.set('iva_srcom', totales.valor_iva);
            updSri.values.set('total_srcom', totales.total);
            updSri.values.set('dias_credito_srcom', data.dias_credito_cccfa ?? 0);
            updSri.values.set('correo_srcom', data.correo_cccfa || null);
            updSri.values.set('identificacion_srcom', cliente.identificac_geper);
            updSri.values.set('usuario_actua', dtoIn.login);
            updSri.values.set('fecha_actua', getCurrentDate());
            updSri.values.set('hora_actua', getCurrentTime());

            if (isDefined(data.ide_vgven)) {
                const qVendedor = new SelectQuery(
                    `SELECT nombre_vgven FROM ven_vendedor WHERE ide_vgven = $1 LIMIT 1`,
                );
                qVendedor.addIntParam(1, data.ide_vgven);
                const vendedor = await this.dataSource.createSingleQuery(qVendedor);
                updSri.values.set('infoadicional1_srcom', vendedor?.nombre_vgven || null);
            }
            if (isDefined(data.ide_cndfp1)) {
                const qFp = new SelectQuery(
                    `SELECT nombre_cndfp FROM con_deta_forma_pago WHERE ide_cndfp = $1 LIMIT 1`,
                );
                qFp.addIntParam(1, data.ide_cndfp1);
                const fp = await this.dataSource.createSingleQuery(qFp);
                updSri.values.set('infoadicional2_srcom', fp?.nombre_cndfp ?? null);
            }
            if (isDefined(data.ide_cndfp)) {
                const qCs = new SelectQuery(
                    `SELECT COALESCE(alterno_ats, '') AS codigo_sri
                     FROM con_deta_forma_pago WHERE ide_cndfp = $1 LIMIT 1`,
                );
                qCs.addIntParam(1, data.ide_cndfp);
                const cs = await this.dataSource.createSingleQuery(qCs);
                const codigoSri = (cs?.codigo_sri || String(data.ide_cndfp ?? 1)).padStart(2, '0');
                updSri.values.set('forma_cobro_srcom', codigoSri);
            }
            if (isDefined(data.observacion_cccfa)) {
                updSri.values.set('infoadicional3_srcom', data.observacion_cccfa);
            }
            updSri.where = `ide_srcom = ${existe.ide_srcom}`;
            await this.dataSource.createQuery(updSri);
        }

        // ── 2. Cabecera de la factura ──────────────────────────────────────
        const updCab = this.buildUpdateCabecera(ideCccfa, data, totales, tarifaIva, dtoIn);
        await this.dataSource.createQuery(updCab);

        // ── 2b. Guía de remisión ───────────────────────────────────────────
        if (dtoIn.guia) {
            const qGuiaExiste = new SelectQuery(
                `SELECT ide_ccgui FROM cxc_guia WHERE ide_cccfa = $1 LIMIT 1`,
            );
            qGuiaExiste.addIntParam(1, ideCccfa);
            const guiaExiste = await this.dataSource.createSingleQuery(qGuiaExiste);

            const guia = dtoIn.guia;
            const fechaIniTrasla = toPgDate(guia.fecha_ini_trasla_ccgui) || data.fecha_emisi_cccfa;
            const fechaFinTrasla = toPgDate(guia.fecha_fin_trasla_ccgui) || fechaIniTrasla;

            if (guiaExiste) {
                await this.dataSource.pool.query(
                    `UPDATE cxc_guia
                     SET ide_cctgi = $1,
                         punto_partida_ccgui = $2,
                         punto_llegada_ccgui = $3,
                         fecha_emision_ccgui = $4,
                         fecha_ini_trasla_ccgui = $5,
                         fecha_fin_trasla_ccgui = $6,
                         placa_gecam = $7,
                         gen_ide_geper = $8,
                         destinatario_ccgui = $9,
                         usuario_actua = $10,
                         fecha_actua = $11,
                         hora_actua = $12
                     WHERE ide_ccgui = $13`,
                    [guia.ide_cctgi, guia.punto_partida_ccgui, guia.punto_llegada_ccgui,
                        data.fecha_emisi_cccfa, fechaIniTrasla, fechaFinTrasla,
                        guia.placa_gecam, guia.gen_ide_geper,
                        guia.destinatario_ccgui ?? null,
                        dtoIn.login, getCurrentDate(), getCurrentTime(),
                        guiaExiste.ide_ccgui],
                );

                const qTrsp = new SelectQuery(
                    `SELECT ide_cctfa, es_transporte_propio_cctfa FROM cxc_transporte_factura WHERE ide_cccfa = $1 LIMIT 1`,
                );
                qTrsp.addIntParam(1, ideCccfa);
                const trspExiste = await this.dataSource.createSingleQuery(qTrsp);

                if (trspExiste && trspExiste.es_transporte_propio_cctfa) {
                    await this.dataSource.pool.query(
                        `UPDATE cxc_transporte_factura
                         SET ide_gecam = $1,
                             ide_geper = $2,
                             usuario_actua = $3,
                             fecha_actua = $4,
                             hora_actua = $5
                         WHERE ide_cctfa = $6`,
                        [guia.placa_gecam, guia.gen_ide_geper,
                            dtoIn.login, getCurrentDate(), getCurrentTime(),
                            trspExiste.ide_cctfa],
                    );
                }
            } else {
                const ideGuia = await this.dataSource.getSeqTable(TABLE_GUIA, PK_GUIA, 1, dtoIn.login);
                const insertGuia = this.buildInsertGuia(ideGuia, ideCccfa, cliente, data, dtoIn);
                await this.dataSource.createQuery(insertGuia);
            }
        }

        // ── 3. Merge de detalles (insert / update / delete) ────────────────
        if (detalles.length > 0) {
            const qOldDet = new SelectQuery(
                `SELECT * FROM cxc_deta_factura WHERE ide_cccfa = $1 ORDER BY ide_ccdfa`,
            );
            qOldDet.addIntParam(1, ideCccfa);
            const oldDetalles = await this.dataSource.createSelectQuery(qOldDet);

            const oldMap = new Map<number, any>();
            for (const od of oldDetalles) {
                oldMap.set(Number(od.ide_ccdfa), od);
            }

            const newIds = new Set<number>();
            for (const det of detalles) {
                if (det.ide_ccdfa != null) {
                    newIds.add(det.ide_ccdfa);
                }
            }

            // Eliminar detalles que ya no vienen del frontend
            for (const [oldId, _oldRow] of oldMap) {
                if (!newIds.has(oldId)) {
                    await this.dataSource.pool.query(
                        `DELETE FROM cxc_deta_factura WHERE ide_ccdfa = $1 AND ide_cccfa = $2`,
                        [oldId, ideCccfa],
                    );
                }
            }

            // Insertar o actualizar cada detalle del frontend
            for (const det of detalles) {
                if (det.ide_ccdfa != null && oldMap.has(det.ide_ccdfa)) {
                    // Update
                    const oldRow = oldMap.get(det.ide_ccdfa)!;
                    const cambiaron = det.cantidad_ccdfa !== Number(oldRow.cantidad_ccdfa)
                        || det.precio_ccdfa !== Number(oldRow.precio_ccdfa)
                        || det.total_ccdfa !== Number(oldRow.total_ccdfa)
                        || det.iva_inarti_ccdfa !== Number(oldRow.iva_inarti_ccdfa)
                        || (det.observacion_ccdfa || '') !== (oldRow.observacion_ccdfa || '')
                        || (det.ide_inuni ?? null) !== (oldRow.ide_inuni ?? null);
                    if (cambiaron) {
                        const updDet = new UpdateQuery('cxc_deta_factura', 'ide_ccdfa');
                        updDet.values.set('cantidad_ccdfa', det.cantidad_ccdfa);
                        updDet.values.set('precio_ccdfa', det.precio_ccdfa);
                        updDet.values.set('total_ccdfa', det.total_ccdfa);
                        updDet.values.set('iva_inarti_ccdfa', det.iva_inarti_ccdfa);
                        updDet.values.set('usuario_actua', dtoIn.login);
                        updDet.values.set('fecha_actua', getCurrentDate());
                        updDet.values.set('hora_actua', getCurrentTime());
                        if (isDefined(det.observacion_ccdfa)) updDet.values.set('observacion_ccdfa', det.observacion_ccdfa);
                        if (isDefined(det.ide_inuni)) updDet.values.set('ide_inuni', det.ide_inuni);
                        updDet.where = `ide_ccdfa = ${det.ide_ccdfa} AND ide_cccfa = ${ideCccfa}`;
                        await this.dataSource.createQuery(updDet);
                    }
                } else {
                    // Insert
                    const ideCcdfa = await this.dataSource.getSeqTable(
                        `${MODULE}_${TABLE_DET}`, PK_DET, 1, dtoIn.login,
                    );
                    const insertDet = this.buildInsertDetalle(ideCccfa, ideCcdfa, det, dtoIn);
                    await this.dataSource.createQuery(insertDet);
                }
            }
        }

        // ── 4. Transacciones CxC ───────────────────────────────────────────
        if (totalCambio) {
            const qTrnCab = new SelectQuery(
                `SELECT ide_ccctr FROM cxc_cabece_transa WHERE ide_cccfa = $1 LIMIT 1`,
            );
            qTrnCab.addIntParam(1, ideCccfa);
            const trnCab = await this.dataSource.createSingleQuery(qTrnCab);

            if (trnCab) {
                const secuencial = existe.secuencial_cccfa || '';
                await this.dataSource.pool.query(
                    `UPDATE cxc_cabece_transa
                     SET observacion_ccctr = $1,
                         usuario_actua = $3,
                         fecha_actua = $4,
                         hora_actua = $5
                     WHERE ide_ccctr = $2`,
                    [`FACTURA ${secuencial}`, trnCab.ide_ccctr, dtoIn.login, getCurrentDate(), getCurrentTime()],
                );

                const diasCredito = data.dias_credito_cccfa ?? 0;
                const fechaVencimiento = this.sumarDias(data.fecha_emisi_cccfa, diasCredito);
                await this.dataSource.pool.query(
                    `UPDATE cxc_detall_transa
                     SET valor_ccdtr = $1,
                         fecha_venci_ccdtr = $2,
                         docum_relac_ccdtr = $3,
                         observacion_ccdtr = $4,
                         usuario_actua = $5,
                         fecha_actua = $6,
                         hora_actua = $7
                     WHERE ide_cccfa = $8 AND ide_ccttr = $9`,
                    [totales.total, fechaVencimiento, secuencial, `FACTURA ${secuencial}`,
                        dtoIn.login, getCurrentDate(), getCurrentTime(),
                        ideCccfa, this.ideTipoTransFactura],
                );
            }
        }

        // ── 5. Kardex de inventario ────────────────────────────────────────
        const detallesConKardex = await this.getDetallesConKardex(detalles);
        const tieneKardex = detallesConKardex.length > 0;

        const qInvExiste = new SelectQuery(
            `SELECT DISTINCT d.ide_incci
             FROM inv_det_comp_inve d
             WHERE d.ide_cccfa = $1
             LIMIT 1`,
        );
        qInvExiste.addIntParam(1, ideCccfa);
        const invExiste = await this.dataSource.createSingleQuery(qInvExiste);

        if (invExiste && tieneKardex) {
            const ideIncci = Number(invExiste.ide_incci);
            const secuencial = existe.secuencial_cccfa || '';

            await this.dataSource.pool.query(
                `UPDATE inv_cab_comp_inve
                 SET fecha_trans_incci = $1,
                     fecha_efect_incci = $1,
                     observacion_incci = $2,
                     referencia_incci = $3,
                     usuario_actua = $4,
                     fecha_actua = $5,
                     hora_actua = $6
                 WHERE ide_incci = $7`,
                [data.fecha_emisi_cccfa, `VENTA FACTURA ${secuencial}`,
                    secuencial.slice(-12), dtoIn.login, getCurrentDate(), getCurrentTime(),
                    ideIncci],
            );

            // Merge de detalles de kardex
            const conversiones = await this.getConversionesUnidades(detallesConKardex);
            const qOldInvDet = new SelectQuery(
                `SELECT * FROM inv_det_comp_inve WHERE ide_incci = $1 ORDER BY ide_indci`,
            );
            qOldInvDet.addIntParam(1, ideIncci);
            const oldInvDet = await this.dataSource.createSelectQuery(qOldInvDet);

            const oldInvMap = new Map<number, any>();
            for (const od of oldInvDet) {
                oldInvMap.set(Number(od.ide_inarti), od);
            }

            const newInvIds = new Set<number>();
            for (const det of detallesConKardex) {
                newInvIds.add(det.ide_inarti);
            }

            // Eliminar items de kardex que ya no vienen
            for (const [artId, od] of oldInvMap) {
                if (!newInvIds.has(artId)) {
                    await this.dataSource.pool.query(
                        `DELETE FROM inv_det_comp_inve WHERE ide_indci = $1 AND ide_incci = $2`,
                        [od.ide_indci, ideIncci],
                    );
                }
            }

            // Insertar o actualizar items de kardex
            for (const det of detallesConKardex) {
                const key = `${det.ide_inarti}_${det.ide_inuni ?? ''}`;
                const conversion = conversiones.get(key);
                const cantidadConvertida = conversion
                    ? Number((det.cantidad_ccdfa * conversion).toFixed(6))
                    : det.cantidad_ccdfa;
                const valorConvertido = conversion
                    ? Number((Math.abs(det.total_ccdfa) * (cantidadConvertida / det.cantidad_ccdfa)).toFixed(2))
                    : Math.abs(det.total_ccdfa);

                if (oldInvMap.has(det.ide_inarti)) {
                    const od = oldInvMap.get(det.ide_inarti)!;
                    await this.dataSource.pool.query(
                        `UPDATE inv_det_comp_inve
                         SET cantidad_indci = $1,
                             precio_indci = $2,
                             valor_indci = $3,
                             usuario_actua = $4,
                             fecha_actua = $5,
                             hora_actua = $6
                         WHERE ide_indci = $7 AND ide_incci = $8`,
                        [Math.abs(cantidadConvertida), det.precio_ccdfa, Math.abs(valorConvertido),
                            dtoIn.login, getCurrentDate(), getCurrentTime(),
                            od.ide_indci, ideIncci],
                    );
                } else {
                    const ideIndci = await this.dataSource.getSeqTable(TABLE_INV_DET, PK_INV_DET, 1, dtoIn.login);
                    const qDet = new InsertQuery(TABLE_INV_DET, PK_INV_DET, dtoIn);
                    qDet.values.set('ide_indci', ideIndci);
                    qDet.values.set('ide_incci', ideIncci);
                    qDet.values.set('ide_inarti', det.ide_inarti);
                    qDet.values.set('ide_cccfa', ideCccfa);
                    qDet.values.set('secuencial_indci', String(oldInvDet.length + 1).padStart(6, '0'));
                    qDet.values.set('cantidad_indci', Math.abs(cantidadConvertida));
                    qDet.values.set('precio_indci', det.precio_ccdfa);
                    qDet.values.set('valor_indci', Math.abs(valorConvertido));
                    qDet.values.set('usuario_ingre', dtoIn.login);
                    qDet.values.set('fecha_ingre', getCurrentDate());
                    qDet.values.set('hora_ingre', getCurrentTime());
                    await this.dataSource.createQuery(qDet);
                }
            }
        } else if (!invExiste && tieneKardex) {
            // Si no existía kardex pero ahora hay items con kardex, crear
            const secuencial = existe.secuencial_cccfa || '';
            const ideBodega = await this.getBodegaSucursal(dtoIn.ideSucu);
            const ideIncci = await this.dataSource.getSeqTable(TABLE_INV_CAB, PK_INV_CAB, 1, dtoIn.login);
            const baseIdeIndci = await this.dataSource.getSeqTable(TABLE_INV_DET, PK_INV_DET, detallesConKardex.length, dtoIn.login);
            const kardexQueries = await this.buildKardexQueries(
                ideIncci, baseIdeIndci, ideCccfa, secuencial,
                data, cliente, detallesConKardex, dtoIn, ideBodega,
            );
            for (const q of kardexQueries) {
                await this.dataSource.createQuery(q);
            }
        } else if (invExiste && !tieneKardex) {
            // Si antes tenía kardex pero ya no, eliminar
            const ideIncci = Number(invExiste.ide_incci);
            await this.dataSource.pool.query(
                `DELETE FROM inv_det_comp_inve WHERE ide_incci = $1`,
                [ideIncci],
            );
            await this.dataSource.pool.query(
                `DELETE FROM inv_cab_comp_inve WHERE ide_incci = $1`,
                [ideIncci],
            );
        }

        // ── 6. Actualizar datos del cliente ────────────────────────────────
        const updCliente = new UpdateQuery('gen_persona', 'ide_geper', dtoIn);
        let tieneCambios = false;

        if (isDefined(data.direccion_cccfa) && data.direccion_cccfa !== (cliente.direccion_geper ?? '')) {
            updCliente.values.set('direccion_geper', data.direccion_cccfa);
            tieneCambios = true;
        }
        if (isDefined(data.telefono_cccfa) && data.telefono_cccfa !== (cliente.telefono_geper ?? '')) {
            updCliente.values.set('telefono_geper', data.telefono_cccfa);
            tieneCambios = true;
        }
        if (isDefined(data.correo_cccfa) && data.correo_cccfa !== (cliente.correo_geper ?? '')) {
            updCliente.values.set('correo_geper', data.correo_cccfa);
            tieneCambios = true;
        }
        if (isDefined(data.ide_cndfp1) && data.ide_cndfp1 !== (cliente.ide_cndfp ?? null)) {
            updCliente.values.set('ide_cndfp', data.ide_cndfp1);
            tieneCambios = true;
        }
        if (isDefined(data.ide_geprov) && data.ide_geprov !== (cliente.ide_geprov ?? null)) {
            updCliente.values.set('ide_geprov', data.ide_geprov);
            tieneCambios = true;
        }
        if (isDefined(data.ide_gecant) && data.ide_gecant !== (cliente.ide_gecant ?? null)) {
            updCliente.values.set('ide_gecant', data.ide_gecant);
            tieneCambios = true;
        }

        if (tieneCambios) {
            updCliente.where = `ide_geper = ${data.ide_geper}`;
            await this.dataSource.createQuery(updCliente);
        }

        return {
            message: 'ok',
            rowCount: 1,
            ide_cccfa: ideCccfa,
            total: totales.total,
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
        q.values.set('ide_cccfa', data.ide_cccfa);
        q.values.set('ide_ccdaf', data.ide_ccdaf);
        q.values.set('ide_geper', data.ide_geper);
        q.values.set('ide_cntdo', data.ide_cntdo);
        q.values.set('ide_ccefa', data.ide_ccefa);
        q.values.set('ide_usua', data.ide_usua);
        q.values.set('fecha_emisi_cccfa', data.fecha_emisi_cccfa);
        q.values.set('fecha_trans_cccfa', getCurrentDate());
        q.values.set('base_no_objeto_iva_cccfa', totales.base_no_objeto_iva);
        q.values.set('base_tarifa0_cccfa', totales.base_tarifa0);
        q.values.set('base_grabada_cccfa', totales.base_grabada);
        q.values.set('valor_iva_cccfa', totales.valor_iva);
        q.values.set('tarifa_iva_cccfa', tarifaIva);
        q.values.set('total_cccfa', totales.total);
        q.values.set('dias_credito_cccfa', data.dias_credito_cccfa ?? 0);
        q.values.set('pagado_cccfa', false);
        q.values.set('solo_guardar_cccfa', true);
        q.values.set('usuario_ingre', dtoIn.login);
        q.values.set('fecha_ingre', getCurrentDate());
        q.values.set('hora_ingre', getCurrentTime());
        if (isDefined(data.ide_vgven)) q.values.set('ide_vgven', data.ide_vgven);
        if (isDefined(data.ide_cndfp1)) q.values.set('ide_cndfp1', data.ide_cndfp1);
        if (isDefined(data.ide_cndfp)) q.values.set('ide_cndfp', data.ide_cndfp);
        if (isDefined(data.telefono_cccfa)) q.values.set('telefono_cccfa', data.telefono_cccfa);
        if (isDefined(data.observacion_cccfa)) q.values.set('observacion_cccfa', data.observacion_cccfa);
        if (isDefined(data.direccion_cccfa)) q.values.set('direccion_cccfa', data.direccion_cccfa);
        if (isDefined(data.correo_cccfa)) q.values.set('correo_cccfa', data.correo_cccfa);
        if (isDefined(data.orden_compra_cccfa)) q.values.set('orden_compra_cccfa', data.orden_compra_cccfa);
        if (isDefined(data.num_proforma_cccfa)) q.values.set('num_proforma_cccfa', data.num_proforma_cccfa);
        if (isDefined(data.secuencial_cccfa)) q.values.set('secuencial_cccfa', data.secuencial_cccfa);
        if (isDefined(data.ide_srcom)) q.values.set('ide_srcom', data.ide_srcom);
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
        q.values.set('ide_ccdaf', data.ide_ccdaf);
        q.values.set('ide_geper', data.ide_geper);
        q.values.set('fecha_emisi_cccfa', data.fecha_emisi_cccfa);
        q.values.set('base_no_objeto_iva_cccfa', totales.base_no_objeto_iva);
        q.values.set('base_tarifa0_cccfa', totales.base_tarifa0);
        q.values.set('base_grabada_cccfa', totales.base_grabada);
        q.values.set('valor_iva_cccfa', totales.valor_iva);
        q.values.set('tarifa_iva_cccfa', tarifaIva);
        q.values.set('total_cccfa', totales.total);
        q.values.set('dias_credito_cccfa', data.dias_credito_cccfa ?? 0);
        q.values.set('usuario_actua', dtoIn.login);
        q.values.set('fecha_actua', getCurrentDate());
        q.values.set('hora_actua', getCurrentTime());
        if (isDefined(data.ide_vgven)) q.values.set('ide_vgven', data.ide_vgven);
        if (isDefined(data.ide_cndfp1)) q.values.set('ide_cndfp1', data.ide_cndfp1);
        if (isDefined(data.ide_cndfp)) q.values.set('ide_cndfp', data.ide_cndfp);
        if (isDefined(data.telefono_cccfa)) q.values.set('telefono_cccfa', data.telefono_cccfa);
        if (isDefined(data.observacion_cccfa)) q.values.set('observacion_cccfa', data.observacion_cccfa);
        if (isDefined(data.direccion_cccfa)) q.values.set('direccion_cccfa', data.direccion_cccfa);
        if (isDefined(data.correo_cccfa)) q.values.set('correo_cccfa', data.correo_cccfa);
        if (isDefined(data.orden_compra_cccfa)) q.values.set('orden_compra_cccfa', data.orden_compra_cccfa);
        if (isDefined(data.num_proforma_cccfa)) q.values.set('num_proforma_cccfa', data.num_proforma_cccfa);
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
        q.values.set('ide_ccdfa', ideCcdfa);
        q.values.set('ide_cccfa', ideCccfa);
        q.values.set('ide_inarti', det.ide_inarti);
        q.values.set('cantidad_ccdfa', det.cantidad_ccdfa);
        q.values.set('precio_ccdfa', det.precio_ccdfa);
        q.values.set('total_ccdfa', det.total_ccdfa);
        q.values.set('iva_inarti_ccdfa', det.iva_inarti_ccdfa);
        q.values.set('credito_tributario_ccdfa', det.credito_tributario_ccdfa ?? false);
        q.values.set('usuario_ingre', dtoIn.login);
        q.values.set('fecha_ingre', getCurrentDate());
        q.values.set('hora_ingre', getCurrentTime());
        if (isDefined(det.observacion_ccdfa)) q.values.set('observacion_ccdfa', det.observacion_ccdfa);
        if (isDefined(det.ide_inuni)) q.values.set('ide_inuni', det.ide_inuni);
        q.values.set('alterno_ccdfa', det.alterno_ccdfa ?? '00');
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
        q.values.set('ide_ccctr', ideCcctr);
        q.values.set('ide_geper', ideGeper);
        q.values.set('ide_cccfa', ideCccfa);
        q.values.set('ide_ccttr', this.ideTipoTransFactura);
        q.values.set('fecha_trans_ccctr', fechaTrans);
        q.values.set('observacion_ccctr', `FACTURA ${secuencial}`);
        q.values.set('usuario_ingre', dtoIn.login);
        q.values.set('fecha_ingre', getCurrentDate());
        q.values.set('hora_ingre', getCurrentTime());
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
        q.values.set('ide_ccdtr', ideCcdtr);
        q.values.set('ide_ccctr', ideCcctr);
        q.values.set('ide_cccfa', ideCccfa);
        q.values.set('ide_ccttr', this.ideTipoTransFactura);
        q.values.set('ide_usua', dtoIn.ideUsua);
        q.values.set('fecha_trans_ccdtr', fechaTrans);
        q.values.set('fecha_venci_ccdtr', fechaVenci);
        q.values.set('numero_pago_ccdtr', 0);
        q.values.set('valor_ccdtr', valorTotal);
        q.values.set('docum_relac_ccdtr', secuencial);
        q.values.set('observacion_ccdtr', `FACTURA ${secuencial}`);
        q.values.set('usuario_ingre', dtoIn.login);
        q.values.set('fecha_ingre', getCurrentDate());
        q.values.set('hora_ingre', getCurrentTime());
        // ide_cnccc (asiento contable) y ide_teclb (libro banco) quedan NULL
        // se vinculan cuando se contabiliza o se registra el pago
        return q;
    }

    /**
     * Construye los INSERTs del comprobante de inventario (kardex de salida por venta).
     * Solo se llama para artículos con hace_kardex_inarti = true.
     * Aplica conversión de unidades si la línea usa una unidad distinta a la base del producto.
     */
    private async buildKardexQueries(
        ideIncci: number,
        baseIdeIndci: number,
        ideCccfa: number,
        secuencial: string,
        data: SaveFacturaDto['data'],
        cliente: any,
        detallesKardex: DetaFacturaDto[],
        dtoIn: SaveFacturaDto & HeaderParamsDto,
        ideBodega: number,
    ): Promise<InsertQuery[]> {
        const queries: InsertQuery[] = [];

        // ── Conversión de unidades ──────────────────────────────────────────
        const conversiones = await this.getConversionesUnidades(detallesKardex);

        // Cabecera del comprobante de inventario
        const qCab = new InsertQuery(TABLE_INV_CAB, PK_INV_CAB, dtoIn);
        qCab.values.set('ide_incci', ideIncci);
        qCab.values.set('ide_geper', cliente.ide_geper);
        qCab.values.set('ide_intti', this.ideTipoTransaccionVenta);
        qCab.values.set('ide_inbod', ideBodega);
        qCab.values.set('ide_inepi', this.ideEstadoNormalInv);
        qCab.values.set('ide_usua', dtoIn.ideUsua);
        qCab.values.set('numero_incci', secuencial.slice(-10));
        qCab.values.set('fecha_trans_incci', data.fecha_emisi_cccfa);
        qCab.values.set('fecha_efect_incci', data.fecha_emisi_cccfa);
        qCab.values.set('observacion_incci', `VENTA FACTURA ${secuencial}`);
        qCab.values.set('referencia_incci', secuencial.slice(-12));
        qCab.values.set('automatico_incci', true);
        qCab.values.set('verifica_incci', false);
        qCab.values.set('usuario_ingre', dtoIn.login);
        qCab.values.set('fecha_ingre', getCurrentDate());
        qCab.values.set('hora_ingre', getCurrentTime());
        queries.push(qCab);

        // Detalle por cada artículo con kardex
        detallesKardex.forEach((det, idx) => {
            const key = `${det.ide_inarti}_${det.ide_inuni ?? ''}`;
            const conversion = conversiones.get(key);
            const cantidadConvertida = conversion
                ? Number((det.cantidad_ccdfa * conversion).toFixed(6))
                : det.cantidad_ccdfa;
            const valorConvertido = conversion
                ? Number((Math.abs(det.total_ccdfa) * (cantidadConvertida / det.cantidad_ccdfa)).toFixed(2))
                : Math.abs(det.total_ccdfa);

            const qDet = new InsertQuery(TABLE_INV_DET, PK_INV_DET, dtoIn);
            qDet.values.set('ide_indci', baseIdeIndci + idx);
            qDet.values.set('ide_incci', ideIncci);
            qDet.values.set('ide_inarti', det.ide_inarti);
            qDet.values.set('ide_cccfa', ideCccfa);
            qDet.values.set('secuencial_indci', String(idx + 1).padStart(6, '0'));
            qDet.values.set('cantidad_indci', Math.abs(cantidadConvertida));
            qDet.values.set('precio_indci', det.precio_ccdfa);
            qDet.values.set('valor_indci', Math.abs(valorConvertido));
            qDet.values.set('usuario_ingre', dtoIn.login);
            qDet.values.set('fecha_ingre', getCurrentDate());
            qDet.values.set('hora_ingre', getCurrentTime());
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
        const fechaIniTrasla = toPgDate(guia.fecha_ini_trasla_ccgui) || data.fecha_emisi_cccfa;
        const fechaFinTrasla = toPgDate(guia.fecha_fin_trasla_ccgui) || fechaIniTrasla;
        const q = new InsertQuery(TABLE_GUIA, PK_GUIA, dtoIn);
        q.values.set('ide_ccgui', ideGuia);
        q.values.set('ide_cccfa', ideCccfa);
        q.values.set('ide_geper', cliente.ide_geper);
        q.values.set('ide_cctgi', guia.ide_cctgi);
        q.values.set('ide_ccdaf', data.ide_ccdaf);
        q.values.set('fecha_emision_ccgui',    data.fecha_emisi_cccfa);
        q.values.set('fecha_ini_trasla_ccgui', fechaIniTrasla);
        q.values.set('fecha_fin_trasla_ccgui', fechaFinTrasla);
        q.values.set('punto_partida_ccgui', guia.punto_partida_ccgui);
        q.values.set('punto_llegada_ccgui', guia.punto_llegada_ccgui);
        q.values.set('destinatario_ccgui', guia.destinatario_ccgui ?? cliente.nom_geper);
        q.values.set('usuario_ingre', dtoIn.login);
        q.values.set('fecha_ingre', getCurrentDate());
        q.values.set('hora_ingre', getCurrentTime());
        if (isDefined(guia.placa_gecam)) q.values.set('placa_gecam', guia.placa_gecam);
        if (isDefined(guia.gen_ide_geper)) q.values.set('gen_ide_geper', guia.gen_ide_geper);
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
                   g.correo_geper, g.direccion_geper, g.telefono_geper,
                   g.ide_geprov, g.ide_gecant, g.ide_cndfp,
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
        const total = Number((baseTarifa0 + baseGrabada + valorIva).toFixed(2));

        return {
            base_no_objeto_iva: 0,
            base_tarifa0: Number(baseTarifa0.toFixed(2)),
            base_grabada: Number(baseGrabada.toFixed(2)),
            valor_iva: valorIva,
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

    /**
     * Obtiene los factores de conversión de unidades para los items del kardex.
     * Retorna un Map key=${ide_inarti}_${ide_inuni_origen} → factor.
     * Si la unidad de la línea es igual a la unidad base del producto, no se incluye.
     * Si no existe conversión configurada, no se incluye (se usa cantidad original).
     */
    private async getConversionesUnidades(
        detallesKardex: DetaFacturaDto[],
    ): Promise<Map<string, number>> {
        const result = new Map<string, number>();
        if (!detallesKardex.length) return result;

        const idsArti = [...new Set(detallesKardex.map(d => d.ide_inarti))];

        const q = new SelectQuery(`
            SELECT
                a.ide_inarti,
                cu.ide_inuni AS ide_inuni_origen,
                cu.cantidad_incon
            FROM inv_articulo a
            INNER JOIN inv_conversion_unidad cu
                ON cu.ide_inarti = a.ide_inarti
               AND cu.inv_ide_inuni = a.ide_inuni
            WHERE a.ide_inarti = ANY($1)
        `);
        q.addParam(1, idsArti);
        const rows = await this.dataSource.createSelectQuery(q);

        for (const row of rows) {
            if (row.ide_inuni_origen !== null && row.cantidad_incon !== null) {
                const key = `${row.ide_inarti}_${row.ide_inuni_origen}`;
                result.set(key, Number(row.cantidad_incon));
            }
        }

        return result;
    }

    /**
     * Valida la identificación del cliente (cédula/RUC) usando los validadores
     * existentes del proyecto (cedula-ruc.ts).
     */
    private validarIdentificacion(cliente: any): void {
        const id = (cliente.identificac_geper || '').trim();
        if (!id) {
            throw new BadRequestException('El cliente no tiene identificación (cédula/RUC).');
        }

        if (id.length === 10) {
            if (!validateCedula(id)) {
                throw new BadRequestException(`Cédula inválida: ${id}.`);
            }
            return;
        }

        if (id.length === 13) {
            const result = validateRUC(id);
            if (!result.isValid) {
                throw new BadRequestException(`RUC inválido: ${id}. ${result.type}`);
            }
            return;
        }

        throw new BadRequestException(`Identificación inválida: ${id}. Debe ser cédula (10 dígitos) o RUC (13 dígitos).`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SRI SECUENCIAL + CLAVE DE ACCESO
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Obtiene el siguiente secuencial SRI con lock por advisory lock de PostgreSQL.
     * El lock es transaccional (pg_advisory_xact_lock) — se libera al COMMIT/ROLLBACK.
     * Clave única por (ide_empr, coddoc, estab, ptoemi).
     */
    private async getNextSriSecuencialLock(
        queryRunner: any,
        coddoc: string,
        estab: string,
        ptoEmi: string,
        ideEmpr: number,
    ): Promise<string> {
        const lockKey = ideEmpr * 100000000
            + parseInt(coddoc) * 1000000
            + parseInt(estab) * 1000
            + parseInt(ptoEmi);

        await queryRunner.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

        const q = new SelectQuery(`
            SELECT COALESCE(MAX(secuencial_srcom::integer), 0) + 1 AS next_seq
            FROM sri_comprobante
            WHERE estab_srcom = $1 AND ptoemi_srcom = $2 AND coddoc_srcom = $3
              AND ide_empr = $4
        `);
        q.addStringParam(1, estab);
        q.addStringParam(2, ptoEmi);
        q.addStringParam(3, coddoc);
        q.addIntParam(4, ideEmpr);
        await this.dataSource.formatSqlQuery(q);
        const res = await queryRunner.query(q.query, q.paramValues);
        const nextSeq = Number(res.rows[0]?.next_seq ?? 1);
        return String(nextSeq).padStart(9, '0');
    }

    /**
     * Construye INSERT completo para sri_comprobante (factura o guía).
     * Incluye todos los campos que el código Java referencia.
     */
    private buildSriFullInsert(
        ideSrcom: number,
        coddoc: string,
        fechaEmision: string,
        estab: string,
        ptoEmi: string,
        secuencial: string,
        claveAcceso: string,
        ideSresc: number,
        dtoIn: SaveFacturaDto & HeaderParamsDto,
        totales: Totales,
        data: SaveFacturaDto['data'],
        cliente: any,
        diasCredito: number,
        sriIdeSrcom: number | null,
        nombreVendedor: string,
        descFormaPago: string,
        numGuiaSRI: string | null,
        codigoSri: string,
    ): InsertQuery {
        const q = new InsertQuery('sri_comprobante', 'ide_srcom');
        q.values.set('ide_srcom', ideSrcom);
        q.values.set('coddoc_srcom', coddoc);
        q.values.set('tipoemision_srcom', '1');
        q.values.set('fechaemision_srcom', fechaEmision);
        q.values.set('estab_srcom', estab);
        q.values.set('ptoemi_srcom', ptoEmi);
        q.values.set('secuencial_srcom', secuencial);
        q.values.set('claveacceso_srcom', claveAcceso);
        q.values.set('ide_sresc', ideSresc);
        q.values.set('subtotal0_srcom', totales.base_tarifa0);
        q.values.set('base_grabada_srcom', totales.base_grabada);
        q.values.set('subtotal_srcom', totales.base_grabada + totales.base_tarifa0);
        q.values.set('iva_srcom', totales.valor_iva);
        q.values.set('total_srcom', totales.total);
        q.values.set('descuento_srcom', 0);
        q.values.set('identificacion_srcom', cliente.identificac_geper);
        q.values.set('forma_cobro_srcom', codigoSri);
        q.values.set('dias_credito_srcom', diasCredito);
        q.values.set('correo_srcom', data.correo_cccfa ?? cliente.correo_geper ?? null);
        q.values.set('ide_geper', data.ide_geper);
        q.values.set('ide_cntdo', this.ideTipoDocFactura);
        q.values.set('ide_empr', dtoIn.ideEmpr);
        q.values.set('ide_sucu', dtoIn.ideSucu);
        q.values.set('orden_compra_srcom', data.orden_compra_cccfa ?? null);
        q.values.set('reutiliza_srcom', false);
        q.values.set('en_nube_srcom', false);
        q.values.set('usuario_ingre', dtoIn.login);
        q.values.set('fecha_sistema_srcom', getCurrentDate());
        q.values.set('ip_genera_srcom', dtoIn.ip ?? 'localhost');
        q.values.set('infoadicional1_srcom', nombreVendedor || null);
        q.values.set('infoadicional2_srcom', descFormaPago || null);
        q.values.set('infoadicional3_srcom', data.observacion_cccfa || null);
        if (numGuiaSRI) {
            q.values.set('num_guia_srcom', numGuiaSRI);
        }
        if (sriIdeSrcom !== null) {
            q.values.set('sri_ide_srcom', sriIdeSrcom);
        }
        if (coddoc === '06') {
            const guia = dtoIn.guia;
            if (guia) {
                q.values.set('placa_srcom', guia.placa_gecam ?? null);
                q.values.set('direcion_partida_srcom', guia.punto_partida_ccgui ?? null);
                q.values.set('fecha_ini_trans_srcom', guia.fecha_ini_trasla_ccgui ?? null);
                q.values.set('fecha_fin_trans_srcom', guia.fecha_fin_trasla_ccgui ?? null);
            }
        }
        return q;
    }
}
