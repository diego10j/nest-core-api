-- Cambiar configuración SMTP al puerto 26 (No seguro)
-- Puerto 26 disponible sin cifrado

-- Actualizar la cuenta de correo por defecto
UPDATE sis_correo 
SET 
    smtp_corr = TRIM(smtp_corr),        -- Limpiar espacios
    puerto_corr = '26',                 -- Puerto 26
    secure_corr = false                 -- false para puerto no seguro
WHERE ide_corr = 1;

-- Verificar el cambio
SELECT 
    ide_corr,
    alias_corr,
    smtp_corr,
    puerto_corr,
    secure_corr,
    correo_corr,
    'Puerto 26 configurado (No seguro)' as estado
FROM sis_correo
WHERE ide_corr = 1;
