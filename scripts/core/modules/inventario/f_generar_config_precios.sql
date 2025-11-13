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