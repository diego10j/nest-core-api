-- Versión optimizada de la función f_generar_config_precios
-- Se mejora el manejo de rangos, validación y generación segura de configuraciones

CREATE OR REPLACE FUNCTION f_generar_config_precios(
    id_empresa BIGINT,
    p_ide_inarti INT,
    p_fecha_inicio DATE,
    p_fecha_fin DATE,
    p_login TEXT DEFAULT 'sa'
) RETURNS VOID AS $$
DECLARE
    v_count INT;
    v_min_cantidad DECIMAL(12,3);
    v_max_cantidad DECIMAL(12,3);
    v_avg_porcentaje DECIMAL(12,2);
    v_precio_compra DECIMAL(12,2);
    v_total_ventas INT;
    v_percentiles DECIMAL(12,3)[];
    v_rango_actual DECIMAL(12,3);
    v_siguiente_rango DECIMAL(12,3);
    v_porcentaje_promedio DECIMAL(12,2);
    v_rangos_bajos INT := 3;
    v_rangos_medios INT := 4;
    v_rangos_altos INT := 3;
    v_punto_corte_bajo DECIMAL(12,3);
    v_punto_corte_alto DECIMAL(12,3);
    v_forma_pago RECORD;
    v_ide_cncfp INT;
    i INT;
