import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { ComprobanteContabilidadService } from 'src/core/modules/contabilidad/comprobante-contabilidad/comprobante-contabilidad.service';
import { FormulaEngineService } from 'src/core/modules/talento-humano/formula-engine/formula-engine.service';
import { getCurrentDate, getCurrentTime } from 'src/util/helpers/date-util';

import { AnularRolDto, AprobarRolDto, CerrarRolDto, GenerarRolDto, GetRolByIdDto, GetRolesDto } from './dto/rol-pagos.dto';

interface DetalleRubroRow {
    ide_nrder: number;
    ide_nrrub: number;
    detalle_nrrub: string;
    formula_nrder: string | null;
    orden_nrder: number | null;
    fecha_inicial_nrder: string | null;
    fecha_final_nrder: string | null;
    activo_nrder: boolean;
}

interface EmpleadoVigenteRow {
    ide_geedp: number;
    ide_gtemp: number;
    rmu_geedp: number;
    nombre_empleado: string;
}

@Injectable()
export class RolPagosService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly formulaEngine: FormulaEngineService,
        private readonly comprobanteContabilidad: ComprobanteContabilidadService,
    ) {
        super();
        this.core
            .getVariables([
                'p_nrh_rubro_sueldo',
                'p_nrh_rubro_horas_supl',
                'p_nrh_rubro_horas_extra',
                'p_nrh_estado_pre_nomina',
                'p_nrh_estado_nomina_aprobada',
                'p_nrh_estado_nomina_cerrada',
                'p_nrh_estado_nomina_anulada',
                'p_nrh_cuenta_liquido_pagar',
                'p_nrh_tipo_comprobante_rol',
                'p_con_lugar_debe',
                'p_con_lugar_haber',
                'p_cxp_estado_factura_normal',
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    private paramInt(name: string): number | null {
        const raw = this.variables.get(name);
        if (!raw) return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
    }

    // ─── Consulta ──────────────────────────────────────────────────────────

    async getRoles(dtoIn: GetRolesDto & HeaderParamsDto) {
        try {
            const conditions = ['r.ide_sucu = $1'];
            const params: unknown[] = [dtoIn.ideSucu];
            let pIdx = 1;
            if (dtoIn.fechaInicio && dtoIn.fechaFin) {
                conditions.push(`r.fecha_nrrol BETWEEN $${++pIdx} AND $${++pIdx}`);
                params.push(dtoIn.fechaInicio, dtoIn.fechaFin);
            }
            const query = new SelectQuery(
                `
                SELECT
                    r.ide_nrrol,
                    r.fecha_nrrol,
                    r.ide_nrdtn,
                    tin.detalle_nrtin AS tipo_nomina,
                    r.ide_nresr,
                    est.detalle_nresr AS estado,
                    r.ide_cnmoc,
                    r.activo_nrrol,
                    (SELECT COUNT(DISTINCT dr.ide_geedp) FROM nrh_detalle_rol dr WHERE dr.ide_nrrol = r.ide_nrrol) AS total_empleados,
                    (SELECT COALESCE(SUM(dr.valor_nrdro), 0) FROM nrh_detalle_rol dr
                       INNER JOIN nrh_rubro rub ON rub.ide_nrrub = (SELECT der.ide_nrrub FROM nrh_detalle_rubro der WHERE der.ide_nrder = dr.ide_nrder)
                       INNER JOIN nrh_tipo_rubro tir ON tir.ide_nrtir = rub.ide_nrtir
                      WHERE dr.ide_nrrol = r.ide_nrrol) AS total_liquido
                FROM nrh_rol r
                INNER JOIN nrh_detalle_tipo_nomina dtn ON dtn.ide_nrdtn = r.ide_nrdtn
                INNER JOIN nrh_tipo_nomina tin ON tin.ide_nrtin = dtn.ide_nrtin
                LEFT JOIN nrh_estado_rol est ON est.ide_nresr = r.ide_nresr
                WHERE ${conditions.join(' AND ')}
                ORDER BY r.fecha_nrrol DESC, r.ide_nrrol DESC
                `,
                dtoIn,
            );
            params.forEach((v, i) => query.addParam(i + 1, v));
            return this.dataSource.createQuery(query, 'nrh_rol');
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener roles de pago: ${msg}`);
        }
    }

    async getRolById(dtoIn: GetRolByIdDto & HeaderParamsDto) {
        if (!dtoIn.ide_nrrol) throw new BadRequestException('El campo ide_nrrol es requerido');
        try {
            const qCab = new SelectQuery(`
                SELECT r.*, tin.detalle_nrtin AS tipo_nomina, est.detalle_nresr AS estado
                FROM nrh_rol r
                INNER JOIN nrh_detalle_tipo_nomina dtn ON dtn.ide_nrdtn = r.ide_nrdtn
                INNER JOIN nrh_tipo_nomina tin ON tin.ide_nrtin = dtn.ide_nrtin
                LEFT JOIN nrh_estado_rol est ON est.ide_nresr = r.ide_nresr
                WHERE r.ide_nrrol = $1 AND r.ide_sucu = $2
            `);
            qCab.setLazy(false);
            qCab.addIntParam(1, dtoIn.ide_nrrol);
            qCab.addIntParam(2, dtoIn.ideSucu);
            const cabRows = await this.dataSource.createSelectQuery(qCab);
            const cabecera = cabRows?.[0] ?? null;
            if (!cabecera) return { cabecera: null, detalle: [] };

            const qDet = new SelectQuery(`
                SELECT
                    dr.ide_nrdro,
                    dr.ide_geedp,
                    emp.ide_gtemp,
                    emp.primer_nombre_gtemp || ' ' || emp.apellido_paterno_gtemp AS empleado,
                    dr.ide_nrder,
                    rub.ide_nrrub,
                    rub.detalle_nrrub AS rubro,
                    tir.signo_nrtir,
                    dr.valor_nrdro,
                    dr.orden_calculo_nrdro
                FROM nrh_detalle_rol dr
                INNER JOIN gen_empleados_departamento_par ged ON ged.ide_geedp = dr.ide_geedp
                INNER JOIN gth_empleado emp ON emp.ide_gtemp = ged.ide_gtemp
                INNER JOIN nrh_detalle_rubro der ON der.ide_nrder = dr.ide_nrder
                INNER JOIN nrh_rubro rub ON rub.ide_nrrub = der.ide_nrrub
                INNER JOIN nrh_tipo_rubro tir ON tir.ide_nrtir = rub.ide_nrtir
                WHERE dr.ide_nrrol = $1
                ORDER BY emp.apellido_paterno_gtemp, dr.orden_calculo_nrdro
            `);
            qDet.setLazy(false);
            qDet.addIntParam(1, dtoIn.ide_nrrol);
            const detalle = await this.dataSource.createSelectQuery(qDet);

            return { cabecera, detalle };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener el rol: ${msg}`);
        }
    }

    // ─── Generación ────────────────────────────────────────────────────────

    /**
     * Genera (calcula) un rol de pagos: por cada empleado vigente que aplique al
     * tipo de nómina indicado, evalúa todos los rubros parametrizados (nrh_detalle_rubro)
     * con el motor de fórmulas, inyectando sueldo real y horas extra aprobadas donde
     * corresponda, y persiste el detalle congelado en nrh_detalle_rol.
     */
    async generarRol(dtoIn: GenerarRolDto & HeaderParamsDto) {
        try {
            const rubroSueldoId = this.paramInt('p_nrh_rubro_sueldo');
            const rubroHorasSuplId = this.paramInt('p_nrh_rubro_horas_supl');
            const rubroHorasExtraId = this.paramInt('p_nrh_rubro_horas_extra');
            const estadoPreNomina = this.paramInt('p_nrh_estado_pre_nomina');

            const detalleRubros = await this.getDetalleRubrosByTipoNomina(dtoIn.ide_nrdtn);
            if (detalleRubros.length === 0) {
                throw new BadRequestException(
                    'El tipo de nómina seleccionado no tiene rubros parametrizados (Nómina > Catálogos > Parametría de Rubros)',
                );
            }

            const empleados = await this.getEmpleadosVigentes(dtoIn.ide_nrdtn, dtoIn.fecha_nrrol, dtoIn.ideEmpr);
            if (empleados.length === 0) {
                throw new BadRequestException('No hay empleados vigentes para el tipo de nómina y fecha seleccionados');
            }

            // Ubicar, dentro de la parametría de ESTE tipo de nómina, cuál ide_nrder
            // corresponde al rubro Sueldo y a cada tipo de hora extra (si están configurados).
            const nrderSueldo = rubroSueldoId
                ? detalleRubros.find((d) => d.ide_nrrub === rubroSueldoId)?.ide_nrder
                : undefined;
            const nrderHorasSupl = rubroHorasSuplId
                ? detalleRubros.find((d) => d.ide_nrrub === rubroHorasSuplId)?.ide_nrder
                : undefined;
            const nrderHorasExtra = rubroHorasExtraId
                ? detalleRubros.find((d) => d.ide_nrrub === rubroHorasExtraId)?.ide_nrder
                : undefined;

            const ideNrrol = await this.dataSource.getSeqTable('nrh_rol', 'ide_nrrol', 1, dtoIn.login);

            const listQuery: ObjectQueryDto[] = [
                {
                    operation: 'insert',
                    module: 'nrh',
                    tableName: 'rol',
                    primaryKey: 'ide_nrrol',
                    object: {
                        ide_nrrol: ideNrrol,
                        ide_sucu: dtoIn.ideSucu,
                        ide_usua: dtoIn.ideUsua,
                        ide_gepro: dtoIn.ide_gepro,
                        ide_nrdtn: dtoIn.ide_nrdtn,
                        ide_nresr: estadoPreNomina,
                        fecha_nrrol: dtoIn.fecha_nrrol,
                        activo_nrrol: true,
                        usuario_ingre: dtoIn.login,
                        fecha_ingre: getCurrentDate(),
                        hora_ingre: getCurrentTime(),
                    },
                },
            ];

            const horasConsumidas: number[] = [];

            for (const empleado of empleados) {
                const computedValues = new Map<number, number>();

                if (nrderSueldo !== undefined) {
                    computedValues.set(nrderSueldo, Number(empleado.rmu_geedp) || 0);
                }

                if (nrderHorasSupl !== undefined || nrderHorasExtra !== undefined) {
                    const { supl, extra, ids } = await this.getHorasExtraAprobadas(empleado.ide_geedp, dtoIn.fecha_nrrol);
                    if (nrderHorasSupl !== undefined) computedValues.set(nrderHorasSupl, supl);
                    if (nrderHorasExtra !== undefined) computedValues.set(nrderHorasExtra, extra);
                    horasConsumidas.push(...ids);
                }

                for (const der of detalleRubros) {
                    if (computedValues.has(der.ide_nrder)) continue; // ya inyectado (sueldo/horas)
                    const valor = await this.formulaEngine.evaluarRubro({
                        formula: der.formula_nrder,
                        ideGeedp: empleado.ide_geedp,
                        fechaRol: dtoIn.fecha_nrrol,
                        fechaInicialNrder: der.fecha_inicial_nrder,
                        fechaFinalNrder: der.fecha_final_nrder,
                        computedValues,
                    });
                    computedValues.set(der.ide_nrder, Math.round(valor * 100) / 100);
                }

                for (const der of detalleRubros) {
                    const ideNrdro = await this.dataSource.getSeqTable('nrh_detalle_rol', 'ide_nrdro', 1, dtoIn.login);
                    listQuery.push({
                        operation: 'insert',
                        module: 'nrh',
                        tableName: 'detalle_rol',
                        primaryKey: 'ide_nrdro',
                        object: {
                            ide_nrdro: ideNrdro,
                            ide_nrrol: ideNrrol,
                            ide_nrder: der.ide_nrder,
                            ide_geedp: empleado.ide_geedp,
                            valor_nrdro: computedValues.get(der.ide_nrder) ?? 0,
                            orden_calculo_nrdro: der.orden_nrder,
                            usuario_ingre: dtoIn.login,
                            fecha_ingre: getCurrentDate(),
                            hora_ingre: getCurrentTime(),
                        },
                    });
                }
            }

            await this.core.save({ ...dtoIn, listQuery, audit: true });

            if (horasConsumidas.length > 0) {
                await this.marcarHorasExtraConsumidas(horasConsumidas, ideNrrol);
            }

            return { message: 'ok', ide_nrrol: ideNrrol, empleadosProcesados: empleados.length };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al generar el rol: ${msg}`);
        }
    }

    async aprobar(dtoIn: AprobarRolDto & HeaderParamsDto) {
        const estadoAprobada = this.paramInt('p_nrh_estado_nomina_aprobada');
        if (!estadoAprobada) {
            throw new BadRequestException(
                'El parámetro p_nrh_estado_nomina_aprobada no está configurado (Sistema > Variables)',
            );
        }
        return this.cambiarEstado(dtoIn.ide_nrrol, estadoAprobada, dtoIn);
    }

    async anular(dtoIn: AnularRolDto & HeaderParamsDto) {
        const estadoAnulada = this.paramInt('p_nrh_estado_nomina_anulada');
        if (!estadoAnulada) {
            throw new BadRequestException(
                'El parámetro p_nrh_estado_nomina_anulada no está configurado (Sistema > Variables)',
            );
        }
        return this.cambiarEstado(dtoIn.ide_nrrol, estadoAnulada, dtoIn);
    }

    /**
     * Cierra un rol: genera el asiento contable consolidado (un DEBE por cada cuenta de
     * gasto de rubros de ingreso, un HABER por cada cuenta de pasivo de rubros de
     * descuento, más un HABER por el líquido total a "Sueldos por Pagar"), y crea una
     * cuenta por pagar (cxp_cabece_factur) por empleado con su líquido individual para
     * que tesorería pueda pagarlas. Requiere que cada rubro tenga cuenta contable
     * asignada (Nómina > Catálogos > Rubros > Cuenta Contable).
     */
    async cerrarRol(dtoIn: CerrarRolDto & HeaderParamsDto) {
        if (!dtoIn.ide_nrrol) throw new BadRequestException('El campo ide_nrrol es requerido');

        const ideCntcm = this.paramInt('p_nrh_tipo_comprobante_rol');
        const ideCndpcLiquido = this.paramInt('p_nrh_cuenta_liquido_pagar');
        const estadoCerrada = this.paramInt('p_nrh_estado_nomina_cerrada');
        const estadoFacturaNormal = this.paramInt('p_cxp_estado_factura_normal');
        const lugarDebe = this.variables.get('p_con_lugar_debe') ?? '1';
        const lugarHaber = this.variables.get('p_con_lugar_haber') ?? '0';

        if (!ideCntcm || !ideCndpcLiquido || !estadoCerrada) {
            throw new BadRequestException(
                'Faltan parámetros de sistema: p_nrh_tipo_comprobante_rol, p_nrh_cuenta_liquido_pagar y/o p_nrh_estado_nomina_cerrada (Sistema > Variables)',
            );
        }

        try {
            const rolQuery = new SelectQuery(`
                SELECT ide_nrrol, fecha_nrrol, ide_cnmoc FROM nrh_rol WHERE ide_nrrol = $1 AND ide_sucu = $2
            `);
            rolQuery.setLazy(false);
            rolQuery.addIntParam(1, dtoIn.ide_nrrol);
            rolQuery.addIntParam(2, dtoIn.ideSucu);
            const rolRows = await this.dataSource.createSelectQuery(rolQuery);
            const rol = rolRows?.[0];
            if (!rol) throw new BadRequestException('No se encontró el rol indicado');
            if (rol.ide_cnmoc) throw new BadRequestException('Este rol ya tiene un asiento contable generado');

            const porCuenta = await this.getTotalesPorCuenta(dtoIn.ide_nrrol);
            if (porCuenta.length === 0) {
                throw new BadRequestException(
                    'Ningún rubro de este rol tiene cuenta contable asignada (Nómina > Catálogos > Rubros > Cuenta Contable)',
                );
            }

            let totalIngresos = 0;
            let totalDescuentos = 0;
            const detalles = porCuenta.map((c) => {
                const valor = Math.round(Number(c.total) * 100) / 100;
                if (c.signo_nrtir >= 0) {
                    totalIngresos += valor;
                    return { ide_cnlap: Number(lugarDebe), ide_cndpc: c.ide_cndpc, valor_cndcc: valor };
                }
                totalDescuentos += valor;
                return { ide_cnlap: Number(lugarHaber), ide_cndpc: c.ide_cndpc, valor_cndcc: valor };
            });

            const totalLiquido = Math.round((totalIngresos - totalDescuentos) * 100) / 100;
            if (totalLiquido <= 0) {
                throw new BadRequestException('El total líquido del rol debe ser mayor a cero');
            }
            detalles.push({ ide_cnlap: Number(lugarHaber), ide_cndpc: ideCndpcLiquido, valor_cndcc: totalLiquido });

            const comprobante = await this.comprobanteContabilidad.saveAutomatico({
                ...dtoIn,
                data: {
                    ide_cntcm: ideCntcm,
                    fecha_trans_cnccc: rol.fecha_nrrol,
                    observacion_cnccc: `Rol de pagos #${dtoIn.ide_nrrol}`,
                },
                isUpdate: false,
                detalles,
            });

            const updRol = new UpdateQuery('nrh_rol', 'ide_nrrol');
            updRol.values.set('ide_cnmoc', comprobante.ide_cnccc);
            updRol.values.set('ide_nresr', estadoCerrada);
            updRol.values.set('usuario_actua', dtoIn.login);
            updRol.values.set('fecha_actua', getCurrentDate());
            updRol.values.set('hora_actua', getCurrentTime());
            updRol.where = 'ide_nrrol = $1';
            updRol.addIntParam(1, dtoIn.ide_nrrol);
            await this.dataSource.createQuery(updRol);

            const cxpCreadas = await this.crearCxpPorEmpleado(
                dtoIn.ide_nrrol,
                rol.fecha_nrrol,
                comprobante.ide_cnccc,
                estadoFacturaNormal,
                dtoIn,
            );

            return {
                message: 'ok',
                ide_nrrol: dtoIn.ide_nrrol,
                ide_cnccc: comprobante.ide_cnccc,
                numero_cnccc: comprobante.numero_cnccc,
                totalLiquido,
                cxpCreadas,
            };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al cerrar el rol: ${msg}`);
        }
    }

    private async getTotalesPorCuenta(
        ideNrrol: number,
    ): Promise<Array<{ ide_cndpc: number; signo_nrtir: number; total: number }>> {
        const query = new SelectQuery(`
            SELECT rc.ide_cndpc, tir.signo_nrtir, SUM(dr.valor_nrdro) AS total
            FROM nrh_detalle_rol dr
            INNER JOIN nrh_detalle_rubro der ON der.ide_nrder = dr.ide_nrder
            INNER JOIN nrh_rubro rub ON rub.ide_nrrub = der.ide_nrrub
            INNER JOIN nrh_tipo_rubro tir ON tir.ide_nrtir = rub.ide_nrtir
            INNER JOIN nrh_rubro_cuenta rc ON rc.ide_nrrub = rub.ide_nrrub AND rc.activo_nrrucu = true
            WHERE dr.ide_nrrol = $1
            GROUP BY rc.ide_cndpc, tir.signo_nrtir
        `);
        query.setLazy(false);
        query.addIntParam(1, ideNrrol);
        return this.dataSource.createSelectQuery(query) as Promise<
            Array<{ ide_cndpc: number; signo_nrtir: number; total: number }>
        >;
    }

    private async crearCxpPorEmpleado(
        ideNrrol: number,
        fechaRol: string,
        ideCnccc: number,
        estadoFacturaNormal: number | null,
        dtoIn: HeaderParamsDto,
    ): Promise<number> {
        const query = new SelectQuery(`
            SELECT emp.ide_geper, SUM(dr.valor_nrdro * tir.signo_nrtir) AS liquido
            FROM nrh_detalle_rol dr
            INNER JOIN gen_empleados_departamento_par ged ON ged.ide_geedp = dr.ide_geedp
            INNER JOIN gth_empleado emp ON emp.ide_gtemp = ged.ide_gtemp
            INNER JOIN nrh_detalle_rubro der ON der.ide_nrder = dr.ide_nrder
            INNER JOIN nrh_rubro rub ON rub.ide_nrrub = der.ide_nrrub
            INNER JOIN nrh_tipo_rubro tir ON tir.ide_nrtir = rub.ide_nrtir
            WHERE dr.ide_nrrol = $1
            GROUP BY emp.ide_geper
            HAVING SUM(dr.valor_nrdro * tir.signo_nrtir) > 0
        `);
        query.setLazy(false);
        query.addIntParam(1, ideNrrol);
        const rows = (await this.dataSource.createSelectQuery(query)) as Array<{ ide_geper: number; liquido: number }>;

        const listQuery: ObjectQueryDto[] = [];
        for (const row of rows) {
            const ideCpcfa = await this.dataSource.getSeqTable('cxp_cabece_factur', 'ide_cpcfa', 1, dtoIn.login);
            listQuery.push({
                operation: 'insert',
                module: 'cxp',
                tableName: 'cabece_factur',
                primaryKey: 'ide_cpcfa',
                object: {
                    ide_cpcfa: ideCpcfa,
                    ide_geper: row.ide_geper,
                    ide_sucu: dtoIn.ideSucu,
                    ide_empr: dtoIn.ideEmpr,
                    ide_usua: dtoIn.ideUsua,
                    ide_cnccc: ideCnccc,
                    ide_cpefa: estadoFacturaNormal,
                    fecha_trans_cpcfa: fechaRol,
                    fecha_emisi_cpcfa: fechaRol,
                    numero_cpcfa: `ROL-${ideNrrol}`,
                    total_cpcfa: Math.round(Number(row.liquido) * 100) / 100,
                    observacion_cpcfa: `Líquido a pagar - Rol de pagos #${ideNrrol}`,
                    usuario_ingre: dtoIn.login,
                    fecha_ingre: getCurrentDate(),
                    hora_ingre: getCurrentTime(),
                },
            });
        }

        if (listQuery.length > 0) {
            await this.core.save({ ...dtoIn, listQuery, audit: true });
        }
        return listQuery.length;
    }

    private async cambiarEstado(ideNrrol: number, ideNresr: number, dtoIn: HeaderParamsDto) {
        if (!ideNrrol) throw new BadRequestException('El campo ide_nrrol es requerido');
        const updQuery = new UpdateQuery('nrh_rol', 'ide_nrrol');
        updQuery.values.set('ide_nresr', ideNresr);
        updQuery.values.set('usuario_actua', dtoIn.login);
        updQuery.values.set('fecha_actua', getCurrentDate());
        updQuery.values.set('hora_actua', getCurrentTime());
        updQuery.where = 'ide_nrrol = $1 AND ide_sucu = $2';
        updQuery.addIntParam(1, ideNrrol);
        updQuery.addIntParam(2, dtoIn.ideSucu);
        await this.dataSource.createQuery(updQuery);
        return { message: 'ok', ide_nrrol: ideNrrol, ide_nresr: ideNresr };
    }

    // ─── Privados ──────────────────────────────────────────────────────────

    private async getDetalleRubrosByTipoNomina(ideNrdtn: number): Promise<DetalleRubroRow[]> {
        const query = new SelectQuery(`
            SELECT ide_nrder, ide_nrrub, formula_nrder, orden_nrder, fecha_inicial_nrder, fecha_final_nrder, activo_nrder
            FROM nrh_detalle_rubro
            WHERE ide_nrdtn = $1 AND (activo_nrder IS NULL OR activo_nrder = true)
            ORDER BY COALESCE(orden_nrder, 999999), ide_nrder
        `);
        query.setLazy(false);
        query.addIntParam(1, ideNrdtn);
        return this.dataSource.createSelectQuery(query) as Promise<DetalleRubroRow[]>;
    }

    private async getEmpleadosVigentes(ideNrdtn: number, fecha: string, ideEmpr: number): Promise<EmpleadoVigenteRow[]> {
        const query = new SelectQuery(`
            SELECT
                ged.ide_geedp,
                ged.ide_gtemp,
                ged.rmu_geedp,
                emp.primer_nombre_gtemp || ' ' || emp.apellido_paterno_gtemp AS nombre_empleado
            FROM gen_empleados_departamento_par ged
            INNER JOIN gth_empleado emp ON emp.ide_gtemp = ged.ide_gtemp
            INNER JOIN gen_persona per ON per.ide_geper = emp.ide_geper
            INNER JOIN nrh_detalle_tipo_nomina dtn ON dtn.ide_nrdtn = $1
            WHERE ged.activo_geedp = true
              AND per.ide_empr = $2
              AND ged.fecha_geedp <= $3::date
              AND (ged.fecha_finctr_geedp IS NULL OR ged.fecha_finctr_geedp >= $3::date)
              AND (dtn.ide_gttem IS NULL OR dtn.ide_gttem = ged.ide_gttem)
              AND (dtn.ide_gttco IS NULL OR dtn.ide_gttco = ged.ide_gttco)
              AND (dtn.ide_sucu IS NULL OR dtn.ide_sucu = ged.ide_sucu)
            ORDER BY emp.apellido_paterno_gtemp
        `);
        query.setLazy(false);
        query.addIntParam(1, ideNrdtn);
        query.addIntParam(2, ideEmpr);
        query.addStringParam(3, fecha);
        return this.dataSource.createSelectQuery(query) as Promise<EmpleadoVigenteRow[]>;
    }

    /**
     * Horas extra aprobadas (con tipo ya decidido por quien aprobó, ver
     * HorasExtraService.aprobar) y no consumidas por otro rol todavía, separadas por
     * suplementaria (50%) / extraordinaria (100%).
     */
    private async getHorasExtraAprobadas(
        ideGeedp: number,
        fechaRol: string,
    ): Promise<{ supl: number; extra: number; ids: number[] }> {
        const inicioMes = fechaRol.slice(0, 8) + '01';
        const query = new SelectQuery(`
            SELECT ide_nrhec, horas_detectadas_nrhec, tipo_nrhec
            FROM nrh_hora_extra_candidata
            WHERE ide_geedp = $1
              AND estado_nrhec = 'aprobada'
              AND ide_nrrol IS NULL
              AND fecha_nrhec BETWEEN $2 AND $3
        `);
        query.setLazy(false);
        query.addIntParam(1, ideGeedp);
        query.addStringParam(2, inicioMes);
        query.addStringParam(3, fechaRol);
        const rows = (await this.dataSource.createSelectQuery(query)) as Array<{
            ide_nrhec: number;
            horas_detectadas_nrhec: number;
            tipo_nrhec: string | null;
        }>;
        const supl = rows
            .filter((r) => r.tipo_nrhec === 'suplementaria')
            .reduce((acc, r) => acc + Number(r.horas_detectadas_nrhec || 0), 0);
        const extra = rows
            .filter((r) => r.tipo_nrhec === 'extraordinaria')
            .reduce((acc, r) => acc + Number(r.horas_detectadas_nrhec || 0), 0);
        return { supl, extra, ids: rows.map((r) => r.ide_nrhec) };
    }

    private async marcarHorasExtraConsumidas(ids: number[], ideNrrol: number): Promise<void> {
        const updQuery = new UpdateQuery('nrh_hora_extra_candidata', 'ide_nrhec');
        updQuery.values.set('ide_nrrol', ideNrrol);
        updQuery.where = 'ide_nrhec = ANY ($1)';
        updQuery.addParam(1, ids);
        await this.dataSource.createQuery(updQuery);
    }
}
