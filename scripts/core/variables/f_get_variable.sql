CREATE OR REPLACE FUNCTION f_get_variable(
    p_nom_para VARCHAR(50)
)
RETURNS VARCHAR
LANGUAGE plpgsql
AS $$
DECLARE
    v_valor_para VARCHAR;
BEGIN
    -- Prioridad: global → empresa con ide_empr=0 (default para todas las empresas)
    SELECT valor_para INTO v_valor_para
    FROM sis_parametros
    WHERE LOWER(nom_para) = LOWER(p_nom_para)
    ORDER BY
        CASE
            WHEN es_empr_para = false            THEN 1
            WHEN es_empr_para = true AND ide_empr = 0 THEN 2
        END
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El parámetro % no se encuentra configurado',
                        p_nom_para;
    END IF;

    RETURN v_valor_para;
END;
$$;

CREATE OR REPLACE FUNCTION f_get_variable(
    p_nom_para VARCHAR(50),
    p_ide_empr INTEGER
)
RETURNS VARCHAR
LANGUAGE plpgsql
AS $$
DECLARE
    v_valor_para VARCHAR;
BEGIN
    -- Prioridad: empresa específica → empresa default (ide_empr=0)
    SELECT valor_para INTO v_valor_para
    FROM sis_parametros
    WHERE LOWER(nom_para) = LOWER(p_nom_para)
      AND es_empr_para = true
      AND ide_empr IN (p_ide_empr, 0)
    ORDER BY
        CASE
            WHEN ide_empr = p_ide_empr THEN 1
            ELSE 2
        END
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El parámetro % no se encuentra configurado para la empresa %',
                        p_nom_para, p_ide_empr;
    END IF;

    RETURN v_valor_para;
END;
$$;

--SELECT f_get_variable('p_prueba_empresa');
--SELECT f_get_variable('pe_prueba_empresa', 0);