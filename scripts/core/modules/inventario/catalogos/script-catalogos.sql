-- ============================================================
-- MÓDULO DE CATÁLOGOS DE PRECIOS
-- Permite crear catálogos de productos con precios personalizados
-- para presentaciones web, promociones, etc.
--
-- DISEÑO:
--   inv_tipo_catalogo  → Tipos de catálogo (clasificación)
--   inv_cab_catalogo   → Cabecera del catálogo (nombre, descripción, imagen)
--   inv_det_catalogo   → Detalle del catálogo (productos asociados con orden)
-- ============================================================

-- ============================================================
-- 0. TIPO DE CATÁLOGO
--    Clasificación de catálogos (ej: "Velas", "Jabones", "General")
-- ============================================================
CREATE TABLE "public"."inv_tipo_catalogo" (
    "ide_intica"           int8         NOT NULL,
    "ide_empr"             int8         NOT NULL,
    "nombre_intica"        varchar(150) NOT NULL,
    "descripcion_intica"   varchar(300),
    "activo_intica"        bool         DEFAULT true,
    "orden_intica"         int          DEFAULT 0,
    "usuario_ingre"        varchar(50),
    "fecha_ingre"          date,
    "hora_ingre"           time,
    "usuario_actua"        varchar(50),
    "fecha_actua"          date,
    "hora_actua"           time,
    CONSTRAINT "inv_tipo_catalogo_pkey"
        PRIMARY KEY ("ide_intica"),
    CONSTRAINT "inv_tipo_catalogo_ide_empr_fkey"
        FOREIGN KEY ("ide_empr") REFERENCES "public"."sis_empresa"("ide_empr")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);
COMMENT ON TABLE  "public"."inv_tipo_catalogo" IS 'Tipos de catálogo. Permite clasificar los catálogos (ej: Velas, Jabones, General).';
COMMENT ON COLUMN "public"."inv_tipo_catalogo"."nombre_intica"      IS 'Nombre del tipo de catálogo';
COMMENT ON COLUMN "public"."inv_tipo_catalogo"."descripcion_intica" IS 'Descripción del tipo de catálogo';
COMMENT ON COLUMN "public"."inv_tipo_catalogo"."activo_intica"      IS 'Estado: true = activo, false = inactivo';
COMMENT ON COLUMN "public"."inv_tipo_catalogo"."orden_intica"       IS 'Orden de presentación';

-- ============================================================
-- 1. CABECERA DE CATÁLOGO
--    Define el catálogo con su nombre, descripción, imágenes,
--    estado y otros atributos de presentación.
-- ============================================================
CREATE TABLE "public"."inv_cab_catalogo" (
    "ide_inccat"           int8         NOT NULL,
    "ide_empr"             int8         NOT NULL,
    "ide_tipo_inccat"      int8,
    "nombre_inccat"        varchar(150) NOT NULL,
    "descripcion_inccat"   text,
    "desc_corta_inccat"    varchar(300),
    "estado_inccat"        bool         DEFAULT true,
    "orden_inccat"         int          DEFAULT 0,
    "imagen_inccat"        varchar(255),
    "imagenes_inccat"      text,                     -- JSON array de strings con nombres de archivo
    "path_inccat"          varchar(50),
    "vistas_inccat"        int          DEFAULT 0,
    "color_inccat"         varchar(20),
    "usuario_ingre"        varchar(50),
    "fecha_ingre"          date,
    "hora_ingre"           time,
    "usuario_actua"        varchar(50),
    "fecha_actua"          date,
    "hora_actua"           time,
    CONSTRAINT "inv_cab_catalogo_pkey"
        PRIMARY KEY ("ide_inccat"),
    CONSTRAINT "inv_cab_catalogo_ide_empr_fkey"
        FOREIGN KEY ("ide_empr") REFERENCES "public"."sis_empresa"("ide_empr")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inv_cab_catalogo_ide_tipo_inccat_fkey"
        FOREIGN KEY ("ide_tipo_inccat") REFERENCES "public"."inv_tipo_catalogo"("ide_intica")
        ON DELETE SET NULL ON UPDATE RESTRICT
);
COMMENT ON TABLE  "public"."inv_cab_catalogo" IS 'Cabecera de catálogos de precios. Define un catálogo con nombre, descripción, imágenes y estado.';
COMMENT ON COLUMN "public"."inv_cab_catalogo"."nombre_inccat"        IS 'Nombre del catálogo';
COMMENT ON COLUMN "public"."inv_cab_catalogo"."descripcion_inccat"   IS 'Descripción detallada del catálogo (texto enriquecido)';
COMMENT ON COLUMN "public"."inv_cab_catalogo"."desc_corta_inccat"    IS 'Descripción corta del catálogo (resumen)';
COMMENT ON COLUMN "public"."inv_cab_catalogo"."estado_inccat"        IS 'Estado del catálogo: true = activo, false = inactivo';
COMMENT ON COLUMN "public"."inv_cab_catalogo"."orden_inccat"         IS 'Orden de presentación del catálogo';
COMMENT ON COLUMN "public"."inv_cab_catalogo"."imagen_inccat"        IS 'Nombre del archivo de la imagen principal del catálogo';
COMMENT ON COLUMN "public"."inv_cab_catalogo"."imagenes_inccat"      IS 'Array JSON con los nombres de archivos de imágenes adicionales del catálogo';
COMMENT ON COLUMN "public"."inv_cab_catalogo"."path_inccat"          IS 'Ruta relativa donde se almacenan las imágenes del catálogo';
COMMENT ON COLUMN "public"."inv_cab_catalogo"."vistas_inccat"        IS 'Contador de vistas del catálogo';
COMMENT ON COLUMN "public"."inv_cab_catalogo"."ide_tipo_inccat"      IS 'Tipo de catálogo (clasificación opcional)';
COMMENT ON COLUMN "public"."inv_cab_catalogo"."color_inccat"         IS 'Color distintivo del catálogo (hex o nombre CSS)';

