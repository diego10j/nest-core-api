import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { ImportarXmlCxPResult } from './dto/importar-xml-cxp.dto';

/** Variable del sistema: artículo por defecto (COMPRAS SERVICIOS LOGISTICOS) para el flete */
const VAR_ARTICULO_LOGISTICA = 'p_cxp_articulo_servicios_logisticos';
/** Código ATS de sustento tributario preseleccionado por defecto (costo o gasto para Impuesto a la Renta) */
const SUSTENTO_DEFAULT = '02';
/** Fragmento (case-insensitive) para ubicar la forma de pago "Otros con utilización del Sistema Financiero" por defecto */
const FORMA_PAGO_DEFAULT_FRAGMENTO = '%SISTEMA FINANCIERO%';
/** cxp_detall_factur.observacion_cpdfa es varchar(200) - un XML con varias líneas (varias
 * guías) puede generar una concatenación más larga que eso y el INSERT falla en seco. */
const MAX_OBSERVACION_LEN = 200;

/** Recorta a lo que entra en las columnas varchar(200) de observación de este flujo
 * (cxp_detall_factur.observacion_cpdfa, cxp_det_flete_cons.observacion_cpdfc) - un INSERT con
 * un texto más largo falla en seco en vez de truncar solo. */
export function truncarObservacion(texto: string): string {
    if (texto.length <= MAX_OBSERVACION_LEN) return texto;
    return `${texto.slice(0, MAX_OBSERVACION_LEN - 1)}…`;
}

export interface ArticuloLogistica {
    ide_inarti: number;
    codigo_inarti: string | null;
    nombre_inarti: string;
    ide_inuni: number | null;
    siglas_inuni: string | null;
}

export interface ProductoPreFactura {
    ide_inarti: number;
    ide_inuni: number | null;
    siglas_inuni: string | null;
    nombre_inarti: string;
    codigo_inarti: string | null;
    cantidad: number;
    precio_unitario: number;
    observacion: string;
    iva: 'SI' | 'NO';
}

/**
 * Helpers compartidos para armar una factura de flete a partir del XML del transportista:
 * artículo fijo de servicios logísticos, agrupado de líneas por IVA, y resolución de forma de
 * pago/plazo/sustento tributario por defecto. El flujo de creación en sí (parseo + validación +
 * emparejamiento con él o los envíos + guardado) vive en FleteConsolidadoService/
 * FleteConsolidadoSaveService, que reusan estos métodos tanto para 1 envío como para varios -
 * ver "Registrar Envíos" en Ventas > Transportes.
 */
