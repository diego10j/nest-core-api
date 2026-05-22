import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { getCurrentDate, getCurrentTime } from 'src/util/helpers/date-util';

import { CambiarEstadoDto } from './dto/cambiar-estado.dto';
import { SaveCostoImportDto } from './dto/save-costo-import.dto';
import { SaveDistribucionCostoDto } from './dto/save-distribucion-costo.dto';
import { SaveDocumentoDto } from './dto/save-documento.dto';
import { SaveEnvioDto } from './dto/save-envio.dto';
import { SaveGestionAduanaDto } from './dto/save-gestion-aduana.dto';
import { SaveImportacionDto } from './dto/save-importacion.dto';
import { SaveLiquidacionAduanaDto } from './dto/save-liquidacion-aduana.dto';
import { SetActivoDto } from './dto/set-activo.dto';

@Injectable()
export class ImportacionesSaveService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        this.core
            .getVariables(['p_imp_estado_orden_pendiente'])
            .then((result) => {
                this.variables = result;
            });
    }

    // ========================================================================
    // IMPORTACIÓN — Cabecera + Detalles
    // ========================================================================

    async saveImportacion(dtoIn: SaveImportacionDto & HeaderParamsDto) {
        const { data, detalles } = dtoIn;

        const isUpdate = !!data.ide_imcaim;
        const ide_imcaim = isUpdate
            ? data.ide_imcaim
            : await this.dataSource.getSeqTable('imp_cab_importa', 'ide_imcaim', 1, dtoIn.login);

        // Generar número automático si es INSERT
        let numero = '';
        if (!isUpdate) {
            const seqQuery = new SelectQuery(`
                SELECT COALESCE(MAX(CAST(SUBSTRING(numero_imcaim FROM 12) AS INTEGER)), 0) + 1 AS seq
                FROM imp_cab_importa
                WHERE numero_imcaim LIKE 'IMP-' || TO_CHAR(NOW(), 'YYYYMM') || '%'
                  AND ide_empr = $1
            `);
            seqQuery.addIntParam(1, dtoIn.ideEmpr);
            const seq = await this.dataSource.createSingleQuery(seqQuery);
            const nro = String(seq?.seq ?? 1).padStart(4, '0');
            numero = `IMP-${getCurrentDate().replace(/-/g, '').substring(0, 6)}${nro}`;
        }

        const obj = {
            ide_imcaim,
            ide_geper: data.ide_geper,
            ide_iminco: data.ide_iminco,
            ide_imesor: data.ide_imesor,
            ide_gepais: data.ide_gepais ?? null,
            ide_empr: dtoIn.ideEmpr,
            ide_sucu: dtoIn.ideSucu,
            ...(isUpdate ? {} : { numero_imcaim: numero }),
            fecha_imcaim: data.fecha_imcaim,
            fecha_produccion_imcaim: data.fecha_produccion_imcaim ?? null,
            fecha_factura_imcaim: data.fecha_factura_imcaim ?? null,
            num_factura_imcaim: data.num_factura_imcaim ?? null,
            total_factura_imcaim: data.total_factura_imcaim ?? null,
            peso_neto_imcaim: data.peso_neto_imcaim ?? null,
            peso_carga_imcaim: data.peso_carga_imcaim ?? null,
            volumen_carga_imcaim: data.volumen_carga_imcaim ?? null,
            observaciones_imcaim: data.observaciones_imcaim ?? null,
            activo_imcaim: true,
            usuario_ingre: dtoIn.login,
            hora_ingre: getCurrentTime(),
        };

        if (isUpdate) {
            await this.dataSource.pool.query(
                `UPDATE imp_cab_importa SET
                   ide_geper = $2, ide_iminco = $3, ide_imesor = $4, ide_gepais = $5,
                   fecha_imcaim = $6, fecha_produccion_imcaim = $7, fecha_factura_imcaim = $8,
                   num_factura_imcaim = $9, total_factura_imcaim = $10,
                   peso_neto_imcaim = $11, peso_carga_imcaim = $12, volumen_carga_imcaim = $13,
                   observaciones_imcaim = $14, usuario_actua = $15, hora_actua = NOW()
                 WHERE ide_imcaim = $1`,
                [
                    ide_imcaim, data.ide_geper, data.ide_iminco, data.ide_imesor, data.ide_gepais ?? null,
                    data.fecha_imcaim, data.fecha_produccion_imcaim ?? null, data.fecha_factura_imcaim ?? null,
                    data.num_factura_imcaim ?? null, data.total_factura_imcaim ?? null,
                    data.peso_neto_imcaim ?? null, data.peso_carga_imcaim ?? null, data.volumen_carga_imcaim ?? null,
                    data.observaciones_imcaim ?? null, dtoIn.login,
                ],
            );
        } else {
            const cols = Object.entries(obj).map(([k]) => k).join(', ');
            const vals = Object.entries(obj).map((_, i) => `$${i + 1}`).join(', ');
            await this.dataSource.pool.query(
                `INSERT INTO imp_cab_importa (${cols}) VALUES (${vals})`,
                Object.values(obj),
            );
        }

        // Guardar detalles si vienen
        if (detalles && detalles.length > 0) {
            // Eliminar detalles existentes en UPDATE
            if (isUpdate) {
                await this.dataSource.pool.query(
                    `DELETE FROM imp_det_importa WHERE ide_imcaim = $1`,
                    [ide_imcaim],
                );
            }
            for (const det of detalles) {
                const ide_imdet = await this.dataSource.getSeqTable(
                    'imp_det_importa', 'ide_imdet', 1, dtoIn.login,
                );
                await this.dataSource.pool.query(
                    `INSERT INTO imp_det_importa (
                        ide_imdet, ide_imcaim, ide_inarti, ide_inuni,
                        cantidad_imdet, precio_unitario_imdet,
                        descripcion_prod_imdet, num_paquetes_imdet, observaciones_imdet,
                        partida_aduana_imdet, descripcion_partida_imdet, categoria_imdet,
                        peso_neto_imdet, peso_carga_imdet, volumen_unitario_imdet,
                        impuesto_ad_valorem_imdet, regulacion_ecuatoriana_imdet,
                        usuario_ingre, hora_ingre
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW())`,
                    [
                        ide_imdet, ide_imcaim, det.ide_inarti, det.ide_inuni ?? null,
                        det.cantidad_imdet, det.precio_unitario_imdet,
                        det.descripcion_prod_imdet ?? null, det.num_paquetes_imdet ?? null,
                        det.observaciones_imdet ?? null,
                        det.partida_aduana_imdet, det.descripcion_partida_imdet,
                        det.categoria_imdet ?? null,
                        det.peso_neto_imdet ?? null, det.peso_carga_imdet ?? null,
                        det.volumen_unitario_imdet ?? null,
                        det.impuesto_ad_valorem_imdet ?? null,
                        det.regulacion_ecuatoriana_imdet ?? null,
                        dtoIn.login,
                    ],
                );
            }
        }

        return { message: 'ok', ide_imcaim, numero };
    }

    // ========================================================================
    // ENVÍO
    // ========================================================================
    async saveEnvio(dtoIn: SaveEnvioDto & HeaderParamsDto) {
        const isUpdate = !!dtoIn.ide_imenv;

        if (isUpdate) {
            await this.dataSource.pool.query(
                `UPDATE imp_envio SET
                   ide_imev = $2, ide_itt = $3, naviera_aerolinea_imenv = $4,
                   fecha_embarque_imenv = $5, fecha_estimada_llegada_imenv = $6,
                   fecha_real_llegada_imenv = $7, puerto_embarque_imenv = $8,
                   puerto_destino_imenv = $9, agente_carga_imenv = $10,
                   usuario_actua = $11, hora_actua = NOW()
                 WHERE ide_imenv = $1`,
                [
                    dtoIn.ide_imenv, dtoIn.ide_imev, dtoIn.ide_itt,
                    dtoIn.naviera_aerolinea_imenv ?? null,
                    dtoIn.fecha_embarque_imenv ?? null, dtoIn.fecha_estimada_llegada_imenv ?? null,
                    dtoIn.fecha_real_llegada_imenv ?? null, dtoIn.puerto_embarque_imenv ?? null,
                    dtoIn.puerto_destino_imenv, dtoIn.agente_carga_imenv ?? null, dtoIn.login,
                ],
            );
            return { message: 'ok', ide_imenv: dtoIn.ide_imenv };
        }

        const ide_imenv = await this.dataSource.getSeqTable('imp_envio', 'ide_imenv', 1, dtoIn.login);
        await this.dataSource.pool.query(
            `INSERT INTO imp_envio (
                ide_imenv, ide_imcaim, ide_imev, ide_itt,
                naviera_aerolinea_imenv, fecha_embarque_imenv, fecha_estimada_llegada_imenv,
                fecha_real_llegada_imenv, puerto_embarque_imenv, puerto_destino_imenv,
                agente_carga_imenv, usuario_ingre, hora_ingre
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())`,
            [
                ide_imenv, dtoIn.ide_imcaim, dtoIn.ide_imev, dtoIn.ide_itt,
                dtoIn.naviera_aerolinea_imenv ?? null, dtoIn.fecha_embarque_imenv ?? null,
                dtoIn.fecha_estimada_llegada_imenv ?? null, dtoIn.fecha_real_llegada_imenv ?? null,
                dtoIn.puerto_embarque_imenv ?? null, dtoIn.puerto_destino_imenv,
                dtoIn.agente_carga_imenv ?? null, dtoIn.login,
            ],
        );
        return { message: 'ok', ide_imenv };
    }

    // ========================================================================
    // GESTIÓN ADUANA
    // ========================================================================
    async saveGestionAduana(dtoIn: SaveGestionAduanaDto & HeaderParamsDto) {
        // Propagar ide_empr desde la cabecera
        const cab = await this.dataSource.createSingleQuery(
            new SelectQuery(`SELECT ide_empr FROM imp_cab_importa WHERE ide_imcaim = $1`).addIntParam(1, dtoIn.ide_imcaim),
        );

        const isUpdate = !!dtoIn.ide_imga;
        if (isUpdate) {
            await this.dataSource.pool.query(
                `UPDATE imp_gestion_aduana SET
                   ide_imtaf = $2, ide_geper = $3, numero_dau_imga = $4,
                   fecha_presentacion_imga = $5, fecha_liquidacion_imga = $6,
                   fecha_liberacion_imga = $7, observaciones_imga = $8,
                   usuario_actua = $9, hora_actua = NOW()
                 WHERE ide_imga = $1`,
                [
                    dtoIn.ide_imga, dtoIn.ide_imtaf, dtoIn.ide_geper,
                    dtoIn.numero_dau_imga ?? null, dtoIn.fecha_presentacion_imga ?? null,
                    dtoIn.fecha_liquidacion_imga ?? null, dtoIn.fecha_liberacion_imga ?? null,
                    dtoIn.observaciones_imga ?? null, dtoIn.login,
                ],
            );
            return { message: 'ok', ide_imga: dtoIn.ide_imga };
        }

        const ide_imga = await this.dataSource.getSeqTable('imp_gestion_aduana', 'ide_imga', 1, dtoIn.login);
        await this.dataSource.pool.query(
            `INSERT INTO imp_gestion_aduana (
                ide_imga, ide_imcaim, ide_imtaf, ide_geper, ide_empr,
                numero_dau_imga, fecha_presentacion_imga, fecha_liquidacion_imga,
                fecha_liberacion_imga, observaciones_imga, usuario_ingre, hora_ingre
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
            [
                ide_imga, dtoIn.ide_imcaim, dtoIn.ide_imtaf, dtoIn.ide_geper,
                cab?.ide_empr ?? dtoIn.ideEmpr,
                dtoIn.numero_dau_imga ?? null, dtoIn.fecha_presentacion_imga ?? null,
                dtoIn.fecha_liquidacion_imga ?? null, dtoIn.fecha_liberacion_imga ?? null,
                dtoIn.observaciones_imga ?? null, dtoIn.login,
            ],
        );
        return { message: 'ok', ide_imga };
    }

    // ========================================================================
    // LIQUIDACIÓN ADUANA
    // ========================================================================
    async saveLiquidacionAduana(dtoIn: SaveLiquidacionAduanaDto & HeaderParamsDto) {
        const isUpdate = !!dtoIn.ide_imliq;
        if (isUpdate) {
            await this.dataSource.pool.query(
                `UPDATE imp_liquidacion_aduana SET
                   base_imponible_liq_imliq = $2, arancel_advalorem_liq_imliq = $3,
                   iva_liquidacion_imliq = $4, ice_liquidacion_imliq = $5,
                   fodinfa_liquidacion_imliq = $6, fecha_liquidacion_imliq = $7,
                   numero_liquidacion_imliq = $8, observaciones_liquidacion_imliq = $9,
                   usuario_actua = $10, hora_actua = NOW()
                 WHERE ide_imliq = $1`,
                [
                    dtoIn.ide_imliq,
                    dtoIn.base_imponible_liq_imliq ?? null, dtoIn.arancel_advalorem_liq_imliq ?? null,
                    dtoIn.iva_liquidacion_imliq ?? null, dtoIn.ice_liquidacion_imliq ?? 0,
                    dtoIn.fodinfa_liquidacion_imliq ?? 0, dtoIn.fecha_liquidacion_imliq ?? null,
                    dtoIn.numero_liquidacion_imliq, dtoIn.observaciones_liquidacion_imliq ?? null,
                    dtoIn.login,
                ],
            );
            return { message: 'ok', ide_imliq: dtoIn.ide_imliq };
        }

        const ide_imliq = await this.dataSource.getSeqTable('imp_liquidacion_aduana', 'ide_imliq', 1, dtoIn.login);
        await this.dataSource.pool.query(
            `INSERT INTO imp_liquidacion_aduana (
                ide_imliq, ide_imga, base_imponible_liq_imliq, arancel_advalorem_liq_imliq,
                iva_liquidacion_imliq, ice_liquidacion_imliq, fodinfa_liquidacion_imliq,
                fecha_liquidacion_imliq, numero_liquidacion_imliq,
                observaciones_liquidacion_imliq, usuario_ingre, hora_ingre
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
            [
                ide_imliq, dtoIn.ide_imga,
                dtoIn.base_imponible_liq_imliq ?? null, dtoIn.arancel_advalorem_liq_imliq ?? null,
                dtoIn.iva_liquidacion_imliq ?? null, dtoIn.ice_liquidacion_imliq ?? 0,
                dtoIn.fodinfa_liquidacion_imliq ?? 0, dtoIn.fecha_liquidacion_imliq ?? null,
                dtoIn.numero_liquidacion_imliq, dtoIn.observaciones_liquidacion_imliq ?? null,
                dtoIn.login,
            ],
        );
        return { message: 'ok', ide_imliq };
    }

    // ========================================================================
    // COSTO
    // ========================================================================
    async saveCosto(dtoIn: SaveCostoImportDto & HeaderParamsDto) {
        const isUpdate = !!dtoIn.ide_imcoim;
        if (isUpdate) {
            await this.dataSource.pool.query(
                `UPDATE imp_costos_import SET
                   ide_imtco = $2, ide_mone = $3, ide_cpcfa = $4, fecha_imcoim = $5,
                   monto_imcoim = $6, observaciones_imcoim = $7, referencia_imcoim = $8,
                   usuario_actua = $9, hora_actua = NOW()
                 WHERE ide_imcoim = $1`,
                [
                    dtoIn.ide_imcoim, dtoIn.ide_imtco, dtoIn.ide_mone ?? null,
                    dtoIn.ide_cpcfa ?? null, dtoIn.fecha_imcoim ?? null,
                    dtoIn.monto_imcoim, dtoIn.observaciones_imcoim ?? null,
                    dtoIn.referencia_imcoim ?? null, dtoIn.login,
                ],
            );
            return { message: 'ok', ide_imcoim: dtoIn.ide_imcoim };
        }

        const ide_imcoim = await this.dataSource.getSeqTable('imp_costos_import', 'ide_imcoim', 1, dtoIn.login);
        await this.dataSource.pool.query(
            `INSERT INTO imp_costos_import (
                ide_imcoim, ide_imcaim, ide_imtco, ide_mone, ide_cpcfa,
                fecha_imcoim, monto_imcoim, observaciones_imcoim,
                referencia_imcoim, activo_imcoim, usuario_ingre, hora_ingre
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,NOW())`,
            [
                ide_imcoim, dtoIn.ide_imcaim, dtoIn.ide_imtco, dtoIn.ide_mone ?? null,
                dtoIn.ide_cpcfa ?? null, dtoIn.fecha_imcoim ?? null, dtoIn.monto_imcoim,
                dtoIn.observaciones_imcoim ?? null, dtoIn.referencia_imcoim ?? null, dtoIn.login,
            ],
        );
        return { message: 'ok', ide_imcoim };
    }

    async deleteCosto(ide_imcoim: number, login: string) {
        await this.dataSource.pool.query(
            `UPDATE imp_costos_import SET activo_imcoim = false, usuario_actua = $2, hora_actua = NOW()
             WHERE ide_imcoim = $1`,
            [ide_imcoim, login],
        );
        return { message: 'ok' };
    }

    // ========================================================================
    // PAGO
    // ========================================================================
    async savePago(dtoIn: SavePagoImportDto & HeaderParamsDto) {
        const isUpdate = !!dtoIn.ide_impag;
        if (isUpdate) {
            await this.dataSource.pool.query(
                `UPDATE imp_pagos_import SET
                   ide_imcoim = $2, ide_mone = $3, ide_cpcfa = $4, ide_teclb = $5,
                   fecha_pago_impag = $6, monto_pago_impag = $7, referencia_pago_impag = $8,
                   observaciones_pago_impag = $9, path_comprobante_impag = $10,
                   es_costo_operativo_impag = $11, usuario_actua = $12, hora_actua = NOW()
                 WHERE ide_impag = $1`,
                [
                    dtoIn.ide_impag, dtoIn.ide_imcoim ?? null, dtoIn.ide_mone ?? null,
                    dtoIn.ide_cpcfa ?? null, dtoIn.ide_teclb ?? null,
                    dtoIn.fecha_pago_impag ?? null, dtoIn.monto_pago_impag,
                    dtoIn.referencia_pago_impag ?? null, dtoIn.observaciones_pago_impag ?? null,
                    dtoIn.path_comprobante_impag ?? null, dtoIn.es_costo_operativo_impag ?? false,
                    dtoIn.login,
                ],
            );
            return { message: 'ok', ide_impag: dtoIn.ide_impag };
        }

        const ide_impag = await this.dataSource.getSeqTable('imp_pagos_import', 'ide_impag', 1, dtoIn.login);
        await this.dataSource.pool.query(
            `INSERT INTO imp_pagos_import (
                ide_impag, ide_imcaim, ide_imcoim, ide_mone, ide_cpcfa, ide_teclb,
                fecha_pago_impag, monto_pago_impag, referencia_pago_impag,
                observaciones_pago_impag, path_comprobante_impag,
                es_costo_operativo_impag, activo_impag, usuario_ingre, hora_ingre
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,$13,NOW())`,
            [
                ide_impag, dtoIn.ide_imcaim, dtoIn.ide_imcoim ?? null, dtoIn.ide_mone ?? null,
                dtoIn.ide_cpcfa ?? null, dtoIn.ide_teclb ?? null,
                dtoIn.fecha_pago_impag ?? null, dtoIn.monto_pago_impag,
                dtoIn.referencia_pago_impag ?? null, dtoIn.observaciones_pago_impag ?? null,
                dtoIn.path_comprobante_impag ?? null, dtoIn.es_costo_operativo_impag ?? false,
                dtoIn.login,
            ],
        );
        return { message: 'ok', ide_impag };
    }

    async deletePago(ide_impag: number, login: string) {
        await this.dataSource.pool.query(
            `UPDATE imp_pagos_import SET activo_impag = false, usuario_actua = $2, hora_actua = NOW()
             WHERE ide_impag = $1`,
            [ide_impag, login],
        );
        return { message: 'ok' };
    }

    // ========================================================================
    // DOCUMENTO
    // ========================================================================
    async saveDocumento(dtoIn: SaveDocumentoDto & HeaderParamsDto) {
        const isUpdate = !!dtoIn.ide_imdocu;
        if (isUpdate) {
            await this.dataSource.pool.query(
                `UPDATE imp_documentos SET
                   ide_itd = $2, numero_documento_imdocu = $3, fecha_emision_imdocu = $4,
                   fecha_recepcion_imdocu = $5, archivo_ruta_imdocu = $6,
                   observaciones_imdocu = $7, usuario_actua = $8, hora_actua = NOW()
                 WHERE ide_imdocu = $1`,
                [
                    dtoIn.ide_imdocu, dtoIn.ide_itd, dtoIn.numero_documento_imdocu ?? null,
                    dtoIn.fecha_emision_imdocu ?? null, dtoIn.fecha_recepcion_imdocu ?? null,
                    dtoIn.archivo_ruta_imdocu ?? null, dtoIn.observaciones_imdocu ?? null,
                    dtoIn.login,
                ],
            );
            return { message: 'ok', ide_imdocu: dtoIn.ide_imdocu };
        }

        const ide_imdocu = await this.dataSource.getSeqTable('imp_documentos', 'ide_imdocu', 1, dtoIn.login);
        await this.dataSource.pool.query(
            `INSERT INTO imp_documentos (
                ide_imdocu, ide_imcaim, ide_itd, numero_documento_imdocu,
                fecha_emision_imdocu, fecha_recepcion_imdocu, archivo_ruta_imdocu,
                observaciones_imdocu, usuario_ingre, hora_ingre
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
            [
                ide_imdocu, dtoIn.ide_imcaim, dtoIn.ide_itd, dtoIn.numero_documento_imdocu ?? null,
                dtoIn.fecha_emision_imdocu ?? null, dtoIn.fecha_recepcion_imdocu ?? null,
                dtoIn.archivo_ruta_imdocu ?? null, dtoIn.observaciones_imdocu ?? null,
                dtoIn.login,
            ],
        );
        return { message: 'ok', ide_imdocu };
    }

    // ========================================================================
    // CAMBIAR ESTADO — con historial
    // ========================================================================
    async cambiarEstado(dtoIn: CambiarEstadoDto & HeaderParamsDto) {
        const cab = await this.dataSource.createSingleQuery(
            new SelectQuery(`SELECT ide_imesor FROM imp_cab_importa WHERE ide_imcaim = $1`).addIntParam(1, dtoIn.ide_imcaim),
        );
        if (!cab) throw new BadRequestException('Importación no encontrada');

        const estadoAnterior = cab.ide_imesor;

        await this.dataSource.pool.query(
            `UPDATE imp_cab_importa SET ide_imesor = $2, usuario_actua = $3, hora_actua = NOW()
             WHERE ide_imcaim = $1`,
            [dtoIn.ide_imcaim, dtoIn.ide_imesor_nuevo, dtoIn.login],
        );

        // Registrar en historial
        const ide_imhest = await this.dataSource.getSeqTable('imp_historial_estado', 'ide_imhest', 1, dtoIn.login);
        await this.dataSource.pool.query(
            `INSERT INTO imp_historial_estado (
                ide_imhest, ide_imcaim, ide_imesor_anterior, ide_imesor_nuevo,
                observacion_imhest, usuario_ingre, hora_ingre
            ) VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
            [ide_imhest, dtoIn.ide_imcaim, estadoAnterior, dtoIn.ide_imesor_nuevo, dtoIn.observacion ?? null, dtoIn.login],
        );

        return { message: 'ok', estado_anterior: estadoAnterior, estado_nuevo: dtoIn.ide_imesor_nuevo };
    }

    // ========================================================================
    // SOFT DELETE IMPORTACIÓN
    // ========================================================================
    async deleteImportacion(ide_imcaim: number, login: string) {
        await this.dataSource.pool.query(
            `UPDATE imp_cab_importa SET activo_imcaim = false, usuario_actua = $2, hora_actua = NOW()
             WHERE ide_imcaim = $1`,
            [ide_imcaim, login],
        );
        return { message: 'ok' };
    }

    // ========================================================================
    // DISTRIBUCIÓN DE COSTOS
    // ========================================================================
    async distribuirCostos(dtoIn: SaveDistribucionCostoDto & HeaderParamsDto) {
        // Eliminar distribuciones existentes para este costo
        await this.dataSource.pool.query(
            `DELETE FROM imp_distribucion_costo WHERE ide_imcoim = $1`,
            [dtoIn.ide_imcoim],
        );

        const totalMonto = dtoIn.items.reduce((sum, i) => sum + i.monto_imdico, 0);

        for (const item of dtoIn.items) {
            const porcentaje = totalMonto > 0 ? (item.monto_imdico / totalMonto) * 100 : 0;
            const ide_imdico = await this.dataSource.getSeqTable('imp_distribucion_costo', 'ide_imdico', 1, dtoIn.login);
            await this.dataSource.pool.query(
                `INSERT INTO imp_distribucion_costo (
                    ide_imdico, ide_imcoim, ide_imdet, metodo_dist_imdico,
                    porcentaje_imdico, monto_imdico, usuario_ingre, hora_ingre
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
                [ide_imdico, dtoIn.ide_imcoim, item.ide_imdet, dtoIn.metodo, porcentaje, item.monto_imdico, dtoIn.login],
            );
        }

        return { message: 'ok', ide_imcoim: dtoIn.ide_imcoim, items: dtoIn.items.length };
    }

    // ========================================================================
    // SET ACTIVO — toggle genérico por tabla con columna activo_*
    // ========================================================================

    async setActivoIncoterm(dtoIn: SetActivoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE imp_incoterm SET activo_iminco = $1, usuario_actua = $2, hora_actua = NOW() WHERE ide_iminco = $3`,
            [dtoIn.activo, dtoIn.login, dtoIn.ide],
        );
        return { message: 'ok' };
    }

    async setActivoEstadoOrden(dtoIn: SetActivoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE imp_estado_orden SET activo_imesor = $1, usuario_actua = $2, hora_actua = NOW() WHERE ide_imesor = $3`,
            [dtoIn.activo, dtoIn.login, dtoIn.ide],
        );
        return { message: 'ok' };
    }

    async setActivoTipoCosto(dtoIn: SetActivoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE imp_tipo_costo SET activo_imtco = $1, usuario_actua = $2, hora_actua = NOW() WHERE ide_imtco = $3`,
            [dtoIn.activo, dtoIn.login, dtoIn.ide],
        );
        return { message: 'ok' };
    }

    async setActivoTipoDocumento(dtoIn: SetActivoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE imp_tipo_documento SET activo_itd = $1, usuario_actua = $2, hora_actua = NOW() WHERE ide_itd = $3`,
            [dtoIn.activo, dtoIn.login, dtoIn.ide],
        );
        return { message: 'ok' };
    }

    async setActivoTipoTransporte(dtoIn: SetActivoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE imp_tipo_transporte SET activo_itt = $1, usuario_actua = $2, hora_actua = NOW() WHERE ide_itt = $3`,
            [dtoIn.activo, dtoIn.login, dtoIn.ide],
        );
        return { message: 'ok' };
    }

    async setActivoEstadoEnvio(dtoIn: SetActivoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE imp_estado_envio SET activo_imev = $1, usuario_actua = $2, hora_actua = NOW() WHERE ide_imev = $3`,
            [dtoIn.activo, dtoIn.login, dtoIn.ide],
        );
        return { message: 'ok' };
    }

    async setActivoTipoAforo(dtoIn: SetActivoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE imp_tipo_aforo SET activo_imtaf = $1, usuario_actua = $2, hora_actua = NOW() WHERE ide_imtaf = $3`,
            [dtoIn.activo, dtoIn.login, dtoIn.ide],
        );
        return { message: 'ok' };
    }

    async setActivoImportacion(dtoIn: SetActivoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE imp_cab_importa SET activo_imcaim = $1, usuario_actua = $2, hora_actua = NOW() WHERE ide_imcaim = $3`,
            [dtoIn.activo, dtoIn.login, dtoIn.ide],
        );
        return { message: 'ok' };
    }

    async setActivoCosto(dtoIn: SetActivoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE imp_costos_import SET activo_imcoim = $1, usuario_actua = $2, hora_actua = NOW() WHERE ide_imcoim = $3`,
            [dtoIn.activo, dtoIn.login, dtoIn.ide],
        );
        return { message: 'ok' };
    }

    async setActivoPago(dtoIn: SetActivoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE imp_pagos_import SET activo_impag = $1, usuario_actua = $2, hora_actua = NOW() WHERE ide_impag = $3`,
            [dtoIn.activo, dtoIn.login, dtoIn.ide],
        );
        return { message: 'ok' };
    }
}
