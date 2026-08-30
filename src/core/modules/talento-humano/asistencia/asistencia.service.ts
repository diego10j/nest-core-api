import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { getCurrentDate } from 'src/util/helpers/date-util';

import { EmpleadosService } from '../empleados/empleados.service';

import { GetMisMarcacionesDto } from './dto/asistencia.dto';

interface MarcacionMesRow {
    fecha_asmar: string;
    h1_asmar: string | null;
    h2_asmar: string | null;
    h3_asmar: string | null;
    h4_asmar: string | null;
}

interface HoraExtraMesRow {
    fecha_nrhec: string;
    horas_detectadas_nrhec: number;
    estado_nrhec: string;
}

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function horaAMinutos(hora: string | null | undefined): number | null {
    if (!hora) return null;
    const m = /^(\d{1,2}):(\d{2})/.exec(hora.trim());
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function minutosAHora(min: number): string {
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

@Injectable()
export class AsistenciaService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly empleadosService: EmpleadosService,
    ) { }

    /**
     * Marcaciones del mes del empleado vinculado al usuario logueado: un registro por
     * día del mes (no solo los días con marcación), señalando días sin marcar (excepto
     * domingos/feriados), horas trabajadas (primera a última marca del día) y horas
     * extra detectadas ese día (con su estado de aprobación) — símil a la vista de
     * empleado del sistema legado.
     */
    async getMisMarcaciones(dtoIn: GetMisMarcacionesDto & HeaderParamsDto) {
        const miEmpleado = await this.empleadosService.getMiEmpleado(dtoIn);
        if (!miEmpleado) {
            throw new BadRequestException(
                'Tu usuario no está vinculado a ningún empleado. Contacta a RRHH para habilitar tu autoservicio.',
            );
        }

        try {
            const fechaInicio = `${dtoIn.anio}-${String(dtoIn.mes).padStart(2, '0')}-01`;
            const diasEnMes = new Date(dtoIn.anio, dtoIn.mes, 0).getDate();
            const fechaFin = `${dtoIn.anio}-${String(dtoIn.mes).padStart(2, '0')}-${String(diasEnMes).padStart(2, '0')}`;

            const tarjeta = miEmpleado.tarjeta_marcacion_gtemp as string | null;

            const marcaciones: MarcacionMesRow[] = tarjeta
                ? ((await this.dataSource.createSelectQuery(
                      (() => {
                          const q = new SelectQuery(`
                            SELECT fecha_asmar::text AS fecha_asmar, h1_asmar, h2_asmar, h3_asmar, h4_asmar
                            FROM asi_marcaciones
                            WHERE cod_empleado_asmar = $1 AND fecha_asmar BETWEEN $2 AND $3
                          `);
                          q.setLazy(false);
                          q.addStringParam(1, tarjeta);
                          q.addStringParam(2, fechaInicio);
                          q.addStringParam(3, fechaFin);
                          return q;
                      })(),
                  )) as MarcacionMesRow[])
                : [];

            const feriadosQuery = new SelectQuery(`
                SELECT fecha_nrfer::text AS fecha_nrfer FROM nrh_feriado
                WHERE activo_nrfer = true AND fecha_nrfer BETWEEN $1 AND $2
            `);
            feriadosQuery.setLazy(false);
            feriadosQuery.addStringParam(1, fechaInicio);
            feriadosQuery.addStringParam(2, fechaFin);
            const feriados = (await this.dataSource.createSelectQuery(feriadosQuery)) as { fecha_nrfer: string }[];
            const feriadosSet = new Set(feriados.map((f) => f.fecha_nrfer));

            let horasExtra: HoraExtraMesRow[] = [];
            if (miEmpleado.ide_geedp) {
                const heQuery = new SelectQuery(`
                    SELECT fecha_nrhec::text AS fecha_nrhec, horas_detectadas_nrhec, estado_nrhec
                    FROM nrh_hora_extra_candidata
                    WHERE ide_geedp = $1 AND fecha_nrhec BETWEEN $2 AND $3
                `);
                heQuery.setLazy(false);
                heQuery.addIntParam(1, miEmpleado.ide_geedp as number);
                heQuery.addStringParam(2, fechaInicio);
                heQuery.addStringParam(3, fechaFin);
                horasExtra = (await this.dataSource.createSelectQuery(heQuery)) as HoraExtraMesRow[];
            }

            const marcacionesPorFecha = new Map(marcaciones.map((m) => [m.fecha_asmar, m]));
            const horasExtraPorFecha = new Map(horasExtra.map((h) => [h.fecha_nrhec, h]));

            const dias = [];
            let totalHorasTrabajadas = 0;
            let diasSinMarcar = 0;
            for (let d = 1; d <= diasEnMes; d++) {
                const fecha = `${dtoIn.anio}-${String(dtoIn.mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const dow = new Date(dtoIn.anio, dtoIn.mes - 1, d).getDay();
                const esFeriado = feriadosSet.has(fecha);
                const esDomingo = dow === 0;
                const m = marcacionesPorFecha.get(fecha);

                const marcas = m
                    ? [m.h1_asmar, m.h2_asmar, m.h3_asmar, m.h4_asmar]
                          .map((h) => horaAMinutos(h))
                          .filter((v): v is number => v !== null)
                          .sort((a, b) => a - b)
                    : [];

                let horaEntrada: string | null = null;
                let horaSalida: string | null = null;
                let horasTrabajadas = 0;
                if (marcas.length > 0) {
                    horaEntrada = minutosAHora(marcas[0]);
                    horaSalida = minutosAHora(marcas[marcas.length - 1]);
                    horasTrabajadas = Math.round(((marcas[marcas.length - 1] - marcas[0]) / 60) * 100) / 100;
                }

                const heDelDia = horasExtraPorFecha.get(fecha);
                const sinMarcacion = marcas.length === 0 && !esDomingo && !esFeriado && fecha <= getCurrentDate();

                totalHorasTrabajadas += horasTrabajadas;
                if (sinMarcacion) diasSinMarcar++;

                dias.push({
                    fecha,
                    diaSemana: DIAS_SEMANA[dow],
                    esFeriado,
                    esDomingo,
                    horaEntrada,
                    horaSalida,
                    horasTrabajadas,
                    sinMarcacion,
                    horasExtra: heDelDia
                        ? { horas: Number(heDelDia.horas_detectadas_nrhec), estado: heDelDia.estado_nrhec }
                        : null,
                });
            }

            return {
                empleado: miEmpleado,
                sinTarjetaMarcacion: !tarjeta,
                dias,
                resumen: {
                    totalHorasTrabajadas: Math.round(totalHorasTrabajadas * 100) / 100,
                    diasSinMarcar,
                },
            };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener las marcaciones: ${msg}`);
        }
    }
}
