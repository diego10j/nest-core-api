-- ============================================================
-- MÓDULO DE MENUDEO / FRACCIONAMIENTO DE PRODUCTOS
-- Permite controlar el fraccionamiento de productos a granel
-- en presentaciones más pequeñas (menudeo), con seguimiento
-- independiente del stock principal de inventario.
--
-- DISEÑO:
--   inv_men_forma         → Catálogo maestro de formas ("Frasco 10ml", "Funda 500g")
--   inv_men_forma_insumo  → Insumos/envases por forma (globales, se definen 1 vez)
--   inv_men_tipo_comp     → Tipo comprobante menudeo (Ingreso/Egreso con signo)
--   inv_men_tipo_tran     → Tipo transacción menudeo (SI, MEN, FAC, REV, AJU)
--   inv_men_presentacion  → Vínculo producto ↔ forma (asigna qué formas aplican a cada producto)
--   inv_cab_menudeo       → Cabecera de comprobante de menudeo/ajuste
--   inv_det_menudeo       → Detalle de presentaciones fraccionadas
-- ============================================================

-- ============================================================
-- 1. FORMAS DE MENUDEO (CATÁLOGO MAESTRO)
--    Define las formas/presentaciones reutilizables.
--    Ej: "Frasco 10ml", "Frasco 50ml", "Funda 500g", "Funda 1kg"
--    Se definen UNA VEZ y se reusan en múltiples productos.
-- ============================================================
CREATE TABLE "public"."inv_men_forma" (
    "ide_inmfor"         int8         NOT NULL,
    "ide_empr"           int8         NOT NULL,
    "ide_inuni"          int8,                     -- Unidad de la forma (ml, g, unidad)
    "nombre_inmfor"      varchar(150) NOT NULL,    -- Ej: "Frasco 10ml", "Funda 500g"
    "cant_base_inmfor"   numeric(12,6) NOT NULL,   -- Cant. del producto base por defecto por unidad de forma
    "descripcion_inmfor" varchar(300),
    "activo_inmfor"      bool         DEFAULT true,
    "usuario_ingre"      varchar(50),
    "fecha_ingre"        date,
    "hora_ingre"         time,
    "usuario_actua"      varchar(50),
    "fecha_actua"        date,
    "hora_actua"         time,
    CONSTRAINT "inv_men_forma_pkey"            PRIMARY KEY ("ide_inmfor"),
    CONSTRAINT "inv_men_forma_ide_empr_fkey"
        FOREIGN KEY ("ide_empr") REFERENCES "public"."sis_empresa"("ide_empr")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inv_men_forma_ide_inuni_fkey"
        FOREIGN KEY ("ide_inuni") REFERENCES "public"."inv_unidad"("ide_inuni")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);
COMMENT ON TABLE  "public"."inv_men_forma" IS 'Catálogo maestro de formas/presentaciones de menudeo reutilizables (Frasco 10ml, Funda 500g, etc.)';
COMMENT ON COLUMN "public"."inv_men_forma"."cant_base_inmfor" IS 'Cantidad del producto base (en su unidad) consumida por defecto por cada unidad de esta forma. Ej: 0.0095 kg por cada frasco de 10ml';

-- ============================================================
-- 2. INSUMOS POR FORMA (GLOBALES)
--    Materiales de empaque/envases requeridos por forma.
--    Ej: 1 botella de vidrio 10ml por cada "Frasco 10ml".
--    Se definen UNA VEZ y aplican a TODOS los productos que
--    usen esa forma. Generan comprobante de egreso en inventario.
-- ============================================================
CREATE TABLE "public"."inv_men_forma_insumo" (
    "ide_inmfin"         int8         NOT NULL,
    "ide_inmfor"         int8         NOT NULL,    -- FK → forma
    "ide_inarti"         int8         NOT NULL,    -- Producto insumo/envase (artículo de inventario)
    "cantidad_inmfin"    numeric(12,4) NOT NULL,   -- Cantidad de insumo por unidad de forma
    "observacion_inmfin" varchar(300),
    "usuario_ingre"      varchar(50),
    "fecha_ingre"        date,
    "hora_ingre"         time,
    "usuario_actua"      varchar(50),
    "fecha_actua"        date,
    "hora_actua"         time,
    CONSTRAINT "inv_men_forma_insumo_pkey"          PRIMARY KEY ("ide_inmfin"),
    CONSTRAINT "inv_men_forma_insumo_ide_inmfor_fkey"
        FOREIGN KEY ("ide_inmfor") REFERENCES "public"."inv_men_forma"("ide_inmfor")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inv_men_forma_insumo_ide_inarti_fkey"
        FOREIGN KEY ("ide_inarti") REFERENCES "public"."inv_articulo"("ide_inarti")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);
