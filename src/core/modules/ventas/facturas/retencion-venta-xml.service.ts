import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';

import { DetalleXmlRetencion, ImportarXmlRetencionResult } from './dto/importar-xml-retencion.dto';

/** Código SRI de comprobante tipo retención */
const COD_DOC_RETENCION = '07';

/**
 * Parsea un XML de comprobante de retención electrónico del SRI (codDoc=07) recibido de un
 * tercero que actúa como agente de retención sobre pagos que nos realiza (ej. Bendo, Payphone
 * u otro procesador de tarjeta reteniendo IVA/Renta sobre el depósito de una venta con
 * tarjeta - ver con_cabece_impues/con_detall_retenc). Retorna la data lista para el resumen de
 * confirmación en el frontend. NO persiste nada - ver RetencionVentaSaveService.
 */
@Injectable()
export class RetencionVentaXmlService {
    constructor(private readonly dataSource: DataSourceService) { }

    async parseRetencionXml(
        fileBuffer: Buffer,
        dtoIn: HeaderParamsDto,
    ): Promise<ImportarXmlRetencionResult> {
        try {
            // Los XML de autorización del SRI traen el comprobante escapado dentro de
            // <comprobante>; se des-escapa (mismo patrón que DocumentosCxPXmlService).
            const xml = fileBuffer
                .toString('utf8')
                .replace(/&gt;/g, '>')
                .replace(/&lt;/g, '<');

            let $ = cheerio.load(xml, { xml: true });

            // Los XML de autorización del SRI traen el comprobante real anidado dentro de
            // <comprobante>, con dos formatos posibles según el emisor/herramienta:
            //  a) escapado con entities (&lt;comprobanteRetencion&gt;...) - el unescape global
            //     de arriba ya lo deja como elementos reales, navegables de una.
            //  b) envuelto en CDATA (<![CDATA[<comprobanteRetencion>...]]>) - el contenido
            //     nunca se parsea como elementos hijos (queda como nodo de texto/CDATA), así
            //     que $('codDoc') no lo encuentra en el primer intento (caso Bendo).
            // Por eso el re-parseo del contenido de <comprobante> es un FALLBACK: solo se usa
            // cuando el primer intento no encontró codDoc (mismo patrón que
            // DocumentosCxPXmlService).
            if (!this.texto($, 'codDoc')) {
                const comprobanteInterior = $('comprobante').first().text().trim();
                if (comprobanteInterior) {
                    $ = cheerio.load(comprobanteInterior, { xml: true });
                }
            }

            const codDoc = this.texto($, 'codDoc');
            if (codDoc !== COD_DOC_RETENCION) {
                throw new BadRequestException(
                    'Tipo de comprobante no válido: el XML no es un comprobante de retención (codDoc=07).',
                );
            }

            const autorizacion = this.texto($, 'numeroAutorizacion') || this.texto($, 'claveAcceso');
            if (!autorizacion) {
                throw new BadRequestException('El XML no contiene número de autorización ni clave de acceso.');
            }
            const existeAutorizacion = await this.existeRetencionVenta(autorizacion);
            if (existeAutorizacion) {
                throw new BadRequestException(
                    'El comprobante de retención seleccionado ya se encuentra registrado.',
                );
            }

            const numero = `${this.texto($, 'estab')}-${this.texto($, 'ptoEmi')}-${this.texto($, 'secuencial')}`;
            const fechaEmision = this.parseFecha(this.texto($, 'fechaEmision'));

            const identificacionSujetoRetenido = this.texto($, 'identificacionSujetoRetenido');
            await this.validarSujetoRetenido(identificacionSujetoRetenido, dtoIn.ideEmpr);

            const detalles: DetalleXmlRetencion[] = [];
            // El esquema comprobanteRetencion v1.0.0 agrupa las líneas retenidas bajo
            // <impuestos><impuesto>; la v2.0.0 (multi-documento sustento, caso Bendo) las
            // agrupa bajo <docSustento><retenciones><retencion> - mismo contenido
            // (codigoRetencion/baseImponible/porcentajeRetener/valorRetenido), tag distinto
            // según versión. Se aceptan ambos.
            const impuestoEls = $('impuestos > impuesto, retenciones > retencion').toArray();
            for (const el of impuestoEls) {
                const det = $(el);
                const codigoRetencion = det.find('codigoRetencion').first().text().trim();
                if (!codigoRetencion) continue;

                const impuesto = await this.getImpuestoPorCodigoRetencion(codigoRetencion);
                if (!impuesto) {
                    throw new BadRequestException(
                        `No se encontró un concepto de retención configurado para el código '${codigoRetencion}' del XML. Configure el casillero en Plan de Cuentas / Impuestos de Retención.`,
                    );
                }

                detalles.push({
                    ide_cncim: Number(impuesto.ide_cncim),
                    nombre_cncim: impuesto.nombre_cncim ?? null,
                    casillero_cncim: impuesto.casillero_cncim ?? null,
                    codigo_retencion_xml: codigoRetencion,
                    base_cndre: this.numero(det.find('baseImponible').first().text()),
                    porcentaje_cndre: this.numero(det.find('porcentajeRetener').first().text()),
                    valor_cndre: this.numero(det.find('valorRetenido').first().text()),
                });
            }
            if (detalles.length === 0) {
                throw new BadRequestException('El XML no contiene detalle de impuestos retenidos.');
            }

            const totalRetencion = Number(
                detalles.reduce((sum, d) => sum + d.valor_cndre, 0).toFixed(2),
            );

            return {
                ruc_emisor: this.texto($, 'infoTributaria ruc') || this.texto($, 'ruc'),
                razon_social_emisor: this.texto($, 'razonSocial'),
                numero_cncre: numero,
                autorizacion_cncre: autorizacion,
                fecha_emisi_cncre: fechaEmision,
                identificacion_sujeto_retenido: identificacionSujetoRetenido,
                razon_social_sujeto_retenido: this.texto($, 'razonSocialSujetoRetenido'),
                detalles,
                total_retencion: totalRetencion,
            };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al leer el comprobante de retención XML: ${msg}`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS PRIVADOS
    // ─────────────────────────────────────────────────────────────────────────

    private texto($: cheerio.CheerioAPI, selector: string): string {
        return $(selector).first().text().trim();
    }

    private numero(valor: string): number {
        const num = Number.parseFloat(valor);
        return Number.isNaN(num) ? 0 : num;
    }

    /** Convierte la fecha del SRI (dd/MM/yyyy) a formato Postgres (yyyy-MM-dd) */
    private parseFecha(fecha: string): string {
        const match = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(fecha);
        if (!match) {
            throw new BadRequestException(`La fecha de emisión del XML no es válida: ${fecha}`);
        }
        return `${match[3]}-${match[2]}-${match[1]}`;
    }

    /**
     * El sujeto retenido del comprobante (identificacionSujetoRetenido) debe ser el RUC de la
     * propia empresa - de lo contrario el XML cargado no corresponde a esta compañía (ej. se
     * subió por error el comprobante de otro cliente/establecimiento).
     */
    private async validarSujetoRetenido(identificacionSujetoRetenido: string, ideEmpr: number) {
        if (!identificacionSujetoRetenido) {
            throw new BadRequestException(
                'El XML no contiene la identificación del sujeto retenido (identificacionSujetoRetenido).',
            );
        }

        const q = new SelectQuery(`SELECT identificacion_empr FROM sis_empresa WHERE ide_empr = $1`);
        q.addIntParam(1, ideEmpr);
        const empresa = await this.dataSource.createSingleQuery(q);
        if (!empresa?.identificacion_empr) {
            throw new InternalServerErrorException('No se encontró el RUC configurado para la empresa (sis_empresa).');
        }

        const rucEmpresa = String(empresa.identificacion_empr).trim();
        if (identificacionSujetoRetenido.trim() !== rucEmpresa) {
            throw new BadRequestException(
                `El comprobante de retención fue emitido a nombre de la identificación ` +
                `${identificacionSujetoRetenido} y no corresponde al RUC de la empresa (${rucEmpresa}). ` +
                `Verifique que el XML cargado sea el correcto.`,
            );
        }
    }

    private async existeRetencionVenta(autorizacion: string): Promise<boolean> {
        const q = new SelectQuery(`
            SELECT 1 AS existe
            FROM con_cabece_retenc
            WHERE autorizacion_cncre = $1
              AND es_venta_cncre = TRUE
            LIMIT 1
        `);
        q.addStringParam(1, autorizacion);
        const row = await this.dataSource.createSingleQuery(q);
        return !!row;
    }

    /**
     * Mapea el <codigoRetencion> del XML a con_cabece_impues (mismo criterio que el legacy
     * ServicioRetenciones.getIdeCabeceraImpuesto y que comprobantes-elec.service.ts en sentido
     * inverso): coincide contra casillero_cncim o codigo_fe_retencion_cncim.
     */
    private async getImpuestoPorCodigoRetencion(codigoRetencion: string) {
        const q = new SelectQuery(`
            SELECT ide_cncim, nombre_cncim, casillero_cncim
            FROM con_cabece_impues
            WHERE casillero_cncim = $1
               OR codigo_fe_retencion_cncim = $1
            LIMIT 1
        `);
        q.addStringParam(1, codigoRetencion);
        return this.dataSource.createSingleQuery(q);
    }
}
