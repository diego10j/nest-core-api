import { createHash } from 'node:crypto';
import path from 'node:path';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { GptService } from 'src/core/integration/gpt/gpt.service';

import type { EstadoCuentaParseado, FilaHoja } from './estado-cuenta.types';
import { leerPrimeraHojaXlsx } from './lector-xlsx';
import { esDeuna, parsearDeuna, textoPaginasPdf } from './parser-deuna';
import { esGuayaquil, parsearGuayaquil } from './parser-guayaquil';
import { leerConIa } from './parser-ia';
import { esPichincha, parsearPichincha, textoDeCsv } from './parser-pichincha';
import { esProdubanco, parsearProdubanco } from './parser-produbanco';
import { calcularSaldosCadena, detectarSaltosDeSaldo } from './parser-util';

export interface EstadoCuentaLeido extends EstadoCuentaParseado {
    /** Saldo inicial / final deducidos de la cadena de saldos de los movimientos (null si el banco no da saldo por movimiento). */
    saldoInicial: number | null;
    saldoFinal: number | null;
    /** false si la cadena de saldos tiene huecos: el archivo no parece traer todos los movimientos. */
    cadenaConsistente: boolean;
}

export const FORMATOS_SOPORTADOS = 'Banco Guayaquil (.xlsx), Produbanco (.xlsx), Banco Pichincha (.csv) y Deuna (.pdf)';

/** Cuánto se recuerda una lectura: el análisis y la carga del mismo archivo no vuelven a consultar a la IA. */
const VIGENCIA_CACHE_MS = 20 * 60 * 1000;
const MAX_CACHE = 30;

/**
 * Reconoce el banco de un archivo por su CONTENIDO (no por el nombre) y lo lee a una estructura común.
 *  1. Lectores conocidos (Guayaquil, Produbanco, Pichincha, Deuna): rápidos, gratis y exactos.
 *  2. Plan B con IA: si el archivo NO es de un formato conocido —o un formato conocido cambió y su lector ya no
 *     alcanza a leer todas las filas— se extrae con IA (`parser-ia.ts`), sea PDF, Excel o CSV, y se marca con una
 *     advertencia. En ambos casos se valida la cadena de saldos.
 * Para soportar un banco nuevo de forma exacta: agregar su parser en esta carpeta (detector `esXxx` +
 * `parsearXxx`) y una rama aquí. La lectura se guarda un rato en memoria (por huella del archivo), así que el
 * análisis y la carga posterior del mismo archivo dan exactamente lo mismo sin repetir la consulta a la IA.
 */
@Injectable()
export class EstadoCuentaParserService {
    private readonly logger = new Logger(EstadoCuentaParserService.name);
    private readonly cache = new Map<string, { hasta: number; valor: EstadoCuentaLeido }>();

    constructor(private readonly gpt: GptService) { }

    async leer(buffer: Buffer, nombreOriginal: string): Promise<EstadoCuentaLeido> {
        const clave = `${createHash('sha256').update(buffer).digest('hex')}|${path.extname(nombreOriginal).toLowerCase()}`;
        const ahora = Date.now();
        const guardado = this.cache.get(clave);
        if (guardado && guardado.hasta > ahora) return guardado.valor;

        const valor = await this.leerSinCache(buffer, nombreOriginal);
        this.cache.set(clave, { hasta: ahora + VIGENCIA_CACHE_MS, valor });
        for (const [k, v] of this.cache) if (v.hasta <= ahora) this.cache.delete(k);
        while (this.cache.size > MAX_CACHE) this.cache.delete(this.cache.keys().next().value as string);
        return valor;
    }

