-- ============================================================
-- MÓDULO DE ETIQUETAS DE INVENTARIO
-- Permite configurar la información a imprimir en etiquetas
-- de productos por tipo (GRANDE, PEQUEÑA, etc.).
-- Un producto puede tener un registro por cada tipo de etiqueta.
--
-- DISEÑO:
--   inv_etiqueta  → Configuración de etiqueta por producto y tipo
-- ============================================================

-- ============================================================
-- 1. ETIQUETAS DE PRODUCTOS
--    Almacena la información necesaria para imprimir etiquetas
--    por producto y tipo. Un producto puede tener como máximo
--    un registro por tipo de etiqueta (GRANDE, PEQUEÑA, etc.).
--    Ej: "Aceite de Coco" + "GRANDE" → 1 configuración de etiqueta
--        "Aceite de Coco" + "PEQUEÑA" → 1 configuración de etiqueta
-- ============================================================
CREATE TABLE "public"."inv_etiqueta" (
    "ide_ineta"               int8         NOT NULL,
    "ide_inarti"              int8         NOT NULL,    -- Artículo al que pertenece la etiqueta
    "nombre_ineta"            varchar(150) NOT NULL,    -- Nombre a imprimir en la etiqueta
    "tipo_ineta"              varchar(20)  NOT NULL,    -- Tipo de etiqueta: GRANDE, PEQUEÑA, etc.
    "peso_ineta"              numeric(12,3),            -- Peso del producto
    "unidad_medida_ineta"     varchar(50),             -- Unidad de medida del peso (kg, g, lb, etc.)
    "lote_ineta"              varchar(50),             -- Número o código de lote
    "fecha_elaboracion_ineta" date,                    -- Fecha de elaboración del producto
    "fecha_vence_ineta"       date,                    -- Fecha de vencimiento del producto
    "usuario_ingre"           varchar(50),
    "fecha_ingre"             date,
    "hora_ingre"              time,
    "usuario_actua"           varchar(50),
    "fecha_actua"             date,
    "hora_actua"              time,
    CONSTRAINT "inv_etiqueta_pkey"
        PRIMARY KEY ("ide_ineta"),
    CONSTRAINT "inv_etiqueta_ide_inarti_fkey"
        FOREIGN KEY ("ide_inarti") REFERENCES "public"."inv_articulo"("ide_inarti")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inv_etiqueta_uq_inarti_tipo"
        UNIQUE ("ide_inarti", "tipo_ineta")           -- Un producto solo puede tener una etiqueta por tipo
);
COMMENT ON TABLE  "public"."inv_etiqueta" IS 'Configuración de información para impresión de etiquetas de productos. Un producto puede tener un registro por cada tipo de etiqueta (GRANDE, PEQUEÑA, etc.).';
COMMENT ON COLUMN "public"."inv_etiqueta"."ide_inarti"              IS 'Artículo de inventario al que pertenece la configuración de etiqueta';
COMMENT ON COLUMN "public"."inv_etiqueta"."nombre_ineta"            IS 'Nombre del producto a imprimir en la etiqueta';
COMMENT ON COLUMN "public"."inv_etiqueta"."tipo_ineta"              IS 'Tipo de etiqueta. Valores iniciales: GRANDE, PEQUEÑA. Extensible a otros tipos.';
COMMENT ON COLUMN "public"."inv_etiqueta"."peso_ineta"              IS 'Peso del producto a imprimir en la etiqueta';
COMMENT ON COLUMN "public"."inv_etiqueta"."unidad_medida_ineta"     IS 'Unidad de medida del peso (kg, g, lb, oz, etc.)';
COMMENT ON COLUMN "public"."inv_etiqueta"."lote_ineta"              IS 'Número o código de lote del producto';
COMMENT ON COLUMN "public"."inv_etiqueta"."fecha_elaboracion_ineta" IS 'Fecha de elaboración o fabricación del producto';
COMMENT ON COLUMN "public"."inv_etiqueta"."fecha_vence_ineta"       IS 'Fecha de vencimiento o caducidad del producto';

-- ============================================================
-- ÍNDICES
-- ============================================================

-- Consulta por producto
CREATE INDEX "idx_inv_etiqueta_inarti"
    ON "public"."inv_etiqueta" ("ide_inarti");

-- Consulta por producto y tipo de etiqueta
CREATE INDEX "idx_inv_etiqueta_inarti_tipo"
    ON "public"."inv_etiqueta" ("ide_inarti", "tipo_ineta");

-- Consulta por producto y lote
CREATE INDEX "idx_inv_etiqueta_inarti_lote"
    ON "public"."inv_etiqueta" ("ide_inarti", "lote_ineta");
