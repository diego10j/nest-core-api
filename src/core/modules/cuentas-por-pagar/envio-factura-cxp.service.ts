import { BadRequestException, Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { DocumentosCxPSaveService } from './documentos-cxp-save.service';
import { DocumentosCxPXmlService } from './documentos-cxp-xml.service';
import { ImportarXmlCxPResult } from './dto/importar-xml-cxp.dto';

/** Variable del sistema: artículo por defecto (COMPRAS SERVICIOS LOGISTICOS) para el flete */
const VAR_ARTICULO_LOGISTICA = 'p_cxp_articulo_servicios_logisticos';
/** Código ATS de sustento tributario preseleccionado por defecto (costo o gasto para Impuesto a la Renta) */
const SUSTENTO_DEFAULT = '02';
/** Fragmento (case-insensitive) para ubicar la forma de pago "Otros con utilización del Sistema Financiero" por defecto */
const FORMA_PAGO_DEFAULT_FRAGMENTO = '%SISTEMA FINANCIERO%';

export interface ArticuloLogistica {
    ide_inarti: number;
    codigo_inarti: string | null;
    nombre_inarti: string;
    ide_inuni: number | null;
    siglas_inuni: string | null;
}

interface EnvioParaFactura {
    ide_cctfa: number;
    ide_vgtra: number | null;
    ide_geper_transporte: number | null;
    nombre_vgtra: string | null;
    ide_cpcfa: number | null;
    secuencial_cccfa: string;
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

export interface PrefillFacturaFlete {
    ide_geper: number;
    nom_geper: string;
    identificac_geper: string;
    ide_cntdo: number;
    numero_cpcfa: string;
    autorizacio_cpcfa: string;
    fecha_emisi_cpcfa: string;
    ide_cndfp: number;
    ide_cndfp1: number;
    ide_srtst: number;
    productos: ProductoPreFactura[];
    /** <infoFactura><totalDescuento> del XML - ver DocumentosCxPXmlService.parseFacturaXml. */
    descuento_cpcfa: number;
}

/**
 * Parsea y valida el XML de la factura electrónica del transportista de un envío del
 * Reporte de Envío de Facturas, y arma la data lista para precargar el diálogo común
 * "Crear Factura de Compra" (CrearFacturaCxPDialog). NO persiste nada: el guardado real
 * lo hace el flujo estándar (saveDocumento) cuando el usuario confirma en el diálogo.
 */
@Injectable()
export class EnvioFacturaCxPService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly xmlService: DocumentosCxPXmlService,
        private readonly documentosCxPSaveService: DocumentosCxPSaveService,
    ) { }

    async prepararFacturaFleteDesdeXml(
        ideCctfa: number,
        fileBuffer: Buffer,
        dtoIn: HeaderParamsDto,
    ): Promise<PrefillFacturaFlete> {
        const envio = await this.getEnvio(ideCctfa);
        if (!envio) {
            throw new BadRequestException(`El envío ide_cctfa=${ideCctfa} no existe.`);
        }
        if (!envio.ide_vgtra || !envio.ide_geper_transporte) {
            throw new BadRequestException(
                'Este envío no tiene una empresa de transporte asignada: transporte propio o retiro en sucursal no requieren factura por pagar.',
            );
        }
        if (envio.ide_cpcfa) {
            throw new BadRequestException('Este envío ya tiene una factura por pagar registrada.');
        }

        const parsed = await this.xmlService.parseFacturaXml(fileBuffer, dtoIn);

        if (Number(parsed.ide_geper) !== Number(envio.ide_geper_transporte)) {
            throw new BadRequestException(
                `La factura del XML pertenece a "${parsed.nom_geper}", pero el transportista asignado a este envío es "${envio.nombre_vgtra}".`,
            );
        }

        const articulo = await this.getArticuloLogisticaDefault();
        const productos = this.buildProductos(parsed, articulo);

        const [ideCndfp, ideCndfp1, ideSrtst] = await Promise.all([
            this.resolverFormaPago(parsed.ide_cndfp),
            this.resolverDiasCredito(parsed.ide_cndfp1),
            this.resolverSustentoTributario(),
        ]);

        return {
            ide_geper: parsed.ide_geper,
            nom_geper: parsed.nom_geper,
            identificac_geper: parsed.identificac_geper,
            ide_cntdo: parsed.ide_cntdo,
            numero_cpcfa: parsed.numero_cpcfa,
            autorizacio_cpcfa: parsed.autorizacio_cpcfa,
            fecha_emisi_cpcfa: parsed.fecha_emisi_cpcfa,
            ide_cndfp: ideCndfp,
            ide_cndfp1: ideCndfp1,
            ide_srtst: ideSrtst,
            productos,
            descuento_cpcfa: parsed.totales.descuento,
        };
    }

    /**
     * Anula la factura de flete de un envío y deja todo listo para volver a cargar un XML
     * y registrar un nuevo pago:
     *  1. Anula el documento CxP (cxp_cabece_factur) vía DocumentosCxPSaveService.anularDocumento:
     *     estado anulado, reversa el/los pago(s) de tesorería ya registrados si existen (cambia
     *     de estado tes_cab_libr_banc, anula su asiento contable), anula el asiento propio del
     *     documento si tiene, borra la cuenta por pagar (cxp_cabece_transa/detalle) y anula el
     *     kardex si generó inventario.
     *  2. Desvincula el envío de la factura anulada (cxc_transporte_factura.ide_cpcfa = NULL).
     */
    async anularFacturaFlete(ideCctfa: number, dtoIn: HeaderParamsDto) {
        const envio = await this.getEnvio(ideCctfa);
        if (!envio) {
            throw new BadRequestException(`El envío ide_cctfa=${ideCctfa} no existe.`);
        }
        if (!envio.ide_cpcfa) {
            throw new BadRequestException('Este envío no tiene una factura por pagar registrada.');
        }
        const ideCpcfa = envio.ide_cpcfa;

        await this.documentosCxPSaveService.anularDocumento({ ...dtoIn, ide_cpcfa: ideCpcfa });

        await this.dataSource.pool.query(
            `UPDATE cxc_transporte_factura SET ide_cpcfa = NULL WHERE ide_cctfa = $1`,
            [ideCctfa],
        );

        return {
            message: 'ok',
            ide_cpcfa: ideCpcfa,
            ide_cctfa: ideCctfa,
        };
    }

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
    private buildProductos(
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
                observacion: grupo.descripciones.join(', ') || `Flete factura ${parsed.numero_cpcfa}`,
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
    private async resolverFormaPago(ideCndfp: number | null): Promise<number> {
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
    private async resolverDiasCredito(ideCndfp1: number | null): Promise<number> {
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
    private async resolverSustentoTributario(): Promise<number> {
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

    private async getEnvio(ideCctfa: number): Promise<EnvioParaFactura | undefined> {
        const q = new SelectQuery(`
            SELECT
                e.ide_cctfa,
                e.ide_vgtra,
                t.ide_geper AS ide_geper_transporte,
                t.nombre_vgtra,
                e.ide_cpcfa,
                f.secuencial_cccfa
            FROM cxc_transporte_factura e
            INNER JOIN cxc_cabece_factura f ON e.ide_cccfa = f.ide_cccfa
            LEFT JOIN ven_transporte t ON e.ide_vgtra = t.ide_vgtra
            WHERE e.ide_cctfa = $1
        `);
        q.addIntParam(1, ideCctfa);
        return this.dataSource.createSingleQuery(q);
    }
}
