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
}
