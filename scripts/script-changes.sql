ALTER TABLE sis_usuario ADD COLUMN uuid UUID DEFAULT (uuid_generate_v4());
ALTER TABLE sis_usuario_clave ALTER COLUMN "clave_uscl" SET DATA TYPE varchar(80);
/**1234 = $2a$10$YmzXZuCX1sBWIGkw//4rVumKQuXuhY/RR3T4jJSUIOfYu74weKdZu */
UPDATE sis_usuario SET avatar_usua = 'avatar_default.jpg'

ALTER TABLE sis_opcion ADD COLUMN uuid UUID DEFAULT (uuid_generate_v4());

/**27/04/2023 Cambia de tipo bytea a string el logo de la empresa*/
ALTER TABLE "public"."sis_empresa" ALTER COLUMN "logo_empr" TYPE varchar(180)
GO

