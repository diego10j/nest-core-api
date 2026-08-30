import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { getCurrentDate, getCurrentTime } from 'src/util/helpers/date-util';

import { GetEmpleadoByIdDto, GetEmpleadosDto, SaveEmpleadoDto } from './dto/empleados.dto';

@Injectable()
export class EmpleadosService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) { }

    /**
     * Lista empleados (gth_empleado + contacto de gen_persona + cargo vigente).
     * Trae todo de una vez (SelectQuery con lazy=false, sin paginación server-side):
     * el grid de empleados pagina y busca en el cliente.
     */
    async getEmpleados(dtoIn: GetEmpleadosDto & HeaderParamsDto) {
        try {
            const conditions: string[] = ['p.ide_empr = $1'];
            const params: unknown[] = [dtoIn.ideEmpr];
            let pIdx = 1;

            if (dtoIn.activo) {
                pIdx++;
                conditions.push(`e.activo_gtemp = $${pIdx}`);
                params.push(dtoIn.activo === 'true');
            }

            const query = new SelectQuery(`
                SELECT
                    e.ide_gtemp,
                    e.ide_geper,
                    p.uuid,
                    e.foto_gtemp,
                    p.correo_geper,
                    p.telefono_geper,
                    p.movil_geper,
                    e.primer_nombre_gtemp,
                    e.segundo_nombre_gtemp,
                    e.apellido_paterno_gtemp,
                    e.apellido_materno_gtemp,
                    e.documento_identidad_gtemp,
                    e.fecha_nacimiento_gtemp,
                    e.fecha_ingreso_gtemp,
                    e.tarjeta_marcacion_gtemp,
                    e.cargo_publico_gtemp,
                    e.acumula_decimo_gtemp,
                    e.activo_gtemp,
                    puesto.cargo
                FROM gth_empleado e
                INNER JOIN gen_persona p ON p.ide_geper = e.ide_geper
                LEFT JOIN LATERAL (
                    SELECT c.detalle_gtcar AS cargo
                    FROM gen_empleados_departamento_par ged
                    LEFT JOIN gth_cargo c ON c.ide_gtcar = ged.ide_gtcar
                    WHERE ged.ide_gtemp = e.ide_gtemp AND ged.activo_geedp = true
                    ORDER BY ged.ide_geedp DESC
                    LIMIT 1
                ) puesto ON true
                WHERE ${conditions.join(' AND ')}
                ORDER BY e.apellido_paterno_gtemp, e.primer_nombre_gtemp
            `);
            query.setLazy(false);
            params.forEach((val, i) => query.addParam(i + 1, val));
            return this.dataSource.createSelectQuery(query);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener empleados: ${msg}`);
        }
    }

    /**
     * Retorna la ficha completa de un empleado (gth_empleado + gen_persona + catálogos).
     */
    async getEmpleadoById(dtoIn: GetEmpleadoByIdDto & HeaderParamsDto) {
        if (!dtoIn.ide_gtemp) {
            throw new BadRequestException('El campo ide_gtemp es requerido');
        }
        try {
            const query = new SelectQuery(`
                SELECT
                    e.*,
                    p.nom_geper,
                    p.identificac_geper,
                    p.correo_geper,
                    p.direccion_geper,
                    p.telefono_geper,
                    p.movil_geper,
                    gen.detalle_gtgen  AS genero,
                    tdi.detalle_gttdi  AS tipo_documento_identidad,
                    esc.detalle_gtesc  AS estado_civil,
                    tis.detalle_gttis  AS tipo_sangre,
                    nac.detalle_gtnac  AS nacionalidad,
                    prov.nombre_geprov AS provincia_nacimiento,
                    cant.nombre_gecant AS canton_nacimiento
                FROM gth_empleado e
                INNER JOIN gen_persona p ON p.ide_geper = e.ide_geper
                LEFT JOIN gth_genero gen ON gen.ide_gtgen = e.ide_gtgen
                LEFT JOIN gth_tipo_documento_identidad tdi ON tdi.ide_gttdi = e.ide_gttdi
                LEFT JOIN gth_estado_civil esc ON esc.ide_gtesc = e.ide_gtesc
                LEFT JOIN gth_tipo_sangre tis ON tis.ide_gttis = e.ide_gttis
                LEFT JOIN gth_nacionalidad nac ON nac.ide_gtnac = e.ide_gtnac
                LEFT JOIN gen_provincia prov ON prov.ide_geprov = e.ide_geprov
                LEFT JOIN gen_canton cant ON cant.ide_gecant = e.ide_gecant
                WHERE e.ide_gtemp = $1
                  AND p.ide_empr = $2
            `);
            query.setLazy(false);
            query.addIntParam(1, dtoIn.ide_gtemp);
            query.addIntParam(2, dtoIn.ideEmpr);
            const rows = await this.dataSource.createSelectQuery(query);
            return rows && rows.length > 0 ? rows[0] : null;
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener el empleado: ${msg}`);
        }
    }

    /**
     * Crea o actualiza un empleado: gen_persona (identidad/contacto, compartida con
     * clientes/proveedores) + gth_empleado (ficha RRHH), enlazadas por ide_geper.
     */
    async save(dtoIn: SaveEmpleadoDto & HeaderParamsDto) {
        try {
            const isUpdate = dtoIn.ideGtemp != null;

            const empleadoObject: Record<string, unknown> = {
                ide_geper: dtoIn.ideGeper,
                primer_nombre_gtemp: dtoIn.primerNombreGtemp,
                segundo_nombre_gtemp: dtoIn.segundoNombreGtemp ?? null,
                apellido_paterno_gtemp: dtoIn.apellidoPaternoGtemp,
                apellido_materno_gtemp: dtoIn.apellidoMaternoGtemp ?? null,
                documento_identidad_gtemp: dtoIn.documentoIdentidadGtemp,
                fecha_nacimiento_gtemp: dtoIn.fechaNacimientoGtemp,
                fecha_ingreso_gtemp: dtoIn.fechaIngresoGtemp ?? null,
                // fecha_ingreso_grupo_gtemp es NOT NULL heredado de sector público ("grupo
                // ocupacional") — no aplica conceptualmente a DIQUIMEC y no se pide en el
                // formulario, se copia de fecha_ingreso_gtemp.
                fecha_ingreso_grupo_gtemp: dtoIn.fechaIngresoGtemp ?? getCurrentDate(),
                tarjeta_marcacion_gtemp: dtoIn.tarjetaMarcacionGtemp ?? null,
                ide_gtgen: dtoIn.ideGtgen,
                ide_gttdi: dtoIn.ideGttdi,
                ide_gtesc: dtoIn.ideGtesc,
                ide_gttis: dtoIn.ideGttis,
                ide_gtnac: dtoIn.ideGtnac,
                ide_geprov: dtoIn.ideGeprov,
                ide_gecant: dtoIn.ideGecant ?? null,
                acumula_decimo_gtemp: dtoIn.acumulaDecimoGtemp ?? false,
                activo_gtemp: dtoIn.activoGtemp ?? true,
                foto_gtemp: dtoIn.fotoGtemp ?? null,
                firma_gtemp: dtoIn.firmaGtemp ?? null,
            };

            const personaObject: Record<string, unknown> = {
                correo_geper: dtoIn.correoGeper ?? null,
                telefono_geper: dtoIn.telefonoGeper ?? null,
                movil_geper: dtoIn.movilGeper ?? null,
                direccion_geper: dtoIn.direccionGeper ?? null,
            };

            if (isUpdate) {
                const ideGtemp = dtoIn.ideGtemp as number;
                const listQuery: ObjectQueryDto[] = [
                    {
                        operation: 'update',
                        module: 'gth',
                        tableName: 'empleado',
                        primaryKey: 'ide_gtemp',
                        object: {
                            ...empleadoObject,
                            ide_gtemp: ideGtemp,
                            usuario_actua: dtoIn.login,
                            fecha_actua: getCurrentDate(),
                            hora_actua: getCurrentTime(),
                        },
                        condition: `ide_gtemp = ${ideGtemp}`,
                    },
                    {
                        operation: 'update',
                        module: 'gen',
                        tableName: 'persona',
                        primaryKey: 'ide_geper',
                        object: {
                            ide_geper: dtoIn.ideGeper,
                            ...personaObject,
                            usuario_actua: dtoIn.login,
                            fecha_actua: getCurrentDate(),
                            hora_actua: getCurrentTime(),
                        },
                        condition: `ide_geper = ${dtoIn.ideGeper}`,
                    },
                ];
                await this.core.save({ ...dtoIn, listQuery, audit: true });
                return { message: 'ok', ideGtemp, ideGeper: dtoIn.ideGeper };
            }

            // Crear: la persona debe elegirse ANTES (SearchPersona en el frontend) —
            // gth_empleado nunca crea una gen_persona nueva, solo se asocia a una que ya
            // existe (validado por class-validator: ideGeper es requerido en el DTO).
            const personaExistente = await this.getPersonaParaAsociar(dtoIn.ideGeper, dtoIn.ideEmpr);
            if (!personaExistente) {
                throw new BadRequestException('La persona seleccionada no existe o no pertenece a esta empresa');
            }
            if (personaExistente.ide_gtemp) {
                throw new BadRequestException('Esta persona ya está registrada como empleado');
            }

            const ideGtemp = await this.dataSource.getSeqTable('gth_empleado', 'ide_gtemp', 1, dtoIn.login);

            const listQuery: ObjectQueryDto[] = [
                {
                    // Nunca se crea gen_persona acá: solo se marca es_empleado_geper=true
                    // sobre la persona ya existente y elegida, más los datos de contacto
                    // que se hayan editado en el formulario (si los hay).
                    operation: 'update',
                    module: 'gen',
                    tableName: 'persona',
                    primaryKey: 'ide_geper',
                    object: {
                        ide_geper: dtoIn.ideGeper,
                        es_empleado_geper: true,
                        ...personaObject,
                        usuario_actua: dtoIn.login,
                        fecha_actua: getCurrentDate(),
                        hora_actua: getCurrentTime(),
                    },
                    condition: `ide_geper = ${dtoIn.ideGeper}`,
                },
                {
                    operation: 'insert',
                    module: 'gth',
                    tableName: 'empleado',
                    primaryKey: 'ide_gtemp',
                    object: {
                        ...empleadoObject,
                        ide_gtemp: ideGtemp,
                        usuario_ingre: dtoIn.login,
                        fecha_ingre: getCurrentDate(),
                        hora_ingre: getCurrentTime(),
                    },
                },
            ];

            await this.core.save({ ...dtoIn, listQuery, audit: true });

            return { message: 'ok', ideGtemp, ideGeper: dtoIn.ideGeper };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar el empleado: ${msg}`);
        }
    }

    /**
     * Verifica que la persona exista en esta empresa y si ya tiene un empleado asociado
     * (gth_empleado.ide_geper es único — ver script-nomina-talento-humano.sql).
     */
    private async getPersonaParaAsociar(
        ideGeper: number,
        ideEmpr: number,
    ): Promise<{ ide_geper: number; ide_gtemp: number | null } | null> {
        const query = new SelectQuery(`
            SELECT p.ide_geper, e.ide_gtemp
            FROM gen_persona p
            LEFT JOIN gth_empleado e ON e.ide_geper = p.ide_geper
            WHERE p.ide_geper = $1 AND p.ide_empr = $2
        `);
        query.setLazy(false);
        query.addIntParam(1, ideGeper);
        query.addIntParam(2, ideEmpr);
        const rows = await this.dataSource.createSelectQuery(query);
        return (rows?.[0] as { ide_geper: number; ide_gtemp: number | null }) ?? null;
    }

    /**
     * Retorna catálogos base para los Select del formulario de ficha de empleado.
     */
    async getCatalogos(dtoIn: HeaderParamsDto) {
        const [generos, tiposDocumento, estadosCiviles, tiposSangre, nacionalidades, cargos] = await Promise.all([
            this.core.getListDataValues({ ...dtoIn, module: 'gth', tableName: 'genero', primaryKey: 'ide_gtgen', columnLabel: 'detalle_gtgen' }),
            this.core.getListDataValues({
                ...dtoIn,
                module: 'gth',
                tableName: 'tipo_documento_identidad',
                primaryKey: 'ide_gttdi',
                columnLabel: 'detalle_gttdi',
                // El empleado solo admite Cédula o Pasaporte (no RUC ni otros tipos del catálogo general).
                condition: `activo_gttdi = true AND (detalle_gttdi ILIKE '%cedula%' OR detalle_gttdi ILIKE '%pasaporte%')`,
            }),
            this.core.getListDataValues({ ...dtoIn, module: 'gth', tableName: 'estado_civil', primaryKey: 'ide_gtesc', columnLabel: 'detalle_gtesc' }),
            this.core.getListDataValues({ ...dtoIn, module: 'gth', tableName: 'tipo_sangre', primaryKey: 'ide_gttis', columnLabel: 'detalle_gttis' }),
            this.core.getListDataValues({ ...dtoIn, module: 'gth', tableName: 'nacionalidad', primaryKey: 'ide_gtnac', columnLabel: 'detalle_gtnac' }),
            this.core.getListDataValues({ ...dtoIn, module: 'gth', tableName: 'cargo', primaryKey: 'ide_gtcar', columnLabel: 'detalle_gtcar', condition: 'activo_gtcar = true' }),
        ]);
        return { generos, tiposDocumento, estadosCiviles, tiposSangre, nacionalidades, cargos };
    }
}
