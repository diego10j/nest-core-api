-- ============================================================
-- Módulo: Notificaciones en Tiempo Real
-- Tablas: sis_notificacion, sis_notificacion_usuario, sis_mensaje_noti
-- ============================================================

-- 1. Plantillas de notificación configurables
CREATE TABLE sis_notificacion (
    ide_noti          SERIAL PRIMARY KEY,
    uuid              UUID DEFAULT gen_random_uuid() NOT NULL,
    nombre_noti       VARCHAR(100) NOT NULL,
    descripcion_noti  TEXT,
    codigo_noti       VARCHAR(50) NOT NULL UNIQUE,
    icono_noti        VARCHAR(20)  DEFAULT '🔔',
    color_noti        VARCHAR(20)  DEFAULT '#1890ff',
    modulo_noti       VARCHAR(50),
    activo_noti       BOOLEAN DEFAULT TRUE,
    botones_noti      JSONB DEFAULT '[]',
    -- Auditoría
    ide_empr          INTEGER NOT NULL,
    usuario_ingre     VARCHAR(50),
    fecha_reg_noti    TIMESTAMP DEFAULT NOW(),
    usuario_actua     VARCHAR(50),
    fecha_actua_noti  TIMESTAMP
);

-- 2. Usuarios destinatarios por plantilla
CREATE TABLE sis_notificacion_usuario (
    ide_nouu      SERIAL PRIMARY KEY,
    ide_noti      INTEGER NOT NULL REFERENCES sis_notificacion(ide_noti),
    ide_usua      INTEGER NOT NULL REFERENCES sis_usuario(ide_usua),
    activo_nouu   BOOLEAN DEFAULT TRUE,
    usuario_ingre VARCHAR(50),
    fecha_reg_nouu TIMESTAMP DEFAULT NOW(),
    UNIQUE(ide_noti, ide_usua)
);

-- 3. Mensajes enviados (registro histórico)
CREATE TABLE sis_mensaje_noti (
    ide_meno            SERIAL PRIMARY KEY,
    uuid                UUID DEFAULT gen_random_uuid() NOT NULL,
    ide_noti            INTEGER REFERENCES sis_notificacion(ide_noti),
    ide_usua_destino    INTEGER NOT NULL,
    ide_usua_origen     INTEGER,
    titulo_meno         VARCHAR(200) NOT NULL,
    mensaje_meno        TEXT,
    contenido_meno      JSONB,
    botones_meno        JSONB DEFAULT '[]',
    leido_meno          BOOLEAN DEFAULT FALSE,
    archivado_meno      BOOLEAN DEFAULT FALSE,
    fecha_envio_meno    TIMESTAMP DEFAULT NOW(),
    fecha_leido_meno    TIMESTAMP,
    activo_meno         BOOLEAN DEFAULT TRUE,
    ide_empr            INTEGER NOT NULL,
    usuario_ingre       VARCHAR(50),
    fecha_reg_meno      TIMESTAMP DEFAULT NOW()
);

-- Índices para consultas frecuentes
CREATE INDEX idx_meno_usua_leido    ON sis_mensaje_noti(ide_usua_destino, leido_meno, activo_meno);
CREATE INDEX idx_meno_usua_archivado ON sis_mensaje_noti(ide_usua_destino, archivado_meno, activo_meno);
CREATE INDEX idx_meno_empr          ON sis_mensaje_noti(ide_empr);

-- ============================================================
-- DESARROLLO: Agregar columna notificar_todos_noti a sis_notificacion
-- Cuando TRUE, la plantilla notifica a TODOS los usuarios activos de la empresa,
-- sin necesidad de asignarlos uno por uno en sis_notificacion_usuario.
-- ============================================================
ALTER TABLE sis_notificacion ADD COLUMN IF NOT EXISTS notificar_todos_noti BOOLEAN DEFAULT FALSE;

-- ============================================================
-- Seed: Plantilla "Solicitud de Asesor WhatsApp"
-- ============================================================

INSERT INTO sis_notificacion (
    ide_noti, nombre_noti, descripcion_noti, codigo_noti,
    icono_noti, color_noti, modulo_noti, activo_noti, botones_noti,
    ide_empr, usuario_ingre
)
SELECT
    COALESCE(MAX(ide_noti), 0) + 1,
    'Solicitud de Asesor WhatsApp',
    'Un cliente del bot de WhatsApp solicita hablar con un asesor humano',
    'WHATSAPP_SOLICITA_ASESOR',
    '💬',
    '#25D366',
    'WhatsApp',
    TRUE,
    '[{"texto":"Ver Chat","accion":"navigate","estilo":"primary","url":"/dashboard/whatsapp"}]'::jsonb,
    0,
    'sa'
FROM sis_notificacion
WHERE NOT EXISTS (
    SELECT 1 FROM sis_notificacion WHERE codigo_noti = 'WHATSAPP_SOLICITA_ASESOR' AND ide_empr = 0
);

INSERT INTO sis_notificacion_usuario (ide_noti, ide_usua, usuario_ingre)
SELECT n.ide_noti, u.ide_usua, 'sa'
FROM sis_notificacion n
CROSS JOIN (VALUES (11), (26), (27), (30), (32), (35)) AS u(ide_usua)
WHERE n.codigo_noti = 'WHATSAPP_SOLICITA_ASESOR'
  AND n.ide_empr = 0
  AND NOT EXISTS (
    SELECT 1 FROM sis_notificacion_usuario nu
    WHERE nu.ide_noti = n.ide_noti AND nu.ide_usua = u.ide_usua
  );

-- ============================================================
-- Seed: Plantilla "Cotización desde Página Web"
-- Notifica a TODOS los usuarios activos de la empresa (notificar_todos_noti = TRUE)
-- ============================================================

INSERT INTO sis_notificacion (
    ide_noti, nombre_noti, descripcion_noti, codigo_noti,
    icono_noti, color_noti, modulo_noti, activo_noti, botones_noti,
    notificar_todos_noti, ide_empr, usuario_ingre
)
SELECT
    COALESCE(MAX(ide_noti), 0) + 1,
    'Cotización desde Página Web',
    'Un cliente llenó el formulario de cotización en la página web',
    'COTIZACION_WEB',
    '🛒',
    '#fa8c16',
    'Ventas',
    TRUE,
    '[
        {"texto":"Ver Cotización","accion":"navigate","estilo":"primary","url":"/proformas/{uuid}"},
        {"texto":"Ignorar","accion":"archive","estilo":"default","url":""}
    ]'::jsonb,
    TRUE,
    0,
    'sa'
FROM sis_notificacion
WHERE NOT EXISTS (
    SELECT 1 FROM sis_notificacion WHERE codigo_noti = 'COTIZACION_WEB' AND ide_empr = 0
);
