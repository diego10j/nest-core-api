CREATE OR REPLACE FUNCTION f_calcula_precio_venta(p_ide_inarti INT, p_cantidad DECIMAL)
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
    rango_aplicado VARCHAR(100)  -- New column to show which range was applied
)
AS
$$
DECLARE
    v_precio_compra DECIMAL(12,2) := 0;
    v_fecha_compra DATE;
    v_iva DECIMAL(5,2);
    v_iva_factor DECIMAL(12,6);
    v_rango RECORD;
    v_precio_venta_sin_iva DECIMAL(12,2);
    v_porcentaje_utilidad DECIMAL(12,2);
    v_precio_con_iva DECIMAL(12,2);
    v_utilidad DECIMAL(12,2);
    v_cantidad_aplicada DECIMAL;
    v_min_rango1 DECIMAL;
BEGIN
    -- Obtener el porcentaje de IVA vigente
    SELECT porcentaje_cnpim * 100
    INTO v_iva
    FROM con_porcen_impues
    WHERE CURRENT_DATE BETWEEN fecha_desde_cnpim AND fecha_fin_cnpim
      AND activo_cnpim = true
    ORDER BY fecha_desde_cnpim DESC
    LIMIT 1;

    IF v_iva IS NULL THEN
        RAISE EXCEPTION 'No se encontró porcentaje de IVA activo para la fecha actual';
    END IF;
    
    v_iva_factor := v_iva / 100;

    -- Obtener último precio de compra
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
          WHERE t.ide_intti = c.ide_intti AND e.signo_intci = 1
      )
    ORDER BY c.fecha_trans_incci DESC
    LIMIT 1;

    -- Find the minimum rango1 value for this product
    SELECT MIN(rango1_cant_incpa)
    INTO v_min_rango1
    FROM inv_conf_precios_articulo
    WHERE ide_inarti = p_ide_inarti AND activo_incpa = true;

    -- Determine the quantity to use for price calculation
    IF p_cantidad < v_min_rango1 THEN
        v_cantidad_aplicada := v_min_rango1;
    ELSE
        v_cantidad_aplicada := p_cantidad;
    END IF;

    -- Buscar configuración de precio para la cantidad aplicada
    SELECT *
    INTO v_rango
    FROM inv_conf_precios_articulo
    WHERE ide_inarti = p_ide_inarti
      AND activo_incpa = true
      AND (
          (rango1_cant_incpa IS NOT NULL AND rango2_cant_incpa IS NOT NULL 
           AND v_cantidad_aplicada >= rango1_cant_incpa AND v_cantidad_aplicada < rango2_cant_incpa)
          OR (rango1_cant_incpa IS NOT NULL AND rango2_cant_incpa IS NULL 
              AND v_cantidad_aplicada >= rango1_cant_incpa)
      )
    ORDER BY rango1_cant_incpa
    LIMIT 1;

    -- If no range found (shouldn't happen if v_cantidad_aplicada >= min_rango1)
    IF v_rango IS NULL THEN
        -- Try to get the highest range (where rango2 is NULL)
        SELECT *
        INTO v_rango
        FROM inv_conf_precios_articulo
        WHERE ide_inarti = p_ide_inarti
          AND activo_incpa = true
          AND rango1_cant_incpa IS NOT NULL
          AND rango2_cant_incpa IS NULL
        ORDER BY rango1_cant_incpa DESC
        LIMIT 1;
    END IF;

    -- Calcular precio de venta sin IVA
    IF v_rango.precio_fijo_incpa IS NOT NULL THEN
        v_precio_venta_sin_iva := v_rango.precio_fijo_incpa;
        v_porcentaje_utilidad := NULL;
    ELSE
        v_porcentaje_utilidad := v_rango.porcentaje_util_incpa;
        v_precio_venta_sin_iva := ROUND(v_precio_compra * (1 + v_porcentaje_utilidad / 100), 2);
    END IF;

    -- Calcular utilidad (ganancia)
    v_utilidad := ROUND((v_precio_venta_sin_iva - v_precio_compra) * p_cantidad, 2);

    -- Calcular precio con IVA
    IF v_rango.incluye_iva_incpa = FALSE THEN
        v_precio_con_iva := ROUND(v_precio_venta_sin_iva * (1 + v_iva_factor), 2);
    ELSE
        v_precio_con_iva := v_precio_venta_sin_iva;
    END IF;

    -- Asignar valores a retornar
    cantidad := p_cantidad;
    precio_ultima_compra := v_precio_compra;
    fecha_ultima_compra := v_fecha_compra;
    precio_venta_sin_iva := v_precio_venta_sin_iva;
    precio_venta_con_iva := v_precio_con_iva;
    porcentaje_utilidad := v_porcentaje_utilidad;
    porcentaje_iva := v_iva;
    utilidad := v_utilidad;
    valor_total_con_iva := ROUND(p_cantidad * v_precio_con_iva, 2);
    
    -- Show which range was applied
    IF p_cantidad < v_min_rango1 THEN
        rango_aplicado := 'MIN(' || v_min_rango1 || ')';
    ELSIF v_rango.rango2_cant_incpa IS NULL THEN
        rango_aplicado := '≥' || v_rango.rango1_cant_incpa;
    ELSE
        rango_aplicado := v_rango.rango1_cant_incpa || '≤x<' || v_rango.rango2_cant_incpa;
    END IF;

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;




-- SELECT * FROM f_calcula_precio_venta (1704, 25);