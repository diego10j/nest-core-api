import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { getCurrentDate, getCurrentTime } from 'src/util/helpers/date-util';

import {
    EliminarCuentaBancariaDto,
    EliminarEducacionDto,
    EliminarExperienciaLaboralDto,
    GetByEmpleadoDto,
    SaveCuentaBancariaDto,
    SaveEducacionDto,
    SaveExperienciaLaboralDto,
} from './dto/ficha-empleado.dto';

const REQUIRED_EDUCACION = ['ide_gtemp', 'ide_gtted', 'ide_gtttp'];
const REQUIRED_EXPERIENCIA = ['ide_gtemp', 'ide_geins', 'detalle_cargo_gtele'];
const REQUIRED_CUENTA_BANCARIA = ['ide_gtemp', 'ide_geins', 'ide_gttcb', 'numero_cuenta_gtcbe'];

/**
 * Pestañas complementarias de la ficha del empleado (Educación/Título, Experiencia
 * Laboral y Cuenta Bancaria) — información que en el sistema legado (sigafi) vive en
 * el módulo "Gestión de Talento Humano" (sis_modulo id 13, distinto de "Nómina" id 6),
 * pantalla pre_empleado.java, tabs EDUCACION / EXPERIENCIA LABORAL / CUENTA BANCARIA.
 * Aquí se replica solo el modelo de datos probado (gth_educacion_empleado /
 * gth_experiencia_laboral_emplea / gth_cuenta_bancaria_empleado), no la UI legada.
 */
