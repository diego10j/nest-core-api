CREATE OR REPLACE FUNCTION f_enmascarar_texto(input_text TEXT)
RETURNS TEXT AS $$
BEGIN
    -- Retorna una cadena de asteriscos con la misma longitud que el texto de entrada
    RETURN REPEAT('*', LENGTH(input_text));
END;
$$ LANGUAGE plpgsql;


-- SELECT f_enmascarar_texto('Texto1');
