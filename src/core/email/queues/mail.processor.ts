import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import * as nodemailer from 'nodemailer';
import { SelectQuery } from 'src/core/connection/helpers';

import { MAIL_QUEUE } from '../config';
import { MailAttachment } from '../interfaces/email';
import { MailService } from '../services/mail.service';

@Processor(MAIL_QUEUE)
export class MailProcessor {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly mailService: MailService) {}

  @Process('send-mail')
  async handleSendMail(job: Job) {
    try {
      this.logger.log(`📧 Procesando correo en cola: ${job.id}`);

      // Extraer datos del job
      const { destinatario, asunto, contenido, ide_corr, variables, usuario, ide_empr, adjuntos } = job.data;

      // Actualizar estado en BD a PROCESANDO
      await this.mailService.updateJobStatus(job.id.toString(), 'PROCESANDO');

      // Obtener cuenta de correo
      const cuenta = await this.mailService.getCuentaCorreoById(ide_corr);

      // Obtener adjuntos si el correo está en la cola
      let adjuntosCorreo = [];
      if (adjuntos && adjuntos.length > 0) {
        adjuntosCorreo = adjuntos;
      } else {
        // Buscar adjuntos en BD si no vienen en el job
        const colaQuery = new SelectQuery(`
                    SELECT ide_coco FROM sis_cola_correo WHERE job_id_coco = $1
                `);
        colaQuery.addParam(1, job.id.toString());
        const correoCola = await this.mailService.dataSource.createSingleQuery(colaQuery);

        if (correoCola) {
          const adjuntosBD = await this.mailService.getAdjuntosPorReferencia('cola', correoCola.ide_coco);
          adjuntosCorreo = adjuntosBD;
        }
      }

      // Enviar correo real
      this.logger.log(`📤 Enviando correo a: ${destinatario}`);

      const resultado = await this.enviarCorreoReal(cuenta, {
        destinatario,
        asunto,
        contenido,
        variables,
        adjuntos: adjuntosCorreo,
      });

      // Actualizar estado en BD a ENVIADO
      await this.mailService.updateJobStatus(job.id.toString(), 'ENVIADO', null, resultado);

      this.logger.log(`✅ Correo enviado exitosamente: ${job.id}`);

      return {
        success: true,
        jobId: job.id,
        messageId: resultado.messageId,
      };
    } catch (error) {
      this.logger.error(`❌ Error procesando correo ${job.id}: ${error.message}`);

      // Actualizar estado en BD a ERROR
      await this.mailService.updateJobStatus(job.id.toString(), 'ERROR', error.message);

      throw error;
    }
  }

  /**
   * Envío real de correo con adjuntos
   */
  private async enviarCorreoReal(cuenta: any, correoData: any): Promise<nodemailer.SentMessageInfo> {
    try {
      const transporter = nodemailer.createTransport({
        host: cuenta.smtp_corr,
        port: cuenta.puerto_corr,
        secure: cuenta.secure_corr,
        auth: {
          user: cuenta.usuario_corr || cuenta.correo_corr,
          pass: cuenta.clave_corr,
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
        logger: false,
        debug: false,
        tls: {
          rejectUnauthorized: false,
        },
      });

      // Verificar conexión
      this.logger.log('Verificando conexión SMTP...');
      await transporter.verify();
      this.logger.log('✓ Conexión SMTP verificada exitosamente');

      // Preparar adjuntos
      const attachments = await this.prepararAdjuntos(correoData.adjuntos || []);

      // Configurar opciones del correo
      const mailOptions: nodemailer.SendMailOptions = {
        from: {
          name: cuenta.alias_corr || cuenta.correo_corr,
          address: cuenta.correo_corr,
        },
        to: this.parseDestinatarios(correoData.destinatario),
        subject: correoData.asunto,
        html: correoData.contenido,
        attachments: attachments.length > 0 ? attachments : undefined,
      };

      // Enviar correo
      this.logger.log('Enviando correo...');
      const resultado = await transporter.sendMail(mailOptions);

      this.logger.log('✓ Correo enviado exitosamente');
      this.logger.log(`Message ID: ${resultado.messageId}`);

      // Cerrar conexión
      transporter.close();

      return resultado;
    } catch (error) {
      this.logger.error('✗ Error enviando correo:');
      this.logger.error(error.message);

      const diagnostico = this.diagnosticarErrorSMTP(error, cuenta);
      this.logger.error(`Diagnóstico: ${diagnostico}`);

      throw error;
    }
  }

  /**
   * Diagnosticar errores SMTP
   */
  private diagnosticarErrorSMTP(error: any, configuracion: any): string {
    let diagnostico = '';

    if (error.code === 'ECONNREFUSED') {
      diagnostico = 'Conexión rechazada. Verifica: 1) Servidor activo, 2) Puerto correcto, 3) Firewall';
    } else if (error.code === 'ETIMEDOUT') {
      diagnostico = 'Timeout. El servidor no responde. Verifica conectividad de red';
    } else if (error.command === 'CONN') {
      diagnostico = 'Error en handshake inicial. Posible problema de TLS/SSL';
    } else if (error.response && error.response.includes('535')) {
      diagnostico = 'Error de autenticación. Verifica usuario y contraseña';
    } else if (error.response && error.response.includes('550')) {
      diagnostico = 'Error de envío. Verifica dirección from/to';
    } else {
      diagnostico = `Error general: ${error.message}`;
    }

    // Información adicional
    diagnostico += `\nConfiguración probada: ${configuracion.smtp_corr}:${configuracion.puerto_corr}, secure: ${configuracion.secure_corr}`;

    return diagnostico;
  }

  private parseDestinatarios(destinatarios: string): string | string[] {
    if (!destinatarios) return '';
    if (destinatarios.includes(',')) {
      return destinatarios
        .split(',')
        .map((d) => d.trim())
        .filter((d) => d);
    }
    return destinatarios;
  }

  @Process('process-queue')
  async handleProcessQueue(job: Job) {
    try {
      this.logger.log('🔄 Monitoreando cola de correos');
      const stats = await this.mailService.processMailQueue();
      return {
        success: true,
        stats,
        message: 'Monitoreo de cola completado',
      };
    } catch (error) {
      this.logger.error(`❌ Error monitoreando cola: ${error.message}`);
      throw error;
    }
  }

  /**
   * Prepara los adjuntos para el envío
   */
  private async prepararAdjuntos(adjuntos: any[]): Promise<MailAttachment[]> {
    const attachments: MailAttachment[] = [];

    for (const adjunto of adjuntos) {
      try {
        // Aquí implementarías la lógica para cargar el archivo
        // desde la ruta especificada o desde base64
        let contenido: Buffer;

        if (adjunto.contenidoBase64) {
          // Si viene en base64
          contenido = Buffer.from(adjunto.contenidoBase64, 'base64');
        } else {
          // Cargar desde sistema de archivos
          contenido = await this.cargarArchivoDesdeRuta(adjunto.ruta_adco || adjunto.ruta);
        }

        attachments.push({
          filename: adjunto.nombre_archivo_adco || adjunto.nombre,
          content: contenido,
          contentType: adjunto.tipo_mime_adco || adjunto.tipoMime,
          // Opcional: agregar contentId para imágenes embebidas
          // cid: `attachment_${adjunto.ide_adco || Date.now()}`
        });
      } catch (error) {
        this.logger.error(`Error cargando adjunto ${adjunto.nombre}: ${error.message}`);
        // Continuar con otros adjuntos
      }
    }

    return attachments;
  }

  /**
   * Carga un archivo desde la ruta especificada
   */
  private async cargarArchivoDesdeRuta(ruta: string): Promise<Buffer> {
    // Implementar la lógica para cargar el archivo
    // Esto depende de tu sistema de almacenamiento
    // Ejemplo para sistema de archivos local:
    try {
      const fs = require('fs').promises;
      return await fs.readFile(ruta);
    } catch (error) {
      throw new Error(`No se pudo cargar el archivo desde ${ruta}: ${error.message}`);
    }
  }
}