@Injectable()
export class EnvioFacturaCxPService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) { }

    /** Artículo por defecto de servicios logísticos (variable p_cxp_articulo_servicios_logisticos). */
    async getArticuloLogisticaDefault(): Promise<ArticuloLogistica> {
        const variables = await this.core.getVariables([VAR_ARTICULO_LOGISTICA]);
        const ideInarti = Number(variables.get(VAR_ARTICULO_LOGISTICA));
        if (!ideInarti) {
            throw new BadRequestException(
                `La variable del sistema '${VAR_ARTICULO_LOGISTICA}' no está configurada.`,
            );
        }
        const q = new SelectQuery(`
            SELECT a.ide_inarti, a.codigo_inarti, a.nombre_inarti, a.ide_inuni, u.siglas_inuni
            FROM inv_articulo a
            LEFT JOIN inv_unidad u ON u.ide_inuni = a.ide_inuni
            WHERE a.ide_inarti = $1
        `);
        q.addIntParam(1, ideInarti);
        const articulo: ArticuloLogistica | undefined = await this.dataSource.createSingleQuery(q);
        if (!articulo) {
            throw new BadRequestException(
                `El artículo por defecto de servicios logísticos (ide_inarti=${ideInarti}) no existe.`,
            );
        }
        return articulo;
    }

    /**
     * Agrupa los detalles reales del XML por tratamiento de IVA (grava / no grava) en, como
     * máximo, 2 líneas con el artículo fijo de servicios logísticos — la observación de cada
     * línea es la concatenación de las descripciones de detalle del XML que caen en ese grupo
     * (no un texto genérico), para que quede visible qué facturó el transportista.
     */
    buildProductos(
        parsed: ImportarXmlCxPResult,
        articulo: ArticuloLogistica,
    ): ProductoPreFactura[] {
        const grupos: Record<'SI' | 'NO', { monto: number; descripciones: string[] }> = {
            SI: { monto: 0, descripciones: [] },
            NO: { monto: 0, descripciones: [] },
        };

        for (const det of parsed.detalles) {
            const clave: 'SI' | 'NO' = det.iva_inarti_cpdfa === '1' ? 'SI' : 'NO';
            grupos[clave].monto += det.valor_cpdfa;
            const descripcion = det.observacion_cpdfa?.trim();
            if (descripcion && !grupos[clave].descripciones.includes(descripcion)) {
                grupos[clave].descripciones.push(descripcion);
            }
        }

        const productos: ProductoPreFactura[] = [];
        (['SI', 'NO'] as const).forEach((iva) => {
            const grupo = grupos[iva];
            if (grupo.monto <= 0) return;
            productos.push({
                ide_inarti: articulo.ide_inarti,
                ide_inuni: articulo.ide_inuni,
                siglas_inuni: articulo.siglas_inuni,
                nombre_inarti: articulo.nombre_inarti,
                codigo_inarti: articulo.codigo_inarti,
                cantidad: 1,
                precio_unitario: Number(grupo.monto.toFixed(2)),
                observacion: truncarObservacion(
                    grupo.descripciones.join(', ') || `Flete factura ${parsed.numero_cpcfa}`,
                ),
                iva,
            });
        });
        return productos;
    }

    /**
     * Forma de pago (medio) por defecto cuando el XML no trae un `formaPago` mapeable:
     * prioriza "Otros con utilización del Sistema Financiero" (medio bancarizado, el más
     * usual para pagos a transportistas) y cae al primer medio "contado" si no existe.
     */
    async resolverFormaPago(ideCndfp: number | null): Promise<number> {
        if (ideCndfp) return ideCndfp;
        const q = new SelectQuery(`
            SELECT ide_cndfp FROM con_deta_forma_pago
            WHERE ide_cncfp = 3
            ORDER BY (nombre_cndfp ILIKE $1) DESC, ide_cndfp
            LIMIT 1
        `);
        q.addStringParam(1, FORMA_PAGO_DEFAULT_FRAGMENTO);
        const row = await this.dataSource.createSingleQuery(q);
        if (!row) {
            throw new BadRequestException('No se encontró una forma de pago configurada para asignar por defecto.');
        }
        return Number(row.ide_cndfp);
    }

    /** Plazo de crédito por defecto (el de menor días, típicamente "Contado") cuando el proveedor no tiene uno configurado. */
    async resolverDiasCredito(ideCndfp1: number | null): Promise<number> {
        if (ideCndfp1) return ideCndfp1;
        const q = new SelectQuery(`
            SELECT ide_cndfp FROM con_deta_forma_pago
            WHERE ide_cncfp != 3
            ORDER BY dias_cndfp ASC, ide_cndfp ASC
            LIMIT 1
        `);
        const row = await this.dataSource.createSingleQuery(q);
        if (!row) {
            throw new BadRequestException('No se encontró un plazo de crédito configurado para asignar por defecto.');
        }
        return Number(row.ide_cndfp);
    }

    /** Sustento tributario por defecto (crédito tributario para IVA), con fallback al primero disponible. */
    async resolverSustentoTributario(): Promise<number> {
        const q = new SelectQuery(`
            SELECT ide_srtst FROM sri_tipo_sustento_tributario
            ORDER BY (alterno_srtst = $1) DESC, alterno_srtst
            LIMIT 1
        `);
        q.addStringParam(1, SUSTENTO_DEFAULT);
        const row = await this.dataSource.createSingleQuery(q);
        if (!row) {
            throw new BadRequestException('No se encontró un sustento tributario configurado para asignar por defecto.');
        }
        return Number(row.ide_srtst);
    }
}
