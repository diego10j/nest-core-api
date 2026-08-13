import fs from 'node:fs';
import path from 'node:path';

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as handlebars from 'handlebars';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { AdjuntoCorreoDto } from 'src/core/email/dto/adjunto-dto';
import { registerHelpers } from 'src/core/email/helpers/handlebars.helpers';
import { MailService } from 'src/core/email/services/mail.service';
import { FILE_STORAGE_CONSTANTS } from 'src/core/modules/sistema/files/constants/files.constants';
import { fmtNumero, splitNumeroDocumento } from 'src/reports/common/ride/ride-report.util';
import { EmpresaRepService } from 'src/reports/common/services/empresa-rep.service';
import { fCurrency } from 'src/util/helpers/common-util';
import { fDate } from 'src/util/helpers/date-util';
import { detectMimeType, getStaticImage } from 'src/util/helpers/file-utils';
import { normalizarUrl } from 'src/util/helpers/string-util';

import { NotificarPagoCxPDto } from './dto/notificar-pago-cxp.dto';

/** Alias de sis_cuenta_correo desde el que se notifican los pagos a proveedores. */
const ALIAS_CUENTA_NOTIFICACION_PAGO = 'default';

interface DatosNotificacionPagoDirecto {
    numeroRecibo: string;
    contraparte: string;
    identificacion?: string;
    fechaPago: string | Date;
    formaPago: string;
    numComprobante: string;
    documentoReferencia?: string;
    fotoPath?: string;
    documentos: { numero: string; tipoDocumento: string; fecha: string | Date; importe: number }[];
    total: number;
}

/**
 * Envía (y reenvía) la notificación por correo de un pago directo CxP (savePagoCxP)
 * al proveedor, con el detalle de las facturas aplicadas y el comprobante adjunto.
 *
 * A diferencia del flujo de órdenes de pago (PagoOrdenEmailService), aquí el origen
 * de datos es el movimiento de tesorería (tes_cab_libr_banc) vinculado a sus abonos
 * en cxp_detall_transa. La foto del comprobante se resuelve por `ide_teclb` desde
 * tes_info_comprobante_banco (nunca por un nombre de archivo enviado por el cliente).
 *
 * Reutiliza la misma plantilla HTML de notificación de pago (cuentas-por-pagar/pago-notificacion.hbs).
 */
@Injectable()
export class PagoCxPEmailService {
    private readonly logger = new Logger(PagoCxPEmailService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly mailService: MailService,
        private readonly empresaRepService: EmpresaRepService,
    ) { }

    /**
     * Envía la notificación inicial tras registrar un pago directo. Es best-effort:
     * un correo que no sale no debe revertir ni bloquear el pago ya persistido.
     */
    async notificarPago(dtoIn: NotificarPagoCxPDto & HeaderParamsDto): Promise<{ message: string; enviado: boolean }> {
        if (!dtoIn.correos?.length) return { message: 'sin destinatarios', enviado: false };
        try {
            const datos = await this.construirDatos(dtoIn.ide_teclb);
            if (!datos) {
                return { message: 'no se encontraron datos del pago', enviado: false };
            }
            await this.enviar(datos, dtoIn.correos, dtoIn);
            return { message: 'ok', enviado: true };
        } catch (error) {
            this.logger.error(`Error notificando pago directo (ide_teclb=${dtoIn.ide_teclb}): ${error instanceof Error ? error.message : error}`);
            return { message: error instanceof Error ? error.message : 'error', enviado: false };
        }
    }

    /**
     * Reenvía la notificación de un pago YA registrado. A diferencia de notificarPago,
     * SÍ propaga el error: es una acción explícita del usuario (debe reflejar si falló).
     */
    async reenviar(dtoIn: NotificarPagoCxPDto & HeaderParamsDto): Promise<{ message: string }> {
        const datos = await this.construirDatos(dtoIn.ide_teclb);
        if (!datos) {
            throw new NotFoundException('No se encontró información del pago a reenviar.');
        }
        await this.enviar(datos, dtoIn.correos, dtoIn);
        return { message: 'ok' };
    }

