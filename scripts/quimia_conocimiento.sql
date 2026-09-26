-- ============================================================
-- QuimIA + Base de conocimiento (sis_conocimiento)
--
-- Búsqueda de texto completo en las notas para que QuimIA las use como fuente y ofrezca
-- "Ver nota". Requiere scripts/base_conocimiento.sql y scripts/base_tecnica.sql (función
-- bdt_f_unaccent y extensiones unaccent / pg_trgm). Seguro de re-correr.
--
-- No cambia cómo se guardan las notas: texto_plano_cono ya lo genera saveArticulo.
-- ============================================================

-- 1. Índice de texto (español, sin tildes): título con más peso que el cuerpo.
ALTER TABLE sis_conocimiento ADD COLUMN IF NOT EXISTS tsv_quimia_cono TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('spanish', bdt_f_unaccent(COALESCE(titulo_cono, ''))), 'A') ||
    setweight(to_tsvector('spanish', bdt_f_unaccent(COALESCE(texto_plano_cono, ''))), 'C')
) STORED;
CREATE INDEX IF NOT EXISTS idx_cono_tsv_quimia ON sis_conocimiento USING GIN (tsv_quimia_cono);

-- 2. Título aproximado (errores de escritura / transcripción de voz).
CREATE INDEX IF NOT EXISTS idx_cono_titulo_trgm ON sis_conocimiento
    USING GIN (UPPER(bdt_f_unaccent(titulo_cono)) gin_trgm_ops);

-- 3. Consultas: notas de la base de conocimiento ofrecidas/usadas en la respuesta.
ALTER TABLE bdt_consulta ADD COLUMN IF NOT EXISTS notas_bdcon INTEGER[];
