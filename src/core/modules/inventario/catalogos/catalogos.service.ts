import { Injectable, Logger } from '@nestjs/common';

import { BaseService } from '../../../../common/base-service';
import { HeaderParamsDto } from '../../../../common/dto/common-params.dto';
import { QueryOptionsDto } from '../../../../common/dto/query-options.dto';
import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery } from '../../../connection/helpers/select-query';
import { CoreService } from '../../../core.service';

import { GetCatalogoByPathDto } from './dto/get-catalogo-by-path.dto';
import { GetCatalogosDto } from './dto/get-catalogos.dto';
import { GetTagsCatalogoDto } from './dto/get-tags-catalogo.dto';
import { IdCatalogoDto } from './dto/id-catalogo.dto';

@Injectable()
export class CatalogosService extends BaseService {
    private readonly logger = new Logger(CatalogosService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
    }

    // ─────────────────────────────────────────────────────────────
    // CONSULTAS - CATÁLOGOS
    // ─────────────────────────────────────────────────────────────

    async getCatalogos(dtoIn: GetCatalogosDto & HeaderParamsDto) {
        const conditions: string[] = [`c.ide_empr = ${dtoIn.ideEmpr}`];
        if (dtoIn.soloActivos) {
            conditions.push('c.estado_inccat = true');
        }
        const whereClause = conditions.join(' AND ');

        const query = new SelectQuery(`
            SELECT
                c.ide_inccat,
                c.ide_empr,
                c.ide_tipo_inccat,
                c.nombre_inccat,
                c.descripcion_inccat,
                c.desc_corta_inccat,
                c.estado_inccat,
                c.orden_inccat,
                c.imagen_inccat,
                c.imagenes_inccat,
                c.path_inccat,
                c.vistas_inccat,
                c.color_inccat,
                c.usuario_ingre,
                c.fecha_ingre,
                c.hora_ingre,
                c.usuario_actua,
                c.fecha_actua,
                c.hora_actua
            FROM inv_cab_catalogo c
            WHERE ${whereClause}
            ORDER BY c.orden_inccat, c.nombre_inccat
        `, dtoIn);
        return this.dataSource.createQuery(query);
    }

    async getListaCatalogos(dtoIn: GetCatalogosDto) {
        const conditions: string[] = ['c.estado_inccat = true'];
        if (dtoIn.ideEmpr && dtoIn.ideEmpr > 0) {
            conditions.push(`c.ide_empr = ${dtoIn.ideEmpr}`);
        }
        const whereClause = conditions.join(' AND ');

        const query = new SelectQuery(`
            SELECT
                c.ide_inccat       AS ide_cata,
                c.ide_tipo_inccat  AS ide_tipo_cata,
                c.nombre_inccat    AS nombre_cata,
                c.desc_corta_inccat AS descripcion_corta_cata,
                c.imagen_inccat    AS imagen_cata,
                CASE WHEN c.estado_inccat = true THEN 1 ELSE 0 END AS activo_cata,
                c.path_inccat      AS path_cata,
                c.color_inccat     AS color_cata,
                c.vistas_inccat    AS vistas_cata,
                c.fecha_ingre      AS fecha_crea,
                c.usuario_ingre    AS usuario_crea,
                c.fecha_actua      AS fecha_modi,
                c.usuario_actua    AS usuario_modi
            FROM inv_cab_catalogo c
            WHERE ${whereClause}
            ORDER BY c.orden_inccat, c.nombre_inccat
        `, dtoIn);
        query.isLazy = false;
        return this.dataSource.createQuery(query);
    }

