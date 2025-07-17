-- VERSIÓN f_calcula_precio_venta
-- Ajuste: prioridad a configuraciones exactas, luego por rangos y finalmente aproximadas

CREATE OR REPLACE FUNCTION f_calcula_precio_venta(
    p_ide_inarti INT,
    p_cantidad DECIMAL,
    p_ide_cndfp INT DEFAULT NULL,
    p_precio_compra DECIMAL(12,2) DEFAULT NULL
)
RETURNS TABLE (
    cantidad DECIMAL,
    precio_ultima_compra DECIMAL(12,2),
    fecha_ultima_compra DATE,
    precio_venta_sin_iva DECIMAL(12,2),
    precio_venta_con_iva DECIMAL(12,2),
    porcentaje_utilidad DECIMAL(12,2),
    porcentaje_iva DECIMAL(5,2),
    utilidad DECIMAL(12,2),
    valor_total_con_iva DECIMAL(12,2),
    rango_aplicado VARCHAR(100),
    forma_pago_config INT,
    utilidad_neta DECIMAL(12,2),
    porcentaje_utilidad_real DECIMAL(12,2),
    configuracion_prioridad INT,
    tipo_configuracion VARCHAR(20)
)
AS $$
DECLARE
    v_precio_compra DECIMAL(12,2);
    v_fecha_compra DATE;
    v_iva DECIMAL(5,2);
    v_iva_factor DECIMAL(12,6);
    v_ide_cncfp INT;
    v_rango RECORD;
    v_decim_stock_inarti INT;
    v_found BOOLEAN := FALSE;
    v_dif_menor NUMERIC;
