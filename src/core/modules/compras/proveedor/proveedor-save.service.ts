import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { SaveDto } from 'src/common/dto/save.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { DeleteQuery, InsertQuery, Query, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { isDefined } from 'src/util/helpers/common-util';
import { getCurrentDate, getCurrentTime, toPgDate } from 'src/util/helpers/date-util';
import { validateCedula, validateRUC } from 'src/util/helpers/validations/cedula-ruc';

import { SetCuentaContableProveedorDto } from './dto/cuenta-contable-proveedor.dto';
import { DeleteCabeceraTrnDto } from './dto/delete-cabecera-trn.dto';
import { DetalleTrnItemDto } from './dto/detalle-trn-item.dto';
import { MoverDetalleTrnDto } from './dto/mover-detalle-trn.dto';
import { SaveCtaBancoProveedorDto } from './dto/save-cta-banco-proveedor.dto';
import { SaveDetalleCabeceraTrnDto } from './dto/save-detalle-cabecera-trn.dto';
import { SaveTrnProveedorDto } from './dto/save-trn-proveedor.dto';

/** Identificador de configuración contable del proveedor */
const IDENTIFICADOR_CUENTA_CXP = 'CUENTA POR PAGAR';

/**
 * Servicio de persistencia de proveedores: CRUD de gen_persona con creación
 * automática de la cuenta contable, configuración de la cuenta y registro de
 * transacciones manuales de CxP. Migrado de pre_proveedores.java del legacy.
 */
