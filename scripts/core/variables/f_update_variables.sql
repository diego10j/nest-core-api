CREATE OR REPLACE FUNCTION f_update_variables(
    p_ide_empr INTEGER,
    p_parametros JSONB,
    p_login VARCHAR DEFAULT 'sa'
) RETURNS VOID AS $$
DECLARE
    v_param RECORD;
    v_ide_para INTEGER;
    v_exists BOOLEAN;
BEGIN
    -- Verificar si el array de parámetros está vacío
    IF jsonb_array_length(p_parametros) = 0 THEN
        RAISE NOTICE 'El array de parámetros está vacío';
        RETURN;
    END IF;

    -- Recorrer cada parámetro en el array JSON
    FOR v_param IN SELECT * FROM jsonb_to_recordset(p_parametros) AS x(
        ide_modu INTEGER,
        nom_para VARCHAR(50),
        descripcion_para VARCHAR(2000),
        valor_para VARCHAR(2000),
        tabla_para VARCHAR(50),
        campo_codigo_para VARCHAR(30),
        campo_nombre_para VARCHAR(40),
        activo_para BOOLEAN,
        es_empr_para BOOLEAN
    )
    LOOP
        -- Verificar si el parámetro ya existe usando los índices creados
        IF v_param.es_empr_para THEN
            -- Parámetro por empresa: verificar existencia para esta empresa específica
            SELECT EXISTS (
                SELECT 1 FROM sis_parametros 
                WHERE nom_para = v_param.nom_para 
                AND ide_empr = p_ide_empr
                AND ide_modu = v_param.ide_modu
            ) INTO v_exists;
        ELSE
            -- Parámetro global: verificar existencia sin considerar empresa
            SELECT EXISTS (
                SELECT 1 FROM sis_parametros 
                WHERE nom_para = v_param.nom_para 
                AND ide_modu = v_param.ide_modu
                AND es_empr_para = false
            ) INTO v_exists;
        END IF;

        IF NOT v_exists THEN
            -- Obtener el próximo ID para el parámetro
            SELECT get_seq_table('sis_parametros', 'ide_para', 1, p_login) INTO v_ide_para;
            
            -- Insertar el nuevo parámetro
            INSERT INTO sis_parametros (
                ide_para,
                ide_empr,
                ide_modu,
                nom_para,
                descripcion_para,
                valor_para,
                tabla_para,
                campo_codigo_para,
                campo_nombre_para,
                activo_para,
                usuario_ingre,
                es_empr_para
            ) VALUES (
                v_ide_para,
                CASE WHEN v_param.es_empr_para THEN p_ide_empr ELSE NULL END,
                v_param.ide_modu,
                v_param.nom_para,
                v_param.descripcion_para,
                v_param.valor_para,
                v_param.tabla_para,
                v_param.campo_codigo_para,
                v_param.campo_nombre_para,
                COALESCE(v_param.activo_para, true),
                p_login,
                COALESCE(v_param.es_empr_para, false)
            );
            
            RAISE NOTICE 'Parámetro insertado: % (ID: %)', v_param.nom_para, v_ide_para;
        ELSE
            RAISE NOTICE 'Parámetro ya existe: %', v_param.nom_para;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql


-- Ejemplo de llamada con parámetros específicos
SELECT f_update_variables(
    0, -- ID de la empresa
    '[{
        "ide_modu": 1,
        "nom_para": "p_inv_estado_normal",
        "descripcion_para": "Indica el estado normal de comprobante de inventario",
        "valor_para": "1",
        "tabla_para": "inv_est_prev_inve",
        "campo_codigo_para": "ide_inepi",
        "campo_nombre_para": "nombre_inepi",
        "activo_para": true,
        "es_empr_para": false
    },
    {
        "ide_modu": 1,
        "nom_para": "p_inv_estado_anulado",
        "descripcion_para": "Indica el estado anulado de comprobante de inventario",
        "valor_para": "0",
        "tabla_para": "inv_est_prev_inve",
        "campo_codigo_para": "ide_inepi",
        "campo_nombre_para": "nombre_inepi",
        "activo_para": true,
        "es_empr_para": false
    }]'::jsonb,
    'sa' -- usuario
);