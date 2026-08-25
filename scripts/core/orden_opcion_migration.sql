-- =============================================================================
-- MIGRACIÓN: Campo de orden manual en sis_opcion
-- Fecha: 2026-08-25
-- Agrega orden_opci para permitir reordenar manualmente (drag & drop) las
-- opciones del menú dentro de cada nivel jerárquico (hermanos con el mismo
-- sis_ide_opci). Reemplaza el orden alfabético (nom_opci) usado hasta ahora
-- por AdminService.getTableQueryOpcion / getTreeModelOpcion.
-- Idempotente, seguro de re-ejecutar en cualquier ambiente.
-- =============================================================================

ALTER TABLE sis_opcion ADD COLUMN IF NOT EXISTS orden_opci INT4;

-- Backfill: asigna orden secuencial por grupo de hermanos (sis_ide_opci),
-- alfabético por nom_opci, solo para filas que aún no tengan orden asignado.
UPDATE sis_opcion o
SET orden_opci = sub.rn
FROM (
  SELECT ide_opci, ROW_NUMBER() OVER (PARTITION BY sis_ide_opci ORDER BY nom_opci) AS rn
  FROM sis_opcion
) sub
WHERE o.ide_opci = sub.ide_opci AND o.orden_opci IS NULL;

CREATE INDEX IF NOT EXISTS idx_orden_sis_opcion ON sis_opcion(sis_ide_opci, orden_opci);
