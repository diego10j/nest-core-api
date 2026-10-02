-- ============================================================================
-- Historial de configuraciones de precios de venta (inv_conf_precios_articulo)
--
-- Guarda cada alta, cambio o baja de una configuración con el costo promedio (PPM) vigente en ese momento, y la
-- utilidad / precio equivalentes. Así se puede ver con el tiempo si los precios y márgenes suben o bajan frente al costo.
--
--  * Trigger  : registra INSERT / UPDATE / DELETE sin importar desde dónde se hizo el cambio (pantalla, IA, SQL).
--  * Snapshot : f_inv_conf_precios_snapshot() toma una foto de todas las configuraciones vigentes con el costo de hoy
--               (para seguir el costo aunque nadie edite la configuración). Se puede programar a diario.
--
-- Este script lo ejecuta el usuario; es idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS inv_conf_precios_hist (
    ide_inchp            bigserial PRIMARY KEY,
    ide_incpa            integer       NOT NULL,
    ide_inarti           integer,
    ide_empr             integer,
    accion               varchar(10)   NOT NULL,   -- INSERT | UPDATE | DELETE | SNAPSHOT
    fecha_inchp          timestamp     NOT NULL DEFAULT now(),
    usuario_inchp        varchar(100),
    -- Estado de la configuración después del cambio (en DELETE, el último estado)
    ide_cncfp            integer,
    ide_cndfp            integer,
    rangos_incpa         boolean,
    rango1_cant_incpa    numeric,
    rango2_cant_incpa    numeric,
    rango_infinito_incpa boolean,
    precio_fijo_incpa    numeric,
    porcentaje_util_incpa numeric,
    incluye_iva_incpa    boolean,
    activo_incpa         boolean,
    autorizado_incpa     boolean,
    observacion_incpa    varchar(200),
    -- Valores anteriores (solo UPDATE)
    precio_fijo_prev     numeric,
    porcentaje_util_prev numeric,
    activo_prev          boolean,
    autorizado_prev      boolean,
    -- Contexto del costo en ese momento
    costo_ppm            numeric,
    utilidad_pct         numeric,   -- % de utilidad equivalente sobre el costo (sin IVA)
    precio_sin_iva       numeric    -- precio sin IVA equivalente con ese costo
);

CREATE INDEX IF NOT EXISTS idx_inchp_arti_fecha ON inv_conf_precios_hist (ide_inarti, fecha_inchp DESC);
CREATE INDEX IF NOT EXISTS idx_inchp_incpa_fecha ON inv_conf_precios_hist (ide_incpa, fecha_inchp DESC);
CREATE INDEX IF NOT EXISTS idx_inchp_fecha ON inv_conf_precios_hist (fecha_inchp DESC);

-- ----------------------------------------------------------------------------
-- Costo, utilidad y precio equivalentes de una configuración
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION f_inv_conf_precios_equivalencias(
    p_ide_empr   integer,
    p_ide_sucu   integer,
    p_ide_inarti integer,
    p_porcentaje numeric,
    p_precio     numeric,
    p_incluye_iva boolean,
    p_tarifa_iva numeric DEFAULT 0.15
) RETURNS TABLE (costo numeric, utilidad_pct numeric, precio_sin_iva numeric)
LANGUAGE plpgsql AS $$
DECLARE
    v_costo numeric;
    v_precio numeric;
BEGIN
    BEGIN
        SELECT p.costo_unitario INTO v_costo
        FROM f_costo_unitario_ppmp(p_ide_empr, COALESCE(p_ide_sucu, 0), p_ide_inarti, CURRENT_DATE) p
        LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
        v_costo := NULL;
    END;

    IF v_costo IS NOT NULL AND v_costo <= 0 THEN
        v_costo := NULL;
    END IF;

    IF p_precio IS NOT NULL THEN
        v_precio := p_precio / CASE WHEN COALESCE(p_incluye_iva, false) THEN 1 + p_tarifa_iva ELSE 1 END;
        RETURN QUERY SELECT v_costo,
                            CASE WHEN v_costo IS NULL THEN NULL ELSE round(((v_precio - v_costo) / v_costo) * 100, 2) END,
                            round(v_precio, 4);
    ELSE
        RETURN QUERY SELECT v_costo,
                            p_porcentaje,
                            CASE WHEN v_costo IS NULL OR p_porcentaje IS NULL THEN NULL
                                 ELSE round(v_costo * (1 + p_porcentaje / 100), 4) END;
    END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- Trigger: registra los cambios
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION f_inv_conf_precios_hist_trg() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    r        inv_conf_precios_articulo%ROWTYPE;
    v_eq     RECORD;
    v_usuario varchar(100);
