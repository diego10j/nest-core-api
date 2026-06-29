import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { DocumentosCxPSaveService } from '../cuentas-por-pagar/documentos-cxp-save.service';
import { SaveDocumentoCxPDto } from '../cuentas-por-pagar/dto/save-documento-cxp.dto';

import { AsociarDocumentoCxPDto } from './dto/asociar-documento-cxp.dto';
import { AsociarPagoTesoreriaDto } from './dto/asociar-pago-tesoreria.dto';
import { CambiarEstadoDto } from './dto/cambiar-estado.dto';
import { SaveCostoImportDto } from './dto/save-costo-import.dto';
import { SaveCostoOperativoDto } from './dto/save-costo-operativo.dto';
import { SaveDistribucionCostoDto } from './dto/save-distribucion-costo.dto';
import { SaveDocumentoDto } from './dto/save-documento.dto';
import { SaveEnvioDto } from './dto/save-envio.dto';
import { SaveGestionAduanaDto } from './dto/save-gestion-aduana.dto';
import { SaveImportacionDto } from './dto/save-importacion.dto';
import { SaveLiquidacionAduanaDto } from './dto/save-liquidacion-aduana.dto';
import { SaveRentabilidadDto } from './dto/save-rentabilidad.dto';
import { SetActivoDto } from './dto/set-activo.dto';

const IDE_CNTDO_IMPORTACION = 11;

