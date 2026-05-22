import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';

import { GetImportacionesDto } from './dto/get-importaciones.dto';

@Injectable()
export class ImportacionesService extends BaseService {
    constructor(private readonly dataSource: DataSourceService) {
        super();
    }

    // ========================================================================
    // CATÁLOGOS — ListData para combos
    // ========================================================================

    async getListDataIncoterm() {
        const query = new SelectQuery(`
            SELECT CAST(ide_iminco AS VARCHAR) AS value, nombre_iminco AS label
            FROM imp_incoterm WHERE activo_iminco = true ORDER BY nombre_iminco
        `);
        return this.dataSource.createSelectQuery(query);
    }

    async getListDataEstadoOrden() {
        const query = new SelectQuery(`
            SELECT CAST(ide_imesor AS VARCHAR) AS value, nombre_imesor AS label
            FROM imp_estado_orden WHERE activo_imesor = true ORDER BY ide_imesor
        `);
        return this.dataSource.createSelectQuery(query);
    }

    async getListDataTipoCosto() {
        const query = new SelectQuery(`
            SELECT CAST(ide_imtco AS VARCHAR) AS value, nombre_imtco AS label
            FROM imp_tipo_costo WHERE activo_imtco = true ORDER BY nombre_imtco
        `);
        return this.dataSource.createSelectQuery(query);
    }

    async getListDataTipoDocumento() {
        const query = new SelectQuery(`
            SELECT CAST(ide_itd AS VARCHAR) AS value, nombre_itd AS label
            FROM imp_tipo_documento WHERE activo_itd = true ORDER BY nombre_itd
        `);
        return this.dataSource.createSelectQuery(query);
    }

    async getListDataTipoTransporte() {
        const query = new SelectQuery(`
            SELECT CAST(ide_itt AS VARCHAR) AS value, nombre_itt AS label
            FROM imp_tipo_transporte WHERE activo_itt = true ORDER BY nombre_itt
        `);
        return this.dataSource.createSelectQuery(query);
    }

    async getListDataEstadoEnvio() {
        const query = new SelectQuery(`
            SELECT CAST(ide_imev AS VARCHAR) AS value, nombre_imev AS label
            FROM imp_estado_envio WHERE activo_imev = true ORDER BY ide_imev
        `);
        return this.dataSource.createSelectQuery(query);
    }

    async getListDataTipoAforo() {
        const query = new SelectQuery(`
            SELECT CAST(ide_imtaf AS VARCHAR) AS value, nombre_imtaf AS label
            FROM imp_tipo_aforo WHERE activo_imtaf = true ORDER BY nombre_imtaf
        `);
        return this.dataSource.createSelectQuery(query);
    }

    // ========================================================================
    // CONSULTAS PRINCIPALES
    // ========================================================================

    async getImportaciones(dtoIn: GetImportacionesDto & HeaderParamsDto) {
        const condicionEstado = dtoIn.ide_imesor ? `AND c.ide_imesor = ${dtoIn.ide_imesor}` : '';
        const condicionProveedor = dtoIn.ide_geper ? `AND c.ide_geper = ${dtoIn.ide_geper}` : '';

        const query = new SelectQuery(
            `
            SELECT c.ide_imcaim,
                   c.numero_imcaim,
                   c.fecha_imcaim,
                   c.fecha_factura_imcaim,
                   c.num_factura_imcaim,
                   c.total_factura_imcaim,
                   p.nom_geper                AS proveedor,
                   p.identificac_geper,
                   i.nombre_iminco            AS incoterm,
                   e.nombre_imesor            AS estado,
                   c.peso_neto_imcaim,
                   c.peso_carga_imcaim,
                   c.observaciones_imcaim,
                   c.activo_imcaim,
                   c.usuario_ingre,
                   c.hora_ingre
            FROM imp_cab_importa c
            INNER JOIN gen_persona p ON c.ide_geper = p.ide_geper
            INNER JOIN imp_incoterm i ON c.ide_iminco = i.ide_iminco
            INNER JOIN imp_estado_orden e ON c.ide_imesor = e.ide_imesor
            WHERE c.ide_empr = $1
              AND c.fecha_imcaim BETWEEN $2 AND $3
              ${condicionEstado}
              ${condicionProveedor}
            ORDER BY c.fecha_imcaim DESC, c.ide_imcaim DESC
            `,
            dtoIn,
        );
        query.addIntParam(1, dtoIn.ideEmpr);
        query.addStringParam(2, dtoIn.fechaInicio);
        query.addStringParam(3, dtoIn.fechaFin);
        return this.dataSource.createQuery(query);
    }

