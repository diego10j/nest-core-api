import { BadRequestException, Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { DocumentosCxPSaveService } from './documentos-cxp-save.service';
import { DocumentosCxPXmlService } from './documentos-cxp-xml.service';
import { ImportarXmlCxPResult } from './dto/importar-xml-cxp.dto';
import { DetalleDocumentoCxPDto } from './dto/save-documento-cxp.dto';

/** Variable del sistema: artículo por defecto (COMPRAS SERVICIOS LOGISTICOS) para el flete */
const VAR_ARTICULO_LOGISTICA = 'p_cxp_articulo_servicios_logisticos';

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

/**
 * Crea la factura por pagar (flete) de un envío del Reporte de Envío de Facturas,
 * a partir del XML de la factura electrónica del transportista. Migrado del flujo
 * "seleccionar XML → crear documento" pero fijando el artículo al de servicios
 * logísticos (variable p_cxp_articulo_servicios_logisticos), ya que la factura de
 * flete no tiene productos de inventario propios.
 */
@Injectable()
export class EnvioFacturaCxPService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly xmlService: DocumentosCxPXmlService,
        private readonly saveService: DocumentosCxPSaveService,
    ) { }

    async crearFacturaFleteDesdeXml(
        ideCctfa: number,
        fileBuffer: Buffer,
        dtoIn: HeaderParamsDto,
    ) {
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
        const detalles = this.buildDetalles(parsed, articulo);

        const [ideCndfp, ideCndfp1] = await Promise.all([
            this.resolverFormaPago(parsed.ide_cndfp),
            this.resolverDiasCredito(parsed.ide_cndfp1),
        ]);

        const result = await this.saveService.saveDocumento({
            ...dtoIn,
            cabecera: {
                ide_cntdo: parsed.ide_cntdo,
                ide_geper: parsed.ide_geper,
                numero_cpcfa: parsed.numero_cpcfa,
                autorizacio_cpcfa: parsed.autorizacio_cpcfa,
                fecha_emisi_cpcfa: parsed.fecha_emisi_cpcfa,
                ide_cndfp: ideCndfp,
                ide_cndfp1: ideCndfp1,
                observacion_cpcfa: `Flete envío factura #${envio.secuencial_cccfa}`,
            },
            detalles,
        });

        await this.linkFacturaAlEnvio(ideCctfa, result.ide_cpcfa);

        return { ...result, ide_cctfa: ideCctfa };
    }

    /** Retorna el artículo por defecto de servicios logísticos, para mostrarlo en el frontend antes de cargar el XML. */
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

    private buildDetalles(
        parsed: ImportarXmlCxPResult,
        articulo: ArticuloLogistica,
    ): DetalleDocumentoCxPDto[] {
        const buckets: { monto: number; iva: '1' | '-1' | '0' }[] = [
            { monto: parsed.totales.base_grabada, iva: '1' },
            { monto: parsed.totales.base_tarifa0, iva: '-1' },
            { monto: parsed.totales.base_no_objeto_iva, iva: '0' },
        ];

        const detalles: DetalleDocumentoCxPDto[] = [];
        let secuencial = 1;
        for (const bucket of buckets) {
            if (bucket.monto <= 0) continue;
            detalles.push({
                ide_inarti: articulo.ide_inarti,
                ide_inuni: articulo.ide_inuni ?? undefined,
                cantidad_cpdfa: 1,
                precio_cpdfa: bucket.monto,
                iva_inarti_cpdfa: bucket.iva,
                observacion_cpdfa: `${articulo.nombre_inarti} - Flete factura ${parsed.numero_cpcfa}`,
                secuencial_cpdfa: String(secuencial++),
                alter_tribu_cpdfa: '00',
            });
        }
        return detalles;
    }

    /** Forma de pago (medio) por defecto cuando el XML no trae un `formaPago` mapeable. */
    private async resolverFormaPago(ideCndfp: number | null): Promise<number> {
        if (ideCndfp) return ideCndfp;
        const q = new SelectQuery(`
            SELECT ide_cndfp FROM con_deta_forma_pago WHERE ide_cncfp = 3 ORDER BY ide_cndfp LIMIT 1
        `);
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

    private async linkFacturaAlEnvio(ideCctfa: number, ideCpcfa: number): Promise<void> {
        await this.dataSource.pool.query(
            `UPDATE cxc_transporte_factura SET ide_cpcfa = $1 WHERE ide_cctfa = $2`,
            [ideCpcfa, ideCctfa],
        );
    }
}
