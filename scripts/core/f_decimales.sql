CREATE OR REPLACE FUNCTION f_decimales(
    p_numero numeric,
    p_decimales integer DEFAULT 2
) RETURNS text AS $$
DECLARE
    v_texto text;
    v_parte_entera numeric;
    v_parte_decimal numeric;
    v_numero_redondeado numeric;
BEGIN
    -- Primero redondeamos el número al número de decimales especificado
    v_numero_redondeado := round(p_numero, p_decimales);
    
    -- Separamos parte entera y decimal del número redondeado
    v_parte_entera := trunc(v_numero_redondeado);
    v_parte_decimal := v_numero_redondeado - v_parte_entera;
    
    -- Si no hay parte decimal o es cero, devolvemos solo la parte entera
    IF v_parte_decimal = 0 THEN
        RETURN v_parte_entera::text;
    ELSE
        -- Si hay parte decimal, formateamos con los decimales especificados
        RETURN to_char(v_numero_redondeado, 'FM9999999999999999999990.' || repeat('0', p_decimales));
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- SELECT f_decimales(123.456789, 2);