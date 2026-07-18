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
                SELECT nombre_cndfp, dias_cndfp FROM con_deta_forma_pago WHERE ide_cndfp = $1 LIMIT 1
            `);
            qFormaPago.addIntParam(1, data.ide_cndfp1 ?? 0);
            await this.dataSource.formatSqlQuery(qFormaPago);
            const fpRes = await queryRunner.query(qFormaPago.query, qFormaPago.paramValues);
            const descFormaPago = fpRes.rows?.[0]
                ? `${fpRes.rows[0].nombre_cndfp} (${fpRes.rows[0].dias_cndfp ?? 0} días)`
                : '';

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
                numGuiaFactura,
            );
            await this.dataSource.formatSqlQuery(insertSriFac);
            await queryRunner.query(insertSriFac.query, insertSriFac.paramValues);

            // 4-E. UPDATE retroactivo de secuenciales factura
            const updFactura = new UpdateQuery(`${MODULE}_${TABLE_CAB}`, PK_CAB, dtoIn);
            updFactura.values.set('secuencial_cccfa', secuencialFactura);
            updFactura.values.set('ide_srcom', ideSrcomFactura);
            updFactura.values.delete('usuario_actua');
            updFactura.values.delete('fecha_actua');
            updFactura.values.delete('hora_actua');
            updFactura.where = `${PK_CAB} = $1`;
            updFactura.addIntParam(1, ideCccfa);
            await this.dataSource.formatSqlQuery(updFactura);
            await queryRunner.query(updFactura.query, updFactura.paramValues);

            const updTrnCab = new UpdateQuery(TABLE_TRN_CAB, PK_TRN_CAB, dtoIn);
            updTrnCab.values.set('observacion_ccctr', `V/. FACTURA ${secuencialFactura}`);
            updTrnCab.values.delete('usuario_actua');
            updTrnCab.values.delete('fecha_actua');
            updTrnCab.values.delete('hora_actua');
            updTrnCab.where = `${PK_TRN_CAB} = $1`;
            updTrnCab.addIntParam(1, ideCcctr);
            await this.dataSource.formatSqlQuery(updTrnCab);
            await queryRunner.query(updTrnCab.query, updTrnCab.paramValues);

            const updTrnDet = new UpdateQuery(TABLE_TRN_DET, PK_TRN_DET, dtoIn);
            updTrnDet.values.set('docum_relac_ccdtr', secuencialFactura);
            updTrnDet.values.set('observacion_ccdtr', `V/. FACTURA ${secuencialFactura}`);
            updTrnDet.values.delete('usuario_actua');
            updTrnDet.values.delete('fecha_actua');
            updTrnDet.values.delete('hora_actua');
            updTrnDet.where = `${PK_TRN_DET} = $1`;
            updTrnDet.addIntParam(1, ideCcdtr);
            await this.dataSource.formatSqlQuery(updTrnDet);
            await queryRunner.query(updTrnDet.query, updTrnDet.paramValues);

            // 4-F. SRI comprobante + UPDATE guía de remisión
            if (tieneGuia && ideSrcomGuia !== null && ideGuia !== null && secuencialGuia) {
                const insertSriGuia = this.buildSriFullInsert(
                    ideSrcomGuia, '06', data.fecha_emisi_cccfa,
                    estab, ptoEmi, secuencialGuia, claveAccesoGuia!,
                    this.ideSriEstadoCreado, dtoIn,
                    totales, data, cliente, 0,
                    ideSrcomFactura, '', '', null,
                );
                await this.dataSource.formatSqlQuery(insertSriGuia);
                await queryRunner.query(insertSriGuia.query, insertSriGuia.paramValues);

                const updGuia = new UpdateQuery(TABLE_GUIA, PK_GUIA, dtoIn);
                updGuia.values.set('numero_ccgui', secuencialGuia);
                updGuia.values.set('ide_srcom', ideSrcomGuia);
                updGuia.values.delete('usuario_actua');
                updGuia.values.delete('fecha_actua');
                updGuia.values.delete('hora_actua');
                updGuia.where = `${PK_GUIA} = $1`;
                updGuia.addIntParam(1, ideGuia);
                await this.dataSource.formatSqlQuery(updGuia);
                await queryRunner.query(updGuia.query, updGuia.paramValues);
            }

            // 4-G. UPDATE cxc_datos_fac (sincronizar num_actual_ccdfa)
            const updatePto = new UpdateQuery('cxc_datos_fac', 'ide_ccdaf', dtoIn);
            updatePto.values.set('num_actual_ccdfa', Number(secuencialFactura));
            updatePto.values.delete('usuario_actua');
            updatePto.values.delete('fecha_actua');
            updatePto.values.delete('hora_actua');
            updatePto.where = `ide_ccdaf = ${data.ide_ccdaf}`;
            await this.dataSource.formatSqlQuery(updatePto);
            await queryRunner.query(updatePto.query, updatePto.paramValues);

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
            updSri.values.set('subtotal0_srcom', totales.base_tarifa0);
            updSri.values.set('base_grabada_srcom', totales.base_grabada);
            updSri.values.set('iva_srcom', totales.valor_iva);
            updSri.values.set('total_srcom', totales.total);
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
        if (isDefined(data.ide_cndfp1)) q.values.set('ide_cndfp', data.ide_cndfp1);
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
        if (isDefined(data.ide_cndfp1)) q.values.set('ide_cndfp', data.ide_cndfp1);
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
                   g.ide_geprov, g.ide_cndfp,
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
        q.values.set('forma_cobro_srcom', data.ide_cndfp1 ? String(data.ide_cndfp1) : '01');
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
