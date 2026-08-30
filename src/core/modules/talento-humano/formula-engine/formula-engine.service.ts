import { Injectable } from '@nestjs/common';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';

import { FormulaNode, parseFormula } from './formula-parser';

export interface EvaluarRubroParams {
    /** Texto crudo de nrh_detalle_rubro.formula_nrder (puede ser null, literal o `=...`). */
    formula: string | null | undefined;
    /** Empleado (gen_empleados_departamento_par.ide_geedp) sobre el que se calcula. */
    ideGeedp: number;
    /** Fecha del rol que se está generando (YYYY-MM-DD). */
    fechaRol: string;
    /** nrh_detalle_rubro.fecha_inicial_nrder ("MM-DD/offsetAño" o null). */
    fechaInicialNrder?: string | null;
    /** nrh_detalle_rubro.fecha_final_nrder ("MM-DD/offsetAño" o null). */
    fechaFinalNrder?: string | null;
    /** Valores ya calculados en este rol para este empleado: ide_nrder -> valor. */
    computedValues: Map<number, number>;
    /**
     * Modalidad vigente (nrh_solicitud_mensualizacion) del rubro que se está evaluando,
     * ya resuelta por el caller para el empleado y la fecha del rol — ver
     * RolPagosService#getMensualizacionVigente. true = mensualizado, false = acumula
     * (o no hay solicitud registrada, que es el default legal). Alimenta el token
     * `mensualizado` de la fórmula.
     */
    mensualizado?: boolean;
}

/**
 * Motor de fórmulas de rol de pagos — evalúa nrh_detalle_rubro.formula_nrder con la
 * misma sintaxis que el motor legado (ver formula-parser.ts). Puro en cuanto a
 * aritmética; solo toca la BD para resolver `sum[...]` (histórico de rol).
 */
@Injectable()
export class FormulaEngineService {
    constructor(private readonly dataSource: DataSourceService) { }

    /**
     * Evalúa una fórmula de rubro para un empleado dentro de un rol en construcción.
     * Si la fórmula no empieza con '=', se interpreta como valor literal fijo.
     * Si no hay fórmula (null/vacío), retorna 0 — se asume rubro de entrada manual
     * (ej. horas extra aprobadas), inyectado aparte por quien arma el rol.
     */
    async evaluarRubro(params: EvaluarRubroParams): Promise<number> {
        const raw = (params.formula ?? '').trim();
        if (!raw) return 0;

        if (!raw.startsWith('=')) {
            const asNumber = Number(raw);
            return Number.isFinite(asNumber) ? asNumber : 0;
        }

        const ast = parseFormula(raw.slice(1));
        return this.evaluate(ast, params);
    }

    private async evaluate(node: FormulaNode, ctx: EvaluarRubroParams): Promise<number> {
        switch (node.type) {
            case 'number':
                return node.value;

            case 'ref':
                return ctx.computedValues.get(node.ideNrder) ?? 0;

            case 'sum':
                return this.resolveSum(node.ideNrder, ctx);

            case 'mensualizado':
                return ctx.mensualizado ? 1 : 0;

            case 'negate':
                return -(await this.evaluate(node.expr, ctx));

            case 'binary': {
                const left = await this.evaluate(node.left, ctx);
                const right = await this.evaluate(node.right, ctx);
                switch (node.op) {
                    case '+': return left + right;
                    case '-': return left - right;
                    case '*': return left * right;
                    case '/': return right === 0 ? 0 : left / right;
                }
                break;
            }

            case 'compare': {
                const left = await this.evaluate(node.left, ctx);
                const right = await this.evaluate(node.right, ctx);
                let result: boolean;
                switch (node.op) {
                    case '==': result = left === right; break;
                    case '!=': result = left !== right; break;
                    case '>': result = left > right; break;
                    case '<': result = left < right; break;
                    case '>=': result = left >= right; break;
                    case '<=': result = left <= right; break;
                }
                return result ? 1 : 0;
            }

            case 'if': {
                const cond = await this.evaluate(node.cond, ctx);
                return cond !== 0
                    ? this.evaluate(node.then, ctx)
                    : this.evaluate(node.else, ctx);
            }
        }
        throw new Error(`Nodo de fórmula no soportado: ${JSON.stringify(node)}`);
    }

    /**
     * Suma histórica de nrh_detalle_rol.valor_nrdro para un rubro (ide_nrder) y el
     * mismo empleado (ide_geedp), en el rango de fechas configurado en el rubro que
     * se está evaluando (fecha_inicial_nrder/fecha_final_nrder), aplicado al año de
     * la fecha del rol actual.
     */
    private async resolveSum(ideNrder: number, ctx: EvaluarRubroParams): Promise<number> {
        const [desde, hasta] = this.rangoFechas(
            ctx.fechaInicialNrder,
            ctx.fechaFinalNrder,
            ctx.fechaRol,
        );

        const query = new SelectQuery(`
            SELECT COALESCE(SUM(dr.valor_nrdro), 0) AS total
            FROM nrh_detalle_rol dr
            INNER JOIN nrh_rol r ON r.ide_nrrol = dr.ide_nrrol
            WHERE dr.ide_nrder = $1
              AND dr.ide_geedp = $2
              AND r.fecha_nrrol BETWEEN $3 AND $4
              AND r.activo_nrrol = true
        `);
        query.setLazy(false);
        query.addIntParam(1, ideNrder);
        query.addIntParam(2, ctx.ideGeedp);
        query.addStringParam(3, desde);
        query.addStringParam(4, hasta);

        const rows = await this.dataSource.createSelectQuery(query);
        return Number(rows?.[0]?.total ?? 0);
    }

    /**
     * Traduce fecha_inicial_nrder/fecha_final_nrder (formato "MM-DD/offsetAño", ej.
     * "8-1/-1" a "7-31/0" = 1-Ago del año anterior a 31-Jul del año del rol) a un
     * rango [desde, hasta] en formato YYYY-MM-DD. Sin configuración, cae al año
     * calendario completo que contiene la fecha del rol.
     */
    private rangoFechas(
        inicial: string | null | undefined,
        final: string | null | undefined,
        fechaRolIso: string,
    ): [string, string] {
        const baseYear = new Date(fechaRolIso).getFullYear();
        if (!inicial || !final) {
            return [`${baseYear}-01-01`, `${baseYear}-12-31`];
        }
        return [this.parseMonthDayOffset(inicial, baseYear), this.parseMonthDayOffset(final, baseYear)];
    }

    private parseMonthDayOffset(spec: string, baseYear: number): string {
        const [md, offsetStr] = spec.split('/');
        const [monthStr, dayStr] = md.split('-');
        const month = parseInt(monthStr, 10);
        const day = parseInt(dayStr, 10);
        const offset = offsetStr !== undefined ? parseInt(offsetStr, 10) : 0;
        const year = baseYear + (Number.isFinite(offset) ? offset : 0);
        // new Date normaliza overflows (ej. día 31 en un mes de 30 -> cae al mes siguiente),
        // aceptable dado que son datos de configuración legado con algunas inconsistencias.
        const date = new Date(year, (Number.isFinite(month) ? month : 1) - 1, Number.isFinite(day) ? day : 1);
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }
}
