--empresa
INSERT INTO "public"."sis_empresa" ("ide_empr", "nom_empr", "nom_corto_empr", "mail_empr", "identificacion_empr", "obligadocontabilidad_empr") VALUES
(3, 'EMPRESA DEMO', 'EMPRESA DEMO', 'demo@proerpec.com', '1717194011001', 'NO');
--sucursal
INSERT INTO "public"."sis_sucursal" ("ide_sucu", "ide_empr", "nom_sucu", "nombre_comercial_sucu", "activo_sucu") VALUES
(100 , 3, 'SUURSAL 1 DEMO', 'SUURSAL 1 DEMO', 'TRUE');
--usuario admin
INSERT INTO "public"."sis_usuario" ("ide_usua", "ide_empr", "ide_perf", "nom_usua", "nick_usua", "mail_usua", "fecha_reg_usua", "activo_usua") VALUES
(110, 3, 20, 'Admin Demo', 'admin', 'admin@proerpec.com', '2024-10-29', 'TRUE');
-- usuario sucursal
INSERT INTO "public"."sis_usuario_sucursal" ("ide_ussu", "ide_sucu", "ide_usua", "sis_ide_sucu","activo_ussu") VALUES
(50, 100, 110,100, 'TRUE');
-- usuario clave 1234
INSERT INTO "public"."sis_usuario_clave" ("ide_uscl", "ide_usua", "fecha_registro_uscl", "clave_uscl", "activo_uscl") VALUES
(40, 110, '2024-10-29', '$2a$10$YmzXZuCX1sBWIGkw//4rVumKQuXuhY/RR3T4jJSUIOfYu74weKdZu', 'TRUE');
-- perfil admin a usuario
INSERT INTO "public"."sis_usuario_perfil" ("ide_usper", "ide_usua", "ide_perf", "ide_tihor", "activo_usper", "ide_empr", "ide_sucu", "extra_util_usper") VALUES
(10, 110, 0, 1, 'TRUE', 3, 100, 'TRUE');