CREATE OR REPLACE FUNCTION public.f_registrar_reconteo_fisico(
    p_ide_indcf INT8,
    p_cantidad_recontada NUMERIC(12,3),
    p_observacion VARCHAR(500) DEFAULT NULL,
    p_usuario_reconteo VARCHAR(50) DEFAULT CURRENT_USER,
    p_fecha_reconteo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    p_motivo_reconteo VARCHAR(500) DEFAULT NULL
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
    mensaje VARCHAR(200),
    estado_actual VARCHAR(20),
    requiere_ajuste BOOLEAN,
    mejoro_diferencia BOOLEAN,
    total_reconteos INTEGER,
    costo_unitario NUMERIC(12,3),
    valor_diferencia NUMERIC(15,3)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    -- Variables para detalle
    v_ide_inarti INT8;
    v_saldo_corte_indcf NUMERIC(12,3);
    v_cantidad_fisica_indcf NUMERIC(12,3);
    v_estado_item_indcf VARCHAR(20);
    v_observacion_indcf VARCHAR(500);
    v_activo_indcf BOOLEAN;
    v_numero_reconteos_indcf INTEGER;
    v_costo_unitario_actual NUMERIC(12,3);
    v_valor_diferencia_actual NUMERIC(15,3);
    
    -- Variables para cabecera
    v_ide_inbod INT8;
    v_ide_usua INT8;
    v_ide_inec INT8;
    v_ide_intc INT8;
    v_secuencial_inccf VARCHAR(12);
    v_estado_conteo VARCHAR(20);
    v_activo_inccf BOOLEAN;
    
    -- Variables adicionales
    v_saldo_actual NUMERIC(12,3);
    v_cantidad_anterior NUMERIC(12,3);
    v_diferencia_anterior NUMERIC(12,3);
    v_diferencia_reconteo NUMERIC(12,3);
    v_porcentaje_anterior NUMERIC(6,2);
    v_porcentaje_reconteo NUMERIC(6,2);
    v_estado_item VARCHAR(20);
    v_requiere_ajuste BOOLEAN;
    v_tolerancia NUMERIC(5,2);
    v_costo_unitario NUMERIC(12,3) := 0;
    v_valor_diferencia NUMERIC(15,3) := 0;
    v_nombre_articulo VARCHAR(200);
    v_decimales_stock INT;
    v_mejoro_diferencia BOOLEAN;
    v_numero_reconteos INTEGER;
BEGIN
    -- 1. VALIDACIONES INICIALES (Igual que en f_registrar_conteo_fisico)
    
    -- Verificar que existe el detalle del conteo y obtener sus datos
    SELECT 
        d.ide_inarti,
        d.saldo_corte_indcf,
        d.cantidad_fisica_indcf,
        d.estado_item_indcf,
        d.observacion_indcf,
        d.activo_indcf,
        d.numero_reconteos_indcf,
        d.costo_unitario_indcf,
        d.valor_diferencia_indcf,
        c.ide_inbod,
        c.ide_usua,
        c.ide_inec,
        c.ide_intc,
        c.secuencial_inccf,
        c.activo_inccf
    INTO 
        v_ide_inarti,
        v_saldo_corte_indcf,
        v_cantidad_fisica_indcf,
        v_estado_item_indcf,
        v_observacion_indcf,
        v_activo_indcf,
        v_numero_reconteos_indcf,
        v_costo_unitario_actual,
        v_valor_diferencia_actual,
        v_ide_inbod,
        v_ide_usua,
        v_ide_inec,
        v_ide_intc,
        v_secuencial_inccf,
        v_activo_inccf
    FROM inv_det_conteo_fisico d
    JOIN inv_cab_conteo_fisico c ON d.ide_inccf = c.ide_inccf
    WHERE d.ide_indcf = p_ide_indcf
      AND d.activo_indcf = true
      AND c.activo_inccf = true;
    
    IF v_ide_inarti IS NULL THEN
        RAISE EXCEPTION 'No se encontró el detalle de conteo con ID %', p_ide_indcf;
    END IF;
    
    -- Obtener estado del conteo
    SELECT e.codigo_inec INTO v_estado_conteo
    FROM inv_estado_conteo e
    WHERE e.ide_inec = v_ide_inec;
    
    IF v_estado_conteo IS NULL THEN
        RAISE EXCEPTION 'No se encontró el estado del conteo';
    END IF;
    
    -- Obtener tolerancia del tipo de conteo (igual que en conteo)
    SELECT COALESCE(t.tolerancia_porcentaje_intc, 2.00) INTO v_tolerancia
    FROM inv_tipo_conteo t
    WHERE t.ide_intc = v_ide_intc;
    
    -- Obtener nombre del artículo para mensajes (igual que en conteo)
    SELECT nombre_inarti, decim_stock_inarti 
    INTO v_nombre_articulo, v_decimales_stock
    FROM inv_articulo 
    WHERE ide_inarti = v_ide_inarti;
    
    -- Verificar que el conteo no esté cerrado (igual que en conteo)
    IF v_estado_conteo IN ('CERRADO', 'AJUSTADO', 'CANCELADO') THEN
        RAISE EXCEPTION 'El conteo está en estado % y no se puede modificar', v_estado_conteo;
    END IF;
    
    -- Validación específica para reconteo: debe existir un conteo previo
    IF v_estado_item_indcf = 'PENDIENTE' THEN
        RAISE EXCEPTION 'El producto "%" no ha sido contado. Use la función de conteo primero.', 
                        v_nombre_articulo;
    END IF;
    
    -- Verificar que la cantidad recontada sea válida
    IF p_cantidad_recontada < 0 THEN
        RAISE EXCEPTION 'La cantidad recontada no puede ser negativa';
    END IF;
    
    -- 2. OBTENER SALDO ACTUAL DEL ARTÍCULO A LA FECHA DEL RECONTEO
    -- (Misma lógica que en f_registrar_conteo_fisico)
    WITH existencia_cte AS (
        SELECT
            dci.ide_inarti,
            SUM(cantidad_indci * signo_intci) AS existencia                
        FROM
            inv_det_comp_inve dci
            INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
            LEFT JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
            LEFT JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
        WHERE
            ide_inepi = 1
            AND dci.ide_empr = 0
            AND cci.ide_inbod = v_ide_inbod
            AND cci.fecha_trans_incci <= p_fecha_reconteo
            AND dci.ide_inarti = v_ide_inarti
        GROUP BY dci.ide_inarti
    )
    SELECT COALESCE(f_redondeo(ec.existencia, v_decimales_stock), 0)
    INTO v_saldo_actual
    FROM inv_articulo a
    LEFT JOIN existencia_cte ec ON a.ide_inarti = ec.ide_inarti
    WHERE a.ide_inarti = v_ide_inarti;
    
    -- 3. CALCULAR DIFERENCIAS (para reconteo)
    v_cantidad_anterior := COALESCE(v_cantidad_fisica_indcf, 0);
    
    -- Diferencia del conteo anterior
    v_diferencia_anterior := v_cantidad_anterior - v_saldo_corte_indcf;
    
    -- Diferencia del reconteo
    v_diferencia_reconteo := p_cantidad_recontada - v_saldo_corte_indcf;
    
    -- Calcular porcentajes (igual lógica que en conteo)
    IF v_saldo_corte_indcf = 0 THEN
        IF v_cantidad_anterior = 0 THEN
            v_porcentaje_anterior := 0;
        ELSE
            v_porcentaje_anterior := 100;
        END IF;
        
        IF p_cantidad_recontada = 0 THEN
            v_porcentaje_reconteo := 0;
        ELSE
            v_porcentaje_reconteo := 100;
        END IF;
    ELSE
        v_porcentaje_anterior := ABS(v_diferencia_anterior) / v_saldo_corte_indcf * 100;
        v_porcentaje_reconteo := ABS(v_diferencia_reconteo) / v_saldo_corte_indcf * 100;
    END IF;
    
    -- 4. DETERMINAR SI MEJORÓ LA DIFERENCIA (solo para reconteo)
    v_mejoro_diferencia := ABS(v_diferencia_reconteo) < ABS(v_diferencia_anterior);
    
    -- 5. DETERMINAR SI REQUIERE AJUSTE (basado en tolerancia - igual que en conteo)
    v_requiere_ajuste := ABS(v_porcentaje_reconteo) > v_tolerancia;
    
    -- 6. DETERMINAR NUEVO ESTADO DEL ÍTEM (similar a conteo pero para reconteo)
    v_estado_item := 'RECONTADO';
    
    -- Si hay diferencia significativa, marcar para revisión (igual que en conteo)
    IF v_requiere_ajuste THEN
        v_estado_item := 'REVISION';
    END IF;
    
    -- 7. CALCULAR NUEVO NÚMERO DE RECONTEO
    v_numero_reconteos := COALESCE(v_numero_reconteos_indcf, 0) + 1;
    
    -- 8. OBTENER COSTO UNITARIO A LA FECHA DEL RECONTEO
    -- (Misma lógica exacta que en f_registrar_conteo_fisico)
    WITH costos_producto AS (
        -- Costo promedio ponderado hasta la fecha
        SELECT 
            iart.ide_inarti,
            CASE 
                WHEN SUM(CASE WHEN tci.signo_intci > 0 THEN dci.cantidad_indci ELSE 0 END) > 0 
                THEN ROUND(
                    SUM(CASE WHEN tci.signo_intci > 0 THEN dci.precio_indci * dci.cantidad_indci ELSE 0 END) / 
                    SUM(CASE WHEN tci.signo_intci > 0 THEN dci.cantidad_indci ELSE 0 END), 
                    4
                )
                ELSE NULL
            END AS costo_promedio,
            
            -- Último costo de compra antes de la fecha
            (SELECT dci2.precio_indci
             FROM inv_det_comp_inve dci2
             INNER JOIN inv_cab_comp_inve cci2 ON cci2.ide_incci = dci2.ide_incci
             INNER JOIN inv_tip_tran_inve tti2 ON tti2.ide_intti = cci2.ide_intti
             INNER JOIN inv_tip_comp_inve tci2 ON tci2.ide_intci = tti2.ide_intci
             WHERE dci2.ide_inarti = v_ide_inarti 
               AND tci2.signo_intci > 0
               AND cci2.ide_inepi = 1 -- Estado aprobado
               AND cci2.fecha_trans_incci <= p_fecha_reconteo
               AND cci2.ide_inbod = v_ide_inbod
               AND dci2.ide_empr = 0
             ORDER BY cci2.fecha_trans_incci DESC, dci2.ide_indci DESC
             LIMIT 1) AS ultimo_costo
        FROM inv_articulo iart
        LEFT JOIN inv_det_comp_inve dci ON dci.ide_inarti = iart.ide_inarti
        LEFT JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
        LEFT JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
        LEFT JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
        WHERE iart.ide_inarti = v_ide_inarti
          AND iart.ide_empr = 0
          AND (cci.ide_inepi IS NULL OR cci.ide_inepi = 1) -- Estado aprobado
          AND (cci.fecha_trans_incci IS NULL OR cci.fecha_trans_incci <= p_fecha_reconteo)
          AND (cci.ide_inbod IS NULL OR cci.ide_inbod = v_ide_inbod)
        GROUP BY iart.ide_inarti
    )
    SELECT 
        -- Jerarquía de costos: 1. Costo promedio, 2. Último costo en fecha
        COALESCE(
            costo_promedio, 
            ultimo_costo,
            v_costo_unitario_actual, -- Usar el costo anterior si no se encuentra nuevo
            0
        ) 
    INTO v_costo_unitario
    FROM costos_producto;
    
    -- Calcular valor de la diferencia del reconteo
    v_valor_diferencia := v_diferencia_reconteo * v_costo_unitario;
    
    -- 9. ACTUALIZAR EL DETALLE DEL CONTEO (similar a conteo pero con campos de reconteo)
    UPDATE inv_det_conteo_fisico
    SET 
        -- Guardar el conteo anterior en campos de reconteo
        cantidad_reconteo_indcf = v_cantidad_anterior,
        fecha_reconteo_indcf = COALESCE(fecha_reconteo_indcf, p_fecha_reconteo),
        usuario_reconteo_indcf = COALESCE(usuario_reconteo_indcf, p_usuario_reconteo),
        
        -- Actualizar con el nuevo conteo (igual que en conteo)
        cantidad_fisica_indcf = p_cantidad_recontada,
        fecha_conteo_indcf = p_fecha_reconteo,
        usuario_conteo_indcf = p_usuario_reconteo,
        
        -- Actualizar saldo actual (igual que en conteo)
        saldo_conteo_indcf = v_saldo_actual,
        
        -- Observación: concatenar si hay observación anterior
        observacion_indcf = CASE 
            WHEN p_observacion IS NOT NULL 
            THEN COALESCE(v_observacion_indcf || ' | ', '') || 
                 'Reconteo #' || v_numero_reconteos || ' (' || p_fecha_reconteo || '): ' || p_observacion
            ELSE v_observacion_indcf
        END,
        
        -- Incrementar contador de reconteos
        numero_reconteos_indcf = v_numero_reconteos,
        
        -- Guardar motivo si se proporciona
        motivo_diferencia_indcf = COALESCE(p_motivo_reconteo, motivo_diferencia_indcf),
        
        -- Estado y ajuste (similar a conteo)
        estado_item_indcf = v_estado_item,
        requiere_ajuste_indcf = v_requiere_ajuste,
        
        -- Costo y valor (igual que en conteo)
        costo_unitario_indcf = v_costo_unitario,
        
        -- Auditoría (igual que en conteo)
        fecha_actua = CURRENT_TIMESTAMP,
        usuario_actua = p_usuario_reconteo
    WHERE ide_indcf = p_ide_indcf;
    
    -- 10. RETORNAR RESULTADOS (similar estructura a conteo pero con campos adicionales)
    id_detalle := p_ide_indcf;
    id_articulo := v_ide_inarti;
    saldo_corte := v_saldo_corte_indcf;
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
    total_reconteos := v_numero_reconteos;
    costo_unitario := v_costo_unitario;
    valor_diferencia := v_valor_diferencia;
    
    -- Construir mensaje informativo (similar a conteo)
    mensaje := 'Reconteo #' || v_numero_reconteos || ' registrado para "' || v_nombre_articulo || '"';
    
    IF v_mejoro_diferencia THEN
        mensaje := mensaje || ' (Mejoró en ' || 
                  ROUND(ABS(v_diferencia_anterior) - ABS(v_diferencia_reconteo), 3) || 
                  ' unidades)';
    ELSE
        mensaje := mensaje || ' (No mejoró)';
    END IF;
    
    IF v_requiere_ajuste THEN
        mensaje := mensaje || ' (Requiere revisión - Diferencia: ' || ROUND(v_porcentaje_reconteo, 2) || '%)';
    ELSIF v_diferencia_reconteo != 0 THEN
        mensaje := mensaje || ' (Diferencia: ' || ROUND(v_porcentaje_reconteo, 2) || '%)';
    ELSE
        mensaje := mensaje || ' (Sin diferencias)';
    END IF;
    
    RETURN NEXT;
END;
$$;


SELECT * FROM inv_det_conteo_fisico

-- Probar la función de reconteo
SELECT * FROM f_registrar_reconteo_fisico(
    p_ide_indcf := 6479,
    p_cantidad_recontada := 3,
    p_observacion := 'Reconteo realizado por admin',
    p_usuario_reconteo := 'admin'
);

