import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { BaseService } from '../../../../common/base-service';
import { HeaderParamsDto } from '../../../../common/dto/common-params.dto';
import { ObjectQueryDto } from '../../../connection/dto';
import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery } from '../../../connection/helpers/select-query';
import { getCurrentDate, getCurrentTime } from '../../../../util/helpers/date-util';
import { CoreService } from '../../../core.service';

import { IdEtiquetaDto } from './dto/id-etiqueta.dto';
import { SaveEtiquetaDto } from './dto/save-etiqueta.dto';
import { ConfirmarImpresionDto } from './dto/confirmar-impresion.dto';

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
            // Verificar que no exista ya la etiqueta para este producto + tipo
            const checkQuery = new SelectQuery(`
                SELECT COUNT(1) AS total
                FROM inv_etiqueta
                WHERE ide_inarti = $1 AND tipo_ineta = $2
            `);
            checkQuery.addIntParam(1, dtoIn.data.ide_inarti);
            checkQuery.addParam(2, dtoIn.data.tipo_ineta);
            const exists = await this.dataSource.createSingleQuery(checkQuery);
            if (exists && Number(exists.total) > 0) {
                throw new BadRequestException(
                    'Este producto ya tiene una etiqueta configurada para este tipo',
                );
            }

            dtoIn.data.ide_ineta = await this.dataSource.getSeqTable(
                `${module}_${tableName}`,
                primaryKey,
                1,
                dtoIn.login,
            );
            const objQuery: ObjectQueryDto = {
                operation: 'insert',
                module,
                tableName,
                primaryKey,
                object: {
                    ...dtoIn.data,
                    usuario_ingre: dtoIn.login,
                    fecha_ingre: getCurrentDate(),
                    hora_ingre: getCurrentTime(),
                },
            };
            listQuery.push(objQuery);
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
