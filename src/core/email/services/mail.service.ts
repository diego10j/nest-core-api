import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';

import { SendMailDto } from '../dto/send-mail.dto';
import { TemplateService } from './template.service';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { InsertQuery, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { ConfigCuentaCorreo } from '../interfaces/email';


@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    public readonly dataSource: DataSourceService,
    private readonly templateService: TemplateService,
  ) { }

  /**
   * Obtiene los correos configurados de una empresa
   * @param dtoIn QueryOptionsDto
   * @returns any[]
   */
  async getCuentasCorreo(dtoIn: QueryOptionsDto & HeaderParamsDto) {
    let queryStr = `
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
      FROM
        sis_correo
      WHERE
        ide_empr = $1
      ORDER BY ide_corr 
    `;
    const query = new SelectQuery(queryStr, dtoIn);
    query.addParam(1, dtoIn.ideEmpr);
    return await this.dataSource.createQuery(query);
  }

  /**
   * Obtiene una cuenta de correo configurada
   * @param ideEmpr ID de la empresa
   * @returns Cuenta de correo
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
      FROM
        sis_correo
      WHERE
        ide_empr = $1
    `;

    const params: any[] = [ideEmpr];

    if (ide_corr) {
      queryStr += ' AND ide_corr = $2';
      params.push(ide_corr);
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
      SELECT
        propiedad_corr,
        valor_corr
      FROM
        sis_conf_correo
      WHERE
        ide_corr = $1
    `);
    configQuery.addParam(1, cuenta.ide_corr);

    const configuraciones = await this.dataSource.createSelectQuery(configQuery);
    cuenta.configuraciones = configuraciones;

    return cuenta;
  }

  /**
   * Envía un correo electrónico
   * @param sendMailDto Datos del correo
   * @param ideEmpr ID de la empresa
   * @param ideUsua ID del usuario
   */
  async sendMail(sendMailDto: SendMailDto, ideEmpr: number, usuario: string) {
    try {
      // Obtener cuenta de correo
      const cuenta = await this.getCuentaCorreo(ideEmpr, sendMailDto.ide_corr);

      let contenido = sendMailDto.contenido;
      let asunto = sendMailDto.asunto;

      // Si se especifica una plantilla, compilarla
      if (sendMailDto.ide_plco && !sendMailDto.contenido) {
        const plantilla = await this.templateService.getTemplateById(sendMailDto.ide_plco, ideEmpr);
        contenido = this.templateService.compileTemplate(plantilla.contenido_plco, sendMailDto.variables || {});
        asunto = this.templateService.compileTemplate(plantilla.asunto_plco, sendMailDto.variables || {});
      }

      // Agregar a la cola de correos
      const insertQuery = new InsertQuery('sis_cola_correo', 'ide_coco');
      insertQuery.values.set(
        'ide_coco',
        await this.dataSource.getSeqTable('sis_cola_correo', 'ide_coco', 1, usuario)
      );
      insertQuery.values.set('destinatario_coco', Array.isArray(sendMailDto.destinatario) ? sendMailDto.destinatario.join(',') : sendMailDto.destinatario);
      insertQuery.values.set('asunto_coco', asunto);
      insertQuery.values.set('contenido_coco', contenido);
      insertQuery.values.set('tipo_coco', 'INDIVIDUAL');
      insertQuery.values.set('estado_coco', 'PENDIENTE');
      insertQuery.values.set('ide_plco', sendMailDto.ide_plco || null);
      insertQuery.values.set('ide_corr', cuenta.ide_corr);
      insertQuery.values.set('usuario_ingre', usuario);
      insertQuery.values.set('fecha_ingre', new Date());

      await this.dataSource.createQuery(insertQuery);

      return { message: 'Correo agregado a la cola de envío' };
    } catch (error) {
      this.logger.error(`Error sendMail: ${error.message}`);
      throw new InternalServerErrorException(`Error al enviar correo: ${error.message}`);
    }
  }

  /**
   * Procesa correos pendientes en la cola
   */
  async processMailQueue() {
    try {
      // Obtener correos pendientes (máximo 100 por vez)
      const query = new SelectQuery(`
        SELECT
          ide_coco,
          destinatario_coco,
          asunto_coco,
          contenido_coco,
          tipo_coco,
          ide_plco,
          ide_corr,
          intentos_coco
        FROM
          sis_cola_correo
        WHERE
          estado_coco = 'PENDIENTE'
          AND (fecha_programada_coco IS NULL OR fecha_programada_coco <= NOW())
        ORDER BY
          fecha_ingre
        LIMIT 100
      `);

      const correosPendientes = await this.dataSource.createSelectQuery(query);

      for (const correo of correosPendientes) {
        try {
          // Marcar como procesando
          await this.updateEstadoCola(correo.ide_coco, 'PROCESANDO');

          // Obtener cuenta de correo
          const cuenta = await this.getCuentaCorreoById(correo.ide_corr);

          // Enviar correo real (usando la lógica que funciona)
          const resultadoEnvio = await this.enviarCorreo(cuenta, correo);

          // Marcar como enviado y registrar log
          await this.registrarEnvioExitoso(correo, cuenta, resultadoEnvio);

        } catch (error) {
          this.logger.error(`Error procesando correo ${correo.ide_coco}: ${error.message}`);
          await this.registrarErrorEnvio(correo, error.message);
        }
      }
      return { processed: correosPendientes.length };
    } catch (error) {
      this.logger.error(`Error processMailQueue: ${error.message}`);
      throw new InternalServerErrorException(`Error procesando cola de correos: ${error.message}`);
    }
  }

  /**
   * Envía un correo real usando nodemailer 
   */
  private async enviarCorreo(cuenta: any, correo: any): Promise<nodemailer.SentMessageInfo> {
    try {
      this.logger.log(`Enviando correo ${correo.ide_coco} usando cuenta: ${cuenta.correo_corr}`);
      // console.log(cuenta);
      // Crear transporter con la configuración que funciona
      const transporter = nodemailer.createTransport({
        host: cuenta.smtp_corr,
        port: cuenta.puerto_corr,
        secure: cuenta.secure_corr,
        auth: {
          user: cuenta.usuario_corr || cuenta.correo_corr,
          pass: cuenta.clave_corr
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
        logger: false,
        debug: false,
        tls: {
          rejectUnauthorized: false
        }
      });

      // Verificar conexión primero
      this.logger.log('Verificando conexión SMTP...');
      await transporter.verify();
      this.logger.log('✓ Conexión SMTP verificada exitosamente');

      // Configurar opciones del correo
      const mailOptions: nodemailer.SendMailOptions = {
        from: {
          name: cuenta.alias_corr || cuenta.correo_corr,
          address: cuenta.correo_corr
        },
        to: this.parseDestinatarios(correo.destinatario_coco),
        subject: correo.asunto_coco,
        html: correo.contenido_coco,
      };

      // Procesar adjuntos si existen
      if (correo.adjuntos_coco) {
        mailOptions.attachments = this.parseAdjuntos(correo.adjuntos_coco);
      }

      // Enviar correo
      this.logger.log('Enviando correo...');
      const resultado = await transporter.sendMail(mailOptions);

      this.logger.log('✓ Correo enviado exitosamente');
      this.logger.log(`Message ID: ${resultado.messageId}`);
      this.logger.log(`Response: ${resultado.response}`);

      // Cerrar conexión
      transporter.close();

      return resultado;

    } catch (error) {
      // Diagnosticar el error
      this.logger.error('✗ Error en prueba de envío:');
      this.logger.error(error.message);
      this.logger.error('Stack:', error.stack);
      const diagnostico = await this.diagnosticarErrorSMTP(error, cuenta);

      throw new InternalServerErrorException({
        success: false,
        message: 'Error enviando correo de prueba',
        error: error.message,
        diagnostico,
        cuenta
      });
    }
  }

  /**
   * Envío directo sin cola (usando la lógica que funciona)
   */
  async sendDirectMail(sendMailDto: SendMailDto, ideEmpr: number) {
    try {
      const cuenta = await this.getCuentaCorreo(ideEmpr, sendMailDto.ide_corr);

      let contenido = sendMailDto.contenido;
      let asunto = sendMailDto.asunto;

      // Si se especifica una plantilla, compilarla
      if (sendMailDto.ide_plco && !sendMailDto.contenido) {
        const plantilla = await this.templateService.getTemplateById(sendMailDto.ide_plco, ideEmpr);
        contenido = this.templateService.compileTemplate(plantilla.contenido_plco, sendMailDto.variables || {});
        asunto = this.templateService.compileTemplate(plantilla.asunto_plco, sendMailDto.variables || {});
      }

      // Enviar correo inmediato
      const resultado = await this.enviarCorreoInmediato({
        cuenta,
        destinatario: Array.isArray(sendMailDto.destinatario) ? sendMailDto.destinatario.join(',') : sendMailDto.destinatario,
        asunto,
        contenido,
        //  adjuntos: sendMailDto.adjuntos
      });

      return {
        success: true,
        message: 'Correo enviado exitosamente',
        messageId: resultado.messageId,
        response: resultado.response
      };
    } catch (error) {
      this.logger.error(`Error en envío directo: ${error.message}`);
      throw new InternalServerErrorException(`Error enviando correo: ${error.message}`);
    }
  }

  /**
   * Método auxiliar para envío inmediato
   */
  private async enviarCorreoInmediato(params: {
    cuenta: ConfigCuentaCorreo;
    destinatario: string;
    asunto: string;
    contenido: string;
    adjuntos?: any;
  }): Promise<nodemailer.SentMessageInfo> {
    try {
      this.logger.log(`Enviando correo directo usando cuenta: ${params.cuenta.correo_corr}`);

      // Crear transporter con la configuración que funciona
      const transporter = nodemailer.createTransport({
        host: params.cuenta.smtp_corr,
        port: params.cuenta.puerto_corr,
        secure: params.cuenta.secure_corr,
        auth: {
          user: params.cuenta.usuario_corr || params.cuenta.correo_corr,
          pass: params.cuenta.clave_corr
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
        logger: true,
        debug: true,
        tls: {
          rejectUnauthorized: false
        }
      });

      // Verificar conexión
      await transporter.verify();

      // Configurar opciones del correo
      const mailOptions: nodemailer.SendMailOptions = {
        from: {
          name: params.cuenta.nom_correo_corr || params.cuenta.correo_corr,
          address: params.cuenta.correo_corr
        },
        to: this.parseDestinatarios(params.destinatario),
        subject: params.asunto,
        html: params.contenido,
      };

      // Procesar adjuntos si existen
      if (params.adjuntos) {
        mailOptions.attachments = this.parseAdjuntos(JSON.stringify(params.adjuntos));
      }

      // Enviar correo
      const resultado = await transporter.sendMail(mailOptions);

      // Cerrar conexión
      transporter.close();

      return resultado;

    } catch (error) {
      // Diagnosticar el error
      this.logger.error('✗ Error en prueba de envío:');
      this.logger.error(error.message);
      this.logger.error('Stack:', error.stack);
      const diagnostico = await this.diagnosticarErrorSMTP(error, params.cuenta);

      throw new InternalServerErrorException({
        success: false,
        message: 'Error enviando correo de prueba',
        error: error.message,
        diagnostico,
        params
      });
    }
  }



  /**
   * Diagnosticar errores SMTP
   */
  private async diagnosticarErrorSMTP(error: any, configuracion: ConfigCuentaCorreo): Promise<string> {
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

  /**
   * Parsea destinatarios desde string a array
   */
  private parseDestinatarios(destinatarios: string): string | string[] {
    if (!destinatarios) return '';

    if (destinatarios.includes(',')) {
      return destinatarios.split(',').map(d => d.trim()).filter(d => d);
    }

    return destinatarios;
  }

  /**
   * Parsea adjuntos desde string JSON
   */
  private parseAdjuntos(adjuntosStr: string): any[] {
    try {
      if (!adjuntosStr) return [];

      const adjuntos = JSON.parse(adjuntosStr);
      return adjuntos.map((adjunto: any) => ({
        filename: adjunto.filename,
        path: adjunto.path,
        contentType: adjunto.contentType,
      }));
    } catch (error) {
      this.logger.warn(`Error parseando adjuntos: ${error.message}`);
      return [];
    }
  }

  /**
   * Actualiza el estado de un correo en la cola
   */
  private async updateEstadoCola(ide_coco: number, estado: string, error?: string, intentos: number = 0) {
    const updateQuery = new UpdateQuery('sis_cola_correo', 'ide_coco');
    updateQuery.values.set('estado_coco', estado);

    if (error) {
      updateQuery.values.set('error_coco', error);
    }

    if (intentos > 0) {
      updateQuery.values.set('intentos_coco', intentos);
    }

    if (estado === 'ENVIADO') {
      updateQuery.values.set('fecha_envio_coco', new Date());
    }

    updateQuery.where = 'ide_coco = $1';
    updateQuery.addParam(1, ide_coco);

    await this.dataSource.createQuery(updateQuery);
  }

  /**
   * Registra un envío exitoso
   */
  private async registrarEnvioExitoso(correo: any, cuenta: ConfigCuentaCorreo, resultado: nodemailer.SentMessageInfo) {
    // Actualizar cola
    await this.updateEstadoCola(correo.ide_coco, 'ENVIADO');

    // Registrar en log
    const insertLog = new InsertQuery('sis_log_correo', 'ide_loco');
    insertLog.values.set(
      'ide_loco',
      await this.dataSource.getSeqTable('sis_log_correo', 'ide_loco', 1, 'sistema')
    );
    insertLog.values.set('destinatario_loco', correo.destinatario_coco);
    insertLog.values.set('asunto_loco', correo.asunto_coco);
    insertLog.values.set('estado_loco', 'ENVIADO');
    insertLog.values.set('ide_coco', correo.ide_coco);
    insertLog.values.set('ide_plco', correo.ide_plco);
    insertLog.values.set('ide_corr', cuenta.ide_corr);
    insertLog.values.set('mensaje_id_loco', resultado.messageId);
    insertLog.values.set('respuesta_loco', resultado.response || 'Enviado exitosamente');
    insertLog.values.set('usuario_ingre', 'sistema');
    insertLog.values.set('fecha_ingre', new Date());

    await this.dataSource.createQuery(insertLog);
  }

  /**
   * Registra un error de envío
   */
  private async registrarErrorEnvio(correo: any, error: string) {
    const intentos = (correo.intentos_coco || 0) + 1;

    if (intentos >= 3) {
      // Máximo de intentos alcanzado, marcar como error
      await this.updateEstadoCola(correo.ide_coco, 'ERROR', error, intentos);
    } else {
      // Reintentar más tarde
      await this.updateEstadoCola(correo.ide_coco, 'PENDIENTE', error, intentos);

      // Reprogramar para reintento (5 minutos después)
      const updateQuery = new UpdateQuery('sis_cola_correo', 'ide_coco');
      updateQuery.values.set('fecha_programada_coco', new Date(Date.now() + 5 * 60 * 1000));
      updateQuery.where = 'ide_coco = $1';
      updateQuery.addParam(1, correo.ide_coco);

      await this.dataSource.createQuery(updateQuery);
    }

    // Registrar en log
    const insertLog = new InsertQuery('sis_log_correo', 'ide_loco');
    insertLog.values.set(
      'ide_loco',
      await this.dataSource.getSeqTable('sis_log_correo', 'ide_loco', 1, 'sistema')
    );
    insertLog.values.set('destinatario_loco', correo.destinatario_coco);
    insertLog.values.set('asunto_loco', correo.asunto_coco);
    insertLog.values.set('estado_loco', 'ERROR');
    insertLog.values.set('ide_coco', correo.ide_coco);
    insertLog.values.set('ide_plco', correo.ide_plco);
    insertLog.values.set('ide_corr', correo.ide_corr);
    insertLog.values.set('error_loco', error);
    insertLog.values.set('usuario_ingre', 'sistema');
    insertLog.values.set('fecha_ingre', new Date());

    await this.dataSource.createQuery(insertLog);
  }

  /**
   * Obtiene estadísticas de correos
   */
  async getEstadisticas(ideEmpr: number) {
    const query = new SelectQuery(`
      SELECT
        estado_coco,
        COUNT(*) as cantidad
      FROM
        sis_cola_correo c
        INNER JOIN sis_correo co ON c.ide_corr = co.ide_corr
      WHERE
        co.ide_empr = $1
      GROUP BY
        estado_coco
    `);
    query.addParam(1, ideEmpr);

    return await this.dataSource.createSelectQuery(query);
  }

  /**
   * Obtiene una cuenta de correo por ID
   */
  private async getCuentaCorreoById(ide_corr: number) {
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
      FROM
        sis_correo
      WHERE
        ide_corr = $1
    `);
    query.addParam(1, ide_corr);

    const cuenta = await this.dataSource.createSingleQuery(query);
    if (!cuenta) {
      throw new NotFoundException(`Cuenta de correo con ID ${ide_corr} no encontrada`);
    }

    // Obtener configuraciones adicionales
    const configQuery = new SelectQuery(`
      SELECT
        propiedad_corr,
        valor_corr
      FROM
        sis_conf_correo
      WHERE
        ide_corr = $1
    `);
    configQuery.addParam(1, cuenta.ide_corr);

    const configuraciones = await this.dataSource.createSelectQuery(configQuery);
    cuenta.configuraciones = configuraciones;

    return cuenta;
  }
}