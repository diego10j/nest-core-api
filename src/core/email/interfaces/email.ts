export interface ConfigCuentaCorreo {
    ide_corr: number;
    alias_corr?: string;
    smtp_corr: string;
    puerto_corr: number;
    usuario_corr: string;
    nom_correo_corr?: string;
    correo_corr: string;
    clave_corr: string;
    secure_corr: boolean;
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


// Definir la interfaz Attachment correctamente
export interface MailAttachment {
    filename?: string;
    content?: string | Buffer;
    path?: string;
    contentType?: string;
    encoding?: string;
    cid?: string;
}
