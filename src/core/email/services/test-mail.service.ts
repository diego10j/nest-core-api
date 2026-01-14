import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { ConfigCuentaCorreo } from '../interfaces/email';

import { TemplateService } from './template.service';

@Injectable()
export class TestMailService {
  private readonly logger = new Logger(TestMailService.name);

  constructor(
    public readonly dataSource: DataSourceService,
    private readonly _templateService: TemplateService,
  ) {}

  async testEnvioCorreo(configuracion: ConfigCuentaCorreo, toEmail: string): Promise<any> {
    try {
      this.logger.log('=== INICIANDO PRUEBA DE ENVÍO DE CORREO ===');
      this.logger.log(`Configuración: ${JSON.stringify(configuracion, null, 2)}`);

      // Crear transporter con configuración quemada - CORREGIDO
      const transporter = nodemailer.createTransport({
        host: configuracion.smtp_corr,
        port: configuracion.puerto_corr, // CORRECCIÓN: port en lugar de port,
        secure: configuracion.secure_corr,
        auth: {
          user: configuracion.usuario_corr,
          pass: configuracion.clave_corr,
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
        logger: true,
        debug: true,
        tls: {
          rejectUnauthorized: false, // Importante para pruebas
        },
      });

      // Verificar conexión primero
      this.logger.log('Verificando conexión SMTP...');
      await transporter.verify();
      this.logger.log('✓ Conexión SMTP verificada exitosamente');

      // Configurar opciones del correo
      const mailOptions: nodemailer.SendMailOptions = {
        from: {
          name: configuracion.nom_correo_corr || configuracion.usuario_corr,
          address: configuracion.correo_corr,
        },
        to: toEmail,
        subject: '✅ Prueba de envío de correo - ' + new Date().toLocaleString(),
        html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #007bff; color: white; padding: 20px; text-align: center; }
                .content { background: #f8f9fa; padding: 30px; border-radius: 5px; }
                .success { color: #28a745; font-weight: bold; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🚀 Prueba de Correo Exitosa</h1>
                </div>
                <div class="content">
                  <h2>¡Hola Mundo!</h2>
                  <p>Este es un correo de prueba enviado desde <span class="success">NestJS API</span></p>
                  <p><strong>Configuración usada:</strong></p>
                  <ul>
                    <li>Host: ${configuracion.smtp_corr}</li>
                    <li>Puerto: ${configuracion.puerto_corr}</li>
                    <li>Secure: ${configuracion.secure_corr ? 'Sí' : 'No'}</li>
                    <li>Usuario: ${configuracion.usuario_corr}</li>
                    <li>From: ${configuracion.correo_corr}</li>
                    <li>To: ${toEmail}</li>
                  </ul>
                  <p><strong>Fecha y hora:</strong> ${new Date().toLocaleString()}</p>
                  <hr>
                  <p>Si recibes este correo, significa que la configuración SMTP es correcta ✅</p>
                </div>
              </div>
            </body>
            </html>
          `,
        text: `Hola Mundo!\n\nEste es un correo de prueba enviado desde NestJS API.\nConfiguración: Host: ${configuracion.smtp_corr}, Puerto: ${configuracion.puerto_corr}, Usuario: ${configuracion.usuario_corr}\nFecha: ${new Date().toLocaleString()}`,
      };

      // Enviar correo
      this.logger.log('Enviando correo de prueba...');
      const resultado = await transporter.sendMail(mailOptions);

      this.logger.log('✓ Correo enviado exitosamente');
      this.logger.log(`Message ID: ${resultado.messageId}`);
      this.logger.log(`Response: ${resultado.response}`);

      // Cerrar conexión
      transporter.close();

      return {
        success: true,
        message: 'Correo enviado exitosamente',
        messageId: resultado.messageId,
        response: resultado.response,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('✗ Error en prueba de envío:');
      this.logger.error(error.message);
      this.logger.error('Stack:', error.stack);

      // Diagnosticar el error
      const diagnostico = await this.diagnosticarErrorSMTP(error, configuracion);

      throw new InternalServerErrorException({
        success: false,
        message: 'Error enviando correo de prueba',
        error: error.message,
        diagnostico,
        configuracion,
      });
    }
  }

  /**
   * Diagnosticar errores SMTP
   */
  private async diagnosticarErrorSMTP(error: any, configuracion: any): Promise<string> {
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
    diagnostico += `\nConfiguración probada: ${configuracion.host}:${configuracion.port}, secure: ${configuracion.secure}`;

    return diagnostico;
  }

  /**
   * Método simple para prueba rápida
   */
  async testMail(toEmail: string) {
    return this.testEnvioCorreo(
      {
        ide_corr: 0,
        smtp_corr: 'mail.xxxx.com.ec',
        puerto_corr: 465,
        secure_corr: true,
        usuario_corr: 'xxxxx@xxx.com.ec',
        clave_corr: 'xxxxxx.xxxxxx',
        correo_corr: 'info@xxx.com.ec',
        nom_correo_corr: 'XXXXXX Test',
      },
      toEmail,
    );
  }
}
