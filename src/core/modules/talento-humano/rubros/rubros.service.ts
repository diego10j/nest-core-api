import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { getCurrentDate, getCurrentTime } from 'src/util/helpers/date-util';

import { GetDetalleRubrosByTipoNominaDto, SaveCargoDto, SaveDetalleRubroDto, SaveRubroCuentaDto, SaveRubroDto } from './dto/rubros.dto';

@Injectable()
export class RubrosService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
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
                    r.activo_nrrub
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
                    dpc.codig_recur_cndpc,
                    dpc.nombre_cndpc,
                    rc.activo_nrrucu
                FROM nrh_rubro_cuenta rc
                INNER JOIN nrh_rubro rub ON rub.ide_nrrub = rc.ide_nrrub
                INNER JOIN nrh_tipo_rubro tir ON tir.ide_nrtir = rub.ide_nrtir
                INNER JOIN con_det_plan_cuen dpc ON dpc.ide_cndpc = rc.ide_cndpc
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
            if (!data.ide_nrrub || !data.ide_cndpc) {
                throw new BadRequestException('ide_nrrub y ide_cndpc son requeridos');
            }

            // Un rubro tiene una sola cuenta activa a la vez: desactivar la anterior.
            const desactivar: ObjectQueryDto = {
                operation: 'update',
                module: 'nrh',
                tableName: 'rubro_cuenta',
                primaryKey: 'ide_nrrucu',
                object: { activo_nrrucu: false },
                condition: `ide_nrrub = ${data.ide_nrrub} AND activo_nrrucu = true`,
            };

            const ideNrrucu = await this.dataSource.getSeqTable('nrh_rubro_cuenta', 'ide_nrrucu', 1, dtoIn.login);
            const crear: ObjectQueryDto = {
                operation: 'insert',
                module: 'nrh',
                tableName: 'rubro_cuenta',
                primaryKey: 'ide_nrrucu',
                object: {
                    ide_nrrucu: ideNrrucu,
                    ide_nrrub: data.ide_nrrub,
                    ide_cndpc: data.ide_cndpc,
                    activo_nrrucu: true,
                    usuario_ingre: dtoIn.login,
                    fecha_ingre: getCurrentDate(),
                    hora_ingre: getCurrentTime(),
                },
            };

            await this.core.save({ ...dtoIn, listQuery: [desactivar, crear], audit: true });
            return { message: 'ok', ide_nrrucu: ideNrrucu };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar el mapeo rubro-cuenta: ${msg}`);
        }
    }
}
