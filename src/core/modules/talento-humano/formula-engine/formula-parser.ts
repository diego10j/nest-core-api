/**
 * Parser del lenguaje de fórmulas de nrh_detalle_rubro.formula_nrder, portado del motor
 * legado (sigafi-ejb/paq_nomina/ejb/ServicioNomina.java: despejarFormulasRol/
 * getFormulaReemplazada/getBuscarValorRubro), verificado contra datos reales de
 * producción. Sintaxis confirmada:
 *   - `[123]`        referencia al valor ya calculado del rubro con ide_nrder=123
 *                     dentro del mismo rol (para el mismo empleado).
 *   - `[expr]`       cuando el contenido NO es un entero puro, `[...]` actúa como
 *                     agrupación/paréntesis (ej. `[[69]/240]` = (REF(69) / 240)).
 *   - `sum[123]` / `sum [123]`  suma histórica de nrh_detalle_rol.valor_nrdro para
 *                     ide_nrder=123 y el mismo empleado, en el rango de fechas
 *                     (fecha_inicial_nrder..fecha_final_nrder) del rubro que se está
 *                     evaluando.
 *   - `if (cond) { expr; } else { expr; }`  condicional, con comparadores
 *                     == != > < >= <=.
 *   - `mensualizado`  1 si el rubro que se está evaluando tiene modalidad "mensualizado"
 *                     vigente para el empleado (nrh_solicitud_mensualizacion), 0 si
 *                     "acumula" (o si no hay solicitud registrada — ver
 *                     RolPagosService#getMensualizacionVigente). Extensión propia, no
 *                     existía en el motor legado (que resolvía esto con un rubro
 *                     auxiliar inyectado — ver EvaluarRubroParams.mensualizado).
 *   - operadores aritméticos + - * / con precedencia estándar y paréntesis `(...)`.
 *   - un formula_nrder que no empieza con `=` es un valor literal fijo (no se parsea).
 */

export type FormulaNode =
    | { type: 'number'; value: number }
    | { type: 'ref'; ideNrder: number }
    | { type: 'sum'; ideNrder: number }
    | { type: 'mensualizado' }
    | { type: 'binary'; op: '+' | '-' | '*' | '/'; left: FormulaNode; right: FormulaNode }
    | { type: 'compare'; op: '==' | '!=' | '>' | '<' | '>=' | '<='; left: FormulaNode; right: FormulaNode }
    | { type: 'negate'; expr: FormulaNode }
    | { type: 'if'; cond: FormulaNode; then: FormulaNode; else: FormulaNode };

type Token =
    | { kind: 'number'; value: number }
    | { kind: 'ident'; value: string }
    | { kind: 'op'; value: string };

const OPERATORS = ['==', '!=', '>=', '<=', '>', '<', '+', '-', '*', '/', '(', ')', '[', ']', '{', '}', ';'];

function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    const n = source.length;
    while (i < n) {
        const c = source[i];
        if (/\s/.test(c)) {
            i++;
            continue;
        }
        if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(source[i + 1] ?? ''))) {
            let j = i;
            while (j < n && /[0-9.]/.test(source[j])) j++;
            tokens.push({ kind: 'number', value: Number(source.slice(i, j)) });
            i = j;
            continue;
        }
        if (/[a-zA-Z_]/.test(c)) {
            let j = i;
            while (j < n && /[a-zA-Z_0-9]/.test(source[j])) j++;
            tokens.push({ kind: 'ident', value: source.slice(i, j).toLowerCase() });
            i = j;
            continue;
        }
        const two = source.slice(i, i + 2);
        if (two === '==' || two === '!=' || two === '>=' || two === '<=') {
            tokens.push({ kind: 'op', value: two });
            i += 2;
            continue;
        }
        if (OPERATORS.includes(c)) {
            tokens.push({ kind: 'op', value: c });
            i++;
            continue;
        }
        throw new Error(`Carácter inesperado '${c}' en la fórmula: ${source}`);
    }
    return tokens;
}

class Parser {
    private pos = 0;

    constructor(private readonly tokens: Token[]) { }

    private peek(): Token | undefined {
        return this.tokens[this.pos];
    }

    private next(): Token {
        const t = this.tokens[this.pos];
        if (!t) throw new Error('Fin inesperado de la fórmula');
        this.pos++;
        return t;
    }

    private expectOp(value: string): void {
        const t = this.next();
        if (t.kind !== 'op' || t.value !== value) {
            throw new Error(`Se esperaba '${value}' en la fórmula`);
        }
    }

