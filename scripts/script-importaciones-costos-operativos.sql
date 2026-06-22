-- ============================================================
-- SCRIPT: Costos operativos directamente en imp_det_importa
-- Reemplaza imp_distribucion_costo: los costos operativos se
-- distribuyen y almacenan directamente en el detalle.
-- ============================================================

-- 1. Nuevas columnas en imp_det_importa
ALTER TABLE imp_det_importa
    ADD COLUMN IF NOT EXISTS costo_operativo_unitario_imdet numeric(12,4),
    ADD COLUMN IF NOT EXISTS costo_operativo_total_imdet numeric(12,4);

COMMENT ON COLUMN imp_det_importa.costo_operativo_unitario_imdet IS 'Costo operativo unitario distribuido proporcionalmente a este producto';
COMMENT ON COLUMN imp_det_importa.costo_operativo_total_imdet   IS 'Costo operativo total asignado a este producto (= unitario * cantidad)';
