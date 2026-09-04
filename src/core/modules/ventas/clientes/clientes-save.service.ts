import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { DeleteQuery, InsertQuery, Query, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { isDefined } from 'src/util/helpers/common-util';
import { getCurrentDate, getCurrentDateTime, getCurrentTime, toPgDate } from 'src/util/helpers/date-util';

import { DeleteCabeceraTrnCxCDto } from './dto/delete-cabecera-trn-cxc.dto';
import { DetalleTrnItemCxCDto } from './dto/detalle-trn-item-cxc.dto';
import { MarcarSeguidorDto } from './dto/marcar-seguidor.dto';
import { MoverDetalleTrnCxCDto } from './dto/mover-detalle-trn-cxc.dto';
import { SaveDetalleCabeceraTrnCxCDto } from './dto/save-detalle-cabecera-trn-cxc.dto';
import { SaveDireccionPersonaDto } from './dto/save-direccion-persona.dto';
import { SetActivoDireccionDto } from './dto/set-activo-direccion.dto';

const TABLE_NAME = 'gen_direccion_persona';
const BASE_TABLE_NAME = 'direccion_persona';
const PRIMARY_KEY = 'ide_gedirp';

@Injectable()
export class ClientesSaveService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
    }

    async saveDireccionPersona(dtoIn: SaveDireccionPersonaDto & HeaderParamsDto) {
        const isUpdate = dtoIn.ide_gedirp != null;
        const listQuery: ObjectQueryDto[] = [];
        let ide_gedirp: number;

        const object: Record<string, unknown> = {
            ide_geper: dtoIn.ide_geper,
            ide_getidi: dtoIn.ide_getidi ?? null,
            ide_gepais: dtoIn.ide_gepais ?? null,
            ide_geprov: dtoIn.ide_geprov ?? null,
            ide_gecant: dtoIn.ide_gecant ?? null,
            nombre_dir_gedirp: dtoIn.nombre_dir_gedirp ?? null,
            correo_gedirp: dtoIn.correo_gedirp ?? null,
            direccion_gedirp: dtoIn.direccion_gedirp ?? null,
            referencia_gedirp: dtoIn.referencia_gedirp ?? null,
            longitud_gedirp: dtoIn.longitud_gedirp ?? null,
            latitud_gedirp: dtoIn.latitud_gedirp ?? null,
            telefono_gedirp: dtoIn.telefono_gedirp ?? null,
            movil_gedirp: dtoIn.movil_gedirp ?? null,
            defecto_gedirp: dtoIn.defecto_gedirp ?? false,
            ide_gegen: dtoIn.ide_gegen ?? null,
        };

        if (isUpdate) {
            ide_gedirp = dtoIn.ide_gedirp!;
            object.ide_gedirp = ide_gedirp;
            listQuery.push({
                operation: 'update',
                module: 'gen',
                tableName: BASE_TABLE_NAME,
                primaryKey: PRIMARY_KEY,
                object,
            });
        } else {
            ide_gedirp = await this.dataSource.getSeqTable(TABLE_NAME, PRIMARY_KEY, 1, dtoIn.login);
            object.ide_gedirp = ide_gedirp;
            listQuery.push({
                operation: 'insert',
                module: 'gen',
                tableName: BASE_TABLE_NAME,
                primaryKey: PRIMARY_KEY,
                object,
            });
        }

        await this.core.save({ ...dtoIn, listQuery, audit: false });
        return { message: 'ok', ide_gedirp };
    }

    async setActivoDireccionPersona(dtoIn: SetActivoDireccionDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE ${TABLE_NAME} SET activo_gedirp = $1 WHERE ${PRIMARY_KEY} = $2`,
            [dtoIn.activo, dtoIn.ide],
        );
        return { message: 'ok' };
    }

    async deleteDireccionPersona(dtoIn: SetActivoDireccionDto & HeaderParamsDto) {
        const listQuery: ObjectQueryDto[] = [{
            operation: 'delete',
            module: 'gen',
            tableName: BASE_TABLE_NAME,
            primaryKey: PRIMARY_KEY,
            object: { ide_gedirp: dtoIn.ide },
            condition: `${PRIMARY_KEY} = ${dtoIn.ide}`,
        }];

        await this.core.save({ ...dtoIn, listQuery, audit: false });
        return { message: 'ok' };
    }

    /**
     * Marca a un cliente como seguidor en redes sociales (Instagram/TikTok/Facebook, campo
     * único genérico). Es de una sola vía: el WHERE exige que todavía esté en false, así que
     * nunca revierte a false y una segunda llamada no encuentra fila que actualizar.
     *
     * Junto con la marca, otorga el beneficio de descuento_seguidor_geper = true: un 5% de
     * descuento aplicable en una sola factura (ver FacturasSaveService.aplicarDescuentoSeguidor),
     * que se consume (pasa a false) la primera vez que se usa.
     */
    async marcarSeguidorRedes(dtoIn: MarcarSeguidorDto & HeaderParamsDto) {
        const result = await this.dataSource.pool.query(
            `UPDATE gen_persona
             SET es_seguidor_geper = true, fecha_seguidor_geper = $1, usuario_seguidor_geper = $2,
                 descuento_seguidor_geper = true
             WHERE ide_geper = $3 AND (es_seguidor_geper IS NOT TRUE)
             RETURNING fecha_seguidor_geper, usuario_seguidor_geper`,
            [getCurrentDateTime(), dtoIn.login, dtoIn.ide_geper],
        );
        if (result.rows.length === 0) {
            throw new BadRequestException('El cliente ya está marcado como seguidor o no existe.');
        }
        return { message: 'ok', ...result.rows[0] };
    }

    // ─── Editar Transacciones CxC (mirror de ProveedorSaveService, ver plan) ───

    /**
     * Guardado tipo-diff (crear/actualizar/eliminar, nunca borrar-y-recrear) del detalle
     * completo de una cabecera de transacción CxC. `dtoIn.detalles` representa el estado
     * final deseado: filas con ide_ccdtr existente → UPDATE in-place; sin ide_ccdtr →
     * INSERT; filas que ya no vienen en el payload → DELETE. Antes de comitear valida
     * que el saldo resultante (Σ valor_ccdtr * signo_ccttr) no quede negativo.
     */
    async saveDetalleCabeceraTrn(dtoIn: SaveDetalleCabeceraTrnCxCDto & HeaderParamsDto) {
        try {
            const qCab = new SelectQuery(`
                SELECT ide_ccctr FROM cxc_cabece_transa WHERE ide_ccctr = $1 AND ide_geper = $2
            `);
            qCab.addIntParam(1, dtoIn.ide_ccctr);
            qCab.addIntParam(2, dtoIn.ide_geper);
            const cab = await this.dataSource.createSingleQuery(qCab);
            if (!cab) {
                throw new BadRequestException(
                    `La cabecera ide_ccctr=${dtoIn.ide_ccctr} no existe o no pertenece al cliente.`,
                );
            }

            const qExistentes = new SelectQuery(`
                SELECT ide_ccdtr, ide_ccttr, ide_cccfa, fecha_trans_ccdtr, fecha_venci_ccdtr,
                       valor_ccdtr, docum_relac_ccdtr, observacion_ccdtr, ide_cnccc, ide_teclb, numero_pago_ccdtr
                FROM cxc_detall_transa WHERE ide_ccctr = $1
            `);
            qExistentes.addIntParam(1, dtoIn.ide_ccctr);
            const existentes: Record<string, any>[] = await this.dataSource.createSelectQuery(qExistentes);
            const existentesPorId = new Map(existentes.map((r) => [Number(r.ide_ccdtr), r]));
            const idsExistentes = new Set(existentesPorId.keys());

            const toUpdate = dtoIn.detalles.filter((d) => isDefined(d.ide_ccdtr));
            const toInsert = dtoIn.detalles.filter((d) => !isDefined(d.ide_ccdtr));

            const idsIncoming = new Set<number>();
            for (const d of toUpdate) {
                const id = Number(d.ide_ccdtr);
                if (!idsExistentes.has(id)) {
                    throw new BadRequestException(
                        `La línea ide_ccdtr=${id} no pertenece a la cabecera ide_ccctr=${dtoIn.ide_ccctr}.`,
                    );
                }
                if (idsIncoming.has(id)) {
                    throw new BadRequestException(`La línea ide_ccdtr=${id} está repetida en el detalle enviado.`);
                }
                idsIncoming.add(id);
            }

            const toDeleteIds = [...idsExistentes].filter((id) => !idsIncoming.has(id));
            for (const id of toDeleteIds) {
                const existente = existentesPorId.get(id)!;
                if (isDefined(existente.ide_cnccc) || isDefined(existente.ide_teclb)) {
                    throw new BadRequestException(
                        `La línea ide_ccdtr=${id} ya está vinculada a un asiento contable o al libro de bancos; desvincúlela (editando esos campos a vacío) antes de eliminarla.`,
                    );
                }
            }

            const listQuery: Query[] = [];

            if (toDeleteIds.length > 0) {
                const delDetalles = new DeleteQuery('cxc_detall_transa');
                delDetalles.where = 'ide_ccdtr = ANY($1) AND ide_ccctr = $2';
                delDetalles.addParam(1, toDeleteIds);
                delDetalles.addIntParam(2, dtoIn.ide_ccctr);
                listQuery.push(delDetalles);
            }

            for (const d of toUpdate) {
                const id = Number(d.ide_ccdtr);
                if (this.detalleTrnSinCambios(d, existentesPorId.get(id)!)) continue;
                const q = new UpdateQuery('cxc_detall_transa', 'ide_ccdtr', dtoIn);
                q.where = 'ide_ccdtr = $1 AND ide_ccctr = $2';
                q.addIntParam(1, id);
                q.addIntParam(2, dtoIn.ide_ccctr);
                q.values.set('ide_ccttr', d.ide_ccttr);
                q.values.set('ide_cccfa', d.ide_cccfa ?? null);
                q.values.set('fecha_trans_ccdtr', toPgDate(d.fecha_trans_ccdtr));
                q.values.set('fecha_venci_ccdtr', toPgDate(d.fecha_venci_ccdtr) ?? toPgDate(d.fecha_trans_ccdtr));
                q.values.set('valor_ccdtr', d.valor_ccdtr);
                q.values.set('docum_relac_ccdtr', d.docum_relac_ccdtr ?? null);
                q.values.set('observacion_ccdtr', d.observacion_ccdtr ?? null);
                q.values.set('ide_cnccc', d.ide_cnccc ?? null);
                q.values.set('ide_teclb', d.ide_teclb ?? null);
                listQuery.push(q);
            }

            if (toInsert.length > 0) {
                const maxPagoActual = existentes.reduce(
                    (max, r) => Math.max(max, Number(r.numero_pago_ccdtr ?? 0)),
                    0,
                );
                const baseIdeCcdtr = await this.dataSource.getSeqTable(
                    'cxc_detall_transa', 'ide_ccdtr', toInsert.length, dtoIn.login,
                );
                toInsert.forEach((d, idx) => {
                    const q = new InsertQuery('cxc_detall_transa', 'ide_ccdtr', dtoIn);
                    q.values.set('ide_ccdtr', baseIdeCcdtr + idx);
                    q.values.set('ide_ccctr', dtoIn.ide_ccctr);
                    q.values.set('ide_ccttr', d.ide_ccttr);
                    q.values.set('ide_cccfa', d.ide_cccfa ?? null);
                    q.values.set('ide_usua', dtoIn.ideUsua);
                    q.values.set('fecha_trans_ccdtr', toPgDate(d.fecha_trans_ccdtr));
                    q.values.set('fecha_venci_ccdtr', toPgDate(d.fecha_venci_ccdtr) ?? toPgDate(d.fecha_trans_ccdtr));
                    q.values.set('valor_ccdtr', d.valor_ccdtr);
                    q.values.set('docum_relac_ccdtr', d.docum_relac_ccdtr ?? null);
                    q.values.set('observacion_ccdtr', d.observacion_ccdtr ?? null);
                    q.values.set('numero_pago_ccdtr', maxPagoActual + idx + 1);
                    q.values.set('ide_cnccc', d.ide_cnccc ?? null);
                    q.values.set('ide_teclb', d.ide_teclb ?? null);
                    q.values.set('fecha_ingre', getCurrentDate());
                    q.values.set('hora_ingre', getCurrentTime());
                    listQuery.push(q);
                });
            }

            const mapaSigno = await this.getMapaSignoTipoTransaccionCxC();
            const saldoResultante = dtoIn.detalles.reduce(
                (acc, d) => acc + Number(d.valor_ccdtr) * (mapaSigno.get(Number(d.ide_ccttr)) ?? 0),
                0,
            );
            if (saldoResultante < -0.005) {
                throw new BadRequestException(
                    'La transacción quedaría descuadrada en contra: los egresos superan a los ingresos. Verifique los valores.',
                );
            }

            await this.dataSource.createListQuery(listQuery);

            const estado = Math.abs(saldoResultante) < 0.005 ? 'cuadrada' : 'pendiente_cobro';
            return { message: 'ok', ide_ccctr: dtoIn.ide_ccctr, saldo: saldoResultante, estado };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar el detalle de la transacción: ${msg}`);
        }
    }

    /**
     * Reasigna una línea de cxc_detall_transa a otra cabecera del mismo cliente.
     * Acción atómica separada del guardado por lote porque afecta el cuadre de DOS
     * cabeceras (origen y destino) a la vez; ambas deben seguir con saldo >= 0.
     */
    async moverDetalleTrn(dtoIn: MoverDetalleTrnCxCDto & HeaderParamsDto) {
        try {
            const qFila = new SelectQuery(`
                SELECT dt.ide_ccdtr, dt.ide_ccctr, dt.ide_ccttr, dt.valor_ccdtr
                FROM cxc_detall_transa dt
                INNER JOIN cxc_cabece_transa ct ON ct.ide_ccctr = dt.ide_ccctr
                WHERE dt.ide_ccdtr = $1 AND ct.ide_geper = $2
            `);
            qFila.addIntParam(1, dtoIn.ide_ccdtr);
            qFila.addIntParam(2, dtoIn.ide_geper);
            const fila = await this.dataSource.createSingleQuery(qFila);
            if (!fila) {
                throw new BadRequestException(
                    `La línea ide_ccdtr=${dtoIn.ide_ccdtr} no existe o no pertenece al cliente.`,
                );
            }
            if (Number(fila.ide_ccctr) === Number(dtoIn.ide_ccctr_destino)) {
                throw new BadRequestException('La cabecera destino es la misma cabecera actual.');
            }

            const qDestino = new SelectQuery(`
                SELECT ide_ccctr FROM cxc_cabece_transa WHERE ide_ccctr = $1 AND ide_geper = $2
            `);
            qDestino.addIntParam(1, dtoIn.ide_ccctr_destino);
            qDestino.addIntParam(2, dtoIn.ide_geper);
            const destino = await this.dataSource.createSingleQuery(qDestino);
            if (!destino) {
                throw new BadRequestException(
                    `La cabecera destino ide_ccctr=${dtoIn.ide_ccctr_destino} no existe o no pertenece al cliente.`,
                );
            }

            const mapaSigno = await this.getMapaSignoTipoTransaccionCxC();
            const saldoCabecera = async (
                ideCcctr: number,
                excluirIdeCcdtr?: number,
                agregarFila?: { ide_ccttr: number; valor_ccdtr: number },
            ) => {
                const q = new SelectQuery(`
                    SELECT ide_ccdtr, ide_ccttr, valor_ccdtr FROM cxc_detall_transa WHERE ide_ccctr = $1
                `);
                q.addIntParam(1, ideCcctr);
                const filas: any[] = await this.dataSource.createSelectQuery(q);
                let saldo = filas
                    .filter((f) => Number(f.ide_ccdtr) !== excluirIdeCcdtr)
                    .reduce((acc, f) => acc + Number(f.valor_ccdtr) * (mapaSigno.get(Number(f.ide_ccttr)) ?? 0), 0);
                if (agregarFila) {
                    saldo += agregarFila.valor_ccdtr * (mapaSigno.get(agregarFila.ide_ccttr) ?? 0);
                }
                return saldo;
            };

            const saldoOrigen = await saldoCabecera(Number(fila.ide_ccctr), Number(fila.ide_ccdtr));
            const saldoDestino = await saldoCabecera(Number(dtoIn.ide_ccctr_destino), undefined, {
                ide_ccttr: Number(fila.ide_ccttr),
                valor_ccdtr: Number(fila.valor_ccdtr),
            });

            if (saldoOrigen < -0.005 || saldoDestino < -0.005) {
                throw new BadRequestException(
                    'No se puede mover la línea: la cabecera de origen o la de destino quedaría con egresos mayores a sus ingresos.',
                );
            }

            const q = new UpdateQuery('cxc_detall_transa', 'ide_ccdtr', dtoIn);
            q.where = 'ide_ccdtr = $1';
            q.addIntParam(1, dtoIn.ide_ccdtr);
            q.values.set('ide_ccctr', dtoIn.ide_ccctr_destino);
            await this.dataSource.createListQuery([q]);

            const estadoDe = (s: number) => (Math.abs(s) < 0.005 ? 'cuadrada' : s > 0 ? 'pendiente_cobro' : 'descuadrada');
            return {
                message: 'ok',
                origen: { ide_ccctr: Number(fila.ide_ccctr), saldo: saldoOrigen, estado: estadoDe(saldoOrigen) },
                destino: {
                    ide_ccctr: Number(dtoIn.ide_ccctr_destino),
                    saldo: saldoDestino,
                    estado: estadoDe(saldoDestino),
                },
            };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al mover la línea de detalle: ${msg}`);
        }
    }

    /** Elimina una cabecera de transacción CxC; solo si no tiene detalle asociado. */
    async deleteCabeceraTrn(dtoIn: DeleteCabeceraTrnCxCDto & HeaderParamsDto) {
        try {
            const qCab = new SelectQuery(`
                SELECT ide_ccctr FROM cxc_cabece_transa WHERE ide_ccctr = $1 AND ide_geper = $2
            `);
            qCab.addIntParam(1, dtoIn.ide_ccctr);
            qCab.addIntParam(2, dtoIn.ide_geper);
            const cab = await this.dataSource.createSingleQuery(qCab);
            if (!cab) {
                throw new BadRequestException(
                    `La cabecera ide_ccctr=${dtoIn.ide_ccctr} no existe o no pertenece al cliente.`,
                );
            }

            const qCount = new SelectQuery(`
                SELECT COUNT(*) AS cantidad FROM cxc_detall_transa WHERE ide_ccctr = $1
            `);
            qCount.addIntParam(1, dtoIn.ide_ccctr);
            const conteo = await this.dataSource.createSingleQuery(qCount);
            if (Number(conteo?.cantidad ?? 0) > 0) {
                throw new BadRequestException('La cabecera tiene detalle asociado, no se puede eliminar.');
            }

            const del = new DeleteQuery('cxc_cabece_transa');
            del.where = 'ide_ccctr = $1';
            del.addIntParam(1, dtoIn.ide_ccctr);
            await this.dataSource.createListQuery([del]);

            return { message: 'ok', ide_ccctr: dtoIn.ide_ccctr };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al eliminar la cabecera: ${msg}`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS PRIVADOS — Editar Transacciones CxC
    // ─────────────────────────────────────────────────────────────────────────

    private async getMapaSignoTipoTransaccionCxC(): Promise<Map<number, number>> {
        const q = new SelectQuery(`SELECT ide_ccttr, signo_ccttr FROM cxc_tipo_transacc`);
        const rows: any[] = await this.dataSource.createSelectQuery(q);
        return new Map(rows.map((r) => [Number(r.ide_ccttr), Number(r.signo_ccttr)]));
    }

    private detalleTrnSinCambios(d: DetalleTrnItemCxCDto, existente: Record<string, any>): boolean {
        const norm = (v: unknown) => (v === undefined || v === null || v === '' ? null : v);
        return (
            Number(d.ide_ccttr) === Number(existente.ide_ccttr) &&
            Number(norm(d.ide_cccfa) ?? -1) === Number(existente.ide_cccfa ?? -1) &&
            toPgDate(d.fecha_trans_ccdtr) === toPgDate(existente.fecha_trans_ccdtr) &&
            toPgDate(d.fecha_venci_ccdtr) === toPgDate(existente.fecha_venci_ccdtr) &&
            Number(d.valor_ccdtr) === Number(existente.valor_ccdtr) &&
            String(norm(d.docum_relac_ccdtr) ?? '') === String(existente.docum_relac_ccdtr ?? '') &&
            String(norm(d.observacion_ccdtr) ?? '') === String(existente.observacion_ccdtr ?? '') &&
            Number(norm(d.ide_cnccc) ?? -1) === Number(existente.ide_cnccc ?? -1) &&
            Number(norm(d.ide_teclb) ?? -1) === Number(existente.ide_teclb ?? -1)
        );
    }
}
