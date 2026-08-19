import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { BaseService } from '../../../../common/base-service';
import { HeaderParamsDto } from '../../../../common/dto/common-params.dto';
import { getCurrentDate, getCurrentTime } from '../../../../util/helpers/date-util';
import { DataSourceService } from '../../../connection/datasource.service';
import { ObjectQueryDto } from '../../../connection/dto';
import { CoreService } from '../../../core.service';

import { ConfirmarImpresionDto } from './dto/confirmar-impresion.dto';
import { IdEtiquetaDto } from './dto/id-etiqueta.dto';
import { SaveEtiquetaDto } from './dto/save-etiqueta.dto';

@Injectable()
export class EtiquetasSaveService extends BaseService {
    private readonly logger = new Logger(EtiquetasSaveService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
    }

    // ─────────────────────────────────────────────────────────────
    // GUARDAR / ACTUALIZAR - ETIQUETAS
    // ─────────────────────────────────────────────────────────────

    /**
     * Crea o actualiza una etiqueta de producto.
     * Sigue el patrón isUpdate: true = UPDATE, false = INSERT.
     * Restricción UNIQUE (ide_inarti, tipo_ineta) en BD impide duplicados.
     */
    async saveEtiqueta(dtoIn: SaveEtiquetaDto & HeaderParamsDto) {
        const module = 'inv';
        const tableName = 'etiqueta';
        const primaryKey = 'ide_ineta';

        const listQuery: ObjectQueryDto[] = [];

        if (dtoIn.isUpdate) {
            if (!dtoIn.data.ide_ineta) {
                throw new BadRequestException('Se requiere ide_ineta para actualizar la etiqueta');
            }

            const objQuery: ObjectQueryDto = {
                operation: 'update',
                module,
                tableName,
                primaryKey,
                object: {
                    ...dtoIn.data,
                    usuario_actua: dtoIn.login,
                    fecha_actua: getCurrentDate(),
                    hora_actua: getCurrentTime(),
                },
                condition: `${primaryKey} = ${dtoIn.data.ide_ineta}`,
            };
            listQuery.push(objQuery);
        } else {
            // INSERT atómico vía ON CONFLICT DO NOTHING: reemplaza el antiguo
            // SELECT COUNT(1) + INSERT genérico (dos conexiones separadas), que dejaba una
            // ventana de condición de carrera entre el check y el insert bajo requests
            // concurrentes, violando la restricción UNIQUE (ide_inarti, tipo_ineta).
            dtoIn.data.ide_ineta = await this.dataSource.getSeqTable(
                `${module}_${tableName}`,
                primaryKey,
                1,
                dtoIn.login,
            );

            const result = await this.dataSource.pool.query(
                `INSERT INTO inv_etiqueta (
                    ide_ineta, ide_inarti, nombre_ineta, tipo_ineta, peso_ineta,
                    unidad_medida_ineta, lote_ineta, fecha_elaboracion_ineta, fecha_vence_ineta,
                    notas_ineta, usuario_ingre, fecha_ingre, hora_ingre
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                ON CONFLICT (ide_inarti, tipo_ineta) DO NOTHING`,
                [
                    dtoIn.data.ide_ineta,
                    dtoIn.data.ide_inarti,
                    dtoIn.data.nombre_ineta,
                    dtoIn.data.tipo_ineta,
                    dtoIn.data.peso_ineta ?? null,
                    dtoIn.data.unidad_medida_ineta ?? null,
                    dtoIn.data.lote_ineta ?? null,
                    dtoIn.data.fecha_elaboracion_ineta ?? null,
                    dtoIn.data.fecha_vence_ineta ?? null,
                    dtoIn.data.notas_ineta ?? null,
                    dtoIn.login,
                    getCurrentDate(),
                    getCurrentTime(),
                ],
            );

            if (result.rowCount === 0) {
                throw new BadRequestException(
                    'Este producto ya tiene una etiqueta configurada para este tipo',
                );
            }

            return { message: 'ok', rowCount: 1 };
        }

        await this.core.save({ ...dtoIn, listQuery, audit: false });
        return { message: 'ok', rowCount: 1 };
    }

    /**
     * Elimina una etiqueta de producto.
     */
    async deleteEtiqueta(dtoIn: IdEtiquetaDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `DELETE FROM inv_etiqueta WHERE ide_ineta = $1`,
            [dtoIn.ide_ineta],
        );
        return { message: 'ok', rowCount: 1 };
    }
    /**
     * Confirma la impresión de una etiqueta sumando 1 al contador_ineta.
     */
    async confirmarImpresion(dtoIn: ConfirmarImpresionDto & HeaderParamsDto) {
        // Usa la cantidad proporcionada o 1 por defecto
        const cantidad = dtoIn.cantidad && Number.isInteger(dtoIn.cantidad) ? dtoIn.cantidad : 1;
        const result = await this.dataSource.pool.query(
            `UPDATE inv_etiqueta
             SET contador_ineta = COALESCE(contador_ineta, 0) + $3,
                 fecha_impr_ineta = NOW()
             WHERE ide_inarti = $1 AND tipo_ineta = $2`,
            [dtoIn.ide_inarti, dtoIn.tipo_ineta, cantidad]
        );
        return { message: 'ok', rowCount: result.rowCount };
    }
}
