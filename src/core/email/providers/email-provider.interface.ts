/**
 * Contrato para el proveedor de envío de correo electrónico.
 * Principio de Inversión de Dependencias (DIP): los módulos de alto nivel
 * (MailService, TestMailService) dependen de esta abstracción, no de
 * implementaciones concretas.
 */

export const EMAIL_PROVIDER_TOKEN = 'IEmailProvider';

// ──────────────────────────────────────────────
// DTOs de entrada / salida del proveedor
// ──────────────────────────────────────────────

export interface EmailFrom {
    /** Nombre visible del remitente */
    name: string;
    /** Dirección de correo del remitente (debe estar verificada en Resend) */
    address: string;
}

export interface EmailAttachmentOptions {
    /** Nombre del archivo que recibirá el destinatario */
    filename: string;
    /** Contenido del archivo como Buffer o base64 string */
    content: Buffer | string;
    /** MIME type, p.ej. "application/pdf" */
    contentType?: string;
}

export interface SendEmailOptions {
    from: EmailFrom;
    /** Uno o varios destinatarios */
    to: string | string[];
    subject: string;
    /** Contenido HTML del correo */
    html: string;
    attachments?: EmailAttachmentOptions[];
}

export interface SendEmailResult {
    /** ID del mensaje devuelto por el proveedor */
    messageId: string;
    success: boolean;
}

// ──────────────────────────────────────────────
// Interface del proveedor (contrato)
// ──────────────────────────────────────────────

/**
 * Contrato de envío de correo.
 * La API key se pasa por llamada para soportar múltiples cuentas configuradas
 * en BD (una por empresa), siguiendo el principio de responsabilidad única.
 */
export interface IEmailProvider {
    /**
     * Envía un correo electrónico.
     * @param options  Datos del correo (destinatario, asunto, HTML, adjuntos)
     * @param apiKey   Clave de API del proveedor (Resend API Key) almacenada en sis_correo.clave_corr
     */
    send(options: SendEmailOptions, apiKey: string): Promise<SendEmailResult>;
}
