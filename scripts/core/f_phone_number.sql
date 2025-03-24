CREATE OR REPLACE FUNCTION f_phone_number(phone TEXT)
RETURNS TEXT AS $$
BEGIN
    -- Verifica si el número comienza con "593" y tiene más de 3 caracteres
    IF phone LIKE '593%' AND LENGTH(phone) > 3 THEN
        -- Retorna el número sin "593" y con un "0" al inicio
        RETURN '0' || SUBSTRING(phone FROM 4);
    ELSE
        -- Retorna el número con un "+" al inicio
        RETURN '+' || phone;
    END IF;
END;
$$ LANGUAGE plpgsql;

--SELECT f_phone_number('593987654321');