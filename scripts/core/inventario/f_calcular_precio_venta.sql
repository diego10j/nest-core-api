CREATE OR REPLACE FUNCTION f_calcula_precio_venta(
    p_ide_inarti INT,
    p_cantidad DECIMAL,
    p_ide_cndfp INT DEFAULT NULL
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
    forma_pago_config INT
)
AS
$$
DECLARE
    v_precio_compra DECIMAL(12,2) := 0;
    v_fecha_compra DATE;
    v_iva DECIMAL(5,2);
    v_iva_factor DECIMAL(12,6);
    v_cantidad_aplicada DECIMAL;
    v_min_rango1 DECIMAL;
    v_rango RECORD;
    v_ide_cncfp INT; -- Variable para almacenar la cabecera de forma de pago
    v_config_encontrada BOOLEAN := FALSE;
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

    -- Obtener cantidad mínima de configuración
    SELECT MIN(rango1_cant_incpa)
    INTO v_min_rango1
    FROM inv_conf_precios_articulo
    WHERE ide_inarti = p_ide_inarti AND activo_incpa = TRUE;

    v_cantidad_aplicada := CASE 
        WHEN p_cantidad < v_min_rango1 THEN v_min_rango1
        ELSE p_cantidad
    END;

    -- Obtener cabecera de forma de pago si se proporcionó un detalle
    IF p_ide_cndfp IS NOT NULL THEN
        SELECT ide_cncfp INTO v_ide_cncfp 
        FROM con_deta_forma_pago 
        WHERE ide_cndfp = p_ide_cndfp;
    END IF;

    -- 1) Busqueda específica por p_ide_cndfp
    IF p_ide_cndfp IS NOT NULL THEN
        SELECT * INTO v_rango
        FROM inv_conf_precios_articulo
        WHERE ide_inarti = p_ide_inarti
          AND activo_incpa = TRUE
          AND ide_cndfp = p_ide_cndfp
          AND (
              (rango1_cant_incpa IS NOT NULL AND rango2_cant_incpa IS NOT NULL AND v_cantidad_aplicada >= rango1_cant_incpa AND v_cantidad_aplicada < rango2_cant_incpa)
              OR (rango1_cant_incpa IS NOT NULL AND rango2_cant_incpa IS NULL AND v_cantidad_aplicada >= rango1_cant_incpa)
          )
        ORDER BY rango1_cant_incpa
        LIMIT 1;

        v_config_encontrada := FOUND;
    END IF;

    -- 2) Si no existe, usar v_ide_cncfp para busqueda por cabecera de forma de pago
    IF NOT v_config_encontrada AND v_ide_cncfp IS NOT NULL THEN
        SELECT * INTO v_rango
        FROM inv_conf_precios_articulo
        WHERE ide_inarti = p_ide_inarti
          AND activo_incpa = TRUE
          AND ide_cncfp = v_ide_cncfp
          AND (
              (rango1_cant_incpa IS NOT NULL AND rango2_cant_incpa IS NOT NULL AND v_cantidad_aplicada >= rango1_cant_incpa AND v_cantidad_aplicada < rango2_cant_incpa)
              OR (rango1_cant_incpa IS NOT NULL AND rango2_cant_incpa IS NULL AND v_cantidad_aplicada >= rango1_cant_incpa)
          )
        ORDER BY rango1_cant_incpa
        LIMIT 1;

        v_config_encontrada := FOUND;
    END IF;

    -- 3) Si no existe, buscar configuración solo por rango de p_cantidad, priorizando forma de pago efectivo (ide_cndfp=1 o ide_cncfp=0)
    IF NOT v_config_encontrada THEN
        WITH configuraciones AS (
            SELECT *,
                CASE
                    WHEN ide_cndfp = 1 OR ide_cncfp = 0 THEN 1 -- Prioridad máxima a efectivo
                    WHEN ide_cndfp IS NULL AND ide_cncfp IS NULL THEN 2 -- Configuraciones generales
                    ELSE 3 -- Otras formas de pago
                END AS prioridad
            FROM inv_conf_precios_articulo
            WHERE ide_inarti = p_ide_inarti
              AND activo_incpa = TRUE
              AND (
                  (rango1_cant_incpa IS NOT NULL AND rango2_cant_incpa IS NOT NULL AND v_cantidad_aplicada >= rango1_cant_incpa AND v_cantidad_aplicada < rango2_cant_incpa)
                  OR (rango1_cant_incpa IS NOT NULL AND rango2_cant_incpa IS NULL AND v_cantidad_aplicada >= rango1_cant_incpa)
              )
        )
        SELECT * INTO v_rango
        FROM configuraciones
        ORDER BY prioridad, rango1_cant_incpa
        LIMIT 1;

        v_config_encontrada := FOUND;
    END IF;

    -- 4) Si no existen configuraciones, retornar null en precio venta y demás valores calculados
    IF NOT v_config_encontrada THEN
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
        RETURN NEXT;
        RETURN;
    END IF;

    -- Calcular precios y utilidades
    IF v_rango.precio_fijo_incpa IS NOT NULL THEN
        precio_venta_sin_iva := v_rango.precio_fijo_incpa;
        porcentaje_utilidad := NULL;
    ELSE
        porcentaje_utilidad := v_rango.porcentaje_util_incpa;
        precio_venta_sin_iva := ROUND(v_precio_compra * (1 + porcentaje_utilidad / 100), 2);
    END IF;

    utilidad := ROUND((precio_venta_sin_iva - v_precio_compra) * p_cantidad, 2);

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
-- SELECT * FROM f_calcula_precio_venta(1704, 220,1);
