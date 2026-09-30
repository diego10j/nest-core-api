import type { EstadoCuentaParseado, MovimientoBanco } from './estado-cuenta.types';
import { fechaIso, ordenarCronologico, rangoDeMovimientos, recortar } from './parser-util';

/** Lo único que se necesita del servicio de GPT (permite probar con uno simulado). */
export interface GptJson {
    parseTextToJson(prompt: string, text: string): Promise<any>;
}

/** Líneas de texto por consulta a la IA: cada tramo debe caber holgado en su respuesta (~45 tokens por movimiento). */
export const LINEAS_POR_TRAMO = 70;
/** Consultas simultáneas a la IA. */
const CONCURRENCIA = 3;
/** Por encima de esto el archivo es demasiado grande para leerlo con IA (un estado de cuenta mensual no llega). */
const MAX_LINEAS = 3000;

const PROMPT = `
Eres un extractor de datos de estados de cuenta bancarios de Ecuador (USD). Recibirás un TRAMO del texto de un
estado de cuenta (extraído de un PDF, Excel o CSV): cada línea es una fila o un fragmento del documento. El formato
puede ser cualquiera y cambiar de un banco o mes a otro: entiende las columnas por su encabezado y su contenido.

Devuelve SOLO un JSON con esta forma:
{
  "banco": string|null,
  "cuenta": string|null,
  "fechaDesde": "YYYY-MM-DD"|null,
  "fechaHasta": "YYYY-MM-DD"|null,
  "movimientos": [
    { "fecha": "YYYY-MM-DD", "documento": string, "descripcion": string,
      "debito": number|null, "credito": number|null, "monto": number|null, "tipo": "D"|"C"|null, "saldo": number|null }
  ]
}

Reglas:
- "movimientos" lleva SOLO filas reales de transacciones, en el MISMO orden en que aparecen. No incluyas encabezados,
  totales, resúmenes, saldos iniciales/finales sueltos, pies de página ni avisos legales.
- No inventes ni calcules nada: copia lo que dice el documento. Si una fila está partida en dos líneas, únela.
- Fechas SIEMPRE como YYYY-MM-DD. Si vienen como dd/mm/aaaa o mm/dd/aaaa, decide el orden con el periodo del
  encabezado y con el resto de fechas (día > 12 indica el orden).
- Números como número JSON con punto decimal, sin símbolo de moneda ni separador de miles (1.958,63 -> 1958.63).
- Si el documento tiene columnas separadas de débito y crédito, usa "debito" y "credito" (la que no aplique, null).
  Si tiene una sola columna de monto con tipo D/C o con signo, usa "monto" (positivo) y "tipo" ("D" débito/egreso,
  "C" crédito/ingreso); si el monto viene negativo es un débito.
- "saldo" es el saldo del banco DESPUÉS del movimiento, si la fila lo trae (si no, null).
- "documento" es el número de documento/referencia de la fila (texto; vacío si no hay).
- Este tramo puede no traer el encabezado: entonces banco, cuenta y fechas van en null.
`;

/** Número tolerante: acepta number o texto con coma/punto decimal, símbolo de moneda y separador de miles. */
export function numeroFlexible(valor: unknown): number | null {
    if (valor === null || valor === undefined || valor === '') return null;
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
    let t = String(valor).replace(/[$\s]/g, '');
    if (t === '' || t === '-') return null;
    const negativo = t.startsWith('-') || /^\(.*\)$/.test(t);
    t = t.replace(/[-()]/g, '');
    const coma = t.lastIndexOf(',');
    const punto = t.lastIndexOf('.');
    if (coma >= 0 && punto >= 0) {
        // El separador que aparece último es el decimal
        t = coma > punto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    } else if (coma >= 0) {
        // "1,958" = miles si hay 3 dígitos tras la coma y nada más; si no, coma decimal
        t = /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
    }
    const n = Number(t);
    if (Number.isNaN(n)) return null;
    return negativo ? -n : n;
}

/** Una línea que parece una fila con fecha (para cotejar cuántos movimientos debería haber). */
const LINEA_CON_FECHA = /^\s*(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/;

interface Tramo {
    lineas: string[];
}

export function partirEnTramos(lineas: string[], porTramo = LINEAS_POR_TRAMO): Tramo[] {
    const tramos: Tramo[] = [];
    for (let i = 0; i < lineas.length; i += porTramo) tramos.push({ lineas: lineas.slice(i, i + porTramo) });
    return tramos;
}

interface RespuestaTramo {
    banco?: string | null;
    cuenta?: string | null;
    fechaDesde?: string | null;
    fechaHasta?: string | null;
    movimientos?: Array<Record<string, unknown>>;
}

/** Fecha ISO válida o null (la IA a veces devuelve 31/02 o texto). */
function fechaValida(f: unknown): string | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(f ?? '').trim());
    if (!m) return null;
    try {
        return fechaIso(Number(m[1]), Number(m[2]), Number(m[3]));
    } catch {
        return null;
    }
}