COMMENT ON TABLE  "public"."inv_men_forma_insumo" IS 'Insumos/envases requeridos por forma de menudeo. Son globales y aplican a todos los productos que usen la forma. Generan egreso en inventario al fraccionar.';
COMMENT ON COLUMN "public"."inv_men_forma_insumo"."cantidad_inmfin" IS 'Cantidad del insumo por unidad de forma. Ej: 1 botella de vidrio por cada frasco 10ml';

-- ============================================================
-- 3. TIPO COMPROBANTE MENUDEO
--    Define la NATURALEZA del comprobante: Ingreso o Egreso,
--    con su respectivo signo. Sigue el mismo patrón que
--    inv_tip_comp_inve del módulo de inventario.
-- ============================================================
CREATE TABLE "public"."inv_men_tipo_comp" (
    "ide_inmtc"          int8         NOT NULL,
    "ide_empr"           int8         NOT NULL,
    "nombre_inmtc"       varchar(100) NOT NULL,    -- "Ingreso Menudeo", "Egreso Menudeo"
    "signo_inmtc"        int2         NOT NULL,    -- 1 = incrementa, -1 = decrementa stock presentación
    "activo_inmtc"       bool         DEFAULT true,
    "usuario_ingre"      varchar(50),
    "fecha_ingre"        date,
    "hora_ingre"         time,
    "usuario_actua"      varchar(50),
    "fecha_actua"        date,
    "hora_actua"         time,
    CONSTRAINT "inv_men_tipo_comp_pkey"        PRIMARY KEY ("ide_inmtc"),
    CONSTRAINT "inv_men_tipo_comp_ide_empr_fkey"
        FOREIGN KEY ("ide_empr") REFERENCES "public"."sis_empresa"("ide_empr")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inv_men_tipo_comp_signo_check"
        CHECK ("signo_inmtc" IN (1, -1))
);
COMMENT ON TABLE  "public"."inv_men_tipo_comp" IS 'Tipo de comprobante de menudeo: define la naturaleza (Ingreso/Egreso) y el signo (+1/-1). Equivalente a inv_tip_comp_inve.';
COMMENT ON COLUMN "public"."inv_men_tipo_comp"."signo_inmtc" IS '1=Incrementa stock de presentación (ingreso), -1=Reduce stock de presentación (egreso)';