    private async construirDatos(ideTeclb: number): Promise<DatosNotificacionPagoDirecto | undefined> {
        const query = new SelectQuery(`
            SELECT
                lb.numero_teclb,
                lb.valor_teclb,
                lb.fecha_trans_teclb,
                lb.observacion_teclb,
                lb.beneficiari_teclb,
                ttb.nombre_tettb                    AS forma_pago,
                p.nom_geper                         AS nombre_proveedor,
                p.identificac_geper,
                cf.numero_cpcfa,
                cf.fecha_emisi_cpcfa,
                ctd.nombre_cntdo                    AS tipo_documento,
                dt.valor_cpdtr,
                dt.ide_cpcfa
            FROM tes_cab_libr_banc lb
            LEFT JOIN tes_tip_tran_banc ttb ON ttb.ide_tettb = lb.ide_tettb
            LEFT JOIN cxp_detall_transa dt  ON dt.ide_teclb  = lb.ide_teclb
            LEFT JOIN cxp_tipo_transacc tt  ON tt.ide_cpttr  = dt.ide_cpttr
            LEFT JOIN cxp_cabece_transa ct  ON ct.ide_cpctr  = dt.ide_cpctr
            LEFT JOIN cxp_cabece_factur cf  ON cf.ide_cpcfa  = ct.ide_cpcfa
            LEFT JOIN con_tipo_document ctd ON ctd.ide_cntdo = cf.ide_cntdo
            LEFT JOIN gen_persona p         ON p.ide_geper   = ct.ide_geper
            WHERE lb.ide_teclb = $1
              AND tt.signo_cpttr = -1
            ORDER BY dt.ide_cpdtr
        `);
        query.addIntParam(1, ideTeclb);
        const rows = await this.dataSource.createSelectQuery(query);
        if (!rows.length) return undefined;

        const primera = rows[0];
        const documentos = rows
            .filter((r: any) => r.ide_cpcfa != null)
            .map((r: any) => {
                const { estab, ptoEmi, secuencial } = splitNumeroDocumento(r.numero_cpcfa);
                return {
                    numero: r.numero_cpcfa ? fmtNumero(estab, ptoEmi, secuencial) : '---',
                    tipoDocumento: r.tipo_documento ?? 'Documento',
                    fecha: r.fecha_emisi_cpcfa,
                    importe: Number(r.valor_cpdtr ?? 0),
                };
            });

        const fotoPath = await this.obtenerFotoComprobante(ideTeclb);
        const numeroRecibo =
            primera.numero_teclb && primera.numero_teclb !== '000000'
                ? primera.numero_teclb
                : `PAGO #${ideTeclb}`;

        return {
            numeroRecibo,
            contraparte: primera.nombre_proveedor ?? primera.beneficiari_teclb ?? 'Proveedor',
            identificacion: primera.identificac_geper,
            fechaPago: primera.fecha_trans_teclb,
            formaPago: primera.forma_pago ?? '---',
            numComprobante: primera.numero_teclb ?? '---',
            documentoReferencia: primera.observacion_teclb,
            fotoPath,
            documentos,
            total: Number(primera.valor_teclb ?? 0),
        };
    }

    /** Resuelve la foto del comprobante asociada al movimiento de tesorería (temp_media). */
    private async obtenerFotoComprobante(ideTeclb: number): Promise<string | undefined> {
        const query = new SelectQuery(`
            SELECT foto_teincb
            FROM tes_info_comprobante_banco
            WHERE ide_teclb = $1
              AND activo_teincb = true
            ORDER BY ide_teincb DESC
            LIMIT 1
        `);
        query.addIntParam(1, ideTeclb);
        const rows = await this.dataSource.createSelectQuery(query);
        return rows?.[0]?.foto_teincb ?? undefined;
    }

    private async enviar(datos: DatosNotificacionPagoDirecto, correos: string[], dtoIn: HeaderParamsDto): Promise<void> {
        const empresa = await this.empresaRepService.getEmpresaById(dtoIn.ideEmpr);

        let logoBase64: string | undefined;
        let logoMimeType: string | undefined;
        if (empresa?.logotipo_empr) {
            const logoPath = path.join(FILE_STORAGE_CONSTANTS.BASE_PATH, empresa.logotipo_empr);
            if (fs.existsSync(logoPath)) {
                logoBase64 = fs.readFileSync(logoPath).toString('base64');
                logoMimeType = detectMimeType(logoPath) || 'image/png';
            }
        }

        const html = this.buildEmailHtml({
            appName: empresa?.nom_empr || 'ProERP',
            logoBase64,
            logoMimeType,
            title: 'Recibo de Pago',
            numeroRecibo: datos.numeroRecibo,
            contraparte: datos.contraparte,
            identificacion: datos.identificacion ?? '',
            fechaPago: fDate(datos.fechaPago, 'dd/MM/yyyy'),
            formaPago: datos.formaPago,
            numComprobante: datos.numComprobante,
            documentoReferencia: datos.documentoReferencia ?? '',
            documentos: datos.documentos.map((d, i) => ({
                numero: d.numero,
                tipoDocumento: d.tipoDocumento,
                fecha: fDate(d.fecha, 'dd/MM/yyyy'),
                importe: fCurrency(d.importe),
                negativo: d.importe < 0,
                bg: i % 2 === 1 ? '#F9FBFF' : '#ffffff',
            })),
            total: fCurrency(datos.total),
            empresaEmail: empresa?.mail_empr || '',
            empresaWeb: empresa?.pagina_empr ? normalizarUrl(empresa.pagina_empr) : '',
            empresaWebDisplay: empresa?.pagina_empr || '',
            empresaDireccion: empresa?.direccion_empr || '',
            empresaTelefono: empresa?.telefono_empr || '',
            year: new Date().getFullYear(),
        });

        const adjuntos: AdjuntoCorreoDto[] = [];
        if (datos.fotoPath) {
            try {
                const filePath = getStaticImage(datos.fotoPath, true);
                const buffer = fs.readFileSync(filePath);
                const ext = path.extname(filePath) || '.jpg';
                adjuntos.push({
                    nombre: `comprobante_pago_${datos.numeroRecibo}${ext}`,
                    tipoMime: detectMimeType(filePath) || 'image/jpeg',
                    tamano: buffer.length,
                    ruta: '',
                    contenidoBase64: buffer.toString('base64'),
                });
            } catch (error) {
                this.logger.warn(`No se pudo adjuntar el comprobante "${datos.fotoPath}": ${error instanceof Error ? error.message : error}`);
            }
        }

        await this.mailService.sendMail(
            {
                destinatario: correos,
                asunto: `Notificación de Pago ${datos.numeroRecibo} - ${datos.contraparte}`,
                contenido: html,
                adjuntos,
                alias_corr: ALIAS_CUENTA_NOTIFICACION_PAGO,
            },
            dtoIn.ideEmpr,
            dtoIn.login,
        );
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

        const bodyContent = this.loadTemplateFile('cuentas-por-pagar/pago-notificacion.hbs');
        const template = handlebars.compile(bodyContent);
        return template(variables);
    }
}
