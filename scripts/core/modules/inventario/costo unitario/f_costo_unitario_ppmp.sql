


CREATE OR REPLACE FUNCTION f_costo_unitario_ppmp(
    p_id_empresa   BIGINT,
    p_id_sucursal  BIGINT,
    p_ide_inarti   BIGINT,
    p_fecha_venta  DATE
)
RETURNS TABLE (
    costo_unitario  NUMERIC,
    fecha_costo     DATE,
    saldo_cantidad  NUMERIC,
    metodo_aplicado VARCHAR(50)
) AS $$
DECLARE
    v_costo_previo  NUMERIC;
    v_fecha_previo  DATE;
    v_saldo_previo  NUMERIC;
    v_costo_futuro  NUMERIC;
    v_fecha_futuro  DATE;
    v_saldo_futuro  NUMERIC;
BEGIN
    -- ── 1. Último CPP vigente a la fecha de venta ────────────────────────────
    SELECT
        k.costo_promedio,
        k.fecha_mov,
        k.saldo_cantidad
    INTO
        v_costo_previo,
        v_fecha_previo,
        v_saldo_previo
    FROM inv_kardex_ppmp k
    WHERE k.ide_empr      = p_id_empresa
      AND k.ide_sucu      = p_id_sucursal
      AND k.ide_inarti    = p_ide_inarti
      AND k.fecha_mov    <= p_fecha_venta
      AND k.costo_promedio > 0
    ORDER BY k.fecha_mov DESC, k.orden_mov DESC
    LIMIT 1;

    -- ── 2. Saldo negativo: buscar la SIGUIENTE COMPRA sin límite de fecha ────
    --       Es la compra que económicamente corresponde a esta venta,
    --       independientemente de cuántos días tarde en registrarse.
    IF v_saldo_previo IS NOT NULL AND v_saldo_previo < 0 THEN

        SELECT
            k.costo_promedio,
            k.fecha_mov,
            k.saldo_cantidad
        INTO
            v_costo_futuro,
            v_fecha_futuro,
            v_saldo_futuro
        FROM inv_kardex_ppmp k
        WHERE k.ide_empr      = p_id_empresa
          AND k.ide_sucu      = p_id_sucursal
          AND k.ide_inarti    = p_ide_inarti
          AND k.fecha_mov     > p_fecha_venta   -- posterior a la venta
          AND k.signo     = 1               -- solo ingresos (compras)
          AND k.costo_promedio > 0
        ORDER BY k.fecha_mov ASC, k.orden_mov ASC
        LIMIT 1;                               -- la más cercana en el tiempo

        IF v_costo_futuro IS NOT NULL THEN
            -- Compra posterior encontrada → costo correcto para esta venta
            RETURN QUERY
            SELECT
                ROUND(v_costo_futuro, 6),
                v_fecha_futuro,
                v_saldo_futuro,
                'PPMP_SIGUIENTE_COMPRA'::VARCHAR(50);
            RETURN;
        END IF;

        -- Nunca llegó una compra posterior (artículo descontinuado, error de
        -- datos, etc.) → usar CPP previo como mejor estimación disponible
        RETURN QUERY
        SELECT
            ROUND(COALESCE(v_costo_previo, 0), 6),
            v_fecha_previo,
            v_saldo_previo,
            CASE
                WHEN v_costo_previo IS NULL
                THEN 'SIN_COSTO'::VARCHAR(50)
                ELSE 'PPMP_NEGATIVO_SIN_COMPRA'::VARCHAR(50)
            END;
        RETURN;
    END IF;

    -- ── 3. Camino normal: saldo >= 0 ─────────────────────────────────────────
    RETURN QUERY
    SELECT
        ROUND(COALESCE(v_costo_previo, 0), 6),
        v_fecha_previo,
        v_saldo_previo,
        CASE
            WHEN v_costo_previo IS NULL THEN 'SIN_COSTO'::VARCHAR(50)
            WHEN v_costo_previo = 0     THEN 'SIN_PRECIO_COMPRA'::VARCHAR(50)
            WHEN v_saldo_previo = 0     THEN 'PPMP_SALDO_CERO'::VARCHAR(50)
            ELSE                             'PPMP_NORMAL'::VARCHAR(50)
        END;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL SAFE;


-- Este índice ya existe implícitamente si tienes el de la respuesta anterior,
-- pero asegurar que cubra búsqueda futura (fecha_mov ASC también)
CREATE INDEX IF NOT EXISTS idx_kardex_ppmp_futuro
ON inv_kardex_ppmp (ide_empr, ide_sucu, ide_inarti, fecha_mov ASC, orden_mov ASC)
INCLUDE (costo_promedio, saldo_cantidad)
WHERE costo_promedio > 0;

-- select * from f_costo_unitario_ppmp(0, 2, 1704, '2026-01-18');