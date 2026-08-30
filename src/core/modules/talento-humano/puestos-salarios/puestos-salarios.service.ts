import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { getCurrentDate, getCurrentTime } from 'src/util/helpers/date-util';

import { GetPuestosSalariosByEmpleadoDto, SavePuestoSalarioDto } from './dto/puestos-salarios.dto';

// Combo "genérico" sembrado por seed-catalogos-puesto-salario.sql para las columnas NOT
// NULL heredadas de sector público que gen_empleados_departamento_par exige pero DIQUIMEC
// no necesita conceptualmente (partida presupuestaria/grupo de cargo/área). ide_gedep NO
// está acá: viene del form (Ventas=1 / Administrativo=2) porque sí es real para DIQUIMEC —
// determina la provisión de décimos/fondos de reserva (ver generarProvisionDecimosFondos).
const GENERICO_GEPGC = { ideGepgc: 1, ideGegro: 1, ideGecaf: 1, ideGeare: 1 };
const GENERICO_GTTEM = 1; // CODIGO DE TRABAJO (privado — correcto para DIQUIMEC)
const GENERICO_GTTCO = 2; // CONTRATO INDEFINIDO
const GENERICO_GTTSI = 1; // Ninguno

@Injectable()
export class PuestosSalariosService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) { }

    /**
     * Historial de asignaciones puesto+salario de un empleado (gen_empleados_departamento_par),
     * la más reciente primero. La activa/vigente es la de mayor ide_geedp con activo_geedp = true.
     */
    async getPuestosSalariosByEmpleado(dtoIn: GetPuestosSalariosByEmpleadoDto & HeaderParamsDto) {
        if (!dtoIn.ide_gtemp) {
            throw new BadRequestException('El campo ide_gtemp es requerido');
        }
        try {
            const query = new SelectQuery(`
                SELECT
                    d.ide_geedp,
                    d.ide_gtemp,
                    d.ide_gtcar,
                    c.detalle_gtcar AS cargo,
                    d.rmu_geedp,
                    d.fecha_geedp,
                    d.fecha_finctr_geedp,
                    d.acumula_fondos_geedp,
                    d.control_asistencia_geedp,
                    d.activo_geedp
                FROM gen_empleados_departamento_par d
                LEFT JOIN gth_cargo c ON c.ide_gtcar = d.ide_gtcar
                WHERE d.ide_gtemp = $1
                ORDER BY d.ide_geedp DESC
            `);
            query.setLazy(false);
            query.addIntParam(1, dtoIn.ide_gtemp);
            return this.dataSource.createSelectQuery(query);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener puestos/salarios: ${msg}`);
        }
    }

    /**
     * Crea o actualiza una asignación de puesto+salario. Solo válido para una sola fila
     * de gen_empleados_departamento_par (no hace merge de historial: cerrar una asignación
     * vieja y abrir una nueva son dos llamadas separadas, igual que el resto del ERP).
     */
    async save(dtoIn: SavePuestoSalarioDto & HeaderParamsDto) {
        try {
            const isUpdate = dtoIn.ideGeedp != null;

            if (isUpdate) {
                const ideGeedp = dtoIn.ideGeedp as number;
                const updQuery: ObjectQueryDto = {
                    operation: 'update',
                    module: 'gen',
                    tableName: 'empleados_departamento_par',
                    primaryKey: 'ide_geedp',
                    object: {
                        ide_geedp: ideGeedp,
                        ide_gtcar: dtoIn.ideGtcar,
                        rmu_geedp: dtoIn.rmuGeedp,
                        fecha_geedp: dtoIn.fechaGeedp,
                        ide_gedep: dtoIn.ideGedep,
                        usuario_actua: dtoIn.login,
                        fecha_actua: getCurrentDate(),
                        hora_actua: getCurrentTime(),
                    },
                    condition: `ide_geedp = ${ideGeedp}`,
                };
                await this.core.save({ ...dtoIn, listQuery: [updQuery], audit: true });
                return { message: 'ok', ideGeedp };
            }

            const ideGeedp = await this.dataSource.getSeqTable(
                'gen_empleados_departamento_par',
                'ide_geedp',
                1,
                dtoIn.login,
            );

            const insQuery: ObjectQueryDto = {
                operation: 'insert',
                module: 'gen',
                tableName: 'empleados_departamento_par',
                primaryKey: 'ide_geedp',
                object: {
                    ide_geedp: ideGeedp,
                    ide_gtemp: dtoIn.ideGtemp,
                    ide_gtcar: dtoIn.ideGtcar,
                    rmu_geedp: dtoIn.rmuGeedp,
                    fecha_geedp: dtoIn.fechaGeedp,
                    ide_gedep: dtoIn.ideGedep,
                    ide_sucu: dtoIn.ideSucu,
                    activo_geedp: true,
                    // Combo "genérico" sembrado en gen_partida_grupo_cargo — ver comentario en la
                    // cabecera del archivo y seed-catalogos-puesto-salario.sql.
                    ide_gepgc: GENERICO_GEPGC.ideGepgc,
                    ide_gegro: GENERICO_GEPGC.ideGegro,
                    ide_gecaf: GENERICO_GEPGC.ideGecaf,
                    ide_geare: GENERICO_GEPGC.ideGeare,
                    ide_gttem: GENERICO_GTTEM,
                    ide_gttco: GENERICO_GTTCO,
                    ide_gttsi: GENERICO_GTTSI,
                    usuario_ingre: dtoIn.login,
                    fecha_ingre: getCurrentDate(),
                    hora_ingre: getCurrentTime(),
                },
            };
            await this.core.save({ ...dtoIn, listQuery: [insQuery], audit: true });

            return { message: 'ok', ideGeedp };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar puesto/salario: ${msg}`);
        }
    }
}
