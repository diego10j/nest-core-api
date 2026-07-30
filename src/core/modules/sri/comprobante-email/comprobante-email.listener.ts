import fs from 'node:fs';
import path from 'node:path';

import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import * as handlebars from 'handlebars';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { envs } from 'src/config/envs';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { AdjuntoCorreoDto } from 'src/core/email/dto/adjunto-dto';
import { registerHelpers } from 'src/core/email/helpers/handlebars.helpers';
import { MailService } from 'src/core/email/services/mail.service';
import { EstadoComprobanteEnum } from 'src/core/modules/sri/cel/enum/estado-comprobante.enum';
import { GetFacturaDto } from 'src/core/modules/ventas/facturas/dto/get-factura.dto';
import { fmtNumero, splitNumeroDocumento } from 'src/reports/common/ride/ride-report.util';
import { EmpresaRepService } from 'src/reports/common/services/empresa-rep.service';
import { CuentasPorPagarRepService } from 'src/reports/modules/cuentas-por-pagar/cuentas-por-pagar-rep.service';
import { GetLiquidacionCompraDto } from 'src/reports/modules/cuentas-por-pagar/dto/get-liquidacion-compra.dto';
import { FacturasRepService } from 'src/reports/modules/ventas/facturas/facturas-rep.service';
import { GetNotaCreditoDto } from 'src/reports/modules/ventas/notas-credito/dto/get-nota-credito.dto';
import { NotasCreditoRepService } from 'src/reports/modules/ventas/notas-credito/notas-credito-rep.service';
import { fCurrency } from 'src/util/helpers/common-util';
import { normalizarUrl } from 'src/util/helpers/string-util';

import { ComprobanteAutorizadoEmitter, ComprobanteAutorizadoEvent } from '../envio/comprobante-autorizado.emitter';
import { SriXmlComprobanteService } from '../envio/sri-xml-comprobante.service';

import { ReenviarComprobanteDto } from './dto/reenviar-comprobante.dto';

const CODDOC_FACTURA = '01';
const CODDOC_NOTA_CREDITO = '04';
const CODDOC_LIQUIDACION_COMPRA = '03';
const CODDOCS_SOPORTADOS = [CODDOC_FACTURA, CODDOC_NOTA_CREDITO, CODDOC_LIQUIDACION_COMPRA];

/** Alias de sis_cuenta_correo desde el que se envían los comprobantes electrónicos autorizados. */
const ALIAS_CUENTA_COMPROBANTES = 'comprobantes';

interface ContraparteComprobante {
    ideNegocio: number;
    correo?: string;
    nombre: string;
    identificacion?: string;
    numero: string;
    fecha: string | Date;
    total: number;
}

/**
 * Envía por correo (PDF + XML autorizado) Factura, Nota de Crédito y Liquidación de Compra
 * apenas el SRI las autoriza. Se suscribe a ComprobanteAutorizadoEmitter (SriModule) en vez de
 * ser llamado directamente por comprobante-envio.service.ts, para no crear el ciclo de módulos
 * SriModule -> VentasModule/CuentasPorPagarModule -> SriModule (ver comprobante-autorizado.emitter.ts).
 * Retención y Guía de Remisión no se incluyen aquí: no fueron pedidos, y Guía de Remisión aún no
 * tiene su generación de comprobante SRI conectada (cxc_guia.ide_srcom queda NULL al guardar).
 */
@Injectable()
export class ComprobanteEmailListener implements OnModuleInit {
    private readonly logger = new Logger(ComprobanteEmailListener.name);

    constructor(
        private readonly emitter: ComprobanteAutorizadoEmitter,
        private readonly dataSource: DataSourceService,
        private readonly mailService: MailService,
        private readonly empresaRepService: EmpresaRepService,
        private readonly xmlComprobanteService: SriXmlComprobanteService,
        private readonly facturasRepService: FacturasRepService,
        private readonly notasCreditoRepService: NotasCreditoRepService,
        private readonly cuentasPorPagarRepService: CuentasPorPagarRepService,
    ) { }

    onModuleInit(): void {
        this.emitter.on('autorizado', (evento: ComprobanteAutorizadoEvent) => {
            this.procesar(evento).catch((error) => {
                this.logger.error(
                    `Error enviando correo del comprobante ${evento.claveAcceso}: ${error instanceof Error ? error.message : error}`,
                );
            });
        });
    }