    parse(): FormulaNode {
        const node = this.parseExpression();
        if (this.pos < this.tokens.length) {
            // Puede quedar un ';' final suelto — se tolera.
            const rest = this.tokens.slice(this.pos);
            const onlySemis = rest.every((t) => t.kind === 'op' && t.value === ';');
            if (!onlySemis) {
                throw new Error('Tokens sobrantes al final de la fórmula');
            }
        }
        return node;
    }

    // expression := comparison
    private parseExpression(): FormulaNode {
        return this.parseComparison();
    }

    private parseComparison(): FormulaNode {
        let left = this.parseAdditive();
        const t = this.peek();
        if (t && t.kind === 'op' && ['==', '!=', '>', '<', '>=', '<='].includes(t.value)) {
            this.next();
            const right = this.parseAdditive();
            left = { type: 'compare', op: t.value as any, left, right };
        }
        return left;
    }

    private parseAdditive(): FormulaNode {
        let left = this.parseMultiplicative();
        for (; ;) {
            const t = this.peek();
            if (t && t.kind === 'op' && (t.value === '+' || t.value === '-')) {
                this.next();
                const right = this.parseMultiplicative();
                left = { type: 'binary', op: t.value, left, right };
            } else {
                break;
            }
        }
        return left;
    }

    private parseMultiplicative(): FormulaNode {
        let left = this.parseUnary();
        for (; ;) {
            const t = this.peek();
            if (t && t.kind === 'op' && (t.value === '*' || t.value === '/')) {
                this.next();
                const right = this.parseUnary();
                left = { type: 'binary', op: t.value, left, right };
            } else {
                break;
            }
        }
        return left;
    }

    private parseUnary(): FormulaNode {
        const t = this.peek();
        if (t && t.kind === 'op' && t.value === '-') {
            this.next();
            return { type: 'negate', expr: this.parseUnary() };
        }
        return this.parsePrimary();
    }

    private parsePrimary(): FormulaNode {
        const t = this.next();

        if (t.kind === 'number') {
            return { type: 'number', value: t.value };
        }

        if (t.kind === 'ident' && t.value === 'mensualizado') {
            return { type: 'mensualizado' };
        }

        if (t.kind === 'ident' && t.value === 'sum') {
            this.expectOp('[');
            const idNode = this.next();
            if (idNode.kind !== 'number') throw new Error("Se esperaba un entero dentro de 'sum[...]'");
            this.expectOp(']');
            return { type: 'sum', ideNrder: idNode.value };
        }

        if (t.kind === 'ident' && t.value === 'if') {
            this.expectOp('(');
            const cond = this.parseComparison();
            this.expectOp(')');
            this.expectOp('{');
            const thenExpr = this.parseExpression();
            if (this.peek()?.kind === 'op' && this.peek()!.value === ';') this.next();
            this.expectOp('}');
            let elseExpr: FormulaNode = { type: 'number', value: 0 };
            if (this.peek()?.kind === 'ident' && this.peek()!.value === 'else') {
                this.next();
                this.expectOp('{');
                elseExpr = this.parseExpression();
                if (this.peek()?.kind === 'op' && this.peek()!.value === ';') this.next();
                this.expectOp('}');
            }
            return { type: 'if', cond, then: thenExpr, else: elseExpr };
        }

        if (t.kind === 'op' && t.value === '(') {
            const expr = this.parseExpression();
            this.expectOp(')');
            return expr;
        }

        if (t.kind === 'op' && t.value === '[') {
            // Lookahead: '[' NUMBER ']' puro -> referencia; si no, es solo agrupación.
            const save = this.pos;
            const maybeNum = this.peek();
            if (maybeNum && maybeNum.kind === 'number') {
                const afterNum = this.tokens[this.pos + 1];
                if (afterNum && afterNum.kind === 'op' && afterNum.value === ']') {
                    this.next(); // consume number
                    this.next(); // consume ']'
                    return { type: 'ref', ideNrder: maybeNum.value };
                }
            }
            this.pos = save;
            const expr = this.parseExpression();
            this.expectOp(']');
            return expr;
        }

        throw new Error(`Token inesperado en la fórmula: ${JSON.stringify(t)}`);
    }
}

/**
 * Parsea una fórmula (sin el signo '=' inicial, ya removido por el caller).
 */
export function parseFormula(source: string): FormulaNode {
    const tokens = tokenize(source);
    return new Parser(tokens).parse();
}
