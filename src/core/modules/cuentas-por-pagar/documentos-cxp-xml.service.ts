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
/** Longitudes válidas de autorización SRI (10 física, 37/49 clave de acceso) - mismo criterio que documentos-cxp-save.service.ts */
const LONGITUDES_AUTORIZACION = [10, 37, 49];
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
            // Los XML de autorización del SRI traen el comprobante real anidado dentro de
            // <comprobante>, con dos formatos posibles según el emisor/herramienta:
            //  a) escapado con entities (&lt;factura&gt;...&lt;/factura&gt;) - el unescape
            //     global de abajo ya lo deja como elementos reales, navegables de una.
            //  b) envuelto en CDATA (<![CDATA[<factura>...]]>) - el contenido nunca se
            //     parsea como elementos hijos (queda como nodo de texto/CDATA), así que
            //     $('codDoc') no lo encuentra en el primer intento.
            // Por eso el re-parseo del contenido de <comprobante> es un FALLBACK: solo se
            // usa cuando el primer intento no encontró codDoc, nunca incondicional - hacerlo
            // siempre rompe el caso (a), porque para ese caso el texto ya viene "aplanado"
            // (sin tags) por el momento en que se llega a leerlo con .text().
            const xmlExterior = fileBuffer
                .toString('utf8')
                .replace(/&gt;/g, '>')
                .replace(/&lt;/g, '<');

            let $ = cheerio.load(xmlExterior, { xml: true });

            // El sobre <autorizacion> (fechaAutorizacion, ambiente en texto PRODUCCION/PRUEBAS)
            // nunca viene en CDATA - solo <comprobante> puede estarlo - así que estos dos se
            // leen del primer parseo, antes de reasignar $ más abajo (si el fallback CDATA
            // reemplaza $ por el <factura> interior, el sobre <autorizacion> ya no es alcanzable).
            const fechaAutorizacionSobre = this.texto($, 'fechaAutorizacion');
            const ambienteSobre = this.texto($, 'ambiente');

            if (!this.texto($, 'codDoc')) {
                const comprobanteInterior = $('comprobante').first().text().trim();
                if (comprobanteInterior) {
                    $ = cheerio.load(comprobanteInterior, { xml: true });
                }
            }

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
            if (!LONGITUDES_AUTORIZACION.includes(autorizacion.length)) {
                throw new BadRequestException(
                    `El número de autorización del XML es inválido: tiene ${autorizacion.length} dígitos (debe tener 10, 37 o 49). El archivo puede estar truncado o corrupto.`,
                );
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
                    codigo_auxiliar: det.find('codigoAuxiliar').first().text().trim() || undefined,
                    descuento_cpdfa: this.numero(det.find('descuento').first().text()),
                });
            });
            if (detalles.length === 0) {
                throw new BadRequestException('El XML no contiene detalles de la factura.');
            }

            // ── Totales (recalculados localmente, paridad legacy) ────────────
            // <infoFactura><totalDescuento> - suma de los <descuento> de cada línea (Ficha
            // Técnica SRI). Los detalles ya llegan netos (valor_cpdfa = precioTotalSinImpuesto,
            // que ya resta el descuento de esa línea), así que este total no se vuelve a restar
            // de las bases aquí - sólo se expone para que el documento CxP lo registre
            // (cxp_cabece_factur.descuento_cpcfa), que hoy se guardaba en 0 aunque el XML sí
            // traía descuento.
            const descuentoXml = this.numero(this.texto($, 'totalDescuento'));
            const tarifaIva = await this.consultas.getPorcentajeIva(fechaEmision);
            const totales = this.calcularTotales(detalles, tarifaIva);

            const variables = await this.core.getVariables([VAR_TIPO_DOC_FACTURA]);

            // Solo para el RIDE (vista previa) - el proveedor real a usar en el documento CxP
            // sigue siendo el de gen_persona (getProveedorPorRuc), estos campos son tal cual
            // vienen en el XML.
            const claveAcceso = this.texto($, 'claveAcceso');
            const razonSocialEmisor = this.texto($, 'razonSocial');
            const nombreComercialEmisor = this.texto($, 'nombreComercial');
            const dirMatrizEmisor = this.texto($, 'dirMatriz');
            const dirEstablecimientoEmisor = this.texto($, 'dirEstablecimiento');
            const tipoEmisionRaw = this.texto($, 'tipoEmision');
            const razonSocialComprador = this.texto($, 'razonSocialComprador');
            const identificacionComprador = this.texto($, 'identificacionComprador');

            const infoAdicional: { nombre: string; valor: string }[] = [];
            $('infoAdicional campoAdicional').each((_, el) => {
                const campo = $(el);
                const nombre = (campo.attr('nombre') || '').trim();
                const valor = campo.text().trim();
                if (nombre && valor) infoAdicional.push({ nombre, valor });
            });

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
                totales: { ...totales, tarifa_iva: tarifaIva, descuento: descuentoXml },
                emisor: {
                    ruc,
                    razonSocial: razonSocialEmisor || proveedor.nom_geper,
                    nombreComercial: nombreComercialEmisor || undefined,
                    direccionMatriz: dirMatrizEmisor || undefined,
                    direccionEstablecimiento:
                        dirEstablecimientoEmisor && dirEstablecimientoEmisor !== dirMatrizEmisor
                            ? dirEstablecimientoEmisor
                            : undefined,
                },
                comprobante: {
                    tipo: 'FACTURA',
                    numero,
                    claveAcceso: claveAcceso || autorizacion,
                    autorizacion,
                    fechaEmision,
                    fechaAutorizacion: fechaAutorizacionSobre || undefined,
                    ambiente: this.mapAmbiente(ambienteSobre),
                    emision: this.mapTipoEmision(tipoEmisionRaw),
                },
                comprador: {
                    razonSocial: razonSocialComprador || undefined,
                    identificacion: identificacionComprador || undefined,
                },
                infoAdicional,
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

    /** El sobre <autorizacion> trae "PRODUCCION"/"PRUEBAS" en texto; <infoTributaria> (fallback
     * CDATA) lo trae como código numérico '1'/'2' - se normaliza a texto legible para el RIDE. */
    private mapAmbiente(valor: string): string | undefined {
        if (!valor) return undefined;
        const v = valor.trim().toUpperCase();
        if (v === '1') return 'PRUEBAS';
        if (v === '2') return 'PRODUCCIÓN';
        return v;
    }

    /** <tipoEmision> del SRI: '1' = NORMAL, cualquier otro valor (o vacío) también se muestra
     * como NORMAL - es la inmensa mayoría de los casos; la contingencia offline es un caso muy
     * raro que no vale la pena distinguir en el RIDE. */
    private mapTipoEmision(valor: string): string {
        return !valor || valor.trim() === '1' ? 'NORMAL' : valor.trim();
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
