import { Injectable } from '@nestjs/common';

export interface ResultadoHorasExtra {
    valorSuplementaria: number;
    valorExtraordinaria: number;
    valorNocturna: number;
}

/**
 * Cálculos de nómina fijados por ley (Código de Trabajo / IESS), NO por política de
 * empresa: décimo tercero, décimo cuarto, fondos de reserva, horas extra. Se
 * implementan en código (testeable, versionado, revisado por PR) en vez de como
 * fórmula editable en nrh_detalle_rubro — a diferencia de bonos/descuentos propios
 * de cada empresa, acá no hay ninguna variante legítima que un usuario de negocio
 * deba poder ajustar sin tocar código.
 *
 * Verificado contra fórmulas reales de un sistema de nómina propio anterior
 * (reh_cab_rubro, desactualizado en tasas pero correcto en estructura) y contra
 * asientos reales de provisión ya registrados por la contadora (con_det_comp_cont):
 *   - valor_hora = sueldo / 240 (Art. 55 CT, divisor fijo, no días laborados)
 *   - suplementaria = valor_hora * 1.5 ; extraordinaria = valor_hora * 2.0
 *   - nocturna = valor_hora * 1.25 (Art. 49 CT, recargo nocturno)
 *   - fondos de reserva = 8.33% (1/12) del ingreso gravable mensual
 *   - décimo 3° = ingreso gravable mensual / 12 (provisión mensual)
 *   - décimo 4° = SBU / 12 (provisión mensual, sin prorrateo por ahora)
 *
 * Estas tres últimas SIEMPRE se calculan y se guardan en nrh_detalle_rol, sin importar
 * si el empleado acumula o mensualiza — la provisión contable (el pasivo que la empresa
 * ya debe) crece todos los meses independientemente de cuándo se paga en efectivo. Quién
 * decide si ese valor se paga en efectivo ESTE rol (mensualizado) o solo se provisiona
 * para pagarse después (acumula) es RolPagosService, no esta clase — ver
 * generarProvisionDecimosFondos y la exclusión de la CxP mensual en crearCxpPorEmpleado.
 */
@Injectable()
export class CalculoLegalService {
    private redondear(valor: number): number {
        return Math.round(valor * 100) / 100;
    }

    /**
     * Horas suplementarias (recargo 50%, Art. 55 CT), extraordinarias (recargo 100%,
     * trabajado en día de descanso/feriado) y nocturnas (recargo 25%, Art. 49 CT,
     * trabajo entre 19:00-06:00 dentro de jornada). Se pagan siempre en el rol donde
     * se aprobó la hora — no hay concepto de "acumular" horas extra.
     */
    calcularHorasExtra(
        sueldo: number,
        horasSuplementarias: number,
        horasExtraordinarias: number,
        horasNocturnas = 0,
        parametroHoras = 240,
    ): ResultadoHorasExtra {
        const valorHora = parametroHoras > 0 ? sueldo / parametroHoras : 0;
        return {
            valorSuplementaria: this.redondear(valorHora * 1.5 * (horasSuplementarias || 0)),
            valorExtraordinaria: this.redondear(valorHora * 2.0 * (horasExtraordinarias || 0)),
            valorNocturna: this.redondear(valorHora * 1.25 * (horasNocturnas || 0)),
        };
    }

    /**
     * Provisión mensual de fondos de reserva: 8.33% (1/12, fracción fija por ley, no una
     * tasa que se revise periódicamente como el IESS) del ingreso gravable mensual.
     */
    calcularFondosReserva(ingresoGravableMensual: number): number {
        return this.redondear(ingresoGravableMensual / 12);
    }

    /** Provisión mensual de décimo tercer sueldo: ingreso gravable mensual / 12. */
    calcularDecimoTercero(ingresoGravableMensual: number): number {
        return this.redondear(ingresoGravableMensual / 12);
    }

    /**
     * Provisión mensual de décimo cuarto sueldo: SBU vigente / 12, sin prorrateo por
     * tiempo parcial o ingreso a mitad de período (simplificación, igual que el sistema
     * de referencia).
     */
    calcularDecimoCuarto(sbuVigente: number): number {
        return this.redondear(sbuVigente / 12);
    }
}
