-- -------------------------------------------------------
-- fn_trg_kardex_ppmp — Kardex PPMP (Costo Promedio Ponderado Móvil)
--   1. INSERT / UPDATE / DELETE en detalle de comprobante
--   2. UPDATE de ide_inepi en cabecera (anulación / reactivación)
--   3. Soporte para saldo negativo: facturar antes de recibir la compra
--      (el mismo día o en días posteriores), el CPP se recalcula
--      correctamente al ingresar la mercadería.
-- -------------------------------------------------------
DROP TRIGGER IF EXISTS trg_kardex_ppmp ON inv_det_comp_inve;
DROP TRIGGER IF EXISTS trg_kardex_ppmp_cab ON inv_cab_comp_inve;
DROP FUNCTION IF EXISTS fn_trg_kardex_ppmp();
DROP FUNCTION IF EXISTS fn_recalcular_desde_fecha(BIGINT, BIGINT, BIGINT, DATE);

CREATE OR REPLACE FUNCTION fn_recalcular_desde_fecha(
    p_ide_empr   BIGINT,
    p_ide_sucu   BIGINT,
    p_ide_inarti BIGINT,
    p_fecha      DATE
)
RETURNS VOID AS $$
DECLARE
    v_mov           RECORD;
    v_prev          RECORD;
    v_saldo_cant    NUMERIC := 0;
    v_saldo_valor   NUMERIC := 0;
    v_costo_prom    NUMERIC := 0;
    v_orden         BIGINT  := 0;
    v_precio        NUMERIC := 0;
    v_cpp_calc      NUMERIC;                           -- temporal para CPP sin overflow
    c_max_val       CONSTANT NUMERIC := 999999999999;  -- límite NUMERIC(18,6): 10^12 - 1