BEGIN
    -- Validar que el artículo existe
    SELECT COUNT(*) INTO v_count FROM inv_articulo WHERE ide_inarti = p_ide_inarti;
    IF v_count = 0 THEN
        RAISE EXCEPTION 'El artículo con ID % no existe', p_ide_inarti;
    END IF;

    -- Crear tabla temporal con datos de ventas
    CREATE TEMP TABLE temp_ventas_producto AS
    SELECT * FROM f_utilidad_producto(id_empresa, p_ide_inarti, p_fecha_inicio, p_fecha_fin);

    -- Verificar que hay datos
    SELECT COUNT(*) INTO v_count FROM temp_ventas_producto;
    IF v_count = 0 THEN
        DROP TABLE temp_ventas_producto;
        RAISE EXCEPTION 'No hay datos de ventas para el artículo % en el período % a %', 
            p_ide_inarti, p_fecha_inicio, p_fecha_fin;
    END IF;

    -- Eliminar configuraciones previas no autorizadas
    DELETE FROM inv_conf_precios_articulo 
    WHERE ide_inarti = p_ide_inarti AND autorizado_incpa = FALSE;

    -- Procesar por forma de pago
    FOR v_forma_pago IN 
        SELECT DISTINCT ide_cndfp, nombre_cndfp 
        FROM temp_ventas_producto 
        WHERE ide_cndfp IS NOT NULL
    LOOP
        -- Obtener configuración de forma de pago
        SELECT ide_cncfp INTO v_ide_cncfp 
        FROM con_deta_forma_pago 
        WHERE ide_cndfp = v_forma_pago.ide_cndfp;

        -- Obtener estadísticas básicas
        SELECT 
            MIN(cantidad_ccdfa), 
            MAX(cantidad_ccdfa),
            AVG(porcentaje_utilidad),
            MAX(precio_compra),
            COUNT(*)
        INTO 
            v_min_cantidad, 
            v_max_cantidad,
            v_avg_porcentaje,
            v_precio_compra,
            v_total_ventas
        FROM temp_ventas_producto
        WHERE ide_cndfp = v_forma_pago.ide_cndfp;

        -- Calcular puntos de corte usando percentiles
        SELECT 
            COALESCE(percentile_cont(0.3) WITHIN GROUP (ORDER BY cantidad_ccdfa), 0),
            COALESCE(percentile_cont(0.7) WITHIN GROUP (ORDER BY cantidad_ccdfa), 0)
        INTO 
            v_punto_corte_bajo,
            v_punto_corte_alto
        FROM temp_ventas_producto
        WHERE ide_cndfp = v_forma_pago.ide_cndfp;

        -- Si no hay suficientes datos, usar valores por defecto
        IF v_punto_corte_bajo IS NULL THEN
            v_punto_corte_bajo := v_min_cantidad;
        END IF;
        IF v_punto_corte_alto IS NULL THEN
            v_punto_corte_alto := v_max_cantidad;
        END IF;

        -- Rangos bajos (0% - 30%)
        v_percentiles := ARRAY[]::DECIMAL(12,3)[];
        FOR i IN 1..v_rangos_bajos LOOP
            SELECT COALESCE(percentile_cont((i::float/v_rangos_bajos * 0.3)::double precision) 
                   WITHIN GROUP (ORDER BY cantidad_ccdfa), 0)
            INTO v_siguiente_rango
            FROM temp_ventas_producto
            WHERE cantidad_ccdfa <= v_punto_corte_bajo 
            AND ide_cndfp = v_forma_pago.ide_cndfp;
            
            v_percentiles := array_append(v_percentiles, v_siguiente_rango);
        END LOOP;

        v_rango_actual := v_min_cantidad;
        FOR i IN 1..array_length(v_percentiles, 1) LOOP
            v_siguiente_rango := v_percentiles[i];
            IF v_siguiente_rango > v_rango_actual THEN
                SELECT AVG(porcentaje_utilidad) INTO v_porcentaje_promedio
                FROM temp_ventas_producto
                WHERE cantidad_ccdfa >= v_rango_actual 
                AND cantidad_ccdfa < v_siguiente_rango
                AND ide_cndfp = v_forma_pago.ide_cndfp;
                
                IF v_porcentaje_promedio IS NOT NULL THEN
                    PERFORM insertar_config_precio(
                        p_ide_inarti, v_rango_actual, v_siguiente_rango, 
                        id_empresa, COALESCE(v_porcentaje_promedio, v_avg_porcentaje), FALSE, 
                        TRUE, FALSE, p_login, v_forma_pago.ide_cndfp, v_ide_cncfp, 
                        'Config automática (' || v_forma_pago.nombre_cndfp || ') ' || p_fecha_inicio || ' a ' || p_fecha_fin
                    );
                END IF;
                v_rango_actual := v_siguiente_rango;
            END IF;
        END LOOP;

        -- Rangos medios (30% - 70%)
        v_percentiles := ARRAY[]::DECIMAL(12,3)[];
        FOR i IN 1..v_rangos_medios LOOP
            SELECT COALESCE(percentile_cont((0.3 + (i::float/v_rangos_medios * 0.4))::double precision) 
                   WITHIN GROUP (ORDER BY cantidad_ccdfa), 0)
            INTO v_siguiente_rango
            FROM temp_ventas_producto
            WHERE cantidad_ccdfa > v_punto_corte_bajo 
            AND cantidad_ccdfa <= v_punto_corte_alto 
            AND ide_cndfp = v_forma_pago.ide_cndfp;
            
            v_percentiles := array_append(v_percentiles, v_siguiente_rango);
        END LOOP;

        v_rango_actual := v_punto_corte_bajo;
        FOR i IN 1..array_length(v_percentiles, 1) LOOP
            v_siguiente_rango := v_percentiles[i];
            IF v_siguiente_rango > v_rango_actual THEN
                SELECT AVG(porcentaje_utilidad) INTO v_porcentaje_promedio
                FROM temp_ventas_producto
                WHERE cantidad_ccdfa >= v_rango_actual 
                AND cantidad_ccdfa < v_siguiente_rango
                AND ide_cndfp = v_forma_pago.ide_cndfp;
                
                IF v_porcentaje_promedio IS NOT NULL THEN
                    PERFORM insertar_config_precio(
                        p_ide_inarti, v_rango_actual, v_siguiente_rango, 
                        id_empresa, COALESCE(v_porcentaje_promedio, v_avg_porcentaje), FALSE, 
                        TRUE, FALSE, p_login, v_forma_pago.ide_cndfp, v_ide_cncfp, 
                        'Config automática (' || v_forma_pago.nombre_cndfp || ') ' || p_fecha_inicio || ' a ' || p_fecha_fin
                    );
                END IF;
                v_rango_actual := v_siguiente_rango;
            END IF;
        END LOOP;

        -- Rangos altos (70% - 100%)
        v_percentiles := ARRAY[]::DECIMAL(12,3)[];
        FOR i IN 1..v_rangos_altos LOOP
            SELECT COALESCE(percentile_cont((0.7 + (i::float/v_rangos_altos * 0.3))::double precision) 
                   WITHIN GROUP (ORDER BY cantidad_ccdfa), 0)
            INTO v_siguiente_rango
            FROM temp_ventas_producto
            WHERE cantidad_ccdfa > v_punto_corte_alto 
            AND ide_cndfp = v_forma_pago.ide_cndfp;
            
            v_percentiles := array_append(v_percentiles, v_siguiente_rango);
        END LOOP;

        v_rango_actual := v_punto_corte_alto;
        FOR i IN 1..array_length(v_percentiles, 1) LOOP
            v_siguiente_rango := v_percentiles[i];
            IF v_siguiente_rango > v_rango_actual THEN
                SELECT AVG(porcentaje_utilidad) INTO v_porcentaje_promedio
                FROM temp_ventas_producto
                WHERE cantidad_ccdfa >= v_rango_actual 
                AND cantidad_ccdfa < v_siguiente_rango
                AND ide_cndfp = v_forma_pago.ide_cndfp;
                
                IF v_porcentaje_promedio IS NOT NULL THEN
                    PERFORM insertar_config_precio(
                        p_ide_inarti, v_rango_actual, v_siguiente_rango, 
                        id_empresa, COALESCE(v_porcentaje_promedio, v_avg_porcentaje), FALSE, 
                        TRUE, FALSE, p_login, v_forma_pago.ide_cndfp, v_ide_cncfp, 
                        'Config automática (' || v_forma_pago.nombre_cndfp || ') ' || p_fecha_inicio || ' a ' || p_fecha_fin
                    );
                END IF;
                v_rango_actual := v_siguiente_rango;
            END IF;
        END LOOP;

        -- Rango infinito (último rango)
        SELECT AVG(porcentaje_utilidad) INTO v_porcentaje_promedio
        FROM temp_ventas_producto
        WHERE cantidad_ccdfa >= v_rango_actual 
        AND ide_cndfp = v_forma_pago.ide_cndfp;

        IF v_porcentaje_promedio IS NOT NULL THEN
            PERFORM insertar_config_precio(
                p_ide_inarti, v_rango_actual, NULL, 
                id_empresa, COALESCE(v_porcentaje_promedio, v_avg_porcentaje), FALSE, 
                TRUE, TRUE, p_login, v_forma_pago.ide_cndfp, v_ide_cncfp, 
                'Config automática (' || v_forma_pago.nombre_cndfp || ') ' || p_fecha_inicio || ' a ' || p_fecha_fin
            );
        END IF;
    END LOOP;

    DROP TABLE temp_ventas_producto;
    RAISE NOTICE 'Configuración de precios generada para el artículo %.', p_ide_inarti;
    