@Injectable()
export class ImportacionesSaveService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly cxpSaveService: DocumentosCxPSaveService,
    ) {
        super();
        this.core
            .getVariables(['p_imp_estado_orden_pendiente'])
            .then((result) => { this.variables = result; });
    }

    // ========================================================================
    // IMPORTACIÓN — Cabecera + Detalles
    // ========================================================================

    // ========================================================================
    // CREAR / ACTUALIZAR FACTURA CxP DE IMPORTACIÓN
    // ========================================================================

    /**
     * Crea o actualiza el documento CxP (tipo 11 - DOCUMENTO DE IMPORTACION)
     * asociado a la cabecera de importación.
     * - Si ide_cpcfa es null en la cabecera → crea la factura y actualiza el campo.
     * - Si ide_cpcfa ya existe → actualiza montos del documento existente.
     */
    async crearFacturaCxpImportacion(ide_imcaim: number, dtoIn: HeaderParamsDto) {
        const qCab = new SelectQuery(`
            SELECT ide_geper, fecha_factura_imcaim, total_factura_imcaim,
                   numero_imcaim, observaciones_imcaim, ide_cpcfa, ide_empr, ide_sucu
            FROM imp_cab_importa
            WHERE ide_imcaim = $1
        `);
        qCab.addIntParam(1, ide_imcaim);
        const cab = await this.dataSource.createSingleQuery(qCab);

        if (!cab) throw new BadRequestException('Importación no encontrada');

        const total = Number(cab.total_factura_imcaim ?? 0);
        if (total <= 0) {
            return { message: 'Sin total de factura, se omite la creación del documento CxP' };
        }

        const ideCpcfaExistente: number | null = cab.ide_cpcfa ?? null;
        const isUpdate = !!ideCpcfaExistente;
        let numeroCpcfa: string;

        if (isUpdate) {
            const qNum = new SelectQuery(`SELECT numero_cpcfa FROM cxp_cabece_factur WHERE ide_cpcfa = $1`);
            qNum.addIntParam(1, ideCpcfaExistente);
            const existing = await this.dataSource.createSingleQuery(qNum);
            numeroCpcfa = existing?.numero_cpcfa ?? '001-001-000000001';

            // Si la factura fue asignada manualmente (no sigue el formato auto-generado)
            // no se sobreescribe: el usuario debe gestionarla desde CxP directamente
            if (!/^001-001-\d{9}$/.test(numeroCpcfa)) {
                return { message: 'ok', ide_cpcfa: ideCpcfaExistente, skipped: true };
            }
        } else {
            const qSeq = new SelectQuery(`
                SELECT COALESCE(MAX(CAST(SPLIT_PART(numero_cpcfa, '-', 3) AS BIGINT)), 0) + 1 AS secuencial
                FROM cxp_cabece_factur
                WHERE ide_cntdo = ${IDE_CNTDO_IMPORTACION}
                AND ide_empr = $1
                AND ide_sucu = $2
            `);
            qSeq.addIntParam(1, cab.ide_empr);
            qSeq.addIntParam(2, Number(cab.ide_sucu ?? dtoIn.ideSucu));
            const seqResult = await this.dataSource.createSingleQuery(qSeq);
            const seq = Number(seqResult?.secuencial ?? 1);
            numeroCpcfa = `001-001-${String(seq).padStart(9, '0')}`;
        }

        const observacion = [cab.numero_imcaim, cab.observaciones_imcaim]
            .filter(Boolean)
            .join(' - ');
        const fechaEmisi = cab.fecha_factura_imcaim
            ? new Date(cab.fecha_factura_imcaim).toISOString().slice(0, 10)
            : new Date().toISOString().slice(0, 10);

        const saveDto: SaveDocumentoCxPDto & HeaderParamsDto = {
            ...dtoIn,
            cabecera: {
                ...(ideCpcfaExistente ? { ide_cpcfa: ideCpcfaExistente } : {}),
                ide_cntdo: IDE_CNTDO_IMPORTACION, // DOCUMENTO DE IMPORTACION
                ide_geper: Number(cab.ide_geper),
                numero_cpcfa: numeroCpcfa,
                autorizacio_cpcfa: '1234567890',
                fecha_emisi_cpcfa: fechaEmisi,
                ide_cndfp: 1, // Contado
                ide_cndfp1: 11, // Otros con utilizacion del sistema financiero
                observacion_cpcfa: observacion,
                base_grabada_cpcfa: 0,
                base_no_objeto_iva_cpcfa: 0,
                base_tarifa0_cpcfa: total,
                valor_iva_cpcfa: 0,
                total_cpcfa: total,
                descuento_cpcfa: 0,
                otros_cpcfa: 0,
                valor_ice_cpcfa: 0,
                tarifa_iva_cpcfa: 0,
                dias_credito_cpcfa: 0,
                ide_srtst: 10,
            },
            detalles: [
                {
                    ide_inarti: 1000,  // Importaciones en transito
                    cantidad_cpdfa: 1,
                    precio_cpdfa: total,
                    valor_cpdfa: total,
                    iva_inarti_cpdfa: '-1',
                },
            ],
        };

        const result = await this.cxpSaveService.saveDocumento(saveDto);

        if (!isUpdate) {
            await this.dataSource.pool.query(
                `UPDATE imp_cab_importa SET ide_cpcfa = $2, usuario_actua = $3, hora_actua = NOW()
                 WHERE ide_imcaim = $1`,
                [ide_imcaim, result.ide_cpcfa, dtoIn.login],
            );
        }

        return { message: 'ok', ide_cpcfa: result.ide_cpcfa };
    }

    /**
     * Vincula una factura CxP existente (tipo 11) a una orden de importación.
     * Útil cuando la factura fue ingresada antes de que existiera el módulo.
     * Valida que la factura sea tipo 11, no esté anulada y no esté ya asignada.
     */
    async asignarFacturaCxp(ide_imcaim: number, ide_cpcfa: number, login: string) {
        // Validar que la importación exista y obtener su total esperado
        const qImp = new SelectQuery(`
            SELECT ide_imcaim, total_factura_imcaim
            FROM imp_cab_importa
            WHERE ide_imcaim = $1
        `);
        qImp.addIntParam(1, ide_imcaim);
        const importacion = await this.dataSource.createSingleQuery(qImp);
        if (!importacion) throw new BadRequestException('Orden de importación no encontrada');

        // Validar que la factura exista, sea tipo 11 y no esté anulada
        const qFac = new SelectQuery(`
            SELECT ide_cpcfa, ide_cntdo, ide_cpefa, total_cpcfa, numero_cpcfa
            FROM cxp_cabece_factur
            WHERE ide_cpcfa = $1
        `);
        qFac.addIntParam(1, ide_cpcfa);
        const factura = await this.dataSource.createSingleQuery(qFac);

        if (!factura) throw new BadRequestException('Factura CxP no encontrada');
        if (Number(factura.ide_cntdo) !== IDE_CNTDO_IMPORTACION)
            throw new BadRequestException(
                `La factura no es de tipo DOCUMENTO DE IMPORTACION (${IDE_CNTDO_IMPORTACION})`,
            );
        if (Number(factura.ide_cpefa) !== 0)
            throw new BadRequestException('La factura está anulada y no puede asignarse');

        // Validar que el total de la factura coincida con el total de la importación
        const totalImportacion = Number(importacion.total_factura_imcaim ?? 0);
        const totalFactura = Number(factura.total_cpcfa ?? 0);
        if (totalImportacion > 0 && totalFactura !== totalImportacion) {
            throw new BadRequestException(
                `El total de la factura (${totalFactura}) no coincide con el total de la importación (${totalImportacion})`,
            );
        }

        // Validar que no esté ya asignada a otra importación
        const qDup = new SelectQuery(`
            SELECT ide_imcaim FROM imp_cab_importa
            WHERE ide_cpcfa = $1 AND ide_imcaim <> $2
        `);
        qDup.addIntParam(1, ide_cpcfa);
        qDup.addIntParam(2, ide_imcaim);
        const dup = await this.dataSource.createSingleQuery(qDup);
        if (dup) throw new BadRequestException(`La factura ya está asignada a la importación #${dup.ide_imcaim}`);

        await this.dataSource.pool.query(
            `UPDATE imp_cab_importa
             SET ide_cpcfa = $2, usuario_actua = $3, hora_actua = NOW()
             WHERE ide_imcaim = $1`,
            [ide_imcaim, ide_cpcfa, login],
        );

        return { message: 'ok', ide_imcaim, ide_cpcfa, total_cpcfa: factura.total_cpcfa };
    }

    async desasignarFacturaCxp(ide_imcaim: number, login: string) {
        const qCab = new SelectQuery(`SELECT ide_cpcfa FROM imp_cab_importa WHERE ide_imcaim = $1`);
        qCab.addIntParam(1, ide_imcaim);
        const cab = await this.dataSource.createSingleQuery(qCab);
        if (!cab) throw new BadRequestException('Orden de importación no encontrada');
        if (!cab.ide_cpcfa) throw new BadRequestException('La orden no tiene ninguna factura asignada');

        await this.dataSource.pool.query(
            `UPDATE imp_cab_importa
             SET ide_cpcfa = NULL, usuario_actua = $2, hora_actua = NOW()
             WHERE ide_imcaim = $1`,
            [ide_imcaim, login],
        );

        return { message: 'ok', ide_imcaim, ide_cpcfa_desasignado: cab.ide_cpcfa };
    }

    async saveImportacion(dtoIn: SaveImportacionDto & HeaderParamsDto) {
        const { data, detalles } = dtoIn;
        const isUpdate = !!data.ide_imcaim;
        const listQuery: ObjectQueryDto[] = [];
        let numero = '';
        let oldTotal: number | null = null;

        if (isUpdate) {
            const qOldTotal = new SelectQuery(
                `SELECT total_factura_imcaim FROM imp_cab_importa WHERE ide_imcaim = $1`,
            );
            qOldTotal.addIntParam(1, data.ide_imcaim!);
            const oldCab = await this.dataSource.createSingleQuery(qOldTotal);
            oldTotal = oldCab ? Number(oldCab.total_factura_imcaim ?? 0) : null;

            listQuery.push({
                operation: 'update',
                module: 'imp',
                tableName: 'cab_importa',
                primaryKey: 'ide_imcaim',
                object: data,
            });
        } else {
            const ide_imcaim = await this.dataSource.getSeqTable('imp_cab_importa', 'ide_imcaim', 1, dtoIn.login);
            const now = new Date();
            const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
            numero = `IMP-${yyyymm}${String(ide_imcaim).padStart(5, '0')}`;
            data.ide_imcaim = ide_imcaim;
            listQuery.push({
                operation: 'insert',
                module: 'imp',
                tableName: 'cab_importa',
                primaryKey: 'ide_imcaim',
                object: { ...data, numero_imcaim: numero, activo_imcaim: true },
            });
        }

        await this.core.save({ ...dtoIn, listQuery, audit: true });

        // imp_det_importa no tiene ide_empr/ide_sucu → SQL directo
        if (detalles && detalles.length > 0) {
            if (isUpdate) {
                await this.dataSource.pool.query(
                    `DELETE FROM imp_det_importa WHERE ide_imcaim = $1`,
                    [data.ide_imcaim],
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
                        impuesto_ad_valorem_imdet, regulacion_ecuatoriana_imdet,
                        precio_venta_imdet, porcentaje_utilidad_imdet
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
                    [
                        ide_imdet, data.ide_imcaim, det.ide_inarti, det.ide_inuni ?? null,
                        det.cantidad_imdet, det.precio_unitario_imdet,
                        det.descripcion_prod_imdet ?? null, det.num_paquetes_imdet ?? null,
                        det.observaciones_imdet ?? null,
                        det.partida_aduana_imdet, det.descripcion_partida_imdet,
                        det.categoria_imdet ?? null,
                        det.peso_neto_imdet ?? null, det.peso_carga_imdet ?? null,
                        det.volumen_unitario_imdet ?? null,
                        det.impuesto_ad_valorem_imdet ?? null,
                        det.regulacion_ecuatoriana_imdet ?? null,
                        det.precio_venta_imdet ?? null,
                        det.porcentaje_utilidad_imdet ?? null,
                    ],
                );
            }
        }

        // Crear / actualizar factura CxP de importación
        // const newTotal = Number(data.total_factura_imcaim ?? 0);
        // if (newTotal > 0) {
        //     if (!isUpdate) {
        //         await this.crearFacturaCxpImportacion(data.ide_imcaim!, dtoIn);
        //     } else if (oldTotal !== null && newTotal !== oldTotal) {
        //         await this.crearFacturaCxpImportacion(data.ide_imcaim!, dtoIn);
        //     }
        // }

        return { message: 'ok', ide_imcaim: data.ide_imcaim, numero };
    }

    // ========================================================================
    // ENVÍO
    // ========================================================================
    async saveEnvio(dtoIn: SaveEnvioDto & HeaderParamsDto) {
        const isUpdate = dtoIn.ide_imenv != null;
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
        const ideEmpr = cab?.ide_empr ?? dtoIn.ideEmpr;

        // Validar unicidad de numero_dau_imga antes de INSERT/UPDATE
        if (dtoIn.numero_dau_imga) {
            const qDup = new SelectQuery(
                `SELECT ide_imga FROM imp_gestion_aduana WHERE numero_dau_imga = $1 AND ide_empr = $2`,
            );
            qDup.addStringParam(1, dtoIn.numero_dau_imga);
            qDup.addIntParam(2, ideEmpr);
            const dup = await this.dataSource.createSingleQuery(qDup);
            if (dup && dup.ide_imga !== dtoIn.ide_imga) {
                throw new BadRequestException(
                    `El número DAU "${dtoIn.numero_dau_imga}" ya existe para esta empresa`,
                );
            }
        }

        const isUpdate = dtoIn.ide_imga != null;
        if (isUpdate) {
            await this.dataSource.pool.query(
                `UPDATE imp_gestion_aduana SET
                   ide_imtaf = $2, ide_geper = $3, numero_dau_imga = $4,
                   fecha_presentacion_imga = $5, fecha_liquidacion_imga = $6,
                   fecha_liberacion_imga = $7,
                   fob_imga = $8, flete_imga = $9, seguro_imga = $10,
                   ajustes_imga = $11, valor_aduana_imga = $12,
                   items_declarados_imga = $13, peso_neto_kilos_imga = $14,
                   observaciones_imga = $15
                 WHERE ide_imga = $1`,
                [
                    dtoIn.ide_imga, dtoIn.ide_imtaf, dtoIn.ide_geper,
                    dtoIn.numero_dau_imga ?? null, dtoIn.fecha_presentacion_imga ?? null,
                    dtoIn.fecha_liquidacion_imga ?? null, dtoIn.fecha_liberacion_imga ?? null,
                    dtoIn.fob_imga ?? 0, dtoIn.flete_imga ?? 0, dtoIn.seguro_imga ?? 0,
                    dtoIn.ajustes_imga ?? 0, dtoIn.valor_aduana_imga ?? 0,
                    dtoIn.items_declarados_imga ?? 0, dtoIn.peso_neto_kilos_imga ?? 0,
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
                fecha_liberacion_imga,
                fob_imga, flete_imga, seguro_imga, ajustes_imga,
                valor_aduana_imga, items_declarados_imga, peso_neto_kilos_imga,
                observaciones_imga
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
            [
                ide_imga, dtoIn.ide_imcaim, dtoIn.ide_imtaf, dtoIn.ide_geper,
                ideEmpr,
                dtoIn.numero_dau_imga ?? null, dtoIn.fecha_presentacion_imga ?? null,
                dtoIn.fecha_liquidacion_imga ?? null, dtoIn.fecha_liberacion_imga ?? null,
                dtoIn.fob_imga ?? 0, dtoIn.flete_imga ?? 0, dtoIn.seguro_imga ?? 0,
                dtoIn.ajustes_imga ?? 0, dtoIn.valor_aduana_imga ?? 0,
                dtoIn.items_declarados_imga ?? 0, dtoIn.peso_neto_kilos_imga ?? 0,
                dtoIn.observaciones_imga ?? null,
            ],
        );
        return { message: 'ok', ide_imga };
    }

    // ========================================================================
    // LIQUIDACIÓN ADUANA
    // ========================================================================
    async saveLiquidacionAduana(dtoIn: SaveLiquidacionAduanaDto & HeaderParamsDto) {
        const { ide_imga, liquidaciones } = dtoIn;

        const hasExisting = liquidaciones.some((liq) => liq.ide_imliq != null);

        if (hasExisting) {
            await this.dataSource.pool.query(
                `DELETE FROM imp_liquidacion_aduana WHERE ide_imga = $1`,
                [ide_imga],
            );
        }

        const ids: number[] = [];

        for (const liq of liquidaciones) {
            const ide_imliq = await this.dataSource.getSeqTable(
                'imp_liquidacion_aduana', 'ide_imliq', 1, dtoIn.login,
            );
            await this.dataSource.pool.query(
                `INSERT INTO imp_liquidacion_aduana (
                    ide_imliq, ide_imga, arancel_advalorem_liq_imliq,
                    iva_liquidacion_imliq, ice_liquidacion_imliq, fodinfa_liquidacion_imliq,
                    tasas_imliq, recargos_imliq, intereses_imliq, multas_imliq, otros_imliq,
                    fecha_liquidacion_imliq, numero_liquidacion_imliq, observaciones_liquidacion_imliq
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
                [
                    ide_imliq, ide_imga,
                    liq.arancel_advalorem_liq_imliq ?? null,
                    liq.iva_liquidacion_imliq ?? null, liq.ice_liquidacion_imliq ?? 0,
                    liq.fodinfa_liquidacion_imliq ?? 0,
                    liq.tasas_imliq ?? 0, liq.recargos_imliq ?? 0,
                    liq.intereses_imliq ?? 0, liq.multas_imliq ?? 0, liq.otros_imliq ?? 0,
                    liq.fecha_liquidacion_imliq ?? null,
                    liq.numero_liquidacion_imliq, liq.observaciones_liquidacion_imliq ?? null,
                ],
            );
            ids.push(ide_imliq);
        }

        return { message: 'ok', ide_imga, count: ids.length, ids };
    }

    // ========================================================================
    // COSTO
    // ========================================================================
    async saveCosto(dtoIn: SaveCostoImportDto & HeaderParamsDto) {
        const isUpdate = dtoIn.ide_imcoim != null;
        if (isUpdate) {
            const qOld = new SelectQuery(`
                SELECT ide_imtco, ide_mone, ide_cpcfa, ide_teccba,
                       fecha_imcoim, monto_imcoim, observaciones_imcoim, referencia_imcoim
                FROM imp_costos_import
                WHERE ide_imcoim = $1
            `);
            qOld.addIntParam(1, dtoIn.ide_imcoim);
            const old = await this.dataSource.createSingleQuery(qOld);

            await this.dataSource.pool.query(
                `UPDATE imp_costos_import SET
                   ide_imtco = $2, ide_mone = $3, ide_cpcfa = $4, ide_teccba = $5,
                   fecha_imcoim = $6, monto_imcoim = $7, observaciones_imcoim = $8,
                   referencia_imcoim = $9
                 WHERE ide_imcoim = $1`,
                [
                    dtoIn.ide_imcoim, dtoIn.ide_imtco,
                    dtoIn.ide_mone ?? old.ide_mone ?? null,
                    dtoIn.ide_cpcfa ?? old.ide_cpcfa ?? null,
                    dtoIn.ide_teccba ?? old.ide_teccba ?? null,
                    dtoIn.fecha_imcoim ?? old.fecha_imcoim ?? null,
                    dtoIn.monto_imcoim ?? old.monto_imcoim,
                    dtoIn.observaciones_imcoim ?? old.observaciones_imcoim ?? null,
                    dtoIn.referencia_imcoim ?? old.referencia_imcoim ?? null,
                ],
            );
            return { message: 'ok', ide_imcoim: dtoIn.ide_imcoim };
        }
        const ide_imcoim = await this.dataSource.getSeqTable('imp_costos_import', 'ide_imcoim', 1, dtoIn.login);
        await this.dataSource.pool.query(
            `INSERT INTO imp_costos_import (
                ide_imcoim, ide_imcaim, ide_imtco, ide_mone, ide_cpcfa, ide_teccba,
                fecha_imcoim, monto_imcoim, observaciones_imcoim,
                referencia_imcoim, activo_imcoim
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)`,
            [
                ide_imcoim, dtoIn.ide_imcaim, dtoIn.ide_imtco, dtoIn.ide_mone ?? null,
                dtoIn.ide_cpcfa ?? null, dtoIn.ide_teccba ?? null,
                dtoIn.fecha_imcoim ?? null, dtoIn.monto_imcoim,
                dtoIn.observaciones_imcoim ?? null, dtoIn.referencia_imcoim ?? null,
            ],
        );
        return { message: 'ok', ide_imcoim };
    }

    async deleteCosto(ide_imcoim: number) {
        await this.dataSource.pool.query(
            `DELETE FROM imp_costos_import WHERE ide_imcoim = $1`,
            [ide_imcoim],
        );
        return { message: 'ok' };
    }

    // ========================================================================
    // ASOCIAR DOCUMENTO CxP — crea costo con referencia/observacion del frontend
    // ========================================================================
    async asociarDocumentoCxP(dtoIn: AsociarDocumentoCxPDto & HeaderParamsDto) {
        const qImp = new SelectQuery(`
            SELECT ide_imcaim FROM imp_cab_importa WHERE ide_imcaim = $1
        `);
        qImp.addIntParam(1, dtoIn.ide_imcaim);
        const importacion = await this.dataSource.createSingleQuery(qImp);
        if (!importacion) throw new BadRequestException('Orden de importación no encontrada');

        const qFac = new SelectQuery(`
            SELECT ide_cpcfa, numero_cpcfa FROM cxp_cabece_factur WHERE ide_cpcfa = $1
        `);
        qFac.addIntParam(1, dtoIn.ide_cpcfa);
        const factura = await this.dataSource.createSingleQuery(qFac);
        if (!factura) throw new BadRequestException('Documento CxP no encontrado');

        const ide_imcoim = await this.dataSource.getSeqTable('imp_costos_import', 'ide_imcoim', 1, dtoIn.login);
        await this.dataSource.pool.query(
            `INSERT INTO imp_costos_import (
                ide_imcoim, ide_imcaim, ide_imtco, ide_mone, ide_cpcfa,
                fecha_imcoim, monto_imcoim, observaciones_imcoim,
                referencia_imcoim, activo_imcoim
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)`,
            [
                ide_imcoim, dtoIn.ide_imcaim, null, null, dtoIn.ide_cpcfa,
                new Date().toISOString().slice(0, 10), null,
                dtoIn.observacion ?? null, dtoIn.referencia,
            ],
        );

        return { message: 'ok', ide_imcoim, ide_imcaim: dtoIn.ide_imcaim, ide_cpcfa: dtoIn.ide_cpcfa };
    }

    // ========================================================================
    // ASOCIAR PAGO TESORERIA — vincula un pago de tesorería a un costo sin CxP
    // ========================================================================
    async asociarPagoTesoreria(dtoIn: AsociarPagoTesoreriaDto & HeaderParamsDto) {
        const qCosto = new SelectQuery(`
            SELECT ide_imcoim, ide_cpcfa FROM imp_costos_import WHERE ide_imcoim = $1
        `);
        qCosto.addIntParam(1, dtoIn.ide_imcoim);
        const costo = await this.dataSource.createSingleQuery(qCosto);
        if (!costo) throw new BadRequestException('Costo no encontrado');
        if (costo.ide_cpcfa) throw new BadRequestException('El costo ya tiene un documento CxP asociado, use el módulo de cuentas por pagar');

        const qTeclb = new SelectQuery(`
            SELECT ide_teclb FROM tes_cab_libr_banc WHERE ide_teclb = $1
        `);
        qTeclb.addIntParam(1, dtoIn.ide_teccba);
        const teclb = await this.dataSource.createSingleQuery(qTeclb);
        if (!teclb) throw new BadRequestException('Transacción de tesorería no encontrada');

        await this.dataSource.pool.query(
            `UPDATE imp_costos_import SET ide_teccba = $2 WHERE ide_imcoim = $1`,
            [dtoIn.ide_imcoim, dtoIn.ide_teccba],
        );

        return { message: 'ok', ide_imcoim: dtoIn.ide_imcoim, ide_teccba: dtoIn.ide_teccba };
    }

    // ========================================================================
    // DOCUMENTO
    // ========================================================================
    async saveDocumento(dtoIn: SaveDocumentoDto & HeaderParamsDto) {
        const isUpdate = dtoIn.ide_imdocu != null;
        if (isUpdate) {
            await this.dataSource.pool.query(
                `UPDATE imp_documentos SET
                   ide_itd = $2, numero_documento_imdocu = $3, fecha_emision_imdocu = $4,
                   fecha_recepcion_imdocu = $5, archivo_ruta_imdocu = $6,
                   peso_archivo_imdocu = $7, nombre_real_archivo_imdocu = $8,
                   observaciones_imdocu = $9
                 WHERE ide_imdocu = $1`,
                [
                    dtoIn.ide_imdocu, dtoIn.ide_itd, dtoIn.numero_documento_imdocu ?? null,
                    dtoIn.fecha_emision_imdocu ?? null, dtoIn.fecha_recepcion_imdocu ?? null,
                    dtoIn.archivo_ruta_imdocu ?? null,
                    dtoIn.peso_archivo_imdocu ?? null, dtoIn.nombre_real_archivo_imdocu ?? null,
                    dtoIn.observaciones_imdocu ?? null,
                ],
            );
            return { message: 'ok', ide_imdocu: dtoIn.ide_imdocu };
        }
        const ide_imdocu = await this.dataSource.getSeqTable('imp_documentos', 'ide_imdocu', 1, dtoIn.login);
        await this.dataSource.pool.query(
            `INSERT INTO imp_documentos (
                ide_imdocu, ide_imcaim, ide_itd, numero_documento_imdocu,
                fecha_emision_imdocu, fecha_recepcion_imdocu, archivo_ruta_imdocu,
                peso_archivo_imdocu, nombre_real_archivo_imdocu, observaciones_imdocu
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
                ide_imdocu, dtoIn.ide_imcaim, dtoIn.ide_itd, dtoIn.numero_documento_imdocu ?? null,
                dtoIn.fecha_emision_imdocu ?? null, dtoIn.fecha_recepcion_imdocu ?? null,
                dtoIn.archivo_ruta_imdocu ?? null,
                dtoIn.peso_archivo_imdocu ?? null, dtoIn.nombre_real_archivo_imdocu ?? null,
                dtoIn.observaciones_imdocu ?? null,
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
    // DISTRIBUCIÓN DE COSTOS OPERATIVOS — directa sobre imp_det_importa
    // ========================================================================

    /**
     * Distribuye proporcionalmente el costo_total (sin IVA de liquidaciones) entre
     * todos los items del detalle, usando el subtotal FOB como base de proporción.
     * costo_total = suma_valor_aduana + otros_costos + bases_facturas
     *             + (suma_total_impuestos - suma_iva).
     * El IVA de liquidaciones se excluye por ser crédito tributario recuperable.
     */

    /**
     * Calcula el costo operativo total de la importación usando la misma fórmula
     * que getImportacionById (campo costos_operativos).
     * No filtra por activo_imcoim para mantenerse consistente con la vista de cabecera.
     */
    private async calcularCostoOperativoTotal(ide_imcaim: number): Promise<number> {
        const result = await this.dataSource.pool.query<{ costos_operativos: string }>(`
            SELECT
                (COALESCE(ga.suma_valor_aduana, 0) - COALESCE(c.total_factura_imcaim, 0))
                + COALESCE(op.otros_costos, 0) + COALESCE(op.bases_facturas, 0)
                + (COALESCE(liq.suma_total_impuestos, 0) - COALESCE(liq.suma_iva, 0))
                AS costos_operativos
            FROM imp_cab_importa c
            LEFT JOIN (
                SELECT SUM(valor_aduana_imga) AS suma_valor_aduana
                FROM imp_gestion_aduana
                WHERE ide_imcaim = $1
            ) ga ON TRUE
            LEFT JOIN (
                SELECT SUM(l.total_impuestos_liq_imliq) AS suma_total_impuestos,
                       SUM(l.iva_liquidacion_imliq)      AS suma_iva
                FROM imp_gestion_aduana g
                INNER JOIN imp_liquidacion_aduana l ON g.ide_imga = l.ide_imga
                WHERE g.ide_imcaim = $1
            ) liq ON TRUE
            LEFT JOIN (
                SELECT COALESCE(SUM(monto_imcoim), 0) AS otros_costos,
                       COALESCE(SUM(bases_fact), 0)    AS bases_facturas
                FROM (
                    SELECT co.monto_imcoim, 0::numeric AS bases_fact
                    FROM imp_costos_import co
                    WHERE co.ide_cpcfa IS NULL AND co.ide_imcaim = $1
                    UNION ALL
                    SELECT 0::numeric AS monto_imcoim,
                           COALESCE(f.base_grabada_cpcfa, 0) + COALESCE(f.base_tarifa0_cpcfa, 0) AS bases_fact
                    FROM imp_costos_import co
                    INNER JOIN cxp_cabece_factur f ON co.ide_cpcfa = f.ide_cpcfa
                    WHERE co.ide_cpcfa IS NOT NULL AND co.ide_imcaim = $1
                ) raw
            ) op ON TRUE
            WHERE c.ide_imcaim = $1
        `, [ide_imcaim]);
        return Number(result.rows[0]?.costos_operativos ?? 0);
    }

    async distribuirCostos(dtoIn: SaveDistribucionCostoDto & HeaderParamsDto) {
        const costoOperativo = await this.calcularCostoOperativoTotal(dtoIn.ide_imcaim);

        const qDet = new SelectQuery(`
            SELECT ide_imdet, cantidad_imdet, precio_unitario_imdet
            FROM imp_det_importa
            WHERE ide_imcaim = $1
            ORDER BY ide_imdet
        `);
        qDet.addIntParam(1, dtoIn.ide_imcaim);
        const detalles = await this.dataSource.createSelectQuery(qDet);

        if (!detalles.length) {
            return { message: 'ok', ide_imcaim: dtoIn.ide_imcaim, items: 0 };
        }

        const totalFob = detalles.reduce(
            (sum, d) => sum + Number(d.precio_unitario_imdet ?? 0) * Number(d.cantidad_imdet ?? 0),
            0,
        );

        for (const det of detalles) {
            const cantidad = Math.max(Number(det.cantidad_imdet) || 1, 0.0001);
            const precioUnitario = Number(det.precio_unitario_imdet ?? 0);
            const fobItem = precioUnitario * cantidad;
            const proporcion = totalFob > 0 ? fobItem / totalFob : 1 / detalles.length;
            const costoOperativoTotal = costoOperativo * proporcion;
            const costoOperativoUnitario = costoOperativoTotal / cantidad;
            const costoUnitarioTotal = precioUnitario + costoOperativoUnitario;
            const subtotalFinal = costoUnitarioTotal * cantidad;

            await this.dataSource.pool.query(
                `UPDATE imp_det_importa SET
                    costo_operativo_unitario_imdet = ROUND($2::numeric, 4),
                    costo_operativo_total_imdet = ROUND($3::numeric, 4),
                    costo_unitario_total_imdet = ROUND($4::numeric, 4),
                    precio_unit_final_imdet = ROUND($4::numeric, 4),
                    subtotal_final_imdet = ROUND($5::numeric, 4)
                 WHERE ide_imdet = $1`,
                [det.ide_imdet, costoOperativoUnitario, costoOperativoTotal, costoUnitarioTotal, subtotalFinal],
            );
        }

        return { message: 'ok', ide_imcaim: dtoIn.ide_imcaim, items: detalles.length, costo_operativo: costoOperativo };
    }

    /**
     * Permite modificar manualmente la distribución de costos operativos.
     * Valida que la suma de costo_operativo_total_imdet de los items
     * coincida con el total operativo: costo_total - sum(precio_unitario * cantidad).
     */
    async saveCostoOperativo(dtoIn: SaveCostoOperativoDto & HeaderParamsDto) {
        const costoOperativo = await this.calcularCostoOperativoTotal(dtoIn.ide_imcaim);

        const sumaItems = dtoIn.items.reduce((sum, i) => sum + i.costo_operativo_total_imdet, 0);
        const tolerancia = 0.01;
        if (Math.abs(sumaItems - costoOperativo) > tolerancia) {
            throw new BadRequestException(
                `La suma de costos operativos de los items (${sumaItems}) no coincide con el costo operativo de la importación (${costoOperativo})`,
            );
        }

        for (const item of dtoIn.items) {
            const qDet = new SelectQuery(`
                SELECT cantidad_imdet, precio_unitario_imdet
                FROM imp_det_importa
                WHERE ide_imdet = $1
            `);
            qDet.addIntParam(1, item.ide_imdet);
            const det = await this.dataSource.createSingleQuery(qDet);
            if (!det) continue;

            const cantidad = Math.max(Number(det.cantidad_imdet) || 1, 0.0001);
            const costoOperativoUnitario = item.costo_operativo_total_imdet / cantidad;
            const costoUnitarioTotal = Number(det.precio_unitario_imdet ?? 0) + costoOperativoUnitario;
            const subtotalFinal = costoUnitarioTotal * cantidad;

            await this.dataSource.pool.query(
                `UPDATE imp_det_importa SET
                    costo_operativo_unitario_imdet = ROUND($2::numeric, 4),
                    costo_operativo_total_imdet = ROUND($3::numeric, 4),
                    costo_unitario_total_imdet = ROUND($4::numeric, 4),
                    precio_unit_final_imdet = ROUND($4::numeric, 4),
                    subtotal_final_imdet = ROUND($5::numeric, 4)
                 WHERE ide_imdet = $1`,
                [item.ide_imdet, costoOperativoUnitario, item.costo_operativo_total_imdet, costoUnitarioTotal, subtotalFinal],
            );
        }

        return { message: 'ok', ide_imcaim: dtoIn.ide_imcaim, items: dtoIn.items.length };
    }

    /**
     * Resetea a NULL los campos de distribución de costos operativos y rentabilidad
     * en imp_det_importa, y elimina el registro de imp_rentabilidad.
     * Deja la importación en estado inicial (sin costos distribuidos ni rentabilidad).
     */
    async resetearCostosRentabilidad(ide_imcaim: number) {
        await this.dataSource.pool.query(
            `UPDATE imp_det_importa SET
                costo_operativo_unitario_imdet = NULL,
                costo_operativo_total_imdet = NULL,
                costo_unitario_total_imdet = NULL,
                precio_unit_final_imdet = NULL,
                subtotal_final_imdet = NULL,
                precio_venta_imdet = NULL,
                porcentaje_utilidad_imdet = NULL,
                utilidad_imdet = NULL,
                margen_utilidad_imdet = NULL
             WHERE ide_imcaim = $1`,
            [ide_imcaim],
        );

        await this.dataSource.pool.query(
            `DELETE FROM imp_rentabilidad WHERE ide_imcaim = $1`,
            [ide_imcaim],
        );

        return { message: 'ok', ide_imcaim };
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

    // ========================================================================
    // RENTABILIDAD — Cálculo de utilidades y rentabilidad
    // ========================================================================

    /**
     * Recalcula costo_unitario_total_imdet, precio_unit_final_imdet y subtotal_final_imdet
     * usando costo_operativo_unitario_imdet (ya distribuido en el detalle).
     */
    async calcularCostosUnitarios(ide_imcaim: number, login: string) {
        const qDetalles = new SelectQuery(`
            SELECT ide_imdet, cantidad_imdet, precio_unitario_imdet,
                   COALESCE(costo_operativo_unitario_imdet, 0) AS costo_operativo_unitario
            FROM imp_det_importa
            WHERE ide_imcaim = $1
        `);
        qDetalles.addIntParam(1, ide_imcaim);
        const detalles = await this.dataSource.createSelectQuery(qDetalles);

        for (const det of detalles) {
            const cantidad = Math.max(Number(det.cantidad_imdet) || 1, 0.0001);
            const costoUnitarioTotal = Number(det.precio_unitario_imdet ?? 0) + Number(det.costo_operativo_unitario);

            await this.dataSource.pool.query(
                `UPDATE imp_det_importa
                 SET costo_unitario_total_imdet = ROUND($2, 4),
                     precio_unit_final_imdet = ROUND($2, 4),
                     subtotal_final_imdet = ROUND($2 * cantidad_imdet, 4)
                 WHERE ide_imdet = $1`,
                [det.ide_imdet, costoUnitarioTotal],
            );
        }

        return { message: 'ok', detalles_actualizados: detalles.length };
    }

    /**
     * Recalcula la distribución de costos operativos usando el nuevo costo_total
     * (sin IVA de liquidaciones) y re-evalúa la rentabilidad si ya existe precio_venta.
     * - Re-distribuye costo_total proporcionalmente por FOB
     * - Si el item tiene precio_venta_imdet > 0, recalcula %utilidad, utilidad y margen
     * - Actualiza imp_rentabilidad con las nuevas métricas
     */
    async recalcularCostos(ide_imcaim: number, login: string) {
        const costoOperativo = await this.calcularCostoOperativoTotal(ide_imcaim);

        const qDet = new SelectQuery(`
            SELECT ide_imdet, cantidad_imdet, precio_unitario_imdet,
                   precio_venta_imdet, porcentaje_utilidad_imdet
            FROM imp_det_importa
            WHERE ide_imcaim = $1
            ORDER BY ide_imdet
        `);
        qDet.addIntParam(1, ide_imcaim);
        const detalles = await this.dataSource.createSelectQuery(qDet);

        if (!detalles.length) {
            return { message: 'ok', ide_imcaim, items: 0 };
        }

        const totalFob = detalles.reduce(
            (sum, d) => sum + Number(d.precio_unitario_imdet ?? 0) * Number(d.cantidad_imdet ?? 0),
            0,
        );

        let sumaUtilidad = 0;
        let sumaPrecioVenta = 0;
        let sumaCostoTotal = 0;
        let sumaPctUtilidadPonderado = 0;
        let sumaPesoPonderado = 0;
        let sumaMargenPonderado = 0;

        for (const det of detalles) {
            const cantidad = Math.max(Number(det.cantidad_imdet) || 1, 0.0001);
            const precioUnitario = Number(det.precio_unitario_imdet ?? 0);
            const fobItem = precioUnitario * cantidad;
            const proporcion = totalFob > 0 ? fobItem / totalFob : 1 / detalles.length;
            const costoOperativoTotal = costoOperativo * proporcion;
            const costoOperativoUnitario = costoOperativoTotal / cantidad;
            const costoUnitarioTotal = precioUnitario + costoOperativoUnitario;

            const dbPrecioVenta = Number(det.precio_venta_imdet ?? 0);
            const dbPctUtilidad = Number(det.porcentaje_utilidad_imdet ?? 0);
            let pctUtilidad = dbPctUtilidad;
            let precioVenta = dbPrecioVenta;
            let utilidad = 0;
            let margen = 0;

            if (precioVenta > 0 && costoUnitarioTotal > 0) {
                // Precio de venta configurado → recalcula %utilidad con el nuevo costo
                pctUtilidad = ((precioVenta / costoUnitarioTotal) - 1) * 100;
                utilidad = (precioVenta - costoUnitarioTotal) * cantidad;
                margen = ((precioVenta - costoUnitarioTotal) / precioVenta) * 100;
            } else if (dbPctUtilidad > 0 && costoUnitarioTotal > 0) {
                // Solo % de utilidad configurado → recalcula precio de venta con el nuevo costo
                precioVenta = costoUnitarioTotal * (1 + dbPctUtilidad / 100);
                utilidad = (precioVenta - costoUnitarioTotal) * cantidad;
                margen = ((precioVenta - costoUnitarioTotal) / precioVenta) * 100;
            }

            const pctSafe = isFinite(pctUtilidad) ? Math.max(-99.99, Math.min(999.99, Number(pctUtilidad.toFixed(2)))) : 0;
            const utilidadSafe = isFinite(utilidad) ? Number(utilidad.toFixed(4)) : 0;
            const margenSafe = isFinite(margen) ? Math.max(-99.99, Math.min(999.99, Number(margen.toFixed(2)))) : 0;
            const subtotalSafe = isFinite(costoUnitarioTotal * cantidad) ? Number((costoUnitarioTotal * cantidad).toFixed(4)) : 0;
            const precioVentaSafe = precioVenta > 0 ? Number(precioVenta.toFixed(4)) : 0;

            await this.dataSource.pool.query(
                `UPDATE imp_det_importa SET
                    costo_operativo_unitario_imdet = ROUND($2::numeric, 4),
                    costo_operativo_total_imdet = ROUND($3::numeric, 4),
                    costo_unitario_total_imdet = ROUND($4::numeric, 4),
                    precio_unit_final_imdet = ROUND($4::numeric, 4),
                    subtotal_final_imdet = ROUND($5::numeric, 4),
                    precio_venta_imdet = CASE WHEN $9::numeric > 0 THEN ROUND($9::numeric, 4) ELSE precio_venta_imdet END,
                    porcentaje_utilidad_imdet = $6::numeric(5,2),
                    utilidad_imdet = $7::numeric(12,4),
                    margen_utilidad_imdet = $8::numeric(5,2)
                 WHERE ide_imdet = $1`,
                [det.ide_imdet, costoOperativoUnitario, costoOperativoTotal, costoUnitarioTotal, subtotalSafe, pctSafe, utilidadSafe, margenSafe, precioVentaSafe],
            );

            if (precioVenta > 0) {
                const peso = precioVenta * cantidad;
                sumaUtilidad += utilidad;
                sumaPrecioVenta += peso;
                sumaCostoTotal += costoUnitarioTotal * cantidad;
                sumaPctUtilidadPonderado += pctUtilidad * peso;
                sumaPesoPonderado += peso;
                sumaMargenPonderado += margen * peso;
            }
        }

        const totalUtilidad = sumaUtilidad;
        const costoTotalImportacion = sumaCostoTotal;
        const precioVentaTotal = sumaPrecioVenta;
        const gananciaBruta = totalUtilidad;
        const totalInversion = costoTotalImportacion;
        const pctUtilidadGlobal = sumaPesoPonderado > 0 ? sumaPctUtilidadPonderado / sumaPesoPonderado : 0;
        const margenGlobal = sumaPesoPonderado > 0 ? sumaMargenPonderado / sumaPesoPonderado : 0;
        const roiPorcentaje = totalInversion > 0 ? (totalUtilidad / totalInversion) * 100 : 0;

        const qExist = new SelectQuery(`SELECT ide_imren FROM imp_rentabilidad WHERE ide_imcaim = $1`);
        qExist.addIntParam(1, ide_imcaim);
        const exist = await this.dataSource.createSingleQuery(qExist);

        if (exist) {
            await this.dataSource.pool.query(
                `UPDATE imp_rentabilidad SET
                    porcentaje_utilidad_global = $2,
                    margen_utilidad_global = $3,
                    ganancia_bruta_imren = $4,
                    costo_total_importacion_imren = $5,
                    precio_venta_total_imren = $6,
                    total_utilidad_imren = $7,
                    total_inversion_imren = $8,
                    roi_porcentaje_imren = $9
                 WHERE ide_imcaim = $1`,
                [
                    ide_imcaim,
                    Math.round(pctUtilidadGlobal * 100) / 100,
                    Math.round(margenGlobal * 100) / 100,
                    Math.round(gananciaBruta * 100) / 100,
                    Math.round(costoTotalImportacion * 100) / 100,
                    Math.round(precioVentaTotal * 100) / 100,
                    Math.round(totalUtilidad * 100) / 100,
                    Math.round(totalInversion * 100) / 100,
                    Math.round(roiPorcentaje * 100) / 100,
                ],
            );
        }

        return {
            message: 'ok',
            ide_imcaim,
            items: detalles.length,
            costo_operativo: costoOperativo,
            totales: exist ? {
                costo_total_importacion: Math.round(costoTotalImportacion * 100) / 100,
                precio_venta_total: Math.round(precioVentaTotal * 100) / 100,
                ganancia_bruta: Math.round(gananciaBruta * 100) / 100,
                total_utilidad: Math.round(totalUtilidad * 100) / 100,
                total_inversion: Math.round(totalInversion * 100) / 100,
                porcentaje_utilidad_global: Math.round(pctUtilidadGlobal * 100) / 100,
                margen_utilidad_global: Math.round(margenGlobal * 100) / 100,
                roi_porcentaje: Math.round(roiPorcentaje * 100) / 100,
            } : null,
        };
    }

    /**
     * Guarda/actualiza la rentabilidad de una importación.
     * - Si se envía porcentaje_utilidad_global sin detalles, aplica a todos los detalles.
     * - Si se envían detalles, aplica por cada uno.
     * - Calcula automáticamente: precio_venta, utilidad, margen según lo que reciba.
     */
    async saveRentabilidad(dtoIn: SaveRentabilidadDto & HeaderParamsDto) {
        const { ide_imcaim, porcentaje_utilidad_global, detalles } = dtoIn;

        // 1. Obtener detalles actuales con costos unitarios
        const qDetalles = new SelectQuery(`
            SELECT d.ide_imdet, d.cantidad_imdet, d.precio_unitario_imdet,
                   d.precio_unit_final_imdet, d.costo_unitario_total_imdet,
                   d.precio_venta_imdet, d.porcentaje_utilidad_imdet
            FROM imp_det_importa d
            WHERE d.ide_imcaim = $1
            ORDER BY d.ide_imdet
        `);
        qDetalles.addIntParam(1, ide_imcaim);
        const detallesDB = await this.dataSource.createSelectQuery(qDetalles);

        if (!detallesDB || detallesDB.length === 0) {
            throw new BadRequestException('La importación no tiene productos en el detalle');
        }

        // 2. Construir mapa de datos entrantes por ide_imdet
        const detallesMap = new Map<number, { precio_venta?: number; pct_utilidad?: number }>();
        if (detalles) {
            for (const d of detalles) {
                detallesMap.set(d.ide_imdet, {
                    precio_venta: d.precio_venta_imdet,
                    pct_utilidad: d.porcentaje_utilidad_imdet,
                });
            }
        }

        // 3. Calcular por cada detalle
        //    Fórmulas:
        //      - %utilidad es MARKUP: precio_venta = costo * (1 + %/100)
        //      - %margen es MARGIN: ((precio_venta - costo) / precio_venta) * 100
        let sumaUtilidad = 0;
        let sumaPrecioVenta = 0;
        let sumaCostoTotal = 0;
        let sumaPctUtilidadPonderado = 0;
        let sumaPesoPonderado = 0;
        let sumaMargenPonderado = 0;

        for (const det of detallesDB) {
            const ide_imdet = Number(det.ide_imdet);
            const cantidad = Math.max(Number(det.cantidad_imdet) || 1, 0.0001);
            const costoUnitario = Number(det.costo_unitario_total_imdet ?? det.precio_unit_final_imdet ?? det.precio_unitario_imdet ?? 0);

            if (costoUnitario <= 0) continue;

            const dbPctUtilidad = Number(det.porcentaje_utilidad_imdet ?? 0);
            const dbPrecioVenta = Number(det.precio_venta_imdet ?? 0);
            const input = detallesMap.get(ide_imdet);

            let pctUtilidad: number;
            let precioVenta: number;

            if (input) {
                const hasPrecioVenta = input.precio_venta != null;
                const hasPctUtilidad = input.pct_utilidad != null;

                if (hasPrecioVenta) {
                    // Precio venta explícito → calcula %utilidad (markup)
                    precioVenta = input.precio_venta!;
                    pctUtilidad = ((precioVenta / costoUnitario) - 1) * 100;
                } else if (hasPctUtilidad) {
                    // %utilidad explícito → calcula precio_venta (markup)
                    pctUtilidad = input.pct_utilidad!;
                    precioVenta = costoUnitario * (1 + pctUtilidad / 100);
                } else {
                    // Detalle en la lista pero sin datos → valores existentes o costo
                    pctUtilidad = dbPctUtilidad;
                    precioVenta = dbPrecioVenta > 0 ? dbPrecioVenta : costoUnitario * (1 + pctUtilidad / 100);
                }
            } else if (porcentaje_utilidad_global != null) {
                // Aplica % global a detalles no incluidos en la lista
                pctUtilidad = porcentaje_utilidad_global;
                precioVenta = costoUnitario * (1 + pctUtilidad / 100);
            } else {
                // Sin input y sin %global → valores DB o costo
                pctUtilidad = dbPctUtilidad;
                precioVenta = dbPrecioVenta > 0 ? dbPrecioVenta : costoUnitario * (1 + pctUtilidad / 100);
            }

            // Calcular utilidad (absoluta) y margen (% del precio de venta)
            const utilidad = (precioVenta - costoUnitario) * cantidad;
            const margen = precioVenta > 0 ? ((precioVenta - costoUnitario) / precioVenta) * 100 : 0;

            // Actualizar en DB
            await this.dataSource.pool.query(
                `UPDATE imp_det_importa
                 SET precio_venta_imdet = $2,
                     porcentaje_utilidad_imdet = $3,
                     utilidad_imdet = $4,
                     margen_utilidad_imdet = $5,
                     usuario_actua = $6,
                     hora_actua = NOW()
                 WHERE ide_imdet = $1`,
                [ide_imdet, precioVenta, pctUtilidad, utilidad, margen, dtoIn.login],
            );

            // Acumular para globales (ponderados por precio_venta * cantidad)
            const peso = precioVenta * cantidad;
            sumaUtilidad += utilidad;
            sumaPrecioVenta += peso;
            sumaCostoTotal += costoUnitario * cantidad;
            sumaPctUtilidadPonderado += pctUtilidad * peso;
            sumaPesoPonderado += peso;
            sumaMargenPonderado += margen * peso;
        }

        // 4. Calcular métricas globales
        const totalUtilidad = sumaUtilidad;
        const costoTotalImportacion = sumaCostoTotal;
        const precioVentaTotal = sumaPrecioVenta;
        const gananciaBruta = totalUtilidad;
        const totalInversion = costoTotalImportacion;
        const pctUtilidadGlobal = sumaPesoPonderado > 0 ? sumaPctUtilidadPonderado / sumaPesoPonderado : 0;
        const margenGlobal = sumaPesoPonderado > 0 ? sumaMargenPonderado / sumaPesoPonderado : 0;
        const roiPorcentaje = totalInversion > 0 ? (totalUtilidad / totalInversion) * 100 : 0;

        // 5. UPSERT en imp_rentabilidad
        const qExist = new SelectQuery(`SELECT ide_imren FROM imp_rentabilidad WHERE ide_imcaim = $1`);
        qExist.addIntParam(1, ide_imcaim);
        const exist = await this.dataSource.createSingleQuery(qExist);

        if (exist) {
            await this.dataSource.pool.query(
                `UPDATE imp_rentabilidad SET
                    porcentaje_utilidad_global = $2,
                    margen_utilidad_global = $3,
                    ganancia_bruta_imren = $4,
                    costo_total_importacion_imren = $5,
                    precio_venta_total_imren = $6,
                    total_utilidad_imren = $7,
                    total_inversion_imren = $8,
                    roi_porcentaje_imren = $9,
                    usuario_actua = $10,
                    hora_actua = NOW()
                 WHERE ide_imcaim = $1`,
                [
                    ide_imcaim,
                    Math.round(pctUtilidadGlobal * 100) / 100,
                    Math.round(margenGlobal * 100) / 100,
                    Math.round(gananciaBruta * 100) / 100,
                    Math.round(costoTotalImportacion * 100) / 100,
                    Math.round(precioVentaTotal * 100) / 100,
                    Math.round(totalUtilidad * 100) / 100,
                    Math.round(totalInversion * 100) / 100,
                    Math.round(roiPorcentaje * 100) / 100,
                    dtoIn.login,
                ],
            );
        } else {
            const ide_imren = await this.dataSource.getSeqTable('imp_rentabilidad', 'ide_imren', 1, dtoIn.login);
            await this.dataSource.pool.query(
                `INSERT INTO imp_rentabilidad (
                    ide_imren, ide_imcaim,
                    porcentaje_utilidad_global, margen_utilidad_global,
                    ganancia_bruta_imren, costo_total_importacion_imren,
                    precio_venta_total_imren, total_utilidad_imren,
                    total_inversion_imren, roi_porcentaje_imren,
                    activo_imren
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)`,
                [
                    ide_imren, ide_imcaim,
                    Math.round(pctUtilidadGlobal * 100) / 100,
                    Math.round(margenGlobal * 100) / 100,
                    Math.round(gananciaBruta * 100) / 100,
                    Math.round(costoTotalImportacion * 100) / 100,
                    Math.round(precioVentaTotal * 100) / 100,
                    Math.round(totalUtilidad * 100) / 100,
                    Math.round(totalInversion * 100) / 100,
                    Math.round(roiPorcentaje * 100) / 100,
                ],
            );
        }

        return {
            message: 'ok',
            ide_imcaim,
            totales: {
                costo_total_importacion: Math.round(costoTotalImportacion * 100) / 100,
                precio_venta_total: Math.round(precioVentaTotal * 100) / 100,
                ganancia_bruta: Math.round(gananciaBruta * 100) / 100,
                total_utilidad: Math.round(totalUtilidad * 100) / 100,
                total_inversion: Math.round(totalInversion * 100) / 100,
                porcentaje_utilidad_global: Math.round(pctUtilidadGlobal * 100) / 100,
                margen_utilidad_global: Math.round(margenGlobal * 100) / 100,
                roi_porcentaje: Math.round(roiPorcentaje * 100) / 100,
            },
        };
    }
}
