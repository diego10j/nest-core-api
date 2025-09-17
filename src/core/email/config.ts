export const MAIL_QUEUE = 'mail-queue';
export const CAMPAIGN_QUEUE = 'campaign-queue';

// Estados de cola de correos
export const EMAIL_QUEUE_STATUS = {
    PENDING: 'PENDIENTE',
    PROCESSING: 'PROCESANDO',
    SENT: 'ENVIADO',
    ERROR: 'ERROR',
    RETRYING: 'REINTENTANDO'
};

// Estados de campañas
export const CAMPAIGN_STATUS = {
    PENDING: 'PENDIENTE',
    PROCESSING: 'PROCESANDO',
    COMPLETED: 'COMPLETADA',
    COMPLETED_WITH_ERRORS: 'COMPLETADA_CON_ERRORES',
    ERROR: 'ERROR'
};

// Tipos de plantillas integradas
export const BUILTIN_TEMPLATES = {
    USER_CREATED: 'user-created',
    PASSWORD_RESET: 'password-reset',
    PASSWORD_CHANGE: 'password-change',
    NOTIFICATION: 'notification'
};