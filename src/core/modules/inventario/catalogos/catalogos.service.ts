import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

import { BaseService } from '../../../../common/base-service';
import { HeaderParamsDto } from '../../../../common/dto/common-params.dto';
import { QueryOptionsDto } from '../../../../common/dto/query-options.dto';
import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery } from '../../../connection/helpers/select-query';
import { CoreService } from '../../../core.service';

import { BuscarCatalogosDto } from './dto/buscar-catalogos.dto';
import { GetCatalogoByPathDto } from './dto/get-catalogo-by-path.dto';
import { GetCatalogosDto } from './dto/get-catalogos.dto';
import { GetTagsCatalogoDto } from './dto/get-tags-catalogo.dto';
import { IdCatalogoDto } from './dto/id-catalogo.dto';

/** Prefijo de la caché del catálogo público. Formato: `catalogo:path:<path>:<ideEmpr>`. */
export const CATALOGO_PATH_CACHE_PREFIX = 'catalogo:path:';

/**
 * TTL del catálogo público en Redis (25 h). No es el mecanismo de refresco: los cambios de
 * precio/stock los aplica CatalogosCacheService (ver README-CACHE-CATALOGOS.md). La TTL solo
 * es red de seguridad y debe superar al intervalo máximo de p_inv_catalogo_refresco_min (12 h).
 */
export const CATALOGO_PATH_CACHE_TTL_SEG = 25 * 60 * 60;

export function catalogoPathCacheKey(path: string, ideEmpr: number) {
    return `${CATALOGO_PATH_CACHE_PREFIX}${path}:${ideEmpr}`;
}

@Injectable()
export class CatalogosService extends BaseService {
    private readonly logger = new Logger(CatalogosService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        @Inject('REDIS_CLIENT') private readonly redis: Redis,
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
        const ideEmpr = dtoIn.ideEmpr && dtoIn.ideEmpr > 0 ? dtoIn.ideEmpr : 0;
        const cacheKey = `catalogo:lista:${ideEmpr}`;

        try {
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
        } catch (err) {
            this.logger.warn(`Redis get failed for ${cacheKey}`, err);
        }

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
        const result = await this.dataSource.createQuery(query);

        try {
            await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 300);
        } catch (err) {
            this.logger.warn(`Redis set failed for ${cacheKey}`, err);
        }

