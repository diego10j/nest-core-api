CREATE OR REPLACE FUNCTION public.f_validar_detalles_conteo(
    p_detalles_validar TEXT,
    p_ide_usua_valida INT8
)
RETURNS TABLE(
    mensaje_validacion VARCHAR(200),
    detalles_procesados INT,
    detalles_error INT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_detalles_json JSONB;
    v_detalle JSONB;
    v_ide_indcf INT8;
    v_cantidad_ajuste NUMERIC; -- Ahora es la diferencia (ajuste)
    v_motivo_diferencia VARCHAR(500);
    v_saldo_antes NUMERIC;
    v_saldo_despues NUMERIC;
    v_contador_procesados INT := 0;
    v_contador_errores INT := 0;
    v_usuario_login VARCHAR(50);
    v_estado_actual VARCHAR(20);
    v_secuencial_conteo VARCHAR(12);
    v_fecha_corte DATE;
    v_conteos_actualizar INT[];
    v_ide_inccf INT8;
    v_cantidad_ajuste_actual NUMERIC;
BEGIN
    /* ================= VALIDACIONES INICIALES ================= */
    IF p_ide_usua_valida IS NULL OR p_ide_usua_valida <= 0 THEN
        RAISE EXCEPTION 'Usuario validador no válido';
    END IF;

    IF p_detalles_validar IS NULL OR LENGTH(TRIM(p_detalles_validar)) = 0 THEN
        RAISE EXCEPTION 'No se han proporcionado detalles para validar';
    END IF;

    /* ================= VALIDAR Y CONVERTIR JSON ================= */
    BEGIN
        v_detalles_json := p_detalles_validar::JSONB;
        
        -- Verificar que sea un array
        IF jsonb_typeof(v_detalles_json) != 'array' THEN
            RAISE EXCEPTION 'El formato de detalles debe ser un array JSON';
        END IF;
        
        -- Verificar que el array no esté vacío
        IF jsonb_array_length(v_detalles_json) = 0 THEN
            RAISE EXCEPTION 'El array de detalles está vacío';
        END IF;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'Formato JSON inválido en p_detalles_validar';
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Error al procesar JSON: %', SQLERRM;
    END;

    /* ================= OBTENER INFORMACIÓN DEL USUARIO ================= */
    SELECT nick_usua
    INTO v_usuario_login
    FROM sis_usuario
    WHERE ide_usua = p_ide_usua_valida;

    IF v_usuario_login IS NULL THEN
        RAISE EXCEPTION 'Usuario validador no encontrado';
    END IF;

    /* ================= PROCESAR CADA DETALLE ================= */
    FOR i IN 0..(jsonb_array_length(v_detalles_json) - 1)
    LOOP
        BEGIN
            v_detalle := v_detalles_json->i;
            
            -- Extraer valores del JSON
            v_ide_indcf := COALESCE((v_detalle->>'ide_indcf')::INT8, 0);
            v_cantidad_ajuste := COALESCE((v_detalle->>'cantidad_ajuste_indcf')::NUMERIC, 0);
            v_motivo_diferencia := COALESCE(v_detalle->>'motivo_diferencia_indcf', '');

            /* ================= VALIDAR DATOS BÁSICOS ================= */
            IF v_ide_indcf <= 0 THEN
                v_contador_errores := v_contador_errores + 1;
                CONTINUE;
            END IF;

            /* ================= VALIDAR DETALLE EN BASE DE DATOS ================= */
            -- Verificar que el detalle exista y obtener datos actuales
            SELECT 
                d.estado_item_indcf,
                c.secuencial_inccf,
                c.fecha_corte_inccf,
                d.saldo_corte_indcf,
                c.ide_inccf,
                d.cantidad_ajuste_indcf
            INTO 
                v_estado_actual,
                v_secuencial_conteo,
                v_fecha_corte,
                v_saldo_antes,
                v_ide_inccf,
                v_cantidad_ajuste_actual
            FROM inv_det_conteo_fisico d
            INNER JOIN inv_cab_conteo_fisico c ON c.ide_inccf = d.ide_inccf
            WHERE d.ide_indcf = v_ide_indcf;

            IF NOT FOUND THEN
                v_contador_errores := v_contador_errores + 1;
                CONTINUE;
            END IF;

            -- Validar que el detalle esté en un estado válido para validar (CONTADO, REVISION o VALIDADO)
            IF v_estado_actual NOT IN ('CONTADO', 'REVISION', 'VALIDADO') THEN
                v_contador_errores := v_contador_errores + 1;
                CONTINUE;
            END IF;

            -- Validar que la fecha de corte no sea futura
            IF v_fecha_corte > CURRENT_DATE THEN
                v_contador_errores := v_contador_errores + 1;
                CONTINUE;
            END IF;

            -- Verificar si ya tiene el mismo ajuste y ya está validado
            IF v_estado_actual = 'VALIDADO' AND 
               v_cantidad_ajuste_actual IS NOT NULL AND 
               v_cantidad_ajuste_actual = v_cantidad_ajuste THEN
                -- Ya está validado con la misma cantidad de ajuste (diferencia), no es necesario actualizar
                v_contador_procesados := v_contador_procesados + 1;
                
                -- Aún así agregar a lista para posible actualización de cabecera
                IF NOT (v_ide_inccf = ANY(v_conteos_actualizar)) THEN
                    v_conteos_actualizar := array_append(v_conteos_actualizar, v_ide_inccf);
                END IF;
                
                CONTINUE;
            END IF;

            -- Calcular saldo después del ajuste: saldo anterior + diferencia (cantidad_ajuste)
            v_saldo_despues := v_saldo_antes + v_cantidad_ajuste;

            /* ================= ACTUALIZAR DETALLE ================= */
            UPDATE inv_det_conteo_fisico
            SET 
                aprobado_ajuste_indcf = true,
                cantidad_ajuste_indcf = v_cantidad_ajuste, -- Aquí guardamos la diferencia (ajuste)
                motivo_diferencia_indcf = v_motivo_diferencia,
                estado_item_indcf = 'VALIDADO',
                saldo_antes_ajuste_indcf = v_saldo_antes,
                saldo_despues_ajuste_indcf = v_saldo_despues, -- Nuevo saldo: saldo_antes + diferencia
                validado_indcf = true,
                ide_usua_valida = p_ide_usua_valida,
                requiere_ajuste_indcf = (v_cantidad_ajuste != 0) -- Si la diferencia es 0, no requiere ajuste
            WHERE ide_indcf = v_ide_indcf;

            v_contador_procesados := v_contador_procesados + 1;

            /* ================= AGREGAR A LISTA PARA ACTUALIZAR CABECERA ================= */
            -- Agregar ID del conteo a la lista si no está ya incluido
            IF NOT (v_ide_inccf = ANY(v_conteos_actualizar)) THEN
                v_conteos_actualizar := array_append(v_conteos_actualizar, v_ide_inccf);
            END IF;

        EXCEPTION
            WHEN OTHERS THEN
                v_contador_errores := v_contador_errores + 1;
                CONTINUE;
        END;
    END LOOP;

    /* ================= VALIDAR RESULTADOS ================= */
    IF v_contador_procesados = 0 THEN
        RAISE EXCEPTION 'No se pudo procesar ningún detalle. Verifique: 1) IDs de detalles existen, 2) Estados sean CONTADO, REVISION o VALIDADO, 3) Fecha de corte no sea futura';
    END IF;

    /* ================= ACTUALIZAR CABECERAS SI TODOS LOS DETALLES ESTÁN EN ESTADO VALIDADO O CONTADO ================= */
    IF array_length(v_conteos_actualizar, 1) > 0 THEN
        FOR i IN 1..array_length(v_conteos_actualizar, 1)
        LOOP
            v_ide_inccf := v_conteos_actualizar[i];
            
            -- Verificar si todos los detalles de este conteo están en estado VALIDADO o CONTADO
            WITH conteo_detalles AS (
                SELECT 
                    COUNT(*) as total_detalles,
                    SUM(CASE WHEN estado_item_indcf IN ('VALIDADO', 'CONTADO') THEN 1 ELSE 0 END) as detalles_validados_contados
                FROM inv_det_conteo_fisico
                WHERE ide_inccf = v_ide_inccf
            )
            UPDATE inv_cab_conteo_fisico c
            SET 
                estado_conteo_inccf = 'VALIDADO',
                fecha_validacion_inccf = CURRENT_TIMESTAMP
            FROM conteo_detalles cd
            WHERE c.ide_inccf = v_ide_inccf
                AND cd.total_detalles = cd.detalles_validados_contados;
        END LOOP;
    END IF;

    /* ================= RETORNAR RESULTADOS ================= */
    mensaje_validacion := CASE 
        WHEN v_contador_errores > 0 THEN 
            'Proceso completado con ' || v_contador_errores || ' error(es)'
        ELSE 
            'Validación completada exitosamente'
    END;
    
    detalles_procesados := v_contador_procesados;
    detalles_error := v_contador_errores;

    RETURN NEXT;
END;
$$;


-- Ejecutar la función con parámetro TEXT
SELECT * FROM f_validar_detalles_conteo(
    p_detalles_validar := '[
        {
            "ide_indcf": 710,
            "aprobado_ajuste_indcf": true,
            "cantidad_ajuste_indcf": 150.5,
            "motivo_diferencia_indcf": "Conteo físico correcto"
        },
        {
            "ide_indcf": 629,
            "aprobado_ajuste_indcf": true,
            "cantidad_ajuste_indcf": '2,
            "motivo_diferencia_indcf": "Producto dañado"
        }
    ]',
    p_ide_usua_valida := 11
);