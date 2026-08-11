import fs from 'node:fs';
import path from 'node:path';

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as handlebars from 'handlebars';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { AdjuntoCorreoDto } from 'src/core/email/dto/adjunto-dto';
import { registerHelpers } from 'src/core/email/helpers/handlebars.helpers';
import { MailService } from 'src/core/email/services/mail.service';
import { FILE_STORAGE_CONSTANTS } from 'src/core/modules/sistema/files/constants/files.constants';
import { EmpresaRepService } from 'src/reports/common/services/empresa-rep.service';
import { fCurrency } from 'src/util/helpers/common-util';
import { detectMimeType, getStaticImage } from 'src/util/helpers/file-utils';
import { normalizarUrl } from 'src/util/helpers/string-util';

import { ReenviarNotificacionPagoDto } from './dto/save-orden-pago.dto';

/** Alias de sis_cuenta_correo desde el que se notifican los pagos a proveedores (misma cuenta que los comprobantes SRI, ej. erp@diquimec.com.ec). */
const ALIAS_CUENTA_NOTIFICACION_PAGO = 'comprobantes';

interface DatosNotificacionPago {
    numeroRecibo: string;
    contraparte: string;
    identificacion?: string;
    fechaPago: string | Date;
    formaPago: string;
    numComprobante: string;
    documentoReferencia?: string;
    fotoPath?: string;
    documentos: { fecha: string | Date; numero: string; importe: number }[];
    total: number;
}

/**
 * Envía (y reenvía) la notificación por correo de un pago de orden de pago (CxP) al proveedor,
 * con el detalle de las facturas aplicadas y el comprobante (foto_cpcdop) adjunto.
 * Sigue el mismo patrón que ComprobanteEmailListener (SRI): construye el HTML con handlebars a
 * partir de plantillas en disco (no hay fila en sis_plantilla_correo para esto), arma los
 * adjuntos en memoria (base64) y delega el envío/registro a MailService.
 */
@Injectable()
export class PagoOrdenEmailService {
    private readonly logger = new Logger(PagoOrdenEmailService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly mailService: MailService,
        private readonly empresaRepService: EmpresaRepService,
    ) { }

    /**
     * Envía la notificación inicial tras registrar el pago (llamado desde
     * CuentasPorPagarSaveService.saveDetalleOrden). No lanza si falla — un correo que no sale
     * no debe revertir ni bloquear el pago ya persistido; solo se registra en el log.
     */
    async enviarNotificacion(
        ideCpcdopList: number[],
        correos: string[] | undefined,
        dtoIn: HeaderParamsDto,
    ): Promise<void> {
        if (!correos?.length || !ideCpcdopList.length) return;
        try {
            const datos = await this.construirDatos(ideCpcdopList);
            if (!datos) {
                this.logger.warn(`No se encontraron datos de pago para ide_cpcdop=[${ideCpcdopList.join(',')}]; no se notifica.`);
                return;
            }
            await this.enviar(datos, correos, dtoIn);
        } catch (error) {
            this.logger.error(`Error notificando pago (ide_cpcdop=[${ideCpcdopList.join(',')}]): ${error instanceof Error ? error.message : error}`);
        }
    }

    /**
     * Reenvía la notificación de un pago YA registrado, a los correos indicados. A diferencia de
     * enviarNotificacion, esto SÍ propaga el error - es una acción explícita del usuario (botón
     * "Reenviar correo"), debe reflejar si falló.
     */
    async reenviar(dtoIn: ReenviarNotificacionPagoDto & HeaderParamsDto): Promise<{ message: string }> {
        const ids = await this.buscarDetallesPagados(dtoIn.ide_cpcop, dtoIn.ide_geper);
        if (!ids.length) {
            throw new BadRequestException('No hay pagos registrados para este proveedor en la orden.');
        }
        const datos = await this.construirDatos(ids);
        if (!datos) {
            throw new NotFoundException('No se encontró información del pago a reenviar.');
        }
        await this.enviar(datos, dtoIn.correos, dtoIn);
        return { message: 'ok' };
    }

