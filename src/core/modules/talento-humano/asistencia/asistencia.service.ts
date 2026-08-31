import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { DeleteQuery, SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { getCurrentDate, getCurrentTime } from 'src/util/helpers/date-util';

import { EmpleadosService } from '../empleados/empleados.service';

import { GetMisMarcacionesDto } from './dto/asistencia.dto';

interface LineaMarcacionDat {
    codigo: string;
    fecha: string | null;
    fechaOriginal: string;
    hora: string | null;
    h1: string | null;
    h2: string | null;
    h3: string | null;
    h4: string | null;
}

/**
 * Formato heredado del sistema Java (pre_biometrico.java / .dat del biométrico):
 * una línea por marca, columnas separadas por espacios/tabs — código, fecha, hora,
 * h1, h2, h3, h4 (hasta 4 marcas del día). Se mantiene el mismo formato para no
 * requerir cambios en el exportador del equipo biométrico.
 */
function parseArchivoDat(contenido: string): LineaMarcacionDat[] {
    const filas: LineaMarcacionDat[] = [];
    for (const raw of contenido.split(/\r?\n/)) {
        const fila = raw.trim().replace(/\t/g, ' ');
        if (!fila) continue;
        const col = fila.split(/\s+/);
        if (col.length < 2) continue;
        filas.push({
            codigo: col[0],
            fecha: normalizarFecha(col[1]),
            fechaOriginal: col[1],
            hora: col[2] ?? null,
            h1: col[3] ?? null,
            h2: col[4] ?? null,
            h3: col[5] ?? null,
            h4: col[6] ?? null,
        });
    }
    return filas;
}

/** Acepta YYYY-MM-DD o DD/MM/YYYY; retorna null si el formato no es reconocido. */
function normalizarFecha(valor: string): string | null {
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return null;
}

interface MarcacionMesRow {
    fecha_asmar: string;
    hora_entrada: string | null;
    hora_salida: string | null;
}

interface HoraExtraMesRow {
    fecha_nrhec: string;
    horas_detectadas_nrhec: number;
    estado_nrhec: string;
}

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/**
 * ide_tihor de sis_tipo_horario "HORARIO ATENCION DIQUIMEC" (creado 2026-08-31): Lun-Vie
 * 08:00-17:00, Sáb 09:00-13:00, sin fila domingo (cerrado). Es un horario de ASISTENCIA,
 * distinto de "HORARIO ADMIN"/"HORARIO OFICINA" (esos controlan en qué franja puede
 * iniciar sesión cada perfil, ver auth.service.ts#validarHorarioLogin) — mismas tablas
 * (sis_horario/sis_tipo_horario), consumidores completamente separados, no se cruzan.
 */
const IDE_TIHOR_ATENCION_DIQUIMEC = 4;

function horaAMinutos(hora: string | null | undefined): number | null {
    if (!hora) return null;
    const m = /^(\d{1,2}):(\d{2})/.exec(hora.trim());
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

@Injectable()
export class AsistenciaService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly empleadosService: EmpleadosService,
        private readonly core: CoreService,
    ) { }

    /**
     * Mapa código del biométrico -> {ide_geper, empleado}, para cruzar la carga del .dat.
     * El código real es `gen_persona.numero_geper` (confirmado en pre_biometrico.java del
     * sistema legado: `UPDATE asi_marcaciones SET ide_geper = s.ide_geper FROM gen_persona s
     * WHERE cod_empleado_asmar = s.numero_geper`) — NO `gth_empleado.tarjeta_marcacion_gtemp`,
     * que está vacío para la mayoría de empleados reales y no es lo que escribe el biométrico.
     */
    private async getMapaTarjetas(): Promise<Map<string, { ide_geper: number; empleado: string }>> {
        const query = new SelectQuery(`
            SELECT p.numero_geper, e.ide_geper, e.primer_nombre_gtemp || ' ' || e.apellido_paterno_gtemp AS empleado
            FROM gth_empleado e
            INNER JOIN gen_persona p ON p.ide_geper = e.ide_geper
            WHERE p.numero_geper IS NOT NULL AND p.numero_geper <> '' AND e.activo_gtemp = true
        `);
        query.setLazy(false);
        const rows = (await this.dataSource.createSelectQuery(query)) as {
            numero_geper: string;
            ide_geper: number;
            empleado: string;
        }[];
        return new Map(rows.map((r) => [r.numero_geper, { ide_geper: r.ide_geper, empleado: r.empleado }]));
    }

    /**
     * Horario esperado por día de semana (1=Lunes..6=Sábado, sin domingo) desde
     * sis_horario, para calcular atraso/suplementarias/extraordinarias en
     * getMisMarcaciones. Convención de dia_hora confirmada en bot-config.service.ts
     * (estaEnHorario): 1=Lunes..7=Domingo.
     */
    private async getHorarioSemanal(): Promise<Map<number, { inicio: string; fin: string }>> {
        const query = new SelectQuery(`
            SELECT dia_hora, hora_inicio_hora::text AS inicio, hora_fin_hora::text AS fin
            FROM sis_horario
            WHERE ide_tihor = $1 AND activo_hora = true
        `);
        query.setLazy(false);
        query.addIntParam(1, IDE_TIHOR_ATENCION_DIQUIMEC);
        const rows = (await this.dataSource.createSelectQuery(query)) as {
            dia_hora: number;
            inicio: string;
            fin: string;
        }[];
        return new Map(rows.map((r) => [r.dia_hora, { inicio: r.inicio, fin: r.fin }]));
    }

    /**
     * Previsualiza la carga de marcaciones desde un archivo .dat (formato heredado del
     * biométrico: código fecha hora h1 h2 h3 h4, separado por espacios/tabs, una línea
     * por marca) — no escribe nada en la BD, solo valida y arma la vista previa.
     */
    async previsualizarCargaMarcaciones(contenido: string) {
        const filas = parseArchivoDat(contenido);
        if (filas.length === 0) {
            throw new BadRequestException(
                'El archivo no contiene líneas válidas (formato esperado por línea: código fecha hora h1 h2 h3 h4)',
            );
        }

        const mapaTarjetas = await this.getMapaTarjetas();
        const validas = filas.filter((f) => f.fecha);
        const fechaInicio = validas.length > 0 ? validas.reduce((min, f) => (f.fecha! < min ? f.fecha! : min), validas[0].fecha!) : null;
        const fechaFin = validas.length > 0 ? validas.reduce((max, f) => (f.fecha! > max ? f.fecha! : max), validas[0].fecha!) : null;
        const codigosNoReconocidos = [...new Set(filas.filter((f) => !mapaTarjetas.has(f.codigo)).map((f) => f.codigo))];

        return {
            totalLineas: filas.length,
            lineasConFechaInvalida: filas.length - validas.length,
            fechaInicio,
            fechaFin,
            codigosNoReconocidos,
            filas: filas.slice(0, 200).map((f) => ({
                codigo: f.codigo,
                empleado: mapaTarjetas.get(f.codigo)?.empleado ?? null,
                fecha: f.fecha ?? f.fechaOriginal,
                fechaValida: !!f.fecha,
                hora: f.hora,
                h1: f.h1,
                h2: f.h2,
                h3: f.h3,
                h4: f.h4,
            })),
        };
    }

    /**
     * Confirma la carga: por cada línea válida del archivo, BORRA las marcaciones
     * existentes del rango de fechas cubierto (dentro de la sucursal actual) y las
     * reemplaza por las del archivo — mismo comportamiento que `pre_biometrico.cargar()`
     * del sistema legado (reemplazo total por período, no upsert fila a fila).
     */
    async confirmarCargaMarcaciones(dtoIn: HeaderParamsDto & { contenido: string }) {
        const filas = parseArchivoDat(dtoIn.contenido).filter((f) => f.fecha);
        if (filas.length === 0) {
            throw new BadRequestException('El archivo no contiene líneas con fecha válida para cargar');
        }

        try {
            const mapaTarjetas = await this.getMapaTarjetas();
            const fechaInicio = filas.reduce((min, f) => (f.fecha! < min ? f.fecha! : min), filas[0].fecha!);
            const fechaFin = filas.reduce((max, f) => (f.fecha! > max ? f.fecha! : max), filas[0].fecha!);

            const del = new DeleteQuery('asi_marcaciones');
            del.where = 'fecha_asmar BETWEEN $1 AND $2 AND ide_sucu = $3';
            del.addStringParam(1, fechaInicio);
            del.addStringParam(2, fechaFin);
            del.addIntParam(3, dtoIn.ideSucu);
            await this.dataSource.createQuery(del);

            const ideInicial = await this.dataSource.getSeqTable('asi_marcaciones', 'ide_asmar', filas.length, dtoIn.login);
            const listQuery: ObjectQueryDto[] = filas.map((f, i) => ({
                operation: 'insert',
                module: 'asi',
                tableName: 'marcaciones',
                primaryKey: 'ide_asmar',
                object: {
                    ide_asmar: ideInicial + i,
                    cod_empleado_asmar: f.codigo,
                    fecha_asmar: f.fecha,
                    hora_asmar: f.hora,
                    h1_asmar: f.h1,
                    h2_asmar: f.h2,
                    h3_asmar: f.h3,
                    h4_asmar: f.h4,
                    ide_geper: mapaTarjetas.get(f.codigo)?.ide_geper ?? null,
                    ide_sucu: dtoIn.ideSucu,
                    ide_empr: dtoIn.ideEmpr,
                    usuario_ingre: dtoIn.login,
                    fecha_ingre: getCurrentDate(),
                    hora_ingre: getCurrentTime(),
                },
            }));
            await this.core.save({ ...dtoIn, listQuery, audit: false });

            return {
                message: 'ok',
                lineasCargadas: filas.length,
                fechaInicio,
                fechaFin,
                codigosNoReconocidos: [...new Set(filas.filter((f) => !mapaTarjetas.has(f.codigo)).map((f) => f.codigo))],
            };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al cargar las marcaciones: ${msg}`);
        }
    }

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

            // El código real del biométrico es gen_persona.numero_geper, no
            // gth_empleado.tarjeta_marcacion_gtemp (ver nota en getMapaTarjetas) — el aviso
            // "sin código configurado" debe medir el campo que de verdad usan las cargas .dat.
            const tieneCodigoBiometrico = !!(miEmpleado.numero_geper as string | null);

            // El código Java legado (ServicioControlAsistencia.getSqlHorasExtra) filtra
            // asi_marcaciones por `ide_geper` directamente, no por `cod_empleado_asmar` (el
            // código de texto del biométrico) — es la FK real y confiable, tanto para datos
            // históricos cargados por el sistema legado como para los cargados por
            // confirmarCargaMarcaciones (que también backfillea ide_geper). Filtrar por
            // cod_empleado_asmar dejaba fuera marcaciones reales cuyo código de texto no
            // calzaba exacto con tarjeta_marcacion_gtemp.
            // `asi_marcaciones` es una fila POR MARCA (no una fila por día con h1..h4 como
            // los 4 marcas) — confirmado en pre_biometrico.java (`cargar()`: una fila por
            // línea del .dat, `hora_asmar` = la hora real de esa marca) y en
            // ServicioControlAsistencia.java (HORA_ENTRADA/HORA_SALIDA = MIN/MAX(hora_asmar)
            // agrupado por fecha). `h1_asmar..h4_asmar` son códigos del biométrico sin
            // relación con la hora — leerlos como si fueran 4 horas del día (bug anterior)
            // dejaba horasTrabajadas siempre en 0 para toda marcación real.
            const marcacionesQuery = new SelectQuery(`
                SELECT fecha_asmar::text AS fecha_asmar,
                       to_char(MIN(hora_asmar), 'HH24:MI') AS hora_entrada,
                       to_char(MAX(hora_asmar), 'HH24:MI') AS hora_salida
                FROM asi_marcaciones
                WHERE ide_geper = $1 AND fecha_asmar BETWEEN $2 AND $3
                GROUP BY fecha_asmar
            `);
            marcacionesQuery.setLazy(false);
            marcacionesQuery.addIntParam(1, miEmpleado.ide_geper as number);
            marcacionesQuery.addStringParam(2, fechaInicio);
            marcacionesQuery.addStringParam(3, fechaFin);
            const marcaciones = (await this.dataSource.createSelectQuery(
                marcacionesQuery,
            )) as MarcacionMesRow[];

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

            const horarioSemanal = await this.getHorarioSemanal();

            const marcacionesPorFecha = new Map(marcaciones.map((m) => [m.fecha_asmar, m]));
            const horasExtraPorFecha = new Map(horasExtra.map((h) => [h.fecha_nrhec, h]));

            const dias = [];
            let totalHorasTrabajadas = 0;
            let totalMinutosAtraso = 0;
            let totalHorasSuplementarias = 0;
            let totalHorasExtraordinarias = 0;
            let diasSinMarcar = 0;
            for (let d = 1; d <= diasEnMes; d++) {
                const fecha = `${dtoIn.anio}-${String(dtoIn.mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const dow = new Date(dtoIn.anio, dtoIn.mes - 1, d).getDay();
                const esFeriado = feriadosSet.has(fecha);
                const esDomingo = dow === 0;
                const esSabado = dow === 6;
                const m = marcacionesPorFecha.get(fecha);

                const horaEntrada = m?.hora_entrada ?? null;
                const horaSalida = m?.hora_salida ?? null;
                const minEntrada = horaAMinutos(horaEntrada);
                const minSalida = horaAMinutos(horaSalida);

                // Sábado se trabaja según necesidad del negocio, sin planificación fija —
                // no es obligatorio marcar (no cuenta como falta), pero si hay marcación se
                // calcula igual que domingo/feriado: no aplica horario esperado ni almuerzo,
                // todo el tiempo trabajado es hora extra (ver misma regla en
                // horas-extra.service.ts#calcularExcedente).
                const esDiaEspecial = esDomingo || esSabado || esFeriado;

                let horasTrabajadas = 0;
                let minutosAtraso = 0;
                let horasSuplementarias = 0;
                let horasExtraordinarias = 0;

                if (minEntrada !== null && minSalida !== null && minSalida > minEntrada) {
                    const minutosBrutos = minSalida - minEntrada;

                    if (esDiaEspecial) {
                        // Todo el tiempo trabajado es hora extra (100% — Art. 55: día de
                        // descanso no obligatorio/feriado). Sin resta de almuerzo: son
                        // jornadas cortas y no programadas ("timbran salida y se van").
                        horasExtraordinarias = Math.round((minutosBrutos / 60) * 100) / 100;
                        horasTrabajadas = horasExtraordinarias;
                    } else {
                        // Día laborable normal: se resta 1h de almuerzo SOLO si trabajó más
                        // de 4 horas (pedido explícito — no la regla incondicional del
                        // reporte legado pre_resumen_marcaciones.java).
                        const horasBrutas = minutosBrutos / 60;
                        horasTrabajadas = Math.round((horasBrutas > 4 ? horasBrutas - 1 : horasBrutas) * 100) / 100;

                        const horario = horarioSemanal.get(dow); // dow 1-6 == dia_hora 1-6
                        if (horario) {
                            const minEsperadoEntrada = horaAMinutos(horario.inicio);
                            const minEsperadoSalida = horaAMinutos(horario.fin);
                            if (minEsperadoEntrada !== null && minEntrada > minEsperadoEntrada) {
                                minutosAtraso = minEntrada - minEsperadoEntrada;
                            }
                            if (minEsperadoSalida !== null && minSalida > minEsperadoSalida) {
                                // Mismo criterio que el reporte legado: primero "recupera" el
                                // atraso antes de que la salida tardía cuente como suplementaria.
                                const excedente = minSalida - minEsperadoSalida - minutosAtraso;
                                if (excedente > 60) {
                                    horasSuplementarias = Math.round((excedente / 60) * 100) / 100;
                                }
                            }
                        }
                    }
                }

                const heDelDia = horasExtraPorFecha.get(fecha);
                const sinMarcacion = !m && !esDomingo && !esSabado && !esFeriado && fecha <= getCurrentDate();

                totalHorasTrabajadas += horasTrabajadas;
                totalMinutosAtraso += minutosAtraso;
                totalHorasSuplementarias += horasSuplementarias;
                totalHorasExtraordinarias += horasExtraordinarias;
                if (sinMarcacion) diasSinMarcar++;

                dias.push({
                    fecha,
                    diaSemana: DIAS_SEMANA[dow],
                    esFeriado,
                    esDomingo,
                    esSabado,
                    horaEntrada,
                    horaSalida,
                    horasTrabajadas,
                    minutosAtraso,
                    horasSuplementarias,
                    horasExtraordinarias,
                    sinMarcacion,
                    horasExtra: heDelDia
                        ? { horas: Number(heDelDia.horas_detectadas_nrhec), estado: heDelDia.estado_nrhec }
                        : null,
                });
            }

            return {
                empleado: miEmpleado,
                sinTarjetaMarcacion: !tieneCodigoBiometrico,
                dias,
                resumen: {
                    totalHorasTrabajadas: Math.round(totalHorasTrabajadas * 100) / 100,
                    totalMinutosAtraso,
                    totalHorasSuplementarias: Math.round(totalHorasSuplementarias * 100) / 100,
                    totalHorasExtraordinarias: Math.round(totalHorasExtraordinarias * 100) / 100,
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
