import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { DocumentosCxPService } from './documentos-cxp.service';
import { DetalleXmlCxP, ImportarXmlCxPResult } from './dto/importar-xml-cxp.dto';

/** Código SRI de comprobante tipo factura */
const COD_DOC_FACTURA = '01';
/** Código SRI de porcentaje IVA 0% */
const COD_PORCENTAJE_IVA_0 = '0';
/** Código SRI de no objeto de impuesto */
const COD_PORCENTAJE_NO_OBJETO = '6';
/** Tipo de documento CxP "Factura" (variable p_con_tipo_documento_factura) */
const VAR_TIPO_DOC_FACTURA = 'p_con_tipo_documento_factura';

/**
 * Parsea un XML de factura electrónica del SRI (Ecuador) y retorna la data
 * lista para poblar el formulario del documento CxP. NO persiste nada.
 * Migrado de DocumentoCxP.seleccionarArchivoXML del legacy.
 */
@Injectable()
export class DocumentosCxPXmlService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly consultas: DocumentosCxPService,
    ) { }

    async parseFacturaXml(
        fileBuffer: Buffer,
        _dtoIn: HeaderParamsDto,
    ): Promise<ImportarXmlCxPResult> {
        try {
            // Los XML de autorización del SRI traen el comprobante escapado
            // dentro de <comprobante>; se des-escapa igual que el legacy
            const xml = fileBuffer
                .toString('utf8')
                .replace(/&gt;/g, '>')
                .replace(/&lt;/g, '<');

            const $ = cheerio.load(xml, { xml: true });

            // ── Validaciones ─────────────────────────────────────────────────
            const codDoc = this.texto($, 'codDoc');
            if (codDoc !== COD_DOC_FACTURA) {
                throw new BadRequestException('Tipo de comprobante no válido: el XML no es una factura.');
            }

            const ruc = this.texto($, 'infoTributaria ruc') || this.texto($, 'ruc');
            const proveedor = await this.getProveedorPorRuc(ruc);
            if (!proveedor) {
                const razonSocial = this.texto($, 'razonSocial');
                throw new BadRequestException(
                    `El proveedor ${razonSocial || ruc} no existe en la base de datos.`,
                );
            }

            const autorizacion = this.texto($, 'numeroAutorizacion') || this.texto($, 'claveAcceso');
            if (!autorizacion) {
                throw new BadRequestException('El XML no contiene número de autorización ni clave de acceso.');
            }
            const { existe } = await this.consultas.existeDocumentoElectronico(autorizacion);
            if (existe) {
                throw new BadRequestException('La factura electrónica seleccionada ya se encuentra registrada.');
            }

            // ── Cabecera ─────────────────────────────────────────────────────
            const numero = `${this.texto($, 'estab')}-${this.texto($, 'ptoEmi')}-${this.texto($, 'secuencial')}`;
            const fechaEmision = this.parseFecha(this.texto($, 'fechaEmision'));
            const ideCndfp = await this.getFormaPagoPorCodigoSri(this.texto($, 'formaPago'));

            const ideCndfp1 = proveedor.ide_cndfp ?? null;
            const diasCredito = ideCndfp1 !== null
                ? await this.consultas.getDiasCreditoFormaPago(Number(ideCndfp1))
                : 0;

            // ── Detalles ─────────────────────────────────────────────────────
            const detalles: DetalleXmlCxP[] = [];
            $('detalles > detalle').each((_, el) => {
                const det = $(el);
                const codigoPorcentaje = det.find('impuestos impuesto codigoPorcentaje').first().text().trim();
                let ivaInarti: DetalleXmlCxP['iva_inarti_cpdfa'] = '1';
                if (codigoPorcentaje === COD_PORCENTAJE_IVA_0) ivaInarti = '-1';
                else if (codigoPorcentaje === COD_PORCENTAJE_NO_OBJETO) ivaInarti = '0';

                detalles.push({
                    cantidad_cpdfa: this.numero(det.find('cantidad').first().text(), 3),
                    observacion_cpdfa: det.find('descripcion').first().text().trim(),
                    precio_cpdfa: this.numero(det.find('precioUnitario').first().text()),
                    valor_cpdfa: this.numero(det.find('precioTotalSinImpuesto').first().text()),
                    iva_inarti_cpdfa: ivaInarti,
                    codigo_principal: det.find('codigoPrincipal').first().text().trim() || undefined,
                });
            });
            if (detalles.length === 0) {
                throw new BadRequestException('El XML no contiene detalles de la factura.');
            }

            // ── Totales (recalculados localmente, paridad legacy) ────────────
            const tarifaIva = await this.consultas.getPorcentajeIva(fechaEmision);
            const totales = this.calcularTotales(detalles, tarifaIva);

            const variables = await this.core.getVariables([VAR_TIPO_DOC_FACTURA]);

            return {
                ide_geper: Number(proveedor.ide_geper),
                nom_geper: proveedor.nom_geper,
                identificac_geper: proveedor.identificac_geper,
                ide_cntdo: Number(variables.get(VAR_TIPO_DOC_FACTURA) ?? 0),
                numero_cpcfa: numero,
                autorizacio_cpcfa: autorizacion,
                fecha_emisi_cpcfa: fechaEmision,
                ide_cndfp: ideCndfp,
                ide_cndfp1: ideCndfp1 !== null ? Number(ideCndfp1) : null,
                dias_credito_cpcfa: diasCredito,
                detalles,
                totales: { ...totales, tarifa_iva: tarifaIva },
            };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al leer la factura XML: ${msg}`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS PRIVADOS
    // ─────────────────────────────────────────────────────────────────────────

    private texto($: cheerio.CheerioAPI, selector: string): string {
        return $(selector).first().text().trim();
    }

    private numero(valor: string, decimales = 2): number {
        const num = Number.parseFloat(valor);
        if (Number.isNaN(num)) return 0;
        return Number(num.toFixed(decimales));
    }

    /** Convierte la fecha del SRI (dd/MM/yyyy) a formato Postgres (yyyy-MM-dd) */
    private parseFecha(fecha: string): string {
        const match = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(fecha);
        if (!match) {
            throw new BadRequestException(`La fecha de emisión del XML no es válida: ${fecha}`);
        }
        return `${match[3]}-${match[2]}-${match[1]}`;
    }

    private async getProveedorPorRuc(ruc: string) {
        if (!ruc) return undefined;
        const q = new SelectQuery(`
            SELECT ide_geper, nom_geper, identificac_geper, ide_cndfp
            FROM gen_persona
            WHERE identificac_geper = $1
              AND es_proveedo_geper = TRUE
            LIMIT 1
        `);
        q.addStringParam(1, ruc);
        return this.dataSource.createSingleQuery(q);
    }

    /** Mapea el código de forma de pago SRI a con_deta_forma_pago.alterno_ats */
    private async getFormaPagoPorCodigoSri(codigoSri: string): Promise<number | null> {
        if (!codigoSri) return null;
        const q = new SelectQuery(`
            SELECT ide_cndfp
            FROM con_deta_forma_pago
            WHERE alterno_ats = $1
            LIMIT 1
        `);
        q.addStringParam(1, codigoSri);
        const row = await this.dataSource.createSingleQuery(q);
        return row ? Number(row.ide_cndfp) : null;
    }

    /** Mismo cálculo que el save: el IVA se recalcula localmente por tipo de línea */
    private calcularTotales(detalles: DetalleXmlCxP[], tarifaIva: number) {
        let baseGrabada = 0;
        let baseTarifa0 = 0;
        let baseNoObjeto = 0;

        for (const det of detalles) {
            switch (det.iva_inarti_cpdfa) {
                case '1':
                    baseGrabada += det.valor_cpdfa;
                    break;
                case '-1':
                    baseTarifa0 += det.valor_cpdfa;
                    break;
                case '0':
                    baseNoObjeto += det.valor_cpdfa;
                    break;
            }
        }

        const valorIva = Number((baseGrabada * tarifaIva).toFixed(2));
        const total = Number((baseGrabada + baseTarifa0 + baseNoObjeto + valorIva).toFixed(2));

        return {
            base_grabada: Number(baseGrabada.toFixed(2)),
            base_tarifa0: Number(baseTarifa0.toFixed(2)),
            base_no_objeto_iva: Number(baseNoObjeto.toFixed(2)),
            valor_iva: valorIva,
            total,
        };
    }
}
