import { Inject, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { DeleteQuery, InsertQuery, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { detectMimeType } from 'src/util/helpers/file-utils';

import { AdjuntoCorreoDto } from '../dto/adjunto-dto';
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
  ) {}

  // ──────────────────────────────────────────────
  // Consultas de configuración de cuentas
  // ──────────────────────────────────────────────

  async getCuentasCorreo(dtoIn: QueryOptionsDto & HeaderParamsDto) {
    const queryStr = `
      SELECT
        ide_corr,
        alias_corr,
        smtp_corr,
        puerto_corr,
        usuario_corr,
        correo_corr,
        f_enmascarar_texto(clave_corr) AS clave_corr,
        secure_corr,
        ide_sucu,
        ide_empr,
        ide_usua
      FROM sis_correo
      WHERE ide_empr = $1
      ORDER BY ide_corr
    `;
    const query = new SelectQuery(queryStr, dtoIn);
    query.addParam(1, dtoIn.ideEmpr);
    return await this.dataSource.createQuery(query);
  }

  async getCuentaCorreoPorDefecto(dtoIn: QueryOptionsDto & HeaderParamsDto) {
    const queryStr = `
      SELECT
        ide_corr,
        alias_corr,
        smtp_corr,
        puerto_corr,
        usuario_corr,
        correo_corr,
        f_enmascarar_texto(clave_corr) AS clave_corr,
        secure_corr,
        ide_sucu,
        ide_empr,
        ide_usua
      FROM sis_correo
      WHERE ide_empr = $1
        AND alias_corr = 'default'
      ORDER BY ide_corr
    `;
    const query = new SelectQuery(queryStr, dtoIn);
    query.addParam(1, dtoIn.ideEmpr);
    return await this.dataSource.createQuery(query);
  }

  /**
   * Obtiene una cuenta de correo con su Resend API Key (clave_corr).
   */
  async getCuentaCorreo(ide_corr: number) {
    const query = new SelectQuery(`
      SELECT
        ide_corr,
        alias_corr,
        correo_corr,
        clave_corr,
        nom_correo_corr,
        ide_sucu,
        ide_empr,
        ide_usua
      FROM sis_correo
      WHERE ide_corr = $1
    `);
    query.addParam(1, ide_corr);

    const cuenta = await this.dataSource.createSingleQuery(query);
    if (!cuenta) {
      throw new NotFoundException(`No existe cuenta de correo con ID ${ide_corr}`);
    }
    return cuenta;
  }

  // Alias para compatibilidad interna
  async getCuentaCorreoById(ide_corr: number) {
    return this.getCuentaCorreo(ide_corr);
  }

  // ──────────────────────────────────────────────
  // Envío de correo (directo via Resend)
  // ──────────────────────────────────────────────

  /**
   * Envía un correo electrónico de forma directa vía Resend.
   * Registra el resultado en sis_cola_correo para auditoría.
   */
  async sendMail(sendMailDto: SendMailDto, ideEmpr: number, usuario: string) {
    const cuenta = await this.getCuentaCorreo(sendMailDto.ide_corr);
    const { contenido, asunto } = await this.procesarPlantilla(sendMailDto, ideEmpr);

    // Registrar intento de envío en BD (estado: ENVIANDO)
    const ide_coco = await this.guardarEnColaBD({
      jobId: `resend-${Date.now()}`,
      destinatario: sendMailDto.destinatario,
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
            name: cuenta.nom_correo_corr || cuenta.alias_corr || cuenta.correo_corr,
            address: cuenta.correo_corr,
          },
          to: this.normalizarDestinatarios(sendMailDto.destinatario),
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
      await this.actualizarEstadoCola(ide_coco, 'ERROR', error.message);
      this.logger.error(`Error sendMail: ${error.message}`);
      throw new InternalServerErrorException(`Error al enviar correo: ${error.message}`);
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
        if (row.estado_coco === 'ENVIADO')  stats.enviados  += cantidad;
        if (row.estado_coco === 'ERROR')    stats.errores   += cantidad;
        if (row.estado_coco === 'ENVIANDO') stats.enviando  += cantidad;
      }

      this.logger.log(`📊 Estadísticas cola BD: ${JSON.stringify(stats)}`);
      return stats;
    } catch (error) {
      this.logger.error(`Error processMailQueue: ${error.message}`);
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
      asunto    = this.templateService.compileTemplate(plantilla.asunto_plco,    sendMailDto.variables || {});
    }

    return { contenido, asunto };
  }

  private async guardarEnColaBD(params: ColaCorreo): Promise<number> {
    const insertQuery = new InsertQuery('sis_cola_correo', 'ide_coco');
    const ide_coco = await this.dataSource.getSeqTable('sis_cola_correo', 'ide_coco', 1, params.usuario);

    insertQuery.values.set('ide_coco',          ide_coco);
    insertQuery.values.set('job_id_coco',        params.jobId);
    insertQuery.values.set('destinatario_coco',  this.formatDestinatarios(params.destinatario));
    insertQuery.values.set('asunto_coco',        params.asunto);
    insertQuery.values.set('contenido_coco',     params.contenido);
    insertQuery.values.set('tipo_coco',          'INDIVIDUAL');
    insertQuery.values.set('estado_coco',        'ENVIANDO');
    insertQuery.values.set('ide_plco',           params.ide_plco || null);
    insertQuery.values.set('ide_corr',           params.ide_corr);
    insertQuery.values.set('usuario_ingre',      params.usuario);
    insertQuery.values.set('fecha_ingre',        new Date());

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

      if (error)     updateQuery.values.set('error_coco',    error);
      if (messageId) updateQuery.values.set('mensaje_id_coco', messageId);

      if (estado === 'ENVIADO') {
        updateQuery.values.set('fecha_envio_coco', new Date());
      }

      updateQuery.where = 'ide_coco = $1';
      updateQuery.addParam(1, ide_coco);
      await this.dataSource.createQuery(updateQuery);
    } catch (err) {
      this.logger.error(`Error actualizarEstadoCola: ${err.message}`);
    }
  }

  private async guardarAdjuntos(
    adjuntos: AdjuntoCorreoDto[],
    referencias: { ide_plco?: number; ide_caco?: number; ide_coco?: number; usuario: string },
  ) {
    for (const adjunto of adjuntos) {
      const insertQuery = new InsertQuery('sis_adjunto_correo', 'ide_adco');
      const ide_adco = await this.dataSource.getSeqTable('sis_adjunto_correo', 'ide_adco', 1, referencias.usuario);

      insertQuery.values.set('ide_adco',              ide_adco);
      insertQuery.values.set('nombre_archivo_adco',   adjunto.nombre);
      insertQuery.values.set('tipo_mime_adco',        adjunto.tipoMime || detectMimeType(adjunto.nombre));
      insertQuery.values.set('tamano_adco',           adjunto.tamano);
      insertQuery.values.set('ruta_adco',             adjunto.ruta);
      insertQuery.values.set('ide_plco',              referencias.ide_plco || null);
      insertQuery.values.set('ide_caco',              referencias.ide_caco || null);
      insertQuery.values.set('ide_coco',              referencias.ide_coco || null);
      insertQuery.values.set('usuario_ingre',         referencias.usuario);
      insertQuery.values.set('fecha_ingre',           new Date());

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
          filename:    adj.nombre,
          content:     contenido,
          contentType: adj.tipoMime || detectMimeType(adj.nombre),
        });
      } catch (err) {
        this.logger.error(`Error cargando adjunto "${adj.nombre}": ${err.message}`);
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
      throw new Error(`No se pudo cargar el archivo desde "${ruta}": ${err.message}`);
    }
  }

  private formatDestinatarios(destinatario: string | string[]): string {
    return Array.isArray(destinatario) ? destinatario.join(',') : destinatario;
  }

  private normalizarDestinatarios(destinatario: string | string[]): string[] {
    const str = Array.isArray(destinatario) ? destinatario.join(',') : destinatario;
    return str.split(',').map((d) => d.trim()).filter(Boolean);
  }
}
