CREATE OR REPLACE PROCEDURE p_reconstruir_kardex_ppmp(
    p_id_empresa  BIGINT,
    p_id_sucursal  BIGINT,
    p_ide_inarti  BIGINT DEFAULT NULL  -- NULL = todos los artículos
)
LANGUAGE plpgsql AS $$
DECLARE
    v_art           RECORD;
    v_mov           RECORD;
    v_saldo_cant    NUMERIC := 0;
    v_saldo_valor   NUMERIC := 0;
    v_costo_prom    NUMERIC := 0;
    v_orden         BIGINT  := 0;
    v_precio        NUMERIC := 0;
BEGIN
    -- Borrar kardex existente del scope
    DELETE FROM inv_kardex_ppmp
    WHERE ide_empr = p_id_empresa
      AND ide_sucu = p_id_sucursal
      AND (p_ide_inarti IS NULL OR ide_inarti = p_ide_inarti);

    -- Iterar por cada artículo
    FOR v_art IN
        SELECT DISTINCT d.ide_inarti
        FROM inv_det_comp_inve d
        JOIN inv_cab_comp_inve c ON d.ide_incci = c.ide_incci
        WHERE c.ide_empr   = p_id_empresa
          AND c.ide_sucu   = p_id_sucursal
          AND c.ide_inepi  = 1
          AND d.cantidad_indci > 0
          AND (p_ide_inarti IS NULL OR d.ide_inarti = p_ide_inarti)
        ORDER BY d.ide_inarti
    LOOP
        v_saldo_cant  := 0;
        v_saldo_valor := 0;
        v_costo_prom  := 0;
        v_orden       := 0;

        -- Recorrer movimientos del artículo en orden cronológico
        FOR v_mov IN
            SELECT
                c.ide_incci,
                c.fecha_trans_incci             AS fecha_mov,
                e.signo_intci                   AS signo,
                d.cantidad_indci                AS cantidad,
                CASE WHEN e.signo_intci = 1
                     THEN COALESCE(d.precio_indci, 0)
                     ELSE 0
                END                             AS precio_compra
            FROM inv_det_comp_inve d
            JOIN inv_cab_comp_inve c ON d.ide_incci  = c.ide_incci
            JOIN inv_tip_tran_inve t ON t.ide_intti  = c.ide_intti
            JOIN inv_tip_comp_inve e ON e.ide_intci  = t.ide_intci
            WHERE c.ide_empr      = p_id_empresa
              AND c.ide_inepi     = 1
              AND c.ide_sucu     = p_id_sucursal
              AND d.ide_inarti    = v_art.ide_inarti
              AND d.cantidad_indci > 0
            ORDER BY c.fecha_trans_incci, c.ide_incci
        LOOP
            v_orden  := v_orden + 1;
            v_precio := v_mov.precio_compra;

            IF v_mov.signo = 1 THEN
                -- Ingreso: actualizar saldo y recalcular promedio
                v_saldo_valor := GREATEST(0, v_saldo_valor + v_mov.cantidad * v_precio);
                v_saldo_cant  := v_saldo_cant + v_mov.cantidad;
                IF v_saldo_cant > 0 THEN
                    v_costo_prom := v_saldo_valor / v_saldo_cant;
                END IF;
            ELSE
                -- Egreso: descontar al costo promedio vigente
                v_saldo_cant  := v_saldo_cant  - v_mov.cantidad;
                v_saldo_valor := GREATEST(0, v_saldo_valor - v_mov.cantidad * v_costo_prom);
                -- costo_promedio NO cambia en egresos
            END IF;

            INSERT INTO inv_kardex_ppmp (
                ide_empr, ide_sucu, ide_inarti, ide_incci,
                fecha_mov, orden_mov, signo,
                cantidad, precio_compra,
                saldo_cantidad, saldo_valor, costo_promedio
            ) VALUES (
                p_id_empresa, p_id_sucursal, v_art.ide_inarti, v_mov.ide_incci,
                v_mov.fecha_mov, v_orden, v_mov.signo,
                v_mov.cantidad, v_precio,
                v_saldo_cant, v_saldo_valor, v_costo_prom
            );
        END LOOP;

        -- Commit por artículo para no bloquear la tabla entera
        COMMIT;
    END LOOP;
END;
$$;

-- Ejecutar (una sola vez, puede tardar varios minutos con historia completa)
-- CALL p_reconstruir_kardex_ppmp(0,0);          -- todos los artículos
-- CALL p_reconstruir_kardex_ppmp(0,,0 1704);    -- solo uno para probar