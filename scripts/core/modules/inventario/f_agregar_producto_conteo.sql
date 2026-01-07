CREATE OR REPLACE FUNCTION public.f_agregar_producto_conteo(
    p_ide_inccf INT8,                    -- ID de la cabecera del conteo existente
    p_ide_inarti INT8,                   -- ID del artículo a agregar
    p_usuario_agrega VARCHAR(50) DEFAULT CURRENT_USER, -- Usuario que agrega
    p_observacion VARCHAR(500) DEFAULT NULL, -- Observación opcional
    p_forzar_agregar BOOLEAN DEFAULT false -- Forzar agregar incluso si ya existe
)
RETURNS TABLE (
    id_detalle_agregado INT8,
    id_cabecera_conteo INT8,
    id_articulo INT8,
    nombre_articulo VARCHAR(200),
    saldo_corte NUMERIC(12,3),
    movimientos_conteo INT,
    mensaje VARCHAR(200),
    ya_existia BOOLEAN,
    productos_estimados_actual INT,
    productos_contados_actual INT,
    porcentaje_avance_actual NUMERIC(5,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    -- Variables para cabecera
    v_ide_inbod INT8;
    v_fecha_corte DATE;
    v_fecha_corte_desde DATE;
    v_ide_inec INT8;
    v_estado_conteo VARCHAR(20);
    v_total_productos_anterior INT;
    v_productos_contados_anterior INT;
    v_porcentaje_avance_anterior NUMERIC(5,2);
    
    -- Variables para artículo
    v_nombre_articulo VARCHAR(200);
    v_decim_stock_inarti INT;
    v_nivel_inarti VARCHAR(10);
    v_hace_kardex_inarti BOOLEAN;
    v_activo_inarti BOOLEAN;
    
    -- Variables para cálculos
    v_saldo_corte NUMERIC(12,3);
    v_movimientos_conteo INT;
    v_id_detalle INT8;
    v_ya_existe BOOLEAN := false;
    v_id_detalle_existente INT8;
    
    -- Variables actualizadas
    v_total_productos_actual INT;
    v_productos_contados_actual INT;
    v_porcentaje_avance_actual NUMERIC(5,2);
    
    -- Control de errores
    v_error_message TEXT;
BEGIN
    /* =====================================================
       1. VALIDACIONES DE CABECERA
    ===================================================== */
    
    BEGIN
        SELECT
            c.ide_inbod,
            c.fecha_corte_inccf,
            c.fecha_corte_desde_inccf,
            c.ide_inec,
            c.productos_estimados_inccf,
            c.productos_contados_inccf,
            c.porcentaje_avance_inccf,
            ec.codigo_inec
        INTO
            v_ide_inbod,
            v_fecha_corte,
            v_fecha_corte_desde,
            v_ide_inec,
            v_total_productos_anterior,
            v_productos_contados_anterior,
            v_porcentaje_avance_anterior,
            v_estado_conteo
        FROM inv_cab_conteo_fisico c
        JOIN inv_estado_conteo ec ON ec.ide_inec = c.ide_inec
        WHERE c.ide_inccf = p_ide_inccf
          AND c.activo_inccf;
        
        IF v_ide_inbod IS NULL THEN
            RAISE EXCEPTION 'No se encontró el conteo con ID %', p_ide_inccf;
        END IF;
        
        IF v_estado_conteo IN ('CERRADO','AJUSTADO','CANCELADO') THEN
            RAISE EXCEPTION 'El conteo está en estado % y no se pueden agregar productos', v_estado_conteo;
        END IF;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE EXCEPTION 'No se encontró el conteo con ID %', p_ide_inccf;
    END;
    
    /* =====================================================
       2. VALIDACIONES DEL ARTÍCULO
    ===================================================== */
    
    BEGIN
        SELECT
            nombre_inarti,
            decim_stock_inarti,
            nivel_inarti,
            hace_kardex_inarti,
            activo_inarti
        INTO
            v_nombre_articulo,
            v_decim_stock_inarti,
            v_nivel_inarti,
            v_hace_kardex_inarti,
            v_activo_inarti
        FROM inv_articulo
        WHERE ide_inarti = p_ide_inarti;
        
        IF v_nombre_articulo IS NULL THEN
            RAISE EXCEPTION 'No se encontró el artículo con ID %', p_ide_inarti;
        END IF;
        
        IF v_nivel_inarti != 'HIJO' THEN
            RAISE EXCEPTION 'El artículo debe ser de nivel HIJO para agregarlo al conteo';
        END IF;
        
        IF NOT v_hace_kardex_inarti THEN
            RAISE EXCEPTION 'El artículo no tiene habilitado el manejo de kardex';
        END IF;
        
        IF NOT v_activo_inarti THEN
            RAISE EXCEPTION 'El artículo está inactivo';
        END IF;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE EXCEPTION 'No se encontró el artículo con ID %', p_ide_inarti;
    END;
    
    /* =====================================================
       3. VERIFICAR SI EL ARTÍCULO YA EXISTE EN EL CONTEO
    ===================================================== */
    
    SELECT ide_indcf, TRUE
    INTO v_id_detalle_existente, v_ya_existe
    FROM inv_det_conteo_fisico
    WHERE ide_inccf = p_ide_inccf
      AND ide_inarti = p_ide_inarti
      AND activo_indcf;
    
    IF v_ya_existe AND NOT p_forzar_agregar THEN
        RAISE EXCEPTION 'El artículo "%" ya existe en este conteo (ID detalle: %)', 
                        v_nombre_articulo, v_id_detalle_existente;
    END IF;
    
    /* =====================================================
       4. CALCULAR SALDO A FECHA DE CORTE
       (Misma lógica que f_genera_conteo_inventario)
    ===================================================== */
    
    WITH movimientos_almacen AS (
        SELECT
            d.ide_inarti,
            c.fecha_trans_incci,
            d.cantidad_indci * tci.signo_intci as cantidad,
            CASE 
                WHEN c.fecha_trans_incci BETWEEN 
                    v_fecha_corte_desde::timestamp 
                    AND (v_fecha_corte + 1)::timestamp 
                THEN 1 
                ELSE 0 
            END as en_rango
        FROM inv_cab_comp_inve c
        JOIN inv_det_comp_inve d ON d.ide_incci = c.ide_incci
        JOIN inv_tip_tran_inve tti ON tti.ide_intti = c.ide_intti
        JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
        WHERE c.ide_inbod = v_ide_inbod
          AND c.ide_inepi = 1
          AND d.ide_inarti = p_ide_inarti
    )
    SELECT
        COALESCE(
            f_redondeo(
                SUM(
                    CASE
                        WHEN m.fecha_trans_incci <= v_fecha_corte::timestamp
                        THEN m.cantidad
                        ELSE 0
                    END
                ),
                v_decim_stock_inarti
            ), 0
        ),
        COALESCE(SUM(m.en_rango), 0)
    INTO
        v_saldo_corte,
        v_movimientos_conteo
    FROM movimientos_almacen m;
    
    /* =====================================================
       5. OBTENER NUEVO ID PARA EL DETALLE
    ===================================================== */
    
    IF v_ya_existe AND p_forzar_agregar THEN
        -- Si ya existe y forzamos, usar el mismo ID
        v_id_detalle := v_id_detalle_existente;
        
        -- Actualizar el detalle existente
        UPDATE inv_det_conteo_fisico
        SET saldo_corte_indcf = v_saldo_corte,
            movimientos_conteo_indcf = v_movimientos_conteo,
            observacion_indcf = COALESCE(p_observacion, observacion_indcf),
            fecha_actua = CURRENT_TIMESTAMP,
            usuario_actua = p_usuario_agrega,
            activo_indcf = true -- Reactivar si estaba inactivo
        WHERE ide_indcf = v_id_detalle;
        
    ELSE
        -- Obtener nuevo ID para el detalle
        v_id_detalle := get_seq_table(
            'inv_det_conteo_fisico', 
            'ide_indcf', 
            1, 
            p_usuario_agrega
        );
        
        /* =====================================================
           6. INSERTAR NUEVO DETALLE
        ===================================================== */
        
        INSERT INTO inv_det_conteo_fisico (
            ide_indcf,
            ide_inccf,
            ide_inarti,
            saldo_corte_indcf,
            cantidad_fisica_indcf,
            estado_item_indcf,
            usuario_ingre,
            fecha_ingre,
            saldo_conteo_indcf,
            requiere_ajuste_indcf,
            movimientos_conteo_indcf,
            observacion_indcf,
            activo_indcf,
            usuario_conteo_indcf,
            fecha_conteo_indcf
        ) VALUES (
            v_id_detalle,
            p_ide_inccf,
            p_ide_inarti,
            v_saldo_corte,
            0, -- cantidad_fisica_indcf
            'PENDIENTE', -- estado_item_indcf
            p_usuario_agrega,
            CURRENT_TIMESTAMP,
            v_saldo_corte, -- saldo_conteo_indcf (inicialmente igual al saldo corte)
            false, -- requiere_ajuste_indcf
            v_movimientos_conteo,
            p_observacion,
            true, -- activo_indcf
            NULL, -- usuario_conteo_indcf
            NULL  -- fecha_conteo_indcf
        );
    END IF;
    
    /* =====================================================
       7. RECALCULAR ESTADÍSTICAS DE LA CABECERA
    ===================================================== */
    
    -- Recalcular productos estimados (todos los detalles activos)
    SELECT COUNT(*)
    INTO v_total_productos_actual
    FROM inv_det_conteo_fisico
    WHERE ide_inccf = p_ide_inccf
      AND activo_indcf;
    
    -- Recalcular productos contados (estados finales)
    SELECT COUNT(*)
    INTO v_productos_contados_actual
    FROM inv_det_conteo_fisico
    WHERE ide_inccf = p_ide_inccf
      AND activo_indcf
      AND estado_item_indcf IN ('CONTADO','REVISION','AJUSTADO', 'VALIDADO','RECONTADO');
    
    -- Calcular nuevo porcentaje de avance
    IF v_total_productos_actual > 0 THEN
        v_porcentaje_avance_actual := ROUND(
            (v_productos_contados_actual::NUMERIC / v_total_productos_actual) * 100, 
            2
        );
    ELSE
        v_porcentaje_avance_actual := 0;
    END IF;
    
    -- Actualizar cabecera
    UPDATE inv_cab_conteo_fisico
    SET productos_estimados_inccf = v_total_productos_actual,
        productos_contados_inccf = v_productos_contados_actual,
        porcentaje_avance_inccf = v_porcentaje_avance_actual,
        fecha_actua = CURRENT_TIMESTAMP,
        usuario_actua = p_usuario_agrega
    WHERE ide_inccf = p_ide_inccf;
    
    /* =====================================================
       8. PREPARAR RETORNO
    ===================================================== */
    
    id_detalle_agregado := v_id_detalle;
    id_cabecera_conteo := p_ide_inccf;
    id_articulo := p_ide_inarti;
    nombre_articulo := v_nombre_articulo;
    saldo_corte := v_saldo_corte;
    movimientos_conteo := v_movimientos_conteo;
    ya_existia := v_ya_existe;
    productos_estimados_actual := v_total_productos_actual;
    productos_contados_actual := v_productos_contados_actual;
    porcentaje_avance_actual := v_porcentaje_avance_actual;
    
    IF v_ya_existe AND p_forzar_agregar THEN
        mensaje := 'Artículo "' || v_nombre_articulo || 
                   '" actualizado en el conteo. Estado: ' || 
                   (SELECT estado_item_indcf FROM inv_det_conteo_fisico WHERE ide_indcf = v_id_detalle) ||
                   '. Productos totales: ' || v_total_productos_actual;
    ELSE
        mensaje := 'Artículo "' || v_nombre_articulo || 
                   '" agregado al conteo exitosamente. Saldo corte: ' || 
                   v_saldo_corte || '. Productos totales: ' || v_total_productos_actual;
    END IF;
    
    RETURN NEXT;
    
EXCEPTION
    WHEN OTHERS THEN
        v_error_message := 'Error al agregar producto al conteo: ' || SQLERRM;
        RAISE EXCEPTION '%', v_error_message;
END;
$$;


--- probar
SELECT * FROM f_agregar_producto_conteo(
    2, 
    1705, 
    'admin'    
);