/** Convierte una fila de la IA en un movimiento normalizado, o null si no sirve. */
export function aMovimiento(fila: Record<string, unknown>): MovimientoBanco | null {
    const fecha = fechaValida(fila.fecha);
    if (!fecha) return null;
    const debito = numeroFlexible(fila.debito);
    const credito = numeroFlexible(fila.credito);
    const monto = numeroFlexible(fila.monto);
    const tipo = String(fila.tipo ?? '').trim().toUpperCase();

    let signo: 1 | -1;
    let importe: number;
    if (debito !== null && debito !== 0) { signo = -1; importe = Math.abs(debito); }
    else if (credito !== null && credito !== 0) { signo = 1; importe = Math.abs(credito); }
    else if (monto !== null && monto !== 0) {
        signo = tipo === 'D' || monto < 0 ? -1 : 1;
        importe = Math.abs(monto);
    } else return null;

    return {
        fecha,
        documento: recortar(String(fila.documento ?? '').trim(), 60),
        descripcion: recortar(String(fila.descripcion ?? '').trim(), 400),
        referencia: '',
        oficina: '',
        monto: Number(importe.toFixed(2)),
        signo,
        saldo: numeroFlexible(fila.saldo),
    };
}

/**
 * Lee un estado de cuenta CUALQUIERA con IA, como plan B cuando ningún lector conocido lo reconoce (o el banco
 * cambió su formato): el texto se parte en tramos, la IA extrae los movimientos de cada uno y aquí se valida y
 * normaliza todo. El resultado trae advertencias para que el usuario revise la vista previa, y la cadena de
 * saldos (la misma validación aritmética de los demás lectores) delata cualquier fila mal leída o faltante.
 */
export async function leerConIa(gpt: GptJson, lineas: string[], formato = 'IA'): Promise<EstadoCuentaParseado> {
    const limpias = lineas.map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l !== '');
    if (limpias.length === 0) throw new Error('El archivo no tiene texto que leer.');
    if (limpias.length > MAX_LINEAS) throw new Error(`El archivo es demasiado grande para leerlo con IA (${limpias.length} líneas).`);

    const tramos = partirEnTramos(limpias);
    const respuestas: RespuestaTramo[] = new Array(tramos.length);
    let siguiente = 0;
    const trabajador = async () => {
        while (siguiente < tramos.length) {
            const i = siguiente;
            siguiente += 1;
            respuestas[i] = await gpt.parseTextToJson(PROMPT, tramos[i].lineas.join('\n'));
        }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, tramos.length) }, trabajador));

    const movimientos: MovimientoBanco[] = [];
    let descartadas = 0;
    const meta: RespuestaTramo = {};
    for (const r of respuestas) {
        meta.cuenta = meta.cuenta ?? (r?.cuenta ? String(r.cuenta) : null);
        meta.banco = meta.banco ?? (r?.banco ? String(r.banco) : null);
        meta.fechaDesde = meta.fechaDesde ?? fechaValida(r?.fechaDesde);
        meta.fechaHasta = meta.fechaHasta ?? fechaValida(r?.fechaHasta);
        for (const fila of Array.isArray(r?.movimientos) ? r.movimientos : []) {
            const m = aMovimiento(fila);
            if (m) movimientos.push(m); else descartadas += 1;
        }
    }

    const advertencias: string[] = [
        'Este archivo se leyó con IA porque su formato no es uno de los reconocidos: revise la vista previa y los saldos antes de cargarlo.',
    ];
    if (descartadas > 0) advertencias.push(`${descartadas} fila(s) devueltas por la IA no eran válidas (fecha o monto) y se descartaron.`);
    const conFecha = limpias.filter((l) => LINEA_CON_FECHA.test(l)).length;
    if (conFecha > 0 && movimientos.length < conFecha * 0.9) {
        advertencias.push(`La IA extrajo ${movimientos.length} movimientos pero el texto tiene unas ${conFecha} líneas con fecha: puede faltar alguno.`);
    }

    const ordenados = ordenarCronologico(movimientos, 'DESC');
    const rango = rangoDeMovimientos(ordenados);
    return {
        formato,
        cuenta: meta.cuenta ? String(meta.cuenta).replace(/\s+/g, '') : null,
        fechaDesde: meta.fechaDesde ?? rango.desde,
        fechaHasta: meta.fechaHasta ?? rango.hasta,
        movimientos: ordenados,
        advertencias,
        encabezado: limpias.slice(0, 14),
    };
}
