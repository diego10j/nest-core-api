CREATE OR REPLACE FUNCTION public.f_autorizar_multiples_ajustes(
    p_ids_detalles INT8[],              -- Array de IDs de detalles de conteo
    p_usuario_autoriza VARCHAR DEFAULT CURRENT_USER,
    p_fecha_autoriza TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    p_observacion_general VARCHAR DEFAULT NULL
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
    v_tipo_transaccion_negativa INT8 := 0;  -- Ajuste de Inventarios (-)
    v_ide_empr INT8 := 0; -- Empresa principal
    v_ide_sucu INT8 := 0; -- Sucursal principal
    v_ide_inepi INT8 := 1; -- Estado previo del inventario (PENDIENTE)
    
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
    
    -- Variables para verificación de cierre de conteos
    v_conteos_afectados INT8[];
    v_conteo INT8;
    v_total_items INT;
    v_items_ajustados INT;
    v_items_rechazados INT;
    v_items_pendientes INT;
    v_codigo_estado VARCHAR;
    v_ide_inec_ajustado INT8;
BEGIN
    -- 1. VALIDACIONES INICIALES
    IF array_length(p_ids_detalles, 1) IS NULL THEN
        RAISE EXCEPTION 'No se proporcionaron detalles para ajustar';
    END IF;
    
    -- 2. VALIDAR QUE TODOS LOS DETALLES PERTENEZCAN A LA MISMA BODEGA
    SELECT DISTINCT c.ide_inbod INTO v_bodega_comun
    FROM inv_det_conteo_fisico d
    JOIN inv_cab_conteo_fisico c ON d.ide_inccf = c.ide_inccf
    WHERE d.ide_indcf = ANY(p_ids_detalles)
      AND d.activo_indcf = TRUE;
    
    IF (SELECT COUNT(DISTINCT c.ide_inbod) 
        FROM inv_det_conteo_fisico d
        JOIN inv_cab_conteo_fisico c ON d.ide_inccf = c.ide_inccf
        WHERE d.ide_indcf = ANY(p_ids_detalles)) > 1 THEN
        RAISE EXCEPTION 'Los detalles seleccionados pertenecen a diferentes bodegas';
    END IF;
    
    -- 3. CLASIFICAR DETALLES POR TIPO DE AJUSTE Y VALIDAR
    FOR v_detalle IN 
        SELECT 
            d.*,
            a.nombre_inarti,
            c.ide_inbod,
            e.codigo_inec as estado_conteo
        FROM inv_det_conteo_fisico d
        JOIN inv_cab_conteo_fisico c ON d.ide_inccf = c.ide_inccf
        JOIN inv_articulo a ON d.ide_inarti = a.ide_inarti
        JOIN inv_estado_conteo e ON c.ide_inec = e.ide_inec
        WHERE d.ide_indcf = ANY(p_ids_detalles)
          AND d.activo_indcf = TRUE
    LOOP
        -- Validar que el detalle pueda ser ajustado
        IF v_detalle.estado_conteo IN ('CERRADO', 'AJUSTADO', 'CANCELADO') THEN
            RAISE EXCEPTION 'El conteo del ítem "%" está en estado %', 
                            v_detalle.nombre_inarti, v_detalle.estado_conteo;
        END IF;
        
        IF NOT v_detalle.requiere_ajuste_indcf THEN
            RAISE EXCEPTION 'El ítem "%" no requiere ajuste', v_detalle.nombre_inarti;
        END IF;
        
        IF v_detalle.estado_item_indcf = 'AJUSTADO' THEN
            RAISE EXCEPTION 'El ítem "%" ya fue ajustado previamente', v_detalle.nombre_inarti;
        END IF;
        
        -- Determinar tipo de ajuste
        IF (v_detalle.cantidad_fisica_indcf - v_detalle.saldo_corte_indcf) > 0 THEN
            v_tiene_positivos := TRUE;
        ELSE
            v_tiene_negativos := TRUE;
        END IF;
    END LOOP;
    
    -- 4. CREAR COMPROBANTE PARA AJUSTES POSITIVOS (SOBRANTES)
    IF v_tiene_positivos THEN
        -- Obtener próximo ID para cabecera usando get_seq_table con parámetros correctos
        SELECT get_seq_table(
            table_name := 'inv_cab_comp_inve',
            primary_key := 'ide_incci',
            number_rows_added := 1,
            login := p_usuario_autoriza
        ) INTO v_comprobante_positivo_id;
        
        -- Generar número de comprobante (formato más corto para VARCHAR(10))
        v_numero_positivo := 'AJ+' || LPAD(CAST(v_comprobante_positivo_id AS VARCHAR), 6, '0');
        
        -- Si excede 10 caracteres, usar un formato más corto
        IF LENGTH(v_numero_positivo) > 10 THEN
            v_numero_positivo := 'AJ+' || LPAD(CAST(v_comprobante_positivo_id AS VARCHAR), 5, '0');
        END IF;
        
        -- Verificar que no exceda el límite
        IF LENGTH(v_numero_positivo) > 10 THEN
            v_numero_positivo := SUBSTRING('AJ+' || CAST(v_comprobante_positivo_id AS VARCHAR), 1, 10);
        END IF;
        
        -- Insertar cabecera del comprobante positivo
        INSERT INTO inv_cab_comp_inve (
            ide_incci,
            numero_incci,
            fecha_trans_incci,
            ide_inbod,
            ide_intti,
            ide_inepi,
            observacion_incci,
            ide_empr,
            ide_sucu,
            usuario_ingre,
            fecha_ingre,
            verifica_incci,
            fecha_verifica_incci,
            usuario_verifica_incci,
            automatico_incci
        ) VALUES (
            v_comprobante_positivo_id,
            v_numero_positivo,
            p_fecha_autoriza,
            v_bodega_comun,
            v_tipo_transaccion_positiva,
            v_ide_inepi,
            COALESCE(p_observacion_general, 'Ajuste positivo por conteo físico') || 
            ' - Detalles: ' || array_length(p_ids_detalles, 1),
            v_ide_empr,
            v_ide_sucu,
            p_usuario_autoriza,
            p_fecha_autoriza,
            TRUE,
            p_fecha_autoriza,
            p_usuario_autoriza,
            TRUE
        );
        
        -- Procesar cada detalle positivo
        FOR v_detalle IN 
            SELECT 
                d.*,
                a.nombre_inarti
            FROM inv_det_conteo_fisico d
            JOIN inv_articulo a ON d.ide_inarti = a.ide_inarti
            WHERE d.ide_indcf = ANY(p_ids_detalles)
              AND d.activo_indcf = TRUE
              AND (d.cantidad_fisica_indcf - d.saldo_corte_indcf) > 0
        LOOP
            -- Calcular valores
            DECLARE
                v_diferencia NUMERIC(12,3);
                v_cantidad_ajustada NUMERIC(12,3);
                v_valor_ajuste NUMERIC(15,3);
                v_detalle_comp_id INT8;
            BEGIN
                v_diferencia := v_detalle.cantidad_fisica_indcf - v_detalle.saldo_corte_indcf;
                v_cantidad_ajustada := v_diferencia;
                
                v_valor_ajuste := v_cantidad_ajustada * v_detalle.costo_unitario_indcf;
                
                -- Obtener ID para detalle del comprobante usando get_seq_table
                SELECT get_seq_table(
                    table_name := 'inv_det_comp_inve',
                    primary_key := 'ide_indci',
                    number_rows_added := 1,
                    login := p_usuario_autoriza
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
                    usuario_ingre,
                    fecha_ingre,
                    verifica_indci,
                    fecha_verifica_indci,
                    usuario_verifica_indci
                ) VALUES (
                    v_detalle_comp_id,
                    v_comprobante_positivo_id,
                    v_detalle.ide_inarti,
                    v_cantidad_ajustada,
                    v_detalle.costo_unitario_indcf,
                    v_valor_ajuste,
                    'Ajuste positivo por conteo físico. ' ||
                    'Artículo: ' || v_detalle.nombre_inarti || ', ' ||
                    'Saldo corte: ' || v_detalle.saldo_corte_indcf || ', ' ||
                    'Cantidad física: ' || v_detalle.cantidad_fisica_indcf,
                    v_ide_empr,
                    p_usuario_autoriza,
                    p_fecha_autoriza,
                    TRUE,
                    p_fecha_autoriza,
                    TRUE
                );
                
                -- Actualizar el detalle del conteo físico
                UPDATE inv_det_conteo_fisico
                SET 
                    estado_item_indcf = 'AJUSTADO',
                    aprobado_ajuste_indcf = TRUE,
                    cantidad_ajuste_indcf = v_cantidad_ajustada,
                    fecha_ajuste_indcf = p_fecha_autoriza,
                    ide_usua_ajusta = (SELECT ide_usua FROM sis_usuario WHERE nick_usua = p_usuario_autoriza LIMIT 1),
                    saldo_antes_ajuste_indcf = v_detalle.saldo_corte_indcf,
                    saldo_despues_ajuste_indcf = v_detalle.cantidad_fisica_indcf,
                    ide_incci = v_comprobante_positivo_id,
                    observacion_indcf = COALESCE(observacion_indcf || ' | ', '') || 
                                       'Ajuste positivo autorizado. Comprobante: ' || v_numero_positivo,
                    fecha_actua = p_fecha_autoriza,
                    usuario_actua = p_usuario_autoriza
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
    
    -- 5. CREAR COMPROBANTE PARA AJUSTES NEGATIVOS (FALTANTES)
    IF v_tiene_negativos THEN
        -- Obtener próximo ID para cabecera usando get_seq_table
        SELECT get_seq_table(
            table_name := 'inv_cab_comp_inve',
            primary_key := 'ide_incci',
            number_rows_added := 1,
            login := p_usuario_autoriza
        ) INTO v_comprobante_negativo_id;
        
        -- Generar número de comprobante (formato más corto para VARCHAR(10))
        v_numero_negativo := 'AJ-' || LPAD(CAST(v_comprobante_negativo_id AS VARCHAR), 6, '0');
        
        -- Si excede 10 caracteres, usar un formato más corto
        IF LENGTH(v_numero_negativo) > 10 THEN
            v_numero_negativo := 'AJ-' || LPAD(CAST(v_comprobante_negativo_id AS VARCHAR), 5, '0');
        END IF;
        
        -- Verificar que no exceda el límite
        IF LENGTH(v_numero_negativo) > 10 THEN
            v_numero_negativo := SUBSTRING('AJ-' || CAST(v_comprobante_negativo_id AS VARCHAR), 1, 10);
        END IF;
        
        -- Insertar cabecera del comprobante negativo
        INSERT INTO inv_cab_comp_inve (
            ide_incci,
            numero_incci,
            fecha_trans_incci,
            ide_inbod,
            ide_intti,
            ide_inepi,
            observacion_incci,
            ide_empr,
            ide_sucu,
            usuario_ingre,
            fecha_ingre,
            verifica_incci,
            fecha_verifica_incci,
            usuario_verifica_incci,
            automatico_incci
        ) VALUES (
            v_comprobante_negativo_id,
            v_numero_negativo,
            p_fecha_autoriza,
            v_bodega_comun,
            v_tipo_transaccion_negativa,
            v_ide_inepi,
            COALESCE(p_observacion_general, 'Ajuste negativo por conteo físico') || 
            ' - Detalles: ' || array_length(p_ids_detalles, 1),
            v_ide_empr,
            v_ide_sucu,
            p_usuario_autoriza,
            p_fecha_autoriza,
            TRUE,
            p_fecha_autoriza,
            p_usuario_autoriza,
            TRUE
        );
        
        -- Procesar cada detalle negativo
        FOR v_detalle IN 
            SELECT 
                d.*,
                a.nombre_inarti
            FROM inv_det_conteo_fisico d
            JOIN inv_articulo a ON d.ide_inarti = a.ide_inarti
            WHERE d.ide_indcf = ANY(p_ids_detalles)
              AND d.activo_indcf = TRUE
              AND (d.cantidad_fisica_indcf - d.saldo_corte_indcf) <= 0
        LOOP
            -- Calcular valores
            DECLARE
                v_diferencia NUMERIC(12,3);
                v_cantidad_ajustada NUMERIC(12,3);
                v_valor_ajuste NUMERIC(15,3);
                v_detalle_comp_id INT8;
            BEGIN
                v_diferencia := v_detalle.cantidad_fisica_indcf - v_detalle.saldo_corte_indcf;
                v_cantidad_ajustada := ABS(v_diferencia);
                
                v_valor_ajuste := v_cantidad_ajustada * v_detalle.costo_unitario_indcf;
                
                -- Obtener ID para detalle del comprobante usando get_seq_table
                SELECT get_seq_table(
                    table_name := 'inv_det_comp_inve',
                    primary_key := 'ide_indci',
                    number_rows_added := 1,
                    login := p_usuario_autoriza
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
                    usuario_ingre,
                    fecha_ingre,
                    verifica_indci,
                    fecha_verifica_indci,
                    usuario_verifica_indci
                ) VALUES (
                    v_detalle_comp_id,
                    v_comprobante_negativo_id,
                    v_detalle.ide_inarti,
                    v_cantidad_ajustada,
                    v_detalle.costo_unitario_indcf,
                    v_valor_ajuste,
                    'Ajuste negativo por conteo físico. ' ||
                    'Artículo: ' || v_detalle.nombre_inarti || ', ' ||
                    'Saldo corte: ' || v_detalle.saldo_corte_indcf || ', ' ||
                    'Cantidad física: ' || v_detalle.cantidad_fisica_indcf,
                    v_ide_empr,
                    p_usuario_autoriza,
                    p_fecha_autoriza,
                    TRUE,
                    p_fecha_autoriza,
                    TRUE
                );
                
                -- Actualizar el detalle del conteo físico
                UPDATE inv_det_conteo_fisico
                SET 
                    estado_item_indcf = 'AJUSTADO',
                    aprobado_ajuste_indcf = TRUE,
                    cantidad_ajuste_indcf = v_cantidad_ajustada,
                    fecha_ajuste_indcf = p_fecha_autoriza,
                    ide_usua_ajusta = (SELECT ide_usua FROM sis_usuario WHERE usuario = p_usuario_autoriza LIMIT 1),
                    saldo_antes_ajuste_indcf = v_detalle.saldo_corte_indcf,
                    saldo_despues_ajuste_indcf = v_detalle.cantidad_fisica_indcf,
                    ide_incci = v_comprobante_negativo_id,
                    observacion_indcf = COALESCE(observacion_indcf || ' | ', '') || 
                                       'Ajuste negativo autorizado. Comprobante: ' || v_numero_negativo,
                    fecha_actua = p_fecha_autoriza,
                    usuario_actua = p_usuario_autoriza
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
    
    -- 6. VERIFICAR Y CERRAR CONTEO SI ES NECESARIO (LÓGICA INTERNA)
    -- Obtener ID del estado AJUSTADO
    SELECT ide_inec INTO v_ide_inec_ajustado
    FROM inv_estado_conteo 
    WHERE codigo_inec = 'AJUSTADO'
    LIMIT 1;
    
    -- Si no existe, crear uno (para evitar errores)
    IF v_ide_inec_ajustado IS NULL THEN
        -- Obtener próximo ID para estado
        SELECT get_seq_table(
            table_name := 'inv_estado_conteo',
            primary_key := 'ide_inec',
            number_rows_added := 1,
            login := p_usuario_autoriza
        ) INTO v_ide_inec_ajustado;
        
        INSERT INTO inv_estado_conteo (ide_inec, codigo_inec, nombre_inec)
        VALUES (v_ide_inec_ajustado, 'AJUSTADO', 'Ajustado');
    END IF;
    
    -- Obtener los conteos únicos afectados por los detalles
    SELECT array_agg(DISTINCT d.ide_inccf)
    INTO v_conteos_afectados
    FROM inv_det_conteo_fisico d
    WHERE d.ide_indcf = ANY(p_ids_detalles);
    
    -- Verificar cada conteo para ver si se puede cerrar
    IF v_conteos_afectados IS NOT NULL THEN
        FOREACH v_conteo IN ARRAY v_conteos_afectados
        LOOP
            -- Obtener el estado actual del conteo
            SELECT e.codigo_inec INTO v_codigo_estado
            FROM inv_cab_conteo_fisico c
            JOIN inv_estado_conteo e ON c.ide_inec = e.ide_inec
            WHERE c.ide_inccf = v_conteo;
            
            -- Obtener estadísticas del conteo
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN estado_item_indcf = 'AJUSTADO' THEN 1 END) as ajustados,
                COUNT(CASE WHEN estado_item_indcf = 'RECHAZADO' THEN 1 END) as rechazados,
                COUNT(CASE WHEN estado_item_indcf NOT IN ('AJUSTADO', 'RECHAZADO', 'VALIDADO') 
                          AND requiere_ajuste_indcf = TRUE THEN 1 END) as pendientes
            INTO 
                v_total_items,
                v_items_ajustados,
                v_items_rechazados,
                v_items_pendientes
            FROM inv_det_conteo_fisico d
            WHERE d.ide_inccf = v_conteo
              AND d.activo_indcf = TRUE;
            
            -- Si no hay items pendientes y el conteo no está cerrado, ajustado o cancelado, cerrarlo
            IF v_items_pendientes = 0 AND v_codigo_estado NOT IN ('CERRADO', 'AJUSTADO', 'CANCELADO') THEN
                -- Actualizar el estado del conteo a AJUSTADO
                UPDATE inv_cab_conteo_fisico
                SET 
                    ide_inec = v_ide_inec_ajustado,
                    fecha_fin_conteo_inccf = p_fecha_autoriza,
                    usuario_actua = p_usuario_autoriza,
                    fecha_actua = p_fecha_autoriza,
                    observacion_inccf = COALESCE(observacion_inccf || ' | ', '') || 
                                       'Conteo ajustado automáticamente el ' || 
                                       TO_CHAR(p_fecha_autoriza, 'YYYY-MM-DD HH24:MI:SS') ||
                                       '. Items: ' || COALESCE(v_total_items, 0) || 
                                       ', Ajustados: ' || COALESCE(v_items_ajustados, 0) ||
                                       ', Rechazados: ' || COALESCE(v_items_rechazados, 0)
                WHERE ide_inccf = v_conteo;
            END IF;
        END LOOP;
    END IF;
    
    -- 7. RETORNAR RESULTADOS
    IF v_tiene_positivos THEN
        tipo_ajuste := 'POSITIVO';
        id_comprobante := v_comprobante_positivo_id;
        numero_comprobante := v_numero_positivo;
        total_items := v_items_positivos;
        total_valor := v_total_positivo;
        items_ajustados := v_descripcion_positivos;
        mensaje := 'Comprobante positivo generado exitosamente para ' || 
                   v_items_positivos || ' ítem(s)';
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
                   v_items_negativos || ' ítem(s)';
        exito := TRUE;
        RETURN NEXT;
    END IF;
    
    -- Si no hubo ajustes, retornar error
    IF v_contador_procesados = 0 THEN
        tipo_ajuste := NULL;
        id_comprobante := NULL;
        numero_comprobante := NULL;
        total_items := 0;
        total_valor := 0;
        items_ajustados := '';
        mensaje := 'No se encontraron detalles válidos para ajustar';
        exito := FALSE;
        RETURN NEXT;
    END IF;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Retornar error
        tipo_ajuste := NULL;
        id_comprobante := NULL;
        numero_comprobante := NULL;
        total_items := 0;
        total_valor := 0;
        items_ajustados := '';
        mensaje := 'Error al autorizar ajustes: ' || SQLERRM;
        exito := FALSE;
        
        RETURN NEXT;
END;
$$;


--EJECUTA

SELECT * FROM f_autorizar_multiples_ajustes(
    p_ids_detalles := ARRAY[1, 2, 3],
    p_usuario_autoriza := 'admin',
    p_observacion_general := 'Ajuste autorizado por inventario físico'
);
