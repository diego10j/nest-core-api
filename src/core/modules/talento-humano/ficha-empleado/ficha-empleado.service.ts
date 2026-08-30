import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { getCurrentDate, getCurrentTime } from 'src/util/helpers/date-util';

import {
    EliminarEducacionDto,
    EliminarExperienciaLaboralDto,
    GetByEmpleadoDto,
    SaveEducacionDto,
    SaveExperienciaLaboralDto,
} from './dto/ficha-empleado.dto';

const REQUIRED_EDUCACION = ['ide_gtemp', 'ide_gtted', 'ide_gtttp'];
const REQUIRED_EXPERIENCIA = ['ide_gtemp', 'ide_geins', 'detalle_cargo_gtele'];

/**
 * Pestañas complementarias de la ficha del empleado (Educación/Título y Experiencia
 * Laboral) — información que en el sistema legado (sigafi) vive en el módulo
 * "Gestión de Talento Humano" (sis_modulo id 13, distinto de "Nómina" id 6), pantalla
 * pre_empleado.java, tabs EDUCACION y EXPERIENCIA LABORAL. Aquí se replica solo el
 * modelo de datos probado (gth_educacion_empleado / gth_experiencia_laboral_emplea),
 * no la UI legada.
 */
@Injectable()
export class FichaEmpleadoService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) { }

    // ─── Catálogos ─────────────────────────────────────────────────────────

    async getCatalogos(dtoIn: HeaderParamsDto) {
        const [tiposEducacion, tiposEspecialidad, titulosProfesionales, aniosAprobados, instituciones] =
            await Promise.all([
                this.core.getListDataValues({ ...dtoIn, module: 'gth', tableName: 'tipo_educacion', primaryKey: 'ide_gtted', columnLabel: 'detalle_gtted' }),
                this.core.getListDataValues({ ...dtoIn, module: 'gth', tableName: 'tipo_especialidad', primaryKey: 'ide_gttes', columnLabel: 'detalle_gttes' }),
                this.core.getListDataValues({ ...dtoIn, module: 'gth', tableName: 'tipo_titulo_profesional', primaryKey: 'ide_gtttp', columnLabel: 'detalle_gtttp' }),
                this.core.getListDataValues({ ...dtoIn, module: 'gth', tableName: 'anio_aprobado', primaryKey: 'ide_gtana', columnLabel: 'detalle_gtana' }),
                this.core.getListDataValues({ ...dtoIn, module: 'gen', tableName: 'institucion', primaryKey: 'ide_geins', columnLabel: 'detalle_geins', condition: 'activo_geins = true' }),
            ]);
        return { tiposEducacion, tiposEspecialidad, titulosProfesionales, aniosAprobados, instituciones };
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
}
