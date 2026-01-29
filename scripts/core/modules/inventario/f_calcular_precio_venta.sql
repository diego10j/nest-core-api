-- VERSIÓN f_calcula_precio_venta CORREGIDA
-- Corrección completa de lógica de búsqueda y validaciones
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
BEGIN
    -- Validar cantidad
    IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
        RAISE EXCEPTION 'La cantidad debe ser mayor a cero';
    END IF;

    -- Obtener IVA actual
    SELECT porcentaje_cnpim * 100 INTO v_iva
    FROM con_porcen_impues
    WHERE CURRENT_DATE BETWEEN fecha_desde_cnpim AND fecha_fin_cnpim
      AND activo_cnpim = TRUE
    ORDER BY fecha_desde_cnpim DESC LIMIT 1;

    IF v_iva IS NULL THEN
        RAISE EXCEPTION 'No se encontró porcentaje de IVA activo para la fecha actual';
    END IF;
    v_iva_factor := v_iva / 100;

    -- Obtener decimales del artículo
    SELECT decim_stock_inarti INTO v_decim_stock_inarti 
    FROM inv_articulo 
    WHERE ide_inarti = p_ide_inarti;
    
    IF v_decim_stock_inarti IS NULL THEN 
        v_decim_stock_inarti := 2; 
    END IF;

    -- Obtener precio de compra
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
        
        -- Validar que exista precio de compra
        IF v_precio_compra IS NULL OR v_precio_compra <= 0 THEN
            v_precio_compra := NULL;
            v_fecha_compra := NULL;
        END IF;
    ELSE
        v_precio_compra := p_precio_compra;
        v_fecha_compra := NULL;
        
        -- Validar precio de compra proporcionado
        IF v_precio_compra <= 0 THEN
            RAISE EXCEPTION 'El precio de compra debe ser mayor a cero';
        END IF;
    END IF;

    -- ============================================================================
    -- PRIORIDAD 1: CONFIGURACIÓN EXACTA (cantidad exacta, sin rangos)
    -- ============================================================================
    SELECT * INTO v_rango 
    FROM inv_conf_precios_articulo
    WHERE ide_inarti = p_ide_inarti 
      AND activo_incpa = TRUE
      AND rangos_incpa = FALSE 
      AND rango1_cant_incpa = p_cantidad 
      AND rango2_cant_incpa IS NULL
      -- Filtro de forma de pago CORREGIDO
      AND (
          -- Si se especifica forma de pago, buscar solo esa o genéricas (NULL)
          (p_ide_cndfp IS NOT NULL AND (ide_cndfp = p_ide_cndfp OR ide_cndfp IS NULL))
          OR
          -- Si NO se especifica forma de pago, aceptar CUALQUIER configuración
          (p_ide_cndfp IS NULL)
      )
    ORDER BY 
        CASE 
            WHEN p_ide_cndfp IS NOT NULL AND ide_cndfp = p_ide_cndfp THEN 0  -- Forma de pago exacta
            WHEN ide_cndfp IS NULL THEN 1                                      -- Forma de pago genérica
            ELSE 2                                                             -- Otras formas de pago
        END
    LIMIT 1;

    IF FOUND THEN
        -- Validar que tenga precio fijo configurado
        IF v_rango.precio_fijo_incpa IS NULL OR v_rango.precio_fijo_incpa <= 0 THEN
            RAISE EXCEPTION 'Configuración exacta encontrada pero sin precio fijo válido';
        END IF;

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
        tipo_configuracion := 'PRECIO_FIJO_EXACTO';
        rango_aplicado := '= ' || f_decimales(v_rango.rango1_cant_incpa, v_decim_stock_inarti);
        configuracion_prioridad := 1;
        
        RETURN NEXT;
        RETURN;
    END IF;

    -- ============================================================================
    -- PRIORIDAD 2: CONFIGURACIÓN POR RANGOS
    -- ============================================================================
    SELECT * INTO v_rango
    FROM inv_conf_precios_articulo
    WHERE ide_inarti = p_ide_inarti 
      AND activo_incpa = TRUE
      AND rangos_incpa = TRUE 
      AND rango1_cant_incpa IS NOT NULL
      -- Aplicar lógica de rangos correctamente
      AND (
          -- Rango infinito: desde rango1 en adelante
          (rango2_cant_incpa IS NULL AND p_cantidad >= rango1_cant_incpa)
          OR
          -- Rango cerrado: desde rango1 hasta rango2 (inclusivo en ambos extremos)
          (rango2_cant_incpa IS NOT NULL AND p_cantidad >= rango1_cant_incpa AND p_cantidad <= rango2_cant_incpa)
      )
      -- Filtro de forma de pago CORREGIDO
      AND (
          -- Si se especifica forma de pago, buscar solo esa o genéricas (NULL)
          (p_ide_cndfp IS NOT NULL AND (ide_cndfp = p_ide_cndfp OR ide_cndfp IS NULL))
          OR
          -- Si NO se especifica forma de pago, aceptar CUALQUIER configuración
          (p_ide_cndfp IS NULL)
      )
    ORDER BY 
        -- Priorizar forma de pago específica sobre genérica
        CASE 
            WHEN p_ide_cndfp IS NOT NULL AND ide_cndfp = p_ide_cndfp THEN 0  -- Forma de pago exacta
            WHEN ide_cndfp IS NULL THEN 1                                      -- Forma de pago genérica
            ELSE 2                                                             -- Otras formas de pago
        END,
        -- Priorizar el rango más ajustado (menor límite inferior)
        rango1_cant_incpa DESC
    LIMIT 1;

    IF FOUND THEN
        -- Puede tener precio fijo O porcentaje de utilidad
        IF v_rango.precio_fijo_incpa IS NOT NULL AND v_rango.precio_fijo_incpa > 0 THEN
            -- PRECIO FIJO
            precio_venta_sin_iva := v_rango.precio_fijo_incpa;
            
            IF v_rango.incluye_iva_incpa THEN
                precio_venta_con_iva := ROUND(precio_venta_sin_iva, 2);
                precio_venta_sin_iva := ROUND(precio_venta_con_iva / (1 + v_iva_factor), 4);
            ELSE
                precio_venta_con_iva := ROUND(precio_venta_sin_iva * (1 + v_iva_factor), 2);
            END IF;
            
            porcentaje_utilidad := ROUND(((precio_venta_sin_iva - v_precio_compra) / v_precio_compra) * 100, 2);
            tipo_configuracion := 'PRECIO_FIJO_RANGO';
            
        ELSIF v_rango.porcentaje_util_incpa IS NOT NULL THEN
            -- PORCENTAJE DE UTILIDAD
            porcentaje_utilidad := v_rango.porcentaje_util_incpa;
            precio_venta_sin_iva := ROUND(v_precio_compra * (1 + porcentaje_utilidad / 100), 4);
            precio_venta_con_iva := ROUND(precio_venta_sin_iva * (1 + v_iva_factor), 2);
            tipo_configuracion := 'PORCENTAJE';
        ELSE
            RAISE EXCEPTION 'Configuración de rango encontrada pero sin precio fijo ni porcentaje de utilidad';
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
                              ' ≤ x ≤ ' || f_decimales(v_rango.rango2_cant_incpa, v_decim_stock_inarti);
        END IF;
        configuracion_prioridad := 2;
        
        RETURN NEXT;
        RETURN;
    END IF;

    -- ============================================================================
    -- PRIORIDAD 3: CONFIGURACIÓN APROXIMADA (precio fijo más cercano)
    -- ============================================================================
    -- Solo si no se encontró configuración exacta ni por rangos
    SELECT * INTO v_rango
    FROM inv_conf_precios_articulo
    WHERE ide_inarti = p_ide_inarti 
      AND activo_incpa = TRUE
      AND rangos_incpa = FALSE 
      AND rango2_cant_incpa IS NULL 
      AND rango1_cant_incpa IS NOT NULL
      AND precio_fijo_incpa IS NOT NULL
      AND precio_fijo_incpa > 0
      -- Filtro de forma de pago CORREGIDO
      AND (
          -- Si se especifica forma de pago, buscar solo esa o genéricas (NULL)
          (p_ide_cndfp IS NOT NULL AND (ide_cndfp = p_ide_cndfp OR ide_cndfp IS NULL))
          OR
          -- Si NO se especifica forma de pago, aceptar CUALQUIER configuración
          (p_ide_cndfp IS NULL)
      )
    ORDER BY 
        -- Priorizar forma de pago específica sobre genérica
        CASE 
            WHEN p_ide_cndfp IS NOT NULL AND ide_cndfp = p_ide_cndfp THEN 0  -- Forma de pago exacta
            WHEN ide_cndfp IS NULL THEN 1                                      -- Forma de pago genérica
            ELSE 2                                                             -- Otras formas de pago
        END,
        -- Buscar la cantidad más cercana
        ABS(p_cantidad - rango1_cant_incpa)
    LIMIT 1;

    IF FOUND THEN
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
        rango_aplicado := '≈ ' || f_decimales(v_rango.rango1_cant_incpa, v_decim_stock_inarti);
        configuracion_prioridad := 3;
        
        RETURN NEXT;
        RETURN;
    END IF;

    -- ============================================================================
    -- PRIORIDAD 4: PORCENTAJE APROXIMADO (rango con porcentaje más cercano)
    -- ============================================================================
    SELECT * INTO v_rango
    FROM inv_conf_precios_articulo
    WHERE ide_inarti = p_ide_inarti 
      AND activo_incpa = TRUE
      AND rangos_incpa = TRUE 
      AND rango1_cant_incpa IS NOT NULL 
      AND porcentaje_util_incpa IS NOT NULL
      -- Filtro de forma de pago CORREGIDO
      AND (
          -- Si se especifica forma de pago, buscar solo esa o genéricas (NULL)
          (p_ide_cndfp IS NOT NULL AND (ide_cndfp = p_ide_cndfp OR ide_cndfp IS NULL))
          OR
          -- Si NO se especifica forma de pago, aceptar CUALQUIER configuración
          (p_ide_cndfp IS NULL)
      )
    ORDER BY 
        -- Priorizar forma de pago específica sobre genérica
        CASE 
            WHEN p_ide_cndfp IS NOT NULL AND ide_cndfp = p_ide_cndfp THEN 0  -- Forma de pago exacta
            WHEN ide_cndfp IS NULL THEN 1                                      -- Forma de pago genérica
            ELSE 2                                                             -- Otras formas de pago
        END,
        -- Buscar el rango más cercano
        ABS(p_cantidad - rango1_cant_incpa)
    LIMIT 1;

    IF FOUND THEN
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
            rango_aplicado := '≈ ≥ ' || f_decimales(v_rango.rango1_cant_incpa, v_decim_stock_inarti);
        ELSE
            rango_aplicado := '≈ ' || f_decimales(v_rango.rango1_cant_incpa, v_decim_stock_inarti) || 
                              ' ≤ x ≤ ' || f_decimales(v_rango.rango2_cant_incpa, v_decim_stock_inarti);
        END IF;
        configuracion_prioridad := 4;
        
        RETURN NEXT;
        RETURN;
    END IF;

    -- ============================================================================
    -- SIN CONFIGURACIÓN ENCONTRADA
    -- ============================================================================
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
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- EJEMPLOS DE USO Y PRUEBAS
-- ============================================================================

-- Prueba básica
-- SELECT * FROM f_calcula_precio_venta(4532, 5);

-- Con forma de pago específica
-- SELECT * FROM f_calcula_precio_venta(4532, 220, 1);

-- Con precio de compra manual
-- SELECT * FROM f_calcula_precio_venta(4532, 4, NULL, 1.15);

-- Pruebas de rangos límite
-- SELECT * FROM f_calcula_precio_venta(4532, 1);    -- Límite inferior rango 1
-- SELECT * FROM f_calcula_precio_venta(4532, 5);    -- Límite superior rango 1
-- SELECT * FROM f_calcula_precio_venta(4532, 5.01); -- Inicio rango 2
-- SELECT * FROM f_calcula_precio_venta(4532, 24);   -- Límite superior rango 2
-- SELECT * FROM f_calcula_precio_venta(4532, 25);   -- Rango infinito