import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { TesoreriaService } from 'src/core/modules/tesoreria/tesoreria.service';

import { DevolucionCobroTarjetaService } from './devolucion-cobro-tarjeta.service';

/** Retenciones que la empresa aplica al procesador, tasas estándar (servicios): 3% renta, 70% IVA. */
const RET_FUENTE = 0.03;
const RET_IVA = 0.70;
/** Cantidad máxima de pagos que puede cubrir una sola transferencia (poda del subset-sum). */
const MAX_PAGOS_COMBINACION = 6;

const r2 = (n: number): number => Number((Number(n) || 0).toFixed(2));

/** Un pago pendiente de acreditar con su neto ESTIMADO (lo que el procesador transferiría por él). */
interface PagoConNeto {
    ide_cccfa: number;
    secuencial_cccfa: string;
    fecha_emisi_cccfa: string;
    nom_geper: string;
    bruto: number;
    netoEstimado: number;
}

interface TasasCuenta {
    porcentajeComision: number;
    ivaComision: boolean;
}

export interface SugerenciaIdentificacion {
    /** Valor que el OCR/IA leyó en el comprobante bancario (neto transferido). */
    valorDetectado: number;
    /** Datos que el OCR/IA leyó del comprobante (para prellenar la transferencia). */
    comprobante: Record<string, unknown>;
    /** Pagos cuyo neto estimado coincide (1 pago o combinación). Vacío si no se encontró. */
    pagos: PagoConNeto[];
    /** Suma de los netos estimados de los pagos sugeridos. */
    netoEstimadoTotal: number;
    /** Diferencia entre el valor detectado y el neto estimado de la sugerencia. */
    diferencia: number;
}

/**
 * Identifica a qué pago(s) pendiente(s) corresponde una acreditación cuando SOLO se tiene la imagen
 * del banco (no llegó el Excel ni el PDF de liquidación). Del comprobante se lee el neto transferido
 * (OCR/IA ya existente) y se busca el pago —o la combinación de pagos— cuyo neto ESTIMADO coincide.
 *
 * El neto se estima con las tasas configuradas de la cuenta de tarjeta (comisión e IVA de comisión) y
 * las retenciones estándar (3% renta sobre la base, 70% IVA). Solo IDENTIFICA: la comisión y la
 * retención reales llegan después con el corte del procesador; no se guardan estimadas.
 */
@Injectable()
export class IdentificarPagoService extends BaseService {
    private readonly logger = new Logger(IdentificarPagoService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly tesoreria: TesoreriaService,
        private readonly devolucionService: DevolucionCobroTarjetaService,
    ) {
        super();
    }

    async identificarPorComprobante(
        buffer: Buffer,
        fileName: string,
        mimeType: string,
        ideTecba: number,
        headers: HeaderParamsDto,
    ): Promise<SugerenciaIdentificacion> {
        const ocr = await this.tesoreria.procesarImagenTransferencia(buffer, fileName, mimeType);
        const valor = r2(ocr.valor ?? 0);
        if (valor <= 0) {
            throw new BadRequestException('No se detectó el valor de la transferencia en el comprobante.');
        }

        const tasas = await this.getTasasCuenta(ideTecba, headers);
        const pendientes = await this.devolucionService.getFacturasTarjetaPendientes({ ...headers, ideTecba });
        const conNeto: PagoConNeto[] = pendientes
            .filter((p: any) => p.ide_tecdt === null) // solo lo que falta ACREDITAR
            .map((p: any) => ({
                ide_cccfa: p.ide_cccfa,
                secuencial_cccfa: p.secuencial_cccfa,
                fecha_emisi_cccfa: p.fecha_emisi_cccfa,
                nom_geper: p.nom_geper,
                bruto: r2(p.valor_cobrado_tarjeta),
                netoEstimado: this.estimarNeto(p, tasas),
            }));

        const pagos = this.buscarCoincidencia(conNeto, valor);
        const netoEstimadoTotal = r2(pagos.reduce((s, p) => s + p.netoEstimado, 0));

        return {
            valorDetectado: valor,
            comprobante: ocr as unknown as Record<string, unknown>,
            pagos,
            netoEstimadoTotal,
            diferencia: r2(valor - netoEstimadoTotal),
        };
    }

    /** Neto que el procesador transferiría por un pago, estimado con las tasas configuradas. */
    private estimarNeto(pago: any, tasas: TasasCuenta): number {
        const bruto = Number(pago.valor_cobrado_tarjeta) || 0;
        const base = Number(pago.base_grabada_cccfa) || 0;
        const iva = Number(pago.valor_iva_cccfa) || 0;
        const comision = bruto * (tasas.porcentajeComision / 100);
        const ivaComision = tasas.ivaComision ? comision * 0.15 : 0;
        const retFuente = base * RET_FUENTE;
        const retIva = iva * RET_IVA;
        return r2(bruto - comision - ivaComision - retFuente - retIva);
    }

    /**
     * Busca el pago —o la combinación de pagos— cuyo neto estimado coincide con el valor transferido.
     * Prefiere un único pago; si no, prueba combinaciones (una transferencia puede cubrir varios).
     * Tolerancia relativa por si la comisión/retención tiene pequeños redondeos.
     */
    private buscarCoincidencia(pagos: PagoConNeto[], valor: number): PagoConNeto[] {
        const tolerancia = Math.max(0.10, valor * 0.01);

        // 1) Un solo pago (el más cercano dentro de la tolerancia).
        let mejorUno: PagoConNeto | null = null;
        for (const p of pagos) {
            if (Math.abs(p.netoEstimado - valor) <= tolerancia) {
                if (!mejorUno || Math.abs(p.netoEstimado - valor) < Math.abs(mejorUno.netoEstimado - valor)) {
                    mejorUno = p;
                }
            }
        }
        if (mejorUno) return [mejorUno];

        // 2) Combinación de pagos (subset-sum acotado): backtracking con poda sobre netos descendentes.
        const orden = [...pagos].sort((a, b) => b.netoEstimado - a.netoEstimado);
        let mejor: PagoConNeto[] | null = null;
        const buscar = (desde: number, actuales: PagoConNeto[], suma: number) => {
            if (mejor || actuales.length > MAX_PAGOS_COMBINACION) return;
            if (actuales.length >= 2 && Math.abs(suma - valor) <= tolerancia) {
                mejor = [...actuales];
                return;
            }
            if (suma - valor > tolerancia) return; // ya se pasó (netos positivos)
            for (let i = desde; i < orden.length; i++) {
                actuales.push(orden[i]);
                buscar(i + 1, actuales, r2(suma + orden[i].netoEstimado));
                actuales.pop();
                if (mejor) return;
            }
        };
        buscar(0, [], 0);
        return mejor ?? [];
    }

    private async getTasasCuenta(ideTecba: number, _headers: HeaderParamsDto): Promise<TasasCuenta> {
        const query = new SelectQuery(`
            SELECT
                COALESCE(porcentaje_comision_tecba, 0) AS porcentaje_comision,
                COALESCE(iva_comision_tecba, true) AS iva_comision
            FROM tes_cuenta_banco
            WHERE ide_tecba = $1
        `);
        query.addIntParam(1, ideTecba);
        const row = await this.dataSource.createSingleQuery(query);
        if (!row) throw new BadRequestException('La cuenta de tarjeta no existe.');
        return {
            porcentajeComision: Number(row.porcentaje_comision) || 0,
            ivaComision: row.iva_comision === true || row.iva_comision === 'true',
        };
    }
}