-- ============================================================
-- 4. TIPO TRANSACCIÓN MENUDEO
--    Tipos específicos de operación. Cada tipo pertenece a un
--    tipo_comp que determina su signo. Sigue el mismo patrón
--    que inv_tip_tran_inve del módulo de inventario.
--
--    Ejemplos:
--      Saldo Inicial              → Ingreso (signo +1)
--      Menudeo/Fraccionamiento    → Ingreso (signo +1), genera egreso insumos
--      Venta/Factura              → Egreso  (signo -1), genera egreso prod. base
--      Reverso Egreso (rev.fac.)  → Ingreso (signo +1)
--      Reverso Ingreso (rev.men.) → Egreso  (signo -1)
--      Ajuste Ingreso             → Ingreso (signo +1)
--      Ajuste Egreso              → Egreso  (signo -1)
-- ============================================================
CREATE TABLE "public"."inv_men_tipo_tran" (
    "ide_inmtt"                    int8         NOT NULL,
    "ide_inmtc"                    int8         NOT NULL,    -- FK → tipo_comp (determina signo)
    "ide_empr"                     int8         NOT NULL,
    "ide_intti"                    int8,                     -- FK → inv_tip_tran_inve (tipo trans. inventario para generar comprobantes)
    "nombre_inmtt"                 varchar(100) NOT NULL,    -- Nombre descriptivo
    "sigla_inmtt"                  varchar(10)  NOT NULL,    -- Código corto: SI, MEN, FAC, REV, AJU
    "genera_egreso_base_inmtt"     bool         DEFAULT false, -- Si genera egreso del PRODUCTO BASE en inventario (ej: FAC)
    "genera_egreso_insumo_inmtt"   bool         DEFAULT false, -- Si genera egreso de INSUMOS/ENVASES en inventario (ej: MEN)
    "activo_inmtt"                 bool         DEFAULT true,
    "usuario_ingre"                varchar(50),
    "fecha_ingre"                  date,
    "hora_ingre"                   time,
    "usuario_actua"                varchar(50),
    "fecha_actua"                  date,
    "hora_actua"                   time,
    CONSTRAINT "inv_men_tipo_tran_pkey"        PRIMARY KEY ("ide_inmtt"),
    CONSTRAINT "inv_men_tipo_tran_ide_inmtc_fkey"
        FOREIGN KEY ("ide_inmtc") REFERENCES "public"."inv_men_tipo_comp"("ide_inmtc")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inv_men_tipo_tran_ide_empr_fkey"
        FOREIGN KEY ("ide_empr") REFERENCES "public"."sis_empresa"("ide_empr")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inv_men_tipo_tran_ide_intti_fkey"
        FOREIGN KEY ("ide_intti") REFERENCES "public"."inv_tip_tran_inve"("ide_intti")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);
COMMENT ON TABLE  "public"."inv_men_tipo_tran" IS 'Tipos de transacción de menudeo. Cada tipo pertenece a un tipo_comp que determina su signo. Equivalente a inv_tip_tran_inve.';
COMMENT ON COLUMN "public"."inv_men_tipo_tran"."ide_intti" IS 'Tipo de transacción de inventario a usar cuando se genera automáticamente un comprobante de inventario';
COMMENT ON COLUMN "public"."inv_men_tipo_tran"."genera_egreso_base_inmtt"   IS 'true: al guardar, genera egreso del producto base en inventario (ej: Venta/Factura)';
COMMENT ON COLUMN "public"."inv_men_tipo_tran"."genera_egreso_insumo_inmtt" IS 'true: al guardar, genera egreso de insumos/envases en inventario (ej: Menudeo/Fraccionamiento)';

