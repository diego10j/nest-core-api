import { Injectable, Logger } from '@nestjs/common';

import { BaseService } from '../../../../common/base-service';
import { HeaderParamsDto } from '../../../../common/dto/common-params.dto';
import { QueryOptionsDto } from '../../../../common/dto/query-options.dto';
import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery } from '../../../connection/helpers/select-query';
import { CoreService } from '../../../core.service';

import { IdFormaDto } from './dto/id-forma.dto';
import { IdMenudeoDto } from './dto/id-menudeo.dto';
import { IdPresentacionDto } from './dto/id-presentacion.dto';
import { IdProductoMenudeoDto } from './dto/id-producto-menudeo.dto';
import { IdTipoCompDto } from './dto/id-tipo-comp.dto';
import { TrnMenudeoDto } from './dto/trn-menudeo.dto';

@Injectable()
export class MenudeoService extends BaseService {
    private readonly logger = new Logger(MenudeoService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        this.core
            .getVariables([
                'p_inv_estado_normal',  // estado activo inventario
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    // ─────────────────────────────────────────────────────────────
    // TIPOS DE COMPROBANTE / TRANSACCIÓN MENUDEO
    // ─────────────────────────────────────────────────────────────

    /**
     * Retorna los tipos de comprobante de menudeo (Ingreso/Egreso con signo)
     */
    async getTipoCompMenudeo(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT
                tc.ide_inmtc,
                tc.nombre_inmtc,
                tc.signo_inmtc,
                tc.activo_inmtc,
                (
                    SELECT COUNT(1)
                    FROM inv_men_tipo_tran tt
                    WHERE tt.ide_inmtc = tc.ide_inmtc
                )                            AS total_tipos_tran,
                tc.usuario_ingre,
                tc.fecha_ingre,
                tc.hora_ingre,
                tc.usuario_actua,
                tc.fecha_actua,
                tc.hora_actua
            FROM inv_men_tipo_comp tc
            WHERE tc.ide_empr = ${dtoIn.ideEmpr}
            ORDER BY tc.signo_inmtc DESC, tc.nombre_inmtc
            `,
            dtoIn,
        );
        return this.dataSource.createQuery(query);
    }

    /**
     * Retorna todos los tipos de transacción de menudeo de la empresa
     */
    async getTipoTranMenudeo(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT
                tt.ide_inmtt,
                tt.ide_inmtc,
                tc.nombre_inmtc,
                tc.signo_inmtc,
                tt.ide_intti,
                tti.nombre_intti,
                tt.nombre_inmtt,
                tt.sigla_inmtt,
                tt.genera_egreso_base_inmtt,
                tt.genera_egreso_insumo_inmtt,
                tt.activo_inmtt,
                tt.usuario_ingre,
                tt.fecha_ingre,
                tt.hora_ingre,
                tt.usuario_actua,
                tt.fecha_actua,
                tt.hora_actua
            FROM inv_men_tipo_tran tt
            INNER JOIN inv_men_tipo_comp  tc  ON tc.ide_inmtc = tt.ide_inmtc
            LEFT  JOIN inv_tip_tran_inve  tti ON tti.ide_intti = tt.ide_intti
            WHERE tt.ide_empr = ${dtoIn.ideEmpr}
            ORDER BY tc.signo_inmtc DESC, tt.nombre_inmtt
            `,
            dtoIn,
        );
        return this.dataSource.createQuery(query);
    }

    /**
     * Retorna los tipos de transacción de un tipo de comprobante específico
     */
    async getTipoTranByTipoComp(dtoIn: IdTipoCompDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT
                tt.ide_inmtt,
                tt.nombre_inmtt,
                tt.sigla_inmtt,
                tc.signo_inmtc,
                tt.genera_egreso_base_inmtt,
                tt.genera_egreso_insumo_inmtt,
                tt.activo_inmtt
            FROM inv_men_tipo_tran tt
            INNER JOIN inv_men_tipo_comp tc ON tc.ide_inmtc = tt.ide_inmtc
            WHERE tt.ide_inmtc = $1
              AND tt.ide_empr  = ${dtoIn.ideEmpr}
            ORDER BY tt.nombre_inmtt
            `,
            dtoIn,
        );
        query.addIntParam(1, dtoIn.ide_inmtc);
        return this.dataSource.createQuery(query);
    }

    // ─────────────────────────────────────────────────────────────
    // FORMAS DE MENUDEO (CATÁLOGO MAESTRO)
    // ─────────────────────────────────────────────────────────────

    /**
     * Retorna todas las formas de menudeo del catálogo maestro de la empresa
     */
    async getFormas(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT
                f.ide_inmfor,
                f.nombre_inmfor,
                f.cant_base_inmfor,
                f.descripcion_inmfor,
                f.activo_inmfor,
                u.nombre_inuni,
                u.siglas_inuni,
                (
                    SELECT COUNT(1)
                    FROM inv_men_presentacion p
                    WHERE p.ide_inmfor = f.ide_inmfor
                )                            AS total_productos_asignados,
                f.usuario_ingre,
                f.fecha_ingre,
                f.hora_ingre,
                f.usuario_actua,
                f.fecha_actua,
                f.hora_actua
            FROM inv_men_forma f
            LEFT JOIN inv_unidad u ON u.ide_inuni = f.ide_inuni
            WHERE f.ide_empr = ${dtoIn.ideEmpr}
            ORDER BY f.nombre_inmfor
            `,
            dtoIn,
        );
        return this.dataSource.createQuery(query);
    }

    /**
     * Retorna los insumos/envases configurados para una forma de menudeo
     */
    async getInsumosForma(dtoIn: IdFormaDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT
                fi.ide_inmfin,
                fi.ide_inmfor,
                fi.ide_inarti,
                a.nombre_inarti      AS nombre_insumo,
                a.codigo_inarti      AS codigo_insumo,
                u.siglas_inuni,
                fi.cantidad_inmfin,
                fi.observacion_inmfin,
                fi.usuario_ingre,
                fi.fecha_ingre,
                fi.hora_ingre,
                fi.usuario_actua,
                fi.fecha_actua,
                fi.hora_actua
            FROM inv_men_forma_insumo fi
            INNER JOIN inv_articulo a ON a.ide_inarti = fi.ide_inarti
            LEFT  JOIN inv_unidad  u ON u.ide_inuni  = a.ide_inuni
            WHERE fi.ide_inmfor = $1
            ORDER BY a.nombre_inarti
            `,
            dtoIn,
        );
        query.addIntParam(1, dtoIn.ide_inmfor);
        return this.dataSource.createQuery(query);
    }

    // ─────────────────────────────────────────────────────────────
    // PRESENTACIONES (VÍNCULO PRODUCTO ↔ FORMA)
    // ─────────────────────────────────────────────────────────────

    /**
     * Retorna todas las presentaciones (formas asignadas) de un producto base
     */
    async getPresentacionesProducto(dtoIn: IdProductoMenudeoDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT
                p.ide_inmpre,
                p.ide_inarti,
                p.ide_inmfor,
                f.nombre_inmfor,
                COALESCE(p.cant_base_inmpre, f.cant_base_inmfor) AS cant_base_efectiva,
                p.cant_base_inmpre,
                f.cant_base_inmfor       AS cant_base_forma,
                u.nombre_inuni           AS nombre_unidad_forma,
                u.siglas_inuni           AS siglas_unidad_forma,
                ub.siglas_inuni          AS siglas_unidad_base,
                p.observacion_inmpre,
                p.activo_inmpre,
                p.usuario_ingre,
                p.fecha_ingre,
                p.hora_ingre,
                p.usuario_actua,
                p.fecha_actua,
                p.hora_actua,
                stock_minimo_inmpre,
                stock_ideal_inmpre
            FROM inv_men_presentacion p
            INNER JOIN inv_men_forma f   ON f.ide_inmfor = p.ide_inmfor
            INNER JOIN inv_articulo  a   ON a.ide_inarti = p.ide_inarti
            LEFT  JOIN inv_unidad    u   ON u.ide_inuni  = f.ide_inuni
            LEFT  JOIN inv_unidad    ub  ON ub.ide_inuni = a.ide_inuni
            WHERE p.ide_inarti = $1
              AND p.ide_empr   = ${dtoIn.ideEmpr}
            ORDER BY f.nombre_inmfor
            `,
            dtoIn,
        );
        query.addIntParam(1, dtoIn.ide_inarti);
        return this.dataSource.createQuery(query);
    }

