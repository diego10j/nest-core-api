import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { getCurrentDate } from 'src/util/helpers/date-util';

import { GetSolicitudesByEmpleadoDto, SaveSolicitudMensualizacionDto } from './dto/mensualizacion.dto';

@Injectable()
export class MensualizacionService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) { }

    /**
     * Modalidad vigente (mensualizado/acumulado) por rubro para un empleado, vía sus
     * asignaciones de puesto/salario (gen_empleados_departamento_par).
     */
    async getSolicitudesByEmpleado(dtoIn: GetSolicitudesByEmpleadoDto & HeaderParamsDto) {
        if (!dtoIn.ide_gtemp) throw new BadRequestException('El campo ide_gtemp es requerido');
        try {
            const query = new SelectQuery(`
                SELECT
                    s.ide_nrsom,
                    s.ide_geedp,
                    s.ide_nrrub,
                    rub.detalle_nrrub AS rubro,
                    s.mensualizado_nrsom,
                    s.fecha_solicitud_nrsom,
                    s.activo_nrsom
                FROM nrh_solicitud_mensualizacion s
                INNER JOIN gen_empleados_departamento_par ged ON ged.ide_geedp = s.ide_geedp
                INNER JOIN nrh_rubro rub ON rub.ide_nrrub = s.ide_nrrub
                WHERE ged.ide_gtemp = $1 AND s.activo_nrsom = true
                ORDER BY rub.detalle_nrrub
            `);
            query.setLazy(false);
            query.addIntParam(1, dtoIn.ide_gtemp);
            return this.dataSource.createSelectQuery(query);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener solicitudes de mensualización: ${msg}`);
        }
    }

    /**
     * Crea o reemplaza (desactivando la anterior) la modalidad para un rubro+empleado.
     */
    async save(dtoIn: SaveSolicitudMensualizacionDto & HeaderParamsDto) {
        try {
            // El helper de auditoría de core.save necesita el valor de la primary key
            // presente en `object` (no solo en `condition`) para poder registrar el
            // cambio — por eso primero se busca cuál es la solicitud activa a
            // desactivar, en vez de desactivar "a ciegas" por (geedp, rubro).
            const activaQuery = new SelectQuery(`
                SELECT ide_nrsom FROM nrh_solicitud_mensualizacion
                WHERE ide_geedp = $1 AND ide_nrrub = $2 AND activo_nrsom = true
                LIMIT 1
            `);
            activaQuery.setLazy(false);
            activaQuery.addIntParam(1, dtoIn.ide_geedp);
            activaQuery.addIntParam(2, dtoIn.ide_nrrub);
            const activaRows = await this.dataSource.createSelectQuery(activaQuery);
            const ideNrsomActiva = (activaRows?.[0] as { ide_nrsom: number } | undefined)?.ide_nrsom;

            const listQuery: ObjectQueryDto[] = [];
            if (ideNrsomActiva) {
                listQuery.push({
                    operation: 'update',
                    module: 'nrh',
                    tableName: 'solicitud_mensualizacion',
                    primaryKey: 'ide_nrsom',
                    object: { ide_nrsom: ideNrsomActiva, activo_nrsom: false },
                    condition: `ide_nrsom = ${ideNrsomActiva}`,
                });
            }

            const ideNrsom = await this.dataSource.getSeqTable('nrh_solicitud_mensualizacion', 'ide_nrsom', 1, dtoIn.login);
            const crear: ObjectQueryDto = {
                operation: 'insert',
                module: 'nrh',
                tableName: 'solicitud_mensualizacion',
                primaryKey: 'ide_nrsom',
                object: {
                    ide_nrsom: ideNrsom,
                    ide_geedp: dtoIn.ide_geedp,
                    ide_nrrub: dtoIn.ide_nrrub,
                    mensualizado_nrsom: dtoIn.mensualizado_nrsom,
                    fecha_solicitud_nrsom: getCurrentDate(),
                    ide_usua_aprobador: dtoIn.ideUsua,
                    fecha_aprobacion_nrsom: getCurrentDate(),
                    activo_nrsom: true,
                    usuario_ingre: dtoIn.login,
                    fecha_ingre: getCurrentDate(),
                },
            };
            listQuery.push(crear);

            await this.core.save({ ...dtoIn, listQuery, audit: true });
            return { message: 'ok', ide_nrsom: ideNrsom };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar la solicitud de mensualización: ${msg}`);
        }
    }
}
