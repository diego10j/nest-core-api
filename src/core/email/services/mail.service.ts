import { Inject, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { DeleteQuery, InsertQuery, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { detectMimeType } from 'src/util/helpers/file-utils';

import { AdjuntoCorreoDto } from '../dto/adjunto-dto';
import { GetMailQueueDto } from '../dto/get-mail-queue.dto';
import { SendMailDto } from '../dto/send-mail.dto';
import { ColaCorreo } from '../interfaces/email';
import {
  EMAIL_PROVIDER_TOKEN,
  EmailAttachmentOptions,
  IEmailProvider,
} from '../providers/email-provider.interface';

import { TemplateService } from './template.service';

/**
 * Servicio principal de correo electrónico.
 *
 * Principios SOLID aplicados:
 *  - SRP: gestiona el ciclo de vida del correo (preparación, envío, auditoría).
 *  - DIP: delega el transporte a IEmailProvider; no conoce Resend.
 *  - OCP: cambiar de proveedor no requiere tocar este servicio.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    public readonly dataSource: DataSourceService,
    private readonly templateService: TemplateService,
    @Inject(EMAIL_PROVIDER_TOKEN) private readonly emailProvider: IEmailProvider,
  ) { }

  // ──────────────────────────────────────────────
  // Consultas de configuración de cuentas
  // ──────────────────────────────────────────────

  async getCuentasCorreo(dtoIn: QueryOptionsDto & HeaderParamsDto) {
    const queryStr = `
      SELECT
        co.ide_corr,
        COALESCE(cu.alias_cucor, 'default') AS alias_corr,
        co.smtp_corr,
        co.puerto_corr,
        COALESCE(cu.usuario_cucor, co.usuario_corr) AS usuario_corr,
        COALESCE(cu.correo_cucor, co.correo_corr) AS correo_corr,
        COALESCE(cu.nom_correo_cucor, co.nom_correo_corr) AS nom_correo_corr,
        f_enmascarar_texto(co.clave_corr) AS clave_corr,
        co.secure_corr,
        COALESCE(cu.ide_sucu, co.ide_sucu) AS ide_sucu,
        COALESCE(cu.ide_empr, co.ide_empr) AS ide_empr,
        COALESCE(cu.ide_usua, co.ide_usua) AS ide_usua
      FROM sis_correo co
      LEFT JOIN sis_cuenta_correo cu ON cu.ide_corr = co.ide_corr
      WHERE co.ide_empr = $1
        AND co.alias_corr = 'resend'
      ORDER BY cu.ide_cucor NULLS LAST, co.ide_corr
    `;
    const query = new SelectQuery(queryStr, dtoIn);
    query.addParam(1, dtoIn.ideEmpr);
    return await this.dataSource.createQuery(query);
  }

  async getCuentaCorreoPorDefecto(dtoIn: QueryOptionsDto & HeaderParamsDto) {
    const cuenta = await this.getCuentaCorreo('default', dtoIn.ideEmpr);
    return [cuenta];
  }

  async getCuentasCorreoActivas(ideEmpr: number) {
    const query = new SelectQuery(`
      SELECT
        ide_cucor,
        alias_cucor,
        usuario_cucor,
        correo_cucor,
        nom_correo_cucor
      FROM sis_cuenta_correo
      WHERE ide_empr = $1
        AND activo_cucor = true
      ORDER BY alias_cucor
    `);
    query.addIntParam(1, ideEmpr);
    return this.dataSource.createSelectQuery(query);
  }

  /**
   * Obtiene una cuenta de correo para envío.
   *
   * - La configuración/API key se obtiene desde sis_correo (alias_corr='resend').
   * - Los datos del remitente se obtienen desde sis_cuenta_correo por alias_cucor.
   * - Si no existe cuenta en sis_cuenta_correo, usa correo/usuario/nombre de sis_correo.
   */
  async getCuentaCorreo(alias_corr: string = 'default', ideEmpr?: number) {
    const queryConfig = new SelectQuery(`
      SELECT
        ide_corr,
        alias_corr,
        smtp_corr,
        puerto_corr,
        usuario_corr,
        correo_corr,
        clave_corr,
        nom_correo_corr,
        secure_corr,
        ide_sucu,
        ide_empr,
        ide_usua
      FROM sis_correo
      WHERE alias_corr = 'resend'
        AND ($1::int IS NULL OR ide_empr = $1)
      ORDER BY ide_corr
      LIMIT 1
    `);
    queryConfig.addParam(1, ideEmpr ?? null);

    const configResend = await this.dataSource.createSingleQuery(queryConfig);
    if (!configResend) {
      throw new NotFoundException('No existe configuración de correo en sis_correo con alias resend');
    }

    const queryCuenta = new SelectQuery(`
      SELECT
        ide_cucor,
        ide_corr,
        alias_cucor,
        usuario_cucor,
        correo_cucor,
        nom_correo_cucor,
        ide_sucu,
        ide_empr,
        ide_usua
      FROM sis_cuenta_correo
      WHERE ide_corr = $1
        AND alias_cucor = $2
      ORDER BY ide_cucor
      LIMIT 1
    `);
    queryCuenta.addParam(1, configResend.ide_corr);
    queryCuenta.addParam(2, alias_corr);

    let cuenta = await this.dataSource.createSingleQuery(queryCuenta);

    // Si no se encuentra por ide_corr + alias, intenta localizar el alias en cualquier cuenta
    // (priorizando la empresa actual). Esto cubre datos legacy donde ide_corr no coincide.
    if (!cuenta && alias_corr !== 'default') {
      const queryAliasGlobal = new SelectQuery(`
        SELECT
          ide_cucor,
          ide_corr,
          alias_cucor,
          usuario_cucor,
          correo_cucor,
          nom_correo_cucor,
          ide_sucu,
          ide_empr,
          ide_usua
        FROM sis_cuenta_correo
        WHERE alias_cucor = $1
        ORDER BY
          CASE WHEN ide_empr = $2 THEN 0 ELSE 1 END,
          ide_cucor
        LIMIT 1
      `);
      queryAliasGlobal.addParam(1, alias_corr);
      queryAliasGlobal.addParam(2, ideEmpr ?? null);
      cuenta = await this.dataSource.createSingleQuery(queryAliasGlobal);
    }

    if (!cuenta && alias_corr !== 'default') {
      const queryDefault = new SelectQuery(`
        SELECT
          ide_cucor,
          ide_corr,
          alias_cucor,
          usuario_cucor,
          correo_cucor,
          nom_correo_cucor,
          ide_sucu,
          ide_empr,
          ide_usua
        FROM sis_cuenta_correo
        WHERE ide_corr = $1
          AND alias_cucor = 'default'
        ORDER BY ide_cucor
        LIMIT 1
      `);
      queryDefault.addParam(1, configResend.ide_corr);
      cuenta = await this.dataSource.createSingleQuery(queryDefault);
    }

    if (!cuenta) {
      return {
        ide_corr: configResend.ide_corr,
        alias_corr: alias_corr || 'default',
        smtp_corr: configResend.smtp_corr,
        puerto_corr: configResend.puerto_corr,
        usuario_corr: configResend.usuario_corr,
        correo_corr: configResend.correo_corr,
        clave_corr: configResend.clave_corr,
        nom_correo_corr: configResend.nom_correo_corr,
        secure_corr: configResend.secure_corr,
        ide_sucu: configResend.ide_sucu,
        ide_empr: configResend.ide_empr,
        ide_usua: configResend.ide_usua,
      };
    }

    return {
      ide_corr: configResend.ide_corr,
      alias_corr: cuenta.alias_cucor,
      smtp_corr: configResend.smtp_corr,
      puerto_corr: configResend.puerto_corr,
      usuario_corr: cuenta.usuario_cucor || configResend.usuario_corr,
      correo_corr: cuenta.correo_cucor || configResend.correo_corr,
      clave_corr: configResend.clave_corr,
      nom_correo_corr: cuenta.nom_correo_cucor || configResend.nom_correo_corr,
      secure_corr: configResend.secure_corr,
      ide_sucu: cuenta.ide_sucu || configResend.ide_sucu,
      ide_empr: cuenta.ide_empr || configResend.ide_empr,
      ide_usua: cuenta.ide_usua || configResend.ide_usua,
    };
  }

  // Alias para compatibilidad interna
  async getCuentaCorreoByAlias(alias_corr: string) {
    return this.getCuentaCorreo(alias_corr);
  }

  // ──────────────────────────────────────────────
  // Envío de correo (directo via Resend)
  // ──────────────────────────────────────────────

  /**
   * Envía un correo electrónico de forma directa vía Resend.
   * Registra el resultado en sis_cola_correo para auditoría.
   */
  async sendMail(sendMailDto: SendMailDto, ideEmpr: number, usuario: string) {
    const cuenta = await this.getCuentaCorreo(sendMailDto.alias_corr, ideEmpr);
    const { contenido, asunto } = await this.procesarPlantilla(sendMailDto, ideEmpr);
    const nombreRemitente = cuenta.nom_correo_corr || cuenta.alias_corr || cuenta.correo_corr || 'No Reply';
    const correoRemitente = cuenta.correo_corr || cuenta.usuario_corr || '';
    const remitente = this.formatearRemitente(nombreRemitente, correoRemitente);

    // Registrar intento de envío en BD (estado: ENVIANDO)
    const ide_coco = await this.guardarEnColaBD({
      jobId: `resend-${Date.now()}`,
      remitente,
      destinatario: sendMailDto.destinatario,
      cc: sendMailDto.cc,
      asunto,
      contenido,
      ide_plco: sendMailDto.ide_plco,
      ide_corr: cuenta.ide_corr,
      usuario,
    });

    try {
      // Guardar referencias de adjuntos en BD
      if (sendMailDto.adjuntos?.length) {
        await this.guardarAdjuntos(sendMailDto.adjuntos, {
          ide_plco: sendMailDto.ide_plco,
          ide_coco,
          usuario,
        });
      }

      // Preparar archivos adjuntos para el envío
      const adjuntosEnvio = await this.prepararAdjuntos(sendMailDto.adjuntos || []);

      // Enviar via IEmailProvider (Resend)
      const resultado = await this.emailProvider.send(
        {
          from: {
            name: nombreRemitente,
            address: correoRemitente,
          },
          to: this.normalizarDestinatarios(sendMailDto.destinatario),
          ...(sendMailDto.cc ? { cc: this.normalizarDestinatarios(sendMailDto.cc) } : {}),
          subject: asunto,
          html: contenido,
          attachments: adjuntosEnvio,
        },
        cuenta.clave_corr,
      );

      // Actualizar estado en BD a ENVIADO
      await this.actualizarEstadoCola(ide_coco, 'ENVIADO', null, resultado.messageId);

      this.logger.log(`✅ Correo enviado a ${this.formatDestinatarios(sendMailDto.destinatario)}. Resend ID: ${resultado.messageId}`);

      return {
        success: true,
        messageId: resultado.messageId,
        ide_coco,
      };
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      await this.actualizarEstadoCola(ide_coco, 'ERROR', errorMessage);
      this.logger.error(`Error sendMail: ${errorMessage}`);
      throw new InternalServerErrorException(`Error al enviar correo: ${errorMessage}`);
    }
  }

  // ──────────────────────────────────────────────
  // Estadísticas
  // ──────────────────────────────────────────────

  /**
   * Retorna estadísticas de correos enviados desde sis_cola_correo.
   */
  async processMailQueue() {
    try {
      const query = new SelectQuery(`
        SELECT
          estado_coco,
          COUNT(*)::int AS cantidad
        FROM sis_cola_correo
        GROUP BY estado_coco
      `);
      const rows = await this.dataSource.createSelectQuery(query);

      const stats = { enviados: 0, errores: 0, enviando: 0, total: 0 };
      for (const row of rows) {
        const cantidad: number = row.cantidad;
        stats.total += cantidad;
        if (row.estado_coco === 'ENVIADO') stats.enviados += cantidad;
        if (row.estado_coco === 'ERROR') stats.errores += cantidad;
        if (row.estado_coco === 'ENVIANDO') stats.enviando += cantidad;
      }

      this.logger.log(`📊 Estadísticas cola BD: ${JSON.stringify(stats)}`);
      return stats;
    } catch (error) {
      this.logger.error(`Error processMailQueue: ${this.getErrorMessage(error)}`);
      throw new InternalServerErrorException('Error obteniendo estadísticas de correos');
    }
  }

  async getEstadisticas(ideEmpr: number) {
    const query = new SelectQuery(`
      SELECT estado_coco, COUNT(*) as cantidad
      FROM sis_cola_correo c
      INNER JOIN sis_correo co ON c.ide_corr = co.ide_corr
      WHERE co.ide_empr = $1
      GROUP BY estado_coco
    `);
    query.addParam(1, ideEmpr);
    return this.dataSource.createSelectQuery(query);
  }

  // ──────────────────────────────────────────────
  // Consultas de cola de correo (listado sin cuerpo)
  // ──────────────────────────────────────────────

  async getMailQueue(dtoIn: GetMailQueueDto & HeaderParamsDto) {
    return this.buildMailQueueQuery(dtoIn, dtoIn.ideEmpr, dtoIn.estado_coco, dtoIn.remitente);
  }

  private buildMailQueueQuery(
    dtoIn: QueryOptionsDto,
    ideEmpr: number,
    estado_coco?: string,
    remitente?: string,
  ) {
    const query = new SelectQuery(`
      SELECT
        c.ide_coco,
        c.job_id_coco,
        c.remitente_coco,
        c.destinatario_coco,
        c.cc_coco,
        c.asunto_coco,
        c.tipo_coco,
        c.estado_coco,
        c.error_coco,
        c.ide_plco,
        c.ide_corr,
        c.fecha_envio_coco,
        c.usuario_ingre,
        c.fecha_ingre,
        (SELECT COUNT(*) FROM sis_adjunto_correo a WHERE a.ide_coco = c.ide_coco)::int AS num_adjuntos
      FROM sis_cola_correo c
      INNER JOIN sis_correo co ON c.ide_corr = co.ide_corr
      WHERE co.ide_empr = $1
        AND ($2::varchar IS NULL OR c.estado_coco = $2)
        AND ($3::varchar IS NULL OR c.remitente_coco ILIKE '%' || $3 || '%')
      ORDER BY c.fecha_ingre DESC
    `, dtoIn);
    query.addIntParam(1, ideEmpr);
    query.addParam(2, estado_coco ?? null);
    query.addParam(3, remitente ?? null);
    return this.dataSource.createQuery(query, 'sis_cola_correo');
  }

  async getMailBody(ideCoco: number) {
    const query = new SelectQuery(`
      SELECT
        ide_coco,
        job_id_coco,
        remitente_coco,
        destinatario_coco,
        cc_coco,
        asunto_coco,
        contenido_coco,
        tipo_coco,
        estado_coco,
        error_coco,
        ide_plco,
        ide_corr,
        fecha_envio_coco,
        usuario_ingre,
        fecha_ingre,
        (SELECT COUNT(*) FROM sis_adjunto_correo a WHERE a.ide_coco = c.ide_coco)::int AS num_adjuntos
      FROM sis_cola_correo c
      WHERE ide_coco = $1
    `);
    query.addIntParam(1, ideCoco);
    return this.dataSource.createSingleQuery(query);
  }

  // ──────────────────────────────────────────────
  // Adjuntos
  // ──────────────────────────────────────────────

  async getAdjuntosPorReferencia(tipo: 'plantilla' | 'campania' | 'cola', ide_referencia: number): Promise<any[]> {
    const campo = { plantilla: 'ide_plco', campania: 'ide_caco', cola: 'ide_coco' }[tipo];
    if (!campo) throw new Error('Tipo de referencia no válido');

    const query = new SelectQuery(`
      SELECT
        ide_adco,
        nombre_archivo_adco,
        tipo_mime_adco,
        tamano_adco,
        ruta_adco,
        usuario_ingre,
        fecha_ingre
      FROM sis_adjunto_correo
      WHERE ${campo} = $1
      ORDER BY fecha_ingre DESC
    `);
    query.addParam(1, ide_referencia);
    return this.dataSource.createSelectQuery(query);
  }

  async getAdjuntosMail(ideCoco: number) {
    return this.getAdjuntosPorReferencia('cola', ideCoco);
  }

  async eliminarAdjunto(ide_adco: number, _usuario: string): Promise<void> {
    const deleteQuery = new DeleteQuery('sis_adjunto_correo');
    deleteQuery.where = 'ide_adco = $1';
    deleteQuery.addParam(1, ide_adco);
    await this.dataSource.createQuery(deleteQuery);
  }

  // ──────────────────────────────────────────────
  // Helpers públicos (usados por CampaignService)
  // ──────────────────────────────────────────────

  parseDestinatarios(destinatarios: string): string | string[] {
    if (!destinatarios) return '';
    return destinatarios.includes(',')
      ? destinatarios.split(',').map((d) => d.trim()).filter(Boolean)
      : destinatarios;
  }

  // ──────────────────────────────────────────────
  // Métodos privados de soporte
  // ──────────────────────────────────────────────

  private async procesarPlantilla(sendMailDto: SendMailDto, ideEmpr: number) {
    let { contenido, asunto } = sendMailDto;

    if (sendMailDto.ide_plco && !sendMailDto.contenido) {
      const plantilla = await this.templateService.getTemplateById(sendMailDto.ide_plco, ideEmpr);
      contenido = this.templateService.compileTemplate(plantilla.contenido_plco, sendMailDto.variables || {});
      asunto = this.templateService.compileTemplate(plantilla.asunto_plco, sendMailDto.variables || {});
    }

    return { contenido, asunto };
  }

  private async guardarEnColaBD(params: ColaCorreo): Promise<number> {
    const insertQuery = new InsertQuery('sis_cola_correo', 'ide_coco');
    const ide_coco = await this.dataSource.getSeqTable('sis_cola_correo', 'ide_coco', 1, params.usuario);

    insertQuery.values.set('ide_coco', ide_coco);
    insertQuery.values.set('job_id_coco', params.jobId);
    insertQuery.values.set('remitente_coco', params.remitente);
    insertQuery.values.set('destinatario_coco', this.formatDestinatarios(params.destinatario));
    insertQuery.values.set('cc_coco', params.cc ? this.formatDestinatarios(params.cc) : null);
    insertQuery.values.set('asunto_coco', params.asunto);
    insertQuery.values.set('contenido_coco', params.contenido);
    insertQuery.values.set('tipo_coco', 'INDIVIDUAL');
    insertQuery.values.set('estado_coco', 'ENVIANDO');
    insertQuery.values.set('ide_plco', params.ide_plco || null);
    insertQuery.values.set('ide_corr', params.ide_corr);
    insertQuery.values.set('usuario_ingre', params.usuario);
    insertQuery.values.set('fecha_ingre', new Date());

    await this.dataSource.createQuery(insertQuery);
    return ide_coco;
  }

  private async actualizarEstadoCola(
    ide_coco: number,
    estado: string,
    error?: string,
    messageId?: string,
  ) {
    try {
      const updateQuery = new UpdateQuery('sis_cola_correo', 'ide_coco');
      updateQuery.values.set('estado_coco', estado);

      if (error) updateQuery.values.set('error_coco', error);
      if (messageId) updateQuery.values.set('mensaje_id_coco', messageId);

      if (estado === 'ENVIADO') {
        updateQuery.values.set('fecha_envio_coco', new Date());
      }

      updateQuery.where = 'ide_coco = $1';
      updateQuery.addParam(1, ide_coco);
      await this.dataSource.createQuery(updateQuery);
    } catch (err) {
      this.logger.error(`Error actualizarEstadoCola: ${this.getErrorMessage(err)}`);
    }
  }

  private async guardarAdjuntos(
    adjuntos: AdjuntoCorreoDto[],
    referencias: { ide_plco?: number; ide_caco?: number; ide_coco?: number; usuario: string },
  ) {
    for (const adjunto of adjuntos) {
      const insertQuery = new InsertQuery('sis_adjunto_correo', 'ide_adco');
      const ide_adco = await this.dataSource.getSeqTable('sis_adjunto_correo', 'ide_adco', 1, referencias.usuario);

      insertQuery.values.set('ide_adco', ide_adco);
      insertQuery.values.set('nombre_archivo_adco', adjunto.nombre);
      insertQuery.values.set('tipo_mime_adco', adjunto.tipoMime || detectMimeType(adjunto.nombre));
      insertQuery.values.set('tamano_adco', adjunto.tamano);
      insertQuery.values.set('ruta_adco', adjunto.ruta);
      insertQuery.values.set('ide_plco', referencias.ide_plco || null);
      insertQuery.values.set('ide_caco', referencias.ide_caco || null);
      insertQuery.values.set('ide_coco', referencias.ide_coco || null);
      insertQuery.values.set('usuario_ingre', referencias.usuario);
      insertQuery.values.set('fecha_ingre', new Date());

      await this.dataSource.createQuery(insertQuery);
    }
  }

  /**
   * Convierte adjuntos de DTO/BD al formato requerido por IEmailProvider.
   */
  private async prepararAdjuntos(adjuntos: AdjuntoCorreoDto[]): Promise<EmailAttachmentOptions[]> {
    const resultado: EmailAttachmentOptions[] = [];

    for (const adj of adjuntos) {
      try {
        const contenido = adj.contenidoBase64
          ? Buffer.from(adj.contenidoBase64, 'base64')
          : await this.cargarArchivo(adj.ruta);

        resultado.push({
          filename: adj.nombre,
          content: contenido,
          contentType: adj.tipoMime || detectMimeType(adj.nombre),
        });
      } catch (err) {
        this.logger.error(`Error cargando adjunto "${adj.nombre}": ${this.getErrorMessage(err)}`);
        // Continúa con los demás adjuntos
      }
    }

    return resultado;
  }

  private async cargarArchivo(ruta: string): Promise<Buffer> {
    const { promises: fs } = await import('fs');
    try {
      return await fs.readFile(ruta);
    } catch (err) {
      throw new Error(`No se pudo cargar el archivo desde "${ruta}": ${this.getErrorMessage(err)}`);
    }
  }

  private formatDestinatarios(destinatario: string | string[]): string {
    return Array.isArray(destinatario) ? destinatario.join(',') : destinatario;
  }

  private formatearRemitente(nombre: string, correo: string): string {
    const nombreLimpio = (nombre || '').trim();
    const correoLimpio = (correo || '').trim();
    if (nombreLimpio && correoLimpio) return `${nombreLimpio} <${correoLimpio}>`;
    if (correoLimpio) return correoLimpio;
    return nombreLimpio;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private normalizarDestinatarios(destinatario: string | string[]): string[] {
    const str = Array.isArray(destinatario) ? destinatario.join(',') : destinatario;
    return str.split(',').map((d) => d.trim()).filter(Boolean);
  }
}
