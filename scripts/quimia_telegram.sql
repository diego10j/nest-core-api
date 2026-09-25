-- ============================================================
-- Módulo: QuimIA por Telegram
-- Tablas: tlg_cuenta, tlg_usuario, tlg_conversacion  (+ columnas en bdt_consulta)
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
