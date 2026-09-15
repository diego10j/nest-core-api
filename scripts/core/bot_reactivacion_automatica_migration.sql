-- =====================================================================
-- MIGRACIÓN: Reactivación automática de chats viejos (clientes conocidos)
-- =====================================================================
-- Hoy el bot solo se activa solo para chats NUEVOS (primer contacto). Un chat
-- viejo que quedó en modo ASESOR se queda ahí para siempre, sin importar cuánto
-- tiempo pase ni si el cliente vuelve a escribir.
--
-- Con tiempo_reactiva_chats_viejos = N (horas), un chat NO NUEVO en modo ASESOR
-- se reactiva solo (vuelve a modo BOT) cuando TODAS estas condiciones se cumplen
-- para el mensaje entrante (ver BotService.intentarReactivarChatViejo):
--   1. El cliente ya escribió antes hace más de N horas (wha_chat.ultimo_ingreso_
--      cliente_whcha, timestamptz — confiable, a diferencia de las columnas
--      timestamp sin zona de wha_mensaje, ver nota en el vault de conocimiento).
--   2. El cliente es "conocido": tiene memoria de una sesión de bot anterior, o
--      (si no) ya generó una proforma antes (cruce por teléfono).
--   3. GPT determina que el mensaje es una consulta de venta nueva (no depende
--      de un pedido/trámite ya existente, ej. "me envía la guía").
--
-- NULL = reactivación automática DESACTIVADA para esta cuenta (default) — no se
-- activa sola, cada empresa la habilita explícitamente poniendo un valor en horas
-- desde la configuración del bot. El umbral ya no queda quemado en el código: cada
-- cuenta define sus propias horas (ej. 24, 48, 12).

-- Si ya existe la columna booleana de una versión anterior de esta migración, se
-- reemplaza por el campo en horas — no queda ningún resabio de la versión vieja.
ALTER TABLE wha_bot_config
  DROP COLUMN IF EXISTS reactivacion_automatica_whbco;

ALTER TABLE wha_bot_config
  ADD COLUMN IF NOT EXISTS tiempo_reactiva_chats_viejos INT NULL;

COMMENT ON COLUMN wha_bot_config.tiempo_reactiva_chats_viejos IS 'Horas de silencio del cliente antes de reactivar automáticamente un chat viejo (no nuevo) en modo ASESOR, si es cliente conocido y el mensaje es una consulta de venta nueva. NULL = reactivación automática desactivada para esta cuenta.';
