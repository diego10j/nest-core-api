-- ============================================================
-- Módulo: Base de Conocimiento (Wiki interno)
-- Tablas: sis_conocimiento, sis_conocimiento_tag, sis_conocimiento_relacion, sis_conocimiento_archivo
-- ============================================================

-- 1. Artículos
CREATE TABLE IF NOT EXISTS sis_conocimiento (
    ide_cono          SERIAL PRIMARY KEY,
    uuid              UUID DEFAULT gen_random_uuid() NOT NULL,
    titulo_cono       VARCHAR(200) NOT NULL,
    contenido_cono    TEXT,
    texto_plano_cono  TEXT,
    categoria_cono    VARCHAR(100),
    favorito_cono     BOOLEAN DEFAULT FALSE,
    estado_cono       VARCHAR(20) DEFAULT 'ACTIVO', -- ACTIVO | ARCHIVADO
    vistas_cono       INTEGER DEFAULT 0,
    -- Auditoría
    ide_empr          INTEGER NOT NULL,
    usuario_ingre     VARCHAR(50),
    fecha_reg_cono    TIMESTAMP DEFAULT NOW(),
    usuario_actua     VARCHAR(50),
    fecha_actua_cono  TIMESTAMP
);

-- 2. Tags (etiquetas), varias por artículo
CREATE TABLE IF NOT EXISTS sis_conocimiento_tag (
    ide_ctag      SERIAL PRIMARY KEY,
    ide_cono      INTEGER NOT NULL REFERENCES sis_conocimiento(ide_cono) ON DELETE CASCADE,
    tag           VARCHAR(50) NOT NULL,
    UNIQUE(ide_cono, tag)
);

-- 3. Relaciones polimórficas: PRODUCTO (ide_inarti) | PERSONA (ide_geper)
CREATE TABLE IF NOT EXISTS sis_conocimiento_relacion (
    ide_crel            SERIAL PRIMARY KEY,
    ide_cono            INTEGER NOT NULL REFERENCES sis_conocimiento(ide_cono) ON DELETE CASCADE,
    tipo_relacion       VARCHAR(20) NOT NULL, -- PRODUCTO | PERSONA
    ide_referencia      INTEGER NOT NULL,
    nombre_referencia   VARCHAR(200),
    subtipo_referencia  VARCHAR(30) -- cliente | proveedor | contacto | empleado (solo cuando tipo_relacion = PERSONA)
);

-- 4. Adjuntos propios de la base de conocimiento (NO usa sis_archivo / FilesService)
CREATE TABLE IF NOT EXISTS sis_conocimiento_archivo (
    ide_carc              SERIAL PRIMARY KEY,
    ide_cono              INTEGER NOT NULL REFERENCES sis_conocimiento(ide_cono) ON DELETE CASCADE,
    uuid                  UUID DEFAULT gen_random_uuid() NOT NULL,
    nombre_original_carc  VARCHAR(255) NOT NULL,
    nombre_disco_carc     VARCHAR(255) NOT NULL,
    mime_carc             VARCHAR(100),
    extension_carc        VARCHAR(20),
    peso_carc             BIGINT,
    usuario_ingre         VARCHAR(50),
    fecha_reg_carc        TIMESTAMP DEFAULT NOW()
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_cono_empr           ON sis_conocimiento(ide_empr, estado_cono);
CREATE INDEX IF NOT EXISTS idx_cono_categoria       ON sis_conocimiento(categoria_cono);
CREATE INDEX IF NOT EXISTS idx_ctag_ide_cono         ON sis_conocimiento_tag(ide_cono);
CREATE INDEX IF NOT EXISTS idx_ctag_tag              ON sis_conocimiento_tag(tag);
CREATE INDEX IF NOT EXISTS idx_crel_ide_cono         ON sis_conocimiento_relacion(ide_cono);
CREATE INDEX IF NOT EXISTS idx_crel_referencia       ON sis_conocimiento_relacion(tipo_relacion, ide_referencia);
CREATE INDEX IF NOT EXISTS idx_carc_ide_cono         ON sis_conocimiento_archivo(ide_cono);
