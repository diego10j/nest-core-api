CREATE OR REPLACE FUNCTION f_get_variable_empresa(
    p_nom_para VARCHAR(50),
    p_empresa_para INTEGER
)
RETURNS VARCHAR
LANGUAGE plpgsql
AS $$
DECLARE
    v_valor_para VARCHAR;
BEGIN
    -- Buscar el parámetro en la tabla sis_parametros
    SELECT valor_para INTO v_valor_para
    FROM sis_parametros
    WHERE LOWER(nom_para) = LOWER(p_nom_para)
    AND empresa_para = p_empresa_para;
    
    -- Verificar si se encontró el parámetro
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El parámetro % no se encuentra configurado para la empresa %', 
                        p_nom_para, p_empresa_para;
    END IF;
    
    -- Retornar el valor encontrado
    RETURN v_valor_para;
END;
$$;

--SELECT f_get_variable_empresa('p_prueba_empresa', 0);