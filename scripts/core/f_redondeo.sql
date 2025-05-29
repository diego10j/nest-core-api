CREATE OR REPLACE FUNCTION f_redondeo(
    valor numeric,
    decimales integer DEFAULT 0
) 
RETURNS numeric AS $$
BEGIN
    -- Redondea el valor al número de decimales especificado
    RETURN ROUND(valor, decimales);
EXCEPTION
    WHEN OTHERS THEN
        -- En caso de error, devuelve NULL
        RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- SELECT f_redondeo(123.4567, 2);  -- Devuelve 123.46