CREATE OR REPLACE FUNCTION public.f_registrar_reconteo_fisico(
    p_ide_indcf INT8,                    -- ID del detalle del conteo
    p_cantidad_recontada NUMERIC(12,3),  -- Cantidad física recontada
    p_observacion VARCHAR(500) DEFAULT NULL, -- Observación del reconteo
    p_usuario_reconteo VARCHAR(50) DEFAULT CURRENT_USER, -- Usuario que reconteo
    p_fecha_reconteo TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Fecha del reconteo
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
    valor_diferencia NUMERIC(15,3),
    porcentaje_avance NUMERIC(5,2),
    productos_contados INT,
    movimientos_desde_corte INT,
    productos_con_diferencia INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    -- Detalle
    v_ide_inarti INT8;
    v_saldo_corte_indcf NUMERIC(12,3);
    v_cantidad_fisica_anterior NUMERIC(12,3);
    v_estado_item_indcf VARCHAR(20);
    v_observacion_indcf VARCHAR(200);
    v_costo_unitario_actual NUMERIC(12,3);
    v_requiere_ajuste_anterior BOOLEAN;
    v_numero_reconteos_anterior INT;

    -- Cabecera
    v_ide_inccf INT8;
    v_ide_inbod INT8;
    v_ide_inec INT8;
    v_ide_intc INT8;
    v_estado_conteo VARCHAR(20);
    v_fecha_corte_inccf DATE;
    v_fecha_corte_desde_inccf DATE;
    v_tolerancia_global NUMERIC(5,2);
    v_total_productos INT;

    -- Cálculos
    v_saldo_actual NUMERIC(12,3);
    v_diferencia NUMERIC(12,3);
    v_porcentaje_diferencia NUMERIC(6,2);
    v_estado_item VARCHAR(20);
    v_requiere_ajuste BOOLEAN;
    v_tolerancia_item NUMERIC(5,2);
    v_valor_diferencia NUMERIC(15,3);
    v_nombre_articulo VARCHAR(200);
    v_decimales_stock INT;

    -- Estadísticas
    v_movimientos_desde_corte INT := 0;
    v_productos_contados INT;
    v_porcentaje_avance NUMERIC(5,2);
    v_productos_con_diferencia INT;

    -- Control
    v_estado_anterior VARCHAR(20);
    
    -- Para cálculo de costo
    v_costo_unitario_calculado NUMERIC(12,3) := 0;
BEGIN
    /* =====================================================
       1. VALIDACIONES Y DATOS BASE
    ===================================================== */

    SELECT
        d.ide_inarti,
        d.saldo_corte_indcf,
        d.cantidad_fisica_indcf,
        d.estado_item_indcf,
        d.observacion_indcf,
        d.costo_unitario_indcf,
        d.requiere_ajuste_indcf,
        d.numero_reconteos_indcf,  -- CORREGIDO: Obtener número de reconteos actual
        c.ide_inccf,
        c.ide_inbod,
        c.ide_inec,
        c.ide_intc,
        c.fecha_corte_inccf,
        c.fecha_corte_desde_inccf,
        c.tolerancia_porcentaje_inccf,
        c.productos_estimados_inccf
    INTO
        v_ide_inarti,
        v_saldo_corte_indcf,
        v_cantidad_fisica_anterior,
        v_estado_item_indcf,
        v_observacion_indcf,
        v_costo_unitario_actual,
        v_requiere_ajuste_anterior,
        v_numero_reconteos_anterior,  -- CORREGIDO: Guardar número de reconteos
        v_ide_inccf,
        v_ide_inbod,
        v_ide_inec,
        v_ide_intc,
        v_fecha_corte_inccf,
        v_fecha_corte_desde_inccf,
        v_tolerancia_global,
        v_total_productos
    FROM inv_det_conteo_fisico d
    JOIN inv_cab_conteo_fisico c ON c.ide_inccf = d.ide_inccf
    WHERE d.ide_indcf = p_ide_indcf
      AND d.activo_indcf
      AND c.activo_inccf;

    IF v_ide_inarti IS NULL THEN
        RAISE EXCEPTION 'No se encontró el detalle del conteo %', p_ide_indcf;
    END IF;

    SELECT codigo_inec
    INTO v_estado_conteo
    FROM inv_estado_conteo
    WHERE ide_inec = v_ide_inec;

    IF v_estado_conteo IN ('CERRADO','AJUSTADO','CANCELADO') THEN
        RAISE EXCEPTION 'El conteo está en estado % y no puede modificarse', v_estado_conteo;
    END IF;

    IF v_estado_item_indcf in ('PENDIENTE', 'AJUSTADO', 'VALIDADO' , 'REVISION' ) THEN
        RAISE EXCEPTION 'El ítem no puede modificarse';
    END IF;
  

    IF p_cantidad_recontada < 0 THEN
        RAISE EXCEPTION 'La cantidad recontada no puede ser negativa';
    END IF;

    v_estado_anterior := v_estado_item_indcf;

    /* =====================================================
       2. SALDO ACTUAL A FECHA DE RECONTEO
    ===================================================== */

    SELECT nombre_inarti, decim_stock_inarti
    INTO v_nombre_articulo, v_decimales_stock
    FROM inv_articulo
    WHERE ide_inarti = v_ide_inarti;

    SELECT COALESCE(
        f_redondeo(
            SUM(dci.cantidad_indci * tci.signo_intci),
            v_decimales_stock
        ), 0)
    INTO v_saldo_actual
    FROM inv_det_comp_inve dci
    JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
    JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
    JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
    WHERE cci.ide_inepi = 1
      AND cci.ide_inbod = v_ide_inbod
      AND cci.fecha_trans_incci <= p_fecha_reconteo
      AND dci.ide_inarti = v_ide_inarti;

    /* =====================================================
       3. MOVIMIENTOS DESDE CORTE
    ===================================================== */

    SELECT COUNT(*)
    INTO v_movimientos_desde_corte
    FROM inv_det_comp_inve dci
    JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
    WHERE cci.ide_inepi = 1
      AND cci.ide_inbod = v_ide_inbod
      AND cci.fecha_trans_incci > v_fecha_corte_desde_inccf
      AND cci.fecha_trans_incci <= p_fecha_reconteo
      AND dci.ide_inarti = v_ide_inarti;

    /* =====================================================
       4. CALCULAR COSTO UNITARIO
    ===================================================== */

    WITH costos_producto AS (
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
            
            (SELECT dci2.precio_indci
             FROM inv_det_comp_inve dci2
             INNER JOIN inv_cab_comp_inve cci2 ON cci2.ide_incci = dci2.ide_incci
             INNER JOIN inv_tip_tran_inve tti2 ON tti2.ide_intti = cci2.ide_intti
             INNER JOIN inv_tip_comp_inve tci2 ON tci2.ide_intci = tti2.ide_intci
             WHERE dci2.ide_inarti = v_ide_inarti 
               AND tci2.signo_intci > 0
               AND cci2.ide_inepi = 1
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
          AND (cci.ide_inepi IS NULL OR cci.ide_inepi = 1)
          AND (cci.fecha_trans_incci IS NULL OR cci.fecha_trans_incci <= p_fecha_reconteo)
          AND (cci.ide_inbod IS NULL OR cci.ide_inbod = v_ide_inbod)
        GROUP BY iart.ide_inarti
    )
    SELECT 
        COALESCE(
            costo_promedio, 
            ultimo_costo,
            v_costo_unitario_actual,
            0
        ) 
    INTO v_costo_unitario_calculado
    FROM costos_producto;

    /* =====================================================
       5. CÁLCULOS
    ===================================================== */

    v_diferencia := p_cantidad_recontada - v_saldo_corte_indcf;

    IF v_saldo_corte_indcf = 0 THEN
        v_porcentaje_diferencia := CASE WHEN p_cantidad_recontada = 0 THEN 0 ELSE 100 END;
    ELSE
        v_porcentaje_diferencia := ABS(v_diferencia) / v_saldo_corte_indcf * 100;
    END IF;

    SELECT COALESCE(v_tolerancia_global, t.tolerancia_porcentaje_intc, 2)
    INTO v_tolerancia_item
    FROM inv_tipo_conteo t
    WHERE t.ide_intc = v_ide_intc;

    v_requiere_ajuste := ABS(v_porcentaje_diferencia) > v_tolerancia_item;

    v_estado_item := v_estado_item_indcf;
    
    IF v_requiere_ajuste THEN
        v_estado_item := 'REVISION';
    END IF;

    v_valor_diferencia := v_diferencia * COALESCE(v_costo_unitario_calculado, 0);

    /* =====================================================
       6. UPDATE DETALLE PARA RECONTEO - CORREGIDO
    ===================================================== */

    UPDATE inv_det_conteo_fisico
    SET 
        cantidad_fisica_indcf = p_cantidad_recontada,
        saldo_conteo_indcf = v_saldo_actual,
        movimientos_desde_corte_indcf = v_movimientos_desde_corte,
        estado_item_indcf = v_estado_item,
        requiere_ajuste_indcf = v_requiere_ajuste,
        observacion_indcf = COALESCE(
            CASE 
                WHEN observacion_indcf IS NULL THEN p_observacion
                ELSE observacion_indcf || ' | Reconteo: ' || p_observacion
            END, 
            'Reconteo realizado'
        ),
        usuario_reconteo_indcf = p_usuario_reconteo,
        fecha_reconteo_indcf = p_fecha_reconteo,
        fecha_actua = CURRENT_TIMESTAMP,
        usuario_actua = p_usuario_reconteo,
        costo_unitario_indcf = v_costo_unitario_calculado,
        numero_reconteos_indcf = COALESCE(v_numero_reconteos_anterior, 0) + 1  -- CORREGIDO: Usar campo correcto
    WHERE ide_indcf = p_ide_indcf;

    /* =====================================================
       7. ESTADÍSTICAS CABECERA - CON PRODUCTOS_CON_DIFERENCIA
    ===================================================== */

    -- Contar productos con diferencia
    SELECT COUNT(*)
    INTO v_productos_con_diferencia
    FROM inv_det_conteo_fisico
    WHERE ide_inccf = v_ide_inccf
      AND requiere_ajuste_indcf = true
      AND activo_indcf;

    -- Actualizar estadísticas de la cabecera
    UPDATE inv_cab_conteo_fisico c
    SET productos_contados_inccf = x.contados,
        porcentaje_avance_inccf  = CASE 
                                    WHEN v_total_productos > 0
                                    THEN ROUND((x.contados::NUMERIC / v_total_productos) * 100, 2)
                                    ELSE 0 
                                   END,
        productos_con_diferencia_inccf = v_productos_con_diferencia
    FROM (
        SELECT COUNT(*) contados
        FROM inv_det_conteo_fisico
        WHERE ide_inccf = v_ide_inccf
          AND estado_item_indcf IN ('CONTADO','REVISION','AJUSTADO','VALIDADO', 'RECONTADO')
          AND activo_indcf
    ) x
    WHERE c.ide_inccf = v_ide_inccf
    RETURNING 
        porcentaje_avance_inccf, 
        productos_contados_inccf
    INTO 
        v_porcentaje_avance, 
        v_productos_contados;

    /* =====================================================
       8. RETORNO
    ===================================================== */

    id_detalle := p_ide_indcf;
    id_articulo := v_ide_inarti;
    saldo_corte := v_saldo_corte_indcf;
    cantidad_contada := p_cantidad_recontada;
    saldo_actual := v_saldo_actual;
    diferencia := v_diferencia;
    porcentaje_diferencia := v_porcentaje_diferencia;
    estado_actual := v_estado_item;
    requiere_ajuste := v_requiere_ajuste;
    costo_unitario := COALESCE(v_costo_unitario_calculado, 0);
    valor_diferencia := v_valor_diferencia;
    porcentaje_avance := v_porcentaje_avance;
    productos_contados := v_productos_contados;
    movimientos_desde_corte := v_movimientos_desde_corte;
    productos_con_diferencia := v_productos_con_diferencia;

    mensaje := 'Reconteo registrado para "' || v_nombre_articulo ||
               '" - Avance: ' || ROUND(v_porcentaje_avance,2) || '%' ||
               CASE WHEN v_movimientos_desde_corte > 0 THEN 
                    ' (Hubo ' || v_movimientos_desde_corte || ' movimientos desde corte)' 
               ELSE '' END ||
               ' - Diferencias: ' || v_productos_con_diferencia ||
               ' - Anterior: ' || v_cantidad_fisica_anterior ||
               ' - Reconteo #' || (COALESCE(v_numero_reconteos_anterior, 0) + 1);

    RETURN NEXT;
END;
$$;


-- Probar la función de reconteo
SELECT * FROM f_registrar_reconteo_fisico(
    p_ide_indcf := 6479,
    p_cantidad_recontada := 3,
    p_observacion := 'Reconteo realizado por admin',
    p_usuario_reconteo := 'admin'
);