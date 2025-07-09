CREATE OR REPLACE FUNCTION f_existe_telefono_whatsapp(p_numero TEXT) 
RETURNS BOOLEAN AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM gen_persona WHERE whatsapp_geper = p_numero) OR
       EXISTS (SELECT 1 FROM wha_det_camp_envio WHERE telefono_whden = p_numero) THEN
        RETURN true;
    ELSE
        RETURN false;
    END IF;
END;
$$ LANGUAGE plpgsql;
-- SELECT f_existe_telefono_whatsapp('0983113543') AS existe_numero;