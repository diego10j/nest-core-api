import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { DeleteQuery, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { GptService } from 'src/core/integration/gpt/gpt.service';
import { getCurrentDate, getCurrentTime } from 'src/util/helpers/date-util';

import { AprobarCandidataDto, DetectarCandidatasDto, GenerarFeriadosDto, GetCandidatasDto, RechazarCandidatasDto } from './dto/horas-extra.dto';

interface MarcacionRow {
    ide_geedp: number;
    fecha_asmar: string;
    dow: number; // 0=domingo .. 6=sábado
    es_feriado: boolean;
    h1_asmar: string | null;
    h2_asmar: string | null;
    h3_asmar: string | null;
    h4_asmar: string | null;
    jornada_fin: string | null;
}

const JORNADA_FIN_DEFAULT = '17:00';

function horaAMinutos(hora: string | null | undefined): number | null {
    if (!hora) return null;
    const m = /^(\d{1,2}):(\d{2})/.exec(hora.trim());
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

@Injectable()
export class HorasExtraService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly gptService: GptService,
    ) { }

    /**
     * Cruza asi_marcaciones contra la jornada de cada empleado y crea candidatas a
     * hora extra (nrh_hora_extra_candidata, estado 'pendiente') por los días con
     * exceso, con una SUGERENCIA de clasificación (suplementaria/extraordinaria, según
     * Art. 55 del Código de Trabajo — domingo/feriado o después de jornada = pistas).
     * La clasificación final y la justificación las decide quien aprueba manualmente
     * (ver aprobar()); esto es solo una ayuda, no una decisión automática.
     * No duplica: si ya existe una candidata para ese empleado+fecha, la salta.
     */
    async detectarCandidatas(dtoIn: DetectarCandidatasDto & HeaderParamsDto) {
        try {
            const query = new SelectQuery(`
                SELECT
                    ged.ide_geedp,
                    m.fecha_asmar::text AS fecha_asmar,
                    EXTRACT(DOW FROM m.fecha_asmar)::int AS dow,
                    EXISTS (
                        SELECT 1 FROM nrh_feriado f
                        WHERE f.fecha_nrfer = m.fecha_asmar AND f.activo_nrfer = true
                    ) AS es_feriado,
                    m.h1_asmar, m.h2_asmar, m.h3_asmar, m.h4_asmar,
                    per.jornada_fin_geper::text AS jornada_fin
                FROM asi_marcaciones m
                INNER JOIN gth_empleado emp ON emp.tarjeta_marcacion_gtemp = m.cod_empleado_asmar
                INNER JOIN gen_persona per ON per.ide_geper = emp.ide_geper
                INNER JOIN gen_empleados_departamento_par ged ON ged.ide_gtemp = emp.ide_gtemp AND ged.activo_geedp = true
                WHERE m.ide_sucu = $1
                  AND m.fecha_asmar BETWEEN $2 AND $3
                  AND NOT EXISTS (
                      SELECT 1 FROM nrh_hora_extra_candidata c
                      WHERE c.ide_geedp = ged.ide_geedp AND c.fecha_nrhec = m.fecha_asmar
                  )
            `);
            query.setLazy(false);
            query.addIntParam(1, dtoIn.ideSucu);
            query.addStringParam(2, dtoIn.fechaInicio);
            query.addStringParam(3, dtoIn.fechaFin);
            const marcaciones = (await this.dataSource.createSelectQuery(query)) as MarcacionRow[];

            const listQuery: ObjectQueryDto[] = [];
            let creadas = 0;

            for (const m of marcaciones) {
                const horas = this.calcularExcedente(m);
                if (horas <= 0) continue;

                const ideNrhec = await this.dataSource.getSeqTable('nrh_hora_extra_candidata', 'ide_nrhec', 1, dtoIn.login);
                listQuery.push({
                    operation: 'insert',
                    module: 'nrh',
                    tableName: 'hora_extra_candidata',
                    primaryKey: 'ide_nrhec',
                    object: {
                        ide_nrhec: ideNrhec,
                        ide_geedp: m.ide_geedp,
                        fecha_nrhec: m.fecha_asmar,
                        horas_detectadas_nrhec: horas,
                        sugerencia_nrhec: this.sugerirTipo(m),
                        origen_nrhec: 'asi_marcaciones',
                        estado_nrhec: 'pendiente',
                        usuario_ingre: dtoIn.login,
                        fecha_ingre: getCurrentDate(),
                        hora_ingre: getCurrentTime(),
                    },
                });
                creadas++;
            }

            if (listQuery.length > 0) {
                await this.core.save({ ...dtoIn, listQuery, audit: false });
            }

            return { message: 'ok', analizadas: marcaciones.length, candidatasCreadas: creadas };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al detectar candidatas a hora extra: ${msg}`);
        }
    }

    /** Total de horas trabajadas fuera de jornada (primera a última marcación del día). */
    private calcularExcedente(m: MarcacionRow): number {
        const marcas = [m.h1_asmar, m.h2_asmar, m.h3_asmar, m.h4_asmar]
            .map((h) => horaAMinutos(h))
            .filter((v): v is number => v !== null);
        if (marcas.length === 0) return 0;

        const entrada = Math.min(...marcas);
        const salida = Math.max(...marcas);
        if (salida <= entrada) return 0;

        const esDiaNoLaborable = m.dow === 0 || m.es_feriado; // domingo o feriado
        if (esDiaNoLaborable) {
            return Math.round(((salida - entrada) / 60) * 100) / 100;
        }

        const finJornadaMin = horaAMinutos(m.jornada_fin) ?? horaAMinutos(JORNADA_FIN_DEFAULT)!;
        if (salida <= finJornadaMin) return 0;
        return Math.round(((salida - finJornadaMin) / 60) * 100) / 100;
    }

    /**
     * Sugerencia informativa (Art. 55): domingo/feriado -> extraordinaria (100%);
     * cualquier otro exceso -> suplementaria (50%, cubre lunes-sábado 06:00-24:00,
     * el caso normal). Quien aprueba puede cambiarla.
     */
    private sugerirTipo(m: MarcacionRow): 'suplementaria' | 'extraordinaria' {
        return m.dow === 0 || m.es_feriado ? 'extraordinaria' : 'suplementaria';
    }

    async getCandidatas(dtoIn: GetCandidatasDto & HeaderParamsDto) {
        try {
            const conditions = ['ged.activo_geedp = true', 'per.ide_empr = $1'];
            const params: unknown[] = [dtoIn.ideEmpr];
            let pIdx = 1;

            if (dtoIn.estado) {
                conditions.push(`c.estado_nrhec = $${++pIdx}`);
                params.push(dtoIn.estado);
            }
            if (dtoIn.fechaInicio && dtoIn.fechaFin) {
                conditions.push(`c.fecha_nrhec BETWEEN $${++pIdx} AND $${++pIdx}`);
                params.push(dtoIn.fechaInicio, dtoIn.fechaFin);
            }

            const query = new SelectQuery(
                `
                SELECT
                    c.ide_nrhec,
                    c.ide_geedp,
                    emp.primer_nombre_gtemp || ' ' || emp.apellido_paterno_gtemp AS empleado,
                    c.fecha_nrhec,
                    c.horas_detectadas_nrhec,
                    c.sugerencia_nrhec,
                    c.tipo_nrhec,
                    c.justificacion_nrhec,
                    c.origen_nrhec,
                    c.estado_nrhec,
                    c.ide_usua_aprobador,
                    c.fecha_aprobacion_nrhec,
                    c.ide_nrrol
                FROM nrh_hora_extra_candidata c
                INNER JOIN gen_empleados_departamento_par ged ON ged.ide_geedp = c.ide_geedp
                INNER JOIN gth_empleado emp ON emp.ide_gtemp = ged.ide_gtemp
                INNER JOIN gen_persona per ON per.ide_geper = emp.ide_geper
                WHERE ${conditions.join(' AND ')}
                ORDER BY c.fecha_nrhec DESC, empleado
                `,
                dtoIn,
            );
            params.forEach((v, i) => query.addParam(i + 1, v));
            return this.dataSource.createQuery(query, 'nrh_hora_extra_candidata');
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener candidatas a hora extra: ${msg}`);
        }
    }

    /**
     * Aprueba una candidata: quien aprueba decide el tipo final (suplementaria 50% /
     * extraordinaria 100%) y registra la justificación de por qué se trabajó.
     */
    async aprobar(dtoIn: AprobarCandidataDto & HeaderParamsDto) {
        const updQuery = new UpdateQuery('nrh_hora_extra_candidata', 'ide_nrhec');
        updQuery.values.set('estado_nrhec', 'aprobada');
        updQuery.values.set('tipo_nrhec', dtoIn.tipo_nrhec);
        updQuery.values.set('justificacion_nrhec', dtoIn.justificacion_nrhec);
        updQuery.values.set('ide_usua_aprobador', dtoIn.ideUsua);
        updQuery.values.set('fecha_aprobacion_nrhec', getCurrentDate());
        updQuery.where = `ide_nrhec = $1 AND estado_nrhec = 'pendiente'`;
        updQuery.addIntParam(1, dtoIn.ide_nrhec);
        const result = await this.dataSource.createQuery(updQuery);
        return { message: 'ok', ...result };
    }

    async rechazar(dtoIn: RechazarCandidatasDto & HeaderParamsDto) {
        if (!dtoIn.ide || dtoIn.ide.length === 0) {
            throw new BadRequestException('Debe proporcionar al menos un ide_nrhec');
        }
        const updQuery = new UpdateQuery('nrh_hora_extra_candidata', 'ide_nrhec');
        updQuery.values.set('estado_nrhec', 'rechazada');
        updQuery.values.set('ide_usua_aprobador', dtoIn.ideUsua);
        updQuery.values.set('fecha_aprobacion_nrhec', getCurrentDate());
        updQuery.where = `ide_nrhec = ANY ($1) AND estado_nrhec = 'pendiente'`;
        updQuery.addParam(1, dtoIn.ide);
        await this.dataSource.createQuery(updQuery);
        return { message: 'ok', rowCount: dtoIn.ide.length, estado: 'rechazada' };
    }

    // ─── Catálogo de feriados ──────────────────────────────────────────────

    async getFeriados() {
        const query = new SelectQuery(`
            SELECT ide_nrfer, fecha_nrfer, detalle_nrfer, activo_nrfer
            FROM nrh_feriado
            ORDER BY fecha_nrfer DESC
        `);
        query.setLazy(false);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Genera por IA (GPT) el calendario de feriados de Ecuador para un año, reemplazando
     * los que ya existan para ese año (borra e inserta de nuevo). Solo permite años hasta
     * el actual — no años futuros, porque el traslado de feriados de años no transcurridos
     * puede no estar aún determinado/oficializado. Es contenido generado por IA: revisar
     * contra una fuente oficial antes de confiar en él para cálculos legales.
     */
    async generarFeriadosAnio(dtoIn: GenerarFeriadosDto & HeaderParamsDto) {
        const anioActual = new Date().getFullYear();
        if (dtoIn.anio > anioActual) {
            throw new BadRequestException(`No se pueden generar feriados de años futuros (máximo ${anioActual})`);
        }
        try {
            const feriados = await this.gptService.feriadosEcuador(dtoIn.anio);
            if (!feriados || feriados.length === 0) {
                throw new BadRequestException('No se pudo generar el calendario de feriados (respuesta vacía de IA)');
            }

            const delQuery = new DeleteQuery('nrh_feriado');
            delQuery.where = `EXTRACT(YEAR FROM fecha_nrfer) = $1`;
            delQuery.addIntParam(1, dtoIn.anio);
            await this.dataSource.createQuery(delQuery);

            const listQuery: ObjectQueryDto[] = [];
            for (const f of feriados) {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) continue;
                const ideNrfer = await this.dataSource.getSeqTable('nrh_feriado', 'ide_nrfer', 1, dtoIn.login);
                listQuery.push({
                    operation: 'insert',
                    module: 'nrh',
                    tableName: 'feriado',
                    primaryKey: 'ide_nrfer',
                    object: {
                        ide_nrfer: ideNrfer,
                        fecha_nrfer: f.fecha,
                        detalle_nrfer: f.detalle,
                        activo_nrfer: true,
                        usuario_ingre: dtoIn.login,
                        fecha_ingre: getCurrentDate(),
                    },
                });
            }

            if (listQuery.length > 0) {
                await this.core.save({ ...dtoIn, listQuery, audit: false });
            }

            return { message: 'ok', anio: dtoIn.anio, feriadosCreados: listQuery.length };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al generar feriados del año ${dtoIn.anio}: ${msg}`);
        }
    }

    async saveFeriado(dtoIn: { data: Record<string, unknown> } & HeaderParamsDto) {
        try {
            if (!dtoIn.data?.fecha_nrfer) {
                throw new BadRequestException('fecha_nrfer es requerida');
            }
            const ideNrfer = await this.dataSource.getSeqTable('nrh_feriado', 'ide_nrfer', 1, dtoIn.login);
            const insQuery: ObjectQueryDto = {
                operation: 'insert',
                module: 'nrh',
                tableName: 'feriado',
                primaryKey: 'ide_nrfer',
                object: {
                    activo_nrfer: true,
                    ...dtoIn.data,
                    ide_nrfer: ideNrfer,
                    usuario_ingre: dtoIn.login,
                    fecha_ingre: getCurrentDate(),
                },
            };
            await this.core.save({ ...dtoIn, listQuery: [insQuery], audit: false });
            return { message: 'ok', ide_nrfer: ideNrfer };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar el feriado: ${msg}`);
        }
    }
}
