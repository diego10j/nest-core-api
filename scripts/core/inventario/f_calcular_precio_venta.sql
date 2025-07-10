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
AS $$
DECLARE
    v_precio_compra DECIMAL(12,2) := 0;
    v_fecha_compra DATE;
    v_iva DECIMAL(5,2);
    v_iva_factor DECIMAL(12,6);
    v_cantidad_aplicada DECIMAL;
    v_min_rango1 DECIMAL;
    v_ide_cncfp INT;
    v_config RECORD;
    v_rango RECORD;
BEGIN
    -- Obtener IVA actual
    SELECT porcentaje_cnpim * 100
    INTO v_iva
    FROM con_porcen_impues
    WHERE CURRENT_DATE BETWEEN fecha_desde_cnpim AND fecha_fin_cnpim
      AND activo_cnpim = TRUE
    ORDER BY fecha_desde_cnpim DESC
    LIMIT 1;

    IF v_iva IS NULL THEN
        RAISE EXCEPTION 'No se encontró porcentaje de IVA activo para la fecha actual';
    END IF;

    v_iva_factor := v_iva / 100;

    -- Obtener último precio de compra solo si no se proporcionó
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
              WHERE t.ide_intti = c.ide_intti AND e.signo_intci = 1
          )
        ORDER BY c.fecha_trans_incci DESC
        LIMIT 1;
    ELSE
        v_precio_compra := p_precio_compra;
        v_fecha_compra := NULL;
    END IF;

    -- Obtener cantidad mínima de configuración (excluyendo precios fijos sin rango)
    SELECT MIN(rango1_cant_incpa)
    INTO v_min_rango1
    FROM inv_conf_precios_articulo
    WHERE ide_inarti = p_ide_inarti 
      AND activo_incpa = TRUE
      AND (precio_fijo_incpa IS NULL OR (rango1_cant_incpa IS NOT NULL AND rango2_cant_incpa IS NOT NULL));

    -- Determinar cantidad aplicada
    v_cantidad_aplicada := CASE 
        WHEN p_cantidad < COALESCE(v_min_rango1, 1) THEN COALESCE(v_min_rango1, 1)
        ELSE p_cantidad
    END;

    -- Obtener cabecera de forma de pago si se proporcionó un detalle
    IF p_ide_cndfp IS NOT NULL THEN
        SELECT ide_cncfp INTO v_ide_cncfp 
        FROM con_deta_forma_pago 
        WHERE ide_cndfp = p_ide_cndfp;
    END IF;

    -- Crear tabla temporal para almacenar configuraciones con prioridad
    CREATE TEMP TABLE temp_configuraciones AS
    WITH configs AS (
        SELECT 
            ide_incpa,
            ide_inarti,
            ide_cncfp,
            ide_cndfp,
            rango1_cant_incpa,
            rango2_cant_incpa,
            porcentaje_util_incpa,
            precio_fijo_incpa,
            incluye_iva_incpa,
            activo_incpa,
            -- Tipo de configuración
            CASE
                WHEN precio_fijo_incpa IS NOT NULL AND rango1_cant_incpa IS NULL AND rango2_cant_incpa IS NULL THEN 'PRECIO_FIJO_TODAS'
                WHEN precio_fijo_incpa IS NOT NULL THEN 'PRECIO_FIJO_RANGO'
                ELSE 'PORCENTAJE'
            END AS tipo_config,
            -- Prioridad 1: Exact match por forma de pago y rango
            CASE
                WHEN ide_cndfp = p_ide_cndfp AND (
                    (precio_fijo_incpa IS NOT NULL AND rango1_cant_incpa IS NULL AND rango2_cant_incpa IS NULL) OR -- Precio fijo para todas
                    (precio_fijo_incpa IS NOT NULL AND rango1_cant_incpa IS NOT NULL AND (
                        (rango2_cant_incpa IS NOT NULL AND p_cantidad >= rango1_cant_incpa AND p_cantidad < rango2_cant_incpa) OR
                        (rango2_cant_incpa IS NULL AND p_cantidad >= rango1_cant_incpa)
                    ) OR
                    (porcentaje_util_incpa IS NOT NULL AND (
                        (rango1_cant_incpa IS NOT NULL AND rango2_cant_incpa IS NOT NULL AND v_cantidad_aplicada >= rango1_cant_incpa AND v_cantidad_aplicada < rango2_cant_incpa) OR
                        (rango1_cant_incpa IS NOT NULL AND rango2_cant_incpa IS NULL AND v_cantidad_aplicada >= rango1_cant_incpa)
                    )
                ) THEN 1
                -- Prioridad 2: Efectivo (ide_cndfp=1 o ide_cncfp=0)
                WHEN (ide_cndfp = 1 OR ide_cncfp = 0) AND (
                    (precio_fijo_incpa IS NOT NULL AND rango1_cant_incpa IS NULL AND rango2_cant_incpa IS NULL) OR
                    (precio_fijo_incpa IS NOT NULL AND rango1_cant_incpa IS NOT NULL AND (
                        (rango2_cant_incpa IS NOT NULL AND p_cantidad >= rango1_cant_incpa AND p_cantidad < rango2_cant_incpa) OR
                        (rango2_cant_incpa IS NULL AND p_cantidad >= rango1_cant_incpa)
                    ) OR
                    (porcentaje_util_incpa IS NOT NULL AND (
                        (rango1_cant_incpa IS NOT NULL AND rango2_cant_incpa IS NOT NULL AND v_cantidad_aplicada >= rango1_cant_incpa AND v_cantidad_aplicada < rango2_cant_incpa) OR
                        (rango1_cant_incpa IS NOT NULL AND rango2_cant_incpa IS NULL AND v_cantidad_aplicada >= rango1_cant_incpa)
                    )
                )) THEN 2
                -- Prioridad 3: Configuraciones generales (sin forma de pago)
                WHEN ide_cndfp IS NULL AND ide_cncfp IS NULL AND (
                    (precio_fijo_incpa IS NOT NULL AND rango1_cant_incpa IS NULL AND rango2_cant_incpa IS NULL) OR
                    (precio_fijo_incpa IS NOT NULL AND rango1_cant_incpa IS NOT NULL AND (
                        (rango2_cant_incpa IS NOT NULL AND p_cantidad >= rango1_cant_incpa AND p_cantidad < rango2_cant_incpa) OR
                        (rango2_cant_incpa IS NULL AND p_cantidad >= rango1_cant_incpa)
                    ) OR
                    (porcentaje_util_incpa IS NOT NULL AND (
                        (rango1_cant_incpa IS NOT NULL AND rango2_cant_incpa IS NOT NULL AND v_cantidad_aplicada >= rango1_cant_incpa AND v_cantidad_aplicada < rango2_cant_incpa) OR
                        (rango1_cant_incpa IS NOT NULL AND rango2_cant_incpa IS NULL AND v_cantidad_aplicada >= rango1_cant_incpa)
                    )
                )) THEN 3
                -- Prioridad 4: Otras formas de pago
                ELSE 4
            END AS prioridad,
            -- Orden secundario: precios fijos primero, luego rangos más específicos
            CASE
                WHEN precio_fijo_incpa IS NOT NULL AND rango1_cant_incpa IS NULL THEN 0 -- Precio fijo para todas
                WHEN precio_fijo_incpa IS NOT NULL THEN 1 -- Precio fijo por rango
                WHEN rango1_cant_incpa IS NOT NULL AND rango2_cant_incpa IS NOT NULL THEN rango2_cant_incpa - rango1_cant_incpa -- Rangos más específicos primero
                ELSE 9999
            END AS orden_secundario
        FROM inv_conf_precios_articulo
        WHERE ide_inarti = p_ide_inarti
          AND activo_incpa = TRUE
          AND (
              -- Precios fijos para todas las cantidades
              (precio_fijo_incpa IS NOT NULL AND rango1_cant_incpa IS NULL AND rango2_cant_incpa IS NULL) OR
              -- Precios fijos para rangos específicos
              (precio_fijo_incpa IS NOT NULL AND rango1_cant_incpa IS NOT NULL AND (
                  (rango2_cant_incpa IS NOT NULL AND p_cantidad >= rango1_cant_incpa AND p_cantidad < rango2_cant_incpa) OR
                  (rango2_cant_incpa IS NULL AND p_cantidad >= rango1_cant_incpa)
              )) OR
              -- Porcentajes para rangos
              (porcentaje_util_incpa IS NOT NULL AND (
                  (rango1_cant_incpa IS NOT NULL AND rango2_cant_incpa IS NOT NULL AND v_cantidad_aplicada >= rango1_cant_incpa AND v_cantidad_aplicada < rango2_cant_incpa) OR
                  (rango1_cant_incpa IS NOT NULL AND rango2_cant_incpa IS NULL AND v_cantidad_aplicada >= rango1_cant_incpa)
              ))
          )
          AND (
              p_ide_cndfp IS NULL 
              OR ide_cndfp = p_ide_cndfp 
              OR (v_ide_cncfp IS NOT NULL AND ide_cncfp = v_ide_cncfp)
              OR (ide_cndfp IS NULL AND ide_cncfp IS NULL)
          )
    )
    SELECT * FROM configs
    ORDER BY prioridad, orden_secundario, rango1_cant_incpa;

    -- Si no hay configuraciones, retornar valores nulos
    IF NOT EXISTS (SELECT 1 FROM temp_configuraciones) THEN
        DROP TABLE temp_configuraciones;
        
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
        RETURN;
    END IF;

    -- Retornar todas las configuraciones encontradas, ordenadas por prioridad
    FOR v_rango IN SELECT * FROM temp_configuraciones LOOP
        -- Calcular precios y utilidades
        IF v_rango.precio_fijo_incpa IS NOT NULL THEN
            precio_venta_sin_iva := v_rango.precio_fijo_incpa;
            porcentaje_utilidad := NULL;
            porcentaje_utilidad_real := CASE 
                WHEN v_precio_compra > 0 THEN ROUND(((precio_venta_sin_iva - v_precio_compra) / v_precio_compra) * 100, 2)
                ELSE NULL
            END;
        ELSE
            porcentaje_utilidad := v_rango.porcentaje_util_incpa;
            precio_venta_sin_iva := ROUND(v_precio_compra * (1 + porcentaje_utilidad / 100), 2);
            porcentaje_utilidad_real := porcentaje_utilidad;
        END IF;

        utilidad := ROUND(precio_venta_sin_iva - v_precio_compra, 2);
        utilidad_neta := ROUND(utilidad * p_cantidad, 2);

        IF v_rango.incluye_iva_incpa = FALSE THEN
            precio_venta_con_iva := ROUND(precio_venta_sin_iva * (1 + v_iva_factor), 2);
        ELSE
            precio_venta_con_iva := precio_venta_sin_iva;
        END IF;

        cantidad := p_cantidad;
        precio_ultima_compra := v_precio_compra;
        fecha_ultima_compra := v_fecha_compra;
        porcentaje_iva := v_iva;
        valor_total_con_iva := ROUND(p_cantidad * precio_venta_con_iva, 2);
        forma_pago_config := v_rango.ide_cndfp;
        configuracion_prioridad := v_rango.prioridad;
        tipo_configuracion := v_rango.tipo_config;

        -- Determinar el rango aplicado para mostrar
        IF v_rango.precio_fijo_incpa IS NOT NULL AND v_rango.rango1_cant_incpa IS NULL THEN
            rango_aplicado := 'PRECIO_FIJO_TODAS_CANT';
        ELSIF v_rango.rango1_cant_incpa = 1 AND v_rango.precio_fijo_incpa IS NOT NULL THEN
            rango_aplicado := 'PRECIO_FIJO_CANT=1';
        ELSIF v_rango.precio_fijo_incpa IS NOT NULL THEN
            rango_aplicado := 'PRECIO_FIJO_' || 
                CASE WHEN v_rango.rango2_cant_incpa IS NULL THEN '≥' || v_rango.rango1_cant_incpa
                     ELSE v_rango.rango1_cant_incpa || '≤x<' || v_rango.rango2_cant_incpa END;
        ELSIF p_cantidad < v_min_rango1 THEN
            rango_aplicado := 'MIN(' || v_min_rango1 || ')';
        ELSIF v_rango.rango2_cant_incpa IS NULL THEN
            rango_aplicado := '≥' || v_rango.rango1_cant_incpa;
        ELSE
            rango_aplicado := v_rango.rango1_cant_incpa || '≤x<' || v_rango.rango2_cant_incpa;
        END IF;

        RETURN NEXT;
    END LOOP;

    DROP TABLE temp_configuraciones;
END;
$$ LANGUAGE plpgsql;


-- SELECT * FROM f_calcula_precio_venta (1704, 25);
-- SELECT * FROM f_calcula_precio_venta(1704, 220,1);
-- SELECT * FROM f_calcula_precio_venta (1704, 4,null,1.15);  -- con precio de compra
