import { InjectQueue } from '@nestjs/bull';
import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { Queue } from 'bull';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { DeleteQuery, InsertQuery, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { detectMimeType } from 'src/util/helpers/file-utils';

import { MAIL_QUEUE } from '../config';
import { AdjuntoCorreoDto } from '../dto/adjunto-dto';
import { SendMailDto } from '../dto/send-mail.dto';
import { ColaCorreo } from '../interfaces/email';

import { TemplateService } from './template.service';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    public readonly dataSource: DataSourceService,
    private readonly templateService: TemplateService,
    @InjectQueue(MAIL_QUEUE) private readonly mailQueue: Queue,
  ) {}

  /**
   * Obtiene los correos configurados de una empresa
   */
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

  /**
   * Obtiene una cuenta de correo configurada
   */
  async getCuentaCorreo(ideEmpr: number, ide_corr?: number) {
    let queryStr = `
      SELECT
        ide_corr,
        alias_corr,
        smtp_corr,
        puerto_corr,
        usuario_corr,
        correo_corr,
        clave_corr,
        nom_correo_corr,
        ide_sucu,
        ide_empr,
        ide_usua
      FROM sis_correo
      WHERE ide_empr = $1
    `;

    if (ide_corr) {
      queryStr += ' AND ide_corr = $2';
    } else {
      queryStr += ' ORDER BY ide_corr LIMIT 1';
    }

    const query = new SelectQuery(queryStr);
    query.addParam(1, ideEmpr);

    if (ide_corr) {
      query.addParam(2, ide_corr);
    }

    const cuenta = await this.dataSource.createSingleQuery(query);
    if (!cuenta) {
      throw new NotFoundException('No existe cuenta de correo configurada');
    }

    // Obtener configuraciones adicionales
    const configQuery = new SelectQuery(`
      SELECT propiedad_corr, valor_corr
      FROM sis_conf_correo
      WHERE ide_corr = $1
    `);
    configQuery.addParam(1, cuenta.ide_corr);

    const configuraciones = await this.dataSource.createSelectQuery(configQuery);
    cuenta.configuraciones = configuraciones;

    return cuenta;
  }

  /**
   * Envía un correo electrónico automáticamente a la cola
   */
  async sendMail(sendMailDto: SendMailDto, ideEmpr: number, usuario: string) {
    try {
      const cuenta = await this.getCuentaCorreo(ideEmpr, sendMailDto.ide_corr);

      let { contenido, asunto } = await this.procesarPlantilla(sendMailDto, ideEmpr);

      // Agregar automáticamente a la cola de Bull
      const job = await this.mailQueue.add(
        'send-mail',
        {
          destinatario: this.formatDestinatarios(sendMailDto.destinatario),
          asunto,
          contenido,
          ide_corr: cuenta.ide_corr,
          variables: sendMailDto.variables || {},
          usuario,
          ide_empr: ideEmpr,
          adjuntos: sendMailDto.adjuntos || [], // ← Agregar adjuntos al job
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );

      // Guardar en BD para tracking
      const ide_coco = await this.guardarEnColaBD({
        jobId: job.id.toString(),
        destinatario: sendMailDto.destinatario,
        asunto,
        contenido,
        ide_plco: sendMailDto.ide_plco,
        ide_corr: cuenta.ide_corr,
        usuario,
      });

      // Guardar adjuntos si existen
      if (sendMailDto.adjuntos && sendMailDto.adjuntos.length > 0) {
        await this.guardarAdjuntos(sendMailDto.adjuntos, {
          ide_plco: sendMailDto.ide_plco,
          ide_coco: ide_coco,
          usuario,
        });
      }

      return {
        message: 'Correo agregado a la cola de envío automático',
        jobId: job.id,
        queueStatus: 'PENDING',
      };
    } catch (error) {
      this.logger.error(`Error sendMail: ${error.message}`);
      throw new InternalServerErrorException(`Error al enviar correo: ${error.message}`);
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
   * Procesa plantilla si es necesario
   */
  private async procesarPlantilla(sendMailDto: SendMailDto, ideEmpr: number) {
    let { contenido, asunto } = sendMailDto;

    if (sendMailDto.ide_plco && !sendMailDto.contenido) {
      const plantilla = await this.templateService.getTemplateById(sendMailDto.ide_plco, ideEmpr);
      contenido = this.templateService.compileTemplate(plantilla.contenido_plco, sendMailDto.variables || {});
      asunto = this.templateService.compileTemplate(plantilla.asunto_plco, sendMailDto.variables || {});
    }

    return { contenido, asunto };
  }

  /**
   * Guarda el correo en la cola de la base de datos y retorna el ID
   */
  private async guardarEnColaBD(params: ColaCorreo): Promise<number> {
    const insertQuery = new InsertQuery('sis_cola_correo', 'ide_coco');

    const ide_coco = await this.dataSource.getSeqTable('sis_cola_correo', 'ide_coco', 1, params.usuario);

    insertQuery.values.set('ide_coco', ide_coco);
    insertQuery.values.set('job_id_coco', params.jobId);
    insertQuery.values.set('destinatario_coco', this.formatDestinatarios(params.destinatario));
    insertQuery.values.set('asunto_coco', params.asunto);
    insertQuery.values.set('contenido_coco', params.contenido);
    insertQuery.values.set('tipo_coco', 'INDIVIDUAL');
    insertQuery.values.set('estado_coco', 'EN_COLA');
    insertQuery.values.set('ide_plco', params.ide_plco || null);
    insertQuery.values.set('ide_corr', params.ide_corr);
    insertQuery.values.set('usuario_ingre', params.usuario);
    insertQuery.values.set('fecha_ingre', new Date());

    await this.dataSource.createQuery(insertQuery);

    return ide_coco;
  }

  /**
   * Formatea destinatarios
   */
  private formatDestinatarios(destinatario: string | string[]): string {
    return Array.isArray(destinatario) ? destinatario.join(',') : destinatario;
  }

  /**
   * Monitorea el estado de la cola
   */
  async processMailQueue() {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.mailQueue.getWaitingCount(),
        this.mailQueue.getActiveCount(),
        this.mailQueue.getCompletedCount(),
        this.mailQueue.getFailedCount(),
        this.mailQueue.getDelayedCount(),
      ]);

      this.logger.log(
        `📊 Estado de cola: Waiting: ${waiting}, Active: ${active}, Completed: ${completed}, Failed: ${failed}, Delayed: ${delayed}`,
      );

      return { waiting, active, completed, failed, delayed, total: waiting + active + completed + failed + delayed };
    } catch (error) {
      this.logger.error(`Error processMailQueue: ${error.message}`);
      throw new InternalServerErrorException(`Error monitoreando cola de correos: ${error.message}`);
    }
  }

  /**
   * Método para que el processor actualice el estado en BD
   */
  async updateJobStatus(jobId: string, status: string, error?: string, result?: any) {
    try {
      const updateQuery = new UpdateQuery('sis_cola_correo', 'job_id_coco'); // ← Cambiado a job_id_coco
      updateQuery.values.set('estado_coco', status);

      if (error) {
        updateQuery.values.set('error_coco', error);
      }

      if (status === 'ENVIADO') {
        updateQuery.values.set('fecha_envio_coco', new Date());
        if (result?.messageId) {
          updateQuery.values.set('mensaje_id_coco', result.messageId);
        }
      }

      updateQuery.where = 'job_id_coco = $1'; // ← Buscar por job_id_coco
      updateQuery.addParam(1, jobId);

      await this.dataSource.createQuery(updateQuery);
    } catch (error) {
      this.logger.error(`Error updateJobStatus: ${error.message}`);
    }
  }
  /**
   * Obtiene una cuenta de correo por ID
   */
  async getCuentaCorreoById(ide_corr: number) {
    const query = new SelectQuery(`
      SELECT
        ide_corr,
        alias_corr,
        smtp_corr,
        puerto_corr,
        usuario_corr,
        correo_corr,
        clave_corr,
        ide_sucu,
        ide_empr,
        ide_usua,
        secure_corr
      FROM sis_correo
      WHERE ide_corr = $1
    `);
    query.addParam(1, ide_corr);

    const cuenta = await this.dataSource.createSingleQuery(query);
    if (!cuenta) {
      throw new NotFoundException(`Cuenta de correo con ID ${ide_corr} no encontrada`);
    }

    // Obtener configuraciones adicionales
    const configQuery = new SelectQuery(`
      SELECT propiedad_corr, valor_corr
      FROM sis_conf_correo
      WHERE ide_corr = $1
    `);
    configQuery.addParam(1, cuenta.ide_corr);

    const configuraciones = await this.dataSource.createSelectQuery(configQuery);
    cuenta.configuraciones = configuraciones;

    return cuenta;
  }

  /**
   * Obtiene estadísticas de correos
   */
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

  /**
   * Parsea destinatarios desde string a array
   */
  parseDestinatarios(destinatarios: string): string | string[] {
    if (!destinatarios) return '';
    if (destinatarios.includes(',')) {
      return destinatarios
        .split(',')
        .map((d) => d.trim())
        .filter((d) => d);
    }
    return destinatarios;
  }

  /**
   * Obtiene adjuntos por referencia
   */
  async getAdjuntosPorReferencia(tipo: 'plantilla' | 'campania' | 'cola', ide_referencia: number): Promise<any[]> {
    let campo: string;

    switch (tipo) {
      case 'plantilla':
        campo = 'ide_plco';
        break;
      case 'campania':
        campo = 'ide_caco';
        break;
      case 'cola':
        campo = 'ide_coco';
        break;
      default:
        throw new Error('Tipo de referencia no válido');
    }

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

  /**
   * Elimina un adjunto
   */
  async eliminarAdjunto(ide_adco: number, usuario: string): Promise<void> {
    const deleteQuery = new DeleteQuery('sis_adjunto_correo');
    deleteQuery.where = 'ide_adco = $1';
    deleteQuery.addParam(1, ide_adco);

    await this.dataSource.createQuery(deleteQuery);
  }
}
