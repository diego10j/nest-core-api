-- =============================================================================
-- MIGRACIÓN: Personalización de tabla por usuario (sis_tabla / sis_campo)
-- Fecha: 2026-08-07
-- Habilita que DataTable/DataTableQuery persistan la personalización (orden,
-- visibilidad, filtro por columna, filtro global, componente, etc.) hecha por
-- el usuario en el diálogo "Personalizar Tabla", reutilizando sis_tabla/sis_campo
-- (mismas tablas que parametrizaban páginas dinámicas en el aplicativo Java) y el
-- endpoint POST /core/updateColumns ya existente.
-- =============================================================================

ALTER TABLE sis_campo ADD COLUMN IF NOT EXISTS filtro_camp bool;
ALTER TABLE sis_campo ADD COLUMN IF NOT EXISTS filtro_global_camp bool;
ALTER TABLE sis_campo ADD COLUMN IF NOT EXISTS unique_camp bool;
ALTER TABLE sis_campo ADD COLUMN IF NOT EXISTS orderable_camp bool;
ALTER TABLE sis_campo ADD COLUMN IF NOT EXISTS sum_camp bool;