        return result;
    }

    /**
     * Buscador avanzado (público): devuelve los catálogos activos cuyo nombre/descripción
     * coincide con la búsqueda O que contienen algún producto que coincide (nombre, otro
     * nombre, código, descripción corta o tags). Cada palabra de la búsqueda debe aparecer
     * (AND), sin distinguir mayúsculas ni tildes. Los productos considerados son los mismos
     * que ve el público en getCatalogoByPath (activos y con stock o publicados sin stock).
     * Misma estructura plana que getListaCatalogos + `coincidencias` y `productos_coincidentes`.
     */
    async buscarCatalogos(dtoIn: BuscarCatalogosDto) {
        const ideEmpr = dtoIn.ideEmpr && dtoIn.ideEmpr > 0 ? dtoIn.ideEmpr : 0;
        const tokens = Array.from(new Set(
            (dtoIn.q || '')
                .normalize('NFD')
                .replace(/[̀-ͯ]/g, '')
                .toLowerCase()
                .split(/\s+/)
                .filter((t) => t.length > 0),
        )).slice(0, 5);
        if (tokens.length === 0 || tokens.join('').length < 2) return [];

        const cacheKey = `catalogo:buscar:${ideEmpr}:${tokens.join('|')}`;
        try {
            const cached = await this.redis.get(cacheKey);
            if (cached) return JSON.parse(cached);
        } catch (err) {
            this.logger.warn(`Redis get failed for ${cacheKey}`, err);
        }

        // Sin depender de la extensión unaccent: se quitan tildes con translate().
        const norm = (expr: string) =>
            `translate(lower(${expr}), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')`;
        const catText = norm(`concat_ws(' ', c.nombre_inccat, c.desc_corta_inccat, c.descripcion_inccat)`);
        const prodText = norm(
            `concat_ws(' ', a.nombre_inarti, a.otro_nombre_inarti, a.codigo_inarti, a.desc_corta_inarti, a.notas_inarti)`,
        );
        const catMatch = tokens.map((_, i) => `${catText} LIKE $${i + 1}`).join(' AND ');
        const prodMatch = tokens.map((_, i) => `${prodText} LIKE $${i + 1}`).join(' AND ');

        const conditions: string[] = ['c.estado_inccat = true'];
        if (ideEmpr > 0) {
            conditions.push(`c.ide_empr = ${ideEmpr}`);
        }

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
                c.usuario_actua    AS usuario_modi,
                COALESCE(m.total, 0)            AS coincidencias,
                COALESCE(m.nombres, ARRAY[]::text[]) AS productos_coincidentes,
                (${catMatch})                   AS coincide_catalogo
            FROM inv_cab_catalogo c
            LEFT JOIN LATERAL (
                SELECT
                    COUNT(*)::int AS total,
                    (array_agg(a.nombre_inarti::text ORDER BY d.orden_indcat, a.nombre_inarti))[1:4] AS nombres
                FROM inv_det_catalogo d
                INNER JOIN inv_articulo a ON a.ide_inarti = d.ide_inarti
                WHERE d.ide_inccat = c.ide_inccat
                  AND d.activo_indcat = true
                  AND a.activo_inarti = true
                  AND (
                      d.publica_sin_stock_indcat = true
                      OR COALESCE((
                          SELECT SUM(dci.cantidad_indci * tci.signo_intci)
                          FROM inv_det_comp_inve dci
                          INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                          INNER JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                          INNER JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                          WHERE dci.ide_inarti = d.ide_inarti
                            AND cci.ide_empr = c.ide_empr
                            AND cci.ide_inepi = 1
                      ), 0) > 0
                  )
                  AND ${prodMatch}
            ) m ON true
            WHERE ${conditions.join(' AND ')}
              AND ((${catMatch}) OR COALESCE(m.total, 0) > 0)
            ORDER BY (${catMatch}) DESC, COALESCE(m.total, 0) DESC, c.orden_inccat, c.nombre_inccat
        `);
        tokens.forEach((tok, i) => {
            const escaped = tok.replace(/[\\%_]/g, (ch) => `\\${ch}`);
            query.addParam(i + 1, `%${escaped}%`);
        });

        const rows = await this.dataSource.createSelectQuery(query);

        try {
            await this.redis.set(cacheKey, JSON.stringify(rows), 'EX', 120);
        } catch (err) {
            this.logger.warn(`Redis set failed for ${cacheKey}`, err);
        }

        return rows;
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
        const ideEmpr = dtoIn.ideEmpr && dtoIn.ideEmpr > 0 ? dtoIn.ideEmpr : 0;
        const cacheKey = catalogoPathCacheKey(dtoIn.path, ideEmpr);

        try {
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                this.dataSource.pool.query(
                    `UPDATE inv_cab_catalogo SET vistas_inccat = COALESCE(vistas_inccat, 0) + 1 WHERE path_inccat = $1`,
                    [dtoIn.path],
                ).catch(() => {});
                return JSON.parse(cached);
            }
        } catch (err) {
            this.logger.warn(`Redis get failed for ${cacheKey}`, err);
        }

        const result = await this.fetchCatalogoByPath(dtoIn.path, ideEmpr, true);
        if (result) {
            this.dataSource.pool.query(
                `UPDATE inv_cab_catalogo SET vistas_inccat = COALESCE(vistas_inccat, 0) + 1 WHERE path_inccat = $1`,
                [dtoIn.path],
            ).catch(() => {});

            try {
                await this.redis.set(cacheKey, JSON.stringify(result), 'EX', CATALOGO_PATH_CACHE_TTL_SEG);
            } catch (err) {
                this.logger.warn(`Redis set failed for ${cacheKey}`, err);
            }
        }

        return result;
    }

    async getCatalogoByPathAuth(dtoIn: GetCatalogoByPathDto & HeaderParamsDto) {
        return this.fetchCatalogoByPath(dtoIn.path, dtoIn.ideEmpr, false);
    }

    /**
     * Arma la versión pública de un catálogo (la misma que cachea getCatalogoByPath), sin
     * leer ni escribir caché ni sumar vistas. La usa CatalogosCacheService para recalcular
     * y reemplazar la entrada en Redis.
     */
    async construirCatalogoPublico(path: string, ideEmpr: number) {
        return this.fetchCatalogoByPath(path, ideEmpr, true);
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
                            COALESCE(pv.precio_venta_sin_iva, 0) AS precio_fijo,
                            TRUE AS incluye_iva,
                            COALESCE(ROUND(cdc.cantidad_incdc * pv.precio_venta_con_iva, 2), 0) AS precio_final,
                            fp.nombre_cndfp,
                            cfp.nombre_cncfp
                        FROM inv_cant_det_catalogo cdc
                        -- Misma regla de precio que proformas/POS: f_calcula_precio_venta resuelve
                        -- precio fijo o % de utilidad sobre el costo PPMP. Solo se toman columnas de
                        -- precio de venta: costo y utilidad no deben salir en el catálogo público.
                        -- Casts explícitos: ide_inarti es bigint y la firma espera int.
                        -- La función lanza excepción con cantidad <= 0 (abortaría todo el catálogo):
                        -- se invoca en el target list tras el WHERE, que sí evita la llamada.
                        LEFT JOIN LATERAL (
                            SELECT (x.r).precio_venta_sin_iva, (x.r).precio_venta_con_iva, (x.r).forma_pago_config
                            FROM (
                                SELECT f_calcula_precio_venta(
                                    d.ide_inarti::int,
                                    cdc.cantidad_incdc::numeric,
                                    NULL::int,
                                    NULL::numeric,
                                    ${ideEmpr}::bigint,
                                    NULL::bigint
                                ) AS r
                                WHERE cdc.cantidad_incdc > 0
                            ) x
                        ) pv ON true
                        LEFT JOIN con_deta_forma_pago fp ON pv.forma_pago_config = fp.ide_cndfp
                        LEFT JOIN con_cabece_forma_pago cfp ON fp.ide_cncfp = cfp.ide_cncfp
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
                            COALESCE(pv.precio_venta_sin_iva, 0) AS precio_fijo,
                            TRUE AS incluye_iva,
                            COALESCE(ROUND(cdc.cantidad_incdc * pv.precio_venta_con_iva, 2), 0) AS precio_final,
                            fp.nombre_cndfp,
                            cfp.nombre_cncfp
                        FROM inv_cant_det_catalogo cdc
                        -- Misma regla de precio que proformas/POS: f_calcula_precio_venta resuelve
                        -- precio fijo o % de utilidad sobre el costo PPMP. Solo se toman columnas de
                        -- precio de venta: costo y utilidad no deben salir en el catálogo público.
                        -- Casts explícitos: ide_inarti es bigint y la firma espera int.
                        -- La función lanza excepción con cantidad <= 0 (abortaría todo el catálogo):
                        -- se invoca en el target list tras el WHERE, que sí evita la llamada.
                        LEFT JOIN LATERAL (
                            SELECT (x.r).precio_venta_sin_iva, (x.r).precio_venta_con_iva, (x.r).forma_pago_config
                            FROM (
                                SELECT f_calcula_precio_venta(
                                    d.ide_inarti::int,
                                    cdc.cantidad_incdc::numeric,
                                    NULL::int,
                                    NULL::numeric,
                                    ${ideEmpr}::bigint,
                                    NULL::bigint
                                ) AS r
                                WHERE cdc.cantidad_incdc > 0
                            ) x
                        ) pv ON true
                        LEFT JOIN con_deta_forma_pago fp ON pv.forma_pago_config = fp.ide_cndfp
                        LEFT JOIN con_cabece_forma_pago cfp ON fp.ide_cncfp = cfp.ide_cncfp
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
        const cacheKey = `catalogo:tags:${dtoIn.ide_inccat}`;

        try {
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
        } catch (err) {
            this.logger.warn(`Redis get failed for ${cacheKey}`, err);
        }

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
        const result = await this.dataSource.createSelectQuery(query);

        try {
            await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 300);
        } catch (err) {
            this.logger.warn(`Redis set failed for ${cacheKey}`, err);
        }

        return result;
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