    async getImportacionById(ide_imcaim: number) {
        const query = new SelectQuery(`
            SELECT c.ide_imcaim, c.ide_geper, c.ide_iminco, c.ide_imesor,
                   c.ide_gepais, c.ide_empr, c.ide_sucu, c.ide_cpcfa, c.ide_incci,
                   c.numero_imcaim, c.fecha_imcaim, c.fecha_produccion_imcaim,
                   c.fecha_factura_imcaim, c.num_factura_imcaim, c.total_factura_imcaim,
                   c.peso_neto_imcaim, c.peso_carga_imcaim, c.volumen_carga_imcaim,
                   c.observaciones_imcaim, c.activo_imcaim,
                   c.usuario_ingre, c.hora_ingre, c.usuario_actua, c.hora_actua,
                   p.nom_geper               AS proveedor,
                   p.identificac_geper,
                   i.nombre_iminco           AS incoterm,
                   e.nombre_imesor           AS estado,
                   pa.nombre_gepais          AS pais_origen
            FROM imp_cab_importa c
            INNER JOIN gen_persona p ON c.ide_geper = p.ide_geper
            INNER JOIN imp_incoterm i ON c.ide_iminco = i.ide_iminco
            INNER JOIN imp_estado_orden e ON c.ide_imesor = e.ide_imesor
            LEFT JOIN gen_pais pa ON c.ide_gepais = pa.ide_gepais
            WHERE c.ide_imcaim = $1
        `);
        query.addIntParam(1, ide_imcaim);
        return this.dataSource.createSingleQuery(query);
    }

    async getDetalleImportacion(ide_imcaim: number) {
        const query = new SelectQuery(`
            SELECT d.ide_imdet, d.ide_imcaim, d.ide_inarti, d.ide_inuni,
                   d.cantidad_imdet, d.precio_unitario_imdet, d.subtotal_imdet,
                   d.descripcion_prod_imdet, d.num_paquetes_imdet, d.observaciones_imdet,
                   d.partida_aduana_imdet, d.descripcion_partida_imdet, d.categoria_imdet,
                   d.peso_neto_imdet, d.peso_carga_imdet, d.volumen_unitario_imdet,
                   d.impuesto_ad_valorem_imdet, d.regulacion_ecuatoriana_imdet,
                   d.precio_unit_final_imdet, d.subtotal_final_imdet,
                   d.usuario_ingre, d.hora_ingre, d.usuario_actua, d.hora_actua,
                   a.nombre_inarti           AS nombre_producto,
                   a.codigo_inarti,
                   u.nombre_inuni            AS unidad
            FROM imp_det_importa d
            INNER JOIN inv_articulo a ON d.ide_inarti = a.ide_inarti
            LEFT JOIN inv_unidad u ON d.ide_inuni = u.ide_inuni
            WHERE d.ide_imcaim = $1
            ORDER BY d.ide_imdet
        `);
        query.addIntParam(1, ide_imcaim);
        return this.dataSource.createSelectQuery(query);
    }

    async getCostosImportacion(ide_imcaim: number) {
        const query = new SelectQuery(`
            SELECT co.ide_imcoim, co.ide_imcaim, co.ide_imtco, co.ide_mone, co.ide_cpcfa,
                   co.fecha_imcoim, co.monto_imcoim, co.observaciones_imcoim,
                   co.referencia_imcoim, co.activo_imcoim,
                   co.usuario_ingre, co.hora_ingre, co.usuario_actua, co.hora_actua,
                   tc.nombre_imtco           AS tipo_costo,
                   m.nombre_mone             AS moneda
            FROM imp_costos_import co
            INNER JOIN imp_tipo_costo tc ON co.ide_imtco = tc.ide_imtco
            LEFT JOIN sis_moneda m ON co.ide_mone = m.ide_mone
            WHERE co.ide_imcaim = $1
            ORDER BY co.ide_imcoim
        `);
        query.addIntParam(1, ide_imcaim);
        return this.dataSource.createSelectQuery(query);
    }