-- ============================================================
-- 5. PRESENTACIÓN = VÍNCULO PRODUCTO ↔ FORMA
--    Asigna qué formas de menudeo aplican a cada producto base.
--    Permite sobreescribir cant_base_inmpre si un producto
--    específico consume diferente cantidad del producto base.
--    Ej: "Fragancia Lavanda" + "Frasco 10ml" → consume 0.0095 kg
--        "Aceite de Coco"    + "Frasco 10ml" → consume 0.0100 kg
-- ============================================================
CREATE TABLE "public"."inv_men_presentacion" (
    "ide_inmpre"         int8         NOT NULL,
    "ide_inarti"         int8         NOT NULL,    -- Producto base (kg, litro, etc.)
    "ide_inmfor"         int8         NOT NULL,    -- FK → forma de menudeo
    "ide_empr"           int8         NOT NULL,
    "cant_base_inmpre"   numeric(12,6),            -- Override: NULL = usa cant_base_inmfor de la forma
    "stock_minimo_inmpre" numeric(12,3) DEFAULT 0,  -- Stock mínimo de alerta: si saldo < este valor se genera alerta
    "stock_ideal_inmpre"  numeric(12,3) DEFAULT 0,  -- Stock ideal al que se debería reponer
    "observacion_inmpre" varchar(300),
    "activo_inmpre"      bool         DEFAULT true,
    "usuario_ingre"      varchar(50),
    "fecha_ingre"        date,
    "hora_ingre"         time,
    "usuario_actua"      varchar(50),
    "fecha_actua"        date,
    "hora_actua"         time,
    CONSTRAINT "inv_men_presentacion_pkey"         PRIMARY KEY ("ide_inmpre"),
    CONSTRAINT "inv_men_presentacion_ide_inarti_fkey"
        FOREIGN KEY ("ide_inarti") REFERENCES "public"."inv_articulo"("ide_inarti")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inv_men_presentacion_ide_inmfor_fkey"
        FOREIGN KEY ("ide_inmfor") REFERENCES "public"."inv_men_forma"("ide_inmfor")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inv_men_presentacion_ide_empr_fkey"
        FOREIGN KEY ("ide_empr") REFERENCES "public"."sis_empresa"("ide_empr")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inv_men_presentacion_uq_inarti_inmfor"
        UNIQUE ("ide_inarti", "ide_inmfor")  -- Un producto solo puede tener una vez cada forma
);
COMMENT ON TABLE  "public"."inv_men_presentacion" IS 'Vínculo producto ↔ forma de menudeo. Asigna qué formas aplican a cada producto base.';
COMMENT ON COLUMN "public"."inv_men_presentacion"."cant_base_inmpre"    IS 'Override de cant_base_inmfor para este producto específico. Si es NULL usa el valor por defecto de la forma.';
COMMENT ON COLUMN "public"."inv_men_presentacion"."stock_minimo_inmpre" IS 'Stock mínimo de presentación. Si el saldo cae por debajo se genera alerta de reposición.';
COMMENT ON COLUMN "public"."inv_men_presentacion"."stock_ideal_inmpre"  IS 'Stock ideal al que se debería reponer la presentación al fraccionarla.';

-- ============================================================
-- 6. CABECERA COMPROBANTE DE MENUDEO
--    Registra cada operación de fraccionamiento, venta, ajuste
--    o reverso. El tipo de transacción (ide_inmtt) determina
--    el comportamiento y signo del comprobante.
--
-- Relaciones clave:
--    ide_inmtt      → Tipo de transacción (SI, MEN, FAC, REV, AJU) → signo
--    ide_incci      → Comprobante de inventario generado (egreso base o insumos)
--    ide_cccfa      → Factura que originó el movimiento (solo para tipo FAC)
--    ide_incmen_ref → Comprobante de menudeo de referencia (para reversos)
-- ============================================================
CREATE TABLE "public"."inv_cab_menudeo" (
    "ide_incmen"         int8         NOT NULL,
    "ide_inmtt"          int8         NOT NULL,    -- FK → tipo transacción menudeo (determina signo y comportamiento)
    "ide_empr"           int8         NOT NULL,
    "ide_sucu"           int8,
    "numero_incmen"      varchar(20),              -- Número secuencial del comprobante
    "fecha_incmen"       date         NOT NULL,
    "observacion_incmen" varchar(300),
    "estado_incmen"      int2         NOT NULL DEFAULT 1, -- 1=Activo, 0=Anulado
    "ide_incci"          int8,                     -- FK → Comprobante inventario generado (egreso base o insumos)
    "ide_cccfa"          int8,                     -- FK → Factura que originó el movimiento (nullable, solo tipo FAC)
    "ide_incmen_ref"     int8,                     -- Self-FK → Comprobante menudeo de referencia (para reversos)
    "usuario_ingre"      varchar(50),
    "fecha_ingre"        date,
    "hora_ingre"         time,
    "usuario_actua"      varchar(50),
    "fecha_actua"        date,
    "hora_actua"         time,
    CONSTRAINT "inv_cab_menudeo_pkey"          PRIMARY KEY ("ide_incmen"),
    CONSTRAINT "inv_cab_menudeo_ide_inarti_fkey"
        FOREIGN KEY ("ide_inarti") REFERENCES "public"."inv_articulo"("ide_inarti")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inv_cab_menudeo_ide_inmtt_fkey"
        FOREIGN KEY ("ide_inmtt") REFERENCES "public"."inv_men_tipo_tran"("ide_inmtt")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inv_cab_menudeo_ide_empr_fkey"
        FOREIGN KEY ("ide_empr") REFERENCES "public"."sis_empresa"("ide_empr")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inv_cab_menudeo_ide_sucu_fkey"
        FOREIGN KEY ("ide_sucu") REFERENCES "public"."sis_sucursal"("ide_sucu")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inv_cab_menudeo_ide_incci_fkey"
        FOREIGN KEY ("ide_incci") REFERENCES "public"."inv_cab_comp_inve"("ide_incci")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inv_cab_menudeo_ide_cccfa_fkey"
        FOREIGN KEY ("ide_cccfa") REFERENCES "public"."cxc_cabece_factura"("ide_cccfa")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inv_cab_menudeo_ide_incmen_ref_fkey"
        FOREIGN KEY ("ide_incmen_ref") REFERENCES "public"."inv_cab_menudeo"("ide_incmen")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);
