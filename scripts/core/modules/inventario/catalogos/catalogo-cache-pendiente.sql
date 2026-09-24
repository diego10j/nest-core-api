-- ============================================================
-- CACHÉ DE CATÁLOGOS — REGISTRO DE PRODUCTOS PENDIENTES DE REFRESCO
--
-- Detalle completo: src/core/modules/inventario/catalogos/README-CACHE-CATALOGOS.md
--
-- Qué hace:
--   Cada vez que cambia algo que afecta a lo que muestra un catálogo público
--   (stock, costo PPMP, configuración de precio o datos del producto), un trigger
--   anota el ide_inarti en inv_catalogo_pendiente — SOLO si el artículo está en
--   algún catálogo. Nest (CatalogosCacheService) lee esa tabla cada
--   p_inv_catalogo_refresco_min minutos con el pool normal (compatible con
--   PgBouncer), recalcula los catálogos afectados en Redis y borra lo procesado.
--
-- Por qué una tabla y no pg_notify: LISTEN necesita una conexión exclusiva y
-- persistente, que no funciona a través de PgBouncer en modo transacción.
--
-- Por qué en la BD y no en los endpoints: sigafi (sistema anterior) también escribe
-- en inventario (p. ej. anulaciones); un trigger ve todas las escrituras.
--
-- Diseño para no afectar la facturación:
--   * Solo INSERT de filas nuevas (sin UPDATE, sin UNIQUE, sin ON CONFLICT): dos
--     transacciones concurrentes nunca se esperan entre sí por este trigger.
--   * Transaccional: si la factura hace ROLLBACK, la fila anotada desaparece con ella.
--   * No toca trg_kardex_ppmp. Nest lee después del COMMIT, cuando el costo PPMP
--     ya fue recalculado por ese trigger.
--
-- Orden de ejecución: 1) este script  2) desplegar nest-core-api.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tabla de pendientes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inv_catalogo_pendiente (
    ide_incpe    BIGSERIAL    PRIMARY KEY,
    ide_inarti   BIGINT       NOT NULL,
    origen_incpe VARCHAR(40)  NOT NULL,             -- tabla que originó el cambio (diagnóstico)
    fecha_ingre  TIMESTAMP    NOT NULL DEFAULT now()
);

COMMENT ON TABLE inv_catalogo_pendiente IS
    'Artículos de catálogo con cambios pendientes de refrescar en la caché Redis. La llena fn_trg_catalogo_pendiente y la vacía CatalogosCacheService (nest-core-api).';

-- ------------------------------------------------------------
-- 2. Índice para el EXISTS del trigger (una búsqueda por fila de movimiento)
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_inv_det_catalogo_inarti ON inv_det_catalogo (ide_inarti);

-- ------------------------------------------------------------
-- 3. Función del trigger
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_trg_catalogo_pendiente()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_art BIGINT;
BEGIN
    -- Anulación / reactivación de un comprobante (ERP o sigafi): cambia la cabecera,
    -- no las líneas, así que se anotan todos los artículos de catálogo del comprobante.
    IF TG_TABLE_NAME = 'inv_cab_comp_inve' THEN
        INSERT INTO inv_catalogo_pendiente (ide_inarti, origen_incpe)
        SELECT DISTINCT dci.ide_inarti, TG_TABLE_NAME
        FROM inv_det_comp_inve dci
        WHERE dci.ide_incci = NEW.ide_incci
          AND dci.ide_inarti IS NOT NULL
          AND EXISTS (SELECT 1 FROM inv_det_catalogo d WHERE d.ide_inarti = dci.ide_inarti);
        RETURN NULL;
    END IF;

    -- Líneas de movimiento, configuración de precio o producto: un artículo por fila.
    v_art := CASE WHEN TG_OP = 'DELETE' THEN OLD.ide_inarti ELSE NEW.ide_inarti END;
    IF v_art IS NOT NULL
       AND EXISTS (SELECT 1 FROM inv_det_catalogo WHERE ide_inarti = v_art) THEN
        INSERT INTO inv_catalogo_pendiente (ide_inarti, origen_incpe) VALUES (v_art, TG_TABLE_NAME);
    END IF;

    -- Si un UPDATE cambió el artículo de la fila, también cambió el stock del anterior.
    IF TG_OP = 'UPDATE'
       AND OLD.ide_inarti IS NOT NULL
       AND OLD.ide_inarti IS DISTINCT FROM NEW.ide_inarti
       AND EXISTS (SELECT 1 FROM inv_det_catalogo WHERE ide_inarti = OLD.ide_inarti) THEN
        INSERT INTO inv_catalogo_pendiente (ide_inarti, origen_incpe) VALUES (OLD.ide_inarti, TG_TABLE_NAME);
    END IF;

    RETURN NULL; -- trigger AFTER: el valor de retorno se ignora