BEGIN
    SELECT porcentaje_cnpim * 100 INTO v_iva
    FROM con_porcen_impues
    WHERE CURRENT_DATE BETWEEN fecha_desde_cnpim AND fecha_fin_cnpim
      AND activo_cnpim = TRUE
    ORDER BY fecha_desde_cnpim DESC LIMIT 1;

    IF v_iva IS NULL THEN
        RAISE EXCEPTION 'No se encontró porcentaje de IVA activo para la fecha actual';
    END IF;
    v_iva_factor := v_iva / 100;

    SELECT decim_stock_inarti INTO v_decim_stock_inarti FROM inv_articulo WHERE ide_inarti = p_ide_inarti;
    IF v_decim_stock_inarti IS NULL THEN v_decim_stock_inarti := 2; END IF;

    IF p_precio_compra IS NULL THEN
        SELECT d.precio_indci, c.fecha_trans_incci
        INTO v_precio_compra, v_fecha_compra
        FROM inv_det_comp_inve d
        JOIN inv_cab_comp_inve c ON d.ide_incci = c.ide_incci
        WHERE d.ide_inarti = p_ide_inarti
          AND d.precio_indci > 0
          AND c.ide_inepi = 1
          AND c.ide_intti IN (19, 16, 3025)
          AND EXISTS (
              SELECT 1 FROM inv_tip_tran_inve t
              JOIN inv_tip_comp_inve e ON t.ide_intci = e.ide_intci
              WHERE t.ide_intti = c.ide_intti AND e.signo_intci = 1)
        ORDER BY c.fecha_trans_incci DESC LIMIT 1;
    ELSE
        v_precio_compra := p_precio_compra;
        v_fecha_compra := NULL;
    END IF;

    IF p_ide_cndfp IS NOT NULL THEN
        SELECT ide_cncfp INTO v_ide_cncfp FROM con_deta_forma_pago WHERE ide_cndfp = p_ide_cndfp;
    END IF;

    -- 1. PRECIO_FIJO_EXACTO
    FOR v_rango IN
        SELECT * FROM inv_conf_precios_articulo
        WHERE ide_inarti = p_ide_inarti AND activo_incpa = TRUE
          AND rangos_incpa = FALSE AND rango1_cant_incpa = p_cantidad AND rango2_cant_incpa IS NULL
        ORDER BY CASE WHEN ide_cndfp = p_ide_cndfp THEN 0 WHEN ide_cndfp IS NULL THEN 1 ELSE 2 END
    LOOP
        v_found := TRUE;

        IF v_rango.precio_fijo_incpa IS NOT NULL THEN
            precio_venta_sin_iva := v_rango.precio_fijo_incpa;
            IF v_rango.incluye_iva_incpa THEN
                precio_venta_con_iva := ROUND(precio_venta_sin_iva, 2);
                precio_venta_sin_iva := ROUND(precio_venta_con_iva / (1 + v_iva_factor), 4);
            ELSE
                precio_venta_con_iva := ROUND(precio_venta_sin_iva * (1 + v_iva_factor), 2);
            END IF;
            porcentaje_utilidad := ROUND(((precio_venta_sin_iva - v_precio_compra) / v_precio_compra) * 100, 2);
        END IF;

        utilidad := ROUND(precio_venta_sin_iva - v_precio_compra, 2);
        utilidad_neta := ROUND(utilidad * p_cantidad, 2);
        porcentaje_utilidad_real := ROUND((utilidad / v_precio_compra) * 100, 2);

        cantidad := p_cantidad;
        precio_ultima_compra := v_precio_compra;
        fecha_ultima_compra := v_fecha_compra;
        porcentaje_iva := v_iva;
        valor_total_con_iva := ROUND(p_cantidad * precio_venta_con_iva, 2);
        forma_pago_config := v_rango.ide_cndfp;
        tipo_configuracion := 'PRECIO_FIJO_EXACTO';
        rango_aplicado := '= ' || f_decimales(v_rango.rango1_cant_incpa, v_decim_stock_inarti);
        configuracion_prioridad := 1;

        RETURN NEXT;
    END LOOP;

    -- 2. PRECIO_FIJO_RANGO o PORCENTAJE
    IF NOT v_found THEN
        FOR v_rango IN
            SELECT * FROM inv_conf_precios_articulo
            WHERE ide_inarti = p_ide_inarti AND activo_incpa = TRUE
              AND rangos_incpa = TRUE AND rango1_cant_incpa IS NOT NULL
              AND (
                  (rango2_cant_incpa IS NULL AND p_cantidad >= rango1_cant_incpa)
                  OR (p_cantidad >= rango1_cant_incpa AND p_cantidad < rango2_cant_incpa))
            ORDER BY CASE WHEN ide_cndfp = 1 THEN 0 WHEN ide_cndfp IS NULL THEN 1 ELSE 2 END
        LOOP
            v_found := TRUE;

            IF v_rango.precio_fijo_incpa IS NOT NULL THEN
                precio_venta_sin_iva := v_rango.precio_fijo_incpa;
                IF v_rango.incluye_iva_incpa THEN
                    precio_venta_con_iva := ROUND(precio_venta_sin_iva, 2);
                    precio_venta_sin_iva := ROUND(precio_venta_con_iva / (1 + v_iva_factor), 4);
                ELSE
                    precio_venta_con_iva := ROUND(precio_venta_sin_iva * (1 + v_iva_factor), 2);
                END IF;
                porcentaje_utilidad := ROUND(((precio_venta_sin_iva - v_precio_compra) / v_precio_compra) * 100, 2);
                tipo_configuracion := 'PRECIO_FIJO_RANGO';
            ELSE
                porcentaje_utilidad := v_rango.porcentaje_util_incpa;
                precio_venta_sin_iva := ROUND(v_precio_compra * (1 + porcentaje_utilidad / 100), 4);
                precio_venta_con_iva := ROUND(precio_venta_sin_iva * (1 + v_iva_factor), 2);
                tipo_configuracion := 'PORCENTAJE';
            END IF;

            utilidad := ROUND(precio_venta_sin_iva - v_precio_compra, 2);
            utilidad_neta := ROUND(utilidad * p_cantidad, 2);
            porcentaje_utilidad_real := ROUND((utilidad / v_precio_compra) * 100, 2);

            cantidad := p_cantidad;
            precio_ultima_compra := v_precio_compra;
            fecha_ultima_compra := v_fecha_compra;
            porcentaje_iva := v_iva;
            valor_total_con_iva := ROUND(p_cantidad * precio_venta_con_iva, 2);
            forma_pago_config := v_rango.ide_cndfp;

            IF v_rango.rango2_cant_incpa IS NULL THEN
                rango_aplicado := '≥ ' || f_decimales(v_rango.rango1_cant_incpa, v_decim_stock_inarti);
            ELSE
                rango_aplicado := f_decimales(v_rango.rango1_cant_incpa, v_decim_stock_inarti) ||
                                  ' ≤x< ' || f_decimales(v_rango.rango2_cant_incpa, v_decim_stock_inarti);
            END IF;

            configuracion_prioridad := 2;

            RETURN NEXT;
        END LOOP;
    END IF;

    -- 3. PRECIO_FIJO_APROXIMADO (más cercano por diferencia absoluta)
    IF NOT v_found THEN
        FOR v_rango IN
            SELECT *, ABS(p_cantidad - rango1_cant_incpa) AS diferencia
            FROM inv_conf_precios_articulo
            WHERE ide_inarti = p_ide_inarti AND activo_incpa = TRUE
              AND rangos_incpa = FALSE AND rango2_cant_incpa IS NULL AND rango1_cant_incpa IS NOT NULL
              AND precio_fijo_incpa IS NOT NULL
            ORDER BY CASE WHEN ide_cndfp = 1 THEN 0 WHEN ide_cndfp IS NULL THEN 1 ELSE 2 END,
                ABS(p_cantidad - rango1_cant_incpa)
            LIMIT 3
        LOOP
            precio_venta_sin_iva := v_rango.precio_fijo_incpa;
            IF v_rango.incluye_iva_incpa THEN
                precio_venta_con_iva := ROUND(precio_venta_sin_iva, 2);
                precio_venta_sin_iva := ROUND(precio_venta_con_iva / (1 + v_iva_factor), 4);
            ELSE
                precio_venta_con_iva := ROUND(precio_venta_sin_iva * (1 + v_iva_factor), 2);
            END IF;
            porcentaje_utilidad := ROUND(((precio_venta_sin_iva - v_precio_compra) / v_precio_compra) * 100, 2);

            utilidad := ROUND(precio_venta_sin_iva - v_precio_compra, 2);
            utilidad_neta := ROUND(utilidad * p_cantidad, 2);
            porcentaje_utilidad_real := ROUND((utilidad / v_precio_compra) * 100, 2);

            cantidad := p_cantidad;
            precio_ultima_compra := v_precio_compra;
            fecha_ultima_compra := v_fecha_compra;
            porcentaje_iva := v_iva;
            valor_total_con_iva := ROUND(p_cantidad * precio_venta_con_iva, 2);
            forma_pago_config := v_rango.ide_cndfp;

            tipo_configuracion := 'PRECIO_FIJO_APROXIMADO';
            rango_aplicado := '= ' || f_decimales(v_rango.rango1_cant_incpa, v_decim_stock_inarti);
            configuracion_prioridad := 3;

            RETURN NEXT;
        END LOOP;
    END IF;


     -- 4. PORCENTAJE_APROXIMADO sin importar forma de pago, priorizando los ide_cndfp = 1 (CONTADO)
    IF NOT v_found THEN
        FOR v_rango IN
            SELECT * FROM inv_conf_precios_articulo
            WHERE ide_inarti = p_ide_inarti AND activo_incpa = TRUE
              AND rangos_incpa = TRUE AND rango1_cant_incpa IS NOT NULL AND porcentaje_util_incpa IS NOT NULL
              ORDER BY CASE WHEN ide_cndfp = 1 THEN 0 WHEN ide_cndfp IS NULL THEN 1 ELSE 2 END,
                       ABS(p_cantidad - rango1_cant_incpa)
            LIMIT 1
        LOOP
            porcentaje_utilidad := v_rango.porcentaje_util_incpa;
            precio_venta_sin_iva := ROUND(v_precio_compra * (1 + porcentaje_utilidad / 100), 4);
            precio_venta_con_iva := ROUND(precio_venta_sin_iva * (1 + v_iva_factor), 2);

            utilidad := ROUND(precio_venta_sin_iva - v_precio_compra, 2);
            utilidad_neta := ROUND(utilidad * p_cantidad, 2);
            porcentaje_utilidad_real := ROUND((utilidad / v_precio_compra) * 100, 2);

            cantidad := p_cantidad;
            precio_ultima_compra := v_precio_compra;
            fecha_ultima_compra := v_fecha_compra;
            porcentaje_iva := v_iva;
            valor_total_con_iva := ROUND(p_cantidad * precio_venta_con_iva, 2);
            forma_pago_config := v_rango.ide_cndfp;

            tipo_configuracion := 'PORCENTAJE_APROXIMADO';
            IF v_rango.rango2_cant_incpa IS NULL THEN
                rango_aplicado := '≈ ' || f_decimales(v_rango.rango1_cant_incpa, v_decim_stock_inarti);
            ELSE
                rango_aplicado := f_decimales(v_rango.rango1_cant_incpa, v_decim_stock_inarti) || ' ≤x< ' || f_decimales(v_rango.rango2_cant_incpa, v_decim_stock_inarti);
            END IF;
            configuracion_prioridad := 4;

            RETURN NEXT;
        END LOOP;
    END IF;

    -- Si no se encontró nada
    IF NOT FOUND THEN
        cantidad := p_cantidad;
        precio_ultima_compra := v_precio_compra;
        fecha_ultima_compra := v_fecha_compra;
        precio_venta_sin_iva := NULL;
        precio_venta_con_iva := NULL;
        porcentaje_utilidad := NULL;
        porcentaje_iva := v_iva;
        utilidad := NULL;
        valor_total_con_iva := NULL;
        rango_aplicado := 'Sin configuración encontrada';
        forma_pago_config := NULL;
        utilidad_neta := NULL;
        porcentaje_utilidad_real := NULL;
        configuracion_prioridad := NULL;
        tipo_configuracion := NULL;
        RETURN NEXT;
    END IF;
END;
$$ LANGUAGE plpgsql;



-- SELECT * FROM f_calcula_precio_venta (1704, 25);
-- SELECT * FROM f_calcula_precio_venta(1704, 220,1);
-- SELECT * FROM f_calcula_precio_venta (1704, 4,null,1.15);  -- con precio de compra