    private async procesar(evento: ComprobanteAutorizadoEvent): Promise<void> {
        if (!CODDOCS_SOPORTADOS.includes(evento.coddoc)) {
            return;
        }
        await this.enviarCorreoComprobante(
            evento.ideSrcom, evento.coddoc, evento.claveAcceso, evento.xmlAutorizado, evento.dtoIn,
        );
    }

    /**
     * Reenvía a un correo indicado (puede ser distinto al del cliente/proveedor original) el
     * PDF+XML de un comprobante YA AUTORIZADO por el SRI. No vuelve a firmar ni a enviar nada al
     * SRI — solo reconstruye el PDF y recupera el XML autorizado ya guardado en el historial.
     */
    async reenviar(dtoIn: ReenviarComprobanteDto & HeaderParamsDto): Promise<{ message: string }> {
        const query = new SelectQuery(`
            SELECT ide_srcom, coddoc_srcom, ide_sresc
            FROM sri_comprobante
            WHERE claveacceso_srcom = $1
        `);
        query.addStringParam(1, dtoIn.claveAcceso);
        const comprobante = await this.dataSource.createSingleQuery(query);
        if (!comprobante) {
            throw new NotFoundException(`No existe el comprobante con clave de acceso ${dtoIn.claveAcceso}`);
        }
        if (Number(comprobante.ide_sresc) !== EstadoComprobanteEnum.AUTORIZADO.codigo) {
            throw new BadRequestException('El comprobante no está autorizado por el SRI; no se puede reenviar.');
        }
        const coddoc = String(comprobante.coddoc_srcom);
        if (!CODDOCS_SOPORTADOS.includes(coddoc)) {
            throw new BadRequestException(`Reenvío por correo no soportado para el tipo de comprobante ${coddoc}.`);
        }

        // El historial ya guarda el envoltorio de autorización completo (estado/numeroAutorizacion/
        // fechaAutorizacion/ambiente + comprobante en CDATA) tal como lo entrega el SRI: se adjunta
        // tal cual, sin extraer el comprobante — es el mismo XML que recibe el correo automático.
        const historial = await this.xmlComprobanteService.getUltimo(Number(comprobante.ide_srcom), dtoIn);
        const xmlAutorizado = historial?.xmlComprobante;

        await this.enviarCorreoComprobante(
            Number(comprobante.ide_srcom), coddoc, dtoIn.claveAcceso, xmlAutorizado, dtoIn, dtoIn.correo,
        );
        return { message: 'ok' };
    }

    /** Arma y envía el correo (PDF + XML) de un comprobante autorizado, a un correo dado o al de la contraparte. */
    private async enviarCorreoComprobante(
        ideSrcom: number,
        coddoc: string,
        claveAcceso: string,
        xmlAutorizado: string | undefined,
        dtoIn: HeaderParamsDto,
        correoDestino?: string,
    ): Promise<void> {
        const contexto = await this.resolverContraparte(ideSrcom, coddoc);
        if (!contexto) {
            this.logger.warn(`Comprobante ${claveAcceso}: el documento de negocio no existe (ide_srcom=${ideSrcom}).`);
            return;
        }
        const correo = correoDestino ?? contexto.correo;
        if (!correo) {
            this.logger.warn(`Comprobante ${claveAcceso} autorizado sin correo de destino; no se envía.`);
            return;
        }

        await this.verificarCuentaComprobantes(dtoIn.ideEmpr);

        const { tipoComprobante, etiquetaContraparte, nombreDocumento } = this.metadataPorCoddoc(coddoc);
        const pdfBuffer = await this.generarPdfBuffer(coddoc, contexto.ideNegocio, dtoIn);

        const empresa = await this.empresaRepService.getEmpresaById(dtoIn.ideEmpr);

        let logoBase64: string | undefined;
        if (empresa?.logotipo_empr) {
            const logoPath = path.join(envs.pathDrive, empresa.logotipo_empr);
            if (fs.existsSync(logoPath)) {
                logoBase64 = fs.readFileSync(logoPath).toString('base64');
            }
        }

        const html = this.buildEmailHtml({
            appName: empresa?.nom_empr || 'ProERP',
            logoBase64,
            title: `${tipoComprobante} ${contexto.numero}`,
            tipoComprobante,
            etiquetaContraparte,
            contraparte: contexto.nombre,
            identificacion: contexto.identificacion ?? '',
            numero: contexto.numero,
            fecha: contexto.fecha,
            numeroAutorizacion: claveAcceso,
            total: fCurrency(contexto.total),
            empresaEmail: empresa?.mail_empr || '',
            empresaWeb: empresa?.pagina_empr ? normalizarUrl(empresa.pagina_empr) : '',
            empresaWebDisplay: empresa?.pagina_empr || '',
        });

        const adjuntos: AdjuntoCorreoDto[] = [
            {
                nombre: `${nombreDocumento}_${contexto.numero}.pdf`,
                tipoMime: 'application/pdf',
                tamano: pdfBuffer.length,
                ruta: '',
                contenidoBase64: pdfBuffer.toString('base64'),
            },
        ];
        if (xmlAutorizado) {
            const xmlBuffer = Buffer.from(xmlAutorizado, 'utf8');
            adjuntos.push({
                nombre: `${nombreDocumento}_${contexto.numero}.xml`,
                tipoMime: 'application/xml',
                tamano: xmlBuffer.length,
                ruta: '',
                contenidoBase64: xmlBuffer.toString('base64'),
            });
        }

        await this.mailService.sendMail(
            {
                destinatario: correo,
                asunto: `${tipoComprobante} ${contexto.numero} — autorizada por el SRI`,
                contenido: html,
                adjuntos,
                alias_corr: ALIAS_CUENTA_COMPROBANTES,
            },
            dtoIn.ideEmpr,
            dtoIn.login,
        );
    }

