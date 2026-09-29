import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BdtIaService } from 'src/core/modules/base-tecnica/bdt-ia.service';
import { extraerTextoPdf, textoConPaginas } from 'src/core/modules/base-tecnica/helpers/pdf-texto.helper';

import {
    LiquidacionExtraidaIa,
    PROMPT_LIQUIDACION_TARJETA,
    SCHEMA_LIQUIDACION_TARJETA,
} from './prompts/liquidacion-tarjeta.prompt';

/** Una transacción del comprobante de pago, con la forma que espera el frontend (FilaLiquidacion). */
export interface FilaLiquidacionPdf {
    fila: number;
    fechaTransaccion: string;
    numeroLiquidacion: string;
    numeroVale: string;
    autorizacion: string;
    subtotal: number;
    iva: number;
    bruto: number;
    comision: number;
    ivaComision: number;
    retIva: number;
    retRenta: number;
    neto: number;
    numeroDocumentoDeposito: string;
    fechaDeposito: string;
    estadoPago: string;
    /** true si neto = bruto − comisión − IVA comisión − retención (control de la lectura). */
    netoCuadra: boolean;
}

/** Máxima diferencia (redondeo) para dar por buena la aritmética de una fila. */
const TOLERANCIA = 0.02;

const r2 = (n: number): number => Number((Number(n) || 0).toFixed(2));

/**
 * Lee el PDF "Comprobante de Pago" del procesador de tarjeta (Bendo) y devuelve una fila por
 * transacción, con la misma forma que el Excel de liquidación produce en el frontend, para que el
 * emparejamiento contra los pagos pendientes no cambie según el formato del archivo.
 *
 * El texto se extrae reconstruyendo las filas por coordenadas (reutilizando base-tecnica, con la
 * rotación de la página aplicada porque el comprobante viene apaisado) y la IA lo mapea a los campos.
 * Se prefiere IA a un parser por posición para tolerar cambios de formato del procesador; la
 * aritmética de cada fila (neto = bruto − comisión − IVA comisión − retenciones) se revalida aquí.
 */
@Injectable()
export class LiquidacionPdfService {
    private readonly logger = new Logger(LiquidacionPdfService.name);

    constructor(private readonly ia: BdtIaService) { }

    async parsearLiquidacionPdf(buffer: Buffer): Promise<FilaLiquidacionPdf[]> {
        const pdf = await extraerTextoPdf(buffer, { rotarPagina: true });
        if (pdf.escaneado) {
            throw new BadRequestException(
                'El PDF parece escaneado (sin texto). Suba el comprobante de pago original del procesador.',
            );
        }

        const texto = textoConPaginas(pdf.paginas);
        let datos: LiquidacionExtraidaIa;
        try {
            const respuesta = await this.ia.completarJson<LiquidacionExtraidaIa>(
                [
                    { role: 'system', content: PROMPT_LIQUIDACION_TARJETA },
                    { role: 'user', content: `DOCUMENTO:\n${texto}` },
                ],
                SCHEMA_LIQUIDACION_TARJETA as unknown as Record<string, unknown>,
                'liquidacion_tarjeta',
                { temperatura: 0 },
            );
            datos = respuesta.datos;
        } catch (error) {
            this.logger.error(`Error extrayendo la liquidación del PDF: ${(error as Error).message}`);
            throw new BadRequestException('No se pudo leer el PDF de liquidación. Intente de nuevo o use el Excel.');
        }

        const transacciones = (datos?.transacciones ?? []).filter((t) => r2(t.bruto) > 0);
        if (transacciones.length === 0) {
            throw new BadRequestException(
                'No se reconocieron transacciones en el PDF. Verifique que sea el comprobante de pago del procesador.',
            );
        }

        return transacciones.map((t, i) => {
            const bruto = r2(t.bruto);
            const comision = r2(t.comision);
            const ivaComision = r2(t.ivaComision);
            const retIva = r2(t.retIva);
            const retRenta = r2(t.retRenta);
            const neto = r2(t.neto);
            return {
                fila: i + 1,
                // El comprobante no trae la fecha de la factura; el emparejamiento la usa solo como
                // desempate, así que se deja vacía en vez de forzar la fecha de depósito.
                fechaTransaccion: '',
                numeroLiquidacion: (t.numeroLiquidacion ?? '').replace(/\s+/g, ''),
                numeroVale: '',
                autorizacion: '',
                subtotal: r2(t.subtotal),
                iva: r2(t.iva),
                bruto,
                comision,
                ivaComision,
                retIva,
                retRenta,
                neto,
                numeroDocumentoDeposito: (t.numeroDocumento ?? '').replace(/\s+/g, ''),
                fechaDeposito: (t.fecha ?? '').trim(),
                // Un comprobante de pago es una liquidación ya transferida.
                estadoPago: 'LIQUIDADO',
                netoCuadra: Math.abs(bruto - comision - ivaComision - retIva - retRenta - neto) <= TOLERANCIA,
            };
        });
    }
}