    private async leerSinCache(buffer: Buffer, nombreOriginal: string): Promise<EstadoCuentaLeido> {
        const ext = path.extname(nombreOriginal).toLowerCase();
        let parseado: EstadoCuentaParseado | null = null;
        let encabezado: string[] = [];

        try {
            if (ext === '.pdf') {
                const paginas = await textoPaginasPdf(buffer);
                const lineas = paginas.flatMap((p) => p.split('\n'));
                if (lineas.join('').trim() === '') {
                    throw new BadRequestException('El PDF no tiene texto (parece escaneado o es una imagen): descargue el estado de cuenta original del banco.');
                }
                const conocido = esDeuna(paginas) ? parsearDeuna(paginas) : null;
                if (conocido) encabezado = (paginas[0] ?? '').split('\n').slice(0, 14);
                parseado = await this.conPlanB(conocido, lineas, nombreOriginal);
            } else if (ext === '.csv') {
                const contenido = textoDeCsv(buffer);
                const conocido = esPichincha(contenido) ? parsearPichincha(contenido, nombreOriginal) : null;
                if (conocido) encabezado = contenido.split(/\r?\n/).slice(0, 3);
                parseado = await this.conPlanB(conocido, contenido.split(/\r?\n/), nombreOriginal);
            } else if (ext === '.xlsx') {
                const filas = await leerPrimeraHojaXlsx(buffer);
                let conocido: EstadoCuentaParseado | null = null;
                if (esGuayaquil(filas)) conocido = parsearGuayaquil(filas);
                else if (esProdubanco(filas)) conocido = parsearProdubanco(filas);
                if (conocido) encabezado = filasATexto(filas.slice(0, 12));
                parseado = await this.conPlanB(conocido, filasATexto(filas), nombreOriginal);
            } else if (ext === '.xls') {
                throw new BadRequestException('El formato .xls antiguo no se puede leer: ábralo en Excel y guárdelo como .xlsx.');
            }
        } catch (e) {
            if (e instanceof BadRequestException) throw e;
            throw new BadRequestException(`No se pudo leer el archivo "${nombreOriginal}": ${(e as Error).message}`);
        }

        if (!parseado) {
            throw new BadRequestException(`Formato de archivo no soportado (${ext || 'sin extensión'}). Suba un .pdf, .xlsx o .csv. Formatos con lector exacto: ${FORMATOS_SOPORTADOS}.`);
        }
        if (parseado.movimientos.length === 0) {
            throw new BadRequestException(`No se encontraron movimientos en el archivo (formato ${parseado.formato}).`);
        }

        const saldos = calcularSaldosCadena(parseado.movimientos);
        if (saldos.inicial !== null && !saldos.consistente) {
            const detalle = detectarSaltosDeSaldo(parseado.movimientos, saldos.inicial)
                .slice(0, 3)
                .map((s) => `${s.movimiento.fecha} doc. ${s.movimiento.documento} (saldo esperado ${s.saldoEsperado.toFixed(2)}, el banco muestra ${s.movimiento.saldo?.toFixed(2)})`)
                .join('; ');
            parseado.advertencias.push(
                'Los saldos del archivo no encadenan entre sí (faltan movimientos, hay repetidos o el banco aplicó un ajuste que no lista)'
                + (detalle ? `. Salto en: ${detalle}.` : '.'),
            );
        }
        // Sin correos: el encabezado se envía a la IA y no necesita datos de contacto
        const origen = encabezado.length > 0 ? encabezado : parseado.encabezado ?? [];
        parseado.encabezado = origen.map((l) => l.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '(correo)')).filter((l) => l.trim() !== '');
        return { ...parseado, saldoInicial: saldos.inicial, saldoFinal: saldos.final, cadenaConsistente: saldos.consistente };
    }

    /**
     * Decide entre el lector conocido y la IA. El conocido manda si leyó todo; si no hay lector (formato nuevo)
     * o el lector dejó filas sin leer (el banco cambió algo), se usa la IA y se queda con la lectura que trajo
     * más movimientos.
     */
    private async conPlanB(conocido: EstadoCuentaParseado | null, lineas: string[], nombre: string): Promise<EstadoCuentaParseado> {
        const incompleto = conocido !== null
            && (conocido.movimientos.length === 0 || conocido.advertencias.some((a) => /no se pudieron leer|^Fila omitida/.test(a)));
        if (conocido && !incompleto) return conocido;

        let ia: EstadoCuentaParseado;
        try {
            ia = await leerConIa(this.gpt, lineas);
        } catch (e) {
            this.logger.warn(`Lectura con IA de "${nombre}" falló: ${(e as Error).message}`);
            if (conocido && conocido.movimientos.length > 0) {
                return { ...conocido, advertencias: [...conocido.advertencias, 'No se pudo completar la lectura con IA; se muestra solo lo que leyó el lector del banco.'] };
            }
            throw new BadRequestException(
                `Formato de archivo no reconocido y la lectura con IA falló (${(e as Error).message}). Formatos con lector exacto: ${FORMATOS_SOPORTADOS}.`,
            );
        }
        if (!conocido) return ia;
        if (ia.movimientos.length > conocido.movimientos.length) {
            return {
                ...ia,
                advertencias: [`El formato de ${conocido.formato} parece haber cambiado: el lector habitual no pudo leer todo y se usó la lectura con IA.`, ...ia.advertencias],
            };
        }
        return conocido;
    }
}

/** Filas de una hoja como líneas de texto ("celda | celda | celda") para la lectura con IA. */
function filasATexto(filas: FilaHoja[]): string[] {
    return filas.map((f) => f.filter((c) => c !== null && c !== '').join(' | '));
}
