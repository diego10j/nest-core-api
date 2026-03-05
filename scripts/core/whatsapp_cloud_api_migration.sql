-- =============================================================================
-- MIGRACIÓN: WhatsApp Cloud API v20+ (elimina integración whatsapp-web.js)
-- Fecha: 2026-02-28
-- =============================================================================

-- 1. Actualizar wha_cuenta: el campo tipo_whcue solo acepta 'API'
-- -----------------------------------------------------------------------------
-- Convierte cualquier cuenta tipo 'WEB' a tipo 'API' (requiere configurar 
-- el phone_number_id y token de Meta manualmente)
UPDATE wha_cuenta
SET tipo_whcue = 'API'
WHERE tipo_whcue = 'WEB';

-- Agregar constraint para asegurar solo tipo 'API' en adelante
ALTER TABLE wha_cuenta
    DROP CONSTRAINT IF EXISTS chk_tipo_whcue;

ALTER TABLE wha_cuenta
    ADD CONSTRAINT chk_tipo_whcue
    CHECK (tipo_whcue = 'API');

-- Agregar columna de versión de API para futuras migraciones
ALTER TABLE wha_cuenta
    ADD COLUMN IF NOT EXISTS api_version_whcue VARCHAR(10) NOT NULL DEFAULT 'v20.0',
    ADD COLUMN IF NOT EXISTS webhook_url_whcue TEXT,
    ADD COLUMN IF NOT EXISTS business_id_whcue VARCHAR(50);

COMMENT ON COLUMN wha_cuenta.api_version_whcue IS 'Versión de Graph API de Meta (ej: v20.0)';
COMMENT ON COLUMN wha_cuenta.webhook_url_whcue IS 'URL del webhook configurado en Meta';
COMMENT ON COLUMN wha_cuenta.business_id_whcue IS 'WABA Business Account ID de Meta';


-- 2. Tabla wha_mensaje: agregar columnas de metadatos Cloud API
-- -----------------------------------------------------------------------------
-- Campos de estado entregado/leído (Cloud API status webhooks)
ALTER TABLE wha_mensaje
    ADD COLUMN IF NOT EXISTS timestamp_sent_whmem TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS timestamp_read_whmem TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS error_whmem TEXT,
    ADD COLUMN IF NOT EXISTS code_error_whmem VARCHAR(100);

COMMENT ON COLUMN wha_mensaje.timestamp_sent_whmem IS 'Timestamp cuando Meta confirma entrega';
COMMENT ON COLUMN wha_mensaje.timestamp_read_whmem IS 'Timestamp cuando el destinatario lee el mensaje';
COMMENT ON COLUMN wha_mensaje.error_whmem IS 'Detalle del error si el envío falló';
COMMENT ON COLUMN wha_mensaje.code_error_whmem IS 'Código y título del error de Meta';

-- Campo de pricing / conversación (Cloud API)
ALTER TABLE wha_mensaje
    ADD COLUMN IF NOT EXISTS conversation_id_whmem VARCHAR(100),
    ADD COLUMN IF NOT EXISTS pricing_category_whmem VARCHAR(30),
    ADD COLUMN IF NOT EXISTS attachment_size_whmem BIGINT,
    ADD COLUMN IF NOT EXISTS attachment_url_whmem TEXT;

COMMENT ON COLUMN wha_mensaje.conversation_id_whmem IS 'ID de conversación para facturación Meta';
COMMENT ON COLUMN wha_mensaje.pricing_category_whmem IS 'Categoría de precio: business_initiated, utility, authentication, marketing';
COMMENT ON COLUMN wha_mensaje.attachment_size_whmem IS 'Tamaño del adjunto en bytes';
COMMENT ON COLUMN wha_mensaje.attachment_url_whmem IS 'URL temporal del archivo descargado en el servidor';

-- Campo tipo_whmem: solo 'API' (ya no existe 'WEB')
UPDATE wha_mensaje SET tipo_whmem = 'API' WHERE tipo_whmem = 'WEB';


-- 3. Tabla wha_mensaje: índices de rendimiento
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_wha_mensaje_status
    ON wha_mensaje (status_whmem)
    WHERE status_whmem IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wha_mensaje_conversation
    ON wha_mensaje (conversation_id_whmem)
    WHERE conversation_id_whmem IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wha_mensaje_fecha
    ON wha_mensaje (fecha_whmem DESC);