COMMENT ON TABLE  "public"."inv_cab_menudeo" IS 'Cabecera de comprobantes de menudeo/fraccionamiento de productos';
COMMENT ON COLUMN "public"."inv_cab_menudeo"."ide_inmtt"      IS 'Tipo de transacción: Saldo Inicial, Menudeo, Factura, Reverso, Ajuste. Determina signo y comportamiento.';
COMMENT ON COLUMN "public"."inv_cab_menudeo"."estado_incmen"  IS '1=Activo, 0=Anulado';
COMMENT ON COLUMN "public"."inv_cab_menudeo"."ide_incci"      IS 'Comprobante de inventario generado automáticamente (egreso de producto base o de insumos/envases)';
COMMENT ON COLUMN "public"."inv_cab_menudeo"."ide_cccfa"      IS 'Factura de venta que originó este movimiento (solo para tipo FAC)';
COMMENT ON COLUMN "public"."inv_cab_menudeo"."ide_incmen_ref" IS 'Comprobante de menudeo de referencia, usado en reversos para vincular al comprobante original';

-- ============================================================
-- 7. DETALLE COMPROBANTE DE MENUDEO
--    Líneas con las presentaciones y cantidades fraccionadas.
-- ============================================================
CREATE TABLE "public"."inv_det_menudeo" (
    "ide_indmen"         int8         NOT NULL,
    "ide_incmen"         int8         NOT NULL,    -- FK → cabecera
    "ide_inmpre"         int8         NOT NULL,    -- FK → presentación (vínculo producto-forma)
    "cantidad_indmen"    numeric(12,3) NOT NULL,   -- Unidades de presentación hechas/ajustadas
    "cant_base_indmen"   numeric(12,6) NOT NULL,   -- Cantidad base consumida (= cant * cant_base)
    "observacion_indmen" varchar(300),
    "usuario_ingre"      varchar(50),
    "fecha_ingre"        date,
    "hora_ingre"         time,
    "usuario_actua"      varchar(50),
    "fecha_actua"        date,
    "hora_actua"         time,
    CONSTRAINT "inv_det_menudeo_pkey"          PRIMARY KEY ("ide_indmen"),
    CONSTRAINT "inv_det_menudeo_ide_incmen_fkey"
        FOREIGN KEY ("ide_incmen") REFERENCES "public"."inv_cab_menudeo"("ide_incmen")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inv_det_menudeo_ide_inmpre_fkey"
        FOREIGN KEY ("ide_inmpre") REFERENCES "public"."inv_men_presentacion"("ide_inmpre")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);
