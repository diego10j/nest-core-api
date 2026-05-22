import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { CambiarEstadoDto } from './dto/cambiar-estado.dto';
import { SaveCostoImportDto } from './dto/save-costo-import.dto';
import { SaveDistribucionCostoDto } from './dto/save-distribucion-costo.dto';
import { SaveDocumentoDto } from './dto/save-documento.dto';
import { SaveEnvioDto } from './dto/save-envio.dto';
import { SaveGestionAduanaDto } from './dto/save-gestion-aduana.dto';
import { SaveImportacionDto } from './dto/save-importacion.dto';
import { SaveLiquidacionAduanaDto } from './dto/save-liquidacion-aduana.dto';
import { SavePagoImportDto } from './dto/save-pago-import.dto';
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
            .then((result) => { this.variables = result; });
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

        const obj: Record<string, any> = {
            ide_imcaim,
            ide_geper: data.ide_geper,
            ide_iminco: data.ide_iminco,
            ide_imesor: data.ide_imesor,
            ide_gepais: data.ide_gepais ?? null,
            ide_empr: dtoIn.ideEmpr,
            ide_sucu: dtoIn.ideSucu,
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
        };

        if (!isUpdate) {
            const now = new Date();
            const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
            obj.numero_imcaim = `IMP-${yyyymm}${String(ide_imcaim).padStart(5, '0')}`;
        }

        if (isUpdate) {
            const colsUpd = Object.entries(obj)
                .filter(([k]) => k !== 'ide_imcaim' && k !== 'ide_empr' && k !== 'ide_sucu' && k !== 'ide_geper')
                .filter(([k]) => !(k === 'numero_imcaim'));
            const setClauses = colsUpd.map(([k], i) => `${k} = $${i + 2}`).join(', ');
            const params = [ide_imcaim, ...colsUpd.map(([, v]) => v)];
            await this.dataSource.pool.query(
                `UPDATE imp_cab_importa SET ${setClauses} WHERE ide_imcaim = $1`,
                params,
            );
        } else {
            const cols = Object.keys(obj);
            const vals = cols.map((_, i) => `$${i + 1}`).join(', ');
            await this.dataSource.pool.query(
                `INSERT INTO imp_cab_importa (${cols.join(', ')}) VALUES (${vals})`,
                Object.values(obj),
            );
        }

        if (detalles && detalles.length > 0) {
            if (isUpdate) {
                await this.dataSource.pool.query(
                    `DELETE FROM imp_det_importa WHERE ide_imcaim = $1`, [ide_imcaim],
                );
            }
            for (const det of detalles) {
                const ide_imdet = await this.dataSource.getSeqTable('imp_det_importa', 'ide_imdet', 1, dtoIn.login);
                await this.dataSource.pool.query(
                    `INSERT INTO imp_det_importa (
                        ide_imdet, ide_imcaim, ide_inarti, ide_inuni,
                        cantidad_imdet, precio_unitario_imdet,
                        descripcion_prod_imdet, num_paquetes_imdet, observaciones_imdet,
                        partida_aduana_imdet, descripcion_partida_imdet, categoria_imdet,
                        peso_neto_imdet, peso_carga_imdet, volumen_unitario_imdet,
                        impuesto_ad_valorem_imdet, regulacion_ecuatoriana_imdet
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
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
                    ],
                );
            }
        }

        return { message: 'ok', ide_imcaim, numero: isUpdate ? undefined : obj.numero_imcaim };
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
                   puerto_destino_imenv = $9, agente_carga_imenv = $10
                 WHERE ide_imenv = $1`,
                [
                    dtoIn.ide_imenv, dtoIn.ide_imev, dtoIn.ide_itt,
                    dtoIn.naviera_aerolinea_imenv ?? null,
                    dtoIn.fecha_embarque_imenv ?? null, dtoIn.fecha_estimada_llegada_imenv ?? null,
                    dtoIn.fecha_real_llegada_imenv ?? null, dtoIn.puerto_embarque_imenv ?? null,
                    dtoIn.puerto_destino_imenv, dtoIn.agente_carga_imenv ?? null,
                ],
            );
            return { message: 'ok', ide_imenv: dtoIn.ide_imenv };
        }
        const ide_imenv = await this.dataSource.getSeqTable('imp_envio', 'ide_imenv', 1, dtoIn.login);
        await this.dataSource.pool.query(
            `INSERT INTO imp_envio (
                ide_imenv, ide_imcaim, ide_imev, ide_itt,
                naviera_aerolinea_imenv, fecha_embarque_imenv, fecha_estimada_llegada_imenv,
                fecha_real_llegada_imenv, puerto_embarque_imenv, puerto_destino_imenv, agente_carga_imenv
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
                ide_imenv, dtoIn.ide_imcaim, dtoIn.ide_imev, dtoIn.ide_itt,
                dtoIn.naviera_aerolinea_imenv ?? null, dtoIn.fecha_embarque_imenv ?? null,
                dtoIn.fecha_estimada_llegada_imenv ?? null, dtoIn.fecha_real_llegada_imenv ?? null,
                dtoIn.puerto_embarque_imenv ?? null, dtoIn.puerto_destino_imenv,
                dtoIn.agente_carga_imenv ?? null,
            ],
        );
        return { message: 'ok', ide_imenv };
    }

    // ========================================================================
    // GESTIÓN ADUANA
    // ========================================================================
    async saveGestionAduana(dtoIn: SaveGestionAduanaDto & HeaderParamsDto) {
        const queryCab = new SelectQuery(`SELECT ide_empr FROM imp_cab_importa WHERE ide_imcaim = $1`);
        queryCab.addIntParam(1, dtoIn.ide_imcaim);
        const cab = await this.dataSource.createSingleQuery(queryCab);
        const isUpdate = !!dtoIn.ide_imga;
        if (isUpdate) {
            await this.dataSource.pool.query(
                `UPDATE imp_gestion_aduana SET
                   ide_imtaf = $2, ide_geper = $3, numero_dau_imga = $4,
                   fecha_presentacion_imga = $5, fecha_liquidacion_imga = $6,
                   fecha_liberacion_imga = $7, observaciones_imga = $8
                 WHERE ide_imga = $1`,
                [
                    dtoIn.ide_imga, dtoIn.ide_imtaf, dtoIn.ide_geper,
                    dtoIn.numero_dau_imga ?? null, dtoIn.fecha_presentacion_imga ?? null,
                    dtoIn.fecha_liquidacion_imga ?? null, dtoIn.fecha_liberacion_imga ?? null,
                    dtoIn.observaciones_imga ?? null,
                ],
            );
            return { message: 'ok', ide_imga: dtoIn.ide_imga };
        }
        const ide_imga = await this.dataSource.getSeqTable('imp_gestion_aduana', 'ide_imga', 1, dtoIn.login);
        await this.dataSource.pool.query(
            `INSERT INTO imp_gestion_aduana (
                ide_imga, ide_imcaim, ide_imtaf, ide_geper, ide_empr,
                numero_dau_imga, fecha_presentacion_imga, fecha_liquidacion_imga,
                fecha_liberacion_imga, observaciones_imga
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
                ide_imga, dtoIn.ide_imcaim, dtoIn.ide_imtaf, dtoIn.ide_geper,
                cab?.ide_empr ?? dtoIn.ideEmpr,
                dtoIn.numero_dau_imga ?? null, dtoIn.fecha_presentacion_imga ?? null,
                dtoIn.fecha_liquidacion_imga ?? null, dtoIn.fecha_liberacion_imga ?? null,
                dtoIn.observaciones_imga ?? null,
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
                   numero_liquidacion_imliq = $8, observaciones_liquidacion_imliq = $9
                 WHERE ide_imliq = $1`,
                [
                    dtoIn.ide_imliq,
                    dtoIn.base_imponible_liq_imliq ?? null, dtoIn.arancel_advalorem_liq_imliq ?? null,
                    dtoIn.iva_liquidacion_imliq ?? null, dtoIn.ice_liquidacion_imliq ?? 0,
                    dtoIn.fodinfa_liquidacion_imliq ?? 0, dtoIn.fecha_liquidacion_imliq ?? null,
                    dtoIn.numero_liquidacion_imliq, dtoIn.observaciones_liquidacion_imliq ?? null,
                ],
            );
            return { message: 'ok', ide_imliq: dtoIn.ide_imliq };
        }
        const ide_imliq = await this.dataSource.getSeqTable('imp_liquidacion_aduana', 'ide_imliq', 1, dtoIn.login);
        await this.dataSource.pool.query(
            `INSERT INTO imp_liquidacion_aduana (
                ide_imliq, ide_imga, base_imponible_liq_imliq, arancel_advalorem_liq_imliq,
                iva_liquidacion_imliq, ice_liquidacion_imliq, fodinfa_liquidacion_imliq,
                fecha_liquidacion_imliq, numero_liquidacion_imliq, observaciones_liquidacion_imliq
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
                ide_imliq, dtoIn.ide_imga,
                dtoIn.base_imponible_liq_imliq ?? null, dtoIn.arancel_advalorem_liq_imliq ?? null,
                dtoIn.iva_liquidacion_imliq ?? null, dtoIn.ice_liquidacion_imliq ?? 0,
                dtoIn.fodinfa_liquidacion_imliq ?? 0, dtoIn.fecha_liquidacion_imliq ?? null,
                dtoIn.numero_liquidacion_imliq, dtoIn.observaciones_liquidacion_imliq ?? null,
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
                   monto_imcoim = $6, observaciones_imcoim = $7, referencia_imcoim = $8
                 WHERE ide_imcoim = $1`,
                [
                    dtoIn.ide_imcoim, dtoIn.ide_imtco, dtoIn.ide_mone ?? null,
                    dtoIn.ide_cpcfa ?? null, dtoIn.fecha_imcoim ?? null,
                    dtoIn.monto_imcoim, dtoIn.observaciones_imcoim ?? null,
                    dtoIn.referencia_imcoim ?? null,
                ],
            );
            return { message: 'ok', ide_imcoim: dtoIn.ide_imcoim };
        }
        const ide_imcoim = await this.dataSource.getSeqTable('imp_costos_import', 'ide_imcoim', 1, dtoIn.login);
        await this.dataSource.pool.query(
            `INSERT INTO imp_costos_import (
                ide_imcoim, ide_imcaim, ide_imtco, ide_mone, ide_cpcfa,
                fecha_imcoim, monto_imcoim, observaciones_imcoim,
                referencia_imcoim, activo_imcoim
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)`,
            [
                ide_imcoim, dtoIn.ide_imcaim, dtoIn.ide_imtco, dtoIn.ide_mone ?? null,
                dtoIn.ide_cpcfa ?? null, dtoIn.fecha_imcoim ?? null, dtoIn.monto_imcoim,
                dtoIn.observaciones_imcoim ?? null, dtoIn.referencia_imcoim ?? null,
            ],
        );
        return { message: 'ok', ide_imcoim };
    }

    async deleteCosto(ide_imcoim: number) {
        await this.dataSource.pool.query(
            `UPDATE imp_costos_import SET activo_imcoim = false WHERE ide_imcoim = $1`,
            [ide_imcoim],
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
                   es_costo_operativo_impag = $11
                 WHERE ide_impag = $1`,
                [
                    dtoIn.ide_impag, dtoIn.ide_imcoim ?? null, dtoIn.ide_mone ?? null,
                    dtoIn.ide_cpcfa ?? null, dtoIn.ide_teclb ?? null,
                    dtoIn.fecha_pago_impag ?? null, dtoIn.monto_pago_impag,
                    dtoIn.referencia_pago_impag ?? null, dtoIn.observaciones_pago_impag ?? null,
                    dtoIn.path_comprobante_impag ?? null, dtoIn.es_costo_operativo_impag ?? false,
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
                es_costo_operativo_impag, activo_impag
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true)`,
            [
                ide_impag, dtoIn.ide_imcaim, dtoIn.ide_imcoim ?? null, dtoIn.ide_mone ?? null,
                dtoIn.ide_cpcfa ?? null, dtoIn.ide_teclb ?? null,
                dtoIn.fecha_pago_impag ?? null, dtoIn.monto_pago_impag,
                dtoIn.referencia_pago_impag ?? null, dtoIn.observaciones_pago_impag ?? null,
                dtoIn.path_comprobante_impag ?? null, dtoIn.es_costo_operativo_impag ?? false,
            ],
        );
        return { message: 'ok', ide_impag };
    }

    async deletePago(ide_impag: number) {
        await this.dataSource.pool.query(
            `UPDATE imp_pagos_import SET activo_impag = false WHERE ide_impag = $1`,
            [ide_impag],
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
                   fecha_recepcion_imdocu = $5, archivo_ruta_imdocu = $6, observaciones_imdocu = $7
                 WHERE ide_imdocu = $1`,
                [
                    dtoIn.ide_imdocu, dtoIn.ide_itd, dtoIn.numero_documento_imdocu ?? null,
                    dtoIn.fecha_emision_imdocu ?? null, dtoIn.fecha_recepcion_imdocu ?? null,
                    dtoIn.archivo_ruta_imdocu ?? null, dtoIn.observaciones_imdocu ?? null,
                ],
            );
            return { message: 'ok', ide_imdocu: dtoIn.ide_imdocu };
        }
        const ide_imdocu = await this.dataSource.getSeqTable('imp_documentos', 'ide_imdocu', 1, dtoIn.login);
        await this.dataSource.pool.query(
            `INSERT INTO imp_documentos (
                ide_imdocu, ide_imcaim, ide_itd, numero_documento_imdocu,
                fecha_emision_imdocu, fecha_recepcion_imdocu, archivo_ruta_imdocu, observaciones_imdocu
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
                ide_imdocu, dtoIn.ide_imcaim, dtoIn.ide_itd, dtoIn.numero_documento_imdocu ?? null,
                dtoIn.fecha_emision_imdocu ?? null, dtoIn.fecha_recepcion_imdocu ?? null,
                dtoIn.archivo_ruta_imdocu ?? null, dtoIn.observaciones_imdocu ?? null,
            ],
        );
        return { message: 'ok', ide_imdocu };
    }

    // ========================================================================
    // CAMBIAR ESTADO — con historial
    // ========================================================================
    async cambiarEstado(dtoIn: CambiarEstadoDto & HeaderParamsDto) {
        const queryCab = new SelectQuery(`SELECT ide_imesor FROM imp_cab_importa WHERE ide_imcaim = $1`);
        queryCab.addIntParam(1, dtoIn.ide_imcaim);
        const cab = await this.dataSource.createSingleQuery(queryCab);
        if (!cab) throw new BadRequestException('Importación no encontrada');
        const estadoAnterior = cab.ide_imesor;
        await this.dataSource.pool.query(
            `UPDATE imp_cab_importa SET ide_imesor = $2 WHERE ide_imcaim = $1`,
            [dtoIn.ide_imcaim, dtoIn.ide_imesor_nuevo],
        );
        const ide_imhest = await this.dataSource.getSeqTable('imp_historial_estado', 'ide_imhest', 1, dtoIn.login);
        await this.dataSource.pool.query(
            `INSERT INTO imp_historial_estado (
                ide_imhest, ide_imcaim, ide_imesor_anterior, ide_imesor_nuevo, observacion_imhest
            ) VALUES ($1,$2,$3,$4,$5)`,
            [ide_imhest, dtoIn.ide_imcaim, estadoAnterior, dtoIn.ide_imesor_nuevo, dtoIn.observacion ?? null],
        );
        return { message: 'ok', estado_anterior: estadoAnterior, estado_nuevo: dtoIn.ide_imesor_nuevo };
    }

    // ========================================================================
    // SOFT DELETE IMPORTACIÓN
    // ========================================================================
    async deleteImportacion(ide_imcaim: number) {
        await this.dataSource.pool.query(
            `UPDATE imp_cab_importa SET activo_imcaim = false WHERE ide_imcaim = $1`,
            [ide_imcaim],
        );
        return { message: 'ok' };
    }

    // ========================================================================
    // DISTRIBUCIÓN DE COSTOS
    // ========================================================================
    async distribuirCostos(dtoIn: SaveDistribucionCostoDto & HeaderParamsDto) {
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
                    porcentaje_imdico, monto_imdico
                ) VALUES ($1,$2,$3,$4,$5,$6)`,
                [ide_imdico, dtoIn.ide_imcoim, item.ide_imdet, dtoIn.metodo, porcentaje, item.monto_imdico],
            );
        }
        return { message: 'ok', ide_imcoim: dtoIn.ide_imcoim, items: dtoIn.items.length };
    }

    // ========================================================================
    // SET ACTIVO — toggle genérico por tabla con columna activo_*
    // ========================================================================

    async setActivoIncoterm(dtoIn: SetActivoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE imp_incoterm SET activo_iminco = $1 WHERE ide_iminco = $2`,
            [dtoIn.activo, dtoIn.ide],
        ); return { message: 'ok' };
    }
    async setActivoEstadoOrden(dtoIn: SetActivoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE imp_estado_orden SET activo_imesor = $1 WHERE ide_imesor = $2`,
            [dtoIn.activo, dtoIn.ide],
        ); return { message: 'ok' };
    }
    async setActivoTipoCosto(dtoIn: SetActivoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE imp_tipo_costo SET activo_imtco = $1 WHERE ide_imtco = $2`,
            [dtoIn.activo, dtoIn.ide],
        ); return { message: 'ok' };
    }
    async setActivoTipoDocumento(dtoIn: SetActivoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE imp_tipo_documento SET activo_itd = $1 WHERE ide_itd = $2`,
            [dtoIn.activo, dtoIn.ide],
        ); return { message: 'ok' };
    }
    async setActivoTipoTransporte(dtoIn: SetActivoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE imp_tipo_transporte SET activo_itt = $1 WHERE ide_itt = $2`,
            [dtoIn.activo, dtoIn.ide],
        ); return { message: 'ok' };
    }
    async setActivoEstadoEnvio(dtoIn: SetActivoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE imp_estado_envio SET activo_imev = $1 WHERE ide_imev = $2`,
            [dtoIn.activo, dtoIn.ide],
        ); return { message: 'ok' };
    }
    async setActivoTipoAforo(dtoIn: SetActivoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE imp_tipo_aforo SET activo_imtaf = $1 WHERE ide_imtaf = $2`,
            [dtoIn.activo, dtoIn.ide],
        ); return { message: 'ok' };
    }
    async setActivoImportacion(dtoIn: SetActivoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE imp_cab_importa SET activo_imcaim = $1 WHERE ide_imcaim = $2`,
            [dtoIn.activo, dtoIn.ide],
        ); return { message: 'ok' };
    }
    async setActivoCosto(dtoIn: SetActivoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE imp_costos_import SET activo_imcoim = $1 WHERE ide_imcoim = $2`,
            [dtoIn.activo, dtoIn.ide],
        ); return { message: 'ok' };
    }
    async setActivoPago(dtoIn: SetActivoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE imp_pagos_import SET activo_impag = $1 WHERE ide_impag = $2`,
            [dtoIn.activo, dtoIn.ide],
        ); return { message: 'ok' };
    }
}