EXCEPTION
    WHEN OTHERS THEN
        DROP TABLE IF EXISTS temp_ventas_producto;
        RAISE;
END;
$$ LANGUAGE plpgsql;



--SELECT f_generar_config_precios(0, 1704, '2025-01-01', '2025-12-31');

-- Ver los resultados
--SELECT * FROM inv_conf_precios_articulo WHERE ide_inarti = 1704 ORDER BY rango1_cant_incpa;


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
            rangos_incpa,
            rango1_cant_incpa,
            rango2_cant_incpa,
            porcentaje_util_incpa,
            precio_fijo_incpa,
            incluye_iva_incpa,
            activo_incpa,
            -- Tipo de configuración
            CASE
                WHEN precio_fijo_incpa IS NOT NULL AND NOT rangos_incpa AND rango1_cant_incpa IS NOT NULL THEN 'PRECIO_FIJO_CANT_ESPECIFICA'
                WHEN precio_fijo_incpa IS NOT NULL AND NOT rangos_incpa AND rango1_cant_incpa IS NULL THEN 'PRECIO_FIJO_TODAS'
                WHEN precio_fijo_incpa IS NOT NULL AND rangos_incpa THEN 'PRECIO_FIJO_RANGO'
                WHEN porcentaje_util_incpa IS NOT NULL AND rangos_incpa THEN 'PORCENTAJE_RANGO'
                WHEN porcentaje_util_incpa IS NOT NULL AND NOT rangos_incpa AND rango1_cant_incpa IS NOT NULL THEN 'PORCENTAJE_CANT_ESPECIFICA'
                WHEN porcentaje_util_incpa IS NOT NULL AND NOT rangos_incpa AND rango1_cant_incpa IS NULL THEN 'PORCENTAJE_TODAS'
            END AS tipo_config,
            -- Prioridad 1: Configuración exacta para la cantidad (precio fijo específico)
            CASE
                WHEN precio_fijo_incpa IS NOT NULL AND NOT rangos_incpa AND rango1_cant_incpa = p_cantidad THEN 1
                -- Prioridad 2: Configuración exacta para la cantidad (% específico)
                WHEN porcentaje_util_incpa IS NOT NULL AND NOT rangos_incpa AND rango1_cant_incpa = p_cantidad THEN 2
                -- Prioridad 3: Configuración por rango que incluye la cantidad (precio fijo)
                WHEN precio_fijo_incpa IS NOT NULL AND rangos_incpa AND 
                     p_cantidad >= rango1_cant_incpa AND (rango2_cant_incpa IS NULL OR p_cantidad < rango2_cant_incpa) THEN 3
                -- Prioridad 4: Configuración por rango que incluye la cantidad (%)
                WHEN porcentaje_util_incpa IS NOT NULL AND rangos_incpa AND 
                     p_cantidad >= rango1_cant_incpa AND (rango2_cant_incpa IS NULL OR p_cantidad < rango2_cant_incpa) THEN 4
                -- Prioridad 5: Configuración para todas las cantidades (precio fijo)
                WHEN precio_fijo_incpa IS NOT NULL AND NOT rangos_incpa AND rango1_cant_incpa IS NULL THEN 5
                -- Prioridad 6: Configuración para todas las cantidades (%)
                WHEN porcentaje_util_incpa IS NOT NULL AND NOT rangos_incpa AND rango1_cant_incpa IS NULL THEN 6
                ELSE 99
            END AS prioridad,
            -- Orden secundario: precios fijos primero, luego rangos más específicos
            CASE
                WHEN precio_fijo_incpa IS NOT NULL AND NOT rangos_incpa AND rango1_cant_incpa = p_cantidad THEN 0 -- Exact match
                WHEN porcentaje_util_incpa IS NOT NULL AND NOT rangos_incpa AND rango1_cant_incpa = p_cantidad THEN 1 -- Exact match
                WHEN precio_fijo_incpa IS NOT NULL AND NOT rangos_incpa AND rango1_cant_incpa IS NULL THEN 2 -- Precio fijo para todas
                WHEN porcentaje_util_incpa IS NOT NULL AND NOT rangos_incpa AND rango1_cant_incpa IS NULL THEN 3 -- % para todas
                WHEN rango1_cant_incpa IS NOT NULL AND rango2_cant_incpa IS NOT NULL THEN rango2_cant_incpa - rango1_cant_incpa -- Rangos más específicos primero
                ELSE 9999
            END AS orden_secundario
        FROM inv_conf_precios_articulo
        WHERE ide_inarti = p_ide_inarti
          AND activo_incpa = TRUE
          AND (
              -- Precios fijos específicos por cantidad exacta
              (precio_fijo_incpa IS NOT NULL AND NOT rangos_incpa AND rango1_cant_incpa = p_cantidad) OR
              -- Precios fijos para todas las cantidades
              (precio_fijo_incpa IS NOT NULL AND NOT rangos_incpa AND rango1_cant_incpa IS NULL) OR
              -- Precios fijos para rangos
              (precio_fijo_incpa IS NOT NULL AND rangos_incpa AND 
               p_cantidad >= rango1_cant_incpa AND (rango2_cant_incpa IS NULL OR p_cantidad < rango2_cant_incpa)) OR
              -- Porcentajes específicos por cantidad exacta
              (porcentaje_util_incpa IS NOT NULL AND NOT rangos_incpa AND rango1_cant_incpa = p_cantidad) OR
              -- Porcentajes para todas las cantidades
              (porcentaje_util_incpa IS NOT NULL AND NOT rangos_incpa AND rango1_cant_incpa IS NULL) OR
              -- Porcentajes para rangos
              (porcentaje_util_incpa IS NOT NULL AND rangos_incpa AND 
               p_cantidad >= rango1_cant_incpa AND (rango2_cant_incpa IS NULL OR p_cantidad < rango2_cant_incpa))
          )
          AND (
              p_ide_cndfp IS NULL 
              OR ide_cndfp = p_ide_cndfp 
              OR (v_ide_cncfp IS NOT NULL AND ide_cncfp = v_ide_cncfp)
              OR (ide_cndfp IS NULL AND ide_cncfp IS NULL)
          )
    )
    SELECT * FROM configs
    WHERE prioridad < 99
    ORDER BY prioridad, orden_secundario;

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
            -- Para precios fijos específicos por cantidad
            IF v_rango.tipo_config = 'PRECIO_FIJO_CANT_ESPECIFICA' THEN
                IF v_rango.incluye_iva_incpa THEN
                    -- Precio configurado incluye IVA (ejemplo: 0.050g = $2.88 con IVA)
                    precio_venta_con_iva := v_rango.precio_fijo_incpa / v_rango.rango1_cant_incpa;
                    precio_venta_sin_iva := ROUND(precio_venta_con_iva / (1 + v_iva_factor), 2);
                ELSE
                    -- Precio configurado no incluye IVA
                    precio_venta_sin_iva := v_rango.precio_fijo_incpa / v_rango.rango1_cant_incpa;
                    precio_venta_con_iva := ROUND(precio_venta_sin_iva * (1 + v_iva_factor), 2);
                END IF;
            ELSE
                -- Para otros tipos de precio fijo (rangos o todas las cantidades)
                precio_venta_sin_iva := v_rango.precio_fijo_incpa;
                IF v_rango.incluye_iva_incpa THEN
                    precio_venta_con_iva := precio_venta_sin_iva;
                ELSE
                    precio_venta_con_iva := ROUND(precio_venta_sin_iva * (1 + v_iva_factor), 2);
                END IF;
            END IF;
            
            porcentaje_utilidad := NULL;
            porcentaje_utilidad_real := CASE 
                WHEN v_precio_compra > 0 THEN ROUND(((precio_venta_sin_iva - v_precio_compra) / v_precio_compra * 100, 2)
                ELSE NULL
            END;
        ELSE
            -- Cálculo para porcentajes de utilidad
            porcentaje_utilidad := v_rango.porcentaje_util_incpa;
            precio_venta_sin_iva := ROUND(v_precio_compra * (1 + porcentaje_utilidad / 100), 2);
            porcentaje_utilidad_real := porcentaje_utilidad;
            
            IF v_rango.incluye_iva_incpa THEN
                precio_venta_con_iva := precio_venta_sin_iva;
            ELSE
                precio_venta_con_iva := ROUND(precio_venta_sin_iva * (1 + v_iva_factor), 2);
            END IF;
        END IF;

        -- Calcular valores derivados
        utilidad := ROUND(precio_venta_sin_iva - v_precio_compra, 2);
        utilidad_neta := ROUND(utilidad * p_cantidad, 2);
        valor_total_con_iva := ROUND(p_cantidad * precio_venta_con_iva, 2);

        -- Asignar valores a devolver
        cantidad := p_cantidad;
        precio_ultima_compra := v_precio_compra;
        fecha_ultima_compra := v_fecha_compra;
        porcentaje_iva := v_iva;
        forma_pago_config := v_rango.ide_cndfp;
        configuracion_prioridad := v_rango.prioridad;
        tipo_configuracion := v_rango.tipo_config;

        -- Determinar el rango aplicado para mostrar
        IF v_rango.tipo_config = 'PRECIO_FIJO_CANT_ESPECIFICA' THEN
            rango_aplicado := 'PRECIO_FIJO_CANT=' || v_rango.rango1_cant_incpa;
        ELSIF v_rango.tipo_config = 'PRECIO_FIJO_TODAS' THEN
            rango_aplicado := 'PRECIO_FIJO_TODAS_CANT';
        ELSIF v_rango.tipo_config = 'PRECIO_FIJO_RANGO' THEN
            rango_aplicado := 'PRECIO_FIJO_' || 
                CASE WHEN v_rango.rango2_cant_incpa IS NULL THEN '≥' || v_rango.rango1_cant_incpa
                     ELSE v_rango.rango1_cant_incpa || '≤x<' || v_rango.rango2_cant_incpa END;
        ELSIF v_rango.tipo_config = 'PORCENTAJE_CANT_ESPECIFICA' THEN
            rango_aplicado := 'PORCENTAJE_CANT=' || v_rango.rango1_cant_incpa;
        ELSIF v_rango.tipo_config = 'PORCENTAJE_TODAS' THEN
            rango_aplicado := 'PORCENTAJE_TODAS_CANT';
        ELSIF v_rango.tipo_config = 'PORCENTAJE_RANGO' THEN
            rango_aplicado := v_rango.rango1_cant_incpa || '≤x<' || v_rango.rango2_cant_incpa;
        END IF;

        RETURN NEXT;
    END LOOP;

    DROP TABLE temp_configuraciones;
END;
$$ LANGUAGE plpgsql;