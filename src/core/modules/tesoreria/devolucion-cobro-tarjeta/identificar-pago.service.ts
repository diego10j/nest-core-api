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
// IVA 70 % (con_cabece_impues.ide_cncim 13). El '729' que había aquí no existe en el catálogo.
const CASILLERO_RET_IVA = '723';
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
    /**
     * Comisión + IVA de comisión REAL sobre el bruto (mediana de lo que el procesador ya liquidó en
     * esta cuenta). null si no hay historial: entonces se usa la comisión configurada.
     */
    factorComisionHistorico: number | null;
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
    /** Solo si no hubo coincidencia: tasas usadas y neto estimado del pago más cercano (para calibrar). */
    diagnostico?: string;
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

        let diagnostico: string | undefined;
        if (pagos.length === 0) {
            const cercano = [...conNeto].sort(
                (a, b) => Math.abs(a.netoEstimado - valor) - Math.abs(b.netoEstimado - valor),
            )[0];
            const comision = tasas.factorComisionHistorico != null
                ? `comisión+IVA ${r2(tasas.factorComisionHistorico * 100)}% (histórico)`
                : `comisión ${tasas.porcentajeComision}%${tasas.ivaComision ? '+IVA' : ''} (configurada)`;
            diagnostico = `${conNeto.length} pago(s) por acreditar. Tasas: ${comision}, ret. renta ${tasas.porcentajeRetRenta}%, ret. IVA ${tasas.porcentajeRetIva}%. `
                + (cercano
                    ? `Más cercano: ${cercano.secuencial_cccfa} (cobrado ${cercano.bruto}) con neto estimado ${cercano.netoEstimado}.`
                    : 'No hay pagos por acreditar.');
        }

        return {
            valorDetectado: valor,
            comprobante: ocr as unknown as Record<string, unknown>,
            pagos,
            netoEstimadoTotal,
            diferencia: r2(valor - netoEstimadoTotal),
            diagnostico,
        };
    }

    /** Neto que el procesador transferiría por un pago, estimado con las tasas configuradas. */
    private estimarNeto(pago: any, tasas: TasasCuenta): number {
        const bruto = Number(pago.valor_cobrado_tarjeta) || 0;
        const base = Number(pago.base_grabada_cccfa) || 0;
        const iva = Number(pago.valor_iva_cccfa) || 0;
        // Comisión + IVA: lo realmente liquidado en la cuenta manda sobre lo configurado.
        const comisionTotal = tasas.factorComisionHistorico != null
            ? bruto * tasas.factorComisionHistorico
            : bruto * (tasas.porcentajeComision / 100) * (tasas.ivaComision ? 1.15 : 1);
        const retFuente = base * (tasas.porcentajeRetRenta / 100);
        const retIva = iva * (tasas.porcentajeRetIva / 100);
        return r2(bruto - comisionTotal - retFuente - retIva);
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
        const [tablaRenta, tablaIva, historicas] = await Promise.all([
            this.getPorcentajeRetencionVigente(CASILLERO_RET_RENTA, IDE_CNIMP_RENTA, ideGeperProcesador),
            this.getPorcentajeRetencionVigente(CASILLERO_RET_IVA, IDE_CNIMP_IVA, ideGeperProcesador),
            this.getTasasHistoricas(ideTecba),
        ]);

        return {
            porcentajeComision: Number(row.porcentaje_comision) || 0,
            ivaComision: row.iva_comision === true || row.iva_comision === 'true',
            factorComisionHistorico: historicas.factorComision,
            // Lo realmente retenido en la cuenta manda; la tabla de impuestos es el respaldo.
            porcentajeRetRenta: historicas.pctRetRenta ?? tablaRenta,
            porcentajeRetIva: historicas.pctRetIva ?? tablaIva,
        };
    }

    /**
     * Tasas REALES que el procesador ya aplicó en las últimas acreditaciones vigentes de la cuenta:
     * comisión + IVA sobre el bruto, retención de renta sobre la base y retención de IVA sobre el IVA
     * de la factura. Cada una es la mediana de las liquidaciones reales; null si no hay datos. Manda
     * sobre lo configurado / tablas de impuestos, que pueden no estar cargados o no reflejar el contrato.
     */
    private async getTasasHistoricas(ideTecba: number): Promise<{
        factorComision: number | null;
        pctRetRenta: number | null;
        pctRetIva: number | null;
    }> {
        const q = new SelectQuery(`
            SELECT
                (tf.valor_comision_tedtf + COALESCE(tf.valor_iva_comision_tedtf, 0)) / tf.valor_cccfa_tedtf AS factor_comision,
                CASE WHEN cf.base_grabada_cccfa > 0 THEN tf.valor_ret_renta_tedtf / cf.base_grabada_cccfa END AS ratio_renta,
                CASE WHEN cf.valor_iva_cccfa > 0 THEN tf.valor_ret_iva_tedtf / cf.valor_iva_cccfa END AS ratio_iva
            FROM tes_det_devol_cobro_tarjeta_fact tf
            INNER JOIN tes_cab_devol_cobro_tarjeta c ON c.ide_tecdt = tf.ide_tecdt
            INNER JOIN cxc_cabece_factura cf ON cf.ide_cccfa = tf.ide_cccfa
            WHERE c.ide_tecba = $1
              AND c.anulado_tecdt = FALSE
              AND tf.valor_comision_tedtf IS NOT NULL
              AND tf.valor_cccfa_tedtf > 0
            ORDER BY tf.ide_tedtf DESC
            LIMIT 30
        `);
        q.addIntParam(1, ideTecba);
        const rows = (await this.dataSource.createSelectQuery(q)) as any[];

        // Los montos liquidados vienen redondeados a centavos: la mediana se lleva a la tarifa nominal
        // (a 2 decimales de porcentaje: 3,00 % y no 2,996 %) para no arrastrar ese ruido.
        const medianaNominal = (campo: string): number | null => {
            const v = rows.map((r) => Number(r[campo])).filter((n) => Number.isFinite(n) && n > 0).sort((x, y) => x - y);
            if (v.length === 0) return null;
            const m = Math.floor(v.length / 2);
            const mediana = v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
            return Math.round(mediana * 10000) / 10000;
        };
        const comision = medianaNominal('factor_comision');
        const renta = medianaNominal('ratio_renta');
        const iva = medianaNominal('ratio_iva');
        return {
            // Comisión + IVA de comisión (15 %): se nominaliza sobre la comisión sola (4,00 % y no 4,0019 %).
            factorComision: comision != null ? (Math.round((comision / 1.15) * 10000) / 10000) * 1.15 : null,
            // Las retenciones son tarifas redondas (3 %, 70 %, 2,75 %...): múltiplos de 0,25 %.
            pctRetRenta: renta != null ? Math.round(renta * 400) / 4 : null,
            pctRetIva: iva != null ? Math.round(iva * 400) / 4 : null,
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
        // Un detalle en 0 % (p. ej. IVA 70 % trae filas por tipo de contribuyente con 0,00) no es la
        // tarifa: se trata como "no configurado" y se usa el valor por defecto del casillero.
        if (row?.porcentaje_cndim != null && Number(row.porcentaje_cndim) > 0) return Number(row.porcentaje_cndim);

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