@Injectable()
export class ProveedorSaveService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        this.core
            .getVariables([
                'p_gen_tipo_identificacion_cedula',
                'p_gen_tipo_iden_ruc',
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CRUD Proveedor
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Crea o actualiza un proveedor (gen_persona). La cuenta contable NO se
     * crea automáticamente aquí; debe vincularse aparte con
     * `setCuentaContableProveedor`.
     */
    async saveProveedor(dtoIn: SaveDto & HeaderParamsDto) {
        try {
            const data = dtoIn.data ?? {};
            data.es_proveedo_geper = true;

            this.validarIdentificacionProveedor(data);

            let ideGeper: number;

            if (dtoIn.isUpdate) {
                if (!isDefined(data.ide_geper)) {
                    throw new BadRequestException('Se requiere ide_geper para actualizar el proveedor');
                }
                ideGeper = Number(data.ide_geper);
                await this.validarDuplicado(data.identificac_geper, dtoIn.ideEmpr, ideGeper);

                const listQuery: ObjectQueryDto[] = [{
                    operation: 'update',
                    module: 'gen',
                    tableName: 'persona',
                    primaryKey: 'ide_geper',
                    object: data,
                    condition: `ide_geper = ${ideGeper}`,
                }];
                await this.appendDireccionPrincipalQuery(listQuery, data, ideGeper, dtoIn.login);

                return this.core.save({
                    ...dtoIn,
                    listQuery,
                    audit: false,
                });
            }

            if (!data.identificac_geper) throw new BadRequestException('La identificación es obligatoria');
            if (!data.nom_geper) throw new BadRequestException('El nombre del proveedor es obligatorio');
            if (!isDefined(data.ide_getid)) throw new BadRequestException('Debe seleccionar el tipo de identificación');
            if (!isDefined(data.ide_cntco)) throw new BadRequestException('Debe seleccionar el tipo de contribuyente');
            await this.validarDuplicado(data.identificac_geper, dtoIn.ideEmpr);

            ideGeper = await this.dataSource.getSeqTable('gen_persona', 'ide_geper', 1, dtoIn.login);
            data.ide_geper = ideGeper;
            data.nivel_geper = data.nivel_geper ?? 'HIJO';
            data.activo_geper = data.activo_geper ?? true;

            const listQuery: ObjectQueryDto[] = [{
                operation: 'insert',
                module: 'gen',
                tableName: 'persona',
                primaryKey: 'ide_geper',
                object: data,
            }];
            await this.appendDireccionPrincipalQuery(listQuery, data, ideGeper, dtoIn.login);

            await this.core.save({
                ...dtoIn,
                listQuery,
                audit: true,
            });

            return {
                message: 'ok',
                ide_geper: ideGeper,
            };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar el proveedor: ${msg}`);
        }
    }

    /**
     * Vincula (crea o actualiza) la cuenta contable del proveedor en
     * con_det_conf_asie bajo la vigencia activa de 'CUENTA POR PAGAR'
     */
    async setCuentaContableProveedor(dtoIn: SetCuentaContableProveedorDto & HeaderParamsDto) {
        const ideCnvca = await this.getVigenciaCuentaPorPagar(dtoIn.ideSucu);

        const qExiste = new SelectQuery(`
            SELECT ide_cndca FROM con_det_conf_asie
            WHERE ide_geper = $1 AND ide_cnvca = $2
            LIMIT 1
        `);
        qExiste.addIntParam(1, dtoIn.ide_geper);
        qExiste.addIntParam(2, ideCnvca);
        const existente = await this.dataSource.createSingleQuery(qExiste);

        if (existente) {
            const upd = new UpdateQuery('con_det_conf_asie', 'ide_cndca', dtoIn);
            upd.values.set('ide_cndpc', dtoIn.ide_cndpc);
            upd.where = 'ide_cndca = $1';
            upd.addIntParam(1, Number(existente.ide_cndca));
            await this.dataSource.createListQuery([upd]);
        } else {
            const ideCndca = await this.dataSource.getSeqTable('con_det_conf_asie', 'ide_cndca', 1, dtoIn.login);
            const ins = new InsertQuery('con_det_conf_asie', 'ide_cndca', dtoIn);
            ins.values.set('ide_cndca', ideCndca);
            ins.values.set('ide_geper', dtoIn.ide_geper);
            ins.values.set('ide_cndpc', dtoIn.ide_cndpc);
            ins.values.set('ide_cnvca', ideCnvca);
            await this.dataSource.createListQuery([ins]);
        }
        return { message: 'ok', ide_geper: dtoIn.ide_geper, ide_cndpc: dtoIn.ide_cndpc };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Transacción manual de CxP
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Registra una transacción manual en cxp_detall_transa (ajustes, cargos o
     * pagos manuales). Si no se asocia a una cuenta por pagar existente se crea
     * una cabecera nueva; si se asocia, la transacción se registra como pago
     * (numero_pago = 1) vinculada al documento de la cuenta. Opcionalmente
     * vincula un asiento contable existente. Paridad con la pantalla
     * "Ingresar Transacción" (pre_proveedores.guardar opción 10).
     */
    async saveTrnProveedor(dtoIn: SaveTrnProveedorDto & HeaderParamsDto) {
        try {
            const fechaTrans = toPgDate(dtoIn.fecha_trans_cpdtr) || getCurrentDate();

            // Validar asiento contable si se envía
            if (isDefined(dtoIn.ide_cnccc)) {
                const qAsiento = new SelectQuery(`
                    SELECT ide_cnccc FROM con_cab_comp_cont WHERE ide_cnccc = $1
                `);
                qAsiento.addIntParam(1, dtoIn.ide_cnccc!);
                const asiento = await this.dataSource.createSingleQuery(qAsiento);
                if (!asiento) {
                    throw new BadRequestException(`El asiento contable Num. ${dtoIn.ide_cnccc} no existe`);
                }
            }

            const listQuery: Query[] = [];
            let ideCpctr: number;
            let ideCpcfa: number | null = null;
            let numeroPago = 0;

            if (isDefined(dtoIn.ide_cpctr)) {
                // Asociada a una cuenta por pagar existente → es un pago/abono
                ideCpctr = Number(dtoIn.ide_cpctr);
                const qCab = new SelectQuery(`
                    SELECT ide_cpctr FROM cxp_cabece_transa
                    WHERE ide_cpctr = $1 AND ide_geper = $2
                `);
                qCab.addIntParam(1, ideCpctr);
                qCab.addIntParam(2, dtoIn.ide_geper);
                const cab = await this.dataSource.createSingleQuery(qCab);
                if (!cab) {
                    throw new BadRequestException(
                        `La cuenta por pagar ide_cpctr=${dtoIn.ide_cpctr} no existe o no pertenece al proveedor.`,
                    );
                }
                const qFactura = new SelectQuery(`
                    SELECT ide_cpcfa FROM cxp_detall_transa
                    WHERE ide_cpctr = $1 AND numero_pago_cpdtr = 0
                    ORDER BY ide_cpdtr
                    LIMIT 1
                `);
                qFactura.addIntParam(1, ideCpctr);
                const factura = await this.dataSource.createSingleQuery(qFactura);
                ideCpcfa = factura?.ide_cpcfa ?? null;
                numeroPago = 1;
            } else {
                // Sin cuenta por pagar → cabecera nueva
                ideCpctr = await this.dataSource.getSeqTable('cxp_cabece_transa', 'ide_cpctr', 1, dtoIn.login);
                const insCab = new InsertQuery('cxp_cabece_transa', 'ide_cpctr', dtoIn);
                insCab.values.set('ide_cpctr', ideCpctr);
                insCab.values.set('ide_geper', dtoIn.ide_geper);
                insCab.values.set('ide_cpttr', dtoIn.ide_cpttr);
                insCab.values.set('fecha_trans_cpctr', fechaTrans);
                insCab.values.set('observacion_cpctr', dtoIn.observacion_cpdtr);
                insCab.values.set('fecha_ingre', getCurrentDate());
                insCab.values.set('hora_ingre', getCurrentTime());
                listQuery.push(insCab);
            }

            const ideCpdtr = await this.dataSource.getSeqTable('cxp_detall_transa', 'ide_cpdtr', 1, dtoIn.login);
            const insDet = new InsertQuery('cxp_detall_transa', 'ide_cpdtr', dtoIn);
            insDet.values.set('ide_cpdtr', ideCpdtr);
            insDet.values.set('ide_cpctr', ideCpctr);
            insDet.values.set('ide_cpttr', dtoIn.ide_cpttr);
            insDet.values.set('ide_usua', dtoIn.ideUsua);
            insDet.values.set('ide_cpcfa', ideCpcfa ?? null);
            insDet.values.set('fecha_trans_cpdtr', fechaTrans);
            insDet.values.set('fecha_venci_cpdtr', fechaTrans);
            insDet.values.set('valor_cpdtr', dtoIn.valor_cpdtr);
            insDet.values.set('observacion_cpdtr', dtoIn.observacion_cpdtr);
            insDet.values.set('docum_relac_cpdtr', dtoIn.docum_relac_cpdtr ?? null);
            insDet.values.set('numero_pago_cpdtr', numeroPago);
            insDet.values.set('valor_anticipo_cpdtr', 0);
            insDet.values.set('ide_cnccc', dtoIn.ide_cnccc ?? null);
            insDet.values.set('fecha_ingre', getCurrentDate());
            insDet.values.set('hora_ingre', getCurrentTime());
            listQuery.push(insDet);

            // Vincular asiento existente al documento y transacciones (paridad legacy)
            if (isDefined(dtoIn.ide_cnccc)) {
                if (ideCpcfa !== null) {
                    const updFactura = new UpdateQuery('cxp_cabece_factur', 'ide_cpcfa');
                    updFactura.values.set('ide_cnccc', dtoIn.ide_cnccc);
                    updFactura.where = 'ide_cpcfa = $1';
                    updFactura.addIntParam(1, ideCpcfa);
                    listQuery.push(updFactura);
                }
                const updTrn = new UpdateQuery('cxp_detall_transa', 'ide_cpdtr');
                updTrn.values.set('ide_cnccc', dtoIn.ide_cnccc);
                updTrn.where = 'ide_cpctr = $1 AND ide_cnccc IS NULL';
                updTrn.addIntParam(1, ideCpctr);
                listQuery.push(updTrn);
            }

            await this.dataSource.createListQuery(listQuery);

            return {
                message: 'ok',
                ide_cpctr: ideCpctr,
                ide_cpdtr: ideCpdtr,
                ide_cpcfa: ideCpcfa,
                numero_pago: numeroPago,
            };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al registrar la transacción: ${msg}`);
        }
    }

    /**
     * Guardado tipo-diff (crear/actualizar/eliminar, nunca borrar-y-recrear) del detalle
     * completo de una cabecera de transacción CxP. `dtoIn.detalles` representa el estado
     * final deseado: filas con ide_cpdtr existente → UPDATE in-place; sin ide_cpdtr →
     * INSERT; filas que ya no vienen en el payload → DELETE. Antes de comitear valida
     * que el saldo resultante (Σ valor_cpdtr * signo_cpttr) no quede negativo — esa es
     * la regla central de "cuadre" pedida por el usuario.
     */
    async saveDetalleCabeceraTrn(dtoIn: SaveDetalleCabeceraTrnDto & HeaderParamsDto) {
        try {
            const qCab = new SelectQuery(`
                SELECT ide_cpctr FROM cxp_cabece_transa WHERE ide_cpctr = $1 AND ide_geper = $2
            `);
            qCab.addIntParam(1, dtoIn.ide_cpctr);
            qCab.addIntParam(2, dtoIn.ide_geper);
            const cab = await this.dataSource.createSingleQuery(qCab);
            if (!cab) {
                throw new BadRequestException(
                    `La cabecera ide_cpctr=${dtoIn.ide_cpctr} no existe o no pertenece al proveedor.`,
                );
            }

            const qExistentes = new SelectQuery(`
                SELECT ide_cpdtr, ide_cpttr, ide_cpcfa, fecha_trans_cpdtr, fecha_venci_cpdtr,
                       valor_cpdtr, docum_relac_cpdtr, observacion_cpdtr, ide_cnccc, ide_teclb, numero_pago_cpdtr
                FROM cxp_detall_transa WHERE ide_cpctr = $1
            `);
            qExistentes.addIntParam(1, dtoIn.ide_cpctr);
            const existentes: Record<string, any>[] = await this.dataSource.createSelectQuery(qExistentes);
            const existentesPorId = new Map(existentes.map((r) => [Number(r.ide_cpdtr), r]));
            const idsExistentes = new Set(existentesPorId.keys());

            const toUpdate = dtoIn.detalles.filter((d) => isDefined(d.ide_cpdtr));
            const toInsert = dtoIn.detalles.filter((d) => !isDefined(d.ide_cpdtr));

            const idsIncoming = new Set<number>();
            for (const d of toUpdate) {
                const id = Number(d.ide_cpdtr);
                if (!idsExistentes.has(id)) {
                    throw new BadRequestException(
                        `La línea ide_cpdtr=${id} no pertenece a la cabecera ide_cpctr=${dtoIn.ide_cpctr}.`,
                    );
                }
                if (idsIncoming.has(id)) {
                    throw new BadRequestException(`La línea ide_cpdtr=${id} está repetida en el detalle enviado.`);
                }
                idsIncoming.add(id);
            }

            const toDeleteIds = [...idsExistentes].filter((id) => !idsIncoming.has(id));
            for (const id of toDeleteIds) {
                const existente = existentesPorId.get(id)!;
                if (isDefined(existente.ide_cnccc) || isDefined(existente.ide_teclb)) {
                    throw new BadRequestException(
                        `La línea ide_cpdtr=${id} ya está vinculada a un asiento contable o al libro de bancos; desvincúlela (editando esos campos a vacío) antes de eliminarla.`,
                    );
                }
            }

            const listQuery: Query[] = [];

            if (toDeleteIds.length > 0) {
                const delDetalles = new DeleteQuery('cxp_detall_transa');
                delDetalles.where = 'ide_cpdtr = ANY($1) AND ide_cpctr = $2';
                delDetalles.addParam(1, toDeleteIds);
                delDetalles.addIntParam(2, dtoIn.ide_cpctr);
                listQuery.push(delDetalles);
            }

            for (const d of toUpdate) {
                const id = Number(d.ide_cpdtr);
                if (this.detalleTrnSinCambios(d, existentesPorId.get(id)!)) continue;
                const q = new UpdateQuery('cxp_detall_transa', 'ide_cpdtr', dtoIn);
                q.where = 'ide_cpdtr = $1 AND ide_cpctr = $2';
                q.addIntParam(1, id);
                q.addIntParam(2, dtoIn.ide_cpctr);
                q.values.set('ide_cpttr', d.ide_cpttr);
                q.values.set('ide_cpcfa', d.ide_cpcfa ?? null);
                q.values.set('fecha_trans_cpdtr', toPgDate(d.fecha_trans_cpdtr));
                q.values.set('fecha_venci_cpdtr', toPgDate(d.fecha_venci_cpdtr) ?? toPgDate(d.fecha_trans_cpdtr));
                q.values.set('valor_cpdtr', d.valor_cpdtr);
                q.values.set('docum_relac_cpdtr', d.docum_relac_cpdtr ?? null);
                q.values.set('observacion_cpdtr', d.observacion_cpdtr ?? null);
                q.values.set('ide_cnccc', d.ide_cnccc ?? null);
                q.values.set('ide_teclb', d.ide_teclb ?? null);
                listQuery.push(q);
            }

            if (toInsert.length > 0) {
                const maxPagoActual = existentes.reduce(
                    (max, r) => Math.max(max, Number(r.numero_pago_cpdtr ?? 0)),
                    0,
                );
                const baseIdeCpdtr = await this.dataSource.getSeqTable(
                    'cxp_detall_transa', 'ide_cpdtr', toInsert.length, dtoIn.login,
                );
                toInsert.forEach((d, idx) => {
                    const q = new InsertQuery('cxp_detall_transa', 'ide_cpdtr', dtoIn);
                    q.values.set('ide_cpdtr', baseIdeCpdtr + idx);
                    q.values.set('ide_cpctr', dtoIn.ide_cpctr);
                    q.values.set('ide_cpttr', d.ide_cpttr);
                    q.values.set('ide_cpcfa', d.ide_cpcfa ?? null);
                    q.values.set('ide_usua', dtoIn.ideUsua);
                    q.values.set('fecha_trans_cpdtr', toPgDate(d.fecha_trans_cpdtr));
                    q.values.set('fecha_venci_cpdtr', toPgDate(d.fecha_venci_cpdtr) ?? toPgDate(d.fecha_trans_cpdtr));
                    q.values.set('valor_cpdtr', d.valor_cpdtr);
                    q.values.set('docum_relac_cpdtr', d.docum_relac_cpdtr ?? null);
                    q.values.set('observacion_cpdtr', d.observacion_cpdtr ?? null);
                    q.values.set('numero_pago_cpdtr', maxPagoActual + idx + 1);
                    q.values.set('valor_anticipo_cpdtr', 0);
                    q.values.set('ide_cnccc', d.ide_cnccc ?? null);
                    q.values.set('ide_teclb', d.ide_teclb ?? null);
                    q.values.set('fecha_ingre', getCurrentDate());
                    q.values.set('hora_ingre', getCurrentTime());
                    listQuery.push(q);
                });
            }

            // dtoIn.detalles ya representa el estado final deseado completo (updates +
            // inserts); las filas eliminadas simplemente no vienen en el payload.
            const mapaSigno = await this.getMapaSignoTipoTransaccion();
            const saldoResultante = dtoIn.detalles.reduce(
                (acc, d) => acc + Number(d.valor_cpdtr) * (mapaSigno.get(Number(d.ide_cpttr)) ?? 0),
                0,
            );
            if (saldoResultante < -0.005) {
                throw new BadRequestException(
                    'La transacción quedaría descuadrada en contra: los egresos superan a los ingresos. Verifique los valores.',
                );
            }

            await this.dataSource.createListQuery(listQuery);

            const estado = Math.abs(saldoResultante) < 0.005 ? 'cuadrada' : 'pendiente_pago';
            return { message: 'ok', ide_cpctr: dtoIn.ide_cpctr, saldo: saldoResultante, estado };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar el detalle de la transacción: ${msg}`);
        }
    }

    /**
     * Reasigna una línea de cxp_detall_transa a otra cabecera del mismo proveedor.
     * Acción atómica separada del guardado por lote porque afecta el cuadre de DOS
     * cabeceras (origen y destino) a la vez; ambas deben seguir con saldo >= 0.
     */
    async moverDetalleTrn(dtoIn: MoverDetalleTrnDto & HeaderParamsDto) {
        try {
            const qFila = new SelectQuery(`
                SELECT dt.ide_cpdtr, dt.ide_cpctr, dt.ide_cpttr, dt.valor_cpdtr
                FROM cxp_detall_transa dt
                INNER JOIN cxp_cabece_transa ct ON ct.ide_cpctr = dt.ide_cpctr
                WHERE dt.ide_cpdtr = $1 AND ct.ide_geper = $2
            `);
            qFila.addIntParam(1, dtoIn.ide_cpdtr);
            qFila.addIntParam(2, dtoIn.ide_geper);
            const fila = await this.dataSource.createSingleQuery(qFila);
            if (!fila) {
                throw new BadRequestException(
                    `La línea ide_cpdtr=${dtoIn.ide_cpdtr} no existe o no pertenece al proveedor.`,
                );
            }
            if (Number(fila.ide_cpctr) === Number(dtoIn.ide_cpctr_destino)) {
                throw new BadRequestException('La cabecera destino es la misma cabecera actual.');
            }

            const qDestino = new SelectQuery(`
                SELECT ide_cpctr FROM cxp_cabece_transa WHERE ide_cpctr = $1 AND ide_geper = $2
            `);
            qDestino.addIntParam(1, dtoIn.ide_cpctr_destino);
            qDestino.addIntParam(2, dtoIn.ide_geper);
            const destino = await this.dataSource.createSingleQuery(qDestino);
            if (!destino) {
                throw new BadRequestException(
                    `La cabecera destino ide_cpctr=${dtoIn.ide_cpctr_destino} no existe o no pertenece al proveedor.`,
                );
            }

            const mapaSigno = await this.getMapaSignoTipoTransaccion();
            const saldoCabecera = async (
                ideCpctr: number,
                excluirIdeCpdtr?: number,
                agregarFila?: { ide_cpttr: number; valor_cpdtr: number },
            ) => {
                const q = new SelectQuery(`
                    SELECT ide_cpdtr, ide_cpttr, valor_cpdtr FROM cxp_detall_transa WHERE ide_cpctr = $1
                `);
                q.addIntParam(1, ideCpctr);
                const filas: any[] = await this.dataSource.createSelectQuery(q);
                let saldo = filas
                    .filter((f) => Number(f.ide_cpdtr) !== excluirIdeCpdtr)
                    .reduce((acc, f) => acc + Number(f.valor_cpdtr) * (mapaSigno.get(Number(f.ide_cpttr)) ?? 0), 0);
                if (agregarFila) {
                    saldo += agregarFila.valor_cpdtr * (mapaSigno.get(agregarFila.ide_cpttr) ?? 0);
                }
                return saldo;
            };

            const saldoOrigen = await saldoCabecera(Number(fila.ide_cpctr), Number(fila.ide_cpdtr));
            const saldoDestino = await saldoCabecera(Number(dtoIn.ide_cpctr_destino), undefined, {
                ide_cpttr: Number(fila.ide_cpttr),
                valor_cpdtr: Number(fila.valor_cpdtr),
            });

            if (saldoOrigen < -0.005 || saldoDestino < -0.005) {
                throw new BadRequestException(
                    'No se puede mover la línea: la cabecera de origen o la de destino quedaría con egresos mayores a sus ingresos.',
                );
            }

            const q = new UpdateQuery('cxp_detall_transa', 'ide_cpdtr', dtoIn);
            q.where = 'ide_cpdtr = $1';
            q.addIntParam(1, dtoIn.ide_cpdtr);
            q.values.set('ide_cpctr', dtoIn.ide_cpctr_destino);
            await this.dataSource.createListQuery([q]);

            const estadoDe = (s: number) => (Math.abs(s) < 0.005 ? 'cuadrada' : s > 0 ? 'pendiente_pago' : 'descuadrada');
            return {
                message: 'ok',
                origen: { ide_cpctr: Number(fila.ide_cpctr), saldo: saldoOrigen, estado: estadoDe(saldoOrigen) },
                destino: {
                    ide_cpctr: Number(dtoIn.ide_cpctr_destino),
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

    /** Elimina una cabecera de transacción CxP; solo si no tiene detalle asociado. */
    async deleteCabeceraTrn(dtoIn: DeleteCabeceraTrnDto & HeaderParamsDto) {
        try {
            const qCab = new SelectQuery(`
                SELECT ide_cpctr FROM cxp_cabece_transa WHERE ide_cpctr = $1 AND ide_geper = $2
            `);
            qCab.addIntParam(1, dtoIn.ide_cpctr);
            qCab.addIntParam(2, dtoIn.ide_geper);
            const cab = await this.dataSource.createSingleQuery(qCab);
            if (!cab) {
                throw new BadRequestException(
                    `La cabecera ide_cpctr=${dtoIn.ide_cpctr} no existe o no pertenece al proveedor.`,
                );
            }

            const qCount = new SelectQuery(`
                SELECT COUNT(*) AS cantidad FROM cxp_detall_transa WHERE ide_cpctr = $1
            `);
            qCount.addIntParam(1, dtoIn.ide_cpctr);
            const conteo = await this.dataSource.createSingleQuery(qCount);
            if (Number(conteo?.cantidad ?? 0) > 0) {
                throw new BadRequestException('La cabecera tiene detalle asociado, no se puede eliminar.');
            }

            const del = new DeleteQuery('cxp_cabece_transa');
            del.where = 'ide_cpctr = $1';
            del.addIntParam(1, dtoIn.ide_cpctr);
            await this.dataSource.createListQuery([del]);

            return { message: 'ok', ide_cpctr: dtoIn.ide_cpctr };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al eliminar la cabecera: ${msg}`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS PRIVADOS
    // ─────────────────────────────────────────────────────────────────────────

    private async getMapaSignoTipoTransaccion(): Promise<Map<number, number>> {
        const q = new SelectQuery(`SELECT ide_cpttr, signo_cpttr FROM cxp_tipo_transacc`);
        const rows: any[] = await this.dataSource.createSelectQuery(q);
        return new Map(rows.map((r) => [Number(r.ide_cpttr), Number(r.signo_cpttr)]));
    }

    private detalleTrnSinCambios(d: DetalleTrnItemDto, existente: Record<string, any>): boolean {
        const norm = (v: unknown) => (v === undefined || v === null || v === '' ? null : v);
        return (
            Number(d.ide_cpttr) === Number(existente.ide_cpttr) &&
            Number(norm(d.ide_cpcfa) ?? -1) === Number(existente.ide_cpcfa ?? -1) &&
            toPgDate(d.fecha_trans_cpdtr) === toPgDate(existente.fecha_trans_cpdtr) &&
            toPgDate(d.fecha_venci_cpdtr) === toPgDate(existente.fecha_venci_cpdtr) &&
            Number(d.valor_cpdtr) === Number(existente.valor_cpdtr) &&
            String(norm(d.docum_relac_cpdtr) ?? '') === String(existente.docum_relac_cpdtr ?? '') &&
            String(norm(d.observacion_cpdtr) ?? '') === String(existente.observacion_cpdtr ?? '') &&
            Number(norm(d.ide_cnccc) ?? -1) === Number(existente.ide_cnccc ?? -1) &&
            Number(norm(d.ide_teclb) ?? -1) === Number(existente.ide_teclb ?? -1)
        );
    }

    private validarIdentificacionProveedor(data: Record<string, any>) {
        const tipoCedula = this.variables.get('p_gen_tipo_identificacion_cedula');
        const tipoRuc = this.variables.get('p_gen_tipo_iden_ruc');
        const ideGetid = isDefined(data.ide_getid) ? String(data.ide_getid) : null;
        const identificacion = data.identificac_geper;

        if (!ideGetid || !identificacion) return;
        if (ideGetid === String(tipoCedula) && !validateCedula(identificacion)) {
            throw new BadRequestException('Debe ingresar un número de cédula válido');
        }
        if (ideGetid === String(tipoRuc) && !validateRUC(identificacion)) {
            throw new BadRequestException('Debe ingresar un número de RUC válido');
        }
    }

    private async validarDuplicado(identificacion: string, ideEmpr: number, excluirIdeGeper?: number) {
        if (!identificacion) return;
        const q = new SelectQuery(`
            SELECT ide_geper FROM gen_persona
            WHERE identificac_geper = $1 AND ide_empr = $2
            LIMIT 1
        `);
        q.addStringParam(1, identificacion);
        q.addIntParam(2, ideEmpr);
        const existente = await this.dataSource.createSingleQuery(q);
        if (existente && (!isDefined(excluirIdeGeper) || Number(existente.ide_geper) !== excluirIdeGeper)) {
            throw new BadRequestException(`Ya existe una persona registrada con la identificación ${identificacion}`);
        }
    }

    private async appendDireccionPrincipalQuery(
        listQuery: ObjectQueryDto[],
        data: Record<string, any>,
        ideGeper: number,
        login: string,
    ): Promise<void> {
        const hasContactInfo =
            data.direccion_geper != null ||
            data.telefono_geper != null ||
            data.correo_geper != null ||
            data.movil_geper != null;
        if (!hasContactInfo) return;

        const dirObject: Record<string, unknown> = {
            ide_geper: ideGeper,
            ide_getidi: 1,
            ide_gepais: 1,
            ide_geprov: data.ide_geprov ?? null,
            ide_gecant: data.ide_gecant ?? null,
            nombre_dir_gedirp: 'Principal',
            direccion_gedirp: data.direccion_geper ?? null,
            telefono_gedirp: data.telefono_geper ?? null,
            movil_gedirp: data.movil_geper ? String(data.movil_geper).substring(0, 10) : null,
            correo_gedirp: data.correo_geper ?? null,
            activo_gedirp: true,
            defecto_gedirp: true,
        };

        const qExist = new SelectQuery(`
            SELECT ide_gedirp FROM gen_direccion_persona
            WHERE ide_geper = $1 AND defecto_gedirp = true
            LIMIT 1
        `);
        qExist.addIntParam(1, ideGeper);
        const existDir = await this.dataSource.createSingleQuery(qExist);

        if (existDir) {
            const ideGedirp = existDir.ide_gedirp;
            dirObject.ide_gedirp = ideGedirp;
            listQuery.push({
                operation: 'update',
                module: 'gen',
                tableName: 'direccion_persona',
                primaryKey: 'ide_gedirp',
                object: dirObject,
                condition: `ide_gedirp = ${ideGedirp}`,
            });
        } else {
            const ideGedirp = await this.dataSource.getSeqTable('gen_direccion_persona', 'ide_gedirp', 1, login);
            dirObject.ide_gedirp = ideGedirp;
            listQuery.push({
                operation: 'insert',
                module: 'gen',
                tableName: 'direccion_persona',
                primaryKey: 'ide_gedirp',
                object: dirObject,
            });
        }
    }

    private async getVigenciaCuentaPorPagar(ideSucu: number): Promise<number> {
        const q = new SelectQuery(`
            SELECT v.ide_cnvca
            FROM con_vig_conf_asie v
            INNER JOIN con_cab_conf_asie c ON v.ide_cncca = c.ide_cncca
            WHERE UPPER(c.nombre_cncca) = $1
              AND v.estado_cnvca = true
              AND v.ide_sucu = $2
            LIMIT 1
        `);
        q.addStringParam(1, IDENTIFICADOR_CUENTA_CXP);
        q.addIntParam(2, ideSucu);
        const row = await this.dataSource.createSingleQuery(q);
        if (!row?.ide_cnvca) {
            throw new BadRequestException(
                `No existe la configuración contable '${IDENTIFICADOR_CUENTA_CXP}' con vigencia activa.`,
            );
        }
        return Number(row.ide_cnvca);
    }

    async saveCtaBancoProveedor(dtoIn: SaveCtaBancoProveedorDto & HeaderParamsDto) {
        const isUpdate = dtoIn.ideCpcbp != null;
        const listQuery: ObjectQueryDto[] = [];
        let ideCpcbp: number;

        const object: Record<string, unknown> = {
            ide_empr: dtoIn.ideEmpr,
            ide_sucu: dtoIn.ideSucu,
            ide_geper: dtoIn.ideGeper,
            ide_teban: dtoIn.ideTeban ?? null,
            ide_tetcb: dtoIn.ideTetcb ?? null,
            numero_cpcbp: dtoIn.numeroCpcbp ?? null,
            nombre_cpcbp: dtoIn.nombreCpcbp ?? null,
            observacion_cpcbp: dtoIn.observacionCpcbp ?? null,
            activo_cpcbp: dtoIn.activoCpcbp ?? true,
            defecto_cpcbp: dtoIn.defectoCpcbp ?? false,
        };

        if (isUpdate) {
            ideCpcbp = dtoIn.ideCpcbp!;
            object.ide_cpcbp = ideCpcbp;
            listQuery.push({
                operation: 'update',
                module: 'cxp',
                tableName: 'cta_banco_prove',
                primaryKey: 'ide_cpcbp',
                object,
            });
        } else {
            ideCpcbp = await this.dataSource.getSeqTable('cxp_cta_banco_prove', 'ide_cpcbp', 1, dtoIn.login);
            object.ide_cpcbp = ideCpcbp;
            listQuery.push({
                operation: 'insert',
                module: 'cxp',
                tableName: 'cta_banco_prove',
                primaryKey: 'ide_cpcbp',
                object,
            });
        }

        await this.core.save({ ...dtoIn, listQuery, audit: false });
        return { message: 'ok', ideCpcbp };
    }

}
