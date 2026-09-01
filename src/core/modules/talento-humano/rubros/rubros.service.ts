import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { DeleteQuery, Query, SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { FormulaEngineService } from 'src/core/modules/talento-humano/formula-engine/formula-engine.service';
import { getCurrentDate, getCurrentTime } from 'src/util/helpers/date-util';

import {
    EliminarRubroDto,
    GetDetalleRubrosByTipoNominaDto,
    ProbarFormulaDto,
    SaveCargoDto,
    SaveDepartamentoTipoGastoDto,
    SaveDetalleRubroDto,
    SaveRubroCuentaDto,
    SaveRubroDto,
} from './dto/rubros.dto';

@Injectable()
export class RubrosService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly formulaEngine: FormulaEngineService,
    ) { }

    // ─── Catálogos base (Select/Autocomplete) ─────────────────────────────

    async getListDataTipoRubro(dtoIn: HeaderParamsDto) {
        return this.core.getListDataValues({ ...dtoIn, module: 'nrh', tableName: 'tipo_rubro', primaryKey: 'ide_nrtir', columnLabel: 'detalle_nrtir' });
    }

    async getListDataFormaCalculo(dtoIn: HeaderParamsDto) {
        return this.core.getListDataValues({ ...dtoIn, module: 'nrh', tableName: 'forma_calculo', primaryKey: 'ide_nrfoc', columnLabel: 'detalle_nrfoc' });
    }

    async getListDataTipoNomina(dtoIn: HeaderParamsDto) {
        return this.core.getListDataValues({ ...dtoIn, module: 'nrh', tableName: 'tipo_nomina', primaryKey: 'ide_nrtin', columnLabel: 'detalle_nrtin' });
    }

    async getListDataEstadoRol(dtoIn: HeaderParamsDto) {
        return this.core.getListDataValues({ ...dtoIn, module: 'nrh', tableName: 'estado_rol', primaryKey: 'ide_nresr', columnLabel: 'detalle_nresr' });
    }

    async getListDataPeriodos(dtoIn: HeaderParamsDto) {
        return this.core.getListDataValues({
            ...dtoIn,
            module: 'gen',
            tableName: 'perido_rol',
            primaryKey: 'ide_gepro',
            columnLabel: 'detalle_periodo_gepro',
            condition: 'activo_gepro = true',
            columnOrder: 'fecha_inicial_gepro',
        });
    }

    /**
     * nrh_detalle_tipo_nomina: combinaciones tipo_nomina + tipo_empleado + tipo_contrato
     * + sucursal + tipo_rol. Es el valor real que se usa para generar un rol (ide_nrdtn).
     */
    async getDetalleTipoNomina(dtoIn: HeaderParamsDto) {
        try {
            const query = new SelectQuery(`
                SELECT
                    dtn.ide_nrdtn,
                    dtn.ide_nrtin,
                    tin.detalle_nrtin AS tipo_nomina,
                    dtn.ide_gttem,
                    tem.detalle_gttem AS tipo_empleado,
                    dtn.ide_gttco,
                    tco.detalle_gttco AS tipo_contrato,
                    dtn.ide_sucu,
                    dtn.activo_nrdtn
                FROM nrh_detalle_tipo_nomina dtn
                INNER JOIN nrh_tipo_nomina tin ON tin.ide_nrtin = dtn.ide_nrtin
                LEFT JOIN gth_tipo_empleado tem ON tem.ide_gttem = dtn.ide_gttem
                LEFT JOIN gth_tipo_contrato tco ON tco.ide_gttco = dtn.ide_gttco
                WHERE dtn.ide_sucu = $1
                ORDER BY tin.detalle_nrtin
            `);
            query.setLazy(false);
            query.addIntParam(1, dtoIn.ideSucu);
            return this.dataSource.createSelectQuery(query);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener detalle de tipo de nómina: ${msg}`);
        }
    }

    // ─── Rubros ────────────────────────────────────────────────────────────

    /**
     * `tiene_formula`/`nominas_asignadas` son computados (no columnas reales de
     * nrh_rubro) para la pantalla de Catálogo de Rubros: si el rubro tiene una fórmula
     * real configurada en nrh_detalle_rubro, y en qué tipos de nómina ACTIVOS
     * (nrh_detalle_tipo_nomina.activo_nrdtn) está parametrizado — ayuda a detectar
     * rubros huérfanos (sin fórmula y sin nómina asignada = candidato a desactivar).
     */
    async getRubros(dtoIn: HeaderParamsDto) {
        try {
            const query = new SelectQuery(`
                SELECT
                    r.ide_nrrub,
                    r.detalle_nrrub,
                    r.ide_nrfoc,
                    foc.detalle_nrfoc AS forma_calculo,
                    r.ide_nrtir,
                    tir.detalle_nrtir AS tipo_rubro,
                    tir.signo_nrtir,
                    r.anticipo_nrrub,
                    r.decimo_nrrub,
                    r.activo_nrrub,
                    EXISTS (
                        SELECT 1 FROM nrh_detalle_rubro der
                        WHERE der.ide_nrrub = r.ide_nrrub AND der.activo_nrder = true
                          AND der.formula_nrder IS NOT NULL AND btrim(der.formula_nrder) <> ''
                    ) AS tiene_formula,
                    (
                        SELECT string_agg(DISTINCT tin.detalle_nrtin, ', ' ORDER BY tin.detalle_nrtin)
                        FROM nrh_detalle_rubro der
                        INNER JOIN nrh_detalle_tipo_nomina dtn ON dtn.ide_nrdtn = der.ide_nrdtn AND dtn.activo_nrdtn = true
                        INNER JOIN nrh_tipo_nomina tin ON tin.ide_nrtin = dtn.ide_nrtin
                        WHERE der.ide_nrrub = r.ide_nrrub AND der.activo_nrder = true
                    ) AS nominas_asignadas
                FROM nrh_rubro r
                INNER JOIN nrh_forma_calculo foc ON foc.ide_nrfoc = r.ide_nrfoc
                INNER JOIN nrh_tipo_rubro tir ON tir.ide_nrtir = r.ide_nrtir
                ORDER BY r.detalle_nrrub
            `);
            query.setLazy(false);
            return this.dataSource.createSelectQuery(query);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener rubros: ${msg}`);
        }
    }

    async saveRubro(dtoIn: SaveRubroDto & HeaderParamsDto) {
        try {
            if (!dtoIn.data) throw new BadRequestException('El campo data es requerido');
            const { data } = dtoIn;
            const isUpdate = dtoIn.isUpdate && !!data.ide_nrrub;

            if (isUpdate) {
                const updQuery: ObjectQueryDto = {
                    operation: 'update',
                    module: 'nrh',
                    tableName: 'rubro',
                    primaryKey: 'ide_nrrub',
                    object: { ...data, usuario_actua: dtoIn.login, fecha_actua: getCurrentDate(), hora_actua: getCurrentTime() },
                    condition: `ide_nrrub = ${data.ide_nrrub}`,
                };
                await this.core.save({ ...dtoIn, listQuery: [updQuery], audit: true });
                return { message: 'ok', rowCount: 1, ide_nrrub: data.ide_nrrub };
            }

            if (!data.ide_nrfoc || !data.ide_nrtir || !data.detalle_nrrub) {
                throw new BadRequestException('ide_nrfoc, ide_nrtir y detalle_nrrub son requeridos para crear un rubro');
            }
            const ideNrrub = await this.dataSource.getSeqTable('nrh_rubro', 'ide_nrrub', 1, dtoIn.login);
            const insQuery: ObjectQueryDto = {
                operation: 'insert',
                module: 'nrh',
                tableName: 'rubro',
                primaryKey: 'ide_nrrub',
                object: { activo_nrrub: true, ...data, ide_nrrub: ideNrrub, usuario_ingre: dtoIn.login, fecha_ingre: getCurrentDate(), hora_ingre: getCurrentTime() },
            };
            await this.core.save({ ...dtoIn, listQuery: [insQuery], audit: true });
            return { message: 'ok', rowCount: 1, ide_nrrub: ideNrrub };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar el rubro: ${msg}`);
        }
    }

    /**
     * Elimina físicamente un rubro y todo lo que depende de él, en cascada (la BD no
     * tiene ON DELETE CASCADE en estas FK, así que se hace a mano en el orden correcto
     * dentro de una transacción — ver conteo real de tablas hijas verificado contra
     * information_schema: nrh_detalle_rubro → nrh_detalle_rol / nrh_amortizacion →
     * nrh_precancelacion / nrh_detalle_factura_guarderia / nrh_retencion_rubro_descuento
     * / nrh_rubro_asiento / nrh_rubro_cuenta / nrh_solicitud_mensualizacion). Pedido
     * explícito del usuario para depurar el catálogo nuevo de Nómina y dejar solo los
     * rubros que usa DIQUIMEC — por eso NO es un simple activo_nrrub=false. Con dos
     * salvaguardas: no se puede borrar un rubro de cálculo legal fijo (el que apunta
     * sis_parametros para sueldo/horas extra/décimos/fondos de reserva), ni uno que ya
     * tenga valores en un rol CERRADO (con asiento contable real generado).
     */
    async eliminarRubro(dtoIn: EliminarRubroDto & HeaderParamsDto) {
        if (!dtoIn.ide_nrrub) throw new BadRequestException('El campo ide_nrrub es requerido');
        try {
            const variablesProtegidas = await this.core.getVariables([
                'p_nrh_rubro_sueldo',
                'p_nrh_rubro_horas_supl',
                'p_nrh_rubro_horas_extra',
                'p_nrh_rubro_horas_nocturna',
                'p_nrh_rubro_decimo_tercero',
                'p_nrh_rubro_decimo_cuarto',
                'p_nrh_rubro_fondos_reserva',
            ]);
            const idsProtegidos = new Set(
                [...variablesProtegidas.values()].map((v) => Number(v)).filter((n) => Number.isFinite(n)),
            );
            if (idsProtegidos.has(dtoIn.ide_nrrub)) {
                throw new BadRequestException(
                    'Este rubro es de cálculo legal fijo (sueldo, horas extra, décimo 3°/4° o fondos de reserva, ' +
                    'configurado en Sistema > Parámetros) y no se puede eliminar.',
                );
            }

            const cerradoQuery = new SelectQuery(`
                SELECT 1
                FROM nrh_detalle_rol dr
                INNER JOIN nrh_detalle_rubro der ON der.ide_nrder = dr.ide_nrder
                INNER JOIN nrh_rol r ON r.ide_nrrol = dr.ide_nrrol
                WHERE der.ide_nrrub = $1 AND r.ide_cnmoc IS NOT NULL
                LIMIT 1
            `);
            cerradoQuery.setLazy(false);
            cerradoQuery.addIntParam(1, dtoIn.ide_nrrub);
            const usadoEnCerrado = await this.dataSource.createSingleQuery(cerradoQuery);
            if (usadoEnCerrado) {
                throw new BadRequestException(
                    'No se puede eliminar: este rubro tiene valores en un rol ya cerrado (con asiento contable ' +
                    'generado). Desactívelo desde el catálogo en su lugar.',
                );
            }

            const nrderQuery = new SelectQuery(`SELECT ide_nrder FROM nrh_detalle_rubro WHERE ide_nrrub = $1`);
            nrderQuery.setLazy(false);
            nrderQuery.addIntParam(1, dtoIn.ide_nrrub);
            const nrderRows = (await this.dataSource.createSelectQuery(nrderQuery)) as Array<{ ide_nrder: number }>;
            const nrderIds = nrderRows.map((r) => r.ide_nrder);

            const nramoQuery = new SelectQuery(`SELECT ide_nramo FROM nrh_amortizacion WHERE ide_nrrub = $1`);
            nramoQuery.setLazy(false);
            nramoQuery.addIntParam(1, dtoIn.ide_nrrub);
            const nramoRows = (await this.dataSource.createSelectQuery(nramoQuery)) as Array<{ ide_nramo: number }>;
            const nramoIds = nramoRows.map((r) => r.ide_nramo);

            const listQuery: Query[] = [];

            if (nramoIds.length > 0) {
                const delPrecancelacion = new DeleteQuery('nrh_precancelacion');
                delPrecancelacion.where = 'ide_nramo = ANY ($1)';
                delPrecancelacion.addParam(1, nramoIds);
                listQuery.push(delPrecancelacion);
            }

            const delAmortizacion = new DeleteQuery('nrh_amortizacion');
            delAmortizacion.where = 'ide_nrrub = $1';
            delAmortizacion.addIntParam(1, dtoIn.ide_nrrub);
            listQuery.push(delAmortizacion);

            if (nrderIds.length > 0) {
                const delDetalleRol = new DeleteQuery('nrh_detalle_rol');
                delDetalleRol.where = 'ide_nrder = ANY ($1)';
                delDetalleRol.addParam(1, nrderIds);
                listQuery.push(delDetalleRol);
            }

            const delFacturaGuarderia = new DeleteQuery('nrh_detalle_factura_guarderia');
            delFacturaGuarderia.where = 'ide_nrrub = $1';
            delFacturaGuarderia.addIntParam(1, dtoIn.ide_nrrub);
            listQuery.push(delFacturaGuarderia);

            const delRetencionDescuento = new DeleteQuery('nrh_retencion_rubro_descuento');
            delRetencionDescuento.where = 'ide_nrrub = $1';
            delRetencionDescuento.addIntParam(1, dtoIn.ide_nrrub);
            listQuery.push(delRetencionDescuento);

            const delRubroAsiento = new DeleteQuery('nrh_rubro_asiento');
            delRubroAsiento.where = 'ide_nrrub = $1';
            delRubroAsiento.addIntParam(1, dtoIn.ide_nrrub);
            listQuery.push(delRubroAsiento);

            const delRubroCuenta = new DeleteQuery('nrh_rubro_cuenta');
            delRubroCuenta.where = 'ide_nrrub = $1';
            delRubroCuenta.addIntParam(1, dtoIn.ide_nrrub);
            listQuery.push(delRubroCuenta);

            const delSolicitudMensualizacion = new DeleteQuery('nrh_solicitud_mensualizacion');
            delSolicitudMensualizacion.where = 'ide_nrrub = $1';
            delSolicitudMensualizacion.addIntParam(1, dtoIn.ide_nrrub);
            listQuery.push(delSolicitudMensualizacion);

            const delDetalleRubro = new DeleteQuery('nrh_detalle_rubro');
            delDetalleRubro.where = 'ide_nrrub = $1';
            delDetalleRubro.addIntParam(1, dtoIn.ide_nrrub);
            listQuery.push(delDetalleRubro);

            const delRubro = new DeleteQuery('nrh_rubro');
            delRubro.where = 'ide_nrrub = $1';
            delRubro.addIntParam(1, dtoIn.ide_nrrub);
            listQuery.push(delRubro);

            await this.dataSource.createListQuery(listQuery);
            return { message: 'ok', ide_nrrub: dtoIn.ide_nrrub };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al eliminar el rubro: ${msg}`);
        }
    }

    // ─── Parametría (nrh_detalle_rubro: fórmula por rubro × tipo de nómina) ─

    async getDetalleRubrosByTipoNomina(dtoIn: GetDetalleRubrosByTipoNominaDto & HeaderParamsDto) {
        if (!dtoIn.ide_nrdtn) {
            throw new BadRequestException('El campo ide_nrdtn es requerido');
        }
        try {
            const query = new SelectQuery(`
                SELECT
                    der.ide_nrder,
                    der.ide_nrrub,
                    rub.detalle_nrrub,
                    tir.signo_nrtir,
                    der.ide_nrdtn,
                    der.formula_nrder,
                    der.orden_nrder,
                    der.orden_imprime_nrder,
                    der.fecha_inicial_nrder,
                    der.fecha_final_nrder,
                    der.fecha_pago_nrder,
                    der.observacion_nrder,
                    der.imprime_nrder,
                    der.activo_nrder
                FROM nrh_detalle_rubro der
                INNER JOIN nrh_rubro rub ON rub.ide_nrrub = der.ide_nrrub
                INNER JOIN nrh_tipo_rubro tir ON tir.ide_nrtir = rub.ide_nrtir
                WHERE der.ide_nrdtn = $1
                ORDER BY COALESCE(der.orden_nrder, 999999), der.ide_nrder
            `);
            query.setLazy(false);
            query.addIntParam(1, dtoIn.ide_nrdtn);
            return this.dataSource.createSelectQuery(query);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener la parametría de rubros: ${msg}`);
        }
    }

    /**
     * Evalúa una fórmula contra un empleado real ANTES de guardarla, usando el mismo
     * FormulaEngineService que usa generarRol (fidelidad 1:1 con lo que pasaría en un rol
     * real) — permite validar la sintaxis y ver el resultado en el editor de Parametría
     * de Rubros. El contexto de "otros rubros ya calculados" (para fórmulas que
     * referencian [ide_nrder]) se arma con los valores congelados del ÚLTIMO rol de ese
     * empleado (nrh_detalle_rol) — si nunca se le generó un rol, el contexto queda vacío
     * y cualquier referencia a otro rubro se evalúa como 0 (se avisa en la respuesta).
     */
    async probarFormula(dtoIn: ProbarFormulaDto & HeaderParamsDto) {
        try {
            const ultimoRolQuery = new SelectQuery(`
                SELECT MAX(ide_nrrol) AS ide_nrrol FROM nrh_detalle_rol WHERE ide_geedp = $1
            `);
            ultimoRolQuery.setLazy(false);
            ultimoRolQuery.addIntParam(1, dtoIn.ideGeedp);
            const ultimoRolRows = await this.dataSource.createSelectQuery(ultimoRolQuery);
            const ideNrrolContexto = (ultimoRolRows?.[0] as { ide_nrrol: number | null } | undefined)?.ide_nrrol ?? null;

            const computedValues = new Map<number, number>();
            if (ideNrrolContexto) {
                const detalleQuery = new SelectQuery(`
                    SELECT ide_nrder, valor_nrdro FROM nrh_detalle_rol WHERE ide_nrrol = $1 AND ide_geedp = $2
                `);
                detalleQuery.setLazy(false);
                detalleQuery.addIntParam(1, ideNrrolContexto);
                detalleQuery.addIntParam(2, dtoIn.ideGeedp);
                const rows = (await this.dataSource.createSelectQuery(detalleQuery)) as Array<{
                    ide_nrder: number;
                    valor_nrdro: number;
                }>;
                for (const row of rows) computedValues.set(row.ide_nrder, Number(row.valor_nrdro) || 0);
            }

            const fechaRol = getCurrentDate();
            const valor = await this.formulaEngine.evaluarRubro({
                formula: dtoIn.formula,
                ideGeedp: dtoIn.ideGeedp,
                fechaRol,
                computedValues,
                mensualizado: false,
            });

            return {
                message: 'ok',
                valor: Math.round(valor * 100) / 100,
                ideNrrolContexto,
                rubrosEnContexto: computedValues.size,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al probar la fórmula: ${msg}`);
        }
    }

    async saveDetalleRubro(dtoIn: SaveDetalleRubroDto & HeaderParamsDto) {
        try {
            if (!dtoIn.data) throw new BadRequestException('El campo data es requerido');
            const { data } = dtoIn;
            const isUpdate = dtoIn.isUpdate && !!data.ide_nrder;

            if (isUpdate) {
                const updQuery: ObjectQueryDto = {
                    operation: 'update',
                    module: 'nrh',
                    tableName: 'detalle_rubro',
                    primaryKey: 'ide_nrder',
                    object: { ...data, usuario_actua: dtoIn.login, fecha_actua: getCurrentDate(), hora_actua: getCurrentTime() },
                    condition: `ide_nrder = ${data.ide_nrder}`,
                };
                await this.core.save({ ...dtoIn, listQuery: [updQuery], audit: true });
                return { message: 'ok', rowCount: 1, ide_nrder: data.ide_nrder };
            }

            if (!data.ide_nrrub || !data.ide_nrdtn) {
                throw new BadRequestException('ide_nrrub y ide_nrdtn son requeridos para crear un detalle de rubro');
            }
            const ideNrder = await this.dataSource.getSeqTable('nrh_detalle_rubro', 'ide_nrder', 1, dtoIn.login);
            const insQuery: ObjectQueryDto = {
                operation: 'insert',
                module: 'nrh',
                tableName: 'detalle_rubro',
                primaryKey: 'ide_nrder',
                object: { activo_nrder: true, ...data, ide_nrder: ideNrder, usuario_ingre: dtoIn.login, fecha_ingre: getCurrentDate(), hora_ingre: getCurrentTime() },
            };
            await this.core.save({ ...dtoIn, listQuery: [insQuery], audit: true });
            return { message: 'ok', rowCount: 1, ide_nrder: ideNrder };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar el detalle de rubro: ${msg}`);
        }
    }

    // ─── Catálogo de cargos (gth_cargo) ───────────────────────────────────

    async getCargos() {
        try {
            const query = new SelectQuery(`
                SELECT ide_gtcar, detalle_gtcar, activo_gtcar
                FROM gth_cargo
                ORDER BY detalle_gtcar
            `);
            query.setLazy(false);
            return this.dataSource.createSelectQuery(query);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener cargos: ${msg}`);
        }
    }

    async saveCargo(dtoIn: SaveCargoDto & HeaderParamsDto) {
        try {
            if (!dtoIn.data) throw new BadRequestException('El campo data es requerido');
            const { data } = dtoIn;
            const isUpdate = dtoIn.isUpdate && !!data.ide_gtcar;

            if (isUpdate) {
                const updQuery: ObjectQueryDto = {
                    operation: 'update',
                    module: 'gth',
                    tableName: 'cargo',
                    primaryKey: 'ide_gtcar',
                    object: { ...data, usuario_actua: dtoIn.login, fecha_actua: getCurrentDate(), hora_actua: getCurrentTime() },
                    condition: `ide_gtcar = ${data.ide_gtcar}`,
                };
                await this.core.save({ ...dtoIn, listQuery: [updQuery], audit: true });
                return { message: 'ok', rowCount: 1, ide_gtcar: data.ide_gtcar };
            }

            if (!data.detalle_gtcar) {
                throw new BadRequestException('detalle_gtcar es requerido para crear un cargo');
            }
            const ideGtcar = await this.dataSource.getSeqTable('gth_cargo', 'ide_gtcar', 1, dtoIn.login);
            const insQuery: ObjectQueryDto = {
                operation: 'insert',
                module: 'gth',
                tableName: 'cargo',
                primaryKey: 'ide_gtcar',
                object: { activo_gtcar: true, ...data, ide_gtcar: ideGtcar, usuario_ingre: dtoIn.login, fecha_ingre: getCurrentDate(), hora_ingre: getCurrentTime() },
            };
            await this.core.save({ ...dtoIn, listQuery: [insQuery], audit: true });
            return { message: 'ok', rowCount: 1, ide_gtcar: ideGtcar };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar el cargo: ${msg}`);
        }
    }

    // ─── Mapeo Rubro -> Cuenta Contable (con_det_plan_cuen) ───────────────

    async getRubrosCuenta() {
        try {
            const query = new SelectQuery(`
                SELECT
                    rc.ide_nrrucu,
                    rc.ide_nrrub,
                    rub.detalle_nrrub AS rubro,
                    tir.detalle_nrtir AS tipo_rubro,
                    tir.signo_nrtir,
                    rc.ide_cndpc,
                    dpc.nombre_cndpc,
                    rc.ide_cndpc_pasivo,
                    dpcp.nombre_cndpc AS nombre_cndpc_pasivo,
                    rc.ide_cndpc_gasto_venta,
                    dpcv.nombre_cndpc AS nombre_cndpc_gasto_venta,
                    rc.ide_cndpc_gasto_admin,
                    dpca.nombre_cndpc AS nombre_cndpc_gasto_admin,
                    rc.activo_nrrucu
                FROM nrh_rubro_cuenta rc
                INNER JOIN nrh_rubro rub ON rub.ide_nrrub = rc.ide_nrrub
                INNER JOIN nrh_tipo_rubro tir ON tir.ide_nrtir = rub.ide_nrtir
                LEFT JOIN con_det_plan_cuen dpc ON dpc.ide_cndpc = rc.ide_cndpc
                LEFT JOIN con_det_plan_cuen dpcp ON dpcp.ide_cndpc = rc.ide_cndpc_pasivo
                LEFT JOIN con_det_plan_cuen dpcv ON dpcv.ide_cndpc = rc.ide_cndpc_gasto_venta
                LEFT JOIN con_det_plan_cuen dpca ON dpca.ide_cndpc = rc.ide_cndpc_gasto_admin
                WHERE rc.activo_nrrucu = true
                ORDER BY rub.detalle_nrrub
            `);
            query.setLazy(false);
            return this.dataSource.createSelectQuery(query);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener el mapeo rubro-cuenta: ${msg}`);
        }
    }

    async saveRubroCuenta(dtoIn: SaveRubroCuentaDto & HeaderParamsDto) {
        try {
            if (!dtoIn.data) throw new BadRequestException('El campo data es requerido');
            const { data } = dtoIn;
            if (!data.ide_nrrub) {
                throw new BadRequestException('ide_nrrub es requerido');
            }
            // ide_cndpc es la cuenta "simple" para el asiento principal del rol (sueldo,
            // IESS, etc.); ide_cndpc_pasivo/gasto_venta/gasto_admin son las 3 cuentas que
            // usa la provisión de décimos/fondos de reserva (RolPagosService,
            // generarProvisionDecimosFondos/generarLiquidacionDecimo) — un rubro puede
            // usar el primer grupo, el segundo, o ambos, pero no puede quedar sin ninguno.
            if (!data.ide_cndpc && !data.ide_cndpc_pasivo && !data.ide_cndpc_gasto_venta && !data.ide_cndpc_gasto_admin) {
                throw new BadRequestException('Debe indicar al menos una cuenta contable');
            }

            // Un rubro tiene una sola cuenta activa a la vez: desactivar la anterior.
            // El helper de auditoría de core.save necesita el valor de la primary key
            // presente en `object` (no solo en `condition`), por eso se busca primero
            // cuál es la fila activa en vez de desactivar "a ciegas" por ide_nrrub.
            const activaQuery = new SelectQuery(`
                SELECT ide_nrrucu FROM nrh_rubro_cuenta WHERE ide_nrrub = $1 AND activo_nrrucu = true LIMIT 1
            `);
            activaQuery.setLazy(false);
            activaQuery.addIntParam(1, data.ide_nrrub as number);
            const activaRows = await this.dataSource.createSelectQuery(activaQuery);
            const ideNrrucuActiva = (activaRows?.[0] as { ide_nrrucu: number } | undefined)?.ide_nrrucu;

            const listQuery: ObjectQueryDto[] = [];
            if (ideNrrucuActiva) {
                listQuery.push({
                    operation: 'update',
                    module: 'nrh',
                    tableName: 'rubro_cuenta',
                    primaryKey: 'ide_nrrucu',
                    object: { ide_nrrucu: ideNrrucuActiva, activo_nrrucu: false },
                    condition: `ide_nrrucu = ${ideNrrucuActiva}`,
                });
            }

            const ideNrrucu = await this.dataSource.getSeqTable('nrh_rubro_cuenta', 'ide_nrrucu', 1, dtoIn.login);
            listQuery.push({
                operation: 'insert',
                module: 'nrh',
                tableName: 'rubro_cuenta',
                primaryKey: 'ide_nrrucu',
                object: {
                    ide_nrrucu: ideNrrucu,
                    ide_nrrub: data.ide_nrrub,
                    ide_cndpc: data.ide_cndpc ?? null,
                    ide_cndpc_pasivo: data.ide_cndpc_pasivo ?? null,
                    ide_cndpc_gasto_venta: data.ide_cndpc_gasto_venta ?? null,
                    ide_cndpc_gasto_admin: data.ide_cndpc_gasto_admin ?? null,
                    activo_nrrucu: true,
                    usuario_ingre: dtoIn.login,
                    fecha_ingre: getCurrentDate(),
                    hora_ingre: getCurrentTime(),
                },
            });

            await this.core.save({ ...dtoIn, listQuery, audit: true });
            return { message: 'ok', ide_nrrucu: ideNrrucu };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar el mapeo rubro-cuenta: ${msg}`);
        }
    }

    // ─── Catálogo de departamentos (gen_departamento) ─────────────────────
    // Solo para clasificar el centro de costo (Ventas/Administrativo) que usa
    // RolPagosService#generarProvisionDecimosFondos al partir el gasto de la
    // provisión mensual — no es un CRUD completo de departamentos (esa tabla ya
    // se administra en el sistema legado; acá solo se agrega el campo nuevo).

    async getDepartamentos() {
        try {
            const query = new SelectQuery(`
                SELECT ide_gedep, detalle_gedep, tipo_gasto_gedep, activo_gedep
                FROM gen_departamento
                WHERE activo_gedep = true OR activo_gedep IS NULL
                ORDER BY detalle_gedep
            `);
            query.setLazy(false);
            return this.dataSource.createSelectQuery(query);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener departamentos: ${msg}`);
        }
    }

    async saveDepartamentoTipoGasto(dtoIn: SaveDepartamentoTipoGastoDto & HeaderParamsDto) {
        if (!dtoIn.ide_gedep) throw new BadRequestException('El campo ide_gedep es requerido');
        if (!['venta', 'administrativo'].includes(dtoIn.tipo_gasto_gedep)) {
            throw new BadRequestException('tipo_gasto_gedep debe ser "venta" o "administrativo"');
        }
        try {
            const updQuery: ObjectQueryDto = {
                operation: 'update',
                module: 'gen',
                tableName: 'departamento',
                primaryKey: 'ide_gedep',
                object: {
                    ide_gedep: dtoIn.ide_gedep,
                    tipo_gasto_gedep: dtoIn.tipo_gasto_gedep,
                    usuario_actua: dtoIn.login,
                    fecha_actua: getCurrentDate(),
                    hora_actua: getCurrentTime(),
                },
                condition: `ide_gedep = ${dtoIn.ide_gedep}`,
            };
            await this.core.save({ ...dtoIn, listQuery: [updQuery], audit: true });
            return { message: 'ok', ide_gedep: dtoIn.ide_gedep };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar el departamento: ${msg}`);
        }
    }
}
