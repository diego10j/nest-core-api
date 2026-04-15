/**
Reconstruye el kardex de PPMP para un artículo específico o para todos los artículos,
dentro del scope de empresa y sucursal.

Comportamiento:
  - Permite saldos negativos: escenario válido cuando se factura antes de recibir
    la compra (el mismo día o días posteriores). El CPP se recalcula correctamente
    al ingresar la mercadería.
  - En el mismo día los ingresos se procesan antes que los egresos (signo DESC)
    para minimizar saldos negativos transitorios en la visualización.
**/
CREATE OR REPLACE PROCEDURE p_reconstruir_kardex_ppmp(
    p_id_empresa  BIGINT,
    p_id_sucursal BIGINT,
    p_ide_inarti  BIGINT DEFAULT NULL
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
    v_cpp_calc      NUMERIC;                           -- temporal para CPP sin overflow
    c_max_val       CONSTANT NUMERIC := 999999999999;  -- límite NUMERIC(18,6): 10^12 - 1
BEGIN
    DELETE FROM inv_kardex_ppmp
    WHERE ide_empr = p_id_empresa
      AND ide_sucu = p_id_sucursal
      AND (p_ide_inarti IS NULL OR ide_inarti = p_ide_inarti);

    FOR v_art IN
        SELECT DISTINCT d.ide_inarti
        FROM inv_det_comp_inve d
        JOIN inv_cab_comp_inve c ON d.ide_incci = c.ide_incci
        WHERE c.ide_empr        = p_id_empresa
          AND d.ide_sucu        = p_id_sucursal   -- sucursal del DETALLE (igual que getSqlListaProductosStock)
          AND c.ide_inepi       = 1
          AND d.cantidad_indci  > 0
          AND (p_ide_inarti IS NULL OR d.ide_inarti = p_ide_inarti)
        ORDER BY d.ide_inarti
    LOOP
        v_saldo_cant  := 0;
        v_saldo_valor := 0;
        v_costo_prom  := 0;
        v_orden       := 0;

        FOR v_mov IN
            SELECT
                d.ide_indci,                        -- ← id línea detalle
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
            WHERE c.ide_empr        = p_id_empresa
              AND d.ide_sucu        = p_id_sucursal   -- sucursal del DETALLE
              AND c.ide_inepi       = 1
              AND d.ide_inarti      = v_art.ide_inarti
              AND d.cantidad_indci  > 0
            -- Ingresos antes que egresos en el mismo día (signo DESC: 1 antes que -1)
            ORDER BY c.fecha_trans_incci, e.signo_intci DESC, c.ide_incci, d.ide_indci
        LOOP
            v_orden  := v_orden + 1;
            v_precio := v_mov.precio_compra;

            IF v_mov.signo = 1 THEN
                -- ── INGRESO ────────────────────────────────────────────────────────────
                -- Cruce de cero: cuando el stock pasa de NEGATIVO a POSITIVO el saldo_valor
                -- acumulado ya no es válido (representó unidades que ya salieron sin costo
                -- real asignado). Si se acumula normal, el CPP se infla catastroficamente.
                -- Solución: valorar SOLO las unidades que quedan en stock al precio
                -- de esta compra y fijar CPP = precio compra.
                IF v_saldo_cant < 0 AND (v_saldo_cant + v_mov.cantidad) > 0 THEN
                    v_saldo_cant  := ROUND(v_saldo_cant + v_mov.cantidad, 6);
                    v_saldo_valor := ROUND(v_saldo_cant * v_precio, 6);  -- solo unidades en stock
                    v_costo_prom  := v_precio;                            -- CPP = precio de compra
                ELSE
                    -- Ingreso normal (stock positivo, o ingreso que no alcanza a cubrir el negativo)
                    v_saldo_cant  := ROUND(v_saldo_cant + v_mov.cantidad, 6);
                    v_saldo_valor := ROUND(v_saldo_valor + ROUND(v_mov.cantidad * v_precio, 6), 6);
                    IF v_saldo_cant >= 0.000001 THEN
                        v_cpp_calc := v_saldo_valor / v_saldo_cant;
                        IF ABS(v_cpp_calc) <= c_max_val THEN
                            v_costo_prom := ROUND(v_cpp_calc, 6);
                        ELSE
                            RAISE WARNING 'Kardex PPMP: CPP fuera de rango (art=%, incci=%, cpp~%), CPP anterior conservado',
                                v_art.ide_inarti, v_mov.ide_incci, ROUND(v_cpp_calc, 2);
                        END IF;
                    END IF;
                END IF;
            ELSE
                -- ── EGRESO ─────────────────────────────────────────────────────────────
                -- Invariante: saldo_valor = saldo_cant × cpp debe mantenerse siempre.
                -- Si el stock queda en 0 o negativo se fuerza la invariante para evitar
                -- que saldo_valor acumule valores que luego inflen el CPP en el
                -- siguiente ingreso (origen del overflow de -1.4 billones).
                v_saldo_cant := ROUND(v_saldo_cant - v_mov.cantidad, 6);
                IF v_saldo_cant <= 0 THEN
                    -- Forzar invariante: saldo_valor proporcionado al saldo actual
                    v_saldo_valor := ROUND(v_saldo_cant * v_costo_prom, 6);
                ELSE
                    v_saldo_valor := ROUND(v_saldo_valor - ROUND(v_mov.cantidad * v_costo_prom, 6), 6);
                END IF;
            END IF;

            -- Guardia de seguridad residual (no deberia activarse con la logica anterior).
            IF ABS(v_saldo_cant) > c_max_val THEN
                RAISE WARNING 'Kardex PPMP: saldo_cant desborda (art=%, incci=%, val=%)',
                    v_art.ide_inarti, v_mov.ide_incci, v_saldo_cant;
                v_saldo_cant := LEAST(GREATEST(v_saldo_cant, -c_max_val), c_max_val);
            END IF;
            IF ABS(v_saldo_valor) > c_max_val THEN
                RAISE WARNING 'Kardex PPMP: saldo_valor desborda (art=%, incci=%, val=%)',
                    v_art.ide_inarti, v_mov.ide_incci, v_saldo_valor;
                v_saldo_valor := LEAST(GREATEST(v_saldo_valor, -c_max_val), c_max_val);
            END IF;

            INSERT INTO inv_kardex_ppmp (
                ide_empr,       ide_sucu,       ide_inarti,
                ide_incci,      ide_indci,      -- ← incluir ide_indci
                fecha_mov,      orden_mov,      signo,
                cantidad,       precio_compra,
                saldo_cantidad, saldo_valor,    costo_promedio
            ) VALUES (
                p_id_empresa,       p_id_sucursal,      v_art.ide_inarti,
                v_mov.ide_incci,    v_mov.ide_indci,
                v_mov.fecha_mov,    v_orden,            v_mov.signo,
                v_mov.cantidad,     v_precio,
                v_saldo_cant,       v_saldo_valor,      v_costo_prom
            );
        END LOOP;

        COMMIT;
    END LOOP;
END;
$$;

--       call  p_reconstruir_kardex_ppmp(0,2,1704)     -- de un producto específico
--       call  p_reconstruir_kardex_ppmp(0,0)      -- de todos los productos de la sucursal 0
--       call  p_reconstruir_kardex_ppmp(0,2)      -- de todos los productos de la sucursal 2
--  
-- select * from  inv_kardex_ppmp where ide_inarti = 1704  and ide_empr=0 and ide_sucu= 2