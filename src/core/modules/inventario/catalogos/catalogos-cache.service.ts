import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Redis } from 'ioredis';

import { DataSourceService } from '../../../connection/datasource.service';
import { CoreService } from '../../../core.service';

import {
    CATALOGO_PATH_CACHE_PREFIX,
    CATALOGO_PATH_CACHE_TTL_SEG,
    CatalogosService,
    catalogoPathCacheKey,
} from './catalogos.service';

/** Variable del sistema con el intervalo de refresco, en minutos. */
const PARAM_INTERVALO = 'p_inv_catalogo_refresco_min';
const INTERVALO_DEFAULT_MIN = 30;
const INTERVALO_MIN_MIN = 1;
const INTERVALO_MAX_MIN = 720;
const RELECTURA_INTERVALO_MS = 5 * 60_000;

/** Filas de inv_catalogo_pendiente procesadas por vuelta. */
const LOTE_PENDIENTES = 5000;

/** Caché del bot de WhatsApp (BotProformaService.obtenerCatalogosDisponibles): incluye stock y precio. */
const BOT_CACHE_PATTERN = 'catalogo:bot:productos:*';

/** Código de PostgreSQL para "la tabla no existe" (script SQL aún no ejecutado). */
const PG_UNDEFINED_TABLE = '42P01';

export interface ResultadoRefrescoCatalogos {
    origen: string;
    modo: 'pendientes' | 'todo';
    pendientes: number;
    catalogos: number;
    errores: number;
    duracionMs: number;
}

interface CatalogoAfectado {
    path: string;
    ideEmpr: number;
}

/**
 * Mantiene al día, en Redis, la versión pública de los catálogos (la que lee el portal web
 * vía getCatalogoByPath) cuando cambian el precio (fijo o por %), el stock o los datos de
 * sus productos. Detalle completo: README-CACHE-CATALOGOS.md en esta carpeta.
 *
 * - Los cambios los anota en inv_catalogo_pendiente un trigger de la BD (cubre ERP y sigafi).
 * - Cada p_inv_catalogo_refresco_min minutos lee esa tabla con el pool normal, recalcula
 *   solo los catálogos afectados y REEMPLAZA su clave (el portal nunca encuentra la caché
 *   vacía). Borra las filas procesadas solo si el recálculo salió bien.
 * - Al arrancar y cada día a las 00:05 recalcula todo (cubre el cambio de IVA por fecha).
 *
 * Nest corre en una sola instancia (PM2 fork): la exclusión mutua es en memoria.
 */
@Injectable()
export class CatalogosCacheService implements OnApplicationBootstrap {
    private readonly logger = new Logger(CatalogosCacheService.name);

    /** Ejecución en curso: evita dos refrescos simultáneos (tick, manual, diario). */
    private ejecucion: Promise<ResultadoRefrescoCatalogos> | null = null;

    /** Momento de la última revisión de pendientes; el tick la compara con el intervalo. */
    private ultimaRevision = Date.now();

    /** Evita repetir en cada tick la advertencia de tabla inexistente. */
    private avisoTablaFaltante = false;