    /**
     * Los comprobantes electrónicos deben enviarse siempre desde la cuenta dedicada
     * (alias_cucor='comprobantes' en sis_cuenta_correo), no desde la cuenta 'default'.
     * A diferencia de MailService.getCuentaCorreo (que cae de vuelta a 'default' si no
     * encuentra el alias pedido), aquí se exige que la cuenta exista explícitamente.
     */
    private async verificarCuentaComprobantes(ideEmpr: number): Promise<void> {
        const query = new SelectQuery(`
            SELECT ide_cucor
            FROM sis_cuenta_correo
            WHERE alias_cucor = $1
              AND activo_cucor = true
              AND (ide_empr = $2 OR ide_empr = 0)
            ORDER BY CASE WHEN ide_empr = $2 THEN 0 ELSE 1 END, ide_cucor
            LIMIT 1
        `);
        query.addStringParam(1, ALIAS_CUENTA_COMPROBANTES);
        query.addIntParam(2, ideEmpr);
        const cuenta = await this.dataSource.createSingleQuery(query);
        if (!cuenta) {
            throw new BadRequestException(
                `Cuenta de comprobantes no configurada: no existe una cuenta de correo activa con alias "${ALIAS_CUENTA_COMPROBANTES}" en sis_cuenta_correo.`,
            );
        }
    }

    private metadataPorCoddoc(coddoc: string): { tipoComprobante: string; etiquetaContraparte: string; nombreDocumento: string } {
        switch (coddoc) {
            case CODDOC_FACTURA:
                return { tipoComprobante: 'Factura', etiquetaContraparte: 'Cliente', nombreDocumento: 'Factura' };
            case CODDOC_NOTA_CREDITO:
                return { tipoComprobante: 'Nota de Crédito', etiquetaContraparte: 'Cliente', nombreDocumento: 'NotaCredito' };
            case CODDOC_LIQUIDACION_COMPRA:
                return { tipoComprobante: 'Liquidación de Compra', etiquetaContraparte: 'Proveedor', nombreDocumento: 'LiquidacionCompra' };
            default:
                return { tipoComprobante: 'Comprobante', etiquetaContraparte: 'Contraparte', nombreDocumento: 'Comprobante' };
        }
    }

