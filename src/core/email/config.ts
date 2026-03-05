// Estados de auditoría de correos (sis_cola_correo.estado_coco)
export const EMAIL_QUEUE_STATUS = {
  PENDING: 'PENDIENTE',
  PROCESSING: 'PROCESANDO',
  SENT: 'ENVIADO',
  ERROR: 'ERROR',
  RETRYING: 'REINTENTANDO',
};

// Estados de campañas
export const CAMPAIGN_STATUS = {
  PENDING: 'PENDIENTE',
  PROCESSING: 'PROCESANDO',
  COMPLETED: 'COMPLETADA',
  COMPLETED_WITH_ERRORS: 'COMPLETADA_CON_ERRORES',
  ERROR: 'ERROR',
};

// Tipos de plantillas integradas
export const BUILTIN_TEMPLATES = {
  USER_CREATED: 'user-created',
  PASSWORD_RESET: 'password-reset',
  PASSWORD_CHANGE: 'password-change',
  NOTIFICATION: 'notification',
};