END;
$$;

-- ------------------------------------------------------------
-- 4. Triggers
-- ------------------------------------------------------------

-- Movimientos de inventario: compras, ventas, NC, ajustes, egresos (cambia stock y costo PPMP)
DROP TRIGGER IF EXISTS trg_catalogo_pendiente_det ON inv_det_comp_inve;
CREATE TRIGGER trg_catalogo_pendiente_det
    AFTER INSERT OR UPDATE OR DELETE ON inv_det_comp_inve
    FOR EACH ROW EXECUTE FUNCTION fn_trg_catalogo_pendiente();

-- Anulación / reactivación del comprobante (solo si realmente cambia el estado)
DROP TRIGGER IF EXISTS trg_catalogo_pendiente_cab ON inv_cab_comp_inve;
CREATE TRIGGER trg_catalogo_pendiente_cab
    AFTER UPDATE OF ide_inepi ON inv_cab_comp_inve
    FOR EACH ROW
    WHEN (OLD.ide_inepi IS DISTINCT FROM NEW.ide_inepi)
    EXECUTE FUNCTION fn_trg_catalogo_pendiente();

-- Configuración de precios (precio fijo o % de utilidad)
DROP TRIGGER IF EXISTS trg_catalogo_pendiente_precio ON inv_conf_precios_articulo;
CREATE TRIGGER trg_catalogo_pendiente_precio
    AFTER INSERT OR UPDATE OR DELETE ON inv_conf_precios_articulo
    FOR EACH ROW EXECUTE FUNCTION fn_trg_catalogo_pendiente();

-- Datos del producto visibles en el catálogo. Solo estas columnas: contadores como
-- total_vistas_inarti no disparan el trigger.
DROP TRIGGER IF EXISTS trg_catalogo_pendiente_art ON inv_articulo;
CREATE TRIGGER trg_catalogo_pendiente_art
    AFTER UPDATE OF nombre_inarti, otro_nombre_inarti, foto_inarti, fotos_inarti,
                    activo_inarti, desc_corta_inarti, publicacion_inarti, url_inarti,
                    notas_inarti, ide_inuni, decim_stock_inarti, hace_kardex_inarti
    ON inv_articulo
    FOR EACH ROW EXECUTE FUNCTION fn_trg_catalogo_pendiente();

-- ============================================================
-- CONSULTAS DE DIAGNÓSTICO
-- ============================================================
-- Pendientes acumulados (normalmente 0 filas justo después de cada refresco):
--   SELECT ide_inarti, origen_incpe, COUNT(*), MIN(fecha_ingre), MAX(fecha_ingre)
--   FROM inv_catalogo_pendiente GROUP BY 1, 2 ORDER BY 4;
--
-- Triggers instalados:
--   SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname LIKE 'trg_catalogo_pendiente%';

-- ============================================================
-- REVERSIÓN (ejecutar solo si se quiere retirar la funcionalidad)
-- ============================================================
-- DROP TRIGGER IF EXISTS trg_catalogo_pendiente_det    ON inv_det_comp_inve;
-- DROP TRIGGER IF EXISTS trg_catalogo_pendiente_cab    ON inv_cab_comp_inve;
-- DROP TRIGGER IF EXISTS trg_catalogo_pendiente_precio ON inv_conf_precios_articulo;
-- DROP TRIGGER IF EXISTS trg_catalogo_pendiente_art    ON inv_articulo;
-- DROP FUNCTION IF EXISTS fn_trg_catalogo_pendiente();
-- DROP TABLE IF EXISTS inv_catalogo_pendiente;