@Injectable()
export class FichaEmpleadoService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) { }

    // ─── Catálogos ─────────────────────────────────────────────────────────

    async getCatalogos(dtoIn: HeaderParamsDto) {
        const [
            tiposEducacion,
            tiposEspecialidad,
            titulosProfesionales,
            aniosAprobados,
            instituciones,
            tiposCuentaBancaria,
            variables,
        ] = await Promise.all([
            this.core.getListDataValues({ ...dtoIn, module: 'gth', tableName: 'tipo_educacion', primaryKey: 'ide_gtted', columnLabel: 'detalle_gtted' }),
            this.core.getListDataValues({ ...dtoIn, module: 'gth', tableName: 'tipo_especialidad', primaryKey: 'ide_gttes', columnLabel: 'detalle_gttes' }),
            this.core.getListDataValues({ ...dtoIn, module: 'gth', tableName: 'tipo_titulo_profesional', primaryKey: 'ide_gtttp', columnLabel: 'detalle_gtttp' }),
            this.core.getListDataValues({ ...dtoIn, module: 'gth', tableName: 'anio_aprobado', primaryKey: 'ide_gtana', columnLabel: 'detalle_gtana' }),
            this.core.getListDataValues({ ...dtoIn, module: 'gen', tableName: 'institucion', primaryKey: 'ide_geins', columnLabel: 'detalle_geins', condition: 'activo_geins = true' }),
            this.core.getListDataValues({ ...dtoIn, module: 'gth', tableName: 'tipo_cuenta_bancaria', primaryKey: 'ide_gttcb', columnLabel: 'detalle_gttcb' }),
            this.core.getVariables(['p_gen_tipo_institucion_financiera']),
        ]);
        // Instituciones financieras (bancos) = subconjunto de gen_institucion filtrado por el
        // parámetro que ya usa el resto del ERP para lo mismo (ver cuentas bancarias de
        // proveedor/cliente) - no todas las instituciones de gen_institucion son bancos.
        const ideTipoInstFinanciera = Number(variables.get('p_gen_tipo_institucion_financiera'));
        const institucionesFinancieras = await this.core.getListDataValues({
            ...dtoIn,
            module: 'gen',
            tableName: 'institucion',
            primaryKey: 'ide_geins',
            columnLabel: 'detalle_geins',
            condition: `activo_geins = true AND ide_getii = ${ideTipoInstFinanciera}`,
        });
        return {
            tiposEducacion,
            tiposEspecialidad,
            titulosProfesionales,
            aniosAprobados,
            instituciones,
            tiposCuentaBancaria,
            institucionesFinancieras,
        };
    }

    // ─── Educación / Título ────────────────────────────────────────────────

    async getEducacion(dtoIn: GetByEmpleadoDto & HeaderParamsDto) {
        if (!dtoIn.ide_gtemp) throw new BadRequestException('El campo ide_gtemp es requerido');
        try {
            const query = new SelectQuery(`
                SELECT
                    e.ide_gtede,
                    e.ide_gtemp,
                    e.ide_geins,
                    ins.detalle_geins AS institucion,
                    e.ide_gttes,
                    tes.detalle_gttes AS especialidad,
                    e.ide_gtted,
                    ted.detalle_gtted AS tipo_educacion,
                    e.ide_gtttp,
                    ttp.detalle_gtttp AS titulo,
                    e.ide_gtana,
                    ana.detalle_gtana AS anio_aprobado,
                    e.anio_gtede,
                    e.anio_grado_gtede,
                    e.registro_titulo_gtede,
                    e.observaciones_gtede,
                    e.activo_gtede
                FROM gth_educacion_empleado e
                LEFT JOIN gen_institucion ins ON ins.ide_geins = e.ide_geins
                LEFT JOIN gth_tipo_especialidad tes ON tes.ide_gttes = e.ide_gttes
                LEFT JOIN gth_tipo_educacion ted ON ted.ide_gtted = e.ide_gtted
                LEFT JOIN gth_tipo_titulo_profesional ttp ON ttp.ide_gtttp = e.ide_gtttp
                LEFT JOIN gth_anio_aprobado ana ON ana.ide_gtana = e.ide_gtana
                WHERE e.ide_gtemp = $1 AND (e.activo_gtede IS NULL OR e.activo_gtede = true)
                ORDER BY e.anio_gtede DESC NULLS LAST, e.ide_gtede DESC
            `);
            query.setLazy(false);
            query.addIntParam(1, dtoIn.ide_gtemp);
            return this.dataSource.createSelectQuery(query);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener la educación del empleado: ${msg}`);
        }
    }

    async saveEducacion(dtoIn: SaveEducacionDto & HeaderParamsDto) {
        try {
            if (!dtoIn.data) throw new BadRequestException('El campo data es requerido');
            const { data } = dtoIn;
            const isUpdate = dtoIn.isUpdate && !!data.ide_gtede;

            if (isUpdate) {
                const updQuery: ObjectQueryDto = {
                    operation: 'update',
                    module: 'gth',
                    tableName: 'educacion_empleado',
                    primaryKey: 'ide_gtede',
                    object: { ...data, usuario_actua: dtoIn.login, fecha_actua: getCurrentDate(), hora_actua: getCurrentTime() },
                    condition: `ide_gtede = ${data.ide_gtede}`,
                };
                await this.core.save({ ...dtoIn, listQuery: [updQuery], audit: true });
                return { message: 'ok', rowCount: 1, ide_gtede: data.ide_gtede };
            }

            for (const field of REQUIRED_EDUCACION) {
                if (data[field] === undefined || data[field] === null) {
                    throw new BadRequestException(`El campo ${field} es requerido para registrar educación`);
                }
            }

            const ideGtede = await this.dataSource.getSeqTable('gth_educacion_empleado', 'ide_gtede', 1, dtoIn.login);
            const insQuery: ObjectQueryDto = {
                operation: 'insert',
                module: 'gth',
                tableName: 'educacion_empleado',
                primaryKey: 'ide_gtede',
                object: {
                    activo_gtede: true,
                    ...data,
                    ide_gtede: ideGtede,
                    usuario_ingre: dtoIn.login,
                    fecha_ingre: getCurrentDate(),
                    hora_ingre: getCurrentTime(),
                },
            };
            await this.core.save({ ...dtoIn, listQuery: [insQuery], audit: true });
            return { message: 'ok', rowCount: 1, ide_gtede: ideGtede };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar la educación del empleado: ${msg}`);
        }
    }

    async eliminarEducacion(dtoIn: EliminarEducacionDto & HeaderParamsDto) {
        if (!dtoIn.ide_gtede) throw new BadRequestException('El campo ide_gtede es requerido');
        try {
            const updQuery = new UpdateQuery('gth_educacion_empleado', 'ide_gtede');
            updQuery.values.set('activo_gtede', false);
            updQuery.values.set('usuario_actua', dtoIn.login);
            updQuery.values.set('fecha_actua', getCurrentDate());
            updQuery.values.set('hora_actua', getCurrentTime());
            updQuery.where = 'ide_gtede = $1';
            updQuery.addIntParam(1, dtoIn.ide_gtede);
            await this.dataSource.createQuery(updQuery);
            return { message: 'ok', ide_gtede: dtoIn.ide_gtede };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al eliminar la educación del empleado: ${msg}`);
        }
    }

    // ─── Experiencia Laboral ───────────────────────────────────────────────

    async getExperienciaLaboral(dtoIn: GetByEmpleadoDto & HeaderParamsDto) {
        if (!dtoIn.ide_gtemp) throw new BadRequestException('El campo ide_gtemp es requerido');
        try {
            const query = new SelectQuery(`
                SELECT
                    x.ide_gtele,
                    x.ide_gtemp,
                    x.ide_geins,
                    ins.detalle_geins AS empresa,
                    x.detalle_cargo_gtele,
                    x.area_desempenio_gtele,
                    x.nro_subordinados_gtele,
                    x.jefe_inmediato_gtele,
                    x.cargo_jefe_gtele,
                    x.telefono_gtele,
                    x.funciones_desempenio_gtele,
                    x.motivo_salida_gtele,
                    x.fecha_ingreso_gtele,
                    x.fecha_salida_gtele,
                    x.activo_gtele
                FROM gth_experiencia_laboral_emplea x
                LEFT JOIN gen_institucion ins ON ins.ide_geins = x.ide_geins
                WHERE x.ide_gtemp = $1 AND (x.activo_gtele IS NULL OR x.activo_gtele = true)
                ORDER BY x.fecha_salida_gtele DESC NULLS FIRST, x.ide_gtele DESC
            `);
            query.setLazy(false);
            query.addIntParam(1, dtoIn.ide_gtemp);
            return this.dataSource.createSelectQuery(query);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener la experiencia laboral del empleado: ${msg}`);
        }
    }

    async saveExperienciaLaboral(dtoIn: SaveExperienciaLaboralDto & HeaderParamsDto) {
        try {
            if (!dtoIn.data) throw new BadRequestException('El campo data es requerido');
            const { data } = dtoIn;
            const isUpdate = dtoIn.isUpdate && !!data.ide_gtele;

            if (isUpdate) {
                const updQuery: ObjectQueryDto = {
                    operation: 'update',
                    module: 'gth',
                    tableName: 'experiencia_laboral_emplea',
                    primaryKey: 'ide_gtele',
                    object: { ...data, usuario_actua: dtoIn.login, fecha_actua: getCurrentDate(), hora_actua: getCurrentTime() },
                    condition: `ide_gtele = ${data.ide_gtele}`,
                };
                await this.core.save({ ...dtoIn, listQuery: [updQuery], audit: true });
                return { message: 'ok', rowCount: 1, ide_gtele: data.ide_gtele };
            }

            for (const field of REQUIRED_EXPERIENCIA) {
                if (data[field] === undefined || data[field] === null) {
                    throw new BadRequestException(`El campo ${field} es requerido para registrar experiencia laboral`);
                }
            }

            const ideGtele = await this.dataSource.getSeqTable('gth_experiencia_laboral_emplea', 'ide_gtele', 1, dtoIn.login);
            const insQuery: ObjectQueryDto = {
                operation: 'insert',
                module: 'gth',
                tableName: 'experiencia_laboral_emplea',
                primaryKey: 'ide_gtele',
                object: {
                    activo_gtele: true,
                    ...data,
                    ide_gtele: ideGtele,
                    usuario_ingre: dtoIn.login,
                    fecha_ingre: getCurrentDate(),
                    hora_ingre: getCurrentTime(),
                },
            };
            await this.core.save({ ...dtoIn, listQuery: [insQuery], audit: true });
            return { message: 'ok', rowCount: 1, ide_gtele: ideGtele };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar la experiencia laboral del empleado: ${msg}`);
        }
    }

    async eliminarExperienciaLaboral(dtoIn: EliminarExperienciaLaboralDto & HeaderParamsDto) {
        if (!dtoIn.ide_gtele) throw new BadRequestException('El campo ide_gtele es requerido');
        try {
            const updQuery = new UpdateQuery('gth_experiencia_laboral_emplea', 'ide_gtele');
            updQuery.values.set('activo_gtele', false);
            updQuery.values.set('usuario_actua', dtoIn.login);
            updQuery.values.set('fecha_actua', getCurrentDate());
            updQuery.values.set('hora_actua', getCurrentTime());
            updQuery.where = 'ide_gtele = $1';
            updQuery.addIntParam(1, dtoIn.ide_gtele);
            await this.dataSource.createQuery(updQuery);
            return { message: 'ok', ide_gtele: dtoIn.ide_gtele };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al eliminar la experiencia laboral del empleado: ${msg}`);
        }
    }

    // ─── Cuenta Bancaria ─────────────────────────────────────────────────────

    async getCuentaBancaria(dtoIn: GetByEmpleadoDto & HeaderParamsDto) {
        if (!dtoIn.ide_gtemp) throw new BadRequestException('El campo ide_gtemp es requerido');
        try {
            const query = new SelectQuery(`
                SELECT
                    c.ide_gtcbe,
                    c.ide_gtemp,
                    c.ide_geins,
                    ins.detalle_geins AS institucion,
                    c.ide_gttcb,
                    tcb.detalle_gttcb AS tipo_cuenta,
                    c.numero_cuenta_gtcbe,
                    c.saldo_promedio_gtcbe,
                    c.individual_conjunta_gtcbe,
                    c.acreditacion_gtcbe,
                    c.activo_gtcbe
                FROM gth_cuenta_bancaria_empleado c
                LEFT JOIN gen_institucion ins ON ins.ide_geins = c.ide_geins
                LEFT JOIN gth_tipo_cuenta_bancaria tcb ON tcb.ide_gttcb = c.ide_gttcb
                WHERE c.ide_gtemp = $1 AND (c.activo_gtcbe IS NULL OR c.activo_gtcbe = true)
                ORDER BY c.acreditacion_gtcbe DESC NULLS LAST, c.ide_gtcbe DESC
            `);
            query.setLazy(false);
            query.addIntParam(1, dtoIn.ide_gtemp);
            return this.dataSource.createSelectQuery(query);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener la cuenta bancaria del empleado: ${msg}`);
        }
    }

    async saveCuentaBancaria(dtoIn: SaveCuentaBancariaDto & HeaderParamsDto) {
        try {
            if (!dtoIn.data) throw new BadRequestException('El campo data es requerido');
            const { data } = dtoIn;
            const isUpdate = dtoIn.isUpdate && !!data.ide_gtcbe;

            if (isUpdate) {
                const updQuery: ObjectQueryDto = {
                    operation: 'update',
                    module: 'gth',
                    tableName: 'cuenta_bancaria_empleado',
                    primaryKey: 'ide_gtcbe',
                    object: { ...data, usuario_actua: dtoIn.login, fecha_actua: getCurrentDate(), hora_actua: getCurrentTime() },
                    condition: `ide_gtcbe = ${data.ide_gtcbe}`,
                };
                await this.core.save({ ...dtoIn, listQuery: [updQuery], audit: true });
                return { message: 'ok', rowCount: 1, ide_gtcbe: data.ide_gtcbe };
            }

            for (const field of REQUIRED_CUENTA_BANCARIA) {
                if (data[field] === undefined || data[field] === null) {
                    throw new BadRequestException(`El campo ${field} es requerido para registrar la cuenta bancaria`);
                }
            }

            const ideGtcbe = await this.dataSource.getSeqTable('gth_cuenta_bancaria_empleado', 'ide_gtcbe', 1, dtoIn.login);
            const insQuery: ObjectQueryDto = {
                operation: 'insert',
                module: 'gth',
                tableName: 'cuenta_bancaria_empleado',
                primaryKey: 'ide_gtcbe',
                object: {
                    activo_gtcbe: true,
                    individual_conjunta_gtcbe: 1,
                    acreditacion_gtcbe: false,
                    ...data,
                    ide_gtcbe: ideGtcbe,
                    usuario_ingre: dtoIn.login,
                    fecha_ingre: getCurrentDate(),
                    hora_ingre: getCurrentTime(),
                },
            };
            await this.core.save({ ...dtoIn, listQuery: [insQuery], audit: true });
            return { message: 'ok', rowCount: 1, ide_gtcbe: ideGtcbe };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar la cuenta bancaria del empleado: ${msg}`);
        }
    }

    async eliminarCuentaBancaria(dtoIn: EliminarCuentaBancariaDto & HeaderParamsDto) {
        if (!dtoIn.ide_gtcbe) throw new BadRequestException('El campo ide_gtcbe es requerido');
        try {
            const updQuery = new UpdateQuery('gth_cuenta_bancaria_empleado', 'ide_gtcbe');
            updQuery.values.set('activo_gtcbe', false);
            updQuery.values.set('usuario_actua', dtoIn.login);
            updQuery.values.set('fecha_actua', getCurrentDate());
            updQuery.values.set('hora_actua', getCurrentTime());
            updQuery.where = 'ide_gtcbe = $1';
            updQuery.addIntParam(1, dtoIn.ide_gtcbe);
            await this.dataSource.createQuery(updQuery);
            return { message: 'ok', ide_gtcbe: dtoIn.ide_gtcbe };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al eliminar la cuenta bancaria del empleado: ${msg}`);
        }
    }
}