    private async resolverContraparte(ideSrcom: number, coddoc: string): Promise<ContraparteComprobante | undefined> {
        if (coddoc === CODDOC_FACTURA) {
            const query = new SelectQuery(`
                SELECT cf.ide_cccfa, cf.fecha_emisi_cccfa, cf.total_cccfa,
                    df.establecimiento_ccdfa, df.pto_emision_ccdfa, cf.secuencial_cccfa,
                    p.correo_geper, p.nom_geper, p.identificac_geper
                FROM cxc_cabece_factura cf
                INNER JOIN gen_persona p ON cf.ide_geper = p.ide_geper
                INNER JOIN cxc_datos_fac df ON cf.ide_ccdaf = df.ide_ccdaf
                WHERE cf.ide_srcom = $1
            `);
            query.addIntParam(1, ideSrcom);
            const row = await this.dataSource.createSingleQuery(query);
            if (!row) return undefined;
            return {
                ideNegocio: Number(row.ide_cccfa),
                correo: row.correo_geper,
                nombre: row.nom_geper,
                identificacion: row.identificac_geper,
                numero: fmtNumero(row.establecimiento_ccdfa, row.pto_emision_ccdfa, row.secuencial_cccfa),
                fecha: row.fecha_emisi_cccfa,
                total: Number(row.total_cccfa ?? 0),
            };
        }

        if (coddoc === CODDOC_NOTA_CREDITO) {
            const query = new SelectQuery(`
                SELECT a.ide_cpcno, a.numero_cpcno, a.fecha_emisi_cpcno, a.total_cpcno,
                    p.correo_geper, p.nom_geper, p.identificac_geper
                FROM cxp_cabecera_nota a
                INNER JOIN gen_persona p ON a.ide_geper = p.ide_geper
                WHERE a.ide_srcom = $1
            `);
            query.addIntParam(1, ideSrcom);
            const row = await this.dataSource.createSingleQuery(query);
            if (!row) return undefined;
            const { estab, ptoEmi, secuencial } = splitNumeroDocumento(row.numero_cpcno);
            return {
                ideNegocio: Number(row.ide_cpcno),
                correo: row.correo_geper,
                nombre: row.nom_geper,
                identificacion: row.identificac_geper,
                numero: fmtNumero(estab, ptoEmi, secuencial),
                fecha: row.fecha_emisi_cpcno,
                total: Number(row.total_cpcno ?? 0),
            };
        }

        if (coddoc === CODDOC_LIQUIDACION_COMPRA) {
            const query = new SelectQuery(`
                SELECT a.ide_cpcfa, a.numero_cpcfa, a.fecha_emisi_cpcfa, a.total_cpcfa,
                    p.correo_geper, p.nom_geper, p.identificac_geper
                FROM cxp_cabece_factur a
                INNER JOIN gen_persona p ON a.ide_geper = p.ide_geper
                WHERE a.ide_srcom = $1
            `);
            query.addIntParam(1, ideSrcom);
            const row = await this.dataSource.createSingleQuery(query);
            if (!row) return undefined;
            const { estab, ptoEmi, secuencial } = splitNumeroDocumento(row.numero_cpcfa);
            return {
                ideNegocio: Number(row.ide_cpcfa),
                correo: row.correo_geper,
                nombre: row.nom_geper,
                identificacion: row.identificac_geper,
                numero: fmtNumero(estab, ptoEmi, secuencial),
                fecha: row.fecha_emisi_cpcfa,
                total: Number(row.total_cpcfa ?? 0),
            };
        }

        return undefined;
    }

    private async generarPdfBuffer(coddoc: string, ideNegocio: number, dtoIn: HeaderParamsDto): Promise<Buffer> {
        let pdfDoc: PDFKit.PDFDocument;
        if (coddoc === CODDOC_FACTURA) {
            const facturaDto: GetFacturaDto = { ide_cccfa: ideNegocio };
            pdfDoc = await this.facturasRepService.reportFacturaElectronica({ ...dtoIn, ...facturaDto });
        } else if (coddoc === CODDOC_NOTA_CREDITO) {
            const notaCreditoDto: GetNotaCreditoDto = { ide_cpcno: ideNegocio };
            pdfDoc = await this.notasCreditoRepService.reportNotaCredito({ ...dtoIn, ...notaCreditoDto });
        } else {
            const liquidacionDto: GetLiquidacionCompraDto = { ide_cpcfa: ideNegocio };
            pdfDoc = await this.cuentasPorPagarRepService.reportLiquidacionCompra({ ...dtoIn, ...liquidacionDto });
        }
        return streamToBuffer(pdfDoc);
    }

    private loadTemplateFile(relativePath: string): string {
        const roots = [
            path.join(process.cwd(), 'src', 'core', 'email', 'templates', relativePath),
            path.join(process.cwd(), 'dist', 'core', 'email', 'templates', relativePath),
        ];
        for (const templatePath of roots) {
            if (fs.existsSync(templatePath)) {
                return fs.readFileSync(templatePath, 'utf8');
            }
        }
        throw new Error(`No se encontró la plantilla: ${relativePath}`);
    }

    private buildEmailHtml(variables: Record<string, unknown>): string {
        const headerContent = this.loadTemplateFile('partials/header.hbs');
        const footerContent = this.loadTemplateFile('partials/footer.hbs');
        handlebars.registerPartial('partials/header', headerContent);
        handlebars.registerPartial('partials/footer', footerContent);
        registerHelpers(handlebars);

        const bodyContent = this.loadTemplateFile('comprobantes/comprobante-envio.hbs');
        const template = handlebars.compile(bodyContent);
        return template(variables);
    }
}

function streamToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        doc.end();
    });
}
