import { Injectable, Logger } from '@nestjs/common';

import { BaseService } from '../../../../common/base-service';
import { HeaderParamsDto } from '../../../../common/dto/common-params.dto';
import { QueryOptionsDto } from '../../../../common/dto/query-options.dto';
import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery } from '../../../connection/helpers/select-query';
import { CoreService } from '../../../core.service';

import { IdProductoDto } from './dto/id-producto.dto';
import { IdProductoEtiquetaDto } from './dto/id-producto-etiqueta.dto';
import { TipoEtiquetaDto } from './dto/tipo-etiqueta.dto';
import { PorExpirarDto } from './dto/por-expriar.dto';

@Injectable()
export class EtiquetasService extends BaseService {
    private readonly logger = new Logger(EtiquetasService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
    }

    // ─────────────────────────────────────────────────────────────
    // CONSULTAS - ETIQUETAS
    // ─────────────────────────────────────────────────────────────

    /**
     * Retorna todas las etiquetas configuradas de la empresa.
     * Incluye información del producto asociado.
     */
    async getEtiquetas(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT
                e.ide_ineta,
                e.ide_inarti,
                a.codigo_inarti,
                a.nombre_inarti,
                e.nombre_ineta,
                e.tipo_ineta,
                e.peso_ineta,
                e.unidad_medida_ineta,
                e.lote_ineta,
                e.fecha_elaboracion_ineta,
                e.fecha_vence_ineta,
                e.contador_ineta,
                e.usuario_ingre,
                e.fecha_ingre,
                e.hora_ingre,
                e.usuario_actua,
                e.fecha_actua,
                e.hora_actua
            FROM inv_etiqueta e
            INNER JOIN inv_articulo a ON a.ide_inarti = e.ide_inarti
            WHERE a.ide_empr = ${dtoIn.ideEmpr}
            ORDER BY a.nombre_inarti, e.tipo_ineta
            `,
            dtoIn,
        );
        return this.dataSource.createQuery(query);
    }

    /**
     * Retorna la etiqueta de un producto específico según tipo.
     * Query params: ide_inarti, tipo_ineta
     */
    async getEtiquetaProducto(dtoIn: IdProductoEtiquetaDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT
                e.ide_ineta,
                e.ide_inarti,
                a.codigo_inarti,
                a.nombre_inarti,
                e.nombre_ineta,
                e.tipo_ineta,
                e.peso_ineta,
                e.unidad_medida_ineta,
                e.lote_ineta,
                e.fecha_elaboracion_ineta,
                e.fecha_vence_ineta,
                e.contador_ineta,
                e.usuario_ingre,
                e.fecha_ingre,
                e.hora_ingre,
                e.usuario_actua,
                e.fecha_actua,
                e.hora_actua,
            FROM inv_etiqueta e
            INNER JOIN inv_articulo a ON a.ide_inarti = e.ide_inarti
            WHERE a.ide_empr = ${dtoIn.ideEmpr}
              AND e.ide_inarti = $1
              AND e.tipo_ineta = $2
            `,
            dtoIn,
        );
        query.addIntParam(1, dtoIn.ide_inarti);
        query.addParam(2, dtoIn.tipo_ineta);
        return this.dataSource.createQuery(query);
    }

    /**
     * Retorna todas las etiquetas de un producto específico (por todos los tipos).
     * Query param: ide_inarti
     */
    async getEtiquetasByProducto(dtoIn: IdProductoDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT
                e.ide_ineta,
                e.ide_inarti,
                a.codigo_inarti,
                a.nombre_inarti,
                e.nombre_ineta,
                e.tipo_ineta,
                e.peso_ineta,
                e.unidad_medida_ineta,
                e.lote_ineta,
                e.fecha_elaboracion_ineta,
                e.fecha_vence_ineta,
                e.contador_ineta,
                e.usuario_ingre,
                e.fecha_ingre,
                e.hora_ingre,
                e.usuario_actua,
                e.fecha_actua,
                e.hora_actua
            FROM inv_etiqueta e
            INNER JOIN inv_articulo a ON a.ide_inarti = e.ide_inarti
            WHERE a.ide_empr = ${dtoIn.ideEmpr}
              AND e.ide_inarti = $1
            ORDER BY e.tipo_ineta
            `,
            dtoIn,
        );
        query.addIntParam(1, dtoIn.ide_inarti);
        return this.dataSource.createQuery(query);
    }

    /**
     * Retorna todas las etiquetas por tipo específico.
     * Útil para consultar todas las etiquetas "GRANDE" o "PEQUEÑA".
     * Query param: tipo_ineta
     */
    async getEtiquetasByTipo(dtoIn: TipoEtiquetaDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT
                e.ide_ineta,
                e.ide_inarti,
                a.codigo_inarti,
                a.nombre_inarti,
                e.nombre_ineta,
                e.tipo_ineta,
                e.peso_ineta,
                e.unidad_medida_ineta,
                e.lote_ineta,
                e.fecha_elaboracion_ineta,
                e.fecha_vence_ineta,
                e.contador_ineta,
                e.usuario_ingre,
                e.fecha_ingre,
                e.hora_ingre,
                e.usuario_actua,
                e.fecha_actua,
                e.hora_actua
            FROM inv_etiqueta e
            INNER JOIN inv_articulo a ON a.ide_inarti = e.ide_inarti
            WHERE a.ide_empr = ${dtoIn.ideEmpr}
              AND e.tipo_ineta = $1
            ORDER BY a.nombre_inarti
            `,
            dtoIn,
        );
        query.addParam(1, dtoIn.tipo_ineta);
        return this.dataSource.createQuery(query);
    }

    /**
     * Retorna los tipos de etiqueta disponibles en la empresa.
     */
    async getTiposEtiqueta(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT
                e.tipo_ineta,
                COUNT(1) AS total_etiquetas
            FROM inv_etiqueta e
            INNER JOIN inv_articulo a ON a.ide_inarti = e.ide_inarti
            WHERE a.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY e.tipo_ineta
            ORDER BY e.tipo_ineta
            `,
            dtoIn,
        );
        return this.dataSource.createQuery(query);
    }


    /**
 * Obtiene un resumen consolidado de métricas sobre etiquetas.
 * @param dtoIn - Parámetros de entrada (ideEmpr, opcional limitTop)
 * @returns Objeto JSON con todas las métricas calculadas
 */
    async getMetricasEtiquetas(dtoIn: QueryOptionsDto & HeaderParamsDto & { limitTop?: number }) {
        const limitTop = dtoIn.limitTop ?? 5;
        const ideEmpr = dtoIn.ideEmpr;

        const query = new SelectQuery(
            `
        WITH
        total_etiquetas AS (
            SELECT COUNT(*) AS total
            FROM inv_etiqueta e
            INNER JOIN inv_articulo a ON a.ide_inarti = e.ide_inarti
            WHERE a.ide_empr = ${ideEmpr}
        ),
        total_por_tipo AS (
            SELECT e.tipo_ineta, COUNT(*) AS total
            FROM inv_etiqueta e
            INNER JOIN inv_articulo a ON a.ide_inarti = e.ide_inarti
            WHERE a.ide_empr = ${ideEmpr}
            GROUP BY e.tipo_ineta
            ORDER BY total DESC
        ),
        mas_impresas AS (
            SELECT
                e.ide_ineta,
                e.nombre_ineta,
                e.tipo_ineta,
                e.contador_ineta,
                a.nombre_inarti
            FROM inv_etiqueta e
            INNER JOIN inv_articulo a ON a.ide_inarti = e.ide_inarti
            WHERE a.ide_empr = ${ideEmpr}
            ORDER BY e.contador_ineta DESC
            LIMIT ${limitTop}
        ),
        menos_impresas AS (
            SELECT
                e.ide_ineta,
                e.nombre_ineta,
                e.tipo_ineta,
                e.contador_ineta,
                a.nombre_inarti
            FROM inv_etiqueta e
            INNER JOIN inv_articulo a ON a.ide_inarti = e.ide_inarti
            WHERE a.ide_empr = ${ideEmpr}
              AND e.contador_ineta > 0
            ORDER BY e.contador_ineta ASC
            LIMIT ${limitTop}
        ),
        expiracion_meses AS (
            SELECT
                COUNT(CASE WHEN e.fecha_vence_ineta IS NOT NULL 
                          AND e.fecha_vence_ineta BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 months' 
                     THEN 1 END) AS en_3_meses,
                COUNT(CASE WHEN e.fecha_vence_ineta IS NOT NULL 
                          AND e.fecha_vence_ineta BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '6 months' 
                     THEN 1 END) AS en_6_meses,
                COUNT(CASE WHEN e.fecha_vence_ineta IS NOT NULL 
                          AND e.fecha_vence_ineta BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '9 months' 
                     THEN 1 END) AS en_9_meses,
                COUNT(CASE WHEN e.fecha_vence_ineta IS NOT NULL 
                          AND e.fecha_vence_ineta BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '12 months' 
                     THEN 1 END) AS en_12_meses
            FROM inv_etiqueta e
            INNER JOIN inv_articulo a ON a.ide_inarti = e.ide_inarti
            WHERE a.ide_empr = ${ideEmpr}
        ),
        expiradas AS (
            SELECT COUNT(*) AS total
            FROM inv_etiqueta e
            INNER JOIN inv_articulo a ON a.ide_inarti = e.ide_inarti
            WHERE a.ide_empr = ${ideEmpr}
              AND e.fecha_vence_ineta < CURRENT_DATE
        ),
        promedio_impresiones AS (
            SELECT AVG(contador_ineta) AS promedio
            FROM inv_etiqueta e
            INNER JOIN inv_articulo a ON a.ide_inarti = e.ide_inarti
            WHERE a.ide_empr = ${ideEmpr}
        ),
        sin_vencimiento AS (
            SELECT COUNT(*) AS total
            FROM inv_etiqueta e
            INNER JOIN inv_articulo a ON a.ide_inarti = e.ide_inarti
            WHERE a.ide_empr = ${ideEmpr}
              AND e.fecha_vence_ineta IS NULL
        ),
        productos_con_etiquetas AS (
            SELECT COUNT(DISTINCT a.ide_inarti) AS total
            FROM inv_etiqueta e
            INNER JOIN inv_articulo a ON a.ide_inarti = e.ide_inarti
            WHERE a.ide_empr = ${ideEmpr}
        ),
        producto_con_mas_etiquetas AS (
            SELECT
                a.ide_inarti,
                a.nombre_inarti,
                COUNT(*) AS total_etiquetas
            FROM inv_etiqueta e
            INNER JOIN inv_articulo a ON a.ide_inarti = e.ide_inarti
            WHERE a.ide_empr = ${ideEmpr}
            GROUP BY a.ide_inarti, a.nombre_inarti
            ORDER BY total_etiquetas DESC
            LIMIT 1
        )
        SELECT
            (SELECT total FROM total_etiquetas) AS total_etiquetas,
            (SELECT json_agg(row_to_json(tpt)) FROM total_por_tipo tpt) AS total_por_tipo,
            (SELECT json_agg(row_to_json(mi)) FROM mas_impresas mi) AS mas_impresas,
            (SELECT json_agg(row_to_json(mni)) FROM menos_impresas mni) AS menos_impresas,
            (SELECT row_to_json(em) FROM expiracion_meses em) AS expiracion_meses,
            (SELECT total FROM expiradas) AS expiradas,
            (SELECT promedio FROM promedio_impresiones) AS promedio_impresiones,
            (SELECT total FROM sin_vencimiento) AS sin_fecha_vencimiento,
            (SELECT total FROM productos_con_etiquetas) AS productos_con_etiquetas,
            (SELECT row_to_json(pcme) FROM producto_con_mas_etiquetas pcme) AS producto_con_mas_etiquetas
        `,
            dtoIn
        );

        return this.dataSource.createSingleQuery(query);
    }


    /**
 * Obtiene el detalle paginado de etiquetas según su estado de expiración en meses.
 * @param dtoIn - Parámetros: ideEmpr, opcion ('3m','6m','9m','12m','expiradas'),
 *                 opcional tipo_ineta, ide_inarti, page, pageSize.
 * @returns Listado paginado de etiquetas que cumplen la condición.
 */
    async getEtiquetasPorExpiracionMeses(dtoIn: PorExpirarDto & HeaderParamsDto) {
        const ideEmpr = dtoIn.ideEmpr;

        // Construir condición WHERE según la opción (meses)
        let expiracionCond: string;

        switch (dtoIn.opcion) {
            case '3m':
                expiracionCond = `e.fecha_vence_ineta BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 months'`;
                break;
            case '6m':
                expiracionCond = `e.fecha_vence_ineta BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '6 months'`;
                break;
            case '9m':
                expiracionCond = `e.fecha_vence_ineta BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '9 months'`;
                break;
            case '12m':
                expiracionCond = `e.fecha_vence_ineta BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '12 months'`;
                break;
            case 'expiradas':
                expiracionCond = `e.fecha_vence_ineta < CURRENT_DATE`;
                break;
            default:
                throw new Error('Opción no válida');
        }

        // Condiciones base
        const conditions: string[] = [
            `a.ide_empr = ${ideEmpr}`,
            expiracionCond,
            `e.fecha_vence_ineta IS NOT NULL`
        ];
        const params: any[] = [];
        let paramIndex = 1;

        if (dtoIn.tipo_ineta) {
            conditions.push(`e.tipo_ineta = $${paramIndex}`);
            params.push(dtoIn.tipo_ineta);
            paramIndex++;
        }

        const whereClause = conditions.join(' AND ');

        const query = new SelectQuery(
            `
        WITH total AS (
            SELECT COUNT(*) as total
            FROM inv_etiqueta e
            INNER JOIN inv_articulo a ON a.ide_inarti = e.ide_inarti
            WHERE ${whereClause}
        ),
        datos AS (
            SELECT
                e.ide_ineta,
                e.ide_inarti,
                a.codigo_inarti,
                a.nombre_inarti,
                e.nombre_ineta,
                e.tipo_ineta,
                e.peso_ineta,
                e.unidad_medida_ineta,
                e.lote_ineta,
                e.fecha_elaboracion_ineta,
                e.fecha_vence_ineta,
                e.contador_ineta,
                e.usuario_ingre,
                e.fecha_ingre,
                e.hora_ingre,
                e.usuario_actua,
                e.fecha_actua,
                e.hora_actua,
                CASE
                    WHEN e.fecha_vence_ineta >= CURRENT_DATE
                    THEN e.fecha_vence_ineta - CURRENT_DATE
                    ELSE NULL
                END AS dias_para_expirar,
                CASE
                    WHEN e.fecha_vence_ineta < CURRENT_DATE
                    THEN CURRENT_DATE - e.fecha_vence_ineta
                    ELSE NULL
                END AS dias_caducada,
                -- Meses exactos para expiración (aproximado con diferencia de meses)
                EXTRACT(YEAR FROM age(e.fecha_vence_ineta, CURRENT_DATE)) * 12 +
                EXTRACT(MONTH FROM age(e.fecha_vence_ineta, CURRENT_DATE)) AS meses_para_expirar
            FROM inv_etiqueta e
            INNER JOIN inv_articulo a ON a.ide_inarti = e.ide_inarti
            WHERE ${whereClause}
            ORDER BY
                CASE
                    WHEN e.fecha_vence_ineta >= CURRENT_DATE THEN e.fecha_vence_ineta
                    ELSE e.fecha_vence_ineta
                END ASC
        )
        SELECT
            (SELECT total FROM total) AS total,
            (SELECT json_agg(row_to_json(d)) FROM datos d) AS data
        `,
            dtoIn
        );

        params.forEach((param, idx) => {
            query.addParam(idx + 1, param);
        });

        return this.dataSource.createSingleQuery(query);
    }

}
