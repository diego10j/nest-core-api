-- =============================================================================
-- MIGRACIÓN: Integración de Resend como proveedor de envío de correo
-- Versión  : 1.0
-- Fecha    : 2026-02-28
-- Descripción:
--   El campo clave_corr en sis_correo ahora almacena la Resend API Key
--   en lugar de la contraseña SMTP.
--   Los campos smtp_corr, puerto_corr, secure_corr, usuario_corr quedan
--   deprecados pero se conservan por compatibilidad y trazabilidad.
-- =============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Comentarios en columnas para documentar el nuevo uso
-- ──────────────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN sis_correo.clave_corr IS
  'Resend API Key (re_xxxx). Anteriormente contraseña SMTP.';

COMMENT ON COLUMN sis_correo.smtp_corr IS
  '[DEPRECADO con Resend] Host SMTP. Ya no se usa para envío.';

COMMENT ON COLUMN sis_correo.puerto_corr IS
  '[DEPRECADO con Resend] Puerto SMTP. Ya no se usa para envío.';

COMMENT ON COLUMN sis_correo.secure_corr IS
  '[DEPRECADO con Resend] Indica si usaba SSL/TLS. Ya no se usa.';

COMMENT ON COLUMN sis_correo.usuario_corr IS
  '[DEPRECADO con Resend] Usuario SMTP. Ya no se usa para envío.';

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Actualizar cuentas existentes con la Resend API Key
--    IMPORTANTE: Reemplaza 're_TU_API_KEY_AQUI' con la clave real de tu
--    cuenta o empresa en https://resend.com/api-keys
-- ──────────────────────────────────────────────────────────────────────────────

-- Actualización global para todas las cuentas (ajusta el filtro según necesites)
-- UPDATE sis_correo
--   SET clave_corr = 're_TU_API_KEY_AQUI'
-- WHERE ide_empr = 1;  -- Ajusta el ide_empr de la empresa

-- Actualización por cuenta específica (recomendado si tienes múltiples empresas)
-- UPDATE sis_correo SET clave_corr = 're_API_KEY_EMPRESA_1' WHERE ide_corr = 1;
-- UPDATE sis_correo SET clave_corr = 're_API_KEY_EMPRESA_2' WHERE ide_corr = 2;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Requisitos en Resend (ejecutar en https://resend.com)
-- ──────────────────────────────────────────────────────────────────────────────
-- 3.1. Crear una API Key en: https://resend.com/api-keys
-- 3.2. Verificar el dominio del campo correo_corr en: https://resend.com/domains
--      El campo correo_corr debe pertenecer a un dominio verificado en Resend.
--      Durante desarrollo / pruebas se puede usar: onboarding@resend.dev
-- 3.3. Las API Keys deben tener permisos de "Send emails".

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Verificar la migración
-- ──────────────────────────────────────────────────────────────────────────────

SELECT
  ide_corr,
  alias_corr,
  correo_corr,
  nom_correo_corr,
  CASE
    WHEN clave_corr LIKE 're_%' THEN '✅ Resend API Key configurada'
    WHEN clave_corr IS NULL OR clave_corr = '' THEN '❌ Sin clave configurada'
    ELSE '⚠️  Valor no parece ser una Resend API Key (re_...)'
  END AS estado_clave,
  ide_empr
FROM sis_correo
ORDER BY ide_empr, ide_corr;