-- ============================================================
-- 2. DETALLE DE CATÁLOGO
--    Productos que pertenecen a un catálogo, con orden de
--    presentación y estado individual.
-- ============================================================
CREATE TABLE "public"."inv_det_catalogo" (
    "ide_indcat"              int8         NOT NULL,
    "ide_inccat"              int8         NOT NULL,
    "ide_inarti"              int8         NOT NULL,
    "orden_indcat"            int          DEFAULT 0,
    "activo_indcat"           bool         DEFAULT true,
    "publica_sin_stock_indcat" bool         DEFAULT true,
    "descripcion_indcat"      text,
    "fotos_indcat"            text,
    "video_indcat"            varchar(255),
    "url_indcat"              varchar(200),
    "usuario_ingre"           varchar(50),
    "fecha_ingre"             date,
    "hora_ingre"              time,
    "usuario_actua"           varchar(50),
    "fecha_actua"             date,
    "hora_actua"              time,
    CONSTRAINT "inv_det_catalogo_pkey"
        PRIMARY KEY ("ide_indcat"),
    CONSTRAINT "inv_det_catalogo_ide_inccat_fkey"
        FOREIGN KEY ("ide_inccat") REFERENCES "public"."inv_cab_catalogo"("ide_inccat")
        ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "inv_det_catalogo_ide_inarti_fkey"
        FOREIGN KEY ("ide_inarti") REFERENCES "public"."inv_articulo"("ide_inarti")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);
COMMENT ON TABLE  "public"."inv_det_catalogo" IS 'Detalle de catálogos de precios. Productos asociados a un catálogo con orden de presentación. Los precios se obtienen de inv_conf_precios_articulo.';
COMMENT ON COLUMN "public"."inv_det_catalogo"."ide_indcat"           IS 'ID del detalle de catálogo';
COMMENT ON COLUMN "public"."inv_det_catalogo"."ide_inccat"           IS 'FK a la cabecera del catálogo';
COMMENT ON COLUMN "public"."inv_det_catalogo"."ide_inarti"           IS 'FK al artículo de inventario';
COMMENT ON COLUMN "public"."inv_det_catalogo"."orden_indcat"            IS 'Orden de presentación del producto dentro del catálogo';
COMMENT ON COLUMN "public"."inv_det_catalogo"."activo_indcat"           IS 'Estado del detalle: true = activo, false = inactivo';
COMMENT ON COLUMN "public"."inv_det_catalogo"."publica_sin_stock_indcat" IS 'Si es true, el producto se muestra aunque no tenga stock. Si es false, solo se muestra si tiene stock > 0';
COMMENT ON COLUMN "public"."inv_det_catalogo"."descripcion_indcat"   IS 'Descripción del producto dentro del catálogo (puede diferir de la del artículo)';
COMMENT ON COLUMN "public"."inv_det_catalogo"."fotos_indcat"         IS 'Array JSON con nombres de archivos de fotos específicas para el catálogo';
COMMENT ON COLUMN "public"."inv_det_catalogo"."video_indcat"         IS 'URL o nombre de archivo del video del producto en el catálogo';
COMMENT ON COLUMN "public"."inv_det_catalogo"."url_indcat"           IS 'URL amigable (slug) del producto en el catálogo';

