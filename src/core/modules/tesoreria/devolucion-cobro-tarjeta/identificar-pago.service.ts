import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { TesoreriaService } from 'src/core/modules/tesoreria/tesoreria.service';

import { DevolucionCobroTarjetaService } from './devolucion-cobro-tarjeta.service';

// Casilleros de retención (con_cabece_impues.casillero_cncim) con que el procesador de tarjeta
// retiene sobre cada transacción: se resuelve su porcentaje VIGENTE desde con_vigenc_impues /
// con_detall_impues (igual que el motor de retenciones de compras), no un valor fijo.
const CASILLERO_RET_RENTA = '3440';
const CASILLERO_RET_IVA = '729';
// con_cabece_impues.ide_cnimp: 0 = IVA, 1 = renta.
const IDE_CNIMP_IVA = 0;
const IDE_CNIMP_RENTA = 1;
/** Cantidad máxima de pagos que puede cubrir una sola transferencia (poda del subset-sum). */
const MAX_PAGOS_COMBINACION = 6;
/** Tolerancia de redondeo por pago (centavos): la retención de IVA (70 %) suele caer en media centésima. */
const TOLERANCIA_POR_PAGO = 0.02;

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
    /** % de retención en la fuente (renta) vigente para el procesador; 0 si no aplica. */
    porcentajeRetRenta: number;
    /** % de retención de IVA vigente para el procesador; 0 si no aplica. */
    porcentajeRetIva: number;
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
        let ocr = await this.tesoreria.procesarImagenTransferencia(buffer, fileName, mimeType);
        // Un valor entero es sospechoso: en varios bancos los centavos van en superíndice pequeño y el
        // OCR los pierde. Se relee con Vision (distingue tamaños de fuente) y se acepta solo si confirma
        // la misma parte entera y agrega centavos.
        if (ocr.valor != null && ocr.valor > 0 && Number.isInteger(ocr.valor)) {
            try {
                const vision = await this.tesoreria.procesarImagenTransferenciaVision(buffer, mimeType, 'vision_centavos');
                if (vision.valor != null && Math.floor(vision.valor) === ocr.valor && vision.valor > ocr.valor) {
                    this.logger.log(`Centavos recuperados con Vision: ${ocr.valor} → ${vision.valor}`);
                    ocr = { ...ocr, valor: vision.valor, origen: vision.origen };
                }
            } catch (e) {
                this.logger.warn(`Relectura con Vision falló: ${(e as Error).message}`);
            }
        }
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
        if (pagos.length === 0) {
            // Solo se acepta coincidencia exacta (± redondeo): se deja rastro para calibrar las tasas.
            this.logger.warn(
                `Sin coincidencia para $${valor}. Tasas: ${JSON.stringify(tasas)}. `
                + `Pendientes (neto estimado/bruto): ${conNeto.map((p) => `#${p.secuencial_cccfa}=${p.netoEstimado}/${p.bruto}`).join(', ')}`,
            );
        }
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
        const retFuente = base * (tasas.porcentajeRetRenta / 100);
        const retIva = iva * (tasas.porcentajeRetIva / 100);
        return r2(bruto - comision - ivaComision - retFuente - retIva);
    }

    /**
     * Busca el pago —o la combinación de pagos— cuyo neto estimado coincide con el valor transferido.
     * Prefiere un único pago; si no, prueba combinaciones (una transferencia puede cubrir varios).
     * Solo tolera redondeo de centavos (TOLERANCIA_POR_PAGO por pago), nunca un porcentaje: dos pagos
     * de valor parecido no deben confundirse. Si más de un pago cuadra igual, es ambiguo y no se
     * sugiere ninguno (el usuario los marca a mano).
     */
    private buscarCoincidencia(pagos: PagoConNeto[], valor: number): PagoConNeto[] {
        const toleranciaPara = (cantidad: number) => TOLERANCIA_POR_PAGO * cantidad + 0.005;

        // 1) Un solo pago.
        const unicos = pagos.filter((p) => Math.abs(p.netoEstimado - valor) <= toleranciaPara(1));
        if (unicos.length === 1) return unicos;
        if (unicos.length > 1) return [];

        // 2) Combinación de pagos (subset-sum acotado): backtracking con poda sobre netos descendentes.
        const orden = [...pagos].sort((a, b) => b.netoEstimado - a.netoEstimado);
        let mejor: PagoConNeto[] | null = null;
        const buscar = (desde: number, actuales: PagoConNeto[], suma: number) => {
            if (mejor || actuales.length > MAX_PAGOS_COMBINACION) return;
            if (actuales.length >= 2 && Math.abs(suma - valor) <= toleranciaPara(actuales.length)) {
                mejor = [...actuales];
                return;
            }
            if (suma - valor > toleranciaPara(MAX_PAGOS_COMBINACION)) return; // ya se pasó (netos positivos)
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
                COALESCE(iva_comision_tecba, true) AS iva_comision,
                ide_geper_comision_tecba
            FROM tes_cuenta_banco
            WHERE ide_tecba = $1
        `);
        query.addIntParam(1, ideTecba);
        const row = await this.dataSource.createSingleQuery(query);
        if (!row) throw new BadRequestException('La cuenta de tarjeta no existe.');

        // ide_geper del procesador: define su tipo de contribuyente para el % de retención vigente.
        const ideGeperProcesador = row.ide_geper_comision_tecba != null ? Number(row.ide_geper_comision_tecba) : null;
        const [porcentajeRetRenta, porcentajeRetIva] = await Promise.all([
            this.getPorcentajeRetencionVigente(CASILLERO_RET_RENTA, IDE_CNIMP_RENTA, ideGeperProcesador),
            this.getPorcentajeRetencionVigente(CASILLERO_RET_IVA, IDE_CNIMP_IVA, ideGeperProcesador),
        ]);

        return {
            porcentajeComision: Number(row.porcentaje_comision) || 0,
            ivaComision: row.iva_comision === true || row.iva_comision === 'true',
            porcentajeRetRenta,
            porcentajeRetIva,
        };
    }

    /**
     * Porcentaje de retención VIGENTE de un casillero (por su código), para el tipo de contribuyente
     * del procesador: vigencia activa (con_vigenc_impues) → detalle (con_detall_impues), con fallback
     * al valor por defecto del casillero (con_cabece_impues.valor_defecto_cncim). Mismo criterio que
     * RetencionesCxpService.getPorcentajeImpuesto, pero anclado en el código de casillero y sin
     * exigir un tipo de documento (aquí solo se estima). 0 si no está configurado.
     */
    private async getPorcentajeRetencionVigente(
        casilleroCodigo: string,
        ideCnimp: number,
        ideGeperProcesador: number | null,
    ): Promise<number> {
        const q = new SelectQuery(`
            SELECT d.porcentaje_cndim
            FROM con_detall_impues d
            INNER JOIN con_vigenc_impues v ON v.ide_cnvim = d.ide_cnvim AND v.estado_cnvim IS TRUE
            INNER JOIN con_cabece_impues c ON c.ide_cncim = v.ide_cncim
            WHERE c.casillero_cncim = $1
              AND c.ide_cnimp = $2
              AND ($3::int IS NULL OR d.ide_cntco = (SELECT ide_cntco FROM gen_persona WHERE ide_geper = $3))
            ORDER BY d.porcentaje_cndim DESC
            LIMIT 1
        `);
        q.addStringParam(1, casilleroCodigo);
        q.addIntParam(2, ideCnimp);
        q.addParam(3, ideGeperProcesador);
        const row = await this.dataSource.createSingleQuery(q);
        if (row?.porcentaje_cndim != null) return Number(row.porcentaje_cndim);

        // Fallback: valor por defecto del casillero.
        const qDefecto = new SelectQuery(`
            SELECT valor_defecto_cncim
            FROM con_cabece_impues
            WHERE casillero_cncim = $1 AND ide_cnimp = $2
            LIMIT 1
        `);
        qDefecto.addStringParam(1, casilleroCodigo);
        qDefecto.addIntParam(2, ideCnimp);
        const defecto = await this.dataSource.createSingleQuery(qDefecto);
        return defecto?.valor_defecto_cncim != null ? Number(defecto.valor_defecto_cncim) : 0;
    }
}