BEGIN
    SELECT saldo_cantidad, saldo_valor, costo_promedio, orden_mov
      INTO v_prev
      FROM inv_kardex_ppmp
     WHERE ide_empr   = p_ide_empr
       AND ide_sucu   = p_ide_sucu
       AND ide_inarti = p_ide_inarti
       AND fecha_mov  < p_fecha
     ORDER BY orden_mov DESC
     LIMIT 1;

    IF FOUND THEN
        v_saldo_cant  := v_prev.saldo_cantidad;
        v_saldo_valor := v_prev.saldo_valor;
        v_costo_prom  := v_prev.costo_promedio;
        v_orden       := v_prev.orden_mov;
    END IF;

    DELETE FROM inv_kardex_ppmp
     WHERE ide_empr   = p_ide_empr
       AND ide_sucu   = p_ide_sucu
       AND ide_inarti = p_ide_inarti
       AND fecha_mov  >= p_fecha;

    FOR v_mov IN
        SELECT
            d.ide_indci,
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
        WHERE c.ide_empr             = p_ide_empr
          AND c.ide_sucu             = p_ide_sucu
          AND c.ide_inepi            = 1
          AND d.ide_inarti           = p_ide_inarti
          AND c.fecha_trans_incci   >= p_fecha
          AND d.cantidad_indci       > 0
        -- Orden: fecha → ingresos antes que egresos en el mismo día (signo DESC: 1 antes que -1)
        -- → permite que la compra del mismo día preceda a la venta en el kardex
        -- → si el egreso fue registrado primero (id menor), el saldo puede quedar
        --   negativo momentáneamente; el siguiente ingreso lo corrige automáticamente.
        ORDER BY c.fecha_trans_incci, e.signo_intci DESC, c.ide_incci, d.ide_indci
    LOOP
        v_orden  := v_orden + 1;
        v_precio := v_mov.precio_compra;

        IF v_mov.signo = 1 THEN
            -- ── INGRESO ──────────────────────────────────────────────────────────────
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
                            p_ide_inarti, v_mov.ide_incci, ROUND(v_cpp_calc, 2);
                    END IF;
                END IF;
            END IF;
        ELSE
            -- ── EGRESO ───────────────────────────────────────────────────────────────
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
                p_ide_inarti, v_mov.ide_incci, v_saldo_cant;
            v_saldo_cant := LEAST(GREATEST(v_saldo_cant, -c_max_val), c_max_val);
        END IF;
        IF ABS(v_saldo_valor) > c_max_val THEN
            RAISE WARNING 'Kardex PPMP: saldo_valor desborda (art=%, incci=%, val=%)',
                p_ide_inarti, v_mov.ide_incci, v_saldo_valor;
            v_saldo_valor := LEAST(GREATEST(v_saldo_valor, -c_max_val), c_max_val);
        END IF;

        INSERT INTO inv_kardex_ppmp (
            ide_empr,       ide_sucu,       ide_inarti,
            ide_incci,      ide_indci,
            fecha_mov,      orden_mov,      signo,
            cantidad,       precio_compra,
            saldo_cantidad, saldo_valor,    costo_promedio
        ) VALUES (
            p_ide_empr,         p_ide_sucu,         p_ide_inarti,
            v_mov.ide_incci,    v_mov.ide_indci,
            v_mov.fecha_mov,    v_orden,             v_mov.signo,
            v_mov.cantidad,     v_precio,
            v_saldo_cant,       v_saldo_valor,       v_costo_prom
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql;






CREATE OR REPLACE FUNCTION fn_trg_kardex_ppmp()
RETURNS TRIGGER AS $$
DECLARE
    v_ide_empr      BIGINT;
    v_ide_sucu      BIGINT;
    v_ide_inepi     BIGINT;
    v_fecha_afecta  DATE;
    v_ide_inarti    BIGINT;
    -- fila de referencia: OLD en DELETE, NEW en INSERT/UPDATE
    v_ide_incci     BIGINT;
    v_ide_inarti_d  BIGINT;
BEGIN
    -- ── Cabecera: anulación / reactivación ──────────────────────────────
    IF TG_TABLE_NAME = 'inv_cab_comp_inve' THEN
        IF OLD.ide_inepi = NEW.ide_inepi THEN
            RETURN NEW;
        END IF;

        FOR v_ide_inarti IN
            SELECT DISTINCT ide_inarti
            FROM inv_det_comp_inve
            WHERE ide_incci      = NEW.ide_incci
              AND cantidad_indci  > 0
        LOOP
            PERFORM fn_recalcular_desde_fecha(
                NEW.ide_empr,
                NEW.ide_sucu,
                v_ide_inarti,
                NEW.fecha_trans_incci
            );
        END LOOP;

        RETURN NEW;
    END IF;

    -- ── Detalle: INSERT / UPDATE / DELETE ───────────────────────────────
    IF TG_TABLE_NAME = 'inv_det_comp_inve' THEN
        -- En DELETE usamos OLD para obtener el artículo y comprobante afectados
        IF TG_OP = 'DELETE' THEN
            v_ide_incci    := OLD.ide_incci;
            v_ide_inarti_d := OLD.ide_inarti;
        ELSE
            v_ide_incci    := NEW.ide_incci;
            v_ide_inarti_d := NEW.ide_inarti;
        END IF;

        SELECT ide_empr, ide_sucu, ide_inepi, fecha_trans_incci
          INTO v_ide_empr, v_ide_sucu, v_ide_inepi, v_fecha_afecta
          FROM inv_cab_comp_inve
         WHERE ide_incci = v_ide_incci;

        -- Si el comprobante está anulado (ide_inepi = 0) no afecta el kardex
        IF v_ide_inepi = 0 THEN
            RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        END IF;

        PERFORM fn_recalcular_desde_fecha(
            v_ide_empr,
            v_ide_sucu,
            v_ide_inarti_d,
            v_fecha_afecta
        );

        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER trg_kardex_ppmp
    AFTER INSERT OR UPDATE OR DELETE ON inv_det_comp_inve
    FOR EACH ROW
    EXECUTE FUNCTION fn_trg_kardex_ppmp();

CREATE TRIGGER trg_kardex_ppmp_cab
    AFTER UPDATE OF ide_inepi ON inv_cab_comp_inve
    FOR EACH ROW
    EXECUTE FUNCTION fn_trg_kardex_ppmp();