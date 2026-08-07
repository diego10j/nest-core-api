-- =============================================================================
-- MIGRACIÓN: Personalización de tabla por usuario (sis_tabla / sis_campo)
-- Fecha: 2026-08-07
-- Habilita que DataTable/DataTableQuery persistan la personalización (orden,
-- visibilidad, filtro por columna, filtro global, componente, etc.) hecha por
-- el usuario en el diálogo "Personalizar Tabla", reutilizando sis_tabla/sis_campo
-- (mismas tablas que parametrizaban páginas dinámicas en el aplicativo Java) y el
-- endpoint POST /core/updateColumns ya existente.
--
-- Consolida (todo con IF NOT EXISTS, seguro de re-ejecutar en cualquier ambiente):
--  - El bloque "21 Ago 2024" de scripts/script-changes.sql (query_name_tabl y demás
--    columnas base que ese script nunca llegó a aplicarse en este ambiente).
--  - Las columnas nuevas de este feature (filtro_camp, filtro_global_camp,
--    unique_camp, orderable_camp, sum_camp).
-- =============================================================================

-- --- sis_tabla ---------------------------------------------------------------
ALTER TABLE sis_tabla ADD COLUMN IF NOT EXISTS query_name_tabl varchar(100);
ALTER TABLE sis_tabla ADD COLUMN IF NOT EXISTS usuario_ingre varchar(50);
ALTER TABLE sis_tabla ADD COLUMN IF NOT EXISTS hora_ingre TIMESTAMP;
ALTER TABLE sis_tabla ADD COLUMN IF NOT EXISTS usuario_actua varchar(50);
ALTER TABLE sis_tabla ADD COLUMN IF NOT EXISTS hora_actua TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_query_name_sis_tabla ON sis_tabla(query_name_tabl);
CREATE INDEX IF NOT EXISTS idx_query_name_opci_sis_tabla ON sis_tabla(ide_opci, query_name_tabl);

-- --- sis_campo -----------------------------------------------------------------
ALTER TABLE sis_campo ADD COLUMN IF NOT EXISTS usuario_ingre varchar(50);
ALTER TABLE sis_campo ADD COLUMN IF NOT EXISTS hora_ingre TIMESTAMP;
ALTER TABLE sis_campo ADD COLUMN IF NOT EXISTS usuario_actua varchar(50);
ALTER TABLE sis_campo ADD COLUMN IF NOT EXISTS hora_actua TIMESTAMP;
ALTER TABLE sis_campo ADD COLUMN IF NOT EXISTS table_id_camp int4;
ALTER TABLE sis_campo ADD COLUMN IF NOT EXISTS data_type_id_camp int4;
ALTER TABLE sis_campo ADD COLUMN IF NOT EXISTS data_type_camp varchar(50);
ALTER TABLE sis_campo ADD COLUMN IF NOT EXISTS length_camp int4;
ALTER TABLE sis_campo ADD COLUMN IF NOT EXISTS decimals_camp int4;
ALTER TABLE sis_campo ADD COLUMN IF NOT EXISTS precision_camp int4;
ALTER TABLE sis_campo ADD COLUMN IF NOT EXISTS component_camp varchar(80);
ALTER TABLE sis_campo ADD COLUMN IF NOT EXISTS size_camp int4;
ALTER TABLE sis_campo ADD COLUMN IF NOT EXISTS align_camp varchar(50);

-- Columnas nuevas de este feature
ALTER TABLE sis_campo ADD COLUMN IF NOT EXISTS filtro_camp bool;
ALTER TABLE sis_campo ADD COLUMN IF NOT EXISTS filtro_global_camp bool;
ALTER TABLE sis_campo ADD COLUMN IF NOT EXISTS unique_camp bool;
ALTER TABLE sis_campo ADD COLUMN IF NOT EXISTS orderable_camp bool;
ALTER TABLE sis_campo ADD COLUMN IF NOT EXISTS sum_camp bool;
