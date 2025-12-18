CREATE OR REPLACE FUNCTION public.f_registrar_conteo_fisico(
    p_ide_indcf INT8,                    -- ID del detalle del conteo
    p_cantidad_contada NUMERIC(12,3),    -- Cantidad física contada
    p_observacion VARCHAR(500) DEFAULT NULL, -- Observación del conteo
    p_usuario_conteo VARCHAR(50) DEFAULT CURRENT_USER, -- Usuario que cuenta
    p_fecha_conteo TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Fecha del conteo
)
RETURNS TABLE (
    id_detalle INT8,
    id_articulo INT8,
    saldo_corte NUMERIC(12,3),
    cantidad_contada NUMERIC(12,3),
    saldo_actual NUMERIC(12,3),
    diferencia NUMERIC(12,3),
    porcentaje_diferencia NUMERIC(6,2),
    mensaje VARCHAR(200),
    estado_actual VARCHAR(20),
    requiere_ajuste BOOLEAN,
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
    v_observacion_indcf VARCHAR(200);
    v_activo_indcf BOOLEAN;
    
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
    v_diferencia NUMERIC(12,3);
    v_porcentaje_diferencia NUMERIC(6,2);
    v_estado_item VARCHAR(20);
    v_requiere_ajuste BOOLEAN;
    v_tolerancia NUMERIC(5,2);
    v_costo_unitario NUMERIC(12,3) := 0;
    v_valor_diferencia NUMERIC(15,3) := 0;
    v_nombre_articulo VARCHAR(200);
    v_decimales_stock INT;
BEGIN
    -- 1. VALIDACIONES INICIALES
    
    -- Verificar que existe el detalle del conteo y obtener sus datos
    SELECT 
        d.ide_inarti,
        d.saldo_corte_indcf,
        d.cantidad_fisica_indcf,
        d.estado_item_indcf,
        d.observacion_indcf,
        d.activo_indcf,
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
    
    -- Obtener tolerancia del tipo de conteo
    SELECT COALESCE(t.tolerancia_porcentaje_intc, 2.00) INTO v_tolerancia
    FROM inv_tipo_conteo t
    WHERE t.ide_intc = v_ide_intc;
    
    -- Obtener nombre del artículo para mensajes
    SELECT nombre_inarti, decim_stock_inarti 
    INTO v_nombre_articulo, v_decimales_stock
    FROM inv_articulo 
    WHERE ide_inarti = v_ide_inarti;
    
    -- Verificar que el conteo no esté cerrado
    IF v_estado_conteo IN ('CERRADO', 'AJUSTADO', 'CANCELADO') THEN
        RAISE EXCEPTION 'El conteo está en estado % y no se puede modificar', v_estado_conteo;
    END IF;
    
    -- **VALIDACIÓN CORREGIDA: Si ya existe un conteo previo (diferente de PENDIENTE)**
    -- **lanzar excepción indicando que debe usar función de reconteo**
    IF v_estado_item_indcf != 'PENDIENTE' THEN
        RAISE EXCEPTION 'El producto "%" ya tiene un conteo registrado (Estado: %). Debe usar la función de reconteo para actualizar.', 
                        v_nombre_articulo, v_estado_item_indcf;
    END IF;
    
    -- Verificar que la cantidad contada sea válida
    IF p_cantidad_contada < 0 THEN
        RAISE EXCEPTION 'La cantidad contada no puede ser negativa';
    END IF;
    
    -- 2. OBTENER SALDO ACTUAL DEL ARTÍCULO A LA FECHA DEL CONTEO
    
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
            AND cci.fecha_trans_incci <= p_fecha_conteo
            AND dci.ide_inarti = v_ide_inarti
        GROUP BY dci.ide_inarti
    )
    SELECT COALESCE(f_redondeo(ec.existencia, v_decimales_stock), 0)
    INTO v_saldo_actual
    FROM inv_articulo a
    LEFT JOIN existencia_cte ec ON a.ide_inarti = ec.ide_inarti
    WHERE a.ide_inarti = v_ide_inarti;
    
    -- 3. OBTENER DATOS PARA CÁLCULOS
    v_cantidad_anterior := COALESCE(v_cantidad_fisica_indcf, 0);
    v_diferencia := p_cantidad_contada - v_saldo_corte_indcf;
    
    -- Calcular porcentaje de diferencia (evitar división por cero)
    IF v_saldo_corte_indcf = 0 THEN
        IF p_cantidad_contada = 0 THEN
            v_porcentaje_diferencia := 0;
        ELSE
            v_porcentaje_diferencia := 100; -- De 0 a algo es 100% de diferencia
        END IF;
    ELSE
        v_porcentaje_diferencia := ABS(v_diferencia) / v_saldo_corte_indcf * 100;
    END IF;
    
    -- 5. DETERMINAR SI REQUIERE AJUSTE (basado en tolerancia)
    v_requiere_ajuste := ABS(v_porcentaje_diferencia) > v_tolerancia;
    
    -- 6. DETERMINAR NUEVO ESTADO DEL ÍTEM
    
    -- Si es la primera vez que se cuenta
    IF v_estado_item_indcf = 'PENDIENTE' THEN
        v_estado_item := 'CONTADO';
    ELSE
        v_estado_item := 'ACTUALIZADO';
    END IF;
    
    -- Si hay diferencia significativa, marcar para revisión
    IF v_requiere_ajuste THEN
        v_estado_item := 'REVISION';
    END IF;
    
    -- 7. OBTENER COSTO UNITARIO A LA FECHA DEL CONTEO
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
               AND cci2.fecha_trans_incci <= p_fecha_conteo
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
          AND (cci.fecha_trans_incci IS NULL OR cci.fecha_trans_incci <= p_fecha_conteo)
          AND (cci.ide_inbod IS NULL OR cci.ide_inbod = v_ide_inbod)
        GROUP BY iart.ide_inarti
    )
    SELECT 
        -- Jerarquía de costos: 1. Costo promedio, 2. Último costo en fecha
        COALESCE(
            costo_promedio, 
            ultimo_costo,
            0
        ) 
    INTO v_costo_unitario
    FROM costos_producto;
    
    -- Calcular valor de la diferencia
    v_valor_diferencia := v_diferencia * v_costo_unitario;
    
    -- 8. ACTUALIZAR EL DETALLE DEL CONTEO
    UPDATE inv_det_conteo_fisico
    SET 
        cantidad_fisica_indcf = p_cantidad_contada,
        fecha_conteo_indcf = p_fecha_conteo,
        usuario_conteo_indcf = p_usuario_conteo,
        
        saldo_conteo_indcf = v_saldo_actual,
        observacion_indcf = COALESCE(p_observacion, v_observacion_indcf),
        estado_item_indcf = v_estado_item,
        
        requiere_ajuste_indcf = v_requiere_ajuste,
        costo_unitario_indcf = v_costo_unitario,
        
        fecha_actua = CURRENT_TIMESTAMP,
        usuario_actua = p_usuario_conteo
    WHERE ide_indcf = p_ide_indcf;
    
    -- 9. RETORNAR RESULTADOS
    id_detalle := p_ide_indcf;
    id_articulo := v_ide_inarti;
    saldo_corte := v_saldo_corte_indcf;
    cantidad_contada := p_cantidad_contada;
    saldo_actual := v_saldo_actual;
    diferencia := v_diferencia;
    porcentaje_diferencia := v_porcentaje_diferencia;
    estado_actual := v_estado_item;
    requiere_ajuste := v_requiere_ajuste;
    costo_unitario := v_costo_unitario;
    valor_diferencia := v_valor_diferencia;
    
    -- Construir mensaje informativo
    IF v_estado_item_indcf = 'PENDIENTE' THEN
        mensaje := 'Conteo registrado exitosamente para "' || v_nombre_articulo || '"';
    ELSE
        mensaje := 'Conteo actualizado exitosamente para "' || v_nombre_articulo || '"';
    END IF;
    
    IF v_requiere_ajuste THEN
        mensaje := mensaje || ' (Requiere revisión - Diferencia: ' || ROUND(v_porcentaje_diferencia, 2) || '%)';
    ELSIF v_diferencia != 0 THEN
        mensaje := mensaje || ' (Diferencia: ' || ROUND(v_porcentaje_diferencia, 2) || '%)';
    ELSE
        mensaje := mensaje || ' (Sin diferencias)';
    END IF;
    
    RETURN NEXT;
END;
$$;


---probar 
SELECT * FROM f_registrar_conteo_fisico(
    p_ide_indcf := 2,
    p_cantidad_contada := 10,
    p_observacion := 'Primer conteo realizado',
    p_usuario_conteo := 'edison',
    p_fecha_conteo := '2025-05-05'
);