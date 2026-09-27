-- ============================================================
-- Marca de agua con el logo de la empresa (sis_empresa.logotipo_empr) en PDFs e imágenes.
-- Seguro de re-correr. El código funciona sin este script, pero sin él no se registra qué archivos ya
-- tienen marca (el PDF igual queda sellado en sus metadatos y no se marca dos veces).
-- ============================================================

-- 1. Cuándo se le puso la marca de agua al archivo (NULL = sin marca). Lo usa el menú de Archivos
--    ("Poner marca de agua" deshabilitado si ya la tiene) y la marca masiva de la base técnica.
ALTER TABLE sis_archivo ADD COLUMN IF NOT EXISTS marca_agua_arch TIMESTAMP;

-- 2. Hash del archivo antes de la marca de agua / reemplazo: el mismo documento sin marca (p. ej. el
--    mismo PDF adjunto en otro producto) se sigue reconociendo y reutiliza la extracción sin IA.
ALTER TABLE bdt_documento ADD COLUMN IF NOT EXISTS hash_original_bddoc VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_bddoc_hash_original ON bdt_documento (ide_empr, hash_original_bddoc);