CREATE INDEX IF NOT EXISTS idx_wha_mensaje_id_whmem
    ON wha_mensaje (id_whmem);

CREATE INDEX IF NOT EXISTS idx_wha_mensaje_phone_dir
    ON wha_mensaje (phone_number_id_whmem, direction_whmem);


-- 4. Tabla wha_det_camp_envio: columna de error
-- -----------------------------------------------------------------------------
ALTER TABLE wha_det_camp_envio
    ADD COLUMN IF NOT EXISTS error_whden TEXT,
    ADD COLUMN IF NOT EXISTS tiene_whats_whden BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN wha_det_camp_envio.error_whden IS 'Detalle del error al enviar mensaje de campaña';
COMMENT ON COLUMN wha_det_camp_envio.tiene_whats_whden IS 'Indica si el número tiene WhatsApp validado';


-- 5. Actualizar función mensaje_whatsapp para incluir conversation_id y pricing
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mensaje_whatsapp(json_data JSONB)
RETURNS VARCHAR(30) AS $$
DECLARE
    v_wa_id_whcha VARCHAR(30);
    v_name_whcha VARCHAR(80);
    v_phone_number_id VARCHAR(20);
    v_phone_number VARCHAR(20);
    v_ide_whcha INT8;
    v_id_whcha VARCHAR(80);

    v_id_whmem VARCHAR(80);
    v_wa_id_whmem VARCHAR(80);
    v_wa_id_context_whmem VARCHAR(80);
    v_body_whmem TEXT;
    v_fecha_whmem TIMESTAMP;
    v_content_type_whmem VARCHAR(80);
    v_direction_whmem CHAR(1);
    v_attachment_id_whmem VARCHAR(100);
    v_attachment_type_whmem VARCHAR(150);
    v_attachment_name_whmem VARCHAR(200);
    v_caption_whmem TEXT;
    v_timestamp_whmem VARCHAR(20);
    v_conversation_id VARCHAR(100);
BEGIN
    -- Extraer datos del contacto
    SELECT
        trim(both '"' from jsonb_path_query_first(json_data, '$.entry[0].changes[0].value.contacts[0].wa_id')::TEXT),
        trim(both '"' from jsonb_path_query_first(json_data, '$.entry[0].changes[0].value.contacts[0].profile.name')::TEXT),
        trim(both '"' from jsonb_path_query_first(json_data, '$.entry[0].changes[0].value.metadata.phone_number_id')::TEXT),
        trim(both '"' from jsonb_path_query_first(json_data, '$.entry[0].changes[0].value.metadata.display_phone_number')::TEXT),
        trim(both '"' from jsonb_path_query_first(json_data, '$.entry[0].changes[0].value.messages[0].id')::TEXT)
    INTO v_wa_id_whcha, v_name_whcha, v_phone_number_id, v_phone_number, v_id_whcha;

    -- Insertar o actualizar el contacto en wha_chat
    INSERT INTO wha_chat (
        wa_id_whcha, nombre_whcha, name_whcha, phone_number_id_whcha,
        phone_number_whcha, fecha_msg_whcha, id_whcha, leido_whcha
    ) VALUES (
        v_wa_id_whcha, v_phone_number_id, v_name_whcha, v_phone_number_id,
        v_phone_number, NOW(), v_id_whcha, false
    )
    ON CONFLICT (wa_id_whcha) DO UPDATE
    SET fecha_msg_whcha = EXCLUDED.fecha_msg_whcha,
        id_whcha = EXCLUDED.id_whcha,
        leido_whcha = false,
        no_leidos_whcha = COALESCE(wha_chat.no_leidos_whcha, 0) + 1
    RETURNING ide_whcha INTO v_ide_whcha;

    -- Procesar todos los mensajes del payload
    FOR v_id_whmem, v_wa_id_whmem, v_wa_id_context_whmem, v_body_whmem,
        v_fecha_whmem, v_timestamp_whmem, v_content_type_whmem, v_direction_whmem,
        v_attachment_id_whmem, v_attachment_type_whmem, v_caption_whmem, v_attachment_name_whmem
    IN
        SELECT
            trim(both '"' from msg ->> 'id'),
            trim(both '"' from msg ->> 'from'),
            trim(both '"' from msg #>> '{context,id}'),
            trim(both '"' from msg #>> '{text,body}'),
            to_timestamp((trim(both '"' from msg ->> 'timestamp'))::BIGINT) AT TIME ZONE 'America/Guayaquil',
            trim(both '"' from msg ->> 'timestamp'),
            trim(both '"' from msg ->> 'type'),
            CASE WHEN trim(both '"' from msg ->> 'from') = v_wa_id_whcha THEN '0' ELSE '1' END,
            CASE
                WHEN msg ->> 'type' = 'image'    THEN trim(both '"' from msg #>> '{image,id}')
                WHEN msg ->> 'type' = 'sticker'  THEN trim(both '"' from msg #>> '{sticker,id}')
                WHEN msg ->> 'type' = 'audio'    THEN trim(both '"' from msg #>> '{audio,id}')
                WHEN msg ->> 'type' = 'video'    THEN trim(both '"' from msg #>> '{video,id}')
                WHEN msg ->> 'type' = 'document' THEN trim(both '"' from msg #>> '{document,id}')
                ELSE NULL
            END,
            CASE
                WHEN msg ->> 'type' = 'image'    THEN trim(both '"' from msg #>> '{image,mime_type}')
                WHEN msg ->> 'type' = 'sticker'  THEN trim(both '"' from msg #>> '{sticker,mime_type}')
                WHEN msg ->> 'type' = 'audio'    THEN trim(both '"' from msg #>> '{audio,mime_type}')
                WHEN msg ->> 'type' = 'video'    THEN trim(both '"' from msg #>> '{video,mime_type}')
                WHEN msg ->> 'type' = 'document' THEN trim(both '"' from msg #>> '{document,mime_type}')
                ELSE NULL
            END,
            CASE
                WHEN msg ->> 'type' = 'image'    THEN trim(both '"' from msg #>> '{image,caption}')
                WHEN msg ->> 'type' = 'video'    THEN trim(both '"' from msg #>> '{video,caption}')
                WHEN msg ->> 'type' = 'document' THEN trim(both '"' from msg #>> '{document,caption}')
                ELSE NULL
            END,
            CASE
                WHEN msg ->> 'type' = 'document' THEN trim(both '"' from msg #>> '{document,filename}')
                ELSE NULL
            END
        FROM jsonb_array_elements(json_data #> '{entry,0,changes,0,value,messages}') AS msg
    LOOP
        INSERT INTO wha_mensaje (
            ide_whcha, phone_number_id_whmem, phone_number_whmem,
            id_whmem, wa_id_whmem, wa_id_context_whmem, body_whmem,
            fecha_whmem, timestamp_whmem, content_type_whmem, direction_whmem,
            attachment_id_whmem, attachment_type_whmem, caption_whmem,
            leido_whmem, attachment_name_whmem, tipo_whmem
        ) VALUES (
            v_ide_whcha, v_phone_number_id, v_phone_number,
            v_id_whmem, v_wa_id_whmem, v_wa_id_context_whmem, v_body_whmem,
            v_fecha_whmem, v_timestamp_whmem, v_content_type_whmem, v_direction_whmem,
            v_attachment_id_whmem, v_attachment_type_whmem, v_caption_whmem,
            false, v_attachment_name_whmem, 'API'
        );
    END LOOP;

    RETURN v_wa_id_whcha;
END;
$$ LANGUAGE plpgsql;


-- 6. Registrar historial de versiones de webhook (opcional, recomendado)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wha_webhook_log (
    ide_whlog       BIGSERIAL PRIMARY KEY,
    ide_empr        INT4        NOT NULL,
    payload_whlog   JSONB       NOT NULL,
    procesado_whlog BOOLEAN     NOT NULL DEFAULT FALSE,
    error_whlog     TEXT,
    hora_ingre      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wha_webhook_log_empr
    ON wha_webhook_log (ide_empr, hora_ingre DESC);

CREATE INDEX IF NOT EXISTS idx_wha_webhook_log_procesado
    ON wha_webhook_log (procesado_whlog)
    WHERE procesado_whlog = FALSE;

COMMENT ON TABLE wha_webhook_log IS 'Log de payloads recibidos del webhook de WhatsApp Cloud API';