    private async buscarDetallesPagados(ideCpcop: number, ideGeper: number): Promise<number[]> {
        const query = new SelectQuery(`
            SELECT det.ide_cpcdop
            FROM cxp_det_orden_pago det
            JOIN cxp_cabece_transa ct ON ct.ide_cpctr = det.ide_cpctr
            WHERE det.ide_cpcop = $1
              AND ct.ide_geper = $2
              AND det.ide_cpeo = 3
              AND det.activo_cpcdop = true
            ORDER BY det.ide_cpcdop
        `);
        query.addIntParam(1, ideCpcop);
        query.addIntParam(2, ideGeper);
        const rows = await this.dataSource.createSelectQuery(query);
        return rows.map((r: any) => Number(r.ide_cpcdop));
    }

    private async construirDatos(ideCpcdopList: number[]): Promise<DatosNotificacionPago | undefined> {
        const query = new SelectQuery(`
            SELECT
                det.fecha_pago_cpcdop,
                det.num_comprobante_cpcdop,
                det.valor_pagado_cpcdop,
                det.valor_pagado_banco_cpcdop,
                det.observacion_cpcdop,
                det.foto_cpcdop,
                ttb.nombre_tettb                    AS forma_pago,
                p.nom_geper                         AS nombre_proveedor,
                p.identificac_geper,
                cf.numero_cpcfa,
                cf.fecha_emisi_cpcfa,
                cab.secuencial_cpcop
            FROM cxp_det_orden_pago det
            JOIN cxp_cab_orden_pago cab   ON cab.ide_cpcop = det.ide_cpcop
            JOIN cxp_cabece_transa ct     ON ct.ide_cpctr  = det.ide_cpctr
            LEFT JOIN cxp_cabece_factur cf ON cf.ide_cpcfa  = ct.ide_cpcfa
            LEFT JOIN gen_persona p        ON p.ide_geper   = ct.ide_geper
            LEFT JOIN tes_tip_tran_banc ttb ON ttb.ide_tettb = det.ide_tettb
            WHERE det.ide_cpcdop = ANY($1)
            ORDER BY det.ide_cpcdop
        `);
        query.addArrayNumberParam(1, ideCpcdopList);
        const rows = await this.dataSource.createSelectQuery(query);
        if (!rows.length) return undefined;

        const primera = rows[0];
        const total = rows.reduce(
            (acc: number, r: any) => acc + (Number(r.valor_pagado_cpcdop ?? 0) || Number(r.valor_pagado_banco_cpcdop ?? 0)),
            0,
        );

        return {
            numeroRecibo: primera.secuencial_cpcop,
            contraparte: primera.nombre_proveedor ?? 'Proveedor',
            identificacion: primera.identificac_geper,
            fechaPago: primera.fecha_pago_cpcdop,
            formaPago: primera.forma_pago ?? '---',
            numComprobante: primera.num_comprobante_cpcdop ?? '---',
            documentoReferencia: primera.observacion_cpcdop,
            fotoPath: primera.foto_cpcdop,
            documentos: rows.map((r: any) => ({
                fecha: r.fecha_emisi_cpcfa,
                numero: r.numero_cpcfa ?? '---',
                importe: Number(r.valor_pagado_cpcdop ?? 0) || Number(r.valor_pagado_banco_cpcdop ?? 0),
            })),
            total,
        };
    }

    private async enviar(datos: DatosNotificacionPago, correos: string[], dtoIn: HeaderParamsDto): Promise<void> {
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
            title: `Recibo de Pago ${datos.numeroRecibo}`,
            numeroRecibo: datos.numeroRecibo,
            contraparte: datos.contraparte,
            identificacion: datos.identificacion ?? '',
            fechaPago: datos.fechaPago,
            formaPago: datos.formaPago,
            numComprobante: datos.numComprobante,
            documentoReferencia: datos.documentoReferencia ?? '',
            documentos: datos.documentos.map((d, i) => ({
                fecha: d.fecha,
                numero: d.numero,
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
