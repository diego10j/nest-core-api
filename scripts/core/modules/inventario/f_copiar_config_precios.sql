CREATE OR REPLACE FUNCTION f_copiar_config_precios(
    p_ide_inarti_origen INT,
    p_ide_inarti_destino INT[],
    p_login TEXT DEFAULT 'sa'
)
RETURNS VOID AS $$
DECLARE
    v_config RECORD;
    v_seq_id INT;
    v_empresa BIGINT;
    v_nombre_articulo TEXT;
    v_count INT;
BEGIN
    -- Verificar si el artículo origen existe
    SELECT COUNT(*) INTO v_count FROM inv_articulo WHERE ide_inarti = p_ide_inarti_origen;
    IF v_count = 0 THEN
        RAISE EXCEPTION 'El artículo origen con ID % no existe', p_ide_inarti_origen;
    END IF;
    
    -- Obtener nombre del artículo origen para la observación
    SELECT nombre_inarti INTO v_nombre_articulo 
    FROM inv_articulo 
    WHERE ide_inarti = p_ide_inarti_origen;
    
    -- Obtener empresa de la configuración origen (asumiendo que todas tienen la misma empresa)
    SELECT ide_empr INTO v_empresa 
    FROM inv_conf_precios_articulo 
    WHERE ide_inarti = p_ide_inarti_origen 
    LIMIT 1;
    
    -- Desactivar configuraciones existentes en los artículos destino
    UPDATE inv_conf_precios_articulo
    SET activo_incpa = false,
        usuario_actua = p_login,
        hora_actua = CURRENT_TIMESTAMP
    WHERE ide_inarti = ANY(p_ide_inarti_destino);
    -- AND autorizado_incpa = false;
    
    -- Copiar configuraciones para cada artículo destino
    FOR i IN 1..array_length(p_ide_inarti_destino, 1) LOOP
        -- Verificar si el artículo destino existe
        SELECT COUNT(*) INTO v_count FROM inv_articulo WHERE ide_inarti = p_ide_inarti_destino[i];
        IF v_count = 0 THEN
            RAISE NOTICE 'El artículo destino con ID % no existe, se omite', p_ide_inarti_destino[i];
            CONTINUE;
        END IF;
        
        -- Copiar cada configuración del artículo origen al artículo destino
        FOR v_config IN 
            SELECT 
                rangos_incpa, rango1_cant_incpa, rango2_cant_incpa,
                porcentaje_util_incpa, precio_fijo_incpa, incluye_iva_incpa,
                rango_infinito_incpa, ide_cndfp, ide_cncfp
            FROM inv_conf_precios_articulo
            WHERE ide_inarti = p_ide_inarti_origen
            AND activo_incpa = true
        LOOP
            v_seq_id := get_seq_table('inv_conf_precios_articulo', 'ide_incpa', 1, p_login);
            
            INSERT INTO inv_conf_precios_articulo (
                ide_incpa, ide_inarti, rangos_incpa, rango1_cant_incpa, rango2_cant_incpa, ide_empr,
                porcentaje_util_incpa, precio_fijo_incpa, incluye_iva_incpa, activo_incpa, 
                rango_infinito_incpa, usuario_ingre, hora_ingre, observacion_incpa, 
                ide_cndfp, ide_cncfp
            ) VALUES (
                v_seq_id, p_ide_inarti_destino[i], v_config.rangos_incpa, v_config.rango1_cant_incpa, 
                v_config.rango2_cant_incpa, v_empresa, v_config.porcentaje_util_incpa, 
                v_config.precio_fijo_incpa, v_config.incluye_iva_incpa, true, 
                v_config.rango_infinito_incpa, p_login, CURRENT_TIMESTAMP, 
                'Configuración copiada del producto ' || p_ide_inarti_origen || ' - ' || v_nombre_articulo,
                v_config.ide_cndfp, v_config.ide_cncfp
            );
        END LOOP;
        
        RAISE NOTICE 'Configuración copiada al artículo %', p_ide_inarti_destino[i];
    END LOOP;
    
    RAISE NOTICE 'Proceso de copia completado. Configuraciones copiadas del artículo % a % artículos', 
        p_ide_inarti_origen, array_length(p_ide_inarti_destino, 1);
END;
$$ LANGUAGE plpgsql;

--- SELECT f_copiar_config_precios(1704, ARRAY[1705, 1706, 1707], 'usuario_admin');