    /** Último valor leído de p_inv_catalogo_refresco_min. */
    private intervaloCache: { valor: number; leidoEn: number } | null = null;

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly catalogos: CatalogosService,
        @Inject('REDIS_CLIENT') private readonly redis: Redis,
    ) { }

    onApplicationBootstrap(): void {
        // En segundo plano: no retrasa el arranque de la API.
        this.refrescarTodo('arranque').catch((err) =>
            this.logger.error(`Refresco al arrancar falló: ${(err as Error).message}`),
        );
    }

    // ─────────────────────────────────────────────────────────────
    // PROGRAMACIÓN
    // ─────────────────────────────────────────────────────────────

    /**
     * Tick de 1 minuto que solo compara tiempos en memoria; consulta la BD únicamente cuando
     * se cumple el intervalo configurado. Así el intervalo se puede cambiar desde las
     * variables del sistema sin reiniciar la API.
     */
    @Cron(CronExpression.EVERY_MINUTE, { name: 'catalogos-cache-tick' })
    async tick(): Promise<void> {
        if (this.ejecucion) return;
        const intervaloMs = (await this.getIntervaloMinutos()) * 60_000;
        if (Date.now() - this.ultimaRevision < intervaloMs) return;
        await this.procesarPendientes('programado').catch((err) =>
            this.logger.error(`Refresco programado falló: ${(err as Error).message}`),
        );
    }

    /** Recalcula todo cada día: el IVA vigente cambia por fecha, sin ningún registro que lo anote. */
    @Cron('0 5 0 * * *', { name: 'catalogos-cache-diario' })
    async diario(): Promise<void> {
        await this.refrescarTodo('diario').catch((err) =>
            this.logger.error(`Refresco diario falló: ${(err as Error).message}`),
        );
    }

    // ─────────────────────────────────────────────────────────────
    // API PÚBLICA
    // ─────────────────────────────────────────────────────────────

    /** Refresca solo los catálogos que contienen productos anotados en inv_catalogo_pendiente. */
    procesarPendientes(origen: string): Promise<ResultadoRefrescoCatalogos> {
        return this.ejecutarUnico(() => this.procesarPendientesInterno(origen));
    }

    /** Recalcula todos los catálogos que estén en caché y descarta los pendientes leídos. */
    refrescarTodo(origen: string): Promise<ResultadoRefrescoCatalogos> {
        return this.ejecutarUnico(() => this.refrescarTodoInterno(origen));
    }

    // ─────────────────────────────────────────────────────────────
    // IMPLEMENTACIÓN
    // ─────────────────────────────────────────────────────────────

    private ejecutarUnico(fn: () => Promise<ResultadoRefrescoCatalogos>) {
        // Si ya hay un refresco en curso, quien llega espera ese mismo resultado.
        if (this.ejecucion) return this.ejecucion;
        this.ejecucion = fn().finally(() => {
            this.ejecucion = null;
            this.ultimaRevision = Date.now();
        });
        return this.ejecucion;
    }

    private async procesarPendientesInterno(origen: string): Promise<ResultadoRefrescoCatalogos> {
        const inicio = Date.now();
        let pendientes = 0;
        let catalogos = 0;
        let errores = 0;

        for (;;) {
            const filas = await this.leerPendientes(LOTE_PENDIENTES);
            if (!filas || filas.length === 0) break;
            pendientes += filas.length;

            const articulos = [...new Set<number>(filas.map((f) => Number(f.ide_inarti)))];
            const afectados = await this.getCatalogosDeArticulos(articulos);
            const res = await this.refrescarCatalogos(afectados);
            catalogos += res.catalogos;
            errores += res.errores;

            // Si algo falló se conservan las filas: se reintenta en la próxima vuelta y
            // mientras tanto el portal sigue sirviendo la versión anterior.
            if (res.errores > 0) break;

            await this.invalidarCacheBot();
            await this.borrarPendientes(filas.map((f) => f.ide_incpe));
            if (filas.length < LOTE_PENDIENTES) break;
        }

        const resultado = this.resultado(origen, 'pendientes', pendientes, catalogos, errores, inicio);
        if (pendientes > 0 || errores > 0) this.logResultado(resultado);
        return resultado;
    }

    private async refrescarTodoInterno(origen: string): Promise<ResultadoRefrescoCatalogos> {
        const inicio = Date.now();

        // Se leen los ids ANTES de recalcular y se borran solo esos: una fila que se
        // confirme durante el recálculo queda para la próxima vuelta (no se pierde).
        const filas = (await this.leerPendientes(null)) ?? [];

        let catalogos = 0;
        let errores = 0;
        for (const key of await this.scanKeys(`${CATALOGO_PATH_CACHE_PREFIX}*`)) {
            const afectado = this.parseClavePath(key);
            if (!afectado) continue;
            const ok = await this.recalcularClave(key, afectado.path, afectado.ideEmpr);
            if (ok) catalogos++;
            else errores++;
        }

        await this.invalidarCacheBot();
        if (errores === 0 && filas.length > 0) {
            await this.borrarPendientes(filas.map((f) => f.ide_incpe));
        }

        const resultado = this.resultado(origen, 'todo', filas.length, catalogos, errores, inicio);
        this.logResultado(resultado);
        return resultado;
    }

    /** Recalcula las variantes en caché de cada catálogo (con y sin ideEmpr en la clave). */
    private async refrescarCatalogos(afectados: CatalogoAfectado[]) {
        let catalogos = 0;
        let errores = 0;
        for (const { path, ideEmpr } of afectados) {
            const variantes = [...new Set([0, ideEmpr])];
            for (const variante of variantes) {
                const key = catalogoPathCacheKey(path, variante);
                // Solo se recalcula lo que ya está en caché; lo demás se arma en la primera
                // petición del portal, ya con los datos nuevos.
                if (!(await this.redis.exists(key))) continue;
                if (await this.recalcularClave(key, path, variante)) catalogos++;
                else errores++;
            }
        }
        return { catalogos, errores };
    }

    /** Reemplaza la clave con la versión recién calculada (o la borra si el catálogo ya no es público). */
    private async recalcularClave(key: string, path: string, ideEmpr: number): Promise<boolean> {
        try {
            const data = await this.catalogos.construirCatalogoPublico(path, ideEmpr);
            if (data) {
                await this.redis.set(key, JSON.stringify(data), 'EX', CATALOGO_PATH_CACHE_TTL_SEG);
            } else {
                await this.redis.del(key);
            }
            return true;
        } catch (err) {
            this.logger.error(`No se pudo recalcular ${key}: ${(err as Error).message}`);
            return false;
        }
    }

    private async getCatalogosDeArticulos(articulos: number[]): Promise<CatalogoAfectado[]> {
        const { rows } = await this.dataSource.pool.query<{ path_inccat: string; ide_empr: number }>(
            `SELECT DISTINCT c.path_inccat, c.ide_empr
             FROM inv_det_catalogo d
             INNER JOIN inv_cab_catalogo c ON c.ide_inccat = d.ide_inccat
             WHERE d.ide_inarti = ANY($1::bigint[])
               AND c.path_inccat IS NOT NULL`,
            [articulos],
        );
        return rows.map((r) => ({ path: r.path_inccat, ideEmpr: Number(r.ide_empr) }));
    }

    /**
     * Lee filas de inv_catalogo_pendiente (limit null = todas). Devuelve null si la tabla
     * todavía no existe (script SQL sin ejecutar): el refresco completo sigue funcionando.
     */
    private async leerPendientes(limit: number | null) {
        try {
            const { rows } = await this.dataSource.pool.query<{ ide_incpe: number; ide_inarti: number }>(
                `SELECT ide_incpe, ide_inarti
                 FROM inv_catalogo_pendiente
                 ORDER BY ide_incpe
                 ${limit ? 'LIMIT $1' : ''}`,
                limit ? [limit] : [],
            );
            this.avisoTablaFaltante = false;
            return rows;
        } catch (err) {
            if ((err as { code?: string }).code === PG_UNDEFINED_TABLE) {
                if (!this.avisoTablaFaltante) {
                    this.logger.warn(
                        'No existe inv_catalogo_pendiente: ejecute scripts/core/modules/inventario/catalogos/catalogo-cache-pendiente.sql',
                    );
                    this.avisoTablaFaltante = true;
                }
                return null;
            }
            throw err;
        }
    }

    private async borrarPendientes(ids: number[]) {
        if (ids.length === 0) return;
        await this.dataSource.pool.query(
            `DELETE FROM inv_catalogo_pendiente WHERE ide_incpe = ANY($1::bigint[])`,
            [ids],
        );
    }

    /** La caché del bot se arma de forma diferida (lazy): basta con borrarla. */
    private async invalidarCacheBot() {
        try {
            const keys = await this.scanKeys(BOT_CACHE_PATTERN);
            if (keys.length > 0) await this.redis.del(...keys);
        } catch (err) {
            this.logger.warn(`No se pudo invalidar la caché del bot: ${(err as Error).message}`);
        }
    }

    /** SCAN en lugar de KEYS: no bloquea Redis. */
    private async scanKeys(pattern: string): Promise<string[]> {
        const keys: string[] = [];
        let cursor = '0';
        do {
            const [next, batch] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
            cursor = next;
            keys.push(...batch);
        } while (cursor !== '0');
        return [...new Set(keys)];
    }

    /** `catalogo:path:<path>:<ideEmpr>` → { path, ideEmpr }. El path podría contener ':'. */
    private parseClavePath(key: string): CatalogoAfectado | null {
        const resto = key.slice(CATALOGO_PATH_CACHE_PREFIX.length);
        const sep = resto.lastIndexOf(':');
        if (sep <= 0) return null;
        const ideEmpr = Number(resto.slice(sep + 1));
        if (!Number.isFinite(ideEmpr)) return null;
        return { path: resto.slice(0, sep), ideEmpr };
    }

    /**
     * Intervalo configurado, releído como máximo cada 5 min: un cambio de la variable se
     * aplica sin reiniciar, y si la variable aún no existe no se consulta ni se loguea el
     * error en cada tick.
     */
    private async getIntervaloMinutos(): Promise<number> {
        if (this.intervaloCache && Date.now() - this.intervaloCache.leidoEn < RELECTURA_INTERVALO_MS) {
            return this.intervaloCache.valor;
        }
        let valor = INTERVALO_DEFAULT_MIN;
        try {
            const vars = await this.core.getVariables([PARAM_INTERVALO]);
            const leido = Number.parseInt(vars.get(PARAM_INTERVALO) ?? '', 10);
            if (Number.isFinite(leido)) {
                valor = Math.min(Math.max(leido, INTERVALO_MIN_MIN), INTERVALO_MAX_MIN);
            }
        } catch {
            // Variable sin crear: se usa el default (ver README, sección 4).
        }
        this.intervaloCache = { valor, leidoEn: Date.now() };
        return valor;
    }

    private resultado(
        origen: string,
        modo: ResultadoRefrescoCatalogos['modo'],
        pendientes: number,
        catalogos: number,
        errores: number,
        inicio: number,
    ): ResultadoRefrescoCatalogos {
        return { origen, modo, pendientes, catalogos, errores, duracionMs: Date.now() - inicio };
    }

    private logResultado(r: ResultadoRefrescoCatalogos) {
        const msg = `[${r.origen}] modo=${r.modo} pendientes=${r.pendientes} catalogos=${r.catalogos} errores=${r.errores} ${r.duracionMs}ms`;
        if (r.errores > 0) this.logger.warn(msg);
        else this.logger.log(msg);
    }
}
