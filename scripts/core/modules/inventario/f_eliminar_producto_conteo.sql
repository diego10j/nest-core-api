CREATE OR REPLACE FUNCTION public.f_eliminar_producto_conteo(
    p_ide_indcf_array INT8[]  -- Array de IDs del detalle del conteo a eliminar
)
RETURNS TABLE (
    id_detalle_eliminado INT8,
    id_cabecera_conteo INT8,
    productos_contados_actual INT,
    porcentaje_avance_actual NUMERIC(5,2),
    productos_estimados_actual INT,
    mensaje VARCHAR(500),
    estado_conteo VARCHAR(20)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    -- Detalle a eliminar
    v_ide_inarti INT8;
    v_ide_inccf INT8;
    v_estado_item_indcf VARCHAR(20);
    v_estado_detalle_anterior VARCHAR(20);
    
    -- Cabecera
    v_ide_inbod INT8;
    v_ide_inec INT8;
    v_estado_conteo VARCHAR(20);
    v_total_productos_anterior INT;
    v_total_productos_actual INT;
    v_productos_contados_anterior INT;
    v_porcentaje_avance_anterior NUMERIC(5,2);
    
    -- Estadísticas actualizadas
    v_productos_contados_actual INT;
    v_porcentaje_avance_actual NUMERIC(5,2);
    
    -- Control
    v_nombre_articulo VARCHAR(200);
    v_fue_contado BOOLEAN;
    v_es_estado_final BOOLEAN;
    
    -- Variables para manejar el array
    v_ide_indcf INT8;
    v_contador_eliminados INT := 0;
    v_total_a_eliminar INT;
    v_productos_info TEXT := '';
    v_primer_producto VARCHAR(200);
    v_primer_producto_nombre VARCHAR(200);
BEGIN
    /* =====================================================
       1. VALIDACIONES INICIALES DEL ARRAY
    ===================================================== */
    
    -- Verificar que el array no esté vacío
    IF array_length(p_ide_indcf_array, 1) IS NULL THEN
        RAISE EXCEPTION 'El array de productos a eliminar está vacío';
    END IF;
    
    v_total_a_eliminar := array_length(p_ide_indcf_array, 1);
    
    /* =====================================================
       2. VALIDAR QUE TODOS LOS PRODUCTOS PERTENEZCAN AL MISMO CONTEO
    ===================================================== */
    
    -- Obtener el conteo común (debe ser el mismo para todos)
    SELECT DISTINCT d.ide_inccf
    INTO v_ide_inccf
    FROM inv_det_conteo_fisico d
    WHERE d.ide_indcf = ANY(p_ide_indcf_array);
    
    IF v_ide_inccf IS NULL THEN
        RAISE EXCEPTION 'No se encontraron los detalles del conteo especificados';
    END IF;
    
    -- Verificar que todos pertenezcan al mismo conteo
    IF EXISTS (
        SELECT 1
        FROM inv_det_conteo_fisico d
        WHERE d.ide_indcf = ANY(p_ide_indcf_array)
        GROUP BY d.ide_inccf
        HAVING COUNT(DISTINCT d.ide_inccf) > 1
    ) THEN
        RAISE EXCEPTION 'Los productos a eliminar pertenecen a diferentes conteos';
    END IF;
    
    /* =====================================================
       3. VALIDAR ESTADO DEL CONTEO
    ===================================================== */
    
    SELECT 
        c.ide_inbod,
        c.ide_inec,
        c.productos_estimados_inccf,
        c.productos_contados_inccf,
        c.porcentaje_avance_inccf,
        ec.codigo_inec
    INTO
        v_ide_inbod,
        v_ide_inec,
        v_total_productos_anterior,
        v_productos_contados_anterior,
        v_porcentaje_avance_anterior,
        v_estado_conteo
    FROM inv_cab_conteo_fisico c
    JOIN inv_estado_conteo ec ON ec.ide_inec = c.ide_inec
    WHERE c.ide_inccf = v_ide_inccf;
    
    IF v_ide_inccf IS NULL THEN
        RAISE EXCEPTION 'No se encontró el conteo asociado a los productos';
    END IF;
    
    -- Verificar estado del conteo
    IF v_estado_conteo IN ('CERRADO','AJUSTADO','CANCELADO') THEN
        RAISE EXCEPTION 'El conteo está en estado % y no se pueden eliminar productos', v_estado_conteo;
    END IF;
    
    /* =====================================================
       4. VALIDAR QUE NINGÚN PRODUCTO ESTÉ EN ESTADO AJUSTADO
    ===================================================== */
    
    -- Verificar si hay productos en estado AJUSTADO
    SELECT STRING_AGG(d.ide_indcf::text, ', ')
    INTO v_productos_info
    FROM inv_det_conteo_fisico d
    WHERE d.ide_indcf = ANY(p_ide_indcf_array)
      AND d.estado_item_indcf = 'AJUSTADO';
    
    IF v_productos_info IS NOT NULL THEN
        RAISE EXCEPTION 'Los siguientes ítems ya fueron ajustados y no pueden eliminarse: %', v_productos_info;
    END IF;
    
    /* =====================================================
       5. OBTENER INFORMACIÓN PARA EL MENSAJE
    ===================================================== */
    
    -- Obtener nombre del primer producto para el mensaje
    SELECT a.nombre_inarti, d.ide_indcf
    INTO v_primer_producto_nombre, v_primer_producto
    FROM inv_det_conteo_fisico d
    JOIN inv_articulo a ON a.ide_inarti = d.ide_inarti
    WHERE d.ide_indcf = p_ide_indcf_array[1]
    LIMIT 1;
    
    /* =====================================================
       6. ELIMINAR FÍSICAMENTE LOS DETALLES
    ===================================================== */
    
    DELETE FROM inv_det_conteo_fisico
    WHERE ide_indcf = ANY(p_ide_indcf_array);
    
    GET DIAGNOSTICS v_contador_eliminados = ROW_COUNT;
    
    /* =====================================================
       7. RECALCULAR PRODUCTOS ESTIMADOS
    ===================================================== */
    
    -- Contar cuántos detalles quedan para este conteo
    SELECT COUNT(*)
    INTO v_total_productos_actual
    FROM inv_det_conteo_fisico
    WHERE ide_inccf = v_ide_inccf;
    
    /* =====================================================
       8. RECALCULAR PRODUCTOS CONTADOS
    ===================================================== */
    
    SELECT COUNT(*)
    INTO v_productos_contados_actual
    FROM inv_det_conteo_fisico
    WHERE ide_inccf = v_ide_inccf
      AND estado_item_indcf IN ('CONTADO','REVISION','AJUSTADO');
    
    /* =====================================================
       9. CALCULAR PORCENTAJE DE AVANCE ACTUAL
    ===================================================== */
    
    IF v_total_productos_actual > 0 THEN
        v_porcentaje_avance_actual := ROUND(
            (v_productos_contados_actual::NUMERIC / v_total_productos_actual) * 100, 
            2
        );
    ELSE
        v_porcentaje_avance_actual := 0;
    END IF;
    
    /* =====================================================
       10. ACTUALIZAR CABECERA CON VALORES CORRECTOS
    ===================================================== */
    
    UPDATE inv_cab_conteo_fisico
    SET productos_estimados_inccf = v_total_productos_actual,
        productos_contados_inccf = v_productos_contados_actual,
        porcentaje_avance_inccf = v_porcentaje_avance_actual,
        fecha_actua = CURRENT_TIMESTAMP,
        usuario_actua = CURRENT_USER
    WHERE ide_inccf = v_ide_inccf;
    
    /* =====================================================
       11. VERIFICAR SI EL CONTEO DEBE CAMBIAR DE ESTADO
    ===================================================== */
    
    -- Obtener estado actualizado
    SELECT ec.codigo_inec
    INTO v_estado_conteo
    FROM inv_cab_conteo_fisico c
    JOIN inv_estado_conteo ec ON ec.ide_inec = c.ide_inec
    WHERE c.ide_inccf = v_ide_inccf;
    
    -- Verificar si hay productos pendientes
    IF NOT EXISTS (
        SELECT 1 
        FROM inv_det_conteo_fisico 
        WHERE ide_inccf = v_ide_inccf 
          AND estado_item_indcf IN ('PENDIENTE', 'CONTADO', 'REVISION')
    ) AND v_estado_conteo NOT IN ('CERRADO', 'AJUSTADO', 'CANCAELADO') THEN
        -- Todos los productos fueron ajustados o eliminados
        UPDATE inv_cab_conteo_fisico
        SET ide_inec = (SELECT ide_inec FROM inv_estado_conteo WHERE codigo_inec = 'CERRADO'),
            fecha_actua = CURRENT_TIMESTAMP,
            usuario_actua = CURRENT_USER
        WHERE ide_inccf = v_ide_inccf;
        
        v_estado_conteo := 'CERRADO';
    END IF;
    
    /* =====================================================
       12. RETORNO DE DATOS
    ===================================================== */
    
    -- Devolver el primer ID eliminado (para mantener compatibilidad)
    id_detalle_eliminado := p_ide_indcf_array[1];
    id_cabecera_conteo := v_ide_inccf;
    productos_contados_actual := v_productos_contados_actual;
    porcentaje_avance_actual := v_porcentaje_avance_actual;
    productos_estimados_actual := v_total_productos_actual;
    estado_conteo := v_estado_conteo;
    
    mensaje := CASE 
        WHEN v_contador_eliminados = 1 THEN 
            'Producto "' || COALESCE(v_primer_producto_nombre, 'N/A') || 
            '" eliminado del conteo. Estado anterior: ' || v_estado_detalle_anterior ||
            '. Productos contados: ' || v_productos_contados_actual || 
            ' de ' || v_total_productos_actual || ' (' || 
            ROUND(v_porcentaje_avance_actual, 2) || '%)'
        ELSE 
            v_contador_eliminados || ' productos eliminados del conteo (incluyendo "' || 
            COALESCE(v_primer_producto_nombre, 'N/A') || 
            '"). Productos contados: ' || v_productos_contados_actual || 
            ' de ' || v_total_productos_actual || ' (' || 
            ROUND(v_porcentaje_avance_actual, 2) || '%)'
    END;
    
    RETURN NEXT;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error al eliminar productos del conteo: %', SQLERRM;
END;
$$;



--probar
-- SELECT * FROM f_eliminar_producto_conteo(ARRAY[430,431]);  