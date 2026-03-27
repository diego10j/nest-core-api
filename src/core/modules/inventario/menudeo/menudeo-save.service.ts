import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { BaseService } from '../../../../common/base-service';
import { HeaderParamsDto } from '../../../../common/dto/common-params.dto';
import { ObjectQueryDto } from '../../../connection/dto';
import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery } from '../../../connection/helpers/select-query';
import { UpdateQuery } from '../../../connection/helpers/update-query';
import { getCurrentDate, getCurrentTime } from '../../../../util/helpers/date-util';
import { CoreService } from '../../../core.service';

import { IdFormaDto } from './dto/id-forma.dto';
import { IdMenudeoDto } from './dto/id-menudeo.dto';
import { IdPresentacionDto } from './dto/id-presentacion.dto';
import { IdTipoCompDto } from './dto/id-tipo-comp.dto';
import { IdTipoTranDto } from './dto/id-tipo-tran.dto';
import { SaveFormaDto } from './dto/save-forma.dto';
import { CopiarPresentacionDto } from './dto/copiar-presentacion.dto';
import { SaveMenudeoDto } from './dto/save-menudeo.dto';
import { SavePresentacionDto } from './dto/save-presentacion.dto';
import { SaveTipoCompDto, SaveTipoTranDto } from './dto/save-tipo.dto';

