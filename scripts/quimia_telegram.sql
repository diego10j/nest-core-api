-- ============================================================
-- Módulo: QuimIA por Telegram
-- Tablas: tlg_cuenta, tlg_usuario, tlg_conversacion, qmi_transcripcion  (+ columnas en bdt_consulta)
--
-- Requiere scripts/base_tecnica.sql (bdt_consulta). Seguro de re-correr (IF NOT EXISTS).
-- ============================================================

-- 1. Cuenta del bot de Telegram (normalmente una por empresa).
--    token_tlcue se guarda CIFRADO (mismo util AES del SRI) y nunca se devuelve completo al front.
CREATE TABLE IF NOT EXISTS tlg_cuenta (
    ide_tlcue               SERIAL PRIMARY KEY,
    nombre_tlcue            VARCHAR(100) NOT NULL,          -- nombre interno: "QuimIA DIQUIMEC"
    token_tlcue             TEXT NOT NULL,                  -- token de @BotFather (cifrado)
    bot_id_tlcue            BIGINT,                         -- datos que devuelve Telegram (getMe)
    bot_username_tlcue      VARCHAR(100),                   -- @QuimiaDiquimecBot
    bot_nombre_tlcue        VARCHAR(150),
    modo_tlcue              VARCHAR(10) NOT NULL DEFAULT 'POLLING',
                            -- POLLING: el backend consulta a Telegram (no necesita URL pública)
                            -- WEBHOOK: Telegram llama al backend (requiere HTTPS público en HOST_API)
    url_publica_tlcue       VARCHAR(300),                   -- base https pública del backend (la misma del webhook
                                                            -- de YCloud, ej. https://api.midominio.com). Si es NULL
                                                            -- se usa HOST_API. Arma el webhook y los links a PDFs.
    webhook_secret_tlcue    VARCHAR(64),                    -- secreto que Telegram envía en cada webhook
    webhook_url_tlcue       VARCHAR(300),
    ultimo_update_tlcue     BIGINT DEFAULT 0,               -- offset de getUpdates (modo POLLING)
    ide_sucu                INTEGER,                        -- sucursal usada para consultas (stock, saldos…)
    usuario_erp_tlcue       VARCHAR(50) DEFAULT 'TELEGRAM', -- login con el que se auditan las consultas
    mensaje_bienvenida_tlcue TEXT,
    activo_tlcue            BOOLEAN NOT NULL DEFAULT FALSE,
    estado_conexion_tlcue   VARCHAR(20) DEFAULT 'SIN_PROBAR', -- SIN_PROBAR | CONECTADO | ERROR
    ultima_conexion_tlcue   TIMESTAMP,
    error_tlcue             TEXT,
    -- Auditoría
    ide_empr                INTEGER NOT NULL,
    usuario_ingre           VARCHAR(50),
    fecha_ingre             TIMESTAMP DEFAULT NOW(),
    usuario_actua           VARCHAR(50),
    fecha_actua             TIMESTAMP
);


-- 1b. Migración: si tlg_cuenta ya existía de una corrida anterior del script.
ALTER TABLE tlg_cuenta ADD COLUMN IF NOT EXISTS url_publica_tlcue VARCHAR(300);

-- 1c. Notas de voz: transcripción con Groq (whisper-large-v3-turbo) y respaldo en OpenAI
--     (gpt-4o-mini-transcribe) cuando Groq falla o no entiende el audio.
ALTER TABLE tlg_cuenta ADD COLUMN IF NOT EXISTS audio_activo_tlcue BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tlg_cuenta ADD COLUMN IF NOT EXISTS groq_api_key_tlcue TEXT;                      -- cifrada (mismo util que el token)
ALTER TABLE tlg_cuenta ADD COLUMN IF NOT EXISTS audio_max_seg_tlcue INTEGER NOT NULL DEFAULT 180; -- duración máxima aceptada
ALTER TABLE tlg_cuenta ADD COLUMN IF NOT EXISTS audio_respaldo_openai_tlcue BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tlg_cuenta ADD COLUMN IF NOT EXISTS audio_mostrar_texto_tlcue BOOLEAN NOT NULL DEFAULT TRUE;  -- "🎙️ Entendí: «…»"
ALTER TABLE tlg_cuenta ADD COLUMN IF NOT EXISTS audio_vocabulario_tlcue TEXT;                 -- términos propios (productos, marcas)


-- 2. Números autorizados a usar el bot. Telegram NO entrega el teléfono del usuario por sí solo:
--    al escribir /start el bot pide "Compartir mi número" y, si coincide con un número activo de
--    esta tabla, vincula su chat (chat_id / user_id). Desactivar el número bloquea el acceso.
CREATE TABLE IF NOT EXISTS tlg_usuario (
    ide_tlusu               SERIAL PRIMARY KEY,
    ide_tlcue               INTEGER NOT NULL REFERENCES tlg_cuenta(ide_tlcue) ON DELETE CASCADE,
    telefono_tlusu          VARCHAR(20) NOT NULL,           -- solo dígitos con código de país: 593991234567
    alias_tlusu             VARCHAR(100) NOT NULL,          -- nombre o alias: "Diego - Ventas"
    activo_tlusu            BOOLEAN NOT NULL DEFAULT TRUE,
    chat_id_tlusu           BIGINT,                         -- se llena al vincularse
    telegram_user_id_tlusu  BIGINT,
    telegram_username_tlusu VARCHAR(100),
    fecha_vinculacion_tlusu TIMESTAMP,
    ultimo_acceso_tlusu     TIMESTAMP,
    total_consultas_tlusu   INTEGER NOT NULL DEFAULT 0,
    observacion_tlusu       VARCHAR(300),
    -- Auditoría
    ide_empr                INTEGER NOT NULL,
    usuario_ingre           VARCHAR(50),
    fecha_ingre             TIMESTAMP DEFAULT NOW(),        -- fecha de creación
    usuario_actua           VARCHAR(50),
    fecha_actua             TIMESTAMP,
    UNIQUE (ide_tlcue, telefono_tlusu)
);
CREATE INDEX IF NOT EXISTS idx_tlg_usu_chat ON tlg_usuario (ide_tlcue, telegram_user_id_tlusu);


-- 3. Estado de la conversación por chat: producto activo, historial corto y lo que quedó pendiente
--    (opciones de producto, sugerencia de cambio o "responder con IA") para los botones del chat.
CREATE TABLE IF NOT EXISTS tlg_conversacion (
    ide_tlcon               SERIAL PRIMARY KEY,
    ide_tlcue               INTEGER NOT NULL REFERENCES tlg_cuenta(ide_tlcue) ON DELETE CASCADE,
    chat_id_tlcon           BIGINT NOT NULL,
    ide_tlusu               INTEGER REFERENCES tlg_usuario(ide_tlusu) ON DELETE SET NULL,
    sesion_tlcon            UUID NOT NULL,
    ide_inarti              INTEGER,                        -- producto activo (sin FK: estado efímero)
    nombre_producto_tlcon   VARCHAR(250),
    historial_tlcon         JSONB NOT NULL DEFAULT '[]',    -- últimos mensajes [{role, contenido}]
    pendiente_tlcon         JSONB,                          -- {pregunta, opciones, sugerido, sinRespuesta}
    fecha_actua             TIMESTAMP DEFAULT NOW(),
    UNIQUE (ide_tlcue, chat_id_tlcon)
);


-- 4. Quién preguntó: teléfono y número autorizado (consultas desde Telegram).
ALTER TABLE bdt_consulta ADD COLUMN IF NOT EXISTS telefono_bdcon VARCHAR(20);
ALTER TABLE bdt_consulta ADD COLUMN IF NOT EXISTS ide_tlusu INTEGER;
CREATE INDEX IF NOT EXISTS idx_bdt_con_telefono ON bdt_consulta (telefono_bdcon) WHERE telefono_bdcon IS NOT NULL;


-- 5. Transcripciones de audio (caché + costos + auditoría). La huella (sha256) evita pagar dos veces
--    el mismo audio (reenvíos). Reutilizable por otros canales en el futuro (origen).
CREATE TABLE IF NOT EXISTS qmi_transcripcion (
    ide_qmtra               SERIAL PRIMARY KEY,
    hash_qmtra              CHAR(64) NOT NULL,
    origen_qmtra            VARCHAR(20) NOT NULL DEFAULT 'TELEGRAM',
    mime_qmtra              VARCHAR(60),
    peso_qmtra              INTEGER,
    duracion_seg_qmtra      NUMERIC(8,1),
    texto_qmtra             TEXT,                            -- NULL = no se entendió
    proveedor_qmtra         VARCHAR(10),                     -- GROQ | OPENAI
    modelo_qmtra            VARCHAR(60),
    respaldo_qmtra          BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE = Groq no sirvió y se usó OpenAI
    motivo_respaldo_qmtra   VARCHAR(200),                    -- ERROR_GROQ | SIN_GROQ | VACIO | BAJA_CONFIANZA | …
    costo_usd_qmtra         NUMERIC(10,6) NOT NULL DEFAULT 0,
    ms_qmtra                INTEGER,
    telefono_qmtra          VARCHAR(20),
    ide_empr                INTEGER NOT NULL,
    usuario_ingre           VARCHAR(50),
    fecha_ingre             TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qmi_tra_hash ON qmi_transcripcion (ide_empr, hash_qmtra);
CREATE INDEX IF NOT EXISTS idx_qmi_tra_fecha ON qmi_transcripcion (fecha_ingre DESC);

-- 6. Consultas: si la pregunta llegó por texto o por audio, y su transcripción.
ALTER TABLE bdt_consulta ADD COLUMN IF NOT EXISTS entrada_bdcon VARCHAR(10) NOT NULL DEFAULT 'TEXTO';  -- TEXTO | AUDIO
ALTER TABLE bdt_consulta ADD COLUMN IF NOT EXISTS ide_qmtra INTEGER;
