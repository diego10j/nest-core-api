-- =====================================================================
-- MIGRACIÓN: Desglose bot vs. humano en métricas diarias de WhatsApp
-- =====================================================================
-- wha_metrics_diaria.mensajes_enviados cuenta TODO mensaje saliente
-- (direction_whmem = '1'), sin distinguir si lo mandó el bot o un agente
-- humano. Esta columna aísla el subconjunto enviado por el bot
-- (wha_mensaje.es_bot_whmem = TRUE) para poder validar el comportamiento
-- del bot en la página de Métricas YCloud sin mezclarlo con la mensajería
-- manual de los asesores.

ALTER TABLE wha_metrics_diaria
  ADD COLUMN IF NOT EXISTS mensajes_bot_enviados INT4 NOT NULL DEFAULT 0;

COMMENT ON COLUMN wha_metrics_diaria.mensajes_bot_enviados IS 'Subconjunto de mensajes_enviados enviados automáticamente por el bot (wha_mensaje.es_bot_whmem = TRUE), no por un agente humano';
