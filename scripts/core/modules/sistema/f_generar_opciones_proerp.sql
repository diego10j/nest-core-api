

CREATE OR REPLACE FUNCTION public.f_generar_opciones_proerp(
    p_json_text TEXT,
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
    p_json JSONB;
    v_i INTEGER;
    v_j INTEGER;
    v_subheader JSONB;
    v_current_item JSONB;
    v_current_parent INT8;
    v_current_nivel INTEGER;
    v_item_id INT8;
    v_existing_id INT8;
    v_full_path VARCHAR(255);
    v_title VARCHAR(50);
    v_path VARCHAR(255);
    v_icon VARCHAR(255);
    v_children JSONB;
    v_inserted_count INTEGER := 0;
    v_updated_count INTEGER := 0;
    v_deactivated_count INTEGER := 0;
    v_seq_login VARCHAR;
BEGIN
    -- Convertir el texto a JSONB
    BEGIN
        p_json := p_json_text::JSONB;
    EXCEPTION WHEN OTHERS THEN
        mensaje := 'Error: El texto proporcionado no es un JSON válido. Detalles: ' || SQLERRM;
        exito := FALSE; opciones_insertadas := 0; opciones_actualizadas := 0; opciones_desactivadas := 0;
        RETURN NEXT; RETURN;
    END;

    v_seq_login := COALESCE(p_usuario, current_user);

    IF p_json IS NULL OR jsonb_array_length(p_json) = 0 THEN
        mensaje := 'El JSON proporcionado está vacío o es inválido';
        exito := FALSE; opciones_insertadas := 0; opciones_actualizadas := 0; opciones_desactivadas := 0;
        RETURN NEXT; RETURN;
    END IF;

    -- Tablas temporales
    CREATE TEMP TABLE IF NOT EXISTS temp_stack (
        id SERIAL PRIMARY KEY,
        item JSONB,
        parent_id INT8,
        nivel INTEGER
    ) ON COMMIT DROP;

    CREATE TEMP TABLE IF NOT EXISTS temp_existing_ids (
        ide_opci INT8 PRIMARY KEY
    ) ON COMMIT DROP;

    DELETE FROM temp_stack;
    DELETE FROM temp_existing_ids;

    -- Cargar nivel 0 (subheaders)
    FOR v_i IN 0..jsonb_array_length(p_json) - 1 LOOP
        INSERT INTO temp_stack (item, parent_id, nivel)
        VALUES (p_json->v_i, NULL, 0);
    END LOOP;

    -- Procesar stack
    WHILE EXISTS (SELECT 1 FROM temp_stack) LOOP

        SELECT item, parent_id, nivel
        INTO v_current_item, v_current_parent, v_current_nivel
        FROM temp_stack ORDER BY id LIMIT 1;

        DELETE FROM temp_stack
        WHERE id = (SELECT id FROM temp_stack ORDER BY id LIMIT 1);

        v_title := COALESCE(
            NULLIF(TRIM(v_current_item->>'subheader'), ''),
            NULLIF(TRIM(v_current_item->>'title'), '')
        );
        v_path  := NULLIF(TRIM(COALESCE(v_current_item->>'path', '')), '');
        v_icon  := NULLIF(TRIM(COALESCE(v_current_item->>'icon', '')), '');

        -- Los subheaders (nivel 0 sin path) no tienen tipo_opci
        IF v_current_nivel = 0 AND v_current_item->>'subheader' IS NOT NULL THEN
            v_full_path := NULL;
        ELSE
            v_full_path := v_path;
        END IF;

        v_existing_id := NULL;
        v_item_id     := NULL;

        -- ─────────────────────────────────────────────
        -- ESTRATEGIA DE BÚSQUEDA
        -- Para items con PATH: el path es único en ide_sist=2
        --   → buscar solo por tipo_opci + ide_sist (ignorar padre,
        --     así evitamos duplicados si el padre cambió de lugar)
        -- Para subheaders (sin path): buscar por nombre + padre + ide_sist
        -- ─────────────────────────────────────────────
        IF v_full_path IS NOT NULL THEN
            -- Buscar por path único dentro del sistema.
            -- Se usa TRIM para tolerar espacios accidentales en alguno de los dos lados.
            SELECT ide_opci INTO v_existing_id
            FROM sis_opcion
            WHERE TRIM(tipo_opci) = TRIM(v_full_path)
              AND ide_sist = 2
            LIMIT 1;
        ELSE
            -- Subheader: buscar por nombre dentro del sistema, SIN restricción de padre.
            -- Si el subheader cambió de posición en el árbol, se lo encontrará igualmente
            -- y se actualizará su padre (sis_ide_opci) en el UPDATE.
            SELECT ide_opci INTO v_existing_id
            FROM sis_opcion
            WHERE nom_opci = v_title
              AND ide_sist = 2
              AND tipo_opci IS NULL
            LIMIT 1;
        END IF;

        IF v_existing_id IS NOT NULL THEN
            -- ── ACTUALIZAR ──
            v_item_id := v_existing_id;

            UPDATE sis_opcion SET
                nom_opci      = v_title,
                sis_ide_opci  = v_current_parent,   -- corregir padre si se movió
                activo_opci   = TRUE,
                refe_opci     = NULL,
                icono_opci    = v_icon,
                fecha_actua   = CURRENT_TIMESTAMP,
                usuario_actua = v_seq_login
            WHERE ide_opci = v_item_id;

            v_updated_count := v_updated_count + 1;

        ELSE
            -- ── INSERTAR ──
            SELECT get_seq_table(
                table_name    := 'sis_opcion',
                primary_key   := 'ide_opci',
                number_rows_added := 1,
                login         := v_seq_login
            ) INTO v_item_id;

            INSERT INTO sis_opcion (
                ide_opci, sis_ide_opci, nom_opci, tipo_opci,
                paquete_opci, auditoria_opci, manual_opci, ide_sist,
                refe_opci, activo_opci,
                usuario_ingre, fecha_ingre,
                usuario_actua, fecha_actua,
                icono_opci
            ) VALUES (
                v_item_id, v_current_parent, v_title, v_full_path,
                NULL, FALSE, NULL, 2,
                NULL, TRUE,
                v_seq_login, CURRENT_TIMESTAMP,
                v_seq_login, CURRENT_TIMESTAMP,
                v_icon
            );

            v_inserted_count := v_inserted_count + 1;
        END IF;

        -- Registrar como procesado
        INSERT INTO temp_existing_ids (ide_opci)
        VALUES (v_item_id)
        ON CONFLICT (ide_opci) DO NOTHING;

        -- Encolar hijos: se usa 'children' si existe, sino 'items', nunca ambos.
        -- Esto evita que un nodo con ambas claves procese sus hijos dos veces.
        IF v_current_nivel < 5 THEN
            IF v_current_item ? 'children' THEN
                v_children := v_current_item->'children';
            ELSIF v_current_item ? 'items' THEN
                v_children := v_current_item->'items';
            ELSE
                v_children := NULL;
            END IF;

            IF v_children IS NOT NULL AND jsonb_array_length(v_children) > 0 THEN
                FOR v_j IN 0..jsonb_array_length(v_children) - 1 LOOP
                    INSERT INTO temp_stack (item, parent_id, nivel)
                    VALUES (v_children->v_j, v_item_id, v_current_nivel + 1);
                END LOOP;
            END IF;
        END IF;

    END LOOP;

    -- Desactivar opciones no presentes en el JSON
    WITH opciones_a_desactivar AS (
        UPDATE sis_opcion SET
            activo_opci   = FALSE,
            refe_opci     = 'YA NO SE USA',
            fecha_actua   = CURRENT_TIMESTAMP,
            usuario_actua = v_seq_login
        WHERE ide_sist = 2
          AND activo_opci = TRUE
          AND ide_opci NOT IN (SELECT ide_opci FROM temp_existing_ids)
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_deactivated_count FROM opciones_a_desactivar;

    DROP TABLE IF EXISTS temp_stack;
    DROP TABLE IF EXISTS temp_existing_ids;

    mensaje := 'Proceso completado exitosamente. ' ||
               'Insertadas: ' || v_inserted_count || ', ' ||
               'Actualizadas: ' || v_updated_count || ', ' ||
               'Desactivadas: ' || v_deactivated_count;
    exito := TRUE;
    opciones_insertadas := v_inserted_count;
    opciones_actualizadas := v_updated_count;
    opciones_desactivadas := v_deactivated_count;
    RETURN NEXT;

EXCEPTION WHEN OTHERS THEN
    DROP TABLE IF EXISTS temp_stack;
    DROP TABLE IF EXISTS temp_existing_ids;
    mensaje := 'Error al generar opciones: ' || SQLERRM;
    exito := FALSE; opciones_insertadas := 0; opciones_actualizadas := 0; opciones_desactivadas := 0;
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




