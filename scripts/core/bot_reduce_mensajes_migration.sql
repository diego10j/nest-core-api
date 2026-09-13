-- =====================================================================
-- MIGRACIÓN: Modo "mensajes reducidos" del bot de WhatsApp
-- =====================================================================
-- Cuando reduce_mensajes_whbco=true, el bot usa un flujo simplificado para
-- clientes nuevos: espera segundos_espera_whbco de silencio antes de responder
-- (agrupa mensajes seguidos en uno solo), evita el asistente de cotización
-- completo (sin preguntas de uso/forma de pago/dirección exacta) y prioriza
-- terminar cada conversación de producto en 1-2 mensajes.

ALTER TABLE wha_bot_config
  ADD COLUMN IF NOT EXISTS reduce_mensajes_whbco BOOL NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS segundos_espera_whbco INT  NOT NULL DEFAULT 10;

COMMENT ON COLUMN wha_bot_config.reduce_mensajes_whbco IS 'TRUE = modo reducido activo (flujo simplificado para clientes nuevos, sin límite de mensajes pero minimizando cuántos envía el bot)';
COMMENT ON COLUMN wha_bot_config.segundos_espera_whbco IS 'Segundos de silencio del cliente antes de que el bot procese y responda los mensajes acumulados (debounce) — solo aplica con reduce_mensajes_whbco=true';
