import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { getCurrentDate, getCurrentTime } from 'src/util/helpers/date-util';

import { AnularDocumentoCxPDto } from './dto/anular-documento-cxp.dto';
import { SaveDocumentoCxPDto } from './dto/save-documento-cxp.dto';

/**
 * Servicio de persistencia para documentos CxP (cxp_cabece_factur + cxp_detall_factur)
 */
@Injectable()
export class DocumentosCxPSaveService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        this.core
            .getVariables([
                'p_cxp_estado_factura_normal',
                'p_cxp_estado_factura_anulada',
                'p_cxp_tipo_trans_factura',
                'p_cxp_tipo_trans_pago',
                'p_con_estado_comprobante_anulado',
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    /**
     * Anula un documento CxP: cambia estado, anula asiento contable,
     * elimina transacciones CxP y de inventario asociadas
     */
    async anularDocumento(dtoIn: AnularDocumentoCxPDto & HeaderParamsDto) {
        const listQuery: ObjectQueryDto[] = [];

        // 1. Marcar factura como anulada
        listQuery.push({
            operation: 'update',
            module: 'cxp',
            tableName: 'cabece_factur',
            primaryKey: 'ide_cpcfa',
            object: {
                ide_cpcfa: dtoIn.ide_cpcfa,
                ide_cpefa: 1,
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

        // 3. Eliminar transacciones CxP de detalle y cabecera
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
             SET ide_inepi = 4
             WHERE ide_incci IN (
                 SELECT ide_incci FROM inv_det_comp_inve WHERE ide_cpcfa = $1 GROUP BY ide_incci
             )`,
            [dtoIn.ide_cpcfa],
        );

        return this.core.save({ ...dtoIn, listQuery, audit: false });
    }

    /**
     * Guarda un documento CxP completo (cabecera + detalles) y genera
     * la transaccion de cuentas por pagar asociada.
     */
    async saveDocumento(dtoIn: SaveDocumentoCxPDto & HeaderParamsDto) {
        const { cabecera, detalles } = dtoIn;
        if (!detalles || detalles.length === 0) {
            throw new BadRequestException('Debe ingresar al menos un detalle');
        }

        const estadoNormal = Number(this.variables.get('p_cxp_estado_factura_normal'));
        const tipoTransFactura = Number(this.variables.get('p_cxp_tipo_trans_factura'));

        // ── Calcular totales ──────────────────────────────────────────────
        let baseGrabada = 0;
        let baseTarifa0 = 0;
        let baseNoObjeto = 0;
        let valorIva = 0;
        const tarifaIva = cabecera.tarifa_iva_cpcfa ?? 0.12;

        for (const det of detalles) {
            const valor = (det.cantidad_cpdfa || 0) * (det.precio_cpdfa || 0);
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

        const descuento = cabecera.descuento_cpcfa ?? 0;
        const otros = cabecera.otros_cpcfa ?? 0;
        valorIva = (baseGrabada - descuento) * tarifaIva;
        const total = baseGrabada + baseTarifa0 + baseNoObjeto + valorIva + otros;

        // ── Guardar cabecera ──────────────────────────────────────────────
        const ide_cpcfa = cabecera.ide_cpcfa
            ? cabecera.ide_cpcfa
            : await this.dataSource.getSeqTable('cxp_cabece_factur', 'ide_cpcfa', 1, dtoIn.login);

        const objCab: ObjectQueryDto = {
            operation: cabecera.ide_cpcfa ? 'update' : 'insert',
            module: 'cxp',
            tableName: 'cabece_factur',
            primaryKey: 'ide_cpcfa',
            object: {
                ide_cpcfa,
                ide_cntdo: cabecera.ide_cntdo,
                ide_geper: cabecera.ide_geper,
                ide_cpefa: estadoNormal,
                ide_cndfp: cabecera.ide_cndfp,
                ide_cndfp1: cabecera.ide_cndfp1,
                ide_srtst: cabecera.ide_srtst ?? 6,
                ide_usua: dtoIn.ideUsua,
                numero_cpcfa: cabecera.numero_cpcfa,
                autorizacio_cpcfa: cabecera.autorizacio_cpcfa,
                fecha_emisi_cpcfa: cabecera.fecha_emisi_cpcfa,
                fecha_trans_cpcfa: getCurrentDate(),
                observacion_cpcfa: cabecera.observacion_cpcfa,
                base_grabada_cpcfa: baseGrabada,
                base_no_objeto_iva_cpcfa: baseNoObjeto,
                base_tarifa0_cpcfa: baseTarifa0,
                valor_iva_cpcfa: valorIva,
                total_cpcfa: total,
                descuento_cpcfa: descuento,
                porcen_desc_cpcfa: cabecera.porcen_desc_cpcfa ?? 0,
                otros_cpcfa: otros,
                valor_ice_cpcfa: cabecera.valor_ice_cpcfa ?? 0,
                tarifa_iva_cpcfa: tarifaIva,
                dias_credito_cpcfa: cabecera.dias_credito_cpcfa ?? 0,
                pagado_cpcfa: false,
                // Nota de credito
                ide_cntdo_nc_cpcfa: cabecera.ide_cntdo_nc_cpcfa ?? null,
                fecha_emision_nc_cpcfa: cabecera.fecha_emision_nc_cpcfa ?? null,
                numero_nc_cpcfa: cabecera.numero_nc_cpcfa ?? null,
                autorizacio_nc_cpcfa: cabecera.autorizacio_nc_cpcfa ?? null,
                motivo_nc_cpcfa: cabecera.motivo_nc_cpcfa ?? null,
                hora_ingre: getCurrentTime(),
            },
        };

        await this.core.save({ ...dtoIn, listQuery: [objCab], audit: false });

        // ── Guardar detalles (borrar existentes si es update y recrear) ───
        if (cabecera.ide_cpcfa) {
            await this.dataSource.pool.query(
                `DELETE FROM cxp_detall_factur WHERE ide_cpcfa = $1`,
                [ide_cpcfa],
            );
        }

        const detQueries: ObjectQueryDto[] = [];
        for (const det of detalles) {
            const ide_cpdfa = await this.dataSource.getSeqTable(
                'cxp_detall_factur', 'ide_cpdfa', 1, dtoIn.login,
            );
            detQueries.push({
                operation: 'insert',
                module: 'cxp',
                tableName: 'detall_factur',
                primaryKey: 'ide_cpdfa',
                object: {
                    ide_cpdfa,
                    ide_cpcfa,
                    ide_inarti: det.ide_inarti,
                    ide_inuni: det.ide_inuni ?? null,
                    cantidad_cpdfa: det.cantidad_cpdfa,
                    precio_cpdfa: det.precio_cpdfa,
                    valor_cpdfa: (det.cantidad_cpdfa || 0) * (det.precio_cpdfa || 0),
                    iva_inarti_cpdfa: det.iva_inarti_cpdfa,
                    observacion_cpdfa: det.observacion_cpdfa ?? null,
                    secuencial_cpdfa: det.secuencial_cpdfa ?? null,
                    alter_tribu_cpdfa: det.alter_tribu_cpdfa ?? '00',
                    devolucion_cpdfa: false,
                    credit_tribu_cpdfa: null,
                    hora_ingre: getCurrentTime(),
                },
            });
        }

        if (detQueries.length > 0) {
            await this.core.save({ ...dtoIn, listQuery: detQueries, audit: false });
        }

        // ── Generar transaccion compra (cxp_cabece_transa + cxp_detall_transa) ──
        await this.generarTransaccionCompra(ide_cpcfa, cabecera.ide_geper, total, dtoIn);

        return {
            message: 'ok',
            ide_cpcfa,
            totals: { baseGrabada, baseTarifa0, baseNoObjeto, valorIva, total },
        };
    }

    /**
     * Genera la transaccion de cuentas por pagar para un documento
     * (cxp_cabece_transa + cxp_detall_transa) — equivalente a generarTransaccionCompra
     */
    private async generarTransaccionCompra(
        ide_cpcfa: number,
        ide_geper: number,
        valor: number,
        dtoIn: HeaderParamsDto,
    ) {
        const tipoTransFactura = Number(this.variables.get('p_cxp_tipo_trans_factura'));

        // Buscar o crear cabecera de transaccion
        const existQuery = new SelectQuery(`
            SELECT ide_cpctr FROM cxp_cabece_transa
            WHERE ide_cpcfa = $1
            LIMIT 1
        `);
        existQuery.addIntParam(1, ide_cpcfa);
        const existente = await this.dataSource.createSingleQuery(existQuery);

        let ide_cpctr: number;
        if (existente) {
            ide_cpctr = existente.ide_cpctr;
            // Eliminar detalle existente y recrear
            await this.dataSource.pool.query(
                `DELETE FROM cxp_detall_transa WHERE ide_cpctr = $1 AND ide_cpttr = $2`,
                [ide_cpctr, tipoTransFactura],
            );
        } else {
            ide_cpctr = await this.dataSource.getSeqTable(
                'cxp_cabece_transa', 'ide_cpctr', 1, dtoIn.login,
            );
            const cabObj: ObjectQueryDto = {
                operation: 'insert',
                module: 'cxp',
                tableName: 'cabece_transa',
                primaryKey: 'ide_cpctr',
                object: {
                    ide_cpctr,
                    ide_cpcfa,
                    ide_geper,
                    fecha_trans_cpctr: getCurrentDate(),
                    hora_ingre: getCurrentTime(),
                },
            };
            await this.core.save({ ...dtoIn, listQuery: [cabObj], audit: false });
        }

        // Crear detalle de transaccion (la factura genera un saldo por pagar)
        const ide_cpdtr = await this.dataSource.getSeqTable(
            'cxp_detall_transa', 'ide_cpdtr', 1, dtoIn.login,
        );
        const detObj: ObjectQueryDto = {
            operation: 'insert',
            module: 'cxp',
            tableName: 'detall_transa',
            primaryKey: 'ide_cpdtr',
            object: {
                ide_cpdtr,
                ide_cpctr,
                ide_cpcfa,
                ide_cpttr: tipoTransFactura,
                ide_usua: dtoIn.ideUsua,
                fecha_trans_cpdtr: getCurrentDate(),
                fecha_venci_cpdtr: getCurrentDate(),
                valor_cpdtr: valor,
                observacion_cpdtr: '',
                hora_ingre: getCurrentTime(),
            },
        };
        await this.core.save({ ...dtoIn, listQuery: [detObj], audit: false });
    }
}
