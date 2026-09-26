-- ============================================================
-- Notificaciones por Telegram: canal adicional del esquema de notificaciones (sis_notificacion).
-- Cada plantilla puede habilitar Telegram y elegir a qué números autorizados (tlg_usuario, empleados)
-- le llega. Requiere scripts/sis_notificaciones.sql y scripts/quimia_telegram.sql. Seguro de re-correr.
-- ============================================================

-- 1. La plantilla también se envía por Telegram.
ALTER TABLE sis_notificacion ADD COLUMN IF NOT EXISTS telegram_activo_noti BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Números de Telegram que reciben cada plantilla.
CREATE TABLE IF NOT EXISTS sis_notificacion_telegram (
    ide_nttg        SERIAL PRIMARY KEY,
    ide_noti        INTEGER NOT NULL REFERENCES sis_notificacion(ide_noti) ON DELETE CASCADE,
    ide_tlusu       INTEGER NOT NULL REFERENCES tlg_usuario(ide_tlusu) ON DELETE CASCADE,
    usuario_ingre   VARCHAR(50),
    fecha_reg_nttg  TIMESTAMP DEFAULT NOW(),
    UNIQUE (ide_noti, ide_tlusu)
);

-- 3. Registro de cada envío por Telegram (auditoría y diagnóstico).
CREATE TABLE IF NOT EXISTS sis_notificacion_envio_tlg (
    ide_netg        SERIAL PRIMARY KEY,
    ide_noti        INTEGER REFERENCES sis_notificacion(ide_noti) ON DELETE CASCADE,
    ide_tlusu       INTEGER REFERENCES tlg_usuario(ide_tlusu) ON DELETE SET NULL,
    alias_netg      VARCHAR(100),                 -- alias del número al momento del envío
    titulo_netg     VARCHAR(200),
    estado_netg     VARCHAR(15) NOT NULL,         -- ENVIADO | ERROR | NO_VINCULADO
    prueba_netg     BOOLEAN DEFAULT FALSE,        -- enviado con "Enviar prueba"
    message_id_netg BIGINT,
    error_netg      TEXT,
    ide_empr        INTEGER NOT NULL,
    fecha_netg      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_netg_noti ON sis_notificacion_envio_tlg (ide_noti, fecha_netg DESC);

-- 4. Migración: los números que tenían "Recibe alertas del sistema" pasan a ser destinatarios de la
--    plantilla IA_SIN_SALDO (si ya fue creada en Notificaciones).
INSERT INTO sis_notificacion_telegram (ide_noti, ide_tlusu, usuario_ingre)
SELECT n.ide_noti, u.ide_tlusu, 'MIGRACION'
  FROM sis_notificacion n
  JOIN tlg_usuario u ON u.ide_empr = n.ide_empr AND u.recibe_alertas_tlusu
 WHERE n.codigo_noti = 'IA_SIN_SALDO'
ON CONFLICT (ide_noti, ide_tlusu) DO NOTHING;
UPDATE sis_notificacion n SET telegram_activo_noti = TRUE
 WHERE n.codigo_noti = 'IA_SIN_SALDO'
   AND EXISTS (SELECT 1 FROM sis_notificacion_telegram t WHERE t.ide_noti = n.ide_noti);