    /**
     * Retorna las formas de menudeo que AÚN NO están asignadas a un producto
     */
    async getFormasDisponiblesProducto(dtoIn: IdProductoMenudeoDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT
                f.ide_inmfor,
                f.nombre_inmfor,
                f.cant_base_inmfor,
                u.siglas_inuni
            FROM inv_men_forma f
            LEFT JOIN inv_unidad u ON u.ide_inuni = f.ide_inuni
            WHERE f.ide_empr       = ${dtoIn.ideEmpr}
              AND f.activo_inmfor   = true
              AND NOT EXISTS (
                  SELECT 1 FROM inv_men_presentacion p
                  WHERE p.ide_inmfor = f.ide_inmfor
                    AND p.ide_inarti = $1
              )
            ORDER BY f.nombre_inmfor
            `,
            dtoIn,
        );
        query.addIntParam(1, dtoIn.ide_inarti);
        return this.dataSource.createQuery(query);
    }

    // ─────────────────────────────────────────────────────────────
    // STOCK DE MENUDEO
    // ─────────────────────────────────────────────────────────────

    /**
     * Retorna alertas de stock de menudeo: presentaciones cuyo saldo actual
     * está por debajo del stock_minimo_inmpre configurado.
     * Incluye nivel de alerta: CRITICO (saldo=0), BAJO (saldo < minimo), IDEAL (saldo < ideal)
     */
    async getAlertasStockMenudeo(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            WITH saldos AS (
                SELECT
                    p.ide_inmpre,
                    p.ide_inarti,
                    p.ide_inmfor,
                    p.stock_minimo_inmpre,
                    p.stock_ideal_inmpre,
                    COALESCE(
                        f_redondeo(SUM(d.cantidad_indmen * tc.signo_inmtc), 2), 0
                    ) AS saldo_actual
                FROM inv_men_presentacion p
                LEFT JOIN inv_det_menudeo   d  ON d.ide_inmpre  = p.ide_inmpre
                LEFT JOIN inv_cab_menudeo   c  ON c.ide_incmen  = d.ide_incmen
                                              AND c.estado_incmen = 1
                LEFT JOIN inv_men_tipo_tran tt ON tt.ide_inmtt   = c.ide_inmtt
                LEFT JOIN inv_men_tipo_comp tc ON tc.ide_inmtc   = tt.ide_inmtc
                WHERE p.ide_empr       = ${dtoIn.ideEmpr}
                  AND p.activo_inmpre  = true
                  AND p.stock_minimo_inmpre > 0
                GROUP BY
                    p.ide_inmpre, p.ide_inarti, p.ide_inmfor,
                    p.stock_minimo_inmpre, p.stock_ideal_inmpre
            )
            SELECT
                s.ide_inmpre,
                s.ide_inarti,
                a.codigo_inarti,
                a.nombre_inarti,
                s.ide_inmfor,
                f.nombre_inmfor,
                uf.siglas_inuni          AS siglas_forma,
                ub.siglas_inuni          AS siglas_base,
                s.saldo_actual,
                s.stock_minimo_inmpre,
                s.stock_ideal_inmpre,
                s.stock_ideal_inmpre - s.saldo_actual AS cantidad_a_producir,
                CASE
                    WHEN s.saldo_actual <= 0                            THEN 'CRITICO'
                    WHEN s.saldo_actual <  s.stock_minimo_inmpre        THEN 'BAJO'
                    WHEN s.stock_ideal_inmpre > 0
                     AND s.saldo_actual <  s.stock_ideal_inmpre         THEN 'IDEAL'
                    ELSE NULL
                END                      AS nivel_alerta
            FROM saldos s
            INNER JOIN inv_articulo a  ON a.ide_inarti = s.ide_inarti
            INNER JOIN inv_men_forma f ON f.ide_inmfor  = s.ide_inmfor
            LEFT  JOIN inv_unidad   uf ON uf.ide_inuni  = f.ide_inuni
            LEFT  JOIN inv_unidad   ub ON ub.ide_inuni  = a.ide_inuni
            WHERE s.saldo_actual < s.stock_minimo_inmpre
               OR (s.stock_ideal_inmpre > 0 AND s.saldo_actual < s.stock_ideal_inmpre)
            ORDER BY
                CASE
                    WHEN s.saldo_actual <= 0                     THEN 1
                    WHEN s.saldo_actual < s.stock_minimo_inmpre  THEN 2
                    ELSE 3
                END,
                unaccent(a.nombre_inarti), f.nombre_inmfor
            `,
            dtoIn,
        );
        return this.dataSource.createQuery(query);
    }

    /**
     * Retorna el saldo actual de menudeo por cada presentación de un producto.
     * El saldo se calcula sumando los movimientos activos (signo del tipo_comp).
     */
    async getSaldosMenudeoProducto(dtoIn: IdProductoMenudeoDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT
                p.ide_inmpre,
                p.ide_inmfor,
                f.nombre_inmfor,
                COALESCE(p.cant_base_inmpre, f.cant_base_inmfor) AS cant_base_efectiva,
                u.siglas_inuni       AS siglas_forma,
                ub.siglas_inuni      AS siglas_base,
                COALESCE(
                    f_redondeo(
                        SUM(d.cantidad_indmen * tc.signo_inmtc),
                        2
                    ), 0
                )                    AS saldo_presentacion,
                COALESCE(
                    f_redondeo(
                        SUM(d.cant_base_indmen * tc.signo_inmtc),
                        6
                    ), 0
                )                    AS saldo_base_consumida,
                p.activo_inmpre
            FROM inv_men_presentacion p
            INNER JOIN inv_men_forma    f  ON f.ide_inmfor  = p.ide_inmfor
            LEFT JOIN inv_det_menudeo   d  ON d.ide_inmpre  = p.ide_inmpre
            LEFT JOIN inv_cab_menudeo   c  ON c.ide_incmen  = d.ide_incmen
                                          AND c.estado_incmen = 1
            LEFT JOIN inv_men_tipo_tran tt ON tt.ide_inmtt   = c.ide_inmtt
            LEFT JOIN inv_men_tipo_comp tc ON tc.ide_inmtc   = tt.ide_inmtc
            INNER JOIN inv_articulo     a  ON a.ide_inarti  = p.ide_inarti
            LEFT  JOIN inv_unidad       u  ON u.ide_inuni   = f.ide_inuni
            LEFT  JOIN inv_unidad       ub ON ub.ide_inuni  = a.ide_inuni
            WHERE p.ide_inarti = $1
              AND p.ide_empr   = ${dtoIn.ideEmpr}
            GROUP BY
                p.ide_inmpre, p.ide_inmfor, f.nombre_inmfor,
                p.cant_base_inmpre, f.cant_base_inmfor,
                u.siglas_inuni, ub.siglas_inuni, p.activo_inmpre
            ORDER BY f.nombre_inmfor
            `,
            dtoIn,
        );
        query.addIntParam(1, dtoIn.ide_inarti);
        return this.dataSource.createQuery(query);
    }

    /**
     * Retorna el saldo de menudeo de una presentación específica
     */
    async getSaldoMenudeo(dtoIn: IdPresentacionDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT
                p.ide_inmpre,
                f.nombre_inmfor,
                COALESCE(p.cant_base_inmpre, f.cant_base_inmfor) AS cant_base_efectiva,
                u.siglas_inuni AS siglas_forma,
                COALESCE(
                    f_redondeo(SUM(d.cantidad_indmen * tc.signo_inmtc), 2),
                    0
                ) AS saldo_presentacion,
                COALESCE(
                    f_redondeo(SUM(d.cant_base_indmen * tc.signo_inmtc), 6),
                    0
                ) AS saldo_base_consumida
            FROM inv_men_presentacion p
            INNER JOIN inv_men_forma  f  ON f.ide_inmfor  = p.ide_inmfor
            LEFT JOIN inv_det_menudeo d  ON d.ide_inmpre  = p.ide_inmpre
            LEFT JOIN inv_cab_menudeo c  ON c.ide_incmen  = d.ide_incmen
                                        AND c.estado_incmen = 1
            LEFT JOIN inv_men_tipo_tran tt ON tt.ide_inmtt = c.ide_inmtt
            LEFT JOIN inv_men_tipo_comp tc ON tc.ide_inmtc = tt.ide_inmtc
            LEFT JOIN inv_unidad      u  ON u.ide_inuni   = f.ide_inuni
            WHERE p.ide_inmpre = $1
            GROUP BY p.ide_inmpre, f.nombre_inmfor,
                     p.cant_base_inmpre, f.cant_base_inmfor, u.siglas_inuni
            `,
        );
        query.addIntParam(1, dtoIn.ide_inmpre);
        return this.dataSource.createSingleQuery(query);
    }

    // ─────────────────────────────────────────────────────────────
    // COMPROBANTES DE MENUDEO
    // ─────────────────────────────────────────────────────────────

    /**
     * Retorna el listado de comprobantes de menudeo de un producto en un rango de fechas
     */
    async getComprobantesMenudeo(dtoIn: TrnMenudeoDto & HeaderParamsDto) {
        const condPresentacion = dtoIn.ide_inmpre
            ? `AND EXISTS (
                SELECT 1 FROM inv_det_menudeo dx
                WHERE dx.ide_incmen = c.ide_incmen
                  AND dx.ide_inmpre = ${dtoIn.ide_inmpre}
               )`
            : '';

        const query = new SelectQuery(
            `
            SELECT
                c.ide_incmen,
                c.numero_incmen,
                c.fecha_incmen,
                tt.sigla_inmtt,
                tt.nombre_inmtt                 AS nombre_tipo,
                tc.signo_inmtc,
                tc.nombre_inmtc                 AS nombre_signo,
                c.observacion_incmen,
                c.estado_incmen,
                CASE c.estado_incmen
                    WHEN 1 THEN 'Activo'
                    WHEN 0 THEN 'Anulado'
                END                             AS nombre_estado,
                c.ide_incci,
                c.ide_cccfa,
                c.ide_incmen_ref,
                a.nombre_inarti,
                a.codigo_inarti,
                u.siglas_inuni                  AS siglas_base,
                (
                    SELECT SUM(d.cantidad_indmen)
                    FROM inv_det_menudeo d
                    WHERE d.ide_incmen = c.ide_incmen
                )                               AS total_unidades,
                (
                    SELECT SUM(d.cant_base_indmen)
                    FROM inv_det_menudeo d
                    WHERE d.ide_incmen = c.ide_incmen
                )                               AS total_base_consumida,
                c.usuario_ingre,
                c.fecha_ingre,
                c.hora_ingre,
                c.usuario_actua,
                c.fecha_actua,
                c.hora_actua
            FROM inv_cab_menudeo c
            INNER JOIN inv_men_tipo_tran tt ON tt.ide_inmtt = c.ide_inmtt
            INNER JOIN inv_men_tipo_comp tc ON tc.ide_inmtc = tt.ide_inmtc
            LEFT JOIN LATERAL (
                SELECT p.ide_inarti
                FROM inv_det_menudeo dl
                INNER JOIN inv_men_presentacion p ON p.ide_inmpre = dl.ide_inmpre
                WHERE dl.ide_incmen = c.ide_incmen
                LIMIT 1
            ) AS cab_art ON true
            INNER JOIN inv_articulo      a  ON a.ide_inarti = cab_art.ide_inarti
            LEFT  JOIN inv_unidad        u  ON u.ide_inuni  = a.ide_inuni
            WHERE cab_art.ide_inarti = $1
              AND c.ide_empr    = ${dtoIn.ideEmpr}
              AND c.fecha_incmen BETWEEN $2 AND $3
              ${condPresentacion}
            ORDER BY c.fecha_incmen DESC, c.ide_incmen DESC
            `,
            dtoIn,
        );
        query.addIntParam(1, dtoIn.ide_inarti);
        query.addParam(2, dtoIn.fechaInicio);
        query.addParam(3, dtoIn.fechaFin);
        return this.dataSource.createQuery(query);
    }

    /**
     * Retorna la cabecera de un comprobante de menudeo
     */
    async getCabMenudeo(dtoIn: IdMenudeoDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT
                c.ide_incmen,
                c.numero_incmen,
                c.fecha_incmen,
                c.ide_inmtt,
                tt.sigla_inmtt,
                tt.nombre_inmtt,
                tc.signo_inmtc,
                tc.nombre_inmtc                 AS nombre_signo,
                c.observacion_incmen,
                c.estado_incmen,
                c.ide_incci,
                c.ide_cccfa,
                c.ide_incmen_ref,
                cab_art.ide_inarti,
                a.nombre_inarti,
                a.codigo_inarti,
                u.siglas_inuni  AS siglas_base,
                c.usuario_ingre,
                c.fecha_ingre,
                c.hora_ingre,
                c.usuario_actua,
                c.fecha_actua,
                c.hora_actua
            FROM inv_cab_menudeo c
            INNER JOIN inv_men_tipo_tran tt ON tt.ide_inmtt = c.ide_inmtt
            INNER JOIN inv_men_tipo_comp tc ON tc.ide_inmtc = tt.ide_inmtc
            LEFT JOIN LATERAL (
                SELECT p.ide_inarti
                FROM inv_det_menudeo dl
                INNER JOIN inv_men_presentacion p ON p.ide_inmpre = dl.ide_inmpre
                WHERE dl.ide_incmen = c.ide_incmen
                LIMIT 1
            ) AS cab_art ON true
            INNER JOIN inv_articulo      a  ON a.ide_inarti = cab_art.ide_inarti
            LEFT  JOIN inv_unidad        u  ON u.ide_inuni  = a.ide_inuni
            WHERE c.ide_incmen = $1
            `,
        );
        query.addIntParam(1, dtoIn.ide_incmen);
        return this.dataSource.createSingleQuery(query);
    }

    /**
     * Retorna el detalle de presentaciones de un comprobante de menudeo
     */
    async getDetMenudeo(dtoIn: IdMenudeoDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT
                d.ide_indmen,
                d.ide_incmen,
                d.ide_inmpre,
                f.nombre_inmfor,
                COALESCE(p.cant_base_inmpre, f.cant_base_inmfor) AS cant_base_efectiva,
                d.cantidad_indmen,
                d.cant_base_indmen,
                u.siglas_inuni  AS siglas_forma,
                ub.siglas_inuni AS siglas_base,
                d.observacion_indmen,
                d.usuario_ingre,
                d.fecha_ingre,
                d.hora_ingre,
                d.usuario_actua,
                d.fecha_actua,
                d.hora_actua
            FROM inv_det_menudeo d
            INNER JOIN inv_men_presentacion p  ON p.ide_inmpre = d.ide_inmpre
            INNER JOIN inv_men_forma        f  ON f.ide_inmfor = p.ide_inmfor
            INNER JOIN inv_cab_menudeo      c  ON c.ide_incmen = d.ide_incmen
            INNER JOIN inv_articulo         a  ON a.ide_inarti = p.ide_inarti
            LEFT  JOIN inv_unidad           u  ON u.ide_inuni  = f.ide_inuni
            LEFT  JOIN inv_unidad           ub ON ub.ide_inuni = a.ide_inuni
            WHERE d.ide_incmen = $1
            ORDER BY f.nombre_inmfor
            `,
            dtoIn,
        );
        query.addIntParam(1, dtoIn.ide_incmen);
        return this.dataSource.createQuery(query);
    }

    // ─────────────────────────────────────────────────────────────
    // KARDEX DE MENUDEO
    // ─────────────────────────────────────────────────────────────

    /**
     * Retorna el kardex (movimientos con saldo acumulado) de una presentación
     * en un rango de fechas, incluyendo saldo inicial.
     */
    async getKardexMenudeo(dtoIn: TrnMenudeoDto & HeaderParamsDto) {
        if (!dtoIn.ide_inmpre) {
            throw new Error('Se requiere ide_inmpre para el kardex de menudeo');
        }

        const query = new SelectQuery(
            `
            WITH saldo_inicial AS (
                SELECT
                    d.ide_inmpre,
                    COALESCE(
                        f_redondeo(SUM(d.cantidad_indmen  * tc.signo_inmtc), 2), 0
                    ) AS saldo,
                    COALESCE(
                        f_redondeo(SUM(d.cant_base_indmen * tc.signo_inmtc), 6), 0
                    ) AS saldo_base
                FROM inv_det_menudeo d
                INNER JOIN inv_cab_menudeo   c  ON c.ide_incmen = d.ide_incmen
                INNER JOIN inv_men_tipo_tran tt ON tt.ide_inmtt = c.ide_inmtt
                INNER JOIN inv_men_tipo_comp tc ON tc.ide_inmtc = tt.ide_inmtc
                WHERE d.ide_inmpre      = $1
                  AND c.estado_incmen   = 1
                  AND c.fecha_incmen    < $2
                GROUP BY d.ide_inmpre
            ),
            movimientos AS (
                SELECT
                    d.ide_indmen,
                    d.ide_inmpre,
                    d.ide_incmen,
                    c.fecha_incmen,
                    c.numero_incmen,
                    tt.sigla_inmtt,
                    tc.signo_inmtc,
                    tt.nombre_inmtt                                  AS nombre_tipo,
                    c.observacion_incmen,
                    CASE WHEN tc.signo_inmtc =  1 THEN d.cantidad_indmen  END AS ingreso,
                    CASE WHEN tc.signo_inmtc = -1 THEN d.cantidad_indmen  END AS egreso,
                    d.cantidad_indmen  * tc.signo_inmtc               AS movimiento,
                    d.cant_base_indmen * tc.signo_inmtc               AS movimiento_base,
                    d.observacion_indmen,
                    c.usuario_ingre,
                    c.fecha_ingre
                FROM inv_det_menudeo d
                INNER JOIN inv_cab_menudeo   c  ON c.ide_incmen = d.ide_incmen
                INNER JOIN inv_men_tipo_tran tt ON tt.ide_inmtt = c.ide_inmtt
                INNER JOIN inv_men_tipo_comp tc ON tc.ide_inmtc = tt.ide_inmtc
                WHERE d.ide_inmpre     = $3
                  AND c.estado_incmen  = 1
                  AND c.fecha_incmen   BETWEEN $4 AND $5
            )
            SELECT
                m.ide_indmen,
                m.ide_inmpre,
                m.ide_incmen,
                m.fecha_incmen,
                m.numero_incmen,
                m.sigla_inmtt,
                m.nombre_tipo,
                m.observacion_incmen,
                f_decimales(m.ingreso, 2)::numeric              AS ingreso,
                f_decimales(m.egreso, 2)::numeric               AS egreso,
                f_redondeo(
                    COALESCE(si.saldo, 0) +
                    SUM(m.movimiento) OVER (ORDER BY m.fecha_incmen, m.ide_indmen),
                    2
                )                                               AS saldo,
                f_redondeo(
                    COALESCE(si.saldo_base, 0) +
                    SUM(m.movimiento_base) OVER (ORDER BY m.fecha_incmen, m.ide_indmen),
                    6
                )                                               AS saldo_base,
                m.observacion_indmen,
                m.usuario_ingre,
                m.fecha_ingre
            FROM movimientos m
            LEFT JOIN saldo_inicial si ON si.ide_inmpre = m.ide_inmpre

            UNION ALL

            SELECT
                -1                          AS ide_indmen,
                si.ide_inmpre,
                NULL                        AS ide_incmen,
                $6::date                    AS fecha_incmen,
                NULL                        AS numero_incmen,
                'SI'                        AS sigla_inmtt,
                'Saldo Inicial'             AS nombre_tipo,
                NULL                        AS observacion_incmen,
                NULL                        AS ingreso,
                NULL                        AS egreso,
                si.saldo                    AS saldo,
                si.saldo_base               AS saldo_base,
                NULL                        AS observacion_indmen,
                NULL                        AS usuario_ingre,
                NULL                        AS fecha_ingre
            FROM saldo_inicial si

            ORDER BY fecha_incmen, ide_indmen
            `,
            dtoIn,
        );
        query.addIntParam(1, dtoIn.ide_inmpre);
        query.addParam(2, dtoIn.fechaInicio);
        query.addIntParam(3, dtoIn.ide_inmpre);
        query.addParam(4, dtoIn.fechaInicio);
        query.addParam(5, dtoIn.fechaFin);
        query.addParam(6, dtoIn.fechaInicio);
        return this.dataSource.createQuery(query);
    }

    // ─────────────────────────────────────────────────────────────
    // RESUMEN EJECUTIVO
    // ─────────────────────────────────────────────────────────────

    /**
     * Resumen consolidado: stock de inventario vs stock de menudeo, base consumida en menudeo
     * y detalle por presentación para un producto dado.
     */
    async getResumenMenudeoProducto(dtoIn: IdProductoMenudeoDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            WITH stock_inventario AS (
                SELECT
                    iart.ide_inarti,
                    f_redondeo(SUM(dci.cantidad_indci * tci.signo_intci), iart.decim_stock_inarti) AS stock_real,
                    iart.decim_stock_inarti,
                    u.siglas_inuni
                FROM inv_det_comp_inve  dci
                INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                INNER JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                INNER JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                INNER JOIN inv_articulo      iart ON iart.ide_inarti = dci.ide_inarti
                LEFT  JOIN inv_unidad        u    ON u.ide_inuni     = iart.ide_inuni
                WHERE dci.ide_inarti = $1
                  AND cci.ide_inepi  = ${this.variables.get('p_inv_estado_normal')}
                  AND cci.ide_empr   = ${dtoIn.ideEmpr}
                GROUP BY iart.ide_inarti, iart.decim_stock_inarti, u.siglas_inuni
            ),
            stock_menudeo AS (
                SELECT
                    p.ide_inarti,
                    COALESCE(f_redondeo(SUM(d.cant_base_indmen * tc.signo_inmtc), 6), 0) AS base_en_menudeo
                FROM inv_men_presentacion p
                LEFT JOIN inv_det_menudeo   d  ON d.ide_inmpre  = p.ide_inmpre
                LEFT JOIN inv_cab_menudeo   c  ON c.ide_incmen  = d.ide_incmen
                                              AND c.estado_incmen = 1
                LEFT JOIN inv_men_tipo_tran tt ON tt.ide_inmtt   = c.ide_inmtt
                LEFT JOIN inv_men_tipo_comp tc ON tc.ide_inmtc   = tt.ide_inmtc
                WHERE p.ide_inarti = $2
                  AND p.ide_empr   = ${dtoIn.ideEmpr}
                GROUP BY p.ide_inarti
            ),
            saldos_presentacion AS (
                SELECT
                    p.ide_inmpre,
                    p.ide_inmfor,
                    f.nombre_inmfor,
                    COALESCE(p.cant_base_inmpre, f.cant_base_inmfor) AS cant_base_efectiva,
                    uf.siglas_inuni                  AS siglas_forma,
                    COALESCE(f_redondeo(SUM(d.cantidad_indmen  * tc.signo_inmtc), 2), 0) AS saldo_pres,
                    COALESCE(f_redondeo(SUM(d.cant_base_indmen * tc.signo_inmtc), 6), 0) AS base_consumida,
                    p.activo_inmpre
                FROM inv_men_presentacion p
                INNER JOIN inv_men_forma    f  ON f.ide_inmfor  = p.ide_inmfor
                LEFT JOIN inv_det_menudeo   d  ON d.ide_inmpre  = p.ide_inmpre
                LEFT JOIN inv_cab_menudeo   c  ON c.ide_incmen  = d.ide_incmen
                                              AND c.estado_incmen = 1
                LEFT JOIN inv_men_tipo_tran tt ON tt.ide_inmtt   = c.ide_inmtt
                LEFT JOIN inv_men_tipo_comp tc ON tc.ide_inmtc   = tt.ide_inmtc
                LEFT JOIN inv_unidad        uf ON uf.ide_inuni   = f.ide_inuni
                WHERE p.ide_inarti = $3
                  AND p.ide_empr   = ${dtoIn.ideEmpr}
                GROUP BY p.ide_inmpre, p.ide_inmfor, f.nombre_inmfor,
                         p.cant_base_inmpre, f.cant_base_inmfor,
                         uf.siglas_inuni, p.activo_inmpre
            )
            SELECT
                si.ide_inarti,
                COALESCE(si.stock_real, 0)      AS stock_inventario,
                si.siglas_inuni                 AS siglas_base,
                COALESCE(sm.base_en_menudeo, 0) AS base_en_menudeo,
                COALESCE(si.stock_real, 0) - COALESCE(sm.base_en_menudeo, 0) AS stock_disponible,
                (
                    SELECT json_agg(row_to_json(sp))
                    FROM saldos_presentacion sp
                ) AS presentaciones
            FROM stock_inventario si
            LEFT JOIN stock_menudeo sm ON sm.ide_inarti = si.ide_inarti
            `,
            dtoIn,
        );
        query.addIntParam(1, dtoIn.ide_inarti);
        query.addIntParam(2, dtoIn.ide_inarti);
        query.addIntParam(3, dtoIn.ide_inarti);
        return this.dataSource.createSingleQuery(query);
    }

    /**
     * Retorna todos los productos de la empresa y una bandera booleana que indica
     * si tienen presentaciones de menudeo configuradas.
     */
    async getProductosEstadoMenudeo(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT
                a.ide_inarti,
                a.uuid,
                a.nombre_inarti,
                a.codigo_inarti,
                a.foto_inarti,
                u.siglas_inuni,
                u.nombre_inuni,
                a.decim_stock_inarti,
                a.activo_inarti,
                COUNT(p.ide_inmpre) AS total_presentaciones
            FROM inv_articulo a
            LEFT JOIN inv_unidad u ON u.ide_inuni = a.ide_inuni
            LEFT JOIN inv_men_presentacion p
                ON p.ide_inarti = a.ide_inarti
               AND p.ide_empr = ${dtoIn.ideEmpr}
            WHERE a.ide_empr = ${dtoIn.ideEmpr}
              AND a.ide_intpr = 1
              AND a.nivel_inarti = 'HIJO'
            GROUP BY
                a.ide_inarti, a.uuid, a.nombre_inarti, a.codigo_inarti,
                a.foto_inarti, u.siglas_inuni, u.nombre_inuni,
                a.decim_stock_inarti, a.activo_inarti
            ORDER BY unaccent(a.nombre_inarti)
            `,
            dtoIn,
        );
        query.isLazy = false; // para evitar paginación automática y retornar todos los productos
        return this.dataSource.createQuery(query);
    }

    /**
     * Retorna productos que tienen presentaciones de menudeo configuradas
     * pero ningún comprobante de menudeo registrado (inv_cab_menudeo).
     * Son los únicos elegibles para crear un Saldo Inicial.
     */
    async getProductosSinComprobantesMenudeo(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT
                a.ide_inarti,
                a.uuid,
                a.nombre_inarti,
                a.codigo_inarti,
                a.foto_inarti,
                u.siglas_inuni,
                u.nombre_inuni,
                a.decim_stock_inarti,
                COUNT(p.ide_inmpre)  AS total_presentaciones,
                a.activo_inarti
            FROM inv_men_presentacion p
            INNER JOIN inv_articulo a ON a.ide_inarti = p.ide_inarti
            LEFT  JOIN inv_unidad  u ON u.ide_inuni  = a.ide_inuni
            WHERE p.ide_empr  = ${dtoIn.ideEmpr}
              AND a.activo_inarti = true
              AND NOT EXISTS (
                  SELECT 1 FROM inv_cab_menudeo c
                  WHERE c.ide_inarti = a.ide_inarti
                    AND c.ide_empr   = ${dtoIn.ideEmpr}
              )
            GROUP BY
                a.ide_inarti, a.uuid, a.nombre_inarti, a.codigo_inarti,
                a.foto_inarti, u.siglas_inuni, u.nombre_inuni,
                a.decim_stock_inarti, a.activo_inarti
            ORDER BY unaccent(a.nombre_inarti)
            `,
            dtoIn,
        );
        return this.dataSource.createQuery(query);
    }

    /**
     * Retorna los productos que tienen presentaciones de menudeo configuradas en la empresa
     */
    async getProductosConMenudeo(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT
                a.ide_inarti,
                a.uuid,
                a.nombre_inarti,
                a.codigo_inarti,
                a.foto_inarti,
                u.siglas_inuni,
                u.nombre_inuni,
                a.decim_stock_inarti,
                COUNT(p.ide_inmpre)  AS total_presentaciones,
                a.activo_inarti
            FROM inv_men_presentacion p
            INNER JOIN inv_articulo a ON a.ide_inarti = p.ide_inarti
            LEFT  JOIN inv_unidad  u ON u.ide_inuni  = a.ide_inuni
            WHERE p.ide_empr  = ${dtoIn.ideEmpr}
            GROUP BY
                a.ide_inarti, a.uuid, a.nombre_inarti, a.codigo_inarti,
                a.foto_inarti, u.siglas_inuni, u.nombre_inuni,
                a.decim_stock_inarti, a.activo_inarti
            ORDER BY unaccent(a.nombre_inarti)
            `,
            dtoIn,
        );
        return this.dataSource.createQuery(query);
    }

    // ─────────────────────────────────────────────────────────────
    // TABLE QUERY / LIST DATA – CATÁLOGOS MENUDEO
    // ─────────────────────────────────────────────────────────────

    /** inv_men_forma – tabla completa */
    async getTableQueryMenForma(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        const condition = `ide_empr = ${dtoIn.ideEmpr}`;
        const dto = { ...dtoIn, module: 'inv', tableName: 'men_forma', primaryKey: 'ide_inmfor', condition };
        return this.core.getTableQuery(dto);
    }

    /** inv_men_forma – lista { value, label } para combos */
    async getListDataMenForma(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        const condition = `ide_empr = ${dtoIn.ideEmpr} and activo_inmfor = true`;
        const dto = {
            ...dtoIn,
            module: 'inv',
            tableName: 'men_forma',
            primaryKey: 'ide_inmfor',
            columnLabel: 'nombre_inmfor',
            condition,
        };
        return this.core.getListDataValues(dto);
    }

    /** inv_men_forma_insumo – tabla completa (requiere ide_inmfor) */
    async getTableQueryMenFormaInsumo(dtoIn: IdFormaDto & HeaderParamsDto) {
        const condition = `ide_inmfor = ${dtoIn.ide_inmfor}`;
        const dto = { ...dtoIn, module: 'inv', tableName: 'men_forma_insumo', primaryKey: 'ide_inmfin', condition };
        return this.core.getTableQuery(dto);
    }

    /** inv_men_forma_insumo – lista { value, label } para combos */
    async getListDataMenFormaInsumo(dtoIn: IdFormaDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT
                CAST(fi.ide_inmfin AS VARCHAR) AS value,
                a.nombre_inarti AS label
            FROM inv_men_forma_insumo fi
            INNER JOIN inv_articulo a ON a.ide_inarti = fi.ide_inarti
            WHERE fi.ide_inmfor = $1
            ORDER BY a.nombre_inarti
            `,
            dtoIn,
        );
        query.addIntParam(1, dtoIn.ide_inmfor);
        return this.dataSource.createSelectQuery(query);
    }

    /** inv_men_tipo_comp – tabla completa */
    async getTableQueryMenTipoComp(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        const condition = `ide_empr = ${dtoIn.ideEmpr}`;
        const dto = { ...dtoIn, module: 'inv', tableName: 'men_tipo_comp', primaryKey: 'ide_inmtc', condition };
        return this.core.getTableQuery(dto);
    }

    /** inv_men_tipo_comp – lista { value, label } para combos */
    async getListDataMenTipoComp(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        const condition = `ide_empr = ${dtoIn.ideEmpr} and activo_inmtc = true`;
        const dto = {
            ...dtoIn,
            module: 'inv',
            tableName: 'men_tipo_comp',
            primaryKey: 'ide_inmtc',
            columnLabel: 'nombre_inmtc',
            condition,
            columnOrder: 'signo_inmtc DESC, nombre_inmtc',
        };
        return this.core.getListDataValues(dto);
    }

    /** inv_men_tipo_tran – tabla completa */
    async getTableQueryMenTipoTran(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        const condition = `ide_empr = ${dtoIn.ideEmpr}`;
        const dto = { ...dtoIn, module: 'inv', tableName: 'men_tipo_tran', primaryKey: 'ide_inmtt', condition };
        return this.core.getTableQuery(dto);
    }

    /** inv_men_tipo_tran – lista { value, label } filtrable por ide_inmtc */
    async getListDataMenTipoTran(dtoIn: IdTipoCompDto & HeaderParamsDto) {
        const condition = dtoIn.ide_inmtc
            ? `ide_empr = ${dtoIn.ideEmpr} and activo_inmtt = true and ide_inmtc = ${dtoIn.ide_inmtc}`
            : `ide_empr = ${dtoIn.ideEmpr} and activo_inmtt = true`;
        const dto = {
            ...dtoIn,
            module: 'inv',
            tableName: 'men_tipo_tran',
            primaryKey: 'ide_inmtt',
            columnLabel: 'nombre_inmtt',
            condition,
        };
        return this.core.getListDataValues(dto);
    }

    /** inv_men_presentacion – tabla completa (requiere ide_inarti) */
    async getTableQueryMenPresentacion(dtoIn: IdProductoMenudeoDto & HeaderParamsDto) {
        const condition = `ide_empr = ${dtoIn.ideEmpr} and ide_inarti = ${dtoIn.ide_inarti}`;
        const dto = { ...dtoIn, module: 'inv', tableName: 'men_presentacion', primaryKey: 'ide_inmpre', condition };
        return this.core.getTableQuery(dto);
    }

    /** inv_men_presentacion – lista { value, label } para combos */
    async getListDataMenPresentacion(dtoIn: IdProductoMenudeoDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT
                CAST(p.ide_inmpre AS VARCHAR) AS value,
                f.nombre_inmfor AS label
            FROM inv_men_presentacion p
            INNER JOIN inv_men_forma f ON f.ide_inmfor = p.ide_inmfor
            WHERE p.ide_inarti    = $1
              AND p.ide_empr      = ${dtoIn.ideEmpr}
              AND p.activo_inmpre = true
            ORDER BY f.nombre_inmfor
            `,
            dtoIn,
        );
        query.addIntParam(1, dtoIn.ide_inarti);
        return this.dataSource.createSelectQuery(query);
    }



}