    async getPagosImportacion(ide_imcaim: number) {
        const query = new SelectQuery(`
            SELECT pa.ide_impag, pa.ide_imcaim, pa.ide_imcoim, pa.ide_mone,
                   pa.ide_cpcfa, pa.ide_teclb, pa.fecha_pago_impag,
                   pa.monto_pago_impag, pa.referencia_pago_impag,
                   pa.observaciones_pago_impag, pa.path_comprobante_impag,
                   pa.es_costo_operativo_impag, pa.activo_impag,
                   pa.usuario_ingre, pa.hora_ingre, pa.usuario_actua, pa.hora_actua,
                   m.nombre_mone             AS moneda,
                   tc.nombre_imtco           AS tipo_costo
            FROM imp_pagos_import pa
            LEFT JOIN sis_moneda m ON pa.ide_mone = m.ide_mone
            LEFT JOIN imp_costos_import co ON pa.ide_imcoim = co.ide_imcoim
            LEFT JOIN imp_tipo_costo tc ON co.ide_imtco = tc.ide_imtco
            WHERE pa.ide_imcaim = $1
            ORDER BY pa.fecha_pago_impag, pa.ide_impag
        `);
        query.addIntParam(1, ide_imcaim);
        return this.dataSource.createSelectQuery(query);
    }

    async getDocumentosImportacion(ide_imcaim: number) {
        const query = new SelectQuery(`
            SELECT d.ide_imdocu, d.ide_imcaim, d.ide_itd,
                   d.numero_documento_imdocu, d.fecha_emision_imdocu,
                   d.fecha_recepcion_imdocu, d.archivo_ruta_imdocu,
                   d.observaciones_imdocu,
                   d.usuario_ingre, d.hora_ingre, d.usuario_actua, d.hora_actua,
                   td.nombre_itd             AS tipo_documento
            FROM imp_documentos d
            INNER JOIN imp_tipo_documento td ON d.ide_itd = td.ide_itd
            WHERE d.ide_imcaim = $1
            ORDER BY d.ide_imdocu
        `);
        query.addIntParam(1, ide_imcaim);
        return this.dataSource.createSelectQuery(query);
    }

    async getEnvioImportacion(ide_imcaim: number) {
        const query = new SelectQuery(`
            SELECT e.ide_imenv, e.ide_imcaim, e.ide_imev, e.ide_itt,
                   e.naviera_aerolinea_imenv, e.fecha_embarque_imenv,
                   e.fecha_estimada_llegada_imenv, e.fecha_real_llegada_imenv,
                   e.puerto_embarque_imenv, e.puerto_destino_imenv,
                   e.agente_carga_imenv,
                   e.usuario_ingre, e.hora_ingre, e.usuario_actua, e.hora_actua,
                   ev.nombre_imev            AS estado_envio,
                   t.nombre_itt              AS tipo_transporte
            FROM imp_envio e
            INNER JOIN imp_estado_envio ev ON e.ide_imev = ev.ide_imev
            INNER JOIN imp_tipo_transporte t ON e.ide_itt = t.ide_itt
            WHERE e.ide_imcaim = $1
        `);
        query.addIntParam(1, ide_imcaim);
        return this.dataSource.createSelectQuery(query);
    }

    async getGestionAduana(ide_imcaim: number) {
        const query = new SelectQuery(`
            SELECT g.ide_imga, g.ide_imcaim, g.ide_imtaf, g.ide_geper, g.ide_empr,
                   g.numero_dau_imga, g.fecha_presentacion_imga,
                   g.fecha_liquidacion_imga, g.fecha_liberacion_imga,
                   g.observaciones_imga,
                   g.usuario_ingre, g.hora_ingre, g.usuario_actua, g.hora_actua,
                   ta.nombre_imtaf           AS tipo_aforo,
                   p.nom_geper               AS agente_aduana
            FROM imp_gestion_aduana g
            INNER JOIN imp_tipo_aforo ta ON g.ide_imtaf = ta.ide_imtaf
            INNER JOIN gen_persona p ON g.ide_geper = p.ide_geper
            WHERE g.ide_imcaim = $1
        `);
        query.addIntParam(1, ide_imcaim);
        return this.dataSource.createSelectQuery(query);
    }

