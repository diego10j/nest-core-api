-- -------------------------------------------------------
-- Actualizar fn_trg_kardex_ppmp para manejar:
--   1. INSERT/UPDATE en detalle (ya existía)
--   2. UPDATE de ide_inepi en cabecera (anulación/reactivación)
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
        ORDER BY c.fecha_trans_incci, c.ide_incci, d.ide_indci
    LOOP
        v_orden  := v_orden + 1;
        v_precio := v_mov.precio_compra;

        IF v_mov.signo = 1 THEN
            v_saldo_valor := GREATEST(0, v_saldo_valor + v_mov.cantidad * v_precio);
            v_saldo_cant  := v_saldo_cant + v_mov.cantidad;
            IF v_saldo_cant > 0 THEN
                v_costo_prom := v_saldo_valor / v_saldo_cant;
            END IF;
        ELSE
            v_saldo_cant  := v_saldo_cant  - v_mov.cantidad;
            v_saldo_valor := GREATEST(0, v_saldo_valor - v_mov.cantidad * v_costo_prom);
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
BEGIN
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

    IF TG_TABLE_NAME = 'inv_det_comp_inve' THEN
        SELECT ide_empr, ide_sucu, ide_inepi, fecha_trans_incci
          INTO v_ide_empr, v_ide_sucu, v_ide_inepi, v_fecha_afecta
          FROM inv_cab_comp_inve
         WHERE ide_incci = NEW.ide_incci;

        IF v_ide_inepi = 0 THEN
            RETURN NEW;
        END IF;

        PERFORM fn_recalcular_desde_fecha(
            v_ide_empr,
            v_ide_sucu,
            NEW.ide_inarti,
            v_fecha_afecta
        );

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER trg_kardex_ppmp
    AFTER INSERT OR UPDATE ON inv_det_comp_inve
    FOR EACH ROW
    EXECUTE FUNCTION fn_trg_kardex_ppmp();

CREATE TRIGGER trg_kardex_ppmp_cab
    AFTER UPDATE OF ide_inepi ON inv_cab_comp_inve
    FOR EACH ROW
    EXECUTE FUNCTION fn_trg_kardex_ppmp();