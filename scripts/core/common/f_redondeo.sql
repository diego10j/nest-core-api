-- CREATE OR REPLACE FUNCTION f_redondeo(
--     valor numeric,
--     decimales integer DEFAULT 2
-- ) 
-- RETURNS numeric AS $$
-- BEGIN
--     -- Redondea el valor al número de decimales especificado
--     RETURN ROUND(valor, decimales);
-- EXCEPTION
--     WHEN OTHERS THEN
--         -- En caso de error, devuelve NULL
--         RETURN NULL;
-- END;
-- $$ LANGUAGE plpgsql;



CREATE OR REPLACE FUNCTION f_redondeo(
    valor numeric,
    decimales integer DEFAULT 2
) 
RETURNS numeric AS $$
DECLARE
    formato text;
BEGIN
    -- Si el valor es NULL, retorna 0
    IF valor IS NULL THEN
        RETURN ROUND(0::numeric, decimales);
    END IF;

    -- Formato dinámico para asegurar los decimales deseados
    formato := 'FM9999999990.' || repeat('0', decimales);

    -- Redondea y devuelve como NUMERIC manteniendo los decimales
    RETURN to_number(to_char(ROUND(valor, decimales), formato), formato);

EXCEPTION
    WHEN OTHERS THEN
        RETURN ROUND(0::numeric, decimales);
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- SELECT f_redondeo(123.4567, 2);  -- Devuelve 123.46