    async getLiquidacionAduana(ide_imga: number) {
        const query = new SelectQuery(`
            SELECT l.ide_imliq, l.ide_imga,
                   l.base_imponible_liq_imliq, l.arancel_advalorem_liq_imliq,
                   l.iva_liquidacion_imliq, l.ice_liquidacion_imliq,
                   l.fodinfa_liquidacion_imliq, l.total_impuestos_liq_imliq,
                   l.fecha_liquidacion_imliq, l.numero_liquidacion_imliq,
                   l.observaciones_liquidacion_imliq,
                   l.usuario_ingre, l.hora_ingre, l.usuario_actua, l.hora_actua
            FROM imp_liquidacion_aduana l
            WHERE l.ide_imga = $1
        `);
        query.addIntParam(1, ide_imga);
        return this.dataSource.createSelectQuery(query);
    }

    async getResumenCostos(ide_imcaim: number) {
        const query = new SelectQuery(`
            SELECT tc.nombre_imtco  AS tipo_costo,
                   COUNT(co.ide_imcoim) AS cantidad,
                   COALESCE(SUM(co.monto_imcoim), 0) AS total
            FROM imp_costos_import co
            INNER JOIN imp_tipo_costo tc ON co.ide_imtco = tc.ide_imtco
            WHERE co.ide_imcaim = $1 AND co.activo_imcoim = true
            GROUP BY tc.nombre_imtco
            ORDER BY total DESC
        `);
        query.addIntParam(1, ide_imcaim);
        return this.dataSource.createSelectQuery(query);
    }

    async getHistorialEstado(ide_imcaim: number) {
        const query = new SelectQuery(`
            SELECT h.ide_imhest, h.ide_imcaim,
                   h.ide_imesor_anterior, h.ide_imesor_nuevo,
                   h.fecha_cambio_imhest, h.observacion_imhest,
                   h.usuario_ingre, h.hora_ingre,
                   eo_ant.nombre_imesor  AS estado_anterior,
                   eo_nue.nombre_imesor  AS estado_nuevo
            FROM imp_historial_estado h
            LEFT JOIN imp_estado_orden eo_ant ON h.ide_imesor_anterior = eo_ant.ide_imesor
            INNER JOIN imp_estado_orden eo_nue ON h.ide_imesor_nuevo = eo_nue.ide_imesor
            WHERE h.ide_imcaim = $1
            ORDER BY h.fecha_cambio_imhest DESC
        `);
        query.addIntParam(1, ide_imcaim);
        return this.dataSource.createSelectQuery(query);
    }

    async getDistribucionCostos(ide_imcaim: number) {
        const query = new SelectQuery(`
            SELECT d.ide_imdico, d.ide_imcoim, d.ide_imdet,
                   d.metodo_dist_imdico, d.porcentaje_imdico, d.monto_imdico,
                   d.usuario_ingre, d.hora_ingre, d.usuario_actua, d.hora_actua,
                   a.nombre_inarti       AS producto,
                   tc.nombre_imtco       AS tipo_costo
            FROM imp_distribucion_costo d
            INNER JOIN imp_costos_import co ON d.ide_imcoim = co.ide_imcoim
            INNER JOIN imp_tipo_costo tc ON co.ide_imtco = tc.ide_imtco
            INNER JOIN imp_det_importa det ON d.ide_imdet = det.ide_imdet
            INNER JOIN inv_articulo a ON det.ide_inarti = a.ide_inarti
            WHERE co.ide_imcaim = $1
            ORDER BY co.ide_imcoim, d.ide_imdet
        `);
        query.addIntParam(1, ide_imcaim);
        return this.dataSource.createSelectQuery(query);
    }
}