-- ============================================================
-- 3. CANTIDADES POR DETALLE DE CATÁLOGO
--    Define las cantidades/presentaciones que se publican para
--    cada producto dentro del catálogo (ej: 1 KG, 25 KG).
--    Los precios se obtienen de inv_conf_precios_articulo
--    según la cantidad configurada.
-- ============================================================
CREATE TABLE "public"."inv_cant_det_catalogo" (
    "ide_incdc"              int8         NOT NULL,
    "ide_indcat"             int8         NOT NULL,
    "cantidad_incdc"         numeric(12,3) NOT NULL,
    "unidad_medida_incdc"    varchar(50),
    "descripcion_incdc"      varchar(100),
    "orden_incdc"            int          DEFAULT 0,
    "activo_incdc"           bool         DEFAULT true,
    "usuario_ingre"          varchar(50),
    "fecha_ingre"            date,
    "hora_ingre"             time,
    "usuario_actua"          varchar(50),
    "fecha_actua"            date,
    "hora_actua"             time,
    CONSTRAINT "inv_cant_det_catalogo_pkey"
        PRIMARY KEY ("ide_incdc"),
    CONSTRAINT "inv_cant_det_catalogo_ide_indcat_fkey"
        FOREIGN KEY ("ide_indcat") REFERENCES "public"."inv_det_catalogo"("ide_indcat")
        ON DELETE CASCADE ON UPDATE RESTRICT
);
COMMENT ON TABLE  "public"."inv_cant_det_catalogo" IS 'Cantidades/presentaciones a publicar por cada producto del catálogo. Los precios se obtienen de inv_conf_precios_articulo según la cantidad.';
COMMENT ON COLUMN "public"."inv_cant_det_catalogo"."ide_incdc"           IS 'ID de la cantidad del detalle de catálogo';
COMMENT ON COLUMN "public"."inv_cant_det_catalogo"."ide_indcat"          IS 'FK al detalle del catálogo';
COMMENT ON COLUMN "public"."inv_cant_det_catalogo"."cantidad_incdc"      IS 'Cantidad a publicar (ej: 1, 25)';
COMMENT ON COLUMN "public"."inv_cant_det_catalogo"."unidad_medida_incdc" IS 'Unidad de medida (ej: KG, UNI)';
COMMENT ON COLUMN "public"."inv_cant_det_catalogo"."descripcion_incdc"   IS 'Etiqueta visible (ej: 1 KG, Saco 25 KG)';
COMMENT ON COLUMN "public"."inv_cant_det_catalogo"."orden_incdc"         IS 'Orden de presentación';
COMMENT ON COLUMN "public"."inv_cant_det_catalogo"."activo_incdc"        IS 'Estado: true = activo, false = inactivo';

-- ============================================================
-- ÍNDICES
-- ============================================================

-- Tipos de catálogo por empresa
CREATE INDEX "idx_inv_tipo_catalogo_empr"
    ON "public"."inv_tipo_catalogo" ("ide_empr");

-- Tipos de catálogo activos
CREATE INDEX "idx_inv_tipo_catalogo_activo"
    ON "public"."inv_tipo_catalogo" ("ide_empr", "activo_intica");

-- Consulta de catálogos por empresa
CREATE INDEX "idx_inv_cab_catalogo_empr"
    ON "public"."inv_cab_catalogo" ("ide_empr");

-- Consulta de catálogos activos
CREATE INDEX "idx_inv_cab_catalogo_estado"
    ON "public"."inv_cab_catalogo" ("ide_empr", "estado_inccat");

-- Consulta de catálogo por path
CREATE INDEX "idx_inv_cab_catalogo_path"
    ON "public"."inv_cab_catalogo" ("path_inccat");

-- Consulta de detalles por cabecera
CREATE INDEX "idx_inv_det_catalogo_inccat"
    ON "public"."inv_det_catalogo" ("ide_inccat");

-- Consulta de detalles por artículo
CREATE INDEX "idx_inv_det_catalogo_inarti"
    ON "public"."inv_det_catalogo" ("ide_inarti");

-- Consulta de detalles por cabecera y orden
CREATE INDEX "idx_inv_det_catalogo_inccat_orden"
    ON "public"."inv_det_catalogo" ("ide_inccat", "orden_indcat");

-- Cantidades por detalle
CREATE INDEX "idx_inv_cant_det_catalogo_indcat"
    ON "public"."inv_cant_det_catalogo" ("ide_indcat");

-- Cantidades por detalle y orden
CREATE INDEX "idx_inv_cant_det_catalogo_indcat_orden"
    ON "public"."inv_cant_det_catalogo" ("ide_indcat", "orden_incdc");
