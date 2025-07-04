

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
    v_seq_id INT;
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
    v_ide_cncfp INT;  -- Variable para almacenar ide_cncfp
BEGIN
    -- Verificar si el artículo existe
    SELECT COUNT(*) INTO v_count FROM inv_articulo WHERE ide_inarti = p_ide_inarti;
    IF v_count = 0 THEN
        RAISE EXCEPTION 'El artículo con ID % no existe', p_ide_inarti;
    END IF;
    
    -- Crear tabla temporal con los datos de ventas incluyendo forma de pago
    CREATE TEMP TABLE temp_ventas_producto AS
    SELECT * FROM f_utilidad_producto(id_empresa, p_ide_inarti, p_fecha_inicio, p_fecha_fin);
    
    -- Verificar si hay datos de ventas
    SELECT COUNT(*) INTO v_count FROM temp_ventas_producto;
    IF v_count = 0 THEN
        DROP TABLE temp_ventas_producto;
        RAISE EXCEPTION 'No hay datos de ventas para el artículo % en el período % a %', 
            p_ide_inarti, p_fecha_inicio, p_fecha_fin;
    END IF;
    
    -- Eliminar configuraciones existentes no autorizadas para el artículo
    DELETE FROM inv_conf_precios_articulo 
    WHERE ide_inarti = p_ide_inarti AND autorizado_incpa = false;
    
    -- Crear índice para mejorar rendimiento
    CREATE INDEX idx_temp_ventas_cantidad ON temp_ventas_producto(cantidad_ccdfa);
    CREATE INDEX idx_temp_ventas_forma_pago ON temp_ventas_producto(ide_cndfp);
    
    -- Procesar cada forma de pago encontrada en las ventas
    FOR v_forma_pago IN 
        SELECT DISTINCT ide_cndfp, nombre_cndfp 
        FROM temp_ventas_producto 
        WHERE ide_cndfp IS NOT NULL
    LOOP
        -- Obtener ide_cncfp para esta forma de pago
        SELECT ide_cncfp INTO v_ide_cncfp
        FROM con_deta_forma_pago 
        WHERE ide_cndfp = v_forma_pago.ide_cndfp;
        
        -- Obtener valores estadísticos básicos para esta forma de pago
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
        
        -- Calcular puntos de corte para rangos bajos/medios/altos para esta forma de pago
        SELECT 
            percentile_cont(0.3) WITHIN GROUP (ORDER BY cantidad_ccdfa),
            percentile_cont(0.7) WITHIN GROUP (ORDER BY cantidad_ccdfa)
        INTO 
            v_punto_corte_bajo,
            v_punto_corte_alto
        FROM temp_ventas_producto
        WHERE ide_cndfp = v_forma_pago.ide_cndfp;
        
        -- 1. Generar rangos bajos (3 rangos)
        SELECT array_agg(percentile) INTO v_percentiles
        FROM (
            SELECT percentile_cont(i::float/v_rangos_bajos * 0.3) WITHIN GROUP (ORDER BY cantidad_ccdfa) AS percentile
            FROM temp_ventas_producto, generate_series(1, v_rangos_bajos) AS i
            WHERE cantidad_ccdfa <= v_punto_corte_bajo
            AND ide_cndfp = v_forma_pago.ide_cndfp
            GROUP BY i
        ) subq;
        
        v_rango_actual := v_min_cantidad;
        
        FOR i IN 1..COALESCE(array_length(v_percentiles, 1), 0) LOOP
            v_siguiente_rango := v_percentiles[i];
            
            -- Calcular porcentaje promedio para este rango y forma de pago
            SELECT AVG(porcentaje_utilidad) INTO v_porcentaje_promedio
            FROM temp_ventas_producto
            WHERE cantidad_ccdfa >= v_rango_actual 
              AND cantidad_ccdfa < v_siguiente_rango
              AND ide_cndfp = v_forma_pago.ide_cndfp;
            
            -- Insertar configuración de precio con forma de pago
            v_seq_id := get_seq_table('inv_conf_precios_articulo', 'ide_incpa', 1, p_login);
            
            INSERT INTO inv_conf_precios_articulo (
                ide_incpa, ide_inarti, rangos_incpa, rango1_cant_incpa, rango2_cant_incpa, ide_empr,
                porcentaje_util_incpa, incluye_iva_incpa, activo_incpa, rango_infinito_incpa, 
                usuario_ingre, observacion_incpa, ide_cndfp, ide_cncfp
            ) VALUES (
                v_seq_id, p_ide_inarti, true, v_rango_actual, v_siguiente_rango, id_empresa,
                COALESCE(v_porcentaje_promedio, v_avg_porcentaje), false, true, false, 
                p_login, 'Config automática (' || v_forma_pago.nombre_cndfp || ') ' || p_fecha_inicio || ' a ' || p_fecha_fin,
                v_forma_pago.ide_cndfp, v_ide_cncfp
            );
            
            v_rango_actual := v_siguiente_rango;
        END LOOP;
        
        -- 2. Generar rangos medios (4 rangos)
        SELECT array_agg(percentile) INTO v_percentiles
        FROM (
            SELECT percentile_cont(0.3 + (i::float/v_rangos_medios * 0.4)) WITHIN GROUP (ORDER BY cantidad_ccdfa) AS percentile
            FROM temp_ventas_producto, generate_series(1, v_rangos_medios) AS i
            WHERE cantidad_ccdfa > v_punto_corte_bajo 
              AND cantidad_ccdfa <= v_punto_corte_alto
              AND ide_cndfp = v_forma_pago.ide_cndfp
            GROUP BY i
        ) subq;
        
        FOR i IN 1..COALESCE(array_length(v_percentiles, 1), 0) LOOP
            v_siguiente_rango := v_percentiles[i];
            
            -- Calcular porcentaje promedio para este rango y forma de pago
            SELECT AVG(porcentaje_utilidad) INTO v_porcentaje_promedio
            FROM temp_ventas_producto
            WHERE cantidad_ccdfa >= v_rango_actual 
              AND cantidad_ccdfa < v_siguiente_rango
              AND ide_cndfp = v_forma_pago.ide_cndfp;
            
            -- Insertar configuración de precio con forma de pago
            v_seq_id := get_seq_table('inv_conf_precios_articulo', 'ide_incpa', 1, p_login);
            
            INSERT INTO inv_conf_precios_articulo (
                ide_incpa, ide_inarti, rangos_incpa, rango1_cant_incpa, rango2_cant_incpa, ide_empr,
                porcentaje_util_incpa, incluye_iva_incpa, activo_incpa, rango_infinito_incpa, 
                usuario_ingre, observacion_incpa, ide_cndfp, ide_cncfp
            ) VALUES (
                v_seq_id, p_ide_inarti, true, v_rango_actual, v_siguiente_rango, id_empresa,
                COALESCE(v_porcentaje_promedio, v_avg_porcentaje), false, true, false, 
                p_login, 'Config automática (' || v_forma_pago.nombre_cndfp || ') ' || p_fecha_inicio || ' a ' || p_fecha_fin,
                v_forma_pago.ide_cndfp, v_ide_cncfp
            );
            
            v_rango_actual := v_siguiente_rango;
        END LOOP;
        
        -- 3. Generar rangos altos (3 rangos)
        SELECT array_agg(percentile) INTO v_percentiles
        FROM (
            SELECT percentile_cont(0.7 + (i::float/v_rangos_altos * 0.3)) WITHIN GROUP (ORDER BY cantidad_ccdfa) AS percentile
            FROM temp_ventas_producto, generate_series(1, v_rangos_altos) AS i
            WHERE cantidad_ccdfa > v_punto_corte_alto
              AND ide_cndfp = v_forma_pago.ide_cndfp
            GROUP BY i
        ) subq;
        
        FOR i IN 1..COALESCE(array_length(v_percentiles, 1), 0) LOOP
            v_siguiente_rango := v_percentiles[i];
            
            -- Calcular porcentaje promedio para este rango y forma de pago
            SELECT AVG(porcentaje_utilidad) INTO v_porcentaje_promedio
            FROM temp_ventas_producto
            WHERE cantidad_ccdfa >= v_rango_actual 
              AND cantidad_ccdfa < v_siguiente_rango
              AND ide_cndfp = v_forma_pago.ide_cndfp;
            
            -- Insertar configuración de precio con forma de pago
            v_seq_id := get_seq_table('inv_conf_precios_articulo', 'ide_incpa', 1, p_login);
            
            INSERT INTO inv_conf_precios_articulo (
                ide_incpa, ide_inarti, rangos_incpa, rango1_cant_incpa, rango2_cant_incpa, ide_empr,
                porcentaje_util_incpa, incluye_iva_incpa, activo_incpa, rango_infinito_incpa, 
                usuario_ingre, observacion_incpa, ide_cndfp, ide_cncfp
            ) VALUES (
                v_seq_id, p_ide_inarti, true, v_rango_actual, v_siguiente_rango, id_empresa,
                COALESCE(v_porcentaje_promedio, v_avg_porcentaje), false, true, false, 
                p_login, 'Config automática (' || v_forma_pago.nombre_cndfp || ') ' || p_fecha_inicio || ' a ' || p_fecha_fin,
                v_forma_pago.ide_cndfp, v_ide_cncfp
            );
            
            v_rango_actual := v_siguiente_rango;
        END LOOP;
        
        -- Insertar rango final (infinito) para esta forma de pago
        v_seq_id := get_seq_table('inv_conf_precios_articulo', 'ide_incpa', 1, p_login);
        
        SELECT AVG(porcentaje_utilidad) INTO v_porcentaje_promedio
        FROM temp_ventas_producto
        WHERE cantidad_ccdfa >= v_rango_actual
          AND ide_cndfp = v_forma_pago.ide_cndfp;
        
        INSERT INTO inv_conf_precios_articulo (
            ide_incpa, ide_inarti, rangos_incpa, rango1_cant_incpa, rango2_cant_incpa, ide_empr,
            porcentaje_util_incpa, incluye_iva_incpa, activo_incpa, rango_infinito_incpa, 
            usuario_ingre, observacion_incpa, ide_cndfp, ide_cncfp
        ) VALUES (
            v_seq_id, p_ide_inarti, true, v_rango_actual, NULL, id_empresa,
            COALESCE(v_porcentaje_promedio, v_avg_porcentaje), false, true, true, 
            p_login, 'Config automática (' || v_forma_pago.nombre_cndfp || ') ' || p_fecha_inicio || ' a ' || p_fecha_fin,
            v_forma_pago.ide_cndfp, v_ide_cncfp
        );
    END LOOP;
    
    -- También generar configuraciones sin forma de pago (para casos generales)
    -- [Aquí iría el mismo código de generación de rangos pero sin filtrar por ide_cndfp]
    -- Nota: Para estos casos no se incluiría ide_cndfp ni ide_cncfp
    
    -- Eliminar registros con rangos superpuestos, conservando el de menor porcentaje de utilidad
    DELETE FROM inv_conf_precios_articulo
    WHERE ide_inarti = p_ide_inarti
    AND ide_incpa NOT IN (
        SELECT DISTINCT ON (rango1_cant_incpa, COALESCE(ide_cndfp, 0)) ide_incpa
        FROM inv_conf_precios_articulo
        WHERE ide_inarti = p_ide_inarti
        ORDER BY rango1_cant_incpa, COALESCE(ide_cndfp, 0), porcentaje_util_incpa ASC, ide_incpa
    );

    -- Eliminar registros con rangos idénticos, conservando el de menor porcentaje de utilidad
    DELETE FROM inv_conf_precios_articulo
    WHERE ide_inarti = p_ide_inarti
    AND ide_incpa NOT IN (
        SELECT MIN(ide_incpa)
        FROM inv_conf_precios_articulo
        WHERE ide_inarti = p_ide_inarti
        GROUP BY rango1_cant_incpa, COALESCE(rango2_cant_incpa, -1), porcentaje_util_incpa, COALESCE(ide_cndfp, 0), COALESCE(ide_cncfp, 0)
    );

    -- Limpiar tabla temporal
    DROP TABLE temp_ventas_producto;
    
    RAISE NOTICE 'Configuración de precios generada para el artículo % considerando formas de pago.', p_ide_inarti;
END;
$$ LANGUAGE plpgsql;




--SELECT f_generar_config_precios(0, 1704, '2025-01-01', '2025-12-31');

-- Ver los resultados
--SELECT * FROM inv_conf_precios_articulo WHERE ide_inarti = 1704 ORDER BY rango1_cant_incpa;