COMMENT ON TABLE  "public"."inv_det_menudeo" IS 'Detalle de presentaciones fraccionadas en cada comprobante de menudeo';
COMMENT ON COLUMN "public"."inv_det_menudeo"."cantidad_indmen"  IS 'Unidades de la presentación producidas o ajustadas';
COMMENT ON COLUMN "public"."inv_det_menudeo"."cant_base_indmen" IS 'Cantidad del producto base utilizada (= cantidad_indmen * COALESCE(cant_base_inmpre, cant_base_inmfor))';

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX "idx_inv_men_forma_empr"           ON "public"."inv_men_forma"          ("ide_empr");
CREATE INDEX "idx_inv_men_forma_insumo_inmfor"  ON "public"."inv_men_forma_insumo"   ("ide_inmfor");
CREATE INDEX "idx_inv_men_tipo_comp_empr"       ON "public"."inv_men_tipo_comp"      ("ide_empr");
CREATE INDEX "idx_inv_men_tipo_tran_inmtc"      ON "public"."inv_men_tipo_tran"      ("ide_inmtc");
CREATE INDEX "idx_inv_men_tipo_tran_empr"       ON "public"."inv_men_tipo_tran"      ("ide_empr");
CREATE INDEX "idx_inv_men_presentacion_inarti"  ON "public"."inv_men_presentacion"   ("ide_inarti");
CREATE INDEX "idx_inv_men_presentacion_inmfor"  ON "public"."inv_men_presentacion"   ("ide_inmfor");
CREATE INDEX "idx_inv_cab_menudeo_inarti"       ON "public"."inv_cab_menudeo"        ("ide_inarti","ide_empr");
CREATE INDEX "idx_inv_cab_menudeo_fecha"        ON "public"."inv_cab_menudeo"        ("fecha_incmen");
CREATE INDEX "idx_inv_cab_menudeo_inmtt"        ON "public"."inv_cab_menudeo"        ("ide_inmtt");
CREATE INDEX "idx_inv_cab_menudeo_cccfa"        ON "public"."inv_cab_menudeo"        ("ide_cccfa");
CREATE INDEX "idx_inv_cab_menudeo_ref"          ON "public"."inv_cab_menudeo"        ("ide_incmen_ref");
CREATE INDEX "idx_inv_det_menudeo_incmen"       ON "public"."inv_det_menudeo"        ("ide_incmen");
CREATE INDEX "idx_inv_det_menudeo_inmpre"       ON "public"."inv_det_menudeo"        ("ide_inmpre");

-- ============================================================
-- DATOS INICIALES (personalizar ide_empr según la empresa)
-- ============================================================
-- Tipo Comprobante: Ingreso y Egreso
 INSERT INTO "public"."inv_men_tipo_comp" ("ide_inmtc","ide_empr","nombre_inmtc","signo_inmtc","activo_inmtc") VALUES
  (1, 0, 'Ingreso Menudeo', 1, true),
   (2, 0, 'Egreso Menudeo', -1, true);

--
-- Tipo Transacción: Tipos específicos de operación
 INSERT INTO "public"."inv_men_tipo_tran" ("ide_inmtt","ide_inmtc","ide_empr","ide_intti","nombre_inmtt","sigla_inmtt","genera_egreso_base_inmtt","genera_egreso_insumo_inmtt","activo_inmtt") VALUES
   (1, 1, 0, NULL, 'Saldo Inicial',             'SI',  false, false, true),
   (2, 1, 0, NULL, 'Menudeo/Fraccionamiento',   'MEN', false, true,  true),
   (3, 2, 0, NULL, 'Venta/Factura',             'FAC', true,  false, true),
   (4, 1, 0, NULL, 'Reverso Egreso',            'REV', false, false, true),
   (5, 2, 0, NULL, 'Reverso Ingreso',           'REV', false, false, true),
   (6, 1, 0, NULL, 'Ajuste Ingreso',            'AJU', false, false, true),
   (7, 2, 0, NULL, 'Ajuste Egreso',             'AJU', false, false, true);

-- ============================================================
-- FUNCIONES
-- ============================================================

/**
 * f_copiar_men_presentacion
 *
 * Copia la configuración de presentaciones de menudeo de un producto origen
 * a uno o varios productos destino.
 * Solo se copian las presentaciones activas del origen.
 * Si el destino ya tiene asignada la misma forma, se omite (sin error).
 *
 * Ejemplo: SELECT f_copiar_men_presentacion(1, ARRAY[2, 3, 4]::integer[], 1, 'admin');
 */
CREATE OR REPLACE FUNCTION f_copiar_men_presentacion(
    p_ide_inarti_origen  INT,
    p_ide_inarti_destino INT[],
    p_ide_empr           BIGINT,
    p_login              TEXT DEFAULT 'sa'
)
RETURNS INT AS $$
DECLARE
    v_pres          RECORD;
    v_seq_id        INT;
    v_nombre_origen TEXT;
    v_count         INT;
    v_total_copied  INT := 0;
    v_existe        INT;
BEGIN
    -- Validar que el artículo origen exista
    SELECT COUNT(1) INTO v_count FROM inv_articulo WHERE ide_inarti = p_ide_inarti_origen;
    IF v_count = 0 THEN
        RAISE EXCEPTION 'El artículo origen con ID % no existe', p_ide_inarti_origen;
    END IF;

    SELECT nombre_inarti INTO v_nombre_origen FROM inv_articulo WHERE ide_inarti = p_ide_inarti_origen;

    FOR i IN 1..array_length(p_ide_inarti_destino, 1) LOOP
        -- Validar que el artículo destino exista
        SELECT COUNT(1) INTO v_count FROM inv_articulo WHERE ide_inarti = p_ide_inarti_destino[i];
        IF v_count = 0 THEN
            RAISE NOTICE 'El artículo destino con ID % no existe, se omite', p_ide_inarti_destino[i];
            CONTINUE;
        END IF;

        -- Saltarse el mismo producto
        IF p_ide_inarti_destino[i] = p_ide_inarti_origen THEN
            RAISE NOTICE 'El artículo destino % es igual al origen, se omite', p_ide_inarti_destino[i];
            CONTINUE;
        END IF;

        -- Copiar cada presentación activa del origen
        FOR v_pres IN
            SELECT ide_inmfor, cant_base_inmpre, stock_minimo_inmpre, stock_ideal_inmpre, observacion_inmpre
            FROM inv_men_presentacion
            WHERE ide_inarti = p_ide_inarti_origen
              AND activo_inmpre = true
        LOOP
            -- Verificar si el destino ya tiene esa forma asignada
            SELECT COUNT(1) INTO v_existe
            FROM inv_men_presentacion
            WHERE ide_inarti = p_ide_inarti_destino[i]
              AND ide_inmfor  = v_pres.ide_inmfor;

            IF v_existe > 0 THEN
                RAISE NOTICE 'El artículo % ya tiene asignada la forma %, se omite',
                    p_ide_inarti_destino[i], v_pres.ide_inmfor;
                CONTINUE;
            END IF;

            v_seq_id := get_seq_table('inv_men_presentacion', 'ide_inmpre', 1, p_login);

            INSERT INTO inv_men_presentacion (
                ide_inmpre, ide_inarti, ide_inmfor, ide_empr,
                cant_base_inmpre, stock_minimo_inmpre, stock_ideal_inmpre,
                observacion_inmpre, activo_inmpre,
                usuario_ingre, fecha_ingre, hora_ingre
            ) VALUES (
                v_seq_id, p_ide_inarti_destino[i], v_pres.ide_inmfor, p_ide_empr,
                v_pres.cant_base_inmpre, v_pres.stock_minimo_inmpre, v_pres.stock_ideal_inmpre,
                'Copiado desde ' || p_ide_inarti_origen || ' - ' || v_nombre_origen,
                true,
                p_login, CURRENT_DATE, CURRENT_TIME
            );

            v_total_copied := v_total_copied + 1;
        END LOOP;

        RAISE NOTICE 'Presentaciones copiadas al artículo %', p_ide_inarti_destino[i];
    END LOOP;

    RETURN v_total_copied;
END;
$$ LANGUAGE plpgsql;

   (7, 2, 0, NULL, 'Ajuste Egreso',             'AJU', false, false, true);