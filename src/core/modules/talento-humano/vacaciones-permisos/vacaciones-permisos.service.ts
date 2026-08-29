import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { getCurrentDate, getCurrentTime } from 'src/util/helpers/date-util';

import {
    AnularPermisoDto,
    CrearPermisoDto,
    GetPermisosDto,
    GetSaldoVacacionesDto,
    RegistrarMovimientoVacacionDto,
} from './dto/vacaciones-permisos.dto';

@Injectable()
export class VacacionesPermisosService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) { }

    /**
     * Retorna (creando si no existe) la cabecera de vacaciones del empleado y su
     * saldo disponible: acumulado + adicional - descontado - solicitado.
     */
    async getSaldoVacaciones(dtoIn: GetSaldoVacacionesDto & HeaderParamsDto) {
        if (!dtoIn.ide_gtemp) throw new BadRequestException('El campo ide_gtemp es requerido');
        try {
            const ideAsvac = await this.getOrCreateVacacionCabecera(dtoIn.ide_gtemp, dtoIn);

            const query = new SelectQuery(`
                SELECT
                    COALESCE(SUM(dia_acumulado_asdev), 0)  AS acumulado,
                    COALESCE(SUM(dia_adicional_asdev), 0)  AS adicional,
                    COALESCE(SUM(dia_descontado_asdev), 0) AS descontado,
                    COALESCE(SUM(dia_solicitado_asdev), 0) AS solicitado
                FROM asi_detalle_vacacion
                WHERE ide_asvac = $1 AND (anulado_asdev IS NULL OR anulado_asdev = false)
            `);
            query.setLazy(false);
            query.addIntParam(1, ideAsvac);
            const rows = await this.dataSource.createSelectQuery(query);
            const r = rows?.[0] ?? { acumulado: 0, adicional: 0, descontado: 0, solicitado: 0 };
            const disponible =
                Number(r.acumulado) + Number(r.adicional) - Number(r.descontado) - Number(r.solicitado);

            return { ide_asvac: ideAsvac, ...r, disponible };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener el saldo de vacaciones: ${msg}`);
        }
    }

    async getMovimientos(dtoIn: GetSaldoVacacionesDto & HeaderParamsDto) {
        if (!dtoIn.ide_gtemp) throw new BadRequestException('El campo ide_gtemp es requerido');
        try {
            const ideAsvac = await this.getOrCreateVacacionCabecera(dtoIn.ide_gtemp, dtoIn);
            const query = new SelectQuery(`
                SELECT ide_asdev, fecha_novedad_asdev, dia_acumulado_asdev, dia_adicional_asdev,
                       dia_descontado_asdev, dia_solicitado_asdev, observacion_asdev, anulado_asdev, ide_aspvh
                FROM asi_detalle_vacacion
                WHERE ide_asvac = $1
                ORDER BY fecha_novedad_asdev DESC, ide_asdev DESC
            `);
            query.setLazy(false);
            query.addIntParam(1, ideAsvac);
            return this.dataSource.createSelectQuery(query);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener movimientos de vacaciones: ${msg}`);
        }
    }

    /**
     * Movimiento manual de vacaciones (ej. acumulación anual de días, o un ajuste).
     */
    async registrarMovimiento(dtoIn: RegistrarMovimientoVacacionDto & HeaderParamsDto) {
        try {
            const ideAsvac = await this.getOrCreateVacacionCabecera(dtoIn.ide_gtemp, dtoIn);
            const ideAsdev = await this.dataSource.getSeqTable('asi_detalle_vacacion', 'ide_asdev', 1, dtoIn.login);

            const campoPorTipo: Record<string, string> = {
                acumulado: 'dia_acumulado_asdev',
                adicional: 'dia_adicional_asdev',
                descontado: 'dia_descontado_asdev',
            };

            const insQuery: ObjectQueryDto = {
                operation: 'insert',
                module: 'asi',
                tableName: 'detalle_vacacion',
                primaryKey: 'ide_asdev',
                object: {
                    ide_asdev: ideAsdev,
                    ide_asvac: ideAsvac,
                    fecha_novedad_asdev: getCurrentDate(),
                    [campoPorTipo[dtoIn.tipo]]: dtoIn.dias,
                    observacion_asdev: dtoIn.observacion ?? null,
                    activo_asdev: true,
                    usuario_ingre: dtoIn.login,
                    fecha_ingre: getCurrentDate(),
                    hora_ingre: getCurrentTime(),
                },
            };
            await this.core.save({ ...dtoIn, listQuery: [insQuery], audit: true });
            return { message: 'ok', ide_asdev: ideAsdev };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al registrar el movimiento de vacaciones: ${msg}`);
        }
    }

    // ─── Permisos (por horas / con cargo a vacaciones) ────────────────────

    async getPermisos(dtoIn: GetPermisosDto & HeaderParamsDto) {
        try {
            const conditions = ['per.ide_empr = $1'];
            const params: unknown[] = [dtoIn.ideEmpr];
            let pIdx = 1;
            if (dtoIn.ide_gtemp) {
                conditions.push(`p.ide_gtemp = $${++pIdx}`);
                params.push(dtoIn.ide_gtemp);
            }
            if (dtoIn.fechaInicio && dtoIn.fechaFin) {
                conditions.push(`p.fecha_desde_aspvh BETWEEN $${++pIdx} AND $${++pIdx}`);
                params.push(dtoIn.fechaInicio, dtoIn.fechaFin);
            }
            const query = new SelectQuery(
                `
                SELECT
                    p.ide_aspvh,
                    p.ide_gtemp,
                    emp.primer_nombre_gtemp || ' ' || emp.apellido_paterno_gtemp AS empleado,
                    p.tipo_aspvh,
                    p.fecha_solicitud_aspvh,
                    p.fecha_desde_aspvh,
                    p.fecha_hasta_aspvh,
                    p.nro_dias_aspvh,
                    p.nro_horas_aspvh,
                    p.detalle_aspvh,
                    p.activo_aspvh,
                    p.razon_anula_aspvh,
                    p.fecha_anula_aspvh
                FROM asi_permisos_vacacion_hext p
                INNER JOIN gth_empleado emp ON emp.ide_gtemp = p.ide_gtemp
                INNER JOIN gen_persona per ON per.ide_geper = emp.ide_geper
                WHERE ${conditions.join(' AND ')}
                ORDER BY p.fecha_desde_aspvh DESC
                `,
                dtoIn,
            );
            params.forEach((v, i) => query.addParam(i + 1, v));
            return this.dataSource.createQuery(query, 'asi_permisos_vacacion_hext');
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener permisos: ${msg}`);
        }
    }

    /**
     * Crea un permiso. Si es "con cargo a vacaciones" (tipo_aspvh=2), genera además
     * el movimiento de descuento en asi_detalle_vacacion enlazado por ide_aspvh.
     */
    async crearPermiso(dtoIn: CrearPermisoDto & HeaderParamsDto) {
        try {
            const ideAspvh = await this.dataSource.getSeqTable('asi_permisos_vacacion_hext', 'ide_aspvh', 1, dtoIn.login);

            const listQuery: ObjectQueryDto[] = [
                {
                    operation: 'insert',
                    module: 'asi',
                    tableName: 'permisos_vacacion_hext',
                    primaryKey: 'ide_aspvh',
                    object: {
                        ide_aspvh: ideAspvh,
                        ide_gtemp: dtoIn.ide_gtemp,
                        ide_sucu: dtoIn.ideSucu,
                        tipo_aspvh: dtoIn.tipo_aspvh,
                        fecha_solicitud_aspvh: getCurrentDate(),
                        fecha_desde_aspvh: dtoIn.fecha_desde_aspvh,
                        fecha_hasta_aspvh: dtoIn.fecha_hasta_aspvh,
                        nro_dias_aspvh: dtoIn.nro_dias_aspvh ?? null,
                        nro_horas_aspvh: dtoIn.nro_horas_aspvh ?? null,
                        detalle_aspvh: dtoIn.detalle_aspvh ?? null,
                        activo_aspvh: true,
                        usuario_ingre: dtoIn.login,
                        fecha_ingre: getCurrentDate(),
                        hora_ingre: getCurrentTime(),
                    },
                },
            ];

            if (dtoIn.tipo_aspvh === 2) {
                if (!dtoIn.nro_dias_aspvh) {
                    throw new BadRequestException('nro_dias_aspvh es requerido para un permiso con cargo a vacaciones');
                }
                const ideAsvac = await this.getOrCreateVacacionCabecera(dtoIn.ide_gtemp, dtoIn);
                const ideAsdev = await this.dataSource.getSeqTable('asi_detalle_vacacion', 'ide_asdev', 1, dtoIn.login);
                listQuery.push({
                    operation: 'insert',
                    module: 'asi',
                    tableName: 'detalle_vacacion',
                    primaryKey: 'ide_asdev',
                    object: {
                        ide_asdev: ideAsdev,
                        ide_asvac: ideAsvac,
                        ide_aspvh: ideAspvh,
                        fecha_novedad_asdev: getCurrentDate(),
                        dia_solicitado_asdev: dtoIn.nro_dias_aspvh,
                        observacion_asdev: `Permiso con cargo a vacaciones (${dtoIn.fecha_desde_aspvh} a ${dtoIn.fecha_hasta_aspvh})`,
                        activo_asdev: true,
                        usuario_ingre: dtoIn.login,
                        fecha_ingre: getCurrentDate(),
                        hora_ingre: getCurrentTime(),
                    },
                });
            }

            await this.core.save({ ...dtoIn, listQuery, audit: true });
            return { message: 'ok', ide_aspvh: ideAspvh };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al crear el permiso: ${msg}`);
        }
    }

    /**
     * Anula un permiso y reversa (anula) el movimiento de vacaciones asociado, si lo hay.
     */
    async anularPermiso(dtoIn: AnularPermisoDto & HeaderParamsDto) {
        if (!dtoIn.ide_aspvh) throw new BadRequestException('El campo ide_aspvh es requerido');
        try {
            const updPermiso = new UpdateQuery('asi_permisos_vacacion_hext', 'ide_aspvh');
            updPermiso.values.set('activo_aspvh', false);
            updPermiso.values.set('razon_anula_aspvh', dtoIn.razon_anula_aspvh ?? null);
            updPermiso.values.set('documento_anula_aspvh', dtoIn.login);
            updPermiso.values.set('fecha_anula_aspvh', getCurrentDate());
            updPermiso.where = 'ide_aspvh = $1';
            updPermiso.addIntParam(1, dtoIn.ide_aspvh);
            await this.dataSource.createQuery(updPermiso);

            const updMovimiento = new UpdateQuery('asi_detalle_vacacion', 'ide_asdev');
            updMovimiento.values.set('anulado_asdev', true);
            updMovimiento.where = 'ide_aspvh = $1';
            updMovimiento.addIntParam(1, dtoIn.ide_aspvh);
            await this.dataSource.createQuery(updMovimiento);

            return { message: 'ok', ide_aspvh: dtoIn.ide_aspvh };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al anular el permiso: ${msg}`);
        }
    }

    private async getOrCreateVacacionCabecera(ideGtemp: number, dtoIn: HeaderParamsDto): Promise<number> {
        const query = new SelectQuery(`
            SELECT ide_asvac FROM asi_vacacion WHERE ide_gtemp = $1 AND activo_asvac = true LIMIT 1
        `);
        query.setLazy(false);
        query.addIntParam(1, ideGtemp);
        const rows = await this.dataSource.createSelectQuery(query);
        if (rows && rows.length > 0) return rows[0].ide_asvac as number;

        const ideAsvac = await this.dataSource.getSeqTable('asi_vacacion', 'ide_asvac', 1, dtoIn.login);
        const insQuery: ObjectQueryDto = {
            operation: 'insert',
            module: 'asi',
            tableName: 'vacacion',
            primaryKey: 'ide_asvac',
            object: {
                ide_asvac: ideAsvac,
                ide_gtemp: ideGtemp,
                fecha_ingreso_asvac: getCurrentDate(),
                activo_asvac: true,
                usuario_ingre: dtoIn.login,
                fecha_ingre: getCurrentDate(),
                hora_ingre: getCurrentTime(),
            },
        };
        await this.core.save({ ...dtoIn, listQuery: [insQuery], audit: false });
        return ideAsvac;
    }
}
