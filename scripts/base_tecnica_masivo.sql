-- ============================================================
-- Base técnica: extracción masiva, automática al subir archivos y reutilización de extracciones.
-- Requiere scripts/base_tecnica.sql. Seguro de re-correr.
-- ============================================================

-- 1. Reutilización: un documento ya extraído en otro producto (mismo archivo = mismo hash, o PDF con
--    el mismo texto guardado de nuevo = mismo hash de texto) se copia sin volver a llamar a la IA.
ALTER TABLE bdt_documento ADD COLUMN IF NOT EXISTS hash_texto_bddoc  VARCHAR(64);  -- sha256 del texto normalizado (PDF con texto)
ALTER TABLE bdt_documento ADD COLUMN IF NOT EXISTS ide_bddoc_origen  INTEGER;      -- documento del que se reutilizó la extracción
ALTER TABLE bdt_documento ADD COLUMN IF NOT EXISTS costo_usd_bddoc   NUMERIC(10,5) DEFAULT 0; -- costo IA de la extracción (0 si se reutilizó)
CREATE INDEX IF NOT EXISTS idx_bdt_doc_hash       ON bdt_documento (ide_empr, hash_bddoc);
CREATE INDEX IF NOT EXISTS idx_bdt_doc_hash_texto ON bdt_documento (ide_empr, hash_texto_bddoc) WHERE hash_texto_bddoc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bdt_doc_uuid       ON bdt_documento (uuid_origen_bddoc);
CREATE INDEX IF NOT EXISTS idx_bdt_doc_proceso    ON bdt_documento (ide_empr, fecha_proceso_bddoc DESC);

-- 2. Corridas MASIVO (botón "Procesar pendientes") y AUTOMATICO (al subir/mover archivos).
ALTER TABLE bdt_proceso ADD COLUMN IF NOT EXISTS reutilizados_bdrun       INTEGER DEFAULT 0;
ALTER TABLE bdt_proceso ADD COLUMN IF NOT EXISTS costo_usd_bdrun          NUMERIC(10,5) DEFAULT 0;
ALTER TABLE bdt_proceso ADD COLUMN IF NOT EXISTS total_productos_bdrun    INTEGER DEFAULT 0;
ALTER TABLE bdt_proceso ADD COLUMN IF NOT EXISTS productos_listos_bdrun   INTEGER DEFAULT 0;
ALTER TABLE bdt_proceso ADD COLUMN IF NOT EXISTS producto_actual_bdrun    VARCHAR(250);
ALTER TABLE bdt_proceso ADD COLUMN IF NOT EXISTS archivo_actual_bdrun     VARCHAR(255);
ALTER TABLE bdt_proceso ADD COLUMN IF NOT EXISTS pausado_bdrun            BOOLEAN DEFAULT FALSE;
ALTER TABLE bdt_proceso ADD COLUMN IF NOT EXISTS cancelado_bdrun          BOOLEAN DEFAULT FALSE;
ALTER TABLE bdt_proceso ADD COLUMN IF NOT EXISTS motivo_pausa_bdrun       VARCHAR(250);  -- ej. OpenAI sin saldo
-- estado_bdrun ahora también: PAUSADO | CANCELADO | INTERRUMPIDO (el servidor se reinició a media corrida)
CREATE INDEX IF NOT EXISTS idx_bdt_run_origen ON bdt_proceso (ide_empr, origen_bdrun, ide_bdrun DESC);

-- 3. Configuración por empresa.
CREATE TABLE IF NOT EXISTS bdt_configuracion (
    ide_empr                INTEGER PRIMARY KEY,
    auto_activo_bdcfg       BOOLEAN NOT NULL DEFAULT TRUE,   -- extraer automáticamente al subir/mover archivos
    tope_diario_usd_bdcfg   NUMERIC(8,2) DEFAULT 1.00,       -- NULL = sin tope (solo afecta a lo automático)
    usuario_actua           VARCHAR(50),
    fecha_actua             TIMESTAMP DEFAULT NOW()
);

-- 4. Alertas del sistema por Telegram (ej. OpenAI sin saldo): números que las reciben.
ALTER TABLE tlg_usuario ADD COLUMN IF NOT EXISTS recibe_alertas_tlusu BOOLEAN NOT NULL DEFAULT FALSE;
