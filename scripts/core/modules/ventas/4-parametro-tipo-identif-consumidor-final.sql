-- Parámetro de sistema para identificar el tipo de identificación "CONSUMIDOR FINAL"
-- (gen_tipo_identifi.ide_getid=3), usado para bloquear la emisión de notas de crédito
-- contra facturas emitidas a consumidor final (regla SRI: la NC debe identificar al
-- adquirente con RUC/cédula/pasaporte válido, no procede sobre "consumidor final").
INSERT INTO sis_parametros (ide_para, nom_para, valor_para, tabla_para, campo_codigo_para, campo_nombre_para, es_empr_para, activo_para, descripcion_para)
SELECT 720, 'p_gen_tipo_identif_consumidor_final', '3', 'gen_tipo_identifi', 'ide_getid', 'nombre_getid', false, true,
       'Tipo de identificación "CONSUMIDOR FINAL" (gen_tipo_identifi) — no se permiten notas de crédito contra facturas emitidas a este tipo de cliente (normativa SRI)'
WHERE NOT EXISTS (SELECT 1 FROM sis_parametros WHERE nom_para = 'p_gen_tipo_identif_consumidor_final');
