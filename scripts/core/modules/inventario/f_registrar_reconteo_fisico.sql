CREATE OR REPLACE FUNCTION public.f_registrar_reconteo_fisico(
    p_ide_indcf INT8,
    p_cantidad_recontada NUMERIC(12,3),
    p_observacion VARCHAR DEFAULT NULL,
    p_usuario_reconteo VARCHAR DEFAULT CURRENT_USER,
    p_fecha_reconteo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    p_motivo_reconteo VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    id_detalle INT8,
    id_articulo INT8,
    saldo_corte NUMERIC(12,3),
    cantidad_anterior NUMERIC(12,3),
    cantidad_recontada NUMERIC(12,3),
    saldo_actual NUMERIC(12,3),
    diferencia_anterior NUMERIC(12,3),
    diferencia_reconteo NUMERIC(12,3),
    porcentaje_diferencia_anterior NUMERIC(6,2),
    porcentaje_diferencia_reconteo NUMERIC(6,2),
    mensaje VARCHAR,
    estado_actual VARCHAR,
    requiere_ajuste BOOLEAN,
    mejoro_diferencia BOOLEAN,
    total_reconteos INTEGER  -- Nueva columna en el resultado
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_detalle RECORD;
    v_cabecera RECORD;
    v_estado_conteo VARCHAR(50);
    v_tolerancia NUMERIC(6,2) := 2.00;
    v_saldo_actual NUMERIC(12,3);
    v_saldo_corte NUMERIC(12,3);
    v_cantidad_anterior NUMERIC(12,3);
    v_diferencia_anterior NUMERIC(12,3);
    v_diferencia_reconteo NUMERIC(12,3);
    v_porcentaje_anterior NUMERIC(6,2);
    v_porcentaje_reconteo NUMERIC(6,2);
    v_estado_item VARCHAR(20);
    v_requiere_ajuste BOOLEAN;
    v_nombre_articulo VARCHAR(200);
    v_mejoro_diferencia BOOLEAN;
    v_numero_reconteos INTEGER;
BEGIN
    -- 1. VALIDACIONES INICIALES
    
    -- Obtener el detalle del conteo
    SELECT d.* INTO v_detalle
    FROM inv_det_conteo_fisico d
    WHERE d.ide_indcf = p_ide_indcf
      AND d.activo_indcf = true;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No se encontró el detalle de conteo con ID %', p_ide_indcf;
    END IF;
    
    -- Obtener la cabecera
    SELECT c.* INTO v_cabecera
    FROM inv_cab_conteo_fisico c
    WHERE c.ide_inccf = v_detalle.ide_inccf
      AND c.activo_inccf = true;
    
    -- Obtener estado del conteo
    SELECT e.codigo_inec INTO v_estado_conteo
    FROM inv_estado_conteo e
    WHERE e.ide_inec = v_cabecera.ide_inec;
    
    -- Obtener tolerancia si existe
    SELECT t.tolerancia_porcentaje_intc INTO v_tolerancia
    FROM inv_tipo_conteo t
    WHERE t.ide_intc = v_cabecera.ide_intc;
    
    -- Si no hay tolerancia, usar valor por defecto
    v_tolerancia := COALESCE(v_tolerancia, 2.00);
    
    -- Obtener nombre del artículo
    SELECT nombre_inarti INTO v_nombre_articulo
    FROM inv_articulo 
    WHERE ide_inarti = v_detalle.ide_inarti;
    
    -- Verificar que el conteo no esté cerrado
    IF v_estado_conteo IN ('CERRADO', 'AJUSTADO', 'CANCELADO') THEN
        RAISE EXCEPTION 'El conteo está en estado % y no se puede modificar', v_estado_conteo;
    END IF;
    
    -- Verificar que ya exista un conteo previo
    IF v_detalle.estado_item_indcf = 'PENDIENTE' THEN
        RAISE EXCEPTION 'El producto "%" no ha sido contado. Use la función de conteo primero.', 
                        v_nombre_articulo;
    END IF;
    
    -- Verificar que la cantidad recontada sea válida
    IF p_cantidad_recontada < 0 THEN
        RAISE EXCEPTION 'La cantidad recontada no puede ser negativa';
    END IF;
    
    -- 2. OBTENER SALDO ACTUAL (versión simplificada)
    v_saldo_actual := v_detalle.saldo_corte_indcf; -- Temporal
    
    -- 3. CALCULAR DIFERENCIAS
    v_cantidad_anterior := COALESCE(v_detalle.cantidad_fisica_indcf, 0);
    v_saldo_corte := v_detalle.saldo_corte_indcf;
    
    -- Diferencia del conteo anterior
    v_diferencia_anterior := v_cantidad_anterior - v_saldo_corte;
    
    -- Diferencia del reconteo
    v_diferencia_reconteo := p_cantidad_recontada - v_saldo_corte;
    
    -- Calcular porcentajes con redondeo a 2 decimales
    IF v_saldo_corte = 0 THEN
        IF v_cantidad_anterior = 0 THEN
            v_porcentaje_anterior := 0.00;
        ELSE
            v_porcentaje_anterior := 100.00;
        END IF;
        
        IF p_cantidad_recontada = 0 THEN
            v_porcentaje_reconteo := 0.00;
        ELSE
            v_porcentaje_reconteo := 100.00;
        END IF;
    ELSE
        -- Calcular y redondear a 2 decimales
        v_porcentaje_anterior := ROUND(ABS(v_diferencia_anterior) / v_saldo_corte * 100, 2);
        v_porcentaje_reconteo := ROUND(ABS(v_diferencia_reconteo) / v_saldo_corte * 100, 2);
    END IF;
    
    -- 4. DETERMINAR SI MEJORÓ LA DIFERENCIA
    v_mejoro_diferencia := ABS(v_diferencia_reconteo) < ABS(v_diferencia_anterior);
    
    -- 5. DETERMINAR SI REQUIERE AJUSTE
    v_requiere_ajuste := v_porcentaje_reconteo > v_tolerancia;
    
    -- 6. DETERMINAR NUEVO ESTADO
    v_estado_item := 'RECONTADO';
    
    -- 7. CALCULAR NUEVO NÚMERO DE RECONTEO
    v_numero_reconteos := COALESCE(v_detalle.numero_reconteos_indcf, 0) + 1;
    
    -- 8. ACTUALIZAR EL DETALLE
    UPDATE inv_det_conteo_fisico
    SET 
        -- Guardar conteo anterior en campos de reconteo
        cantidad_reconteo_indcf = v_cantidad_anterior,
        fecha_reconteo_indcf = p_fecha_reconteo,
        usuario_reconteo_indcf = p_usuario_reconteo,
        
        -- Actualizar con el nuevo conteo
        cantidad_fisica_indcf = p_cantidad_recontada,
        fecha_conteo_indcf = p_fecha_reconteo,
        usuario_conteo_indcf = p_usuario_reconteo,
        
        -- Actualizar saldo actual
        saldo_conteo_indcf = v_saldo_actual,
        
        -- Incrementar contador de reconteos
        numero_reconteos_indcf = v_numero_reconteos,
        
        -- Guardar observación del reconteo
        observacion_indcf = CASE 
            WHEN p_observacion IS NOT NULL 
            THEN COALESCE(observacion_indcf || ' | ', '') || 
                 'Reconteo #' || v_numero_reconteos || ': ' || p_observacion
            ELSE observacion_indcf
        END,
        
        motivo_diferencia_indcf = COALESCE(p_motivo_reconteo, motivo_diferencia_indcf),
        estado_item_indcf = v_estado_item,
        requiere_ajuste_indcf = v_requiere_ajuste,
        fecha_actua = CURRENT_TIMESTAMP,
        usuario_actua = p_usuario_reconteo
    WHERE ide_indcf = p_ide_indcf;
    
    -- 9. PREPARAR RESULTADOS
    id_detalle := p_ide_indcf;
    id_articulo := v_detalle.ide_inarti;
    saldo_corte := v_saldo_corte;
    cantidad_anterior := v_cantidad_anterior;
    cantidad_recontada := p_cantidad_recontada;
    saldo_actual := v_saldo_actual;
    diferencia_anterior := v_diferencia_anterior;
    diferencia_reconteo := v_diferencia_reconteo;
    porcentaje_diferencia_anterior := v_porcentaje_anterior;
    porcentaje_diferencia_reconteo := v_porcentaje_reconteo;
    estado_actual := v_estado_item;
    requiere_ajuste := v_requiere_ajuste;
    mejoro_diferencia := v_mejoro_diferencia;
    total_reconteos := v_numero_reconteos;  -- Retornar el número total
    
    -- Construir mensaje
    mensaje := 'Reconteo #' || v_numero_reconteos || ' registrado para "' || v_nombre_articulo || '"';
    
    IF v_mejoro_diferencia THEN
        mensaje := mensaje || ' (Mejoró)';
    ELSE
        mensaje := mensaje || ' (No mejoró)';
    END IF;
    
    IF v_requiere_ajuste THEN
        mensaje := mensaje || ' - Requiere ajuste (Diferencia: ' || 
                    ROUND(v_porcentaje_reconteo, 2) || '%)';
    ELSIF v_diferencia_reconteo != 0 THEN
        mensaje := mensaje || ' (Diferencia: ' || ROUND(v_porcentaje_reconteo, 2) || '%)';
    ELSE
        mensaje := mensaje || ' (Sin diferencias)';
    END IF;
    
    RETURN NEXT;
END;
$$;


SELECT * FROM f_registrar_reconteo_fisico(
    p_ide_indcf := 9,
    p_cantidad_recontada := 50,
    p_observacion := 'Reconteo realizado por admin',
    p_usuario_reconteo := 'admin'
);
