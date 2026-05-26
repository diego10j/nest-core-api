CREATE OR REPLACE FUNCTION f_update_variables(
    p_ide_empr INTEGER,
    p_parametros JSONB,
    p_login VARCHAR DEFAULT 'sa'
) RETURNS INTEGER AS $$
-- Inserta únicamente los parámetros recibidos (el filtrado de existentes se hace en la capa de servicio).
-- Retorna el número de filas insertadas.
DECLARE
    v_param    RECORD;
    v_ide_para INTEGER;
    v_count    INTEGER := 0;
BEGIN
    IF jsonb_array_length(p_parametros) = 0 THEN
        RETURN 0;
    END IF;

    FOR v_param IN
        SELECT * FROM jsonb_to_recordset(p_parametros) AS x(
            ide_modu            INTEGER,
            nom_para            VARCHAR(50),
            descripcion_para    VARCHAR(2000),
            valor_para          VARCHAR(2000),
            tabla_para          VARCHAR(50),
            campo_codigo_para   VARCHAR(30),
            campo_nombre_para   VARCHAR(40),
            activo_para         BOOLEAN,
            es_empr_para        BOOLEAN
        )
    LOOP
        SELECT get_seq_table('sis_parametros', 'ide_para', 1, p_login) INTO v_ide_para;

        INSERT INTO sis_parametros (
            ide_para, ide_empr, ide_modu,
            nom_para, descripcion_para, valor_para,
            tabla_para, campo_codigo_para, campo_nombre_para,
            activo_para, usuario_ingre, es_empr_para
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

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;


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