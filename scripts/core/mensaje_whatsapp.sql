-- mensaje_whatsapp(jsonb): procesaba webhooks entrantes de la Cloud API directa de
-- Meta (invocada únicamente desde WhatsappApiService.saveReceivedMessage, expuesta en
-- WebhookController POST /webhook). El envío y la recepción de mensajes se migraron
-- por completo a YCloud como BSP (ver ycloud.service.ts / ycloud-webhook.controller.ts);
-- esta función y el webhook directo de Meta quedaron sin uso y se eliminaron del código.
--
-- Ejecutar una sola vez contra la base de datos para eliminar la función ya desplegada
-- (editar este script no la elimina de Postgres).
DROP FUNCTION IF EXISTS mensaje_whatsapp(jsonb);
