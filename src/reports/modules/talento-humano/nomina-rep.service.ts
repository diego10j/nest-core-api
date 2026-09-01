import { Injectable, NotFoundException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { EmpresaRepService } from 'src/reports/common/services/empresa-rep.service';
import { PrinterService } from 'src/reports/printer/printer.service';

import { GetRolPagosRepDto } from './dto/get-rol-pagos-rep.dto';
import { GetSolicitudPermisoRepDto } from './dto/get-solicitud-permiso-rep.dto';
import { RolPagosRep, RolPagosRepEmpleado } from './interfaces/rol-pagos-rep';
import { SolicitudPermisoRep } from './interfaces/solicitud-permiso-rep';
import { rolPagosReport } from './rol-pagos.report';
import { solicitudPermisoReport } from './solicitud-permiso.report';

const TIPO_ASPVH_LABEL: Record<number, string> = {
    1: 'Solicitud de Permiso',
    2: 'Solicitud de Vacaciones',
    3: 'Solicitud de Horas Extra',
    4: 'Justificación de Marcación',
};

interface DetalleRolRepRow {
    ide_geedp: number;
    empleado: string;
    identificacion: string | null;
    cargo: string | null;
    rubro: string;
    ide_nrrub: number;
    valor_nrdro: number;
}

// Rubros por su nombre (nrh_rubro.detalle_nrrub) tal como se usan hoy en la parametría
// de DIQUIMEC — ver Nómina > Catálogos > Parametría de Rubros. Igual que el frontend
// (rol-pagos-details.tsx), se identifican por nombre en vez de por ide_nrrub porque el
// reporte debe seguir funcionando aunque cambie qué sis_parametros apunta a cada rubro.
const RUBRO_SUELDO = 'REMUNERACION UNIFICADA';
const RUBROS_HORAS_EXTRA = ['HORAS EXTRAS 50%', 'HORAS EXTRAS 25%', 'HORAS EXTRAS 100%'];
const RUBRO_DECIMO_TERCERO = 'PROVISION DECIMO TERCERO';
const RUBRO_DECIMO_CUARTO = 'PROVISION DECIMO CUARTO';
const RUBRO_FONDOS_RESERVA = 'FONDOS RESERVA NOMINA';
const RUBRO_TOTAL_INGRESOS = 'TOTAL INGRESOS';
const RUBRO_IESS = 'IESS PERSONAL';
const RUBROS_PRESTAMOS = ['PRESTAMO HIPOTECARIO', 'PRESTAMO QUIROGRAFARIO'];
const RUBRO_LIQUIDO = 'TOTAL A RECIBIR';

@Injectable()
export class NominaRepService {
    constructor(
        private readonly printerService: PrinterService,
        private readonly dataSource: DataSourceService,
        private readonly empresaRepService: EmpresaRepService,
    ) { }

    /** Reporte de Rol de Pagos: una fila por empleado con las mismas columnas que el rol físico (Excel) de DIQUIMEC. */
    async reportRolPagos(dtoIn: HeaderParamsDto & GetRolPagosRepDto) {
        const queryCabecera = new SelectQuery(`
            SELECT r.ide_nrrol, r.fecha_nrrol, tin.detalle_nrtin AS tipo_nomina, est.detalle_nresr AS estado
            FROM nrh_rol r
            INNER JOIN nrh_detalle_tipo_nomina dtn ON dtn.ide_nrdtn = r.ide_nrdtn
            INNER JOIN nrh_tipo_nomina tin ON tin.ide_nrtin = dtn.ide_nrtin
            LEFT JOIN nrh_estado_rol est ON est.ide_nresr = r.ide_nresr
            WHERE r.ide_nrrol = $1 AND r.ide_sucu = $2
        `);
        queryCabecera.addIntParam(1, dtoIn.ide_nrrol);
        queryCabecera.addIntParam(2, dtoIn.ideSucu);
        const cabecera = await this.dataSource.createSingleQuery(queryCabecera);
        if (!cabecera) {
            throw new NotFoundException(`Rol de pagos ${dtoIn.ide_nrrol} no encontrado`);
        }

        const queryDetalle = new SelectQuery(`
            SELECT
                dr.ide_geedp,
                emp.primer_nombre_gtemp || ' ' || emp.apellido_paterno_gtemp AS empleado,
                per.identificac_geper AS identificacion,
                car.detalle_gtcar AS cargo,
                rub.detalle_nrrub AS rubro,
                rub.ide_nrrub,
                dr.valor_nrdro
            FROM nrh_detalle_rol dr
            INNER JOIN gen_empleados_departamento_par ged ON ged.ide_geedp = dr.ide_geedp
            INNER JOIN gth_empleado emp ON emp.ide_gtemp = ged.ide_gtemp
            INNER JOIN gen_persona per ON per.ide_geper = emp.ide_geper
            LEFT JOIN gth_cargo car ON car.ide_gtcar = ged.ide_gtcar
            INNER JOIN nrh_detalle_rubro der ON der.ide_nrder = dr.ide_nrder
            INNER JOIN nrh_rubro rub ON rub.ide_nrrub = der.ide_nrrub
            WHERE dr.ide_nrrol = $1
            ORDER BY emp.apellido_paterno_gtemp, dr.orden_calculo_nrdro
        `);
        queryDetalle.addIntParam(1, dtoIn.ide_nrrol);
        const filas = (await this.dataSource.createSelectQuery(queryDetalle)) as DetalleRolRepRow[];

        const porEmpleado = new Map<number, { empleado: string; identificacion: string; cargo: string | null; valores: Map<string, number> }>();
        const idRubroPorNombre = new Map<string, number>();
        for (const f of filas) {
            if (!porEmpleado.has(f.ide_geedp)) {
                porEmpleado.set(f.ide_geedp, {
                    empleado: f.empleado,
                    identificacion: f.identificacion ?? '---',
                    cargo: f.cargo,
                    valores: new Map(),
                });
            }
            porEmpleado.get(f.ide_geedp)!.valores.set(f.rubro, Number(f.valor_nrdro) || 0);
            if (!idRubroPorNombre.has(f.rubro)) idRubroPorNombre.set(f.rubro, f.ide_nrrub);
        }

        // Décimo 3°/4° y fondos de reserva se calculan y guardan en nrh_detalle_rol
        // TODOS los meses como provisión contable (ver rol-pagos.service.ts
        // #construirDetalleRol), la tenga o no mensualizada el empleado — por eso NO
        // alcanza con leer el valor tal cual: si el empleado acumula (no mensualiza),
        // ese valor es solo provisión interna y nunca se le paga en este rol, así que
        // mostrarlo en el reporte descuadra contra el Total Ingr./Líquido reales.
        // Se filtra igual que crearCxpPorEmpleado: solo se muestra si está mensualizado
        // vigente a la fecha del rol.
        const rubrosMensualizables = [RUBRO_DECIMO_TERCERO, RUBRO_DECIMO_CUARTO, RUBRO_FONDOS_RESERVA]
            .map((nombre) => idRubroPorNombre.get(nombre))
            .filter((id): id is number => id !== undefined);
        const mensualizacionVigente = await this.getMensualizacionVigente(
            [...porEmpleado.keys()],
            rubrosMensualizables,
            String(cabecera.fecha_nrrol),
        );
        const estaMensualizado = (ideGeedp: number, nombreRubro: string) => {
            const ideNrrub = idRubroPorNombre.get(nombreRubro);
            if (ideNrrub === undefined) return false;
            return mensualizacionVigente.get(`${ideGeedp}:${ideNrrub}`) ?? false;
        };

        const sumar = (valores: Map<string, number>, nombres: string[]) =>
            nombres.reduce((acc, n) => acc + (valores.get(n) ?? 0), 0);

        const empleados: RolPagosRepEmpleado[] = Array.from(porEmpleado.entries()).map(([ideGeedp, e]) => {
            const totalIngresos = e.valores.get(RUBRO_TOTAL_INGRESOS) ?? 0;
            const liquido = e.valores.get(RUBRO_LIQUIDO) ?? 0;
            const iess = e.valores.get(RUBRO_IESS) ?? 0;
            const prestamos = sumar(e.valores, RUBROS_PRESTAMOS);
            return {
                ide_geedp: ideGeedp,
                empleado: e.empleado,
                identificacion: e.identificacion,
                cargo: e.cargo,
                sueldo: e.valores.get(RUBRO_SUELDO) ?? 0,
                horasExtra: sumar(e.valores, RUBROS_HORAS_EXTRA),
                decimoTercero: estaMensualizado(ideGeedp, RUBRO_DECIMO_TERCERO) ? e.valores.get(RUBRO_DECIMO_TERCERO) ?? 0 : 0,
                decimoCuarto: estaMensualizado(ideGeedp, RUBRO_DECIMO_CUARTO) ? e.valores.get(RUBRO_DECIMO_CUARTO) ?? 0 : 0,
                fondosReserva: estaMensualizado(ideGeedp, RUBRO_FONDOS_RESERVA) ? e.valores.get(RUBRO_FONDOS_RESERVA) ?? 0 : 0,
                totalIngresos,
                iess,
                prestamos,
                totalDescuentos: Math.round((totalIngresos - liquido) * 100) / 100,
                liquido,
            };
        });

        const empresa = await this.empresaRepService.getEmpresaById(dtoIn.ideEmpr);
        const data: RolPagosRep = {
            cabecera: { ...(cabecera as Omit<RolPagosRep['cabecera'], 'ide_empr'>), ide_empr: dtoIn.ideEmpr },
            empleados,
        };
        const docDefinition = rolPagosReport(data, empresa);
        return this.printerService.createPdf(docDefinition);
    }

    /** Documento de solicitud (permiso/vacaciones/justificación de marcación) para firma manual del empleado y del coordinador. */
    async reportSolicitudPermiso(dtoIn: HeaderParamsDto & GetSolicitudPermisoRepDto) {
        const query = new SelectQuery(`
            SELECT
                p.ide_aspvh,
                p.tipo_aspvh,
                p.fecha_solicitud_aspvh::text AS fecha_solicitud_aspvh,
                p.fecha_desde_aspvh::text AS fecha_desde_aspvh,
                p.fecha_hasta_aspvh::text AS fecha_hasta_aspvh,
                to_char(p.hora_desde_aspvh, 'HH24:MI') AS hora_desde_aspvh,
                to_char(p.hora_hasta_aspvh, 'HH24:MI') AS hora_hasta_aspvh,
                p.nro_dias_aspvh,
                p.nro_horas_aspvh,
                p.detalle_aspvh,
                emp.primer_nombre_gtemp || ' ' || emp.apellido_paterno_gtemp AS empleado,
                per.identificac_geper AS identificacion,
                car.detalle_gtcar AS cargo
            FROM asi_permisos_vacacion_hext p
            INNER JOIN gth_empleado emp ON emp.ide_gtemp = p.ide_gtemp
            INNER JOIN gen_persona per ON per.ide_geper = emp.ide_geper
            LEFT JOIN gen_empleados_departamento_par ged ON ged.ide_gtemp = emp.ide_gtemp AND ged.activo_geedp = true
            LEFT JOIN gth_cargo car ON car.ide_gtcar = ged.ide_gtcar
            WHERE p.ide_aspvh = $1
        `);
        query.addIntParam(1, dtoIn.ide_aspvh);
        const row = await this.dataSource.createSingleQuery(query);
        if (!row) {
            throw new NotFoundException(`Solicitud ${dtoIn.ide_aspvh} no encontrada`);
        }

        const data: SolicitudPermisoRep = {
            ide_aspvh: row.ide_aspvh,
            tipoLabel: TIPO_ASPVH_LABEL[row.tipo_aspvh] ?? 'Solicitud',
            empleado: row.empleado,
            identificacion: row.identificacion ?? '---',
            cargo: row.cargo,
            fecha_solicitud_aspvh: row.fecha_solicitud_aspvh,
            fecha_desde_aspvh: row.fecha_desde_aspvh,
            fecha_hasta_aspvh: row.fecha_hasta_aspvh,
            hora_desde_aspvh: row.hora_desde_aspvh,
            hora_hasta_aspvh: row.hora_hasta_aspvh,
            nro_dias_aspvh: row.nro_dias_aspvh,
            nro_horas_aspvh: row.nro_horas_aspvh,
            detalle_aspvh: row.detalle_aspvh,
            ide_empr: dtoIn.ideEmpr,
        };
        const empresa = await this.empresaRepService.getEmpresaById(dtoIn.ideEmpr);
        const docDefinition = solicitudPermisoReport(data, empresa);
        return this.printerService.createPdf(docDefinition);
    }

    /**
     * Modalidad (mensualizado/acumula) vigente A LA FECHA DEL ROL para cada
     * (empleado, rubro) — misma lógica que RolPagosService#getMensualizacionVigente.
     * Sin solicitud registrada, el default es "acumula" (false).
     */
    private async getMensualizacionVigente(
        geedpIds: number[],
        ideNrrubIds: number[],
        fechaRol: string,
    ): Promise<Map<string, boolean>> {
        const resultado = new Map<string, boolean>();
        if (geedpIds.length === 0 || ideNrrubIds.length === 0) return resultado;

        const query = new SelectQuery(`
            SELECT ide_geedp, ide_nrrub, mensualizado_nrsom
            FROM nrh_solicitud_mensualizacion
            WHERE ide_geedp = ANY ($1) AND ide_nrrub = ANY ($2) AND fecha_solicitud_nrsom <= $3
            ORDER BY ide_geedp, ide_nrrub, fecha_solicitud_nrsom ASC
        `);
        query.setLazy(false);
        query.addParam(1, geedpIds);
        query.addParam(2, ideNrrubIds);
        query.addStringParam(3, fechaRol);
        const rows = (await this.dataSource.createSelectQuery(query)) as Array<{
            ide_geedp: number;
            ide_nrrub: number;
            mensualizado_nrsom: boolean;
        }>;

        for (const row of rows) {
            resultado.set(`${row.ide_geedp}:${row.ide_nrrub}`, !!row.mensualizado_nrsom);
        }
        return resultado;
    }
}