@Injectable()
export class MenudeoSaveService extends BaseService {
    private readonly logger = new Logger(MenudeoSaveService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        this.core
            .getVariables([
                'p_inv_estado_normal',
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    // ─────────────────────────────────────────────────────────────
    // FORMAS DE MENUDEO (CATÁLOGO MAESTRO)
    // ─────────────────────────────────────────────────────────────

    /**
     * Crea o actualiza una forma de menudeo junto con sus insumos.
     * Los insumos se envían completos: se borran los existentes y se reinsertan.
     */
    async saveForma(dtoIn: SaveFormaDto & HeaderParamsDto) {
        const module = 'inv_men';
        const tableName = 'forma';
        const primaryKey = 'ide_inmfor';

        const listQuery: ObjectQueryDto[] = [];

        if (dtoIn.isUpdate) {
            if (!dtoIn.data.ide_inmfor) {
                throw new BadRequestException('Se requiere ide_inmfor para actualizar la forma');
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
                condition: `${primaryKey} = ${dtoIn.data.ide_inmfor}`,
            };
            listQuery.push(objQuery);
        } else {
            dtoIn.data.ide_inmfor = await this.dataSource.getSeqTable(
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
                    ide_empr: dtoIn.ideEmpr,
                    usuario_ingre: dtoIn.login,
                    fecha_ingre: getCurrentDate(),
                    hora_ingre: getCurrentTime(),
                },
            };
            listQuery.push(objQuery);
        }

        await this.core.save({ ...dtoIn, listQuery, audit: false });

        // Reemplazar insumos si se enviaron
        if (dtoIn.insumos !== undefined) {
            await this.reemplazarInsumosForma(
                dtoIn.data.ide_inmfor!,
                dtoIn.insumos ?? [],
                dtoIn.login,
            );
        }

        return { message: 'ok', rowCount: 1 };
    }

    private async reemplazarInsumosForma(
        ide_inmfor: number,
        insumos: SaveFormaDto['insumos'],
        login: string,
    ) {
        // Elimina insumos existentes de la forma
        await this.dataSource.pool.query(
            `DELETE FROM inv_men_forma_insumo WHERE ide_inmfor = $1`,
            [ide_inmfor],
        );

        if (!insumos || insumos.length === 0) return;

        // Inserta los nuevos insumos
        for (const ins of insumos) {
            const ide_inmfin = await this.dataSource.getSeqTable(
                'inv_men_forma_insumo',
                'ide_inmfin',
                1,
                login,
            );
            const objQuery: ObjectQueryDto = {
                operation: 'insert',
                module: 'inv_men',
                tableName: 'forma_insumo',
                primaryKey: 'ide_inmfin',
                object: {
                    ide_inmfin,
                    ide_inmfor,
                    ide_inarti: ins.ide_inarti,
                    cantidad_inmfin: ins.cantidad_inmfin,
                    observacion_inmfin: ins.observacion_inmfin ?? null,
                    usuario_ingre: login,
                    fecha_ingre: getCurrentDate(),
                    hora_ingre: getCurrentTime(),
                },
            };
            await this.core.save({
                listQuery: [objQuery],
                audit: false,
                login,
                ideEmpr: 0,
                ideSucu: 0,
                ideUsua: 0,
                idePerf: 0,
            });
        }
    }

    /**
     * Elimina una forma de menudeo y sus insumos (solo si no tiene presentaciones vinculadas)
     */
    async deleteForma(dtoIn: IdFormaDto & HeaderParamsDto) {
        // Verificar que no existan presentaciones vinculadas
        const checkQuery = new SelectQuery(`
            SELECT COUNT(1) AS total
            FROM inv_men_presentacion
            WHERE ide_inmfor = $1
        `);
        checkQuery.addIntParam(1, dtoIn.ide_inmfor);
        const res = await this.dataSource.createSingleQuery(checkQuery);
        if (res && Number(res.total) > 0) {
            throw new BadRequestException(
                'No se puede eliminar la forma porque tiene productos vinculados. Desvincule los productos primero.',
            );
        }

        await this.dataSource.pool.query(
            `DELETE FROM inv_men_forma_insumo WHERE ide_inmfor = $1`,
            [dtoIn.ide_inmfor],
        );
        await this.dataSource.pool.query(
            `DELETE FROM inv_men_forma WHERE ide_inmfor = $1`,
            [dtoIn.ide_inmfor],
        );
        return { message: 'ok', rowCount: 1 };
    }

    /**
     * Elimina un insumo individual de una forma
     */
    async deleteInsumoForma(dtoIn: { ide_inmfin: number } & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `DELETE FROM inv_men_forma_insumo WHERE ide_inmfin = $1`,
            [dtoIn.ide_inmfin],
        );
        return { message: 'ok', rowCount: 1 };
    }

    // ─────────────────────────────────────────────────────────────
    // PRESENTACIONES (VÍNCULO PRODUCTO ↔ FORMA)
    // ─────────────────────────────────────────────────────────────

    /**
     * Crea o actualiza un vínculo producto ↔ forma de menudeo.
     * Si se necesita sobreescribir cant_base, se envía cant_base_inmpre.
     */
    async savePresentacion(dtoIn: SavePresentacionDto & HeaderParamsDto) {
        const module = 'inv_men';
        const tableName = 'presentacion';
        const primaryKey = 'ide_inmpre';

        const listQuery: ObjectQueryDto[] = [];

        if (dtoIn.isUpdate) {
            if (!dtoIn.data.ide_inmpre) {
                throw new BadRequestException('Se requiere ide_inmpre para actualizar la presentación');
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
                condition: `${primaryKey} = ${dtoIn.data.ide_inmpre}`,
            };
            listQuery.push(objQuery);
        } else {
            // Verificar que no exista ya el vínculo producto-forma
            const checkQuery = new SelectQuery(`
                SELECT COUNT(1) AS total
                FROM inv_men_presentacion
                WHERE ide_inarti = $1 AND ide_inmfor = $2
            `);
            checkQuery.addIntParam(1, dtoIn.data.ide_inarti);
            checkQuery.addIntParam(2, dtoIn.data.ide_inmfor);
            const exists = await this.dataSource.createSingleQuery(checkQuery);
            if (exists && Number(exists.total) > 0) {
                throw new BadRequestException(
                    'Este producto ya tiene asignada esta forma de menudeo',
                );
            }

            dtoIn.data.ide_inmpre = await this.dataSource.getSeqTable(
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
                    ide_empr: dtoIn.ideEmpr,
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
     * Elimina un vínculo producto ↔ forma (solo si no tiene movimientos)
     */
    async deletePresentacion(dtoIn: IdPresentacionDto & HeaderParamsDto) {
        // Verificar que no existan movimientos
        const checkQuery = new SelectQuery(`
            SELECT COUNT(1) AS total
            FROM inv_det_menudeo
            WHERE ide_inmpre = $1
        `);
        checkQuery.addIntParam(1, dtoIn.ide_inmpre);
        const res = await this.dataSource.createSingleQuery(checkQuery);
        if (res && Number(res.total) > 0) {
            throw new BadRequestException(
                'No se puede eliminar la presentación porque tiene movimientos de menudeo registrados',
            );
        }

        await this.dataSource.pool.query(
            `DELETE FROM inv_men_presentacion WHERE ide_inmpre = $1`,
            [dtoIn.ide_inmpre],
        );
        return { message: 'ok', rowCount: 1 };
    }

    /**
     * Copia las presentaciones activas de un producto origen a uno o varios productos destino.
     * Si el destino ya tiene asignada la misma forma, se omite sin error.
     * Retorna cuántas presentaciones se insertaron en total.
     */
    async copiarPresentacion(dtoIn: CopiarPresentacionDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT f_copiar_men_presentacion($1, ARRAY[${dtoIn.values}]::integer[], $2, $3) AS total_copiadas
        `);
        query.addParam(1, dtoIn.ide_inarti);
        query.addParam(2, dtoIn.ideEmpr);
        query.addParam(3, dtoIn.login);
        const res = await this.dataSource.createSingleQuery(query);
        return { message: 'ok', total_copiadas: res?.total_copiadas ?? 0 };
    }

    // ─────────────────────────────────────────────────────────────
    // TIPOS DE COMPROBANTE / TRANSACCIÓN MENUDEO
    // ─────────────────────────────────────────────────────────────

    async saveTipoComp(dtoIn: SaveTipoCompDto & HeaderParamsDto) {
        const module = 'inv_men';
        const tableName = 'tipo_comp';
        const primaryKey = 'ide_inmtc';
        const listQuery: ObjectQueryDto[] = [];

        if (dtoIn.isUpdate) {
            if (!dtoIn.data.ide_inmtc) {
                throw new BadRequestException('Se requiere ide_inmtc para actualizar');
            }
            listQuery.push({
                operation: 'update', module, tableName, primaryKey,
                object: {
                    ...dtoIn.data,
                    usuario_actua: dtoIn.login,
                    fecha_actua: getCurrentDate(),
                    hora_actua: getCurrentTime(),
                },
                condition: `${primaryKey} = ${dtoIn.data.ide_inmtc}`,
            });
        } else {
            dtoIn.data.ide_inmtc = await this.dataSource.getSeqTable(
                `${module}_${tableName}`, primaryKey, 1, dtoIn.login,
            );
            listQuery.push({
                operation: 'insert', module, tableName, primaryKey,
                object: {
                    ...dtoIn.data,
                    ide_empr: dtoIn.ideEmpr,
                    usuario_ingre: dtoIn.login,
                    fecha_ingre: getCurrentDate(),
                    hora_ingre: getCurrentTime(),
                },
            });
        }
        await this.core.save({ ...dtoIn, listQuery, audit: false });
        return { message: 'ok', rowCount: 1 };
    }

    async deleteTipoComp(dtoIn: IdTipoCompDto & HeaderParamsDto) {
        const checkQuery = new SelectQuery(`
            SELECT COUNT(1) AS total FROM inv_men_tipo_tran WHERE ide_inmtc = $1
        `);
        checkQuery.addIntParam(1, dtoIn.ide_inmtc);
        const res = await this.dataSource.createSingleQuery(checkQuery);
        if (res && Number(res.total) > 0) {
            throw new BadRequestException(
                'No se puede eliminar el tipo de comprobante porque tiene tipos de transacción vinculados',
            );
        }
        await this.dataSource.pool.query(
            `DELETE FROM inv_men_tipo_comp WHERE ide_inmtc = $1`, [dtoIn.ide_inmtc],
        );
        return { message: 'ok', rowCount: 1 };
    }

    async saveTipoTran(dtoIn: SaveTipoTranDto & HeaderParamsDto) {
        const module = 'inv_men';
        const tableName = 'tipo_tran';
        const primaryKey = 'ide_inmtt';
        const listQuery: ObjectQueryDto[] = [];

        if (dtoIn.isUpdate) {
            if (!dtoIn.data.ide_inmtt) {
                throw new BadRequestException('Se requiere ide_inmtt para actualizar');
            }
            listQuery.push({
                operation: 'update', module, tableName, primaryKey,
                object: {
                    ...dtoIn.data,
                    usuario_actua: dtoIn.login,
                    fecha_actua: getCurrentDate(),
                    hora_actua: getCurrentTime(),
                },
                condition: `${primaryKey} = ${dtoIn.data.ide_inmtt}`,
            });
        } else {
            dtoIn.data.ide_inmtt = await this.dataSource.getSeqTable(
                `${module}_${tableName}`, primaryKey, 1, dtoIn.login,
            );
            listQuery.push({
                operation: 'insert', module, tableName, primaryKey,
                object: {
                    ...dtoIn.data,
                    ide_empr: dtoIn.ideEmpr,
                    usuario_ingre: dtoIn.login,
                    fecha_ingre: getCurrentDate(),
                    hora_ingre: getCurrentTime(),
                },
            });
        }
        await this.core.save({ ...dtoIn, listQuery, audit: false });
        return { message: 'ok', rowCount: 1 };
    }

    async deleteTipoTran(dtoIn: IdTipoTranDto & HeaderParamsDto) {
        const checkQuery = new SelectQuery(`
            SELECT COUNT(1) AS total FROM inv_cab_menudeo WHERE ide_inmtt = $1
        `);
        checkQuery.addIntParam(1, dtoIn.ide_inmtt);
        const res = await this.dataSource.createSingleQuery(checkQuery);
        if (res && Number(res.total) > 0) {
            throw new BadRequestException(
                'No se puede eliminar el tipo de transacción porque tiene comprobantes de menudeo vinculados',
            );
        }
        await this.dataSource.pool.query(
            `DELETE FROM inv_men_tipo_tran WHERE ide_inmtt = $1`, [dtoIn.ide_inmtt],
        );
        return { message: 'ok', rowCount: 1 };
    }

    // ─────────────────────────────────────────────────────────────
    // COMPROBANTE DE MENUDEO
    // ─────────────────────────────────────────────────────────────

    /**
     * Crea un comprobante de menudeo.
     *
     * Flujo:
     *  1. Obtiene info del tipo de transacción (signo, flags de generación).
     *  2. Valida que las presentaciones del detalle pertenezcan al producto base.
     *  3. Si signo = -1 (egreso), valida stock disponible.
     *  4. Si genera_egreso_insumo_inmtt = true, genera comprobante de egreso de insumos/envases.
     *  5. Si genera_egreso_base_inmtt = true, genera comprobante de egreso del producto base.
     *  6. Inserta cabecera y detalle en inv_cab_menudeo / inv_det_menudeo.
     */
    async saveMenudeo(dtoIn: SaveMenudeoDto & HeaderParamsDto) {
        const { data, detalle } = dtoIn;

        if (!detalle || detalle.length === 0) {
            throw new BadRequestException('Debe incluir al menos una presentación en el detalle');
        }

        // 1. Obtener info del tipo de transacción
        const tipoTran = await this.getTipoTranInfo(data.ide_inmtt);
        if (!tipoTran) {
            throw new BadRequestException(`Tipo de transacción de menudeo ${data.ide_inmtt} no encontrado`);
        }
        const signo = Number(tipoTran.signo_inmtc);

        // 2. Verificar que las presentaciones pertenezcan al producto base
        await this.validarPresentaciones(data.ide_inarti, detalle, dtoIn.ideEmpr);

        // 3. Para egresos, verificar stock disponible
        if (signo === -1) {
            await this.validarStockMenudeo(detalle);
        }

        // 4. Generar comprobante de egreso de insumos/envases
        let ide_incci: number | null = null;
        if (tipoTran.genera_egreso_insumo_inmtt && data.ide_inbod && tipoTran.ide_intti) {
            ide_incci = await this.generarComprobanteInsumos(
                dtoIn, detalle, Number(tipoTran.ide_intti),
            );
        }

        // 5. Generar comprobante de egreso del producto base
        if (tipoTran.genera_egreso_base_inmtt && data.ide_inbod && tipoTran.ide_intti) {
            ide_incci = await this.generarComprobanteEgresoBase(
                dtoIn, detalle, Number(tipoTran.ide_intti),
            );
        }

        // 6. Insertar cabecera
        const ide_incmen = await this.dataSource.getSeqTable(
            'inv_cab_menudeo',
            'ide_incmen',
            1,
            dtoIn.login,
        );

        const cabQuery: ObjectQueryDto = {
            operation: 'insert',
            module: 'inv',
            tableName: 'cab_menudeo',
            primaryKey: 'ide_incmen',
            object: {
                ide_incmen,
                ide_inarti: data.ide_inarti,
                ide_inmtt: data.ide_inmtt,
                ide_empr: dtoIn.ideEmpr,
                ide_sucu: dtoIn.ideSucu,
                numero_incmen: String(ide_incmen).padStart(10, '0'),
                fecha_incmen: data.fecha_incmen,
                observacion_incmen: data.observacion_incmen ?? null,
                estado_incmen: 1,
                ide_incci: ide_incci,
                ide_cccfa: data.ide_cccfa ?? null,
                ide_incmen_ref: data.ide_incmen_ref ?? null,
                usuario_ingre: dtoIn.login,
                fecha_ingre: getCurrentDate(),
                hora_ingre: getCurrentTime(),
            },
        };
        await this.core.save({ ...dtoIn, listQuery: [cabQuery], audit: false });

        // 7. Insertar detalle
        for (const det of detalle) {
            const ide_indmen = await this.dataSource.getSeqTable(
                'inv_det_menudeo',
                'ide_indmen',
                1,
                dtoIn.login,
            );
            const detQuery: ObjectQueryDto = {
                operation: 'insert',
                module: 'inv',
                tableName: 'det_menudeo',
                primaryKey: 'ide_indmen',
                object: {
                    ide_indmen,
                    ide_incmen,
                    ide_inmpre: det.ide_inmpre,
                    cantidad_indmen: det.cantidad_indmen,
                    cant_base_indmen: det.cant_base_indmen,
                    observacion_indmen: det.observacion_indmen ?? null,
                    usuario_ingre: dtoIn.login,
                    fecha_ingre: getCurrentDate(),
                    hora_ingre: getCurrentTime(),
                },
            };
            await this.core.save({ ...dtoIn, listQuery: [detQuery], audit: false });
        }

        return { message: 'ok', rowCount: 1, ide_incmen };
    }

    /**
     * Anula un comprobante de menudeo (cambia estado_incmen a 0).
     * No revierte el comprobante de insumos generado automáticamente;
     * ese debe anularse manualmente en inventario.
     */
    async anularMenudeo(dtoIn: IdMenudeoDto & HeaderParamsDto) {
        // Verificar que existe y está activo
        const cabQuery = new SelectQuery(`
            SELECT ide_incmen, estado_incmen, ide_incci
            FROM inv_cab_menudeo
            WHERE ide_incmen = $1 AND ide_empr = $2
        `);
        cabQuery.addIntParam(1, dtoIn.ide_incmen);
        cabQuery.addIntParam(2, dtoIn.ideEmpr);
        const cab = await this.dataSource.createSingleQuery(cabQuery);

        if (!cab) {
            throw new BadRequestException(`El comprobante de menudeo ${dtoIn.ide_incmen} no existe`);
        }
        if (Number(cab.estado_incmen) === 0) {
            throw new BadRequestException('El comprobante ya se encuentra anulado');
        }

        const updateQuery = new UpdateQuery('inv_cab_menudeo', 'ide_incmen');
        updateQuery.values.set('estado_incmen', 0);
        updateQuery.values.set('usuario_actua', dtoIn.login);
        updateQuery.values.set('fecha_actua', getCurrentDate());
        updateQuery.values.set('hora_actua', getCurrentTime());
        updateQuery.where = 'ide_incmen = $1';
        updateQuery.addIntParam(1, dtoIn.ide_incmen);
        await this.dataSource.createQuery(updateQuery);

        return {
            message: 'Comprobante anulado correctamente',
            rowCount: 1,
            ide_incci_insumos: cab.ide_incci ?? null,
        };
    }

    // ─────────────────────────────────────────────────────────────
    // PRIVADOS
    // ─────────────────────────────────────────────────────────────

    private async validarPresentaciones(
        ide_inarti: number,
        detalle: SaveMenudeoDto['detalle'],
        ideEmpr: number,
    ) {
        const ids = detalle.map((d) => d.ide_inmpre);
        const query = new SelectQuery(`
            SELECT ide_inmpre
            FROM inv_men_presentacion
            WHERE ide_inmpre = ANY($1)
              AND ide_inarti  = $2
              AND ide_empr    = $3
              AND activo_inmpre = true
        `);
        query.addParam(1, ids);
        query.addIntParam(2, ide_inarti);
        query.addIntParam(3, ideEmpr);
        const validas = await this.dataSource.createSelectQuery(query);
        if (validas.length !== ids.length) {
            throw new BadRequestException(
                'Una o más presentaciones del detalle no pertenecen al producto indicado o están inactivas',
            );
        }
    }

    private async getTipoTranInfo(ide_inmtt: number) {
        const query = new SelectQuery(`
            SELECT
                tt.ide_inmtt, tt.nombre_inmtt, tt.sigla_inmtt,
                tt.genera_egreso_base_inmtt, tt.genera_egreso_insumo_inmtt,
                tt.ide_intti,
                tc.signo_inmtc
            FROM inv_men_tipo_tran tt
            INNER JOIN inv_men_tipo_comp tc ON tc.ide_inmtc = tt.ide_inmtc
            WHERE tt.ide_inmtt = $1
        `);
        query.addIntParam(1, ide_inmtt);
        return this.dataSource.createSingleQuery(query);
    }

    private async validarStockMenudeo(detalle: SaveMenudeoDto['detalle']) {
        for (const det of detalle) {
            const saldoQuery = new SelectQuery(`
                SELECT COALESCE(
                    f_redondeo(SUM(d.cantidad_indmen * tc.signo_inmtc), 2), 0
                ) AS saldo
                FROM inv_det_menudeo d
                INNER JOIN inv_cab_menudeo   c  ON c.ide_incmen = d.ide_incmen
                INNER JOIN inv_men_tipo_tran tt ON tt.ide_inmtt = c.ide_inmtt
                INNER JOIN inv_men_tipo_comp tc ON tc.ide_inmtc = tt.ide_inmtc
                WHERE d.ide_inmpre    = $1
                  AND c.estado_incmen = 1
            `);
            saldoQuery.addIntParam(1, det.ide_inmpre);
            const res = await this.dataSource.createSingleQuery(saldoQuery);
            const saldo = Number(res?.saldo ?? 0);
            if (saldo < det.cantidad_indmen) {
                const nomQuery = new SelectQuery(`
                    SELECT f.nombre_inmfor
                    FROM inv_men_presentacion p
                    INNER JOIN inv_men_forma f ON f.ide_inmfor = p.ide_inmfor
                    WHERE p.ide_inmpre = $1
                `);
                nomQuery.addIntParam(1, det.ide_inmpre);
                const nomRes = await this.dataSource.createSingleQuery(nomQuery);
                throw new BadRequestException(
                    `Stock insuficiente para "${nomRes?.nombre_inmfor ?? det.ide_inmpre}". ` +
                    `Disponible: ${saldo}, requerido: ${det.cantidad_indmen}`,
                );
            }
        }
    }

    /**
     * Genera un comprobante de egreso en inv_cab_comp_inve / inv_det_comp_inve
     * por los insumos/envases usados en el fraccionamiento.
     * Los insumos ahora se leen de inv_men_forma_insumo (a través de la forma vinculada a la presentación).
     */
    private async generarComprobanteInsumos(
        dtoIn: SaveMenudeoDto & HeaderParamsDto,
        detalle: SaveMenudeoDto['detalle'],
        ide_intti: number,
    ): Promise<number | null> {
        const { data } = dtoIn;
        const ide_inbod = data.ide_inbod!;

        // Acumular insumos de todas las presentaciones (via forma)
        const insumoMap = new Map<number, number>(); // ide_inarti → cantidad total

        for (const det of detalle) {
            // Obtener la forma vinculada a esta presentación y luego sus insumos globales
            const insumosQuery = new SelectQuery(`
                SELECT fi.ide_inarti, fi.cantidad_inmfin
                FROM inv_men_forma_insumo fi
                INNER JOIN inv_men_presentacion p ON p.ide_inmfor = fi.ide_inmfor
                WHERE p.ide_inmpre = $1
            `);
            insumosQuery.addIntParam(1, det.ide_inmpre);
            const insumos = await this.dataSource.createSelectQuery(insumosQuery);
            for (const ins of insumos) {
                const cantTotal = det.cantidad_indmen * Number(ins.cantidad_inmfin);
                insumoMap.set(
                    Number(ins.ide_inarti),
                    (insumoMap.get(Number(ins.ide_inarti)) ?? 0) + cantTotal,
                );
            }
        }

        if (insumoMap.size === 0) return null;

        // Crear cabecera de comprobante de inventario
        const ide_incci = await this.dataSource.getSeqTable(
            'inv_cab_comp_inve',
            'ide_incci',
            1,
            dtoIn.login,
        );

        const cabInvQuery: ObjectQueryDto = {
            operation: 'insert',
            module: 'inv',
            tableName: 'cab_comp_inve',
            primaryKey: 'ide_incci',
            object: {
                ide_incci,
                ide_empr: dtoIn.ideEmpr,
                ide_sucu: dtoIn.ideSucu,
                ide_intti: ide_intti,
                ide_inbod: ide_inbod,
                ide_inepi: this.variables.get('p_inv_estado_normal') ?? 1,
                fecha_trans_incci: data.fecha_incmen,
                fecha_siste_incci: getCurrentDate(),
                observacion_incci: `Egreso insumos menudeo - ${data.observacion_incmen ?? ''}`,
                automatico_incci: true,
                usuario_ingre: dtoIn.login,
                fecha_ingre: getCurrentDate(),
                hora_ingre: getCurrentTime(),
            },
        };
        await this.core.save({ ...dtoIn, listQuery: [cabInvQuery], audit: false });

        // Crear detalle por cada insumo acumulado
        for (const [ide_inarti, cantidad] of insumoMap.entries()) {
            const ide_indci = await this.dataSource.getSeqTable(
                'inv_det_comp_inve',
                'ide_indci',
                1,
                dtoIn.login,
            );
            const detInvQuery: ObjectQueryDto = {
                operation: 'insert',
                module: 'inv',
                tableName: 'det_comp_inve',
                primaryKey: 'ide_indci',
                object: {
                    ide_indci,
                    ide_incci,
                    ide_inarti,
                    ide_empr: dtoIn.ideEmpr,
                    ide_sucu: dtoIn.ideSucu,
                    cantidad_indci: cantidad,
                    precio_indci: 0,
                    referencia_indci: `Menudeo`,
                    usuario_ingre: dtoIn.login,
                    fecha_ingre: getCurrentDate(),
                    hora_ingre: getCurrentTime(),
                },
            };
            await this.core.save({ ...dtoIn, listQuery: [detInvQuery], audit: false });
        }

        return ide_incci;
    }

    /**
     * Genera un comprobante de egreso en inventario por el PRODUCTO BASE.
     * Se usa cuando el tipo de transacción tiene genera_egreso_base_inmtt = true (ej: Venta/Factura).
     * La cantidad base se obtiene sumando cant_base_indmen de todo el detalle.
     */
    private async generarComprobanteEgresoBase(
        dtoIn: SaveMenudeoDto & HeaderParamsDto,
        detalle: SaveMenudeoDto['detalle'],
        ide_intti: number,
    ): Promise<number | null> {
        const { data } = dtoIn;
        const ide_inbod = data.ide_inbod!;

        let totalBase = 0;
        for (const det of detalle) {
            totalBase += det.cant_base_indmen;
        }
        if (totalBase <= 0) return null;

        // Crear cabecera de comprobante de inventario
        const ide_incci = await this.dataSource.getSeqTable(
            'inv_cab_comp_inve',
            'ide_incci',
            1,
            dtoIn.login,
        );

        const cabInvQuery: ObjectQueryDto = {
            operation: 'insert',
            module: 'inv',
            tableName: 'cab_comp_inve',
            primaryKey: 'ide_incci',
            object: {
                ide_incci,
                ide_empr: dtoIn.ideEmpr,
                ide_sucu: dtoIn.ideSucu,
                ide_intti,
                ide_inbod,
                ide_inepi: this.variables.get('p_inv_estado_normal') ?? 1,
                fecha_trans_incci: data.fecha_incmen,
                fecha_siste_incci: getCurrentDate(),
                observacion_incci: `Egreso producto base por menudeo - ${data.observacion_incmen ?? ''}`,
                automatico_incci: true,
                usuario_ingre: dtoIn.login,
                fecha_ingre: getCurrentDate(),
                hora_ingre: getCurrentTime(),
            },
        };
        await this.core.save({ ...dtoIn, listQuery: [cabInvQuery], audit: false });

        // Una línea de detalle: el producto base con la cantidad total
        const ide_indci = await this.dataSource.getSeqTable(
            'inv_det_comp_inve',
            'ide_indci',
            1,
            dtoIn.login,
        );
        const detInvQuery: ObjectQueryDto = {
            operation: 'insert',
            module: 'inv',
            tableName: 'det_comp_inve',
            primaryKey: 'ide_indci',
            object: {
                ide_indci,
                ide_incci,
                ide_inarti: data.ide_inarti,
                ide_empr: dtoIn.ideEmpr,
                ide_sucu: dtoIn.ideSucu,
                cantidad_indci: totalBase,
                precio_indci: 0,
                referencia_indci: 'Egreso base menudeo',
                usuario_ingre: dtoIn.login,
                fecha_ingre: getCurrentDate(),
                hora_ingre: getCurrentTime(),
            },
        };
        await this.core.save({ ...dtoIn, listQuery: [detInvQuery], audit: false });

        return ide_incci;
    }
}
