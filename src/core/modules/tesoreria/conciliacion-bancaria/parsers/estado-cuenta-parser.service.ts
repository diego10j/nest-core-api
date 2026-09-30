import path from 'node:path';

import { BadRequestException, Injectable } from '@nestjs/common';

import type { EstadoCuentaParseado } from './estado-cuenta.types';
import { leerPrimeraHojaXlsx } from './lector-xlsx';
import { esDeuna, parsearDeuna, textoPaginasPdf } from './parser-deuna';
import { esGuayaquil, parsearGuayaquil } from './parser-guayaquil';
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

/**
 * Reconoce el banco de un archivo por su CONTENIDO (no por el nombre) y lo lee a una estructura
 * común. Para soportar un banco nuevo: agregar su parser en esta carpeta (detector `esXxx` +
 * `parsearXxx`) y una rama aquí; nada más del módulo cambia.
 */
@Injectable()
export class EstadoCuentaParserService {
    async leer(buffer: Buffer, nombreOriginal: string): Promise<EstadoCuentaLeido> {
        const ext = path.extname(nombreOriginal).toLowerCase();
        let parseado: EstadoCuentaParseado | null = null;

        try {
            if (ext === '.pdf') {
                const paginas = await textoPaginasPdf(buffer);
                if (esDeuna(paginas)) parseado = parsearDeuna(paginas);
            } else if (ext === '.csv') {
                const contenido = textoDeCsv(buffer);
                if (esPichincha(contenido)) parseado = parsearPichincha(contenido, nombreOriginal);
            } else if (ext === '.xlsx') {
                const filas = await leerPrimeraHojaXlsx(buffer);
                if (esGuayaquil(filas)) parseado = parsearGuayaquil(filas);
                else if (esProdubanco(filas)) parseado = parsearProdubanco(filas);
            } else if (ext === '.xls') {
                throw new BadRequestException('El formato .xls antiguo no se puede leer: ábralo en Excel y guárdelo como .xlsx.');
            }
        } catch (e) {
            if (e instanceof BadRequestException) throw e;
            throw new BadRequestException(`No se pudo leer el archivo "${nombreOriginal}": ${(e as Error).message}`);
        }

        if (!parseado) {
            throw new BadRequestException(`Formato de archivo no reconocido. Formatos soportados: ${FORMATOS_SOPORTADOS}.`);
        }
        if (parseado.movimientos.length === 0) {
            throw new BadRequestException(`El archivo se reconoció como ${parseado.formato} pero no contiene movimientos.`);
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
        return { ...parseado, saldoInicial: saldos.inicial, saldoFinal: saldos.final, cadenaConsistente: saldos.consistente };
    }
}
