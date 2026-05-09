import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';

import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { DeleteQuery, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { getCurrentDate, getCurrentTime } from 'src/util/helpers/date-util';

import {
    AnularComprobanteDto,
    GetComprobanteByIdDto,
    GetComprobantesDto,
    ReversarComprobanteDto,
    SaveComprobanteDto,
} from './dto/comprobante-contabilidad.dto';

const MODULE = 'con';
const TABLE_CAB = 'cab_comp_cont';
const TABLE_DET = 'det_comp_cont';
const PK_CAB = 'ide_cnccc';
const PK_DET = 'ide_cndcc';

@Injectable()
export class ComprobanteContabilidadService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        this.core
            .getVariables([
                'p_con_estado_comprobante_normal',
                'p_con_lugar_debe',
                'p_con_lugar_haber',
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    private get lugarDebe(): string {
        return this.variables.get('p_con_lugar_debe') || '1';
    }

    private get lugarHaber(): string {
        return this.variables.get('p_con_lugar_haber') || '0';
    }

    private get estadoNormal(): string {
        return this.variables.get('p_con_estado_comprobante_normal') || '1';
    }

    /**
     * Lista los comprobantes contables de la sucursal en un rango de fechas con paginación y filtros.
     */
    async getComprobantes(dtoIn: GetComprobantesDto & HeaderParamsDto) {
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
                  AND cab.fecha_trans_cnccc BETWEEN $3 AND $4
                ORDER BY cab.fecha_trans_cnccc DESC, cab.ide_cnccc DESC
                `,
                dtoIn,
            );
            query.addIntParam(1, dtoIn.ideSucu);
            query.addIntParam(2, dtoIn.ideEmpr);
            query.addStringParam(3, dtoIn.fechaInicio);
            query.addStringParam(4, dtoIn.fechaFin);
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
                    usu.nom_usua,
                    cab.usuario_ingre,
                    cab.fecha_ingre,
                    cab.hora_ingre,
                    cab.usuario_actua,
                    cab.fecha_actua,
                    cab.hora_actua
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
                    det.referencia_cndcc,
                    det.fecha_ingre,
                    det.hora_ingre,
                    det.usuario_ingre,
                    det.fecha_actua,
                    det.hora_actua,
                    det.usuario_actua
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
     * El número de comprobante se genera automáticamente al crear.
     * Valida periodo activo, balance DEBE=HABER y resume detalles duplicados.
     */
    async save(dtoIn: SaveComprobanteDto & HeaderParamsDto) {
        try {
            if (!dtoIn.data) throw new BadRequestException('El campo data es requerido');
            if (!dtoIn.data.ide_cntcm) throw new BadRequestException('El tipo de comprobante (ide_cntcm) es requerido');

            const { data, detalles } = dtoIn;
            const isUpdate = dtoIn.isUpdate && !!data.ide_cnccc;

            // Aplicar valores por defecto en cabecera
            if (!data.ide_cneco) {
                data.ide_cneco = Number(this.estadoNormal);
            }
            if (!data.fecha_trans_cnccc) {
                data.fecha_trans_cnccc = getCurrentDate();
            }
            data.ide_usua = dtoIn.ideUsua;

            // Validar periodo contable activo
            if (!(await this.isPeriodoValido(data.fecha_trans_cnccc, dtoIn.ideSucu))) {
                throw new BadRequestException(`No existe un periodo contable activo que contenga la fecha ${data.fecha_trans_cnccc}`);
            }

            // Resumir detalles (agrupar cuentas duplicadas con mismo lugar y observación)
            const detallesResumidos = this.resumirDetalles(detalles ?? []);

            // Validar que todos los detalles tengan una cuenta contable válida
            for (const det of detallesResumidos) {
                if (!det.ide_cndpc || det.ide_cndpc <= 0) {
                    throw new BadRequestException(
                        'Todos los detalles deben tener una cuenta contable válida (ide_cndpc)',
                    );
                }
            }

            // Validar comprobante (detalles no vacío y balanceado)
            await this.validarComprobante(detallesResumidos);

            if (isUpdate) {
                const ideCnccc = data.ide_cnccc;

                // Verificar si la fecha cambió de mes/año respecto al número actual
                const qNumero = new SelectQuery(`
                    SELECT numero_cnccc, ide_cntcm FROM con_cab_comp_cont
                    WHERE ide_cnccc = $1 AND ide_sucu = $2
                `);
                qNumero.setLazy(false);
                qNumero.addIntParam(1, ideCnccc);
                qNumero.addIntParam(2, dtoIn.ideSucu);
                const rowsCab = await this.dataSource.createSelectQuery(qNumero);
                const numeroActual: string = rowsCab?.[0]?.numero_cnccc ?? '';
                const ideCntcmActual: number = rowsCab?.[0]?.ide_cntcm ?? data.ide_cntcm;

                const fechaObj = new Date(data.fecha_trans_cnccc);
                const prefijoNuevo =
                    fechaObj.getFullYear().toString() +
                    (fechaObj.getMonth() + 1).toString().padStart(2, '0') +
                    dtoIn.ideSucu.toString();

                if (!numeroActual.startsWith(prefijoNuevo)) {
                    // La fecha cambió de mes/año → regenerar número
                    data.numero_cnccc = await this.getSecuencial(
                        data.fecha_trans_cnccc,
                        String(data.ide_cntcm ?? ideCntcmActual),
                        dtoIn.ideSucu,
                    );
                } else {
                    // Mismo mes/año → conservar el número existente
                    data.numero_cnccc = numeroActual;
                }

                const updQuery: ObjectQueryDto = {
                    operation: 'update',
                    module: MODULE,
                    tableName: TABLE_CAB,
                    primaryKey: PK_CAB,
                    object: data,
                    condition: `${PK_CAB} = ${ideCnccc} AND ide_sucu = ${dtoIn.ideSucu}`,
                };
                const listQuery: ObjectQueryDto[] = [updQuery];

                if (detallesResumidos.length > 0) {
                    await this.reemplazarDetalles(ideCnccc, detallesResumidos, dtoIn);
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

            const numero = await this.getSecuencial(data.fecha_trans_cnccc, String(data.ide_cntcm), dtoIn.ideSucu);
            data.numero_cnccc = numero;

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

            if (detallesResumidos.length > 0) {
                await this.insertarDetalles(ideCnccc, detallesResumidos, dtoIn);
            }

            return { message: 'ok', rowCount: 1, ide_cnccc: ideCnccc, numero_cnccc: numero };
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
     * Reversa un comprobante contable: crea un nuevo comprobante con los mismos detalles
     * pero con el DEBE y HABER invertidos.
     */
    async reversar(dtoIn: ReversarComprobanteDto & HeaderParamsDto) {
        if (!dtoIn.ide_cnccc) {
            throw new BadRequestException('El campo ide_cnccc es requerido para reversar');
        }
        try {
            const cabecera = await this.getComprobanteCabeceraById({ ide_cnccc: dtoIn.ide_cnccc, ...dtoIn });
            if (!cabecera) {
                throw new BadRequestException(`No se encontró el comprobante ${dtoIn.ide_cnccc}`);
            }

            const detalles = await this.getComprobanteDetalleById({ ide_cnccc: dtoIn.ide_cnccc, ...dtoIn });

            const observacion = dtoIn.observacion
                ? `Reversa Comprobante Num: ${dtoIn.ide_cnccc} obs. (${dtoIn.observacion})`
                : `Reversa Comprobante Num: ${dtoIn.ide_cnccc} obs. (${cabecera.observacion_cnccc || ''})`;

            const fechaHoy = getCurrentDate();

            const reversedDetalles = (detalles as any[]).map((det) => ({
                ide_cnlap:
                    String(det.ide_cnlap) === this.lugarDebe
                        ? Number(this.lugarHaber)
                        : Number(this.lugarDebe),
                ide_cndpc: det.ide_cndpc,
                valor_cndcc: det.valor_cndcc,
                observacion_cndcc: det.observacion_cndcc ?? null,
                referencia_cndcc: det.referencia_cndcc ?? null,
            }));

            const saveDto: SaveComprobanteDto & HeaderParamsDto = {
                ...dtoIn,
                isUpdate: false,
                data: {
                    ide_cntcm: cabecera.ide_cntcm,
                    ide_cneco: Number(this.estadoNormal),
                    ide_modu: cabecera.ide_modu ?? null,
                    ide_geper: cabecera.ide_geper ?? null,
                    fecha_trans_cnccc: fechaHoy,
                    observacion_cnccc: observacion,
                    automatico_cnccc: false,
                },
                detalles: reversedDetalles,
            };

            return this.save(saveDto);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al reversar el comprobante: ${msg}`);
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

    /**
     * Verifica que la fecha corresponda a un periodo contable activo y no cerrado.
     */
    private async isPeriodoValido(fecha: string, ideSucu: number): Promise<boolean> {
        const query = new SelectQuery(`
            SELECT ide_cnper FROM con_periodo
            WHERE $1::date BETWEEN fecha_inicio_cnper AND fecha_fin_cnper
              AND ide_sucu = $2
              AND estado_cnper = true
              AND cerrado_cnper = false
            LIMIT 1
        `);
        query.setLazy(false);
        query.addStringParam(1, fecha);
        query.addIntParam(2, ideSucu);
        const rows = await this.dataSource.createSelectQuery(query);
        return rows && rows.length > 0;
    }

    /**
     * Valida que el comprobante tenga detalles y que el total DEBE sea igual al total HABER.
     */
    private async validarComprobante(
        detalles: SaveComprobanteDto['detalles'],
    ): Promise<void> {
        if (!detalles || detalles.length === 0) {
            throw new BadRequestException('El comprobante no tiene detalles de cuentas');
        }

        const lugarDebeVal = this.lugarDebe;
        const lugarHaberVal = this.lugarHaber;
        let totalDebe = 0;
        let totalHaber = 0;

        for (const det of detalles) {
            if (String(det.ide_cnlap) === lugarDebeVal) {
                totalDebe += Number(det.valor_cndcc);
            } else if (String(det.ide_cnlap) === lugarHaberVal) {
                totalHaber += Number(det.valor_cndcc);
            }
        }

        const diferencia = Math.round((totalDebe - totalHaber) * 100) / 100;
        if (diferencia !== 0) {
            throw new BadRequestException(
                `Comprobante no válido: diferencia de ${diferencia} entre debe (${totalDebe}) y haber (${totalHaber})`,
            );
        }
    }

    /**
     * Resume los detalles agrupando y acumulando cuando existen varias líneas
     * con la misma cuenta (ide_cndpc), mismo lugar (ide_cnlap) y misma observación.
     */
    private resumirDetalles(
        detalles: SaveComprobanteDto['detalles'],
    ): SaveComprobanteDto['detalles'] {
        if (!detalles || detalles.length === 0) return [];

        const mapa = new Map<string, (typeof detalles)[0]>();

        for (const det of detalles) {
            const clave = `${det.ide_cndpc}|${det.ide_cnlap}|${det.observacion_cndcc ?? ''}`;

            if (mapa.has(clave)) {
                const existente = mapa.get(clave)!;
                existente.valor_cndcc = Number(
                    (Number(existente.valor_cndcc) + Number(det.valor_cndcc)).toFixed(2),
                );
            } else {
                mapa.set(clave, { ...det, valor_cndcc: Number(Number(det.valor_cndcc).toFixed(2)) });
            }
        }

        return Array.from(mapa.values());
    }

    /**
     * Genera el número secuencial del comprobante para la sucursal,
     * a partir de la fecha y el tipo de comprobante.
     * Formato: YYYYMM + IDE_SUCU + 8-digit secuencial
     */
    private async getSecuencial(
        fechaTrans: string,
        ideCntcm: string,
        ideSucu: number,
    ): Promise<string> {
        const fecha = new Date(fechaTrans);
        const ano = fecha.getFullYear().toString();
        const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
        const sucu = ideSucu.toString();
        const prefijo = ano + mes + sucu;
        const prefijoLen = prefijo.length;

        const query = new SelectQuery(`
            SELECT COALESCE(
                MAX(CAST(SUBSTRING(numero_cnccc FROM ${prefijoLen + 1}) AS BIGINT)), 0
            ) AS maximo
            FROM con_cab_comp_cont
            WHERE numero_cnccc LIKE '${prefijo}%'
              AND ide_cntcm = $1
              AND ide_sucu = $2
        `);
        query.setLazy(false);
        query.addIntParam(1, Number(ideCntcm));
        query.addIntParam(2, ideSucu);

        const rows = await this.dataSource.createSelectQuery(query);
        const maximo = rows && rows.length > 0 ? Number(rows[0].maximo || 0) : 0;
        const siguiente = (maximo + 1).toString().padStart(8, '0');

        return prefijo + siguiente;
    }

    private async reemplazarDetalles(
        ideCnccc: number,
        detalles: SaveComprobanteDto['detalles'],
        dtoIn: HeaderParamsDto,
    ) {
        if (!detalles || detalles.length === 0) return;

        // Obtener detalles actuales en BD
        const queryExist = new SelectQuery(`
            SELECT ide_cndcc, ide_cnlap, ide_cndpc, valor_cndcc,
                   observacion_cndcc, referencia_cndcc
            FROM con_det_comp_cont
            WHERE ide_cnccc = $1
        `);
        queryExist.setLazy(false);
        queryExist.addIntParam(1, ideCnccc);
        const existentes = (await this.dataSource.createSelectQuery(queryExist)) as Array<{
            ide_cndcc: number;
            ide_cnlap: number;
            ide_cndpc: number;
            valor_cndcc: number;
            observacion_cndcc: string | null;
            referencia_cndcc: string | null;
        }>;

        const idsEnviados = new Set<number>();
        const nuevos: NonNullable<SaveComprobanteDto['detalles']> = [];

        for (const det of detalles) {
            if (det.ide_cndcc) {
                idsEnviados.add(det.ide_cndcc);
                const existente = existentes.find((e) => e.ide_cndcc === det.ide_cndcc);
                const cambiado =
                    !existente ||
                    existente.ide_cnlap !== det.ide_cnlap ||
                    existente.ide_cndpc !== det.ide_cndpc ||
                    Number(existente.valor_cndcc) !== Number(det.valor_cndcc) ||
                    (existente.observacion_cndcc ?? null) !== (det.observacion_cndcc ?? null) ||
                    (existente.referencia_cndcc ?? null) !== (det.referencia_cndcc ?? null);

                if (cambiado) {
                    const updDet = new UpdateQuery(`${MODULE}_${TABLE_DET}`, PK_DET);
                    updDet.values.set('ide_cnlap', det.ide_cnlap);
                    updDet.values.set('ide_cndpc', det.ide_cndpc);
                    updDet.values.set('valor_cndcc', det.valor_cndcc);
                    updDet.values.set('observacion_cndcc', det.observacion_cndcc ?? null);
                    updDet.values.set('referencia_cndcc', det.referencia_cndcc ?? null);
                    updDet.values.set('usuario_actua', dtoIn.login);
                    updDet.values.set('fecha_actua', getCurrentDate());
                    updDet.values.set('hora_actua', getCurrentTime());
                    updDet.where = `${PK_DET} = $1`;
                    updDet.addIntParam(1, det.ide_cndcc);
                    await this.dataSource.createQuery(updDet);
                }
            } else {
                nuevos.push(det);
            }
        }

        // Eliminar los que ya no están en la lista enviada
        const idsEliminar = existentes
            .map((e) => e.ide_cndcc)
            .filter((id) => !idsEnviados.has(id));

        if (idsEliminar.length > 0) {
            const delDet = new DeleteQuery(`${MODULE}_${TABLE_DET}`);
            delDet.where = `${PK_DET} = ANY ($1)`;
            delDet.addParam(1, idsEliminar);
            await this.dataSource.createQuery(delDet);
        }

        // Insertar los nuevos
        if (nuevos.length > 0) {
            await this.insertarDetalles(ideCnccc, nuevos, dtoIn);
        }
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
