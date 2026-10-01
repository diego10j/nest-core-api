-- El servicio de correo guarda en sis_cola_correo el id que devuelve Resend al enviar (mensaje_id_coco).
-- Si la columna no existe, el backend lo descarta con el aviso:
--   [UpdateQuery] Descartando campos no encontrados en tabla "sis_cola_correo": mensaje_id_coco
-- El correo SÍ se envía; solo se pierde ese id (útil para rastrear la entrega en Resend).
ALTER TABLE sis_cola_correo ADD COLUMN IF NOT EXISTS mensaje_id_coco VARCHAR(100);

-- Después de ejecutarlo, refrescar la caché de columnas del backend (como administrador):
--   POST /api/core/refreshTableColumns  { "module": "sis", "tableName": "cola_correo" }
-- o reiniciar el backend.