    async getCatalogoById(dtoIn: IdCatalogoDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                c.ide_inccat,
                c.ide_empr,
                c.ide_tipo_inccat,
                c.nombre_inccat,
                c.descripcion_inccat,
                c.desc_corta_inccat,
                c.estado_inccat,
                c.orden_inccat,
                c.imagen_inccat,
                c.imagenes_inccat,
                c.path_inccat,
                c.vistas_inccat,
                c.color_inccat,
                c.usuario_ingre,
                c.fecha_ingre,
                c.hora_ingre,
                c.usuario_actua,
                c.fecha_actua,
                c.hora_actua
            FROM inv_cab_catalogo c
            WHERE c.ide_inccat = $1
              AND c.ide_empr = ${dtoIn.ideEmpr}
        `);
        query.addIntParam(1, dtoIn.ide_inccat);
        return this.dataSource.createSingleQuery(query);
    }

    async getDetallesByCatalogo(dtoIn: IdCatalogoDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                d.ide_indcat,
                d.ide_inccat,
                d.ide_inarti,
                a.codigo_inarti,
                a.nombre_inarti,
                d.orden_indcat,
                d.activo_indcat,
                d.publica_sin_stock_indcat,
                d.descripcion_indcat,
                d.fotos_indcat,
                d.video_indcat,
                d.url_indcat,
                d.usuario_ingre,
                d.fecha_ingre,
                d.hora_ingre,
                d.usuario_actua,
                d.fecha_actua,
                d.hora_actua,
                a.url_inarti as url,
                a.notas_inarti  AS tags,
                COALESCE((
                    SELECT SUM(dci.cantidad_indci * tci.signo_intci)
                    FROM inv_det_comp_inve dci
                    INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                    INNER JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                    INNER JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                    WHERE dci.ide_inarti = d.ide_inarti
                      AND cci.ide_empr = ${dtoIn.ideEmpr}
                      AND cci.ide_inepi = 1
                ), 0) AS stock
            FROM inv_det_catalogo d
            INNER JOIN inv_articulo a ON a.ide_inarti = d.ide_inarti
            WHERE d.ide_inccat = $1
            ORDER BY
                CASE WHEN COALESCE((
                    SELECT SUM(dci.cantidad_indci * tci.signo_intci)
                    FROM inv_det_comp_inve dci
                    INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                    INNER JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                    INNER JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                    WHERE dci.ide_inarti = d.ide_inarti
                      AND cci.ide_empr = ${dtoIn.ideEmpr}
                      AND cci.ide_inepi = 1
                ), 0) > 0 THEN 0 ELSE 1 END,
                d.orden_indcat, a.nombre_inarti
        `, dtoIn);
        query.addIntParam(1, dtoIn.ide_inccat);
        return this.dataSource.createSelectQuery(query);
    }

    async getCatalogoCompleto(dtoIn: IdCatalogoDto & HeaderParamsDto) {
        return this.fetchCatalogoById(dtoIn.ide_inccat, dtoIn.ideEmpr, false);
    }

    // ─────────────────────────────────────────────────────────────
    // CATÁLOGO POR PATH (público + autenticado)
    // ─────────────────────────────────────────────────────────────

    async getCatalogoByPath(dtoIn: GetCatalogoByPathDto) {
        const ideEmpr = dtoIn.ideEmpr && dtoIn.ideEmpr > 0 ? dtoIn.ideEmpr : undefined;
        const result = await this.fetchCatalogoByPath(dtoIn.path, ideEmpr, true);
        if (result) {
            await this.dataSource.pool.query(
                `UPDATE inv_cab_catalogo SET vistas_inccat = COALESCE(vistas_inccat, 0) + 1 WHERE path_inccat = $1`,
                [dtoIn.path],
            );
        }
        return result;
    }

    async getCatalogoByPathAuth(dtoIn: GetCatalogoByPathDto & HeaderParamsDto) {
        return this.fetchCatalogoByPath(dtoIn.path, dtoIn.ideEmpr, false);
    }

    private async fetchCatalogoByPath(path: string, ideEmprFilter?: number, publicOnly = false) {
        if (!path) return null;

        const conditions: string[] = ['c.estado_inccat = true'];
        if (ideEmprFilter && ideEmprFilter > 0) {
            conditions.push(`c.ide_empr = ${ideEmprFilter}`);
        }
        const whereClause = conditions.join(' AND ');

        const queryCab = new SelectQuery(`
            SELECT
                c.ide_inccat       AS ide_cata,
                c.ide_empr,
                c.ide_tipo_inccat  AS ide_tipo_cata,
                c.nombre_inccat    AS nombre_cata,
                c.desc_corta_inccat AS descripcion_corta_cata,
                c.descripcion_inccat AS descripcion_cata,
                c.imagen_inccat    AS imagen_cata,
                CASE WHEN c.estado_inccat = true THEN 1 ELSE 0 END AS activo_cata,
                c.path_inccat      AS path_cata,
                c.color_inccat     AS color_cata,
                c.vistas_inccat    AS vistas_cata,
                c.fecha_ingre      AS fecha_crea,
                c.usuario_ingre    AS usuario_crea,
                c.fecha_actua      AS fecha_modi,
                c.usuario_actua    AS usuario_modi
            FROM inv_cab_catalogo c
            WHERE c.path_inccat = $1
              AND ${whereClause}
        `);
        queryCab.addParam(1, path);
        const cabecera = await this.dataSource.createSingleQuery(queryCab);
        if (!cabecera) return null;

        const ideEmpr = ideEmprFilter && ideEmprFilter > 0 ? ideEmprFilter : cabecera.ide_empr;

        const detConditions: string[] = [`d.ide_inccat = $1`];
        if (publicOnly) {
            detConditions.push('d.activo_indcat = true');
            detConditions.push('a.activo_inarti = true');
            detConditions.push(`(
                d.publica_sin_stock_indcat = true
                OR (
                    d.publica_sin_stock_indcat = false
                    AND COALESCE((
                        SELECT SUM(dci2.cantidad_indci * tci2.signo_intci)
                        FROM inv_det_comp_inve dci2
                        INNER JOIN inv_cab_comp_inve cci2 ON cci2.ide_incci = dci2.ide_incci
                        INNER JOIN inv_tip_tran_inve tti2 ON tti2.ide_intti = cci2.ide_intti
                        INNER JOIN inv_tip_comp_inve tci2 ON tci2.ide_intci = tti2.ide_intci
                        WHERE dci2.ide_inarti = d.ide_inarti
                          AND cci2.ide_empr = ${ideEmpr}
                          AND cci2.ide_inepi = 1
                    ), 0) > 0
                )
            )`);
        }
        const detWhereClause = detConditions.join(' AND ');

        const queryDet = new SelectQuery(`
            SELECT
                d.ide_indcat             AS ide_catp,
                d.ide_inarti             AS ide_prod,
                a.nombre_inarti          AS nom_prod,
                a.uuid                   AS uuid_prod,
                a.foto_inarti            AS img_prod,
                CASE WHEN d.activo_indcat = true THEN 1 ELSE 0 END AS activo_catp,
                a.otro_nombre_inarti     AS nom2_prod,
                a.desc_corta_inarti      AS descr_corta_prod,
                a.publicacion_inarti     AS contenido_prod,
                a.fotos_inarti           AS fotos_prod,
                a.total_vistas_inarti    AS vistas_prod,
                COALESCE(u.nombre_inuni, u.siglas_inuni) AS unidad,
                d.publica_sin_stock_indcat AS publica_sin_stock,
                d.descripcion_indcat     AS descripcion_catp,
                d.fotos_indcat           AS fotos_catp,
                d.video_indcat           AS video_catp,
                d.orden_indcat           AS orden,
                a.url_inarti             AS url,
                a.notas_inarti           AS tags,
                COALESCE((
                    SELECT SUM(dci.cantidad_indci * tci.signo_intci)
                    FROM inv_det_comp_inve dci
                    INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                    INNER JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                    INNER JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                    WHERE dci.ide_inarti = d.ide_inarti
                      AND cci.ide_empr = ${ideEmpr}
                      AND cci.ide_inepi = 1
                ), 0) AS stock,
                (
                    SELECT json_agg(cants.*)
                    FROM (
                        SELECT
                            cdc.ide_incdc,
                            cdc.cantidad_incdc AS cantidad,
                            cdc.unidad_medida_incdc AS unidad_medida,
                            cdc.descripcion_incdc AS descripcion,
                            cdc.orden_incdc AS orden,
                            COALESCE(cp.precio_fijo_incpa, 0) AS precio_fijo,
                            cp.incluye_iva_incpa AS incluye_iva,
                            COALESCE(
                                ROUND(
                                    cdc.cantidad_incdc * (
                                        CASE
                                            WHEN cp.incluye_iva_incpa THEN cp.precio_fijo_incpa
                                            ELSE cp.precio_fijo_incpa * (1 + COALESCE((
                                                SELECT porcentaje_cnpim
                                                FROM con_porcen_impues
                                                WHERE CURRENT_DATE BETWEEN fecha_desde_cnpim AND fecha_fin_cnpim
                                                  AND activo_cnpim = TRUE
                                                ORDER BY fecha_desde_cnpim DESC LIMIT 1
                                            ), 0.12))
                                        END
                                    ), 2
                                ), 0
                            ) AS precio_final,
                            fp.nombre_cndfp,
                            cfp.nombre_cncfp
                        FROM inv_cant_det_catalogo cdc
                        LEFT JOIN LATERAL (
                            SELECT *
                            FROM inv_conf_precios_articulo cp2
                            WHERE cp2.ide_inarti = d.ide_inarti
                              AND cp2.activo_incpa = true
                              AND cp2.autorizado_incpa = true
                              AND cp2.precio_fijo_incpa IS NOT NULL
                              AND cp2.precio_fijo_incpa > 0
                              AND (
                                  (cp2.rangos_incpa = false AND cp2.rango1_cant_incpa = cdc.cantidad_incdc)
                                  OR
                                  (cp2.rangos_incpa = true AND cdc.cantidad_incdc >= cp2.rango1_cant_incpa
                                   AND (cp2.rango2_cant_incpa IS NULL OR cdc.cantidad_incdc <= cp2.rango2_cant_incpa))
                              )
                            ORDER BY
                                CASE WHEN cp2.rangos_incpa = false THEN 0 ELSE 1 END,
                                cp2.rango1_cant_incpa
                            LIMIT 1
                        ) cp ON true
                        LEFT JOIN con_deta_forma_pago fp ON cp.ide_cndfp = fp.ide_cndfp
                        LEFT JOIN con_cabece_forma_pago cfp ON cp.ide_cncfp = cfp.ide_cncfp
                        WHERE cdc.ide_indcat = d.ide_indcat
                          AND cdc.activo_incdc = true
                        ORDER BY cdc.orden_incdc
                    ) cants
                ) AS cantidades
            FROM inv_det_catalogo d
            INNER JOIN inv_articulo a ON a.ide_inarti = d.ide_inarti
            LEFT JOIN inv_unidad u ON a.ide_inuni = u.ide_inuni
            WHERE ${detWhereClause}
            ORDER BY
                CASE WHEN COALESCE((
                    SELECT SUM(dci.cantidad_indci * tci.signo_intci)
                    FROM inv_det_comp_inve dci
                    INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                    INNER JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                    INNER JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                    WHERE dci.ide_inarti = d.ide_inarti
                      AND cci.ide_empr = ${ideEmpr}
                      AND cci.ide_inepi = 1
                ), 0) > 0 THEN 0 ELSE 1 END,
                d.orden_indcat, a.nombre_inarti
        `);
        queryDet.addIntParam(1, cabecera.ide_cata);
        const detalle = await this.dataSource.createSelectQuery(queryDet);

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { ide_empr, ...cabeceraPublica } = cabecera;
        return { ...cabeceraPublica, detalles: detalle };
    }

    private async fetchCatalogoById(ideInccat: number, ideEmpr: number, publicOnly = false) {
        const queryCab = new SelectQuery(`
            SELECT
                c.ide_inccat       AS ide_cata,
                c.ide_empr,
                c.ide_tipo_inccat  AS ide_tipo_cata,
                c.nombre_inccat    AS nombre_cata,
                c.desc_corta_inccat AS descripcion_corta_cata,
                c.descripcion_inccat AS descripcion_cata,
                c.imagen_inccat    AS imagen_cata,
                CASE WHEN c.estado_inccat = true THEN 1 ELSE 0 END AS activo_cata,
                c.path_inccat      AS path_cata,
                c.color_inccat     AS color_cata,
                c.vistas_inccat    AS vistas_cata,
                c.fecha_ingre      AS fecha_crea,
                c.usuario_ingre    AS usuario_crea,
                c.fecha_actua      AS fecha_modi,
                c.usuario_actua    AS usuario_modi
            FROM inv_cab_catalogo c
            WHERE c.ide_inccat = $1
              AND c.ide_empr = $2
        `);
        queryCab.addIntParam(1, ideInccat);
        queryCab.addIntParam(2, ideEmpr);
        const cabecera = await this.dataSource.createSingleQuery(queryCab);
        if (!cabecera) return null;

        const detConditions: string[] = [`d.ide_inccat = $1`];
        if (publicOnly) {
            detConditions.push('d.activo_indcat = true');
            detConditions.push('a.activo_inarti = true');
            detConditions.push(`(
                d.publica_sin_stock_indcat = true
                OR (
                    d.publica_sin_stock_indcat = false
                    AND COALESCE((
                        SELECT SUM(dci2.cantidad_indci * tci2.signo_intci)
                        FROM inv_det_comp_inve dci2
                        INNER JOIN inv_cab_comp_inve cci2 ON cci2.ide_incci = dci2.ide_incci
                        INNER JOIN inv_tip_tran_inve tti2 ON tti2.ide_intti = cci2.ide_intti
                        INNER JOIN inv_tip_comp_inve tci2 ON tci2.ide_intci = tti2.ide_intci
                        WHERE dci2.ide_inarti = d.ide_inarti
                          AND cci2.ide_empr = ${ideEmpr}
                          AND cci2.ide_inepi = 1
                    ), 0) > 0
                )
            )`);
        }
        const detWhereClause = detConditions.join(' AND ');

        const queryDet = new SelectQuery(`
            SELECT
                d.ide_indcat             AS ide_catp,
                d.ide_inarti             AS ide_prod,
                a.nombre_inarti          AS nom_prod,
                a.uuid                   AS uuid_prod,
                a.foto_inarti            AS img_prod,
                CASE WHEN d.activo_indcat = true THEN 1 ELSE 0 END AS activo_catp,
                a.otro_nombre_inarti     AS nom2_prod,
                a.desc_corta_inarti      AS descr_corta_prod,
                a.publicacion_inarti     AS contenido_prod,
                a.fotos_inarti           AS fotos_prod,
                a.total_vistas_inarti    AS vistas_prod,
                COALESCE(u.nombre_inuni, u.siglas_inuni) AS unidad,
                d.publica_sin_stock_indcat AS publica_sin_stock,
                d.descripcion_indcat     AS descripcion_catp,
                d.fotos_indcat           AS fotos_catp,
                d.video_indcat           AS video_catp,
                d.orden_indcat           AS orden,
                d.url_indcat             AS url,
                a.notas_inarti           AS tags,
                COALESCE((
                    SELECT SUM(dci.cantidad_indci * tci.signo_intci)
                    FROM inv_det_comp_inve dci
                    INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                    INNER JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                    INNER JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                    WHERE dci.ide_inarti = d.ide_inarti
                      AND cci.ide_empr = ${ideEmpr}
                      AND cci.ide_inepi = 1
                ), 0) AS stock,
                (
                    SELECT json_agg(cants.*)
                    FROM (
                        SELECT
                            cdc.ide_incdc,
                            cdc.cantidad_incdc AS cantidad,
                            cdc.unidad_medida_incdc AS unidad_medida,
                            cdc.descripcion_incdc AS descripcion,
                            cdc.orden_incdc AS orden,
                            COALESCE(cp.precio_fijo_incpa, 0) AS precio_fijo,
                            cp.incluye_iva_incpa AS incluye_iva,
                            COALESCE(
                                ROUND(
                                    cdc.cantidad_incdc * (
                                        CASE
                                            WHEN cp.incluye_iva_incpa THEN cp.precio_fijo_incpa
                                            ELSE cp.precio_fijo_incpa * (1 + COALESCE((
                                                SELECT porcentaje_cnpim
                                                FROM con_porcen_impues
                                                WHERE CURRENT_DATE BETWEEN fecha_desde_cnpim AND fecha_fin_cnpim
                                                  AND activo_cnpim = TRUE
                                                ORDER BY fecha_desde_cnpim DESC LIMIT 1
                                            ), 0.12))
                                        END
                                    ), 2
                                ), 0
                            ) AS precio_final,
                            fp.nombre_cndfp,
                            cfp.nombre_cncfp
                        FROM inv_cant_det_catalogo cdc
                        LEFT JOIN LATERAL (
                            SELECT *
                            FROM inv_conf_precios_articulo cp2
                            WHERE cp2.ide_inarti = d.ide_inarti
                              AND cp2.activo_incpa = true
                              AND cp2.autorizado_incpa = true
                              AND cp2.precio_fijo_incpa IS NOT NULL
                              AND cp2.precio_fijo_incpa > 0
                              AND (
                                  (cp2.rangos_incpa = false AND cp2.rango1_cant_incpa = cdc.cantidad_incdc)
                                  OR
                                  (cp2.rangos_incpa = true AND cdc.cantidad_incdc >= cp2.rango1_cant_incpa
                                   AND (cp2.rango2_cant_incpa IS NULL OR cdc.cantidad_incdc <= cp2.rango2_cant_incpa))
                              )
                            ORDER BY
                                CASE WHEN cp2.rangos_incpa = false THEN 0 ELSE 1 END,
                                cp2.rango1_cant_incpa
                            LIMIT 1
                        ) cp ON true
                        LEFT JOIN con_deta_forma_pago fp ON cp.ide_cndfp = fp.ide_cndfp
                        LEFT JOIN con_cabece_forma_pago cfp ON cp.ide_cncfp = cfp.ide_cncfp
                        WHERE cdc.ide_indcat = d.ide_indcat
                          AND cdc.activo_incdc = true
                        ORDER BY cdc.orden_incdc
                    ) cants
                ) AS cantidades
            FROM inv_det_catalogo d
            INNER JOIN inv_articulo a ON a.ide_inarti = d.ide_inarti
            LEFT JOIN inv_unidad u ON a.ide_inuni = u.ide_inuni
            WHERE ${detWhereClause}
            ORDER BY
                CASE WHEN COALESCE((
                    SELECT SUM(dci.cantidad_indci * tci.signo_intci)
                    FROM inv_det_comp_inve dci
                    INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                    INNER JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                    INNER JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                    WHERE dci.ide_inarti = d.ide_inarti
                      AND cci.ide_empr = ${ideEmpr}
                      AND cci.ide_inepi = 1
                ), 0) > 0 THEN 0 ELSE 1 END,
                d.orden_indcat, a.nombre_inarti
        `);
        queryDet.addIntParam(1, ideInccat);
        const detalle = await this.dataSource.createSelectQuery(queryDet);

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { ide_empr, ...cabeceraPublica } = cabecera;
        return { ...cabeceraPublica, detalles: detalle };
    }

    // ─────────────────────────────────────────────────────────────
    // TAGS DEL CATÁLOGO
    // ─────────────────────────────────────────────────────────────

    async getTagsCatalogo(dtoIn: GetTagsCatalogoDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
        SELECT
            tag,
            COUNT(DISTINCT a.ide_inarti)::int AS total
        FROM inv_det_catalogo d
        INNER JOIN inv_articulo a ON a.ide_inarti = d.ide_inarti
        CROSS JOIN LATERAL jsonb_array_elements_text(a.notas_inarti::jsonb) AS tag
        WHERE d.ide_inccat = ${dtoIn.ide_inccat}
            AND a.notas_inarti IS NOT NULL
            AND a.notas_inarti != 'null'
        GROUP BY tag
        ORDER BY tag
        `,
            dtoIn,
        );

        query.setLazy(false);
        return this.dataSource.createSelectQuery(query);
    }

    // ─────────────────────────────────────────────────────────────
    // TIPO CATÁLOGO
    // ─────────────────────────────────────────────────────────────

    async getListDataTipoCatalogo(dtoIn: HeaderParamsDto) {
        return this.core.getListDataValues({
            ...dtoIn,
            module: 'inv',
            tableName: 'tipo_catalogo',
            primaryKey: 'ide_intica',
            columnLabel: 'nombre_intica',
            condition: `activo_intica = true AND ide_empr = ${dtoIn.ideEmpr}`,
            columnOrder: 'orden_intica',
        });
    }

    async getTableQueryTipoCatalogo(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        return this.core.getTableQuery({
            ...dtoIn,
            module: 'inv',
            tableName: 'tipo_catalogo',
            primaryKey: 'ide_intica',
            condition: `ide_empr = ${dtoIn.ideEmpr}`,
            orderBy: { column: 'orden_intica' },
        });
    }
}
