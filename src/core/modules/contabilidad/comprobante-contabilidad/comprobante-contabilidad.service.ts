import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';

import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { DeleteQuery, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { getCurrentDate, getCurrentTime } from 'src/util/helpers/date-util';

import {
    AnularComprobanteDto,
    GetComprobanteByIdDto,
    SaveComprobanteDto,
} from './dto/comprobante-contabilidad.dto';

const MODULE = 'con';
const TABLE_CAB = 'cab_comp_cont';
const TABLE_DET = 'det_comp_cont';
const PK_CAB = 'ide_cnccc';
const PK_DET = 'ide_cndcc';

@Injectable()
export class ComprobanteContabilidadService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) { }

    /**
     * Lista los comprobantes contables de la sucursal con paginación y filtros.
     */
    async getComprobantes(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        try {
            const query = new SelectQuery(
                `
                SELECT
                    cab.ide_cnccc,
                    cab.fecha_trans_cnccc,
                    cab.numero_cnccc,
                    cab.observacion_cnccc,
                    cab.fecha_siste_cnccc,
                    cab.hora_sistem_cnccc,
                    cab.automatico_cnccc,
                    cab.ide_cneco,
                    eco.nombre_cneco,
                    cab.ide_cntcm,
                    tcm.nombre_cntcm,
                    cab.ide_geper,
                    per.nom_geper,
                    cab.ide_modu,
                    mod.nom_modu,
                    cab.ide_usua,
                    usu.nom_usua
                FROM con_cab_comp_cont cab
                INNER JOIN con_tipo_comproba tcm ON cab.ide_cntcm = tcm.ide_cntcm
                INNER JOIN con_estado_compro  eco ON cab.ide_cneco = eco.ide_cneco
                LEFT  JOIN gen_persona       per ON cab.ide_geper = per.ide_geper
                LEFT  JOIN sis_modulo        mod ON cab.ide_modu  = mod.ide_modu
                LEFT  JOIN sis_usuario       usu ON cab.ide_usua  = usu.ide_usua
                WHERE cab.ide_sucu = $1
                  AND cab.ide_empr = $2
                ORDER BY cab.fecha_trans_cnccc DESC, cab.ide_cnccc DESC
                `,
                dtoIn,
            );
            query.addIntParam(1, dtoIn.ideSucu);
            query.addIntParam(2, dtoIn.ideEmpr);
            return this.dataSource.createQuery(query);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener los comprobantes: ${msg}`);
        }
    }

    /**
     * Retorna la cabecera de un comprobante contable por su ID.
     */
    async getComprobanteCabeceraById(dtoIn: GetComprobanteByIdDto & HeaderParamsDto) {
        if (!dtoIn.ide_cnccc) {
            throw new BadRequestException('El campo ide_cnccc es requerido');
        }
        try {
            const query = new SelectQuery(`
                SELECT
                    cab.ide_cnccc,
                    cab.fecha_trans_cnccc,
                    cab.numero_cnccc,
                    cab.observacion_cnccc,
                    cab.fecha_siste_cnccc,
                    cab.hora_sistem_cnccc,
                    cab.automatico_cnccc,
                    cab.ide_empr,
                    cab.ide_sucu,
                    cab.ide_cneco,
                    eco.nombre_cneco,
                    cab.ide_cntcm,
                    tcm.nombre_cntcm,
                    cab.ide_geper,
                    per.nom_geper,
                    cab.ide_modu,
                    mod.nom_modu,
                    cab.ide_usua,
                    usu.nom_usua
                FROM con_cab_comp_cont cab
                INNER JOIN con_tipo_comproba tcm ON cab.ide_cntcm = tcm.ide_cntcm
                INNER JOIN con_estado_compro  eco ON cab.ide_cneco = eco.ide_cneco
                LEFT  JOIN gen_persona        per ON cab.ide_geper = per.ide_geper
                LEFT  JOIN sis_modulo         mod ON cab.ide_modu  = mod.ide_modu
                LEFT  JOIN sis_usuario        usu ON cab.ide_usua  = usu.ide_usua
                WHERE cab.ide_cnccc = $1
                  AND cab.ide_sucu  = $2
            `);
            query.setLazy(false);
            query.addIntParam(1, dtoIn.ide_cnccc);
            query.addIntParam(2, dtoIn.ideSucu);
            const rows = await this.dataSource.createSelectQuery(query);
            return rows && rows.length > 0 ? rows[0] : null;
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener comprobante: ${msg}`);
        }
    }

    /**
     * Retorna el detalle de un comprobante contable por su ID de cabecera.
     */
    async getComprobanteDetalleById(dtoIn: GetComprobanteByIdDto & HeaderParamsDto) {
        if (!dtoIn.ide_cnccc) {
            throw new BadRequestException('El campo ide_cnccc es requerido');
        }
        try {
            const query = new SelectQuery(`
                SELECT
                    det.ide_cndcc,
                    det.ide_cnccc,
                    det.ide_cnlap,
                    det.ide_cndpc,
                    dpc.codig_recur_cndpc,
                    dpc.nombre_cndpc,
                    det.valor_cndcc,
                    CASE WHEN det.ide_cnlap = 1 THEN det.valor_cndcc END AS debe,
                    CASE WHEN det.ide_cnlap = 0 THEN det.valor_cndcc END AS haber,
                    det.observacion_cndcc,
                    det.referencia_cndcc
                FROM con_det_comp_cont det
                LEFT JOIN con_det_plan_cuen dpc ON det.ide_cndpc = dpc.ide_cndpc
                WHERE det.ide_cnccc = $1
                ORDER BY det.ide_cnlap DESC
            `);
            query.setLazy(false);
            query.addIntParam(1, dtoIn.ide_cnccc);
            return this.dataSource.createSelectQuery(query);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener detalle del comprobante: ${msg}`);
        }
    }

    /**
     * Retorna el comprobante completo (cabecera + detalle) por su ID.
     */
    async getComprobanteById(dtoIn: GetComprobanteByIdDto & HeaderParamsDto) {
        if (!dtoIn.ide_cnccc) {
            throw new BadRequestException('El campo ide_cnccc es requerido');
        }
        try {
            const cabecera = await this.getComprobanteCabeceraById(dtoIn);
            const detalle = await this.getComprobanteDetalleById(dtoIn);
            return { cabecera, detalle };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener el comprobante: ${msg}`);
        }
    }

    /**
     * Crea o actualiza un comprobante contable con cabecera y detalles.
     * En UPDATE: actualiza la cabecera, elimina los detalles anteriores e inserta los nuevos.
     * En INSERT: genera secuenciales y persiste cabecera + detalles.
     */
    async save(dtoIn: SaveComprobanteDto & HeaderParamsDto) {
        try {
            if (!dtoIn.data) throw new BadRequestException('El campo data es requerido');
            if (!dtoIn.data.ide_cntcm) throw new BadRequestException('El tipo de comprobante (ide_cntcm) es requerido');
            if (!dtoIn.data.fecha_trans_cnccc) throw new BadRequestException('La fecha de transacción es requerida');

            const { data, detalles } = dtoIn;
            const isUpdate = dtoIn.isUpdate && !!data.ide_cnccc;

            if (isUpdate) {
                const ideCnccc = data.ide_cnccc;

                const updQuery: ObjectQueryDto = {
                    operation: 'update',
                    module: MODULE,
                    tableName: TABLE_CAB,
                    primaryKey: PK_CAB,
                    object: data,
                    condition: `${PK_CAB} = ${ideCnccc} AND ide_sucu = ${dtoIn.ideSucu}`,
                };
                const listQuery: ObjectQueryDto[] = [updQuery];

                if (detalles !== undefined) {
                    await this.reemplazarDetalles(ideCnccc, detalles, dtoIn);
                }

                return this.core.save({ ...dtoIn, listQuery, audit: true });
            }

            const ideCnccc = await this.dataSource.getSeqTable(
                `${MODULE}_${TABLE_CAB}`,
                PK_CAB,
                1,
                dtoIn.login,
            );
            data.ide_cnccc = ideCnccc;

            const listQuery: ObjectQueryDto[] = [];
            listQuery.push({
                operation: 'insert',
                module: MODULE,
                tableName: TABLE_CAB,
                primaryKey: PK_CAB,
                object: {
                    ...data,
                    ide_empr: dtoIn.ideEmpr,
                    ide_sucu: dtoIn.ideSucu,
                    usuario_ingre: dtoIn.login,
                    fecha_ingre: getCurrentDate(),
                    hora_ingre: getCurrentTime(),
                    fecha_siste_cnccc: getCurrentDate(),
                    hora_sistem_cnccc: getCurrentTime(),
                },
            });

            await this.core.save({ ...dtoIn, listQuery, audit: true });

            if (detalles && detalles.length > 0) {
                await this.insertarDetalles(ideCnccc, detalles, dtoIn);
            }

            return { message: 'ok', rowCount: 1, ide_cnccc: ideCnccc };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar el comprobante: ${msg}`);
        }
    }

    /**
     * Anula un comprobante contable cambiando su estado a ANULADO.
     * Busca automáticamente el ID del estado ANULADO si no se proporciona.
     */
    async anular(dtoIn: AnularComprobanteDto & HeaderParamsDto) {
        if (!dtoIn.ide_cnccc) {
            throw new BadRequestException('El campo ide_cnccc es requerido para anular');
        }
        try {
            let ideCneco = dtoIn.ide_cneco;
            if (!ideCneco) {
                const q = new SelectQuery(`
                    SELECT ide_cneco FROM con_estado_compro
                    WHERE UPPER(nombre_cneco) LIKE 'ANULADO%'
                    LIMIT 1
                `);
                q.setLazy(false);
                const rows = await this.dataSource.createSelectQuery(q);
                if (!rows || rows.length === 0) {
                    throw new BadRequestException('No se encontró el estado ANULADO en con_estado_compro');
                }
                ideCneco = rows[0].ide_cneco as number;
            }

            const updQuery = new UpdateQuery(`${MODULE}_${TABLE_CAB}`, PK_CAB);
            updQuery.values.set('ide_cneco', ideCneco);
            updQuery.values.set('usuario_actua', dtoIn.login);
            updQuery.values.set('fecha_actua', getCurrentDate());
            updQuery.values.set('hora_actua', getCurrentTime());
            updQuery.where = `${PK_CAB} = $1 AND ide_sucu = $2`;
            updQuery.addIntParam(1, dtoIn.ide_cnccc);
            updQuery.addIntParam(2, dtoIn.ideSucu);

            return this.dataSource.createQuery(updQuery);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al anular el comprobante: ${msg}`);
        }
    }

    /**
     * Elimina uno o varios comprobantes contables.
     */
    async deleteComprobantes(dtoIn: { ide: number[] } & HeaderParamsDto) {
        if (!dtoIn.ide || dtoIn.ide.length === 0) {
            throw new BadRequestException('Debe proporcionar al menos un ide_cnccc para eliminar');
        }
        try {
            const deleteQuery = new DeleteQuery(`${MODULE}_${TABLE_CAB}`);
            deleteQuery.where = `${PK_CAB} = ANY ($1) AND ide_sucu = $2`;
            deleteQuery.addParam(1, dtoIn.ide);
            deleteQuery.addIntParam(2, dtoIn.ideSucu);
            return this.dataSource.createQuery(deleteQuery);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al eliminar comprobantes: ${msg}`);
        }
    }

    // ─── MÉTODOS PRIVADOS ──────────────────────────────────────────────────

    private async reemplazarDetalles(
        ideCnccc: number,
        detalles: SaveComprobanteDto['detalles'],
        dtoIn: HeaderParamsDto,
    ) {
        if (!detalles || detalles.length === 0) return;

        await this.dataSource.pool.query(
            `DELETE FROM con_det_comp_cont WHERE ide_cnccc = $1`,
            [ideCnccc],
        );

        await this.insertarDetalles(ideCnccc, detalles, dtoIn);
    }

    private async insertarDetalles(
        ideCnccc: number,
        detalles: SaveComprobanteDto['detalles'],
        dtoIn: HeaderParamsDto,
    ) {
        if (!detalles || detalles.length === 0) return;

        for (const det of detalles) {
            const ideCndcc = await this.dataSource.getSeqTable(
                `${MODULE}_${TABLE_DET}`,
                PK_DET,
                1,
                dtoIn.login,
            );

            const detQuery: ObjectQueryDto = {
                operation: 'insert',
                module: MODULE,
                tableName: TABLE_DET,
                primaryKey: PK_DET,
                object: {
                    ide_cndcc: ideCndcc,
                    ide_cnccc: ideCnccc,
                    ide_cnlap: det.ide_cnlap,
                    ide_cndpc: det.ide_cndpc,
                    valor_cndcc: det.valor_cndcc,
                    observacion_cndcc: det.observacion_cndcc ?? null,
                    referencia_cndcc: det.referencia_cndcc ?? null,
                    ide_empr: dtoIn.ideEmpr,
                    ide_sucu: dtoIn.ideSucu,
                    usuario_ingre: dtoIn.login,
                    fecha_ingre: getCurrentDate(),
                    hora_ingre: getCurrentTime(),
                },
            };

            await this.core.save({ ...dtoIn, listQuery: [detQuery], audit: false });
        }
    }
}
