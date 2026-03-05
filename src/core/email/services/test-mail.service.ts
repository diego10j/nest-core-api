import { Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';

import { ConfigCuentaCorreo } from '../interfaces/email';
import {
  EMAIL_PROVIDER_TOKEN,
  IEmailProvider,
} from '../providers/email-provider.interface';

/**
 * Servicio de prueba de envío de correo.
 *
 * Principios aplicados:
 *  - SRP: única responsabilidad → verificar que la configuración de una
 *    cuenta correo funciona enviando un correo de prueba.
 *  - DIP: delega el envío a IEmailProvider; no conoce Resend directamente.
 */
@Injectable()
export class TestMailService {
  private readonly logger = new Logger(TestMailService.name);

  constructor(
    @Inject(EMAIL_PROVIDER_TOKEN) private readonly emailProvider: IEmailProvider,
  ) { }

  /**
   * Envía un correo de prueba usando la configuración proporcionada.
   * La `clave_corr` es la Resend API Key (re_...) de la cuenta.
   */
  async testEnvioCorreo(configuracion: ConfigCuentaCorreo, toEmail: string): Promise<any> {
    this.logger.log('=== INICIANDO PRUEBA DE ENVÍO VIA RESEND ===');
    this.logger.log(`Cuenta: ${configuracion.correo_corr} → ${toEmail}`);

    try {
      const resultado = await this.emailProvider.send(
        {
          from: {
            name: configuracion.nom_correo_corr || configuracion.alias_corr || configuracion.correo_corr,
            address: configuracion.correo_corr,
          },
          to: toEmail,
          subject: `✅ Prueba de envío de correo - ${new Date().toLocaleString()}`,
          html: this.buildTestHtml(configuracion, toEmail),
        },
        configuracion.clave_corr, // Resend API Key
      );

      this.logger.log(`✓ Correo de prueba enviado. Resend ID: ${resultado.messageId}`);

      return {
        success: true,
        message: 'Correo de prueba enviado exitosamente via Resend',
        messageId: resultado.messageId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`✗ Error en prueba de envío: ${error.message}`);

      throw new InternalServerErrorException({
        success: false,
        message: 'Error enviando correo de prueba',
        error: error.message,
        hint: 'Verifica que clave_corr contenga una Resend API Key válida (re_...) y que el dominio/email esté verificado en Resend.',
        cuenta: configuracion.correo_corr,
      });
    }
  }

  /**
   * Método de prueba rápida — destinado a desarrollo.
   * Reemplaza `clave_corr` con tu Resend API Key antes de usar.
   */
  async testMail(toEmail: string) {
    return this.testEnvioCorreo(
      {
        ide_corr: 0,
        correo_corr: 'admin@produquimic.com.ec',
        nom_correo_corr: 'Sistema ERP - Test',
        alias_corr: 'ERP Test',
        clave_corr: 're_RyvYeSUf_Fh8iMkLx3ugsG1e4kSNovMwg', // ← Actualizar con API Key real
      },
      toEmail,
    );
  }

  // ──────────────────────────────────────────────
  // Helpers privados
  // ──────────────────────────────────────────────

  private buildTestHtml(config: ConfigCuentaCorreo, toEmail: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #007bff; color: white; padding: 20px; text-align: center; border-radius: 6px 6px 0 0; }
          .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 6px 6px; }
          .badge { display:inline-block; background:#28a745; color:white; padding:4px 10px; border-radius:12px; font-size:13px; }
          table { border-collapse: collapse; width: 100%; }
          td { padding: 8px 12px; border-bottom: 1px solid #dee2e6; }
          td:first-child { font-weight: bold; width: 35%; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚀 Prueba de Correo Exitosa</h1>
            <span class="badge">Powered by Resend</span>
          </div>
          <div class="content">
            <h2>¡Hola!</h2>
            <p>Este correo confirma que la integración con <strong>Resend</strong> está funcionando correctamente.</p>
            <h3>Configuración utilizada:</h3>
            <table>
              <tr><td>Remitente</td><td>${config.correo_corr}</td></tr>
              <tr><td>Nombre visible</td><td>${config.nom_correo_corr || config.alias_corr || '-'}</td></tr>
              <tr><td>Destinatario</td><td>${toEmail}</td></tr>
              <tr><td>Fecha y hora</td><td>${new Date().toLocaleString()}</td></tr>
              <tr><td>Proveedor</td><td>Resend API</td></tr>
            </table>
            <p style="margin-top:20px;">
              Si recibes este correo, la configuración de Resend es correcta ✅
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}
