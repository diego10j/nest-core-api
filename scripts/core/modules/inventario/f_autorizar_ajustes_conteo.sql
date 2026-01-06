CREATE OR REPLACE FUNCTION public.f_autorizar_ajustes_conteo(
    p_ide_inccf INT8,
    p_ide_usua_aprueba INT8,
    p_observacion_aprobacion VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    tipo_ajuste VARCHAR(10),
    id_comprobante INT8,
    numero_comprobante VARCHAR,
    total_items INTEGER,
    total_valor NUMERIC(15,3),
    items_ajustados TEXT,
    mensaje VARCHAR,
    exito BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_detalle RECORD;
    v_tipo_transaccion_positiva INT8 := 21; -- Ajuste de Inventarios (+)
    v_tipo_transaccion_negativa INT8 := 0; -- Ajuste de Inventarios (-)
    v_ide_empr INT8; -- Empresa principal
    v_ide_sucu INT8; -- Sucursal principal
    v_ide_inepi INT8 := 1; -- Estado previo del inventario (PENDIENTE)
    v_ide_geper INT8 := 1556; --PRODUQUIMIC  
    
    -- Variables para comprobante positivo
    v_comprobante_positivo_id INT8;
    v_numero_positivo VARCHAR(10);
    v_total_positivo NUMERIC(15,3) := 0;
    v_items_positivos INTEGER := 0;
    v_descripcion_positivos TEXT := '';
    
    -- Variables para comprobante negativo
    v_comprobante_negativo_id INT8;
    v_numero_negativo VARCHAR(10);
    v_total_negativo NUMERIC(15,3) := 0;
    v_items_negativos INTEGER := 0;
    v_descripcion_negativos TEXT := '';
    
    v_tiene_positivos BOOLEAN := FALSE;
    v_tiene_negativos BOOLEAN := FALSE;
    v_bodega_comun INT8;
    v_contador_procesados INTEGER := 0;
    
    -- Variables para tiempo promedio
    v_fecha_min_conteo TIMESTAMP;
    v_fecha_max_conteo TIMESTAMP;
    v_tiempo_promedio INTERVAL;
    
    -- Variables para validación de cabecera
    v_existe_cabecera BOOLEAN;
    v_usuario_login VARCHAR(50);
    v_total_detalles INT;
    v_detalles_estados_validos INT;
    v_productos_ajustados INT;
    v_observacion_aprobacion_inccf VARCHAR(500);
    v_ide_inec_actual INT8;
    v_codigo_estado_actual VARCHAR(20);
    v_ide_inec_ajustado INT8 := 5; -- ID del estado AJUSTADO según tu tabla
BEGIN
    -- 1. VALIDACIONES INICIALES CON EXCEPCIONES
    IF p_ide_inccf IS NULL OR p_ide_inccf <= 0 THEN
        RAISE EXCEPTION 'ID de cabecera de conteo no válido';
    END IF;
    
    IF p_ide_usua_aprueba IS NULL OR p_ide_usua_aprueba <= 0 THEN
        RAISE EXCEPTION 'Usuario aprobador no válido';
    END IF;
    
    -- 2. VALIDAR EXISTENCIA DE CABECERA
    SELECT EXISTS(
        SELECT 1 
        FROM inv_cab_conteo_fisico 
        WHERE ide_inccf = p_ide_inccf
    ) INTO v_existe_cabecera;
    
    IF NOT v_existe_cabecera THEN
        RAISE EXCEPTION 'La cabecera de conteo con ID % no existe', p_ide_inccf;
    END IF;
    
    -- 3. OBTENER USUARIO LOGIN PARA AUDITORÍA
    SELECT nick_usua
    INTO v_usuario_login
    FROM sis_usuario
    WHERE ide_usua = p_ide_usua_aprueba;
    
    IF v_usuario_login IS NULL THEN
        RAISE EXCEPTION 'Usuario aprobador no encontrado';
    END IF;
    
    -- 4. VALIDAR ESTADO ACTUAL DE LA CABECERA
    SELECT c.ide_inec, e.codigo_inec
    INTO v_ide_inec_actual, v_codigo_estado_actual
    FROM inv_cab_conteo_fisico c
    LEFT JOIN inv_estado_conteo e ON c.ide_inec = e.ide_inec
    WHERE c.ide_inccf = p_ide_inccf;
    
    IF v_codigo_estado_actual = 'AJUSTADO' THEN
        RAISE EXCEPTION 'El conteo ya se encuentra en estado AJUSTADO';
    END IF;
    
    IF v_codigo_estado_actual = 'CERRADO' THEN
        RAISE EXCEPTION 'El conteo ya se encuentra en estado CERRADO';
    END IF;
    
    IF v_codigo_estado_actual = 'CANCELADO' THEN
        RAISE EXCEPTION 'El conteo se encuentra en estado CANCELADO';
    END IF;
    
    -- 5. VALIDAR ESTADOS DE LOS DETALLES DE LA CABECERA
    -- Verificar que todos los detalles estén en estados CONTADO, RECONTADO o VALIDADO
    SELECT COUNT(*)
    INTO v_total_detalles
    FROM inv_det_conteo_fisico
    WHERE ide_inccf = p_ide_inccf
      AND activo_indcf = TRUE;
    
    SELECT COUNT(*)
    INTO v_detalles_estados_validos
    FROM inv_det_conteo_fisico
    WHERE ide_inccf = p_ide_inccf
      AND activo_indcf = TRUE
      AND estado_item_indcf IN ('CONTADO', 'RECONTADO', 'VALIDADO');
    
    IF v_total_detalles != v_detalles_estados_validos THEN
        RAISE EXCEPTION 'La cabecera de conteo tiene detalles en estados no permitidos. Solo se permiten CONTADO, RECONTADO o VALIDADO';
    END IF;
    
    -- 6. OBTENER BODEGA, EMPRESA Y SUCURSAL DE LA CABECERA
    SELECT c.ide_inbod, c.ide_empr, c.ide_sucu
    INTO v_bodega_comun, v_ide_empr, v_ide_sucu
    FROM inv_cab_conteo_fisico c
    WHERE c.ide_inccf = p_ide_inccf;
    
    IF v_bodega_comun IS NULL THEN
        RAISE EXCEPTION 'No se pudo determinar la bodega del conteo';
    END IF;
    
    IF v_ide_sucu IS NULL OR v_ide_sucu < 0 THEN
        RAISE EXCEPTION 'No se pudo determinar la sucursal del conteo';
    END IF;
    
     IF v_ide_empr IS NULL OR v_ide_empr < 0 THEN
        RAISE EXCEPTION 'No se pudo determinar la empresa del conteo';
    END IF;
    
    -- 7. OBTENER DETALLES VÁLIDOS PARA AJUSTE
    -- Detalles que cumplan: aprobado_ajuste_indcf = true, cantidad_ajuste_indcf != 0, estado = 'VALIDADO'
    -- y pertenezcan a la cabecera especificada
    FOR v_detalle IN 
        SELECT 
            d.ide_indcf,
            d.cantidad_ajuste_indcf,
            d.ide_inarti,
            d.saldo_antes_ajuste_indcf,
            d.saldo_corte_indcf,
            d.costo_unitario_indcf,
            a.nombre_inarti
        FROM inv_det_conteo_fisico d
        JOIN inv_articulo a ON d.ide_inarti = a.ide_inarti
        WHERE d.aprobado_ajuste_indcf = true
          AND d.cantidad_ajuste_indcf != 0
          AND d.estado_item_indcf = 'VALIDADO'
          AND d.ide_inccf = p_ide_inccf
          AND d.activo_indcf = TRUE
    LOOP
        -- Determinar tipo de ajuste
        IF v_detalle.cantidad_ajuste_indcf > 0 THEN
            v_tiene_positivos := TRUE;
        ELSE
            v_tiene_negativos := TRUE;
        END IF;
    END LOOP;
    
    -- 8. VALIDAR QUE HAYA DETALLES PARA PROCESAR
    IF NOT v_tiene_positivos AND NOT v_tiene_negativos THEN
        RAISE EXCEPTION 'No se encontraron detalles válidos para ajustar en la cabecera %. Verifique: 1) aprobado_ajuste_indcf = true, 2) cantidad_ajuste_indcf != 0, 3) estado_item_indcf = VALIDADO', p_ide_inccf;
    END IF;
    
    -- 9. CREAR COMPROBANTE PARA AJUSTES POSITIVOS (SOBRANTES)
    IF v_tiene_positivos THEN
        -- Obtener próximo ID para cabecera usando get_seq_table
        SELECT get_seq_table(
            table_name := 'inv_cab_comp_inve',
            primary_key := 'ide_incci',
            number_rows_added := 1,
            login := v_usuario_login
        ) INTO v_comprobante_positivo_id;
        
      -- Obtener número de comprobante usando la función específica para inventarios
        v_numero_positivo := f_get_sec_comprobante_inv(v_bodega_comun);
        
        -- Insertar cabecera del comprobante positivo
        INSERT INTO inv_cab_comp_inve (
            ide_incci,
            numero_incci,
            fecha_trans_incci,
            ide_inbod,
            ide_intti,
            ide_inepi,
            ide_geper,
            ide_usua,
            observacion_incci,
            ide_empr,
            ide_sucu,
            usuario_ingre,
            fecha_ingre,
            verifica_incci,
            fecha_siste_incci,
            hora_ingre,
            hora_sistem_incci,
            automatico_incci
        ) VALUES (
            v_comprobante_positivo_id,
            v_numero_positivo,
            CURRENT_TIMESTAMP,
            v_bodega_comun,
            v_tipo_transaccion_positiva,
            v_ide_inepi,
            v_ide_geper,
            p_ide_usua_aprueba,
            COALESCE(p_observacion_aprobacion, 'Ajuste positivo por conteo físico') || 
            ' - Conteo: ' || p_ide_inccf,
            v_ide_empr,
            v_ide_sucu,
            v_usuario_login,
            CURRENT_TIMESTAMP,
            TRUE,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            TRUE
        );
        
        -- Procesar cada detalle positivo
        FOR v_detalle IN 
            SELECT 
                d.ide_indcf,
                d.cantidad_ajuste_indcf,
                d.ide_inarti,
                d.saldo_antes_ajuste_indcf,
                d.saldo_corte_indcf,
                d.costo_unitario_indcf,
                a.nombre_inarti
            FROM inv_det_conteo_fisico d
            JOIN inv_articulo a ON d.ide_inarti = a.ide_inarti
            WHERE d.aprobado_ajuste_indcf = true
              AND d.cantidad_ajuste_indcf > 0
              AND d.estado_item_indcf = 'VALIDADO'
              AND d.ide_inccf = p_ide_inccf
              AND d.activo_indcf = TRUE
        LOOP
            -- Calcular valores
            DECLARE
                v_cantidad_ajustada NUMERIC(12,3);
                v_valor_ajuste NUMERIC(15,3);
                v_detalle_comp_id INT8;
                v_saldo_despues NUMERIC(15,3);
            BEGIN
                v_cantidad_ajustada := v_detalle.cantidad_ajuste_indcf;
                v_valor_ajuste := v_cantidad_ajustada * v_detalle.costo_unitario_indcf;
                
                -- Calcular saldo después del ajuste (saldo actual + ajuste positivo)
                v_saldo_despues := v_detalle.saldo_antes_ajuste_indcf + v_cantidad_ajustada;
                
                -- Obtener ID para detalle del comprobante
                SELECT get_seq_table(
                    table_name := 'inv_det_comp_inve',
                    primary_key := 'ide_indci',
                    number_rows_added := 1,
                    login := v_usuario_login
                ) INTO v_detalle_comp_id;
                
                -- Insertar detalle del comprobante
                INSERT INTO inv_det_comp_inve (
                    ide_indci,
                    ide_incci,
                    ide_inarti,
                    cantidad_indci,
                    precio_indci,
                    valor_indci,
                    observacion_indci,
                    ide_empr,
                    ide_sucu,
                    usuario_ingre,
                    fecha_ingre,
                    hora_ingre
                ) VALUES (
                    v_detalle_comp_id,
                    v_comprobante_positivo_id,
                    v_detalle.ide_inarti,
                    v_cantidad_ajustada,
                    v_detalle.costo_unitario_indcf,
                    v_valor_ajuste,
                    'Ajuste positivo por conteo físico. ' ||
                    'Artículo: ' || v_detalle.nombre_inarti || ', ' ||
                    'Saldo antes: ' || v_detalle.saldo_antes_ajuste_indcf || ', ' ||
                    'Ajuste: +' || v_cantidad_ajustada || ', ' ||
                    'Saldo después: ' || v_saldo_despues,
                    v_ide_empr,
                    v_ide_sucu,
                    v_usuario_login,
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                );
                
                -- Actualizar el detalle del conteo físico
                UPDATE inv_det_conteo_fisico
                SET 
                    estado_item_indcf = 'AJUSTADO',
                    fecha_ajuste_indcf = CURRENT_TIMESTAMP,
                    ide_usua_ajusta = p_ide_usua_aprueba,
                    saldo_despues_ajuste_indcf = v_saldo_despues,
                    ide_incci = v_comprobante_positivo_id,
                    observacion_indcf = COALESCE(observacion_indcf || ' | ', '') || 
                                       'Ajuste positivo autorizado. Comprobante: ' || v_numero_positivo,
                    fecha_actua = CURRENT_TIMESTAMP,
                    usuario_actua = v_usuario_login
                WHERE ide_indcf = v_detalle.ide_indcf;
                
                -- Acumular estadísticas
                v_total_positivo := v_total_positivo + v_valor_ajuste;
                v_items_positivos := v_items_positivos + 1;
                v_descripcion_positivos := v_descripcion_positivos || 
                                          CASE WHEN v_descripcion_positivos <> '' THEN ', ' ELSE '' END ||
                                          v_detalle.nombre_inarti;
                
                v_contador_procesados := v_contador_procesados + 1;
            END;
        END LOOP;
        
        -- Actualizar observación de la cabecera con resumen
        UPDATE inv_cab_comp_inve
        SET observacion_incci = observacion_incci || 
                                ' - Items positivos: ' || v_items_positivos ||
                                ' - Valor total: ' || ROUND(v_total_positivo, 2)
        WHERE ide_incci = v_comprobante_positivo_id;
    END IF;
    
    -- 10. CREAR COMPROBANTE PARA AJUSTES NEGATIVOS (FALTANTES)
    IF v_tiene_negativos THEN
        -- Obtener próximo ID para cabecera
        SELECT get_seq_table(
            table_name := 'inv_cab_comp_inve',
            primary_key := 'ide_incci',
            number_rows_added := 1,
            login := v_usuario_login
        ) INTO v_comprobante_negativo_id;
        
          -- Obtener número de comprobante usando la función específica para inventarios
          v_numero_negativo := f_get_sec_comprobante_inv(v_bodega_comun);
        
        -- Insertar cabecera del comprobante negativo
        INSERT INTO inv_cab_comp_inve (
            ide_incci,
            numero_incci,
            fecha_trans_incci,
            ide_inbod,
            ide_intti,
            ide_inepi,
            ide_geper,
            ide_usua,
            observacion_incci,
            ide_empr,
            ide_sucu,
            usuario_ingre,
            fecha_ingre,
            verifica_incci,
            fecha_siste_incci,
            hora_ingre,
            hora_sistem_incci,
            automatico_incci
        ) VALUES (
            v_comprobante_negativo_id,
            v_numero_negativo,
            CURRENT_TIMESTAMP,
            v_bodega_comun,
            v_tipo_transaccion_negativa,
            v_ide_inepi,
            v_ide_geper,
            p_ide_usua_aprueba,
            COALESCE(p_observacion_aprobacion, 'Ajuste negativo por conteo físico') || 
            ' - Conteo: ' || p_ide_inccf,
            v_ide_empr,
            v_ide_sucu,
            v_usuario_login,
            CURRENT_TIMESTAMP,
            TRUE,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            TRUE
        );
        
        -- Procesar cada detalle negativo
        FOR v_detalle IN 
            SELECT 
                d.ide_indcf,
                d.cantidad_ajuste_indcf,
                d.ide_inarti,
                d.saldo_antes_ajuste_indcf,
                d.saldo_corte_indcf,
                d.costo_unitario_indcf,
                a.nombre_inarti
            FROM inv_det_conteo_fisico d
            JOIN inv_articulo a ON d.ide_inarti = a.ide_inarti
            WHERE d.aprobado_ajuste_indcf = true
              AND d.cantidad_ajuste_indcf < 0
              AND d.estado_item_indcf = 'VALIDADO'
              AND d.ide_inccf = p_ide_inccf
              AND d.activo_indcf = TRUE
        LOOP
            -- Calcular valores
            DECLARE
                v_cantidad_ajustada NUMERIC(12,3);
                v_valor_ajuste NUMERIC(15,3);
                v_detalle_comp_id INT8;
                v_saldo_despues NUMERIC(15,3);
            BEGIN
                -- Para negativos, tomamos el valor absoluto
                v_cantidad_ajustada := ABS(v_detalle.cantidad_ajuste_indcf);
                v_valor_ajuste := v_cantidad_ajustada * v_detalle.costo_unitario_indcf;
                
                -- Calcular saldo después del ajuste (saldo actual - ajuste negativo)
                v_saldo_despues := v_detalle.saldo_antes_ajuste_indcf - v_cantidad_ajustada;
                
                -- Obtener ID para detalle del comprobante
                SELECT get_seq_table(
                    table_name := 'inv_det_comp_inve',
                    primary_key := 'ide_indci',
                    number_rows_added := 1,
                    login := v_usuario_login
                ) INTO v_detalle_comp_id;
                
                -- Insertar detalle del comprobante
                INSERT INTO inv_det_comp_inve (
                    ide_indci,
                    ide_incci,
                    ide_inarti,
                    cantidad_indci,
                    precio_indci,
                    valor_indci,
                    observacion_indci,
                    ide_empr,
                    ide_sucu,
                    usuario_ingre,
                    fecha_ingre,
                    hora_ingre
                ) VALUES (
                    v_detalle_comp_id,
                    v_comprobante_negativo_id,
                    v_detalle.ide_inarti,
                    v_cantidad_ajustada,
                    v_detalle.costo_unitario_indcf,
                    v_valor_ajuste,
                    'Ajuste negativo por conteo físico. ' ||
                    'Artículo: ' || v_detalle.nombre_inarti || ', ' ||
                    'Saldo antes: ' || v_detalle.saldo_antes_ajuste_indcf || ', ' ||
                    'Ajuste: -' || v_cantidad_ajustada || ', ' ||
                    'Saldo después: ' || v_saldo_despues,
                    v_ide_empr,
                    v_ide_sucu,
                    v_usuario_login,
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                );
                
                -- Actualizar el detalle del conteo físico
                UPDATE inv_det_conteo_fisico
                SET 
                    estado_item_indcf = 'AJUSTADO',
                    fecha_ajuste_indcf = CURRENT_TIMESTAMP,
                    ide_usua_ajusta = p_ide_usua_aprueba,
                    saldo_despues_ajuste_indcf = v_saldo_despues,
                    ide_incci = v_comprobante_negativo_id,
                    observacion_indcf = COALESCE(observacion_indcf || ' | ', '') || 
                                       'Ajuste negativo autorizado. Comprobante: ' || v_numero_negativo,
                    fecha_actua = CURRENT_TIMESTAMP,
                    usuario_actua = v_usuario_login
                WHERE ide_indcf = v_detalle.ide_indcf;
                
                -- Acumular estadísticas
                v_total_negativo := v_total_negativo + v_valor_ajuste;
                v_items_negativos := v_items_negativos + 1;
                v_descripcion_negativos := v_descripcion_negativos || 
                                          CASE WHEN v_descripcion_negativos <> '' THEN ', ' ELSE '' END ||
                                          v_detalle.nombre_inarti;
                
                v_contador_procesados := v_contador_procesados + 1;
            END;
        END LOOP;
        
        -- Actualizar observación de la cabecera con resumen
        UPDATE inv_cab_comp_inve
        SET observacion_incci = observacion_incci || 
                                ' - Items negativos: ' || v_items_negativos ||
                                ' - Valor total: ' || ROUND(v_total_negativo, 2)
        WHERE ide_incci = v_comprobante_negativo_id;
    END IF;
    
    -- 11. OBTENER TIEMPO PROMEDIO DE CONTEO
    SELECT 
        MIN(fecha_conteo_indcf),
        MAX(fecha_conteo_indcf)
    INTO 
        v_fecha_min_conteo,
        v_fecha_max_conteo
    FROM inv_det_conteo_fisico
    WHERE ide_inccf = p_ide_inccf
      AND fecha_conteo_indcf IS NOT NULL;
    
    -- Calcular tiempo promedio
    IF v_fecha_min_conteo IS NOT NULL AND v_fecha_max_conteo IS NOT NULL THEN
        v_tiempo_promedio := v_fecha_max_conteo - v_fecha_min_conteo;
    ELSE
        v_tiempo_promedio := '0 seconds'::INTERVAL;
    END IF;
    
    -- 12. CONTAR PRODUCTOS AJUSTADOS (POSITIVOS Y NEGATIVOS)
    SELECT COUNT(*)
    INTO v_productos_ajustados
    FROM inv_det_conteo_fisico
    WHERE ide_inccf = p_ide_inccf
      AND estado_item_indcf = 'AJUSTADO'
      AND cantidad_ajuste_indcf != 0;
    
    -- 13. PREPARAR OBSERVACIÓN DE APROBACIÓN
    v_observacion_aprobacion_inccf := COALESCE(p_observacion_aprobacion, 'Ajuste autorizado') || 
                                     ' - Productos ajustados: ' || v_productos_ajustados;
    
    -- 14. ACTUALIZAR CABECERA DEL CONTEO
    UPDATE inv_cab_conteo_fisico
    SET 
        fecha_cierre_inccf = CURRENT_TIMESTAMP,
        fecha_aprobacion_inccf = CURRENT_TIMESTAMP,
        observacion_aprobacion_inccf = v_observacion_aprobacion_inccf,
        productos_ajustados_inccf = v_productos_ajustados,
        tiempo_promedio_conteo_inccf = EXTRACT(EPOCH FROM v_tiempo_promedio), -- Almacenar en segundos
        ide_usua_aprueba = p_ide_usua_aprueba,
        fecha_actua = CURRENT_TIMESTAMP,
        usuario_actua = v_usuario_login,
        ide_inec = v_ide_inec_ajustado, -- Actualizar a estado AJUSTADO (ID = 5)
        -- Almacenar IDs de comprobantes según corresponda
        ide_incci = CASE 
                       WHEN v_tiene_positivos THEN v_comprobante_positivo_id 
                       ELSE ide_incci 
                    END,
        ide_incci_nega = CASE 
                            WHEN v_tiene_negativos THEN v_comprobante_negativo_id 
                            ELSE ide_incci_nega 
                         END
    WHERE ide_inccf = p_ide_inccf;
    
    -- 15. RETORNAR RESULTADOS (solo si todo fue exitoso)
    IF v_tiene_positivos THEN
        tipo_ajuste := 'POSITIVO';
        id_comprobante := v_comprobante_positivo_id;
        numero_comprobante := v_numero_positivo;
        total_items := v_items_positivos;
        total_valor := v_total_positivo;
        items_ajustados := v_descripcion_positivos;
        mensaje := 'Comprobante positivo generado exitosamente para ' || 
                   v_items_positivos || ' ítem(s) del conteo ' || p_ide_inccf;
        exito := TRUE;
        RETURN NEXT;
    END IF;
    
    IF v_tiene_negativos THEN
        tipo_ajuste := 'NEGATIVO';
        id_comprobante := v_comprobante_negativo_id;
        numero_comprobante := v_numero_negativo;
        total_items := v_items_negativos;
        total_valor := v_total_negativo;
        items_ajustados := v_descripcion_negativos;
        mensaje := 'Comprobante negativo generado exitosamente para ' || 
                   v_items_negativos || ' ítem(s) del conteo ' || p_ide_inccf;
        exito := TRUE;
        RETURN NEXT;
    END IF;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Retornar error como excepción en lugar de fila
        RAISE EXCEPTION 'Error en f_autorizar_ajustes_conteo: %', SQLERRM;
END;
$$;



---prueba
select * from f_autorizar_ajustes_conteo(
    2,11, 'ok test '
)
