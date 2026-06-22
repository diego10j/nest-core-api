-- ============================================================
-- SCRIPT: Rentabilidad de Importaciones
-- AGREGAR: Columnas de precio_venta/utilidad en imp_det_importa
-- CREAR:   Tabla imp_rentabilidad (1:1 con imp_cab_importa)
-- ============================================================

-- ============================================================
-- 1. Nuevas columnas en imp_det_importa
-- ============================================================
ALTER TABLE imp_det_importa
    ADD COLUMN IF NOT EXISTS precio_venta_imdet          numeric(12,4),
    ADD COLUMN IF NOT EXISTS porcentaje_utilidad_imdet   numeric(5,2),
    ADD COLUMN IF NOT EXISTS costo_unitario_total_imdet  numeric(12,4),
    ADD COLUMN IF NOT EXISTS utilidad_imdet              numeric(12,4),
    ADD COLUMN IF NOT EXISTS margen_utilidad_imdet       numeric(5,2);

COMMENT ON COLUMN imp_det_importa.precio_venta_imdet         IS 'Precio de venta final por unidad (SIN IVA)';
COMMENT ON COLUMN imp_det_importa.porcentaje_utilidad_imdet  IS '% de utilidad deseado para este producto';
COMMENT ON COLUMN imp_det_importa.costo_unitario_total_imdet IS 'Costo unitario total (FOB + costos operativos distribuidos)';
COMMENT ON COLUMN imp_det_importa.utilidad_imdet             IS 'Utilidad total = (precio_venta - costo_unitario) * cantidad';
COMMENT ON COLUMN imp_det_importa.margen_utilidad_imdet      IS '% margen de utilidad = ((precio_venta - costo) / precio_venta) * 100';


-- ============================================================
-- 2. Nueva tabla: imp_rentabilidad
-- ============================================================
CREATE TABLE IF NOT EXISTS imp_rentabilidad (
    ide_imren                      int8           NOT NULL,
    ide_imcaim                     int8           NOT NULL,
    porcentaje_utilidad_global     numeric(5,2),
    margen_utilidad_global         numeric(5,2),
    ganancia_bruta_imren           numeric(12,2),
    costo_total_importacion_imren  numeric(12,2),
    precio_venta_total_imren       numeric(12,2),
    total_utilidad_imren           numeric(12,2),
    total_inversion_imren          numeric(12,2),
    roi_porcentaje_imren           numeric(5,2),
    activo_imren                   bool           DEFAULT true,
    usuario_ingre                  varchar(50),
    hora_ingre                     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
    usuario_actua                  varchar(50),
    hora_actua                     TIMESTAMP,
    CONSTRAINT pk_imp_rentabilidad PRIMARY KEY (ide_imren),
    CONSTRAINT uq_imp_rentabilidad_imcaim UNIQUE (ide_imcaim)
);

COMMENT ON TABLE imp_rentabilidad IS 'Rentabilidad global de la orden de importación, 1:1 con imp_cab_importa';
COMMENT ON COLUMN imp_rentabilidad.porcentaje_utilidad_global    IS '% de utilidad global deseado para toda la importación';
COMMENT ON COLUMN imp_rentabilidad.margen_utilidad_global        IS '% margen de utilidad global';
COMMENT ON COLUMN imp_rentabilidad.ganancia_bruta_imren          IS 'Ganancia bruta total = suma de utilidad de todos los detalles';
COMMENT ON COLUMN imp_rentabilidad.costo_total_importacion_imren IS 'Costo total de la importación = suma de costo_unitario_total * cantidad';
COMMENT ON COLUMN imp_rentabilidad.precio_venta_total_imren      IS 'Precio de venta total = suma de precio_venta * cantidad';
COMMENT ON COLUMN imp_rentabilidad.total_utilidad_imren          IS 'Utilidad total = precio_venta_total - costo_total_importacion';
COMMENT ON COLUMN imp_rentabilidad.total_inversion_imren         IS 'Inversión total = costo_total_importacion';
COMMENT ON COLUMN imp_rentabilidad.roi_porcentaje_imren          IS 'ROI % = (total_utilidad / total_inversion) * 100';


-- ============================================================
-- 3. Foreign Key
-- ============================================================
ALTER TABLE imp_rentabilidad
    ADD CONSTRAINT fk_imren_imcaim
    FOREIGN KEY (ide_imcaim) REFERENCES imp_cab_importa(ide_imcaim)
    ON DELETE RESTRICT;


-- ============================================================
-- 4. Índices
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_imp_rentabilidad_imcaim ON imp_rentabilidad(ide_imcaim);
