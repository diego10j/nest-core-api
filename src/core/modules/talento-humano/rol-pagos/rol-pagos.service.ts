import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { ComprobanteContabilidadService } from 'src/core/modules/contabilidad/comprobante-contabilidad/comprobante-contabilidad.service';
import { CalculoLegalService } from 'src/core/modules/talento-humano/calculo-legal/calculo-legal.service';
import { FormulaEngineService } from 'src/core/modules/talento-humano/formula-engine/formula-engine.service';
import { getCurrentDate, getCurrentTime } from 'src/util/helpers/date-util';

import {
    AnularRolDto,
    AprobarRolDto,
    CerrarRolDto,
    GenerarLiquidacionDecimoDto,
    GenerarRolDto,
    GetRolByIdDto,
    GetRolesDto,
} from './dto/rol-pagos.dto';

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
        private readonly calculoLegal: CalculoLegalService,
    ) {
        super();
        this.core
            .getVariables([
                'p_nrh_rubro_sueldo',
                'p_nrh_rubro_horas_supl',
                'p_nrh_rubro_horas_extra',
                'p_nrh_rubro_horas_nocturna',
                'p_nrh_parametro_horas_extra',
                'p_nrh_sbu_vigente',
                'p_nrh_rubro_decimo_tercero',
                'p_nrh_rubro_decimo_cuarto',
                'p_nrh_rubro_fondos_reserva',
                'p_nrh_cuenta_pasivo_fondos_reserva',
                'p_nrh_cuenta_pasivo_decimo_tercero',
                'p_nrh_cuenta_pasivo_decimo_cuarto',
                'p_nrh_cuenta_gasto_venta_fondos_reserva',
                'p_nrh_cuenta_gasto_venta_decimo_tercero',
                'p_nrh_cuenta_gasto_venta_decimo_cuarto',
                'p_nrh_cuenta_gasto_admin_fondos_reserva',
                'p_nrh_cuenta_gasto_admin_decimo_tercero',
                'p_nrh_cuenta_gasto_admin_decimo_cuarto',
                'p_nrh_region_decimo4',
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

    private paramFloat(name: string, fallback: number): number {
        const raw = this.variables.get(name);
        if (!raw) return fallback;
        const n = Number(raw);
        return Number.isFinite(n) ? n : fallback;
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
                    -- El líquido es la suma del rubro "TOTAL A RECIBIR" (ya calculado por la
                    -- fórmula, neto real por empleado) — NO sumar todos los rubros: la mayoría
                    -- son informativos (subtotales, provisiones, bases imponibles) que
                    -- duplicarían valores ya contados en REMUNERACION UNIFICADA.
                    (SELECT COALESCE(SUM(dr.valor_nrdro), 0) FROM nrh_detalle_rol dr
                       INNER JOIN nrh_detalle_rubro der ON der.ide_nrder = dr.ide_nrder
                       INNER JOIN nrh_rubro rub ON rub.ide_nrrub = der.ide_nrrub
                      WHERE dr.ide_nrrol = r.ide_nrrol AND rub.detalle_nrrub = 'TOTAL A RECIBIR') AS total_liquido
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
            const rubroHorasNocturnaId = this.paramInt('p_nrh_rubro_horas_nocturna');
            const rubroDecimoTerceroId = this.paramInt('p_nrh_rubro_decimo_tercero');
            const rubroDecimoCuartoId = this.paramInt('p_nrh_rubro_decimo_cuarto');
            const rubroFondosReservaId = this.paramInt('p_nrh_rubro_fondos_reserva');
            const parametroHorasExtra = this.paramFloat('p_nrh_parametro_horas_extra', 240);
            const sbuVigente = this.paramFloat('p_nrh_sbu_vigente', 0);
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
            // corresponde a cada rubro de cálculo legal fijo (sueldo, horas extra,
            // décimos, fondos de reserva) — si están configurados. Estos NO se evalúan
            // por fórmula (ver CalculoLegalService): se calculan en código y se inyectan
            // directo, igual que ya se hacía con sueldo.
            const nrderSueldo = rubroSueldoId
                ? detalleRubros.find((d) => d.ide_nrrub === rubroSueldoId)?.ide_nrder
                : undefined;
            const nrderHorasSupl = rubroHorasSuplId
                ? detalleRubros.find((d) => d.ide_nrrub === rubroHorasSuplId)?.ide_nrder
                : undefined;
            const nrderHorasExtra = rubroHorasExtraId
                ? detalleRubros.find((d) => d.ide_nrrub === rubroHorasExtraId)?.ide_nrder
                : undefined;
            const nrderHorasNocturna = rubroHorasNocturnaId
                ? detalleRubros.find((d) => d.ide_nrrub === rubroHorasNocturnaId)?.ide_nrder
                : undefined;
            const nrderDecimoTercero = rubroDecimoTerceroId
                ? detalleRubros.find((d) => d.ide_nrrub === rubroDecimoTerceroId)?.ide_nrder
                : undefined;
            const nrderDecimoCuarto = rubroDecimoCuartoId
                ? detalleRubros.find((d) => d.ide_nrrub === rubroDecimoCuartoId)?.ide_nrder
                : undefined;
            const nrderFondosReserva = rubroFondosReservaId
                ? detalleRubros.find((d) => d.ide_nrrub === rubroFondosReservaId)?.ide_nrder
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
            const mensualizacionVigente = await this.getMensualizacionVigente(
                empleados.map((e) => e.ide_geedp),
                dtoIn.fecha_nrrol,
            );

            for (const empleado of empleados) {
                const computedValues = new Map<number, number>();
                const sueldo = Number(empleado.rmu_geedp) || 0;

                if (nrderSueldo !== undefined) {
                    computedValues.set(nrderSueldo, sueldo);
                }

                let valorHorasSupl = 0;
                let valorHorasExtra = 0;
                let valorHorasNocturna = 0;
                if (nrderHorasSupl !== undefined || nrderHorasExtra !== undefined || nrderHorasNocturna !== undefined) {
                    const { supl, extra, nocturna, ids } = await this.getHorasExtraAprobadas(empleado.ide_geedp, dtoIn.fecha_nrrol);
                    const valores = this.calculoLegal.calcularHorasExtra(sueldo, supl, extra, nocturna, parametroHorasExtra);
                    valorHorasSupl = valores.valorSuplementaria;
                    valorHorasExtra = valores.valorExtraordinaria;
                    valorHorasNocturna = valores.valorNocturna;
                    if (nrderHorasSupl !== undefined) computedValues.set(nrderHorasSupl, valorHorasSupl);
                    if (nrderHorasExtra !== undefined) computedValues.set(nrderHorasExtra, valorHorasExtra);
                    if (nrderHorasNocturna !== undefined) computedValues.set(nrderHorasNocturna, valorHorasNocturna);
                    horasConsumidas.push(...ids);
                }

                // Ingreso gravable mensual (sueldo + horas extra) — base de fondos de
                // reserva y décimo tercero. No incluye "otros ingresos" (no modelado aún).
                const ingresoGravable = sueldo + valorHorasSupl + valorHorasExtra + valorHorasNocturna;

                // Décimos y fondos de reserva SIEMPRE se calculan y se guardan (acumule o
                // mensualice el empleado) — es la provisión contable del mes, el pasivo ya
                // se debe aunque no se pague en efectivo todavía. Si el empleado mensualiza,
                // crearCxpPorEmpleado (en cerrarRol) además lo incluye en su líquido a
                // recibir; si acumula, solo queda en nrh_detalle_rol para que
                // generarProvisionDecimosFondos arme el asiento de provisión del mes.
                if (nrderDecimoTercero !== undefined) {
                    computedValues.set(nrderDecimoTercero, this.calculoLegal.calcularDecimoTercero(ingresoGravable));
                }
                if (nrderDecimoCuarto !== undefined) {
                    computedValues.set(nrderDecimoCuarto, this.calculoLegal.calcularDecimoCuarto(sbuVigente));
                }
                if (nrderFondosReserva !== undefined) {
                    computedValues.set(nrderFondosReserva, this.calculoLegal.calcularFondosReserva(ingresoGravable));
                }

                for (const der of detalleRubros) {
                    if (computedValues.has(der.ide_nrder)) continue; // ya inyectado (sueldo/horas)
                    const mensualizado = mensualizacionVigente.get(`${empleado.ide_geedp}:${der.ide_nrrub}`) ?? false;
                    const valor = await this.formulaEngine.evaluarRubro({
                        formula: der.formula_nrder,
                        ideGeedp: empleado.ide_geedp,
                        fechaRol: dtoIn.fecha_nrrol,
                        fechaInicialNrder: der.fecha_inicial_nrder,
                        fechaFinalNrder: der.fecha_final_nrder,
                        computedValues,
                        mensualizado,
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

            const provisionesRegistradas = await this.generarProvisionDecimosFondos(
                dtoIn.ide_nrrol,
                rol.fecha_nrrol,
                dtoIn,
            );

            return {
                message: 'ok',
                ide_nrrol: dtoIn.ide_nrrol,
                ide_cnccc: comprobante.ide_cnccc,
                numero_cnccc: comprobante.numero_cnccc,
                totalLiquido,
                cxpCreadas,
                provisiones: provisionesRegistradas,
            };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al cerrar el rol: ${msg}`);
        }
    }

    /**
     * Liquidación anual de décimo tercero o décimo cuarto: suma las provisiones
     * mensuales acumuladas (nrh_detalle_rol) en la ventana legal del período (dic-nov
     * para décimo 3°; ago-jul Sierra o mar-feb Costa para décimo 4°, ver
     * p_nrh_region_decimo4), excluyendo los meses en los que el empleado ya mensualizó
     * ese rubro (ya se le pagó con el rol normal, no se le debe otra vez). Genera un
     * nrh_rol nuevo (tipo "Nómina Pago Décimos"), su asiento contable — DEBE a la cuenta
     * de pasivo (cancela la deuda acumulada, ver p_nrh_cuenta_pasivo_decimo_*) / HABER a
     * "Sueldos por Pagar" — y una CxP por empleado con el monto a pagar, reutilizando el
     * mismo mecanismo de con_cab_comp_cont/cxp_cabece_factur que cerrarRol.
     *
     * Al ser la SUMA de lo realmente provisionado mes a mes, un empleado que ingresó a
     * mitad de período queda prorrateado automáticamente (solo tiene provisión en los
     * meses que trabajó) — no hace falta un cálculo de prorrateo aparte.
     */
    async generarLiquidacionDecimo(dtoIn: GenerarLiquidacionDecimoDto & HeaderParamsDto) {
        const esDecimoTercero = dtoIn.concepto === 'decimo_tercero';
        const rubroId = this.paramInt(esDecimoTercero ? 'p_nrh_rubro_decimo_tercero' : 'p_nrh_rubro_decimo_cuarto');
        const cuentaPasivo = this.paramInt(
            esDecimoTercero ? 'p_nrh_cuenta_pasivo_decimo_tercero' : 'p_nrh_cuenta_pasivo_decimo_cuarto',
        );
        const ideCndpcLiquido = this.paramInt('p_nrh_cuenta_liquido_pagar');
        const ideCntcm = this.paramInt('p_nrh_tipo_comprobante_rol');
        const estadoCerrada = this.paramInt('p_nrh_estado_nomina_cerrada');
        const estadoFacturaNormal = this.paramInt('p_cxp_estado_factura_normal');

        if (!rubroId || !cuentaPasivo || !ideCndpcLiquido || !ideCntcm || !estadoCerrada) {
            throw new BadRequestException(
                'Faltan parámetros de sistema para la liquidación de décimos (Sistema > Variables, módulo Nómina)',
            );
        }

        try {
            const [desde, hasta] = this.calcularVentanaLiquidacion(dtoIn.concepto, dtoIn.anio);

            const detalleRubros = await this.getDetalleRubrosByTipoNomina(dtoIn.ide_nrdtn);
            const nrder = detalleRubros.find((d) => d.ide_nrrub === rubroId)?.ide_nrder;
            if (!nrder) {
                throw new BadRequestException(
                    'El tipo de nómina de liquidación no tiene configurado el rubro correspondiente ' +
                    '(Nómina > Catálogos > Parametría de Rubros)',
                );
            }

            const provisiones = await this.getProvisionesEnVentana(rubroId, desde, hasta);
            if (provisiones.length === 0) {
                throw new BadRequestException(`No hay provisiones registradas entre ${desde} y ${hasta} para liquidar`);
            }

            const historial = await this.getHistorialMensualizacion([...new Set(provisiones.map((p) => p.ide_geedp))]);
            const porEmpleado = new Map<number, number>();
            for (const p of provisiones) {
                const mensualizado = this.resolverMensualizado(historial, p.ide_geedp, rubroId, p.fecha_nrrol);
                if (mensualizado) continue; // ya se pagó ese mes en el rol normal
                porEmpleado.set(p.ide_geedp, (porEmpleado.get(p.ide_geedp) ?? 0) + (Number(p.valor) || 0));
            }
            const entradas = [...porEmpleado.entries()]
                .map(([ideGeedp, valor]) => [ideGeedp, Math.round(valor * 100) / 100] as [number, number])
                .filter(([, valor]) => valor > 0);

            if (entradas.length === 0) {
                return { message: 'ok', ide_nrrol: null, empleadosLiquidados: 0, totalLiquidado: 0 };
            }

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
                        ide_nresr: estadoCerrada,
                        fecha_nrrol: hasta,
                        activo_nrrol: true,
                        usuario_ingre: dtoIn.login,
                        fecha_ingre: getCurrentDate(),
                        hora_ingre: getCurrentTime(),
                    },
                },
            ];

            let totalLiquidado = 0;
            for (const [ideGeedp, valor] of entradas) {
                totalLiquidado += valor;
                const ideNrdro = await this.dataSource.getSeqTable('nrh_detalle_rol', 'ide_nrdro', 1, dtoIn.login);
                listQuery.push({
                    operation: 'insert',
                    module: 'nrh',
                    tableName: 'detalle_rol',
                    primaryKey: 'ide_nrdro',
                    object: {
                        ide_nrdro: ideNrdro,
                        ide_nrrol: ideNrrol,
                        ide_nrder: nrder,
                        ide_geedp: ideGeedp,
                        valor_nrdro: valor,
                        usuario_ingre: dtoIn.login,
                        fecha_ingre: getCurrentDate(),
                        hora_ingre: getCurrentTime(),
                    },
                });
            }
            totalLiquidado = Math.round(totalLiquidado * 100) / 100;

            await this.core.save({ ...dtoIn, listQuery, audit: true });

            const lugarDebe = Number(this.variables.get('p_con_lugar_debe') ?? '1');
            const lugarHaber = Number(this.variables.get('p_con_lugar_haber') ?? '0');
            const comprobante = await this.comprobanteContabilidad.saveAutomatico({
                ...dtoIn,
                data: {
                    ide_cntcm: ideCntcm,
                    fecha_trans_cnccc: hasta,
                    observacion_cnccc:
                        `Liquidación anual ${esDecimoTercero ? 'Décimo Tercero' : 'Décimo Cuarto'} ` +
                        `${dtoIn.anio} - Rol #${ideNrrol}`,
                },
                isUpdate: false,
                detalles: [
                    { ide_cnlap: lugarDebe, ide_cndpc: cuentaPasivo, valor_cndcc: totalLiquidado },
                    { ide_cnlap: lugarHaber, ide_cndpc: ideCndpcLiquido, valor_cndcc: totalLiquidado },
                ],
            });

            const updRol = new UpdateQuery('nrh_rol', 'ide_nrrol');
            updRol.values.set('ide_cnmoc', comprobante.ide_cnccc);
            updRol.where = 'ide_nrrol = $1';
            updRol.addIntParam(1, ideNrrol);
            await this.dataSource.createQuery(updRol);

            const cxpCreadas = await this.crearCxpLiquidacionDecimo(
                entradas,
                hasta,
                comprobante.ide_cnccc,
                estadoFacturaNormal,
                esDecimoTercero,
                dtoIn,
            );

            return {
                message: 'ok',
                ide_nrrol: ideNrrol,
                ide_cnccc: comprobante.ide_cnccc,
                numero_cnccc: comprobante.numero_cnccc,
                empleadosLiquidados: entradas.length,
                totalLiquidado,
                cxpCreadas,
            };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al generar la liquidación: ${msg}`);
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

    /**
     * Décimos y fondos de reserva se calculan y se guardan en nrh_detalle_rol TODOS los
     * meses (ver generarRol), pero solo deben pagarse en efectivo al empleado este rol
     * si tiene la modalidad "mensualizado" vigente para ese rubro — si acumula, el valor
     * ya quedó registrado para el asiento de provisión (generarProvisionDecimosFondos) y
     * NO debe sumarse a lo que se le paga este mes.
     */
    private async crearCxpPorEmpleado(
        ideNrrol: number,
        fechaRol: string,
        ideCnccc: number,
        estadoFacturaNormal: number | null,
        dtoIn: HeaderParamsDto,
    ): Promise<number> {
        const rubrosProvision = [
            this.paramInt('p_nrh_rubro_decimo_tercero'),
            this.paramInt('p_nrh_rubro_decimo_cuarto'),
            this.paramInt('p_nrh_rubro_fondos_reserva'),
        ].filter((v): v is number => v !== null);

        const queryNormal = new SelectQuery(`
            SELECT emp.ide_geper, SUM(dr.valor_nrdro * tir.signo_nrtir) AS liquido
            FROM nrh_detalle_rol dr
            INNER JOIN gen_empleados_departamento_par ged ON ged.ide_geedp = dr.ide_geedp
            INNER JOIN gth_empleado emp ON emp.ide_gtemp = ged.ide_gtemp
            INNER JOIN nrh_detalle_rubro der ON der.ide_nrder = dr.ide_nrder
            INNER JOIN nrh_rubro rub ON rub.ide_nrrub = der.ide_nrrub
            INNER JOIN nrh_tipo_rubro tir ON tir.ide_nrtir = rub.ide_nrtir
            WHERE dr.ide_nrrol = $1 AND rub.ide_nrrub != ALL ($2)
            GROUP BY emp.ide_geper
        `);
        queryNormal.setLazy(false);
        queryNormal.addIntParam(1, ideNrrol);
        queryNormal.addParam(2, rubrosProvision);
        const rowsNormal = (await this.dataSource.createSelectQuery(queryNormal)) as Array<{
            ide_geper: number;
            liquido: number;
        }>;

        const liquidoPorGeper = new Map<number, number>();
        for (const row of rowsNormal) {
            liquidoPorGeper.set(row.ide_geper, Number(row.liquido) || 0);
        }

        if (rubrosProvision.length > 0) {
            const queryProvision = new SelectQuery(`
                SELECT emp.ide_geper, dr.ide_geedp, rub.ide_nrrub, dr.valor_nrdro * tir.signo_nrtir AS valor
                FROM nrh_detalle_rol dr
                INNER JOIN gen_empleados_departamento_par ged ON ged.ide_geedp = dr.ide_geedp
                INNER JOIN gth_empleado emp ON emp.ide_gtemp = ged.ide_gtemp
                INNER JOIN nrh_detalle_rubro der ON der.ide_nrder = dr.ide_nrder
                INNER JOIN nrh_rubro rub ON rub.ide_nrrub = der.ide_nrrub
                INNER JOIN nrh_tipo_rubro tir ON tir.ide_nrtir = rub.ide_nrtir
                WHERE dr.ide_nrrol = $1 AND rub.ide_nrrub = ANY ($2)
            `);
            queryProvision.setLazy(false);
            queryProvision.addIntParam(1, ideNrrol);
            queryProvision.addParam(2, rubrosProvision);
            const rowsProvision = (await this.dataSource.createSelectQuery(queryProvision)) as Array<{
                ide_geper: number;
                ide_geedp: number;
                ide_nrrub: number;
                valor: number;
            }>;

            const mensualizacionVigente = await this.getMensualizacionVigente(
                [...new Set(rowsProvision.map((r) => r.ide_geedp))],
                fechaRol,
            );
            for (const row of rowsProvision) {
                const mensualizado = mensualizacionVigente.get(`${row.ide_geedp}:${row.ide_nrrub}`) ?? false;
                if (!mensualizado) continue; // acumula: no se paga este rol, solo se provisiona
                const previo = liquidoPorGeper.get(row.ide_geper) ?? 0;
                liquidoPorGeper.set(row.ide_geper, previo + (Number(row.valor) || 0));
            }
        }

        const rows = [...liquidoPorGeper.entries()]
            .map(([ide_geper, liquido]) => ({ ide_geper, liquido }))
            .filter((r) => r.liquido > 0);

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

    /**
     * Asiento de provisión mensual de décimo tercero, décimo cuarto y fondos de reserva
     * — replica el asiento "REGISTRO ROL DE PROVISIONES <mes>" que hoy registra la
     * contadora a mano (verificado contra con_det_comp_cont real de DIQUIMEC): por cada
     * concepto, UN HABER al pasivo por el total de todos los empleados que acumulan (no
     * mensualizan), partido en DEBE de gasto Ventas/Administrativo según el departamento
     * de cada empleado (gen_departamento.tipo_gasto_gedep). Los empleados mensualizados
     * NO entran acá — su décimo/fondos ya se pagó en el rol normal (ver
     * crearCxpPorEmpleado); si además se quiere contabilizar su gasto automáticamente,
     * hay que mapear su rubro en Nómina > Catálogos > Rubros > Cuenta Contable (no lo
     * hace este método, para no duplicar el asiento).
     *
     * Separado del asiento normal del rol (nrh_rol.ide_cnmoc) — se guarda en
     * nrh_rol.ide_cnmoc_provisiones, mismo patrón que ide_cnccc_provisiones tenía el
     * sistema anterior del usuario (reh_cab_rol_pago).
     */
    private async generarProvisionDecimosFondos(
        ideNrrol: number,
        fechaRol: string,
        dtoIn: HeaderParamsDto,
    ): Promise<{ ide_cnmoc_provisiones: number | null; totalProvisionado: number }> {
        const conceptos: Array<{
            rubro: number | null;
            pasivo: number | null;
            gastoVenta: number | null;
            gastoAdmin: number | null;
        }> = [
            {
                rubro: this.paramInt('p_nrh_rubro_fondos_reserva'),
                pasivo: this.paramInt('p_nrh_cuenta_pasivo_fondos_reserva'),
                gastoVenta: this.paramInt('p_nrh_cuenta_gasto_venta_fondos_reserva'),
                gastoAdmin: this.paramInt('p_nrh_cuenta_gasto_admin_fondos_reserva'),
            },
            {
                rubro: this.paramInt('p_nrh_rubro_decimo_tercero'),
                pasivo: this.paramInt('p_nrh_cuenta_pasivo_decimo_tercero'),
                gastoVenta: this.paramInt('p_nrh_cuenta_gasto_venta_decimo_tercero'),
                gastoAdmin: this.paramInt('p_nrh_cuenta_gasto_admin_decimo_tercero'),
            },
            {
                rubro: this.paramInt('p_nrh_rubro_decimo_cuarto'),
                pasivo: this.paramInt('p_nrh_cuenta_pasivo_decimo_cuarto'),
                gastoVenta: this.paramInt('p_nrh_cuenta_gasto_venta_decimo_cuarto'),
                gastoAdmin: this.paramInt('p_nrh_cuenta_gasto_admin_decimo_cuarto'),
            },
        ];

        const rubrosConfigurados = conceptos.filter(
            (c) => c.rubro !== null && c.pasivo !== null && c.gastoVenta !== null && c.gastoAdmin !== null,
        );
        if (rubrosConfigurados.length === 0) return { ide_cnmoc_provisiones: null, totalProvisionado: 0 };

        const rubroIds = rubrosConfigurados.map((c) => c.rubro as number);
        const query = new SelectQuery(`
            SELECT
                dr.ide_geedp,
                rub.ide_nrrub,
                dr.valor_nrdro AS valor,
                dep.tipo_gasto_gedep
            FROM nrh_detalle_rol dr
            INNER JOIN nrh_detalle_rubro der ON der.ide_nrder = dr.ide_nrder
            INNER JOIN nrh_rubro rub ON rub.ide_nrrub = der.ide_nrrub
            INNER JOIN gen_empleados_departamento_par ged ON ged.ide_geedp = dr.ide_geedp
            LEFT JOIN gen_departamento dep ON dep.ide_gedep = ged.ide_gedep
            WHERE dr.ide_nrrol = $1 AND rub.ide_nrrub = ANY ($2) AND dr.valor_nrdro > 0
        `);
        query.setLazy(false);
        query.addIntParam(1, ideNrrol);
        query.addParam(2, rubroIds);
        const rows = (await this.dataSource.createSelectQuery(query)) as Array<{
            ide_geedp: number;
            ide_nrrub: number;
            valor: number;
            tipo_gasto_gedep: string | null;
        }>;
        if (rows.length === 0) return { ide_cnmoc_provisiones: null, totalProvisionado: 0 };

        const mensualizacionVigente = await this.getMensualizacionVigente(
            [...new Set(rows.map((r) => r.ide_geedp))],
            fechaRol,
        );

        const departamentosSinClasificar = new Set<number>();
        const detalles: Array<{ ide_cnlap: number; ide_cndpc: number; valor_cndcc: number }> = [];
        const lugarDebe = Number(this.variables.get('p_con_lugar_debe') ?? '1');
        const lugarHaber = Number(this.variables.get('p_con_lugar_haber') ?? '0');
        let totalProvisionado = 0;

        for (const concepto of rubrosConfigurados) {
            let totalPasivo = 0;
            let totalVenta = 0;
            let totalAdmin = 0;

            for (const row of rows) {
                if (row.ide_nrrub !== concepto.rubro) continue;
                const mensualizado = mensualizacionVigente.get(`${row.ide_geedp}:${row.ide_nrrub}`) ?? false;
                if (mensualizado) continue; // ya se pagó en el rol normal, no se provisiona

                const valor = Number(row.valor) || 0;
                totalPasivo += valor;
                if (row.tipo_gasto_gedep === 'venta') totalVenta += valor;
                else if (row.tipo_gasto_gedep === 'administrativo') totalAdmin += valor;
                else departamentosSinClasificar.add(row.ide_geedp);
            }

            if (totalPasivo <= 0) continue;
            totalPasivo = Math.round(totalPasivo * 100) / 100;
            totalVenta = Math.round(totalVenta * 100) / 100;
            totalAdmin = Math.round(totalAdmin * 100) / 100;
            // Ajuste de redondeo: lo que no cayó en venta/admin (departamento sin
            // clasificar) se manda a administrativo, para que el asiento siempre cuadre.
            const diferencia = Math.round((totalPasivo - totalVenta - totalAdmin) * 100) / 100;
            if (diferencia !== 0) totalAdmin = Math.round((totalAdmin + diferencia) * 100) / 100;

            detalles.push({ ide_cnlap: lugarHaber, ide_cndpc: concepto.pasivo as number, valor_cndcc: totalPasivo });
            if (totalVenta > 0) {
                detalles.push({ ide_cnlap: lugarDebe, ide_cndpc: concepto.gastoVenta as number, valor_cndcc: totalVenta });
            }
            if (totalAdmin > 0) {
                detalles.push({ ide_cnlap: lugarDebe, ide_cndpc: concepto.gastoAdmin as number, valor_cndcc: totalAdmin });
            }
            totalProvisionado += totalPasivo;
        }

        if (departamentosSinClasificar.size > 0) {
            throw new BadRequestException(
                'Hay empleados cuyo departamento no está clasificado como Ventas o Administrativo ' +
                '(Nómina > Catálogos > Departamentos) — clasifícalos antes de generar la provisión.',
            );
        }

        if (detalles.length === 0) return { ide_cnmoc_provisiones: null, totalProvisionado: 0 };

        const ideCntcm = this.paramInt('p_nrh_tipo_comprobante_rol');
        const comprobante = await this.comprobanteContabilidad.saveAutomatico({
            ...dtoIn,
            data: {
                ide_cntcm: ideCntcm,
                fecha_trans_cnccc: fechaRol,
                observacion_cnccc: `Provisión décimos y fondos de reserva - Rol de pagos #${ideNrrol}`,
            },
            isUpdate: false,
            detalles,
        });

        const updRol = new UpdateQuery('nrh_rol', 'ide_nrrol');
        updRol.values.set('ide_cnmoc_provisiones', comprobante.ide_cnccc);
        updRol.where = 'ide_nrrol = $1';
        updRol.addIntParam(1, ideNrrol);
        await this.dataSource.createQuery(updRol);

        return { ide_cnmoc_provisiones: comprobante.ide_cnccc, totalProvisionado: Math.round(totalProvisionado * 100) / 100 };
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

    /**
     * Modalidad (mensualizado/acumula) vigente A LA FECHA DEL ROL para cada
     * (empleado, rubro) con solicitud registrada en nrh_solicitud_mensualizacion —
     * no simplemente "la fila activa hoy", para que un rol generado con fecha pasada
     * resuelva la modalidad que aplicaba en ese momento si el empleado cambió de
     * modalidad después. Batch por todos los empleados del rol en una sola consulta
     * (evita N+1 dentro del loop de generarRol). Sin solicitud registrada, el default
     * es "acumula" (false) — igual que el default legal y el DEFAULT de la columna.
     */
    private async getMensualizacionVigente(
        geedpIds: number[],
        fechaRol: string,
    ): Promise<Map<string, boolean>> {
        const resultado = new Map<string, boolean>();
        if (geedpIds.length === 0) return resultado;

        const query = new SelectQuery(`
            SELECT ide_geedp, ide_nrrub, mensualizado_nrsom, fecha_solicitud_nrsom
            FROM nrh_solicitud_mensualizacion
            WHERE ide_geedp = ANY ($1) AND fecha_solicitud_nrsom <= $2
            ORDER BY ide_geedp, ide_nrrub, fecha_solicitud_nrsom ASC
        `);
        query.setLazy(false);
        query.addParam(1, geedpIds);
        query.addStringParam(2, fechaRol);
        const rows = (await this.dataSource.createSelectQuery(query)) as Array<{
            ide_geedp: number;
            ide_nrrub: number;
            mensualizado_nrsom: boolean;
        }>;

        // Filas ordenadas ascendente por fecha: la última que sobrescribe cada clave
        // es la más reciente <= fechaRol, o sea la vigente a esa fecha.
        for (const row of rows) {
            resultado.set(`${row.ide_geedp}:${row.ide_nrrub}`, !!row.mensualizado_nrsom);
        }
        return resultado;
    }

    /**
     * Ventana legal [desde, hasta] para la liquidación anual de un concepto y año.
     * Décimo tercero: fijo dic(año-1) a nov(año) — no varía por región. Décimo cuarto:
     * Sierra/Amazonía ago(año-1)-jul(año); Costa/Insular mar(año)-feb(año) — según
     * p_nrh_region_decimo4. Simplificación: no ajusta 28/29 de febrero en años bisiestos
     * por región Costa (día menos de holgura, sin impacto real en el cálculo).
     */
    private calcularVentanaLiquidacion(concepto: 'decimo_tercero' | 'decimo_cuarto', anio: number): [string, string] {
        if (concepto === 'decimo_tercero') {
            return [`${anio - 1}-12-01`, `${anio}-11-30`];
        }
        const region = (this.variables.get('p_nrh_region_decimo4') ?? 'sierra').trim().toLowerCase();
        if (region === 'costa') {
            return [`${anio}-03-01`, `${anio + 1}-02-28`];
        }
        return [`${anio - 1}-08-01`, `${anio}-07-31`];
    }

    /** Provisiones mensuales (nrh_detalle_rol.valor_nrdro) de un rubro dentro de una ventana de fechas, por empleado y rol. */
    private async getProvisionesEnVentana(
        ideNrrub: number,
        desde: string,
        hasta: string,
    ): Promise<Array<{ ide_geedp: number; valor: number; fecha_nrrol: string }>> {
        const query = new SelectQuery(`
            SELECT dr.ide_geedp, dr.valor_nrdro AS valor, r.fecha_nrrol::text AS fecha_nrrol
            FROM nrh_detalle_rol dr
            INNER JOIN nrh_rol r ON r.ide_nrrol = dr.ide_nrrol AND r.activo_nrrol = true
            INNER JOIN nrh_detalle_rubro der ON der.ide_nrder = dr.ide_nrder
            WHERE der.ide_nrrub = $1 AND r.fecha_nrrol BETWEEN $2 AND $3
        `);
        query.setLazy(false);
        query.addIntParam(1, ideNrrub);
        query.addStringParam(2, desde);
        query.addStringParam(3, hasta);
        return this.dataSource.createSelectQuery(query) as Promise<
            Array<{ ide_geedp: number; valor: number; fecha_nrrol: string }>
        >;
    }

    /** Historial completo (no solo la vigente) de mensualización por (empleado, rubro), ordenado por fecha ascendente. */
    private async getHistorialMensualizacion(
        geedpIds: number[],
    ): Promise<Map<string, Array<{ fecha: string; mensualizado: boolean }>>> {
        const resultado = new Map<string, Array<{ fecha: string; mensualizado: boolean }>>();
        if (geedpIds.length === 0) return resultado;

        const query = new SelectQuery(`
            SELECT ide_geedp, ide_nrrub, mensualizado_nrsom, fecha_solicitud_nrsom::text AS fecha_solicitud_nrsom
            FROM nrh_solicitud_mensualizacion
            WHERE ide_geedp = ANY ($1)
            ORDER BY ide_geedp, ide_nrrub, fecha_solicitud_nrsom ASC
        `);
        query.setLazy(false);
        query.addParam(1, geedpIds);
        const rows = (await this.dataSource.createSelectQuery(query)) as Array<{
            ide_geedp: number;
            ide_nrrub: number;
            mensualizado_nrsom: boolean;
            fecha_solicitud_nrsom: string;
        }>;
        for (const row of rows) {
            const key = `${row.ide_geedp}:${row.ide_nrrub}`;
            if (!resultado.has(key)) resultado.set(key, []);
            resultado.get(key)!.push({ fecha: row.fecha_solicitud_nrsom, mensualizado: !!row.mensualizado_nrsom });
        }
        return resultado;
    }

    /** Resuelve la modalidad vigente a una fecha específica a partir del historial completo. */
    private resolverMensualizado(
        historial: Map<string, Array<{ fecha: string; mensualizado: boolean }>>,
        ideGeedp: number,
        ideNrrub: number,
        fecha: string,
    ): boolean {
        const hist = historial.get(`${ideGeedp}:${ideNrrub}`);
        if (!hist) return false;
        let resultado = false;
        for (const h of hist) {
            if (h.fecha <= fecha) resultado = h.mensualizado;
            else break;
        }
        return resultado;
    }

    /** CxP por empleado para la liquidación anual de décimos (una fila por empleado liquidado). */
    private async crearCxpLiquidacionDecimo(
        entradas: Array<[number, number]>,
        fecha: string,
        ideCnccc: number,
        estadoFacturaNormal: number | null,
        esDecimoTercero: boolean,
        dtoIn: HeaderParamsDto,
    ): Promise<number> {
        const geedpIds = entradas.map(([ideGeedp]) => ideGeedp);
        const query = new SelectQuery(`
            SELECT ged.ide_geedp, emp.ide_geper
            FROM gen_empleados_departamento_par ged
            INNER JOIN gth_empleado emp ON emp.ide_gtemp = ged.ide_gtemp
            WHERE ged.ide_geedp = ANY ($1)
        `);
        query.setLazy(false);
        query.addParam(1, geedpIds);
        const rows = (await this.dataSource.createSelectQuery(query)) as Array<{ ide_geedp: number; ide_geper: number }>;
        const geperPorGeedp = new Map(rows.map((r) => [r.ide_geedp, r.ide_geper]));

        const listQuery: ObjectQueryDto[] = [];
        for (const [ideGeedp, valor] of entradas) {
            const ideGeper = geperPorGeedp.get(ideGeedp);
            if (!ideGeper) continue;
            const ideCpcfa = await this.dataSource.getSeqTable('cxp_cabece_factur', 'ide_cpcfa', 1, dtoIn.login);
            listQuery.push({
                operation: 'insert',
                module: 'cxp',
                tableName: 'cabece_factur',
                primaryKey: 'ide_cpcfa',
                object: {
                    ide_cpcfa: ideCpcfa,
                    ide_geper: ideGeper,
                    ide_sucu: dtoIn.ideSucu,
                    ide_empr: dtoIn.ideEmpr,
                    ide_usua: dtoIn.ideUsua,
                    ide_cnccc: ideCnccc,
                    ide_cpefa: estadoFacturaNormal,
                    fecha_trans_cpcfa: fecha,
                    fecha_emisi_cpcfa: fecha,
                    numero_cpcfa: `LIQ-${esDecimoTercero ? 'D3' : 'D4'}-${ideGeedp}-${fecha}`,
                    total_cpcfa: Math.round(valor * 100) / 100,
                    observacion_cpcfa: `Liquidación anual de ${esDecimoTercero ? 'décimo tercero' : 'décimo cuarto'}`,
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
     * suplementaria (50%) / extraordinaria (100%) / nocturna (25%).
     */
    private async getHorasExtraAprobadas(
        ideGeedp: number,
        fechaRol: string,
    ): Promise<{ supl: number; extra: number; nocturna: number; ids: number[] }> {
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
        const sumar = (tipo: string) =>
            rows.filter((r) => r.tipo_nrhec === tipo).reduce((acc, r) => acc + Number(r.horas_detectadas_nrhec || 0), 0);
        return {
            supl: sumar('suplementaria'),
            extra: sumar('extraordinaria'),
            nocturna: sumar('nocturna'),
            ids: rows.map((r) => r.ide_nrhec),
        };
    }

    private async marcarHorasExtraConsumidas(ids: number[], ideNrrol: number): Promise<void> {
        const updQuery = new UpdateQuery('nrh_hora_extra_candidata', 'ide_nrhec');
        updQuery.values.set('ide_nrrol', ideNrrol);
        updQuery.where = 'ide_nrhec = ANY ($1)';
        updQuery.addParam(1, ids);
        await this.dataSource.createQuery(updQuery);
    }
}