BEGIN
    IF TG_OP = 'DELETE' THEN
        r := OLD;
    ELSE
        r := NEW;
    END IF;

    -- Un UPDATE que no cambia nada relevante (p. ej. solo auditoría) no se registra
    IF TG_OP = 'UPDATE' AND
       (OLD.precio_fijo_incpa, OLD.porcentaje_util_incpa, OLD.activo_incpa, OLD.autorizado_incpa, OLD.incluye_iva_incpa,
        OLD.rango1_cant_incpa, OLD.rango2_cant_incpa, OLD.rango_infinito_incpa, OLD.rangos_incpa,
        OLD.ide_cncfp, OLD.ide_cndfp)
       IS NOT DISTINCT FROM
       (NEW.precio_fijo_incpa, NEW.porcentaje_util_incpa, NEW.activo_incpa, NEW.autorizado_incpa, NEW.incluye_iva_incpa,
        NEW.rango1_cant_incpa, NEW.rango2_cant_incpa, NEW.rango_infinito_incpa, NEW.rangos_incpa,
        NEW.ide_cncfp, NEW.ide_cndfp)
    THEN
        RETURN NULL;
    END IF;

    v_usuario := COALESCE(r.usuario_actua, r.usuario_ingre);

    SELECT * INTO v_eq FROM f_inv_conf_precios_equivalencias(
        r.ide_empr, r.ide_sucu, r.ide_inarti, r.porcentaje_util_incpa, r.precio_fijo_incpa, r.incluye_iva_incpa);

    INSERT INTO inv_conf_precios_hist (
        ide_incpa, ide_inarti, ide_empr, accion, usuario_inchp,
        ide_cncfp, ide_cndfp, rangos_incpa, rango1_cant_incpa, rango2_cant_incpa, rango_infinito_incpa,
        precio_fijo_incpa, porcentaje_util_incpa, incluye_iva_incpa, activo_incpa, autorizado_incpa, observacion_incpa,
        precio_fijo_prev, porcentaje_util_prev, activo_prev, autorizado_prev,
        costo_ppm, utilidad_pct, precio_sin_iva)
    VALUES (
        r.ide_incpa, r.ide_inarti, r.ide_empr, TG_OP, v_usuario,
        r.ide_cncfp, r.ide_cndfp, r.rangos_incpa, r.rango1_cant_incpa, r.rango2_cant_incpa, r.rango_infinito_incpa,
        r.precio_fijo_incpa, r.porcentaje_util_incpa, r.incluye_iva_incpa, r.activo_incpa, r.autorizado_incpa, r.observacion_incpa,
        CASE WHEN TG_OP = 'UPDATE' THEN OLD.precio_fijo_incpa END,
        CASE WHEN TG_OP = 'UPDATE' THEN OLD.porcentaje_util_incpa END,
        CASE WHEN TG_OP = 'UPDATE' THEN OLD.activo_incpa END,
        CASE WHEN TG_OP = 'UPDATE' THEN OLD.autorizado_incpa END,
        v_eq.costo, v_eq.utilidad_pct, v_eq.precio_sin_iva);

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_inv_conf_precios_hist ON inv_conf_precios_articulo;
CREATE TRIGGER trg_inv_conf_precios_hist
    AFTER INSERT OR UPDATE OR DELETE ON inv_conf_precios_articulo
    FOR EACH ROW EXECUTE FUNCTION f_inv_conf_precios_hist_trg();

-- ----------------------------------------------------------------------------
-- Foto de las configuraciones vigentes con el costo de hoy (una por configuración y día)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION f_inv_conf_precios_snapshot(p_ide_empr integer, p_usuario varchar DEFAULT 'snapshot')
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
    r        inv_conf_precios_articulo%ROWTYPE;
    v_eq     RECORD;
    v_total  integer := 0;
BEGIN
    FOR r IN
        SELECT c.*
        FROM inv_conf_precios_articulo c
        WHERE c.ide_empr = p_ide_empr
          AND c.activo_incpa = true
          AND c.autorizado_incpa = true
          AND NOT EXISTS (
                SELECT 1 FROM inv_conf_precios_hist h
                WHERE h.ide_incpa = c.ide_incpa AND h.accion = 'SNAPSHOT' AND h.fecha_inchp::date = CURRENT_DATE)
    LOOP
        SELECT * INTO v_eq FROM f_inv_conf_precios_equivalencias(
            r.ide_empr, r.ide_sucu, r.ide_inarti, r.porcentaje_util_incpa, r.precio_fijo_incpa, r.incluye_iva_incpa);

        INSERT INTO inv_conf_precios_hist (
            ide_incpa, ide_inarti, ide_empr, accion, usuario_inchp,
            ide_cncfp, ide_cndfp, rangos_incpa, rango1_cant_incpa, rango2_cant_incpa, rango_infinito_incpa,
            precio_fijo_incpa, porcentaje_util_incpa, incluye_iva_incpa, activo_incpa, autorizado_incpa, observacion_incpa,
            costo_ppm, utilidad_pct, precio_sin_iva)
        VALUES (
            r.ide_incpa, r.ide_inarti, r.ide_empr, 'SNAPSHOT', p_usuario,
            r.ide_cncfp, r.ide_cndfp, r.rangos_incpa, r.rango1_cant_incpa, r.rango2_cant_incpa, r.rango_infinito_incpa,
            r.precio_fijo_incpa, r.porcentaje_util_incpa, r.incluye_iva_incpa, r.activo_incpa, r.autorizado_incpa, r.observacion_incpa,
            v_eq.costo, v_eq.utilidad_pct, v_eq.precio_sin_iva);
        v_total := v_total + 1;
    END LOOP;
    RETURN v_total;
END;
$$;

-- ----------------------------------------------------------------------------
-- Limpieza: funciones del generador SQL anterior, reemplazado por la propuesta con IA
-- (config-precios-ia.service.ts). Se eliminan todas sus sobrecargas, de cualquier versión.
-- Nota: f_calcular_precio_venta / f_calcula_precio_venta (motor de precios) SÍ se usa y no se toca.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS firma
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('f_generar_config_precios', 'f_segmentar_margenes')
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.firma || ' CASCADE';
    END LOOP;
END;
$$;
