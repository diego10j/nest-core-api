-- =====================================================================
-- MIGRACIÓN: Bot QuimIA para WhatsApp + Interface Chat
-- =====================================================================

-- 0. Campo para identificar mensajes enviados por el bot en wha_mensaje
ALTER TABLE wha_mensaje ADD COLUMN IF NOT EXISTS es_bot_whmem BOOL NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN wha_mensaje.es_bot_whmem IS 'TRUE cuando el mensaje fue enviado automáticamente por el bot QuimIA';

-- Índice para filtrar mensajes del bot eficientemente
CREATE INDEX IF NOT EXISTS idx_wha_mensaje_bot ON wha_mensaje(ide_whcha) WHERE es_bot_whmem = TRUE;

-- 1. Columnas nuevas en wha_chat
ALTER TABLE wha_chat
  ADD COLUMN IF NOT EXISTS bot_activo_whcha      BOOL NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS bot_modo_whcha        VARCHAR(20) DEFAULT 'BOT';
  -- Valores: BOT = bot responde | ASESOR = agente asignado

COMMENT ON COLUMN wha_chat.bot_activo_whcha IS 'FALSE cuando el cliente pidió asesor. El bot no responde hasta que un agente libere el chat.';
COMMENT ON COLUMN wha_chat.bot_modo_whcha   IS 'BOT = bot activo | ASESOR = esperando agente humano';

-- 2. Horario del bot (horas fuera de oficina)
-- Oficina: L-V 08:00-17:00 | Sáb 09:00-13:00
-- Bot activo: L-V 00:00-07:59 y 17:01-23:59 | Sáb 00:00-08:59 y 13:01-23:59 | Dom todo el día

-- Primero el tipo de horario
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sis_tipo_horario WHERE ide_tihor = 3) THEN
    INSERT INTO sis_tipo_horario (ide_tihor, nombre_tihor, activo_tihor, ide_empr, ide_sucu)
    VALUES (3, 'HORARIO BOT', TRUE, 0, 2);
  END IF;
END $$;

-- Lunes a Viernes: madrugada/mañana (00:00 - 07:59)
INSERT INTO sis_horario (ide_hora, ide_tihor, dia_hora, hora_inicio_hora, hora_fin_hora, activo_hora, ide_empr, ide_sucu)
SELECT 20, 3, d, '00:00:00', '07:59:59', TRUE, 0, 2
FROM unnest(ARRAY[1,2,3,4,5]) AS d
ON CONFLICT DO NOTHING;

-- Lunes a Viernes: tarde/noche (17:01 - 23:59)
INSERT INTO sis_horario (ide_hora, ide_tihor, dia_hora, hora_inicio_hora, hora_fin_hora, activo_hora, ide_empr, ide_sucu)
SELECT 21, 3, d, '17:01:00', '23:59:59', TRUE, 0, 2
FROM unnest(ARRAY[1,2,3,4,5]) AS d
ON CONFLICT DO NOTHING;

-- Sábado: madrugada/mañana (00:00 - 08:59)
INSERT INTO sis_horario (ide_hora, ide_tihor, dia_hora, hora_inicio_hora, hora_fin_hora, activo_hora, ide_empr, ide_sucu)
VALUES (22, 3, 6, '00:00:00', '08:59:59', TRUE, 0, 2)
ON CONFLICT DO NOTHING;

-- Sábado: tarde/noche (13:01 - 23:59)
INSERT INTO sis_horario (ide_hora, ide_tihor, dia_hora, hora_inicio_hora, hora_fin_hora, activo_hora, ide_empr, ide_sucu)
VALUES (23, 3, 6, '13:01:00', '23:59:59', TRUE, 0, 2)
ON CONFLICT DO NOTHING;

-- Domingo: todo el día
INSERT INTO sis_horario (ide_hora, ide_tihor, dia_hora, hora_inicio_hora, hora_fin_hora, activo_hora, ide_empr, ide_sucu)
VALUES (24, 3, 7, '00:00:00', '23:59:59', TRUE, 0, 2)
ON CONFLICT DO NOTHING;

-- 3. Configuración del bot por cuenta WhatsApp
CREATE TABLE IF NOT EXISTS wha_bot_config (
  ide_whbco         SERIAL          PRIMARY KEY,
  ide_whcue         INT4            NOT NULL REFERENCES wha_cuenta(ide_whcue) ON DELETE CASCADE,
  -- Estado de activación
  activo_manual     BOOL            NOT NULL DEFAULT FALSE,
  usa_horario       BOOL            NOT NULL DEFAULT TRUE,
  ide_tihor         INT4            REFERENCES sis_tipo_horario(ide_tihor),
  -- Personalización del bot (ya no en sis_parametro)
  nombre_bot        VARCHAR(80)     NOT NULL DEFAULT 'QuimIA',
  prompt_sistema    TEXT            NOT NULL DEFAULT
    'Eres {BOT_NOMBRE}, asistente comercial virtual. Eres una mujer, amable y profesional.
Tu objetivo es recopilar datos para elaborar cotizaciones. Responde en español formal.
No inventes precios ni información que no tengas. Política de envío gratuito en Quito y Valles para pedidos mayores a $100.',
  template_saludo   VARCHAR(100)    DEFAULT 'bot_saludo_inicial',
  horario_atencion  VARCHAR(200)    DEFAULT 'Lunes a Viernes de 08:00 a 17:00 y Sábados de 09:00 a 13:00.',
  monto_envio_gratis NUMERIC(10,2)  DEFAULT 100,
  max_intentos_fallo INT2           DEFAULT 3,
  -- Auditoría
  ide_empr          INT4,
  usuario_ingre     VARCHAR(50),
  hora_ingre        TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
  usuario_actua     VARCHAR(50),
  hora_actua        TIMESTAMP,
  UNIQUE (ide_whcue)
);
COMMENT ON TABLE  wha_bot_config IS 'Configuración completa del bot por cuenta WhatsApp';
COMMENT ON COLUMN wha_bot_config.activo_manual      IS 'ON/OFF manual desde el front (tiene prioridad sobre horario)';
COMMENT ON COLUMN wha_bot_config.usa_horario        IS 'TRUE = el bot se activa automáticamente según ide_tihor';
COMMENT ON COLUMN wha_bot_config.ide_tihor          IS 'Apunta al HORARIO BOT (tramos fuera de oficina)';
COMMENT ON COLUMN wha_bot_config.nombre_bot         IS 'Nombre del asistente virtual (ej: QuimIA)';
COMMENT ON COLUMN wha_bot_config.prompt_sistema     IS 'System prompt que se envía a OpenAI';
COMMENT ON COLUMN wha_bot_config.template_saludo    IS 'Nombre del template YCloud para el primer mensaje';
COMMENT ON COLUMN wha_bot_config.horario_atencion   IS 'Texto del horario mostrado cuando el cliente pide asesor';
COMMENT ON COLUMN wha_bot_config.monto_envio_gratis IS 'Monto mínimo en USD para envío gratuito';

-- Insertar configuración por defecto para la cuenta existente
INSERT INTO wha_bot_config (ide_whcue, activo_manual, usa_horario, ide_tihor, ide_empr)
VALUES (1, FALSE, TRUE, 3, 0)
ON CONFLICT (ide_whcue) DO NOTHING;

-- 4. Log de activaciones / desactivaciones
CREATE TABLE IF NOT EXISTS wha_bot_activacion_log (
  ide_whbal     BIGSERIAL   PRIMARY KEY,
  ide_whcue     INT4        NOT NULL REFERENCES wha_cuenta(ide_whcue),
  accion        CHAR(1)     NOT NULL CHECK (accion IN ('A','D')),
  origen        VARCHAR(20) NOT NULL DEFAULT 'MANUAL' CHECK (origen IN ('MANUAL','HORARIO')),
  ide_usua      INT4,
  observacion   VARCHAR(200),
  hora_ingre    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON COLUMN wha_bot_activacion_log.accion  IS 'A=Activar | D=Desactivar';
COMMENT ON COLUMN wha_bot_activacion_log.origen  IS 'MANUAL=desde front | HORARIO=automático';
CREATE INDEX IF NOT EXISTS idx_wha_bot_log_cuenta ON wha_bot_activacion_log(ide_whcue, hora_ingre DESC);

-- 5. Sesiones de conversación del bot
CREATE TABLE IF NOT EXISTS wha_bot_sesion (
  ide_whbse       BIGSERIAL   PRIMARY KEY,
  ide_whcha       INT8        NOT NULL REFERENCES wha_chat(ide_whcha) ON DELETE CASCADE,
  ide_whcue       INT4        NOT NULL,
  estado          VARCHAR(40) NOT NULL DEFAULT 'INICIO',
  -- INICIO | ESPERANDO_CONFIRMACION | IDENTIFICACION | DATOS_NUEVO_CLIENTE
  -- | SELECCION_PRODUCTOS | CONFIRMACION_PRODUCTOS | DATOS_ENVIO | FINALIZADO | CANCELADO
  datos_sesion    JSONB       NOT NULL DEFAULT '{}',
  activa          BOOL        NOT NULL DEFAULT TRUE,
  intentos_fallo  INT2        NOT NULL DEFAULT 0,
  hora_ingre      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hora_actua      TIMESTAMPTZ
);
COMMENT ON TABLE  wha_bot_sesion IS 'Estado de la máquina de estados del bot por conversación';
COMMENT ON COLUMN wha_bot_sesion.datos_sesion IS '{ "cliente": {...}, "productos": [...], "envio": {...} }';
CREATE INDEX IF NOT EXISTS idx_wha_bot_sesion_chat   ON wha_bot_sesion(ide_whcha) WHERE activa = TRUE;
CREATE INDEX IF NOT EXISTS idx_wha_bot_sesion_estado ON wha_bot_sesion(estado)    WHERE activa = TRUE;



----desactivar bot 
 UPDATE wha_bot_config
  SET activo_manual = FALSE,
      usa_horario   = FALSE;



---campos conn error desa tamaño
ALTER TABLE "public"."wha_chat" ALTER COLUMN "phone_number_whcha" SET DATA TYPE varchar(50);
UPDATE "public"."wha_bot_config" SET "usa_horario" = 'F' WHERE "ide_whbco" = 1;

ALTER TABLE "public"."wha_chat" ALTER COLUMN "phone_number_id_whcha" SET DATA TYPE varchar(50);

ALTER TABLE "public"."wha_mensaje" ALTER COLUMN "tipo_whmem" SET DATA TYPE varchar(50);

ALTER TABLE "public"."wha_mensaje" ALTER COLUMN "wa_id_whmem" SET DATA TYPE varchar(80);

ALTER TABLE "public"."wha_mensaje" ALTER COLUMN "phone_number_whmem" SET DATA TYPE varchar(50);

ALTER TABLE "public"."wha_cuenta" ALTER COLUMN "id_telefono_whcue" SET DATA TYPE varchar(50);

ALTER TABLE "public"."wha_chat" ALTER COLUMN "bot_modo_whcha" SET DATA TYPE varchar(50);

ALTER TABLE "public"."wha_bot_activacion_log" ALTER COLUMN "origen" SET DATA TYPE varchar(50);

ALTER TABLE "public"."wha_det_camp_envio" ALTER COLUMN "telefono_whden" SET DATA TYPE varchar(50);

ALTER TABLE "public"."wha_ycloud_sync" ALTER COLUMN "estado_sync" SET DATA TYPE varchar(50);

ALTER TABLE "public"."wha_mensaje" ALTER COLUMN "timestamp_whmem" SET DATA TYPE varchar(50);

ALTER TABLE "public"."wha_mensaje" ALTER COLUMN "phone_number_id_whmem" SET DATA TYPE varchar(50);

ALTER TABLE "public"."wha_mensaje" ALTER COLUMN "attachment_url_whmem" SET DATA TYPE varchar(500);


CREATE INDEX IF NOT EXISTS idx_wha_mensaje_ide_whcha
    ON wha_mensaje (ide_whcha)
    WHERE ide_whcha IS NOT NULL;

-- Expandir columnas de error para evitar truncado de mensajes de error de YCloud
ALTER TABLE wha_mensaje
    ALTER COLUMN error_whmem      TYPE VARCHAR(500),
    ALTER COLUMN code_error_whmem TYPE VARCHAR(100);