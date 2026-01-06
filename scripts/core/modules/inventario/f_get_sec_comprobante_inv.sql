CREATE OR REPLACE FUNCTION public.f_get_sec_comprobante_inv(
    p_ide_inbod INT8
)
RETURNS VARCHAR(10)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_max_numero INT8;
    v_nuevo_numero INT8;
BEGIN
    -- Obtener el máximo número de manera segura
    -- Usamos COALESCE para manejar NULL y CAST para convertir
    SELECT COALESCE(MAX(
        CASE 
            WHEN numero_incci ~ '^[0-9]+$' THEN CAST(numero_incci AS INT8)
            ELSE NULL
        END
    ), 0)
    INTO v_max_numero
    FROM inv_cab_comp_inve
    WHERE ide_inbod = p_ide_inbod;
    
    -- Incrementar
    v_nuevo_numero := v_max_numero + 1;
    
    -- Formatear a 10 dígitos
    RETURN LPAD(CAST(v_nuevo_numero AS VARCHAR), 10, '0');
END;
$$;
---probar 
SELECT f_get_sec_comprobante_inv(2); 