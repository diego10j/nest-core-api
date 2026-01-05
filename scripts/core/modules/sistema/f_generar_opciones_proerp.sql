CREATE OR REPLACE FUNCTION public.f_generar_opciones_proerp(
    p_json_text TEXT,  -- Cambiar a TEXT
    p_usuario VARCHAR DEFAULT current_user
)
RETURNS TABLE(
    mensaje VARCHAR,
    exito BOOLEAN,
    opciones_insertadas INTEGER,
    opciones_actualizadas INTEGER,
    opciones_desactivadas INTEGER
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    p_json JSONB;  -- Variable interna como JSONB
    v_item JSONB;
    v_subheader JSONB;
    v_i INTEGER;
    v_inserted_count INTEGER := 0;
    v_updated_count INTEGER := 0;
    v_deactivated_count INTEGER := 0;
    
    -- Variables para procesamiento iterativo
    v_stack JSONB[];
    v_current_item JSONB;
    v_current_parent INT8;
    v_current_nivel INTEGER;
    v_item_id INT8;
    v_existing_id INT8;
    v_full_path VARCHAR(55);
    v_title VARCHAR(50);
    v_path VARCHAR(255);
    v_icon VARCHAR(255);  -- Nueva variable para el icono
    v_children JSONB;
    v_j INTEGER;
    
    -- Array para almacenar IDs de opciones procesadas
    v_existing_opciones INT8[] := ARRAY[]::INT8[];
    
    -- Variables para get_seq_table
    v_seq_login VARCHAR;
BEGIN
    -- Convertir el texto a JSONB
    BEGIN
        p_json := p_json_text::JSONB;
    EXCEPTION WHEN OTHERS THEN
        mensaje := 'Error: El texto proporcionado no es un JSON válido. Detalles: ' || SQLERRM;
        exito := FALSE;
        opciones_insertadas := 0;
        opciones_actualizadas := 0;
        opciones_desactivadas := 0;
        RETURN NEXT;
        RETURN;
    END;
    
    -- Determinar qué usuario usar para get_seq_table
    v_seq_login := COALESCE(p_usuario, current_user);
    
    -- Validar que el JSON no sea nulo
    IF p_json IS NULL OR jsonb_array_length(p_json) = 0 THEN
        mensaje := 'El JSON proporcionado está vacío o es inválido';
        exito := FALSE;
        opciones_insertadas := 0;
        opciones_actualizadas := 0;
        opciones_desactivadas := 0;
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Crear tabla temporal para el stack (pila) de procesamiento
    CREATE TEMP TABLE IF NOT EXISTS temp_stack (
        id SERIAL PRIMARY KEY,
        item JSONB,
        parent_id INT8,
        nivel INTEGER
    ) ON COMMIT DROP;
    
    -- Crear tabla temporal para IDs existentes
    CREATE TEMP TABLE IF NOT EXISTS temp_existing_ids (
        ide_opci INT8 PRIMARY KEY
    ) ON COMMIT DROP;
    
    -- Limpiar tablas temporales
    DELETE FROM temp_stack;
    DELETE FROM temp_existing_ids;
    
    -- 1. Procesar cada elemento del array JSON (nivel 0 - subheaders)
    FOR v_i IN 0..jsonb_array_length(p_json) - 1 LOOP
        v_subheader := p_json->v_i;
        
        -- Insertar en el stack para procesar
        INSERT INTO temp_stack (item, parent_id, nivel) 
        VALUES (v_subheader, NULL, 0);
    END LOOP;
    
    -- 2. Procesar el stack iterativamente
    WHILE EXISTS (SELECT 1 FROM temp_stack) LOOP
        -- Tomar el primer elemento del stack
        SELECT item, parent_id, nivel 
        INTO v_current_item, v_current_parent, v_current_nivel
        FROM temp_stack 
        ORDER BY id
        LIMIT 1;
        
        DELETE FROM temp_stack 
        WHERE id = (SELECT id FROM temp_stack ORDER BY id LIMIT 1);
        
        -- Extraer datos del item
        v_title := COALESCE(v_current_item->>'subheader', v_current_item->>'title');
        v_path := v_current_item->>'path';
        v_icon := v_current_item->>'icon';  -- Extraer el icono del JSON
        
        -- Determinar el path completo
        IF v_current_nivel = 0 AND v_current_item->>'subheader' IS NOT NULL THEN
            v_full_path := NULL;  -- Los subheaders (nivel 0) no tienen path
        ELSE
            v_full_path := v_path;
        END IF;
        
        -- Buscar si la opción ya existe
        SELECT ide_opci INTO v_existing_id
        FROM sis_opcion 
        WHERE nom_opci = v_title 
          AND (tipo_opci IS NOT DISTINCT FROM v_full_path)
          AND (sis_ide_opci IS NOT DISTINCT FROM v_current_parent)
          AND ide_sist = 2
        LIMIT 1;
        
        IF v_existing_id IS NOT NULL THEN
            -- La opción ya existe, actualizarla
            v_item_id := v_existing_id;
            
            UPDATE sis_opcion 
            SET activo_opci = TRUE,
                refe_opci = NULL,
                fecha_actua = CURRENT_TIMESTAMP,
                usuario_actua = v_seq_login,
                icono_opci = v_icon  -- Actualizar el icono
            WHERE ide_opci = v_item_id;
            
            v_updated_count := v_updated_count + 1;
            
        ELSE
            -- La opción no existe, insertarla
            SELECT get_seq_table(
                table_name := 'sis_opcion',
                primary_key := 'ide_opci',
                number_rows_added := 1,
                login := v_seq_login
            ) INTO v_item_id;
            
            INSERT INTO sis_opcion (
                ide_opci,
                sis_ide_opci,
                nom_opci,
                tipo_opci,
                paquete_opci,
                auditoria_opci,
                manual_opci,
                ide_sist,
                refe_opci,
                activo_opci,
                usuario_ingre,
                fecha_ingre,
                usuario_actua,
                fecha_actua,
                icono_opci  -- Nueva columna
            ) VALUES (
                v_item_id,
                v_current_parent,
                v_title,
                v_full_path,
                NULL,
                FALSE,
                NULL,
                2,
                NULL,
                TRUE,
                v_seq_login,
                CURRENT_TIMESTAMP,
                v_seq_login,
                CURRENT_TIMESTAMP,
                v_icon  -- Valor del icono
            );
            
            v_inserted_count := v_inserted_count + 1;
        END IF;
        
        -- Registrar el ID para luego no desactivar esta opción
        INSERT INTO temp_existing_ids (ide_opci) 
        VALUES (v_item_id)
        ON CONFLICT (ide_opci) DO NOTHING;
        
        -- Procesar children si existen (máximo 5 niveles)
        IF v_current_nivel < 5 AND v_current_item ? 'children' THEN
            v_children := v_current_item->'children';
            
            FOR v_j IN 0..jsonb_array_length(v_children) - 1 LOOP
                INSERT INTO temp_stack (item, parent_id, nivel)
                VALUES (
                    v_children->v_j,
                    v_item_id,
                    v_current_nivel + 1
                );
            END LOOP;
        END IF;
        
        -- Procesar items si existe (para los subheaders)
        IF v_current_nivel = 0 AND v_current_item ? 'items' THEN
            v_children := v_current_item->'items';
            
            FOR v_j IN 0..jsonb_array_length(v_children) - 1 LOOP
                INSERT INTO temp_stack (item, parent_id, nivel)
                VALUES (
                    v_children->v_j,
                    v_item_id,
                    v_current_nivel + 1
                );
            END LOOP;
        END IF;
    END LOOP;
    
    -- 3. Desactivar opciones que no están en el JSON pero sí en la BD (con ide_sist = 2)
    WITH opciones_a_desactivar AS (
        UPDATE sis_opcion 
        SET activo_opci = FALSE,
            refe_opci = 'YA NO SE USA',
            fecha_actua = CURRENT_TIMESTAMP,
            usuario_actua = v_seq_login
        WHERE ide_sist = 2
          AND activo_opci = TRUE
          AND ide_opci NOT IN (SELECT ide_opci FROM temp_existing_ids)
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_deactivated_count FROM opciones_a_desactivar;
    
    -- Limpiar tablas temporales
    DROP TABLE IF EXISTS temp_stack;
    DROP TABLE IF EXISTS temp_existing_ids;
    
    -- Retornar resultados
    mensaje := 'Proceso completado exitosamente. ' ||
               'Insertadas: ' || v_inserted_count || ', ' ||
               'Actualizadas: ' || v_updated_count || ', ' ||
               'Desactivadas: ' || v_deactivated_count;
    exito := TRUE;
    opciones_insertadas := v_inserted_count;
    opciones_actualizadas := v_updated_count;
    opciones_desactivadas := v_deactivated_count;
    
    RETURN NEXT;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Limpiar tablas temporales en caso de error
        DROP TABLE IF EXISTS temp_stack;
        DROP TABLE IF EXISTS temp_existing_ids;
        
        -- Retornar error
        mensaje := 'Error al generar opciones: ' || SQLERRM;
        exito := FALSE;
        opciones_insertadas := 0;
        opciones_actualizadas := 0;
        opciones_desactivadas := 0;
        
        RETURN NEXT;
END;
$$;




SELECT * FROM f_generar_opciones_proerp(
    '[
        {
            "subheader": "Overview",
            "items": [
                { 
                    "title": "Inicio", 
                    "path": "/dashboard", 
                    "icon": "flat-color-icons:home" 
                }
            ]
        },
        {
            "subheader": "Management",
            "items": [
                {
                    "title": "Administración",
                    "path": "/dashboard/sistema/root",
                    "icon": "fluent-color:building-people-24",
                    "children": [
                        { "title": "Empresa", "path": "/dashboard/sistema/empresa" },
                        { "title": "Sucursales", "path": "/dashboard/sistema/sucursal" },
                        { "title": "Usuarios", "path": "/dashboard/sistema/usuarios/list" },
                        {
                            "title": "WhatsApp",
                            "path": "/dashboard/sistema/whatsapp",
                            "children": [
                                { "title": "Cuenta", "path": "/dashboard/sistema/whatsapp/account" },
                                { "title": "Listas", "path": "/dashboard/sistema/whatsapp/lists" },
                                { "title": "Panel BI", "path": "/dashboard/sistema/whatsapp/panel" }
                            ]
                        }
                    ]
                }
            ]
        }
    ]',
    'admin'
);

