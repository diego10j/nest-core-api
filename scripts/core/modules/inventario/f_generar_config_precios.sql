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
    v_ide_cncfp INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM inv_articulo WHERE ide_inarti = p_ide_inarti;
    IF v_count = 0 THEN
        RAISE EXCEPTION 'El artículo con ID % no existe', p_ide_inarti;
    END IF;

    CREATE TEMP TABLE temp_ventas_producto AS
    SELECT * FROM f_utilidad_producto(id_empresa, p_ide_inarti, p_fecha_inicio, p_fecha_fin);

    SELECT COUNT(*) INTO v_count FROM temp_ventas_producto;
    IF v_count = 0 THEN
        DROP TABLE temp_ventas_producto;
        RAISE EXCEPTION 'No hay datos de ventas para el artículo % en el período % a %', 
            p_ide_inarti, p_fecha_inicio, p_fecha_fin;
    END IF;

    DELETE FROM inv_conf_precios_articulo 
    WHERE ide_inarti = p_ide_inarti AND autorizado_incpa = FALSE;

    FOR v_forma_pago IN 
        SELECT DISTINCT ide_cndfp, nombre_cndfp FROM temp_ventas_producto WHERE ide_cndfp IS NOT NULL
    LOOP
        SELECT ide_cncfp INTO v_ide_cncfp FROM con_deta_forma_pago WHERE ide_cndfp = v_forma_pago.ide_cndfp;

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

        SELECT 
            percentile_cont(0.3) WITHIN GROUP (ORDER BY cantidad_ccdfa),
            percentile_cont(0.7) WITHIN GROUP (ORDER BY cantidad_ccdfa)
        INTO 
            v_punto_corte_bajo,
            v_punto_corte_alto
        FROM temp_ventas_producto
        WHERE ide_cndfp = v_forma_pago.ide_cndfp;

        -- Rangos bajos
        SELECT array_agg(percentile) INTO v_percentiles
        FROM (
            SELECT percentile_cont(i::float/v_rangos_bajos * 0.3) WITHIN GROUP (ORDER BY cantidad_ccdfa) AS percentile
            FROM temp_ventas_producto, generate_series(1, v_rangos_bajos) AS i
            WHERE cantidad_ccdfa <= v_punto_corte_bajo AND ide_cndfp = v_forma_pago.ide_cndfp
            GROUP BY i
        ) subq;

        v_rango_actual := v_min_cantidad;

        FOR i IN 1..COALESCE(array_length(v_percentiles, 1), 0) LOOP
            v_siguiente_rango := v_percentiles[i];
            IF v_siguiente_rango > v_rango_actual THEN
                SELECT AVG(porcentaje_utilidad) INTO v_porcentaje_promedio
                FROM temp_ventas_producto
                WHERE cantidad_ccdfa >= v_rango_actual AND cantidad_ccdfa < v_siguiente_rango
                      AND ide_cndfp = v_forma_pago.ide_cndfp;
                IF v_porcentaje_promedio IS NOT NULL THEN
                    PERFORM insertar_config_precio(p_ide_inarti, v_rango_actual, v_siguiente_rango, 
                        id_empresa, COALESCE(v_porcentaje_promedio, v_avg_porcentaje), FALSE, 
                        TRUE, FALSE, p_login, v_forma_pago.ide_cndfp, v_ide_cncfp, 
                        'Config automática (' || v_forma_pago.nombre_cndfp || ') ' || p_fecha_inicio || ' a ' || p_fecha_fin);
                END IF;
                v_rango_actual := v_siguiente_rango;
            END IF;
        END LOOP;

        -- Rangos medios
        SELECT array_agg(percentile) INTO v_percentiles
        FROM (
            SELECT percentile_cont(0.3 + (i::float/v_rangos_medios * 0.4)) WITHIN GROUP (ORDER BY cantidad_ccdfa) AS percentile
            FROM temp_ventas_producto, generate_series(1, v_rangos_medios) AS i
            WHERE cantidad_ccdfa > v_punto_corte_bajo AND cantidad_ccdfa <= v_punto_corte_alto AND ide_cndfp = v_forma_pago.ide_cndfp
            GROUP BY i
        ) subq;

        v_rango_actual := v_punto_corte_bajo;

        FOR i IN 1..COALESCE(array_length(v_percentiles, 1), 0) LOOP
            v_siguiente_rango := v_percentiles[i];
            IF v_siguiente_rango > v_rango_actual THEN
                SELECT AVG(porcentaje_utilidad) INTO v_porcentaje_promedio
                FROM temp_ventas_producto
                WHERE cantidad_ccdfa >= v_rango_actual AND cantidad_ccdfa < v_siguiente_rango
                      AND ide_cndfp = v_forma_pago.ide_cndfp;
                IF v_porcentaje_promedio IS NOT NULL THEN
                    PERFORM insertar_config_precio(p_ide_inarti, v_rango_actual, v_siguiente_rango, 
                        id_empresa, COALESCE(v_porcentaje_promedio, v_avg_porcentaje), FALSE, 
                        TRUE, FALSE, p_login, v_forma_pago.ide_cndfp, v_ide_cncfp, 
                        'Config automática (' || v_forma_pago.nombre_cndfp || ') ' || p_fecha_inicio || ' a ' || p_fecha_fin);
                END IF;
                v_rango_actual := v_siguiente_rango;
            END IF;
        END LOOP;

        -- Rangos altos
        SELECT array_agg(percentile) INTO v_percentiles
        FROM (
            SELECT percentile_cont(0.7 + (i::float/v_rangos_altos * 0.3)) WITHIN GROUP (ORDER BY cantidad_ccdfa) AS percentile
            FROM temp_ventas_producto, generate_series(1, v_rangos_altos) AS i
            WHERE cantidad_ccdfa > v_punto_corte_alto AND ide_cndfp = v_forma_pago.ide_cndfp
            GROUP BY i
        ) subq;

        v_rango_actual := v_punto_corte_alto;

        FOR i IN 1..COALESCE(array_length(v_percentiles, 1), 0) LOOP
            v_siguiente_rango := v_percentiles[i];
            IF v_siguiente_rango > v_rango_actual THEN
                SELECT AVG(porcentaje_utilidad) INTO v_porcentaje_promedio
                FROM temp_ventas_producto
                WHERE cantidad_ccdfa >= v_rango_actual AND cantidad_ccdfa < v_siguiente_rango
                      AND ide_cndfp = v_forma_pago.ide_cndfp;
                IF v_porcentaje_promedio IS NOT NULL THEN
                    PERFORM insertar_config_precio(p_ide_inarti, v_rango_actual, v_siguiente_rango, 
                        id_empresa, COALESCE(v_porcentaje_promedio, v_avg_porcentaje), FALSE, 
                        TRUE, FALSE, p_login, v_forma_pago.ide_cndfp, v_ide_cncfp, 
                        'Config automática (' || v_forma_pago.nombre_cndfp || ') ' || p_fecha_inicio || ' a ' || p_fecha_fin);
                END IF;
                v_rango_actual := v_siguiente_rango;
            END IF;
        END LOOP;

        -- Rango infinito
        SELECT AVG(porcentaje_utilidad) INTO v_porcentaje_promedio
        FROM temp_ventas_producto
        WHERE cantidad_ccdfa >= v_rango_actual AND ide_cndfp = v_forma_pago.ide_cndfp;

        IF v_porcentaje_promedio IS NOT NULL THEN
            PERFORM insertar_config_precio(p_ide_inarti, v_rango_actual, NULL, 
                id_empresa, COALESCE(v_porcentaje_promedio, v_avg_porcentaje), FALSE, 
                TRUE, TRUE, p_login, v_forma_pago.ide_cndfp, v_ide_cncfp, 
                'Config automática (' || v_forma_pago.nombre_cndfp || ') ' || p_fecha_inicio || ' a ' || p_fecha_fin);
        END IF;
    END LOOP;

    DROP TABLE temp_ventas_producto;
    RAISE NOTICE 'Configuración de precios generada para el artículo %.', p_ide_inarti;
END;
$$ LANGUAGE plpgsql;



CREATE OR REPLACE FUNCTION insertar_config_precio(
    p_ide_inarti INT,
    p_rango1 NUMERIC,
    p_rango2 NUMERIC,
    p_ide_empr BIGINT,
    p_porcentaje_util NUMERIC,
    p_incluye_iva BOOLEAN,
    p_activo BOOLEAN,
    p_rango_infinito BOOLEAN,
    p_usuario TEXT,
    p_ide_cndfp BIGINT,    -- ojo: BIGINT y no INT, si así lo usas en la tabla
    p_ide_cncfp INT,
    p_observacion TEXT
) RETURNS VOID AS $$
DECLARE
    v_seq_id INT;
BEGIN
    v_seq_id := get_seq_table('inv_conf_precios_articulo', 'ide_incpa', 1, p_usuario);

    INSERT INTO inv_conf_precios_articulo (
        ide_incpa, ide_inarti, rangos_incpa, rango1_cant_incpa, rango2_cant_incpa,
        ide_empr, porcentaje_util_incpa, incluye_iva_incpa, activo_incpa, rango_infinito_incpa,
        usuario_ingre, observacion_incpa, ide_cndfp, ide_cncfp
    ) VALUES (
        v_seq_id, p_ide_inarti, TRUE, p_rango1, p_rango2,
        p_ide_empr, p_porcentaje_util, p_incluye_iva, p_activo, p_rango_infinito,
        p_usuario, p_observacion, p_ide_cndfp, p_ide_cncfp
    );
END;
$$ LANGUAGE plpgsql;



--SELECT f_generar_config_precios(0, 1704, '2025-01-01', '2025-12-31');

-- Ver los resultados
--SELECT * FROM inv_conf_precios_articulo WHERE ide_inarti = 1704 ORDER BY rango1_cant_incpa;