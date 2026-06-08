-- =============================================================================
-- MIGRACIÓN: YCloud WhatsApp API Integration
-- Fecha: 2026-06-07
-- Descripción:
--   - Relaja constraints para aceptar tipo 'YCLOUD' en wha_cuenta y wha_mensaje
--   - Agrega columnas de ventana 24h y asignación de agente en wha_chat
--   - Agrega columnas de agente y tiempo de respuesta en wha_mensaje
--   - Crea tabla de métricas diarias agregadas
--   - Crea tabla de sincronización bidireccional con YCloud
--   - Crea función mensaje_ycloud() para procesar webhooks entrantes
-- =============================================================================

-- ============================================================
-- 1. Relajar constraint tipo_whcue (wha_cuenta)
-- ============================================================
ALTER TABLE wha_cuenta
    DROP CONSTRAINT IF EXISTS chk_tipo_whcue;

ALTER TABLE wha_cuenta
    ALTER COLUMN tipo_whcue TYPE VARCHAR(10);

ALTER TABLE wha_cuenta
    ADD CONSTRAINT chk_tipo_whcue
    CHECK (tipo_whcue IN ('API', 'YCLOUD'));

COMMENT ON COLUMN wha_cuenta.tipo_whcue IS 'Tipo de proveedor: API (Meta Cloud API directo), YCLOUD (YCloud BSP)';

-- ============================================================
-- 2. Relajar constraint tipo_whmem (wha_mensaje)
-- ============================================================
ALTER TABLE wha_mensaje
    DROP CONSTRAINT IF EXISTS chk_tipo_whmem;

ALTER TABLE wha_mensaje
    ALTER COLUMN tipo_whmem TYPE VARCHAR(10);

ALTER TABLE wha_mensaje
    ADD CONSTRAINT chk_tipo_whmem
    CHECK (tipo_whmem IN ('API', 'YCLOUD'));

COMMENT ON COLUMN wha_mensaje.tipo_whmem IS 'Origen del mensaje: API (Meta directo), YCLOUD (YCloud BSP)';

-- ============================================================
-- 3. wha_chat: ventana 24h + asignación de agente
-- ============================================================
ALTER TABLE wha_chat
    ADD COLUMN IF NOT EXISTS ultimo_ingreso_cliente_whcha TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ide_usua_asignado_whcha INT8,
    ADD COLUMN IF NOT EXISTS hora_asignacion_whcha TIMESTAMPTZ;

COMMENT ON COLUMN wha_chat.ultimo_ingreso_cliente_whcha IS 'Timestamp del último mensaje entrante del cliente. Controla la ventana de 24h para respuestas gratuitas.';
COMMENT ON COLUMN wha_chat.ide_usua_asignado_whcha IS 'FK a sis_usuario. Agente asignado a la conversación.';
COMMENT ON COLUMN wha_chat.hora_asignacion_whcha IS 'Momento en que se asignó el agente a la conversación.';

CREATE INDEX IF NOT EXISTS idx_wha_chat_ultimo_ingreso
    ON wha_chat (ultimo_ingreso_cliente_whcha)
    WHERE ultimo_ingreso_cliente_whcha IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wha_chat_asignado
    ON wha_chat (ide_usua_asignado_whcha)
    WHERE ide_usua_asignado_whcha IS NOT NULL;

-- ============================================================
-- 4. wha_mensaje: agente que envió + tiempo de respuesta
-- ============================================================
ALTER TABLE wha_mensaje
    ADD COLUMN IF NOT EXISTS ide_usua_whmem INT8,
    ADD COLUMN IF NOT EXISTS tiempo_respuesta_seg_whmem INT4;

COMMENT ON COLUMN wha_mensaje.ide_usua_whmem IS 'FK a sis_usuario. Agente que envió el mensaje (solo outbound).';
COMMENT ON COLUMN wha_mensaje.tiempo_respuesta_seg_whmem IS 'Tiempo en segundos desde el último mensaje entrante del cliente hasta esta respuesta.';

CREATE INDEX IF NOT EXISTS idx_wha_mensaje_ide_usua
    ON wha_mensaje (ide_usua_whmem)
    WHERE ide_usua_whmem IS NOT NULL;

-- ============================================================
-- 5. wha_metrics_diaria: métricas agregadas por día/empresa
-- ============================================================
CREATE TABLE IF NOT EXISTS wha_metrics_diaria (
    ide_whmed                 BIGSERIAL PRIMARY KEY,
    ide_empr                  INT4        NOT NULL,
    fecha_whmed               DATE        NOT NULL,
    mensajes_enviados         INT4        NOT NULL DEFAULT 0,
    mensajes_recibidos        INT4        NOT NULL DEFAULT 0,
    respuestas_dentro_24h     INT4        NOT NULL DEFAULT 0,
    respuestas_fuera_24h     INT4        NOT NULL DEFAULT 0,
    tiempo_respuesta_promedio_seg INT4,
    chats_nuevos              INT4        NOT NULL DEFAULT 0,
    chats_atendidos           INT4        NOT NULL DEFAULT 0,
    templates_enviados        INT4        NOT NULL DEFAULT 0,
    mensajes_fallidos         INT4        NOT NULL DEFAULT 0,
    hora_actualizacion        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (ide_empr, fecha_whmed)
);

COMMENT ON TABLE wha_metrics_diaria IS 'Métricas diarias agregadas de mensajería WhatsApp por empresa.';
COMMENT ON COLUMN wha_metrics_diaria.respuestas_dentro_24h IS 'Cantidad de respuestas enviadas dentro de la ventana de 24h (sin template).';
COMMENT ON COLUMN wha_metrics_diaria.respuestas_fuera_24h IS 'Cantidad de respuestas que requirieron template por ventana expirada.';

CREATE INDEX IF NOT EXISTS idx_wha_metrics_diaria_empr
    ON wha_metrics_diaria (ide_empr, fecha_whmed DESC);

-- ============================================================
-- 6. wha_ycloud_sync: log de sincronización bidireccional
-- ============================================================
CREATE TABLE IF NOT EXISTS wha_ycloud_sync (
    ide_whysn           BIGSERIAL PRIMARY KEY,
    ide_empr            INT4        NOT NULL,
    id_mensaje_whysn    VARCHAR(80) NOT NULL,
    tipo_operacion      CHAR(1)     NOT NULL,
    payload_local       JSONB,
    payload_ycloud      JSONB,
    estado_sync         VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    error_sync          TEXT,
    hora_ingre          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hora_sync           TIMESTAMPTZ
);

COMMENT ON TABLE wha_ycloud_sync IS 'Log de sincronización bidireccional con YCloud. Backup local y reconciliación.';
COMMENT ON COLUMN wha_ycloud_sync.tipo_operacion IS 'S = send (envío), R = receive (recibido), U = status_update';
COMMENT ON COLUMN wha_ycloud_sync.estado_sync IS 'PENDING: esperando confirmación; SYNCED: reconciliado; CONFLICT: discrepancia; ORPHAN: sin respuesta de YCloud';

CREATE INDEX IF NOT EXISTS idx_wha_ycloud_sync_estado
    ON wha_ycloud_sync (estado_sync)
    WHERE estado_sync != 'SYNCED';

CREATE INDEX IF NOT EXISTS idx_wha_ycloud_sync_msg
    ON wha_ycloud_sync (id_mensaje_whysn);

CREATE INDEX IF NOT EXISTS idx_wha_ycloud_sync_empr
    ON wha_ycloud_sync (ide_empr, hora_ingre DESC);

-- ============================================================
-- 7. Función mensaje_ycloud() para procesar webhooks entrantes
--    Payload YCloud real:
--    { type, whatsappInboundMessage: { from, to, wamid, type,
--      customerProfile: { name }, text: { body }, sendTime, ... } }
-- ============================================================
CREATE OR REPLACE FUNCTION mensaje_ycloud(json_data JSONB, p_phone_number_id VARCHAR DEFAULT NULL)
RETURNS VARCHAR(30) AS $$
DECLARE
    v_media_data               JSONB;
    v_wa_id_whcha              VARCHAR(30);
    v_name_whcha               VARCHAR(80);
    v_phone_number_id          VARCHAR(20);
    v_phone_number             VARCHAR(20);
    v_ide_whcha                INT8;
    v_id_whcha                 VARCHAR(80);

    v_id_whmem                 VARCHAR(80);
    v_wa_id_whmem              VARCHAR(80);
    v_wa_id_context_whmem      VARCHAR(80);
    v_body_whmem               TEXT;
    v_fecha_whmem              TIMESTAMP;
    v_timestamp_whmem          VARCHAR(20);
    v_content_type_whmem       VARCHAR(80);
    v_attachment_id_whmem      VARCHAR(100);
    v_attachment_type_whmem    VARCHAR(150);
    v_attachment_name_whmem    VARCHAR(200);
    v_caption_whmem            TEXT;
BEGIN
    v_media_data := json_data -> 'whatsappInboundMessage';

    v_wa_id_whcha  := replace(trim(both '"' from v_media_data ->> 'from'), '+', '');
    v_name_whcha   := COALESCE(
        NULLIF(trim(both '"' from v_media_data #>> '{customerProfile,name}'), ''),
        v_wa_id_whcha
    );
    v_phone_number := replace(trim(both '"' from v_media_data ->> 'to'), '+', '');
    v_id_whcha     := trim(both '"' from v_media_data ->> 'wamid');

    IF v_id_whcha IS NULL OR v_id_whcha = '' THEN
        v_id_whcha := trim(both '"' from v_media_data ->> 'id');
    END IF;

    v_phone_number_id := COALESCE(p_phone_number_id, v_phone_number);

    INSERT INTO wha_chat (
        wa_id_whcha, nombre_whcha, name_whcha, phone_number_id_whcha,
        phone_number_whcha, fecha_msg_whcha, id_whcha, leido_whcha,
        ultimo_ingreso_cliente_whcha
    ) VALUES (
        v_wa_id_whcha, v_phone_number, v_name_whcha, v_phone_number_id,
        v_phone_number, NOW(), v_id_whcha, false, NOW()
    )
    ON CONFLICT (wa_id_whcha) DO UPDATE
    SET fecha_msg_whcha = EXCLUDED.fecha_msg_whcha,
        id_whcha = EXCLUDED.id_whcha,
        leido_whcha = false,
        name_whcha = CASE
            WHEN wha_chat.name_whcha ~ '^\+\d+$' AND EXCLUDED.name_whcha !~ '^\+\d+$'
            THEN EXCLUDED.name_whcha
            ELSE wha_chat.name_whcha
        END,
        no_leidos_whcha = COALESCE(wha_chat.no_leidos_whcha, 0) + 1,
        ultimo_ingreso_cliente_whcha = NOW()
    RETURNING ide_whcha INTO v_ide_whcha;

    v_id_whmem             := v_id_whcha;
    v_wa_id_whmem          := v_wa_id_whcha;
    v_wa_id_context_whmem  := trim(both '"' from v_media_data #>> '{context,id}');
    v_body_whmem           := trim(both '"' from v_media_data #>> '{text,body}');
v_fecha_whmem          := COALESCE(
    (v_media_data ->> 'sendTime')::TIMESTAMPTZ,
    NOW()
) AT TIME ZONE 'America/Guayaquil';
v_timestamp_whmem      := COALESCE(
    EXTRACT(EPOCH FROM (v_media_data ->> 'sendTime')::TIMESTAMPTZ)::BIGINT::VARCHAR,
    EXTRACT(EPOCH FROM NOW())::BIGINT::VARCHAR
);

    v_content_type_whmem   := trim(both '"' from v_media_data ->> 'type');

    v_attachment_id_whmem := CASE
        WHEN v_content_type_whmem = 'image'    THEN trim(both '"' from v_media_data #>> '{image,id}')
        WHEN v_content_type_whmem = 'sticker'  THEN trim(both '"' from v_media_data #>> '{sticker,id}')
        WHEN v_content_type_whmem = 'audio'    THEN trim(both '"' from v_media_data #>> '{audio,id}')
        WHEN v_content_type_whmem = 'video'    THEN trim(both '"' from v_media_data #>> '{video,id}')
        WHEN v_content_type_whmem = 'document' THEN trim(both '"' from v_media_data #>> '{document,id}')
        ELSE NULL
    END;

    v_attachment_type_whmem := CASE
        WHEN v_content_type_whmem = 'image'    THEN trim(both '"' from v_media_data #>> '{image,mime_type}')
        WHEN v_content_type_whmem = 'sticker'  THEN trim(both '"' from v_media_data #>> '{sticker,mime_type}')
        WHEN v_content_type_whmem = 'audio'    THEN trim(both '"' from v_media_data #>> '{audio,mime_type}')
        WHEN v_content_type_whmem = 'video'    THEN trim(both '"' from v_media_data #>> '{video,mime_type}')
        WHEN v_content_type_whmem = 'document' THEN trim(both '"' from v_media_data #>> '{document,mime_type}')
        ELSE NULL
    END;

    v_caption_whmem := CASE
        WHEN v_content_type_whmem = 'image'    THEN trim(both '"' from v_media_data #>> '{image,caption}')
        WHEN v_content_type_whmem = 'video'    THEN trim(both '"' from v_media_data #>> '{video,caption}')
        WHEN v_content_type_whmem = 'document' THEN trim(both '"' from v_media_data #>> '{document,caption}')
        ELSE NULL
    END;

    v_attachment_name_whmem := CASE
        WHEN v_content_type_whmem = 'document' THEN trim(both '"' from v_media_data #>> '{document,filename}')
        ELSE NULL
    END;

    INSERT INTO wha_mensaje (
        ide_whcha, phone_number_id_whmem, phone_number_whmem,
        id_whmem, wa_id_whmem, wa_id_context_whmem, body_whmem,
        fecha_whmem, timestamp_whmem, content_type_whmem, direction_whmem,
        attachment_id_whmem, attachment_type_whmem, caption_whmem,
        leido_whmem, attachment_name_whmem, tipo_whmem
    ) VALUES (
        v_ide_whcha, v_phone_number_id, v_phone_number,
        v_id_whmem, v_wa_id_whmem, v_wa_id_context_whmem, v_body_whmem,
        v_fecha_whmem, v_timestamp_whmem, v_content_type_whmem, '0',
        v_attachment_id_whmem, v_attachment_type_whmem, v_caption_whmem,
        false, v_attachment_name_whmem, 'YCLOUD'
    );

    RETURN v_wa_id_whcha;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mensaje_ycloud(JSONB, VARCHAR) IS 'Procesa payload de webhook YCloud (whatsapp.inbound_message.received) e inserta en wha_chat y wha_mensaje con tipo_whmem=YCLOUD. p_phone_number_id: ID telefonico de la cuenta de negocio.';

ALTER TABLE "public"."wha_cuenta" ALTER COLUMN "tipo_whcue" SET DATA TYPE varchar(15);

INSERT INTO wha_cuenta (
ide_whcue,
    nombre_whcue,
    id_telefono_whcue,
    id_aplicacion_whcue,
    id_cuenta_whcue,
    id_token_whcue,
    tipo_whcue,
    ide_empr,
    activo_whcue
) VALUES (
1,
    'YCloud WhatsApp',          -- nombre descriptivo
    '+593998931505',            -- numero del negocio (el "to" del webhook que mostraste)
    'YCLOUD',                   -- id_aplicacion (referencia)
    '+593998931505',            -- id_cuenta (usado como phoneNumberId para filtrar chats)
    '',                         -- token vacio (la API key es global via YCLOUD_API_KEY en .env)
    'YCLOUD',                   -- tipo_whcue
    0,                          -- ide_empr (ID de tu empresa)
    TRUE
);


ALTER TABLE wha_mensaje ALTER COLUMN tipo_whmem TYPE VARCHAR(15);
