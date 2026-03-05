/**
 * Configuración de cuenta de correo almacenada en sis_correo.
 *
 * Con la integración a Resend:
 *  - clave_corr → almacena la Resend API Key (re_xxxxxxxx)
 *  - correo_corr → dirección "from" (debe estar verificada en Resend)
 *  - nom_correo_corr / alias_corr → nombre visible del remitente
 *  - smtp_corr, puerto_corr, secure_corr, usuario_corr → ya no se utilizan
 *    para el envío pero se mantienen en el modelo para compatibilidad.
 */
export interface ConfigCuentaCorreo {
  ide_corr: number;
  alias_corr?: string;
  /** No utilizado con Resend; se mantiene por compatibilidad */
  smtp_corr?: string;
  /** No utilizado con Resend; se mantiene por compatibilidad */
  puerto_corr?: number;
  /** No utilizado con Resend; se mantiene por compatibilidad */
  usuario_corr?: string;
  nom_correo_corr?: string;
  correo_corr: string;
  /** Resend API Key (re_...) almacenada en clave_corr */
  clave_corr: string;
  /** No utilizado con Resend; se mantiene por compatibilidad */
  secure_corr?: boolean;
}

export interface ColaCorreo {
  jobId: string;
  destinatario: string | string[];
  asunto: string;
  contenido: string;
  ide_plco?: number;
  ide_corr: number;
  usuario: string;
}

/**
 * @deprecated Usar EmailAttachmentOptions de providers/email-provider.interface.ts
 * Se mantiene por compatibilidad con código existente.
 */
export interface MailAttachment {
  filename?: string;
  content?: string | Buffer;
  path?: string;
  contentType?: string;
  encoding?: string;
  cid?: string;
}
