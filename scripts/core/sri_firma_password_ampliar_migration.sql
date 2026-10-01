-- El formato cifrado ENC:v3:<kid>:<iv>:<tag>:<texto> mide 74 + 2*(bytes de la clave) caracteres,
-- más que el varchar(80) original. Ampliar antes de activar SRI_ENCRYPTION_KEY.
-- Ampliar un varchar es seguro: no reescribe datos ni bloquea lecturas por mucho tiempo.
ALTER TABLE sri_firma_digital ALTER COLUMN password_srfid TYPE varchar(255);

-- Verificación (tlg_cuenta ya usa TEXT):
-- SELECT table_name, column_name, data_type, character_maximum_length
--   FROM information_schema.columns
--  WHERE column_name IN ('password_srfid','token_tlcue','groq_api_key_tlcue');
