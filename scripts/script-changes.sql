--ALTER TABLE sis_usuario ADD COLUMN uuid UUID DEFAULT (uuid_generate_v4());
--CREATE INDEX idx_uuid_usuario ON sis_usuario(uuid);

--ALTER TABLE sis_usuario_clave ALTER COLUMN "clave_uscl" SET DATA TYPE varchar(80);

UPDATE sis_usuario SET avatar_usua = 'avatar_default.jpg'

// ALTER TABLE sis_opcion ADD COLUMN uuid UUID DEFAULT (uuid_generate_v4());

/**15/08/2023 Campos tabla articulo*/



--password_uscl   Temporal1  $2b$10$btZwt2iPr4lk7h02bKyShePvKXca4B9WT4cKAX7OzYSnOiInzfaRu

/**21/05/22024**/
ALTER TABLE inv_doc_producto ADD COLUMN uuid UUID DEFAULT (uuid_generate_v4());
CREATE INDEX idx_uuid_inv_doc_producto ON inv_doc_producto(uuid);


--- correo defecto
INSERT INTO "public"."sis_correo" ("ide_corr", "alias_corr", "smtp_corr", "puerto_corr", "usuario_corr", "correo_corr", "nom_correo_corr", "clave_corr", "secure_corr", "activo_corr", "observacion_corr", "ide_sucu", "ide_empr") VALUES
(1, 'default', 'mail.produquimic.com.ec ', '465', 'Notificaciones', 'notificacion@produquimic.com.ec', 'notificacion@produquimic.com.ec', 'xxxxxxxx', 't', 't', 'Cuenta de Correo por defecto', 2, 0);




----MENU NUEVO ERP
INSERT INTO "public"."sis_opcion" ("ide_opci", "nom_opci", "tipo_opci","paquete_opci", "auditoria_opci", "ide_sist","activo_opci") VALUES 
(1000, 'Administrador', '/dashboard/sistema','sistema', FALSE, 2, TRUE);
INSERT INTO "public"."sis_opcion" ("ide_opci", "sis_ide_opci", "nom_opci", "tipo_opci", "paquete_opci", "auditoria_opci", "ide_sist", "activo_opci") VALUES
(1001, 1000, 'Sistemas', '/dashboard/sistema/simple', 'sistema', FALSE, 2, TRUE);
INSERT INTO "public"."sis_opcion" ("ide_opci", "sis_ide_opci", "nom_opci", "tipo_opci", "paquete_opci", "ide_sist", "activo_opci") VALUES (1002, 1000, 'Empresas', '/dashboard/sistema/empresa', 'sistema', 2, 't');

INSERT INTO "public"."sis_opcion" ("ide_opci", "sis_ide_opci", "nom_opci", "tipo_opci", "paquete_opci", "ide_sist", "activo_opci") VALUES (1003, 1000, 'Sucursales', '/dashboard/sistema/sucursal', 'sistema', 2, 't');

--PERFIL ADMIN NUEVO ERP
INSERT INTO "public"."sis_perfil" ("ide_perf", "nom_perf", "activo_perf") VALUES
(20, 'Admin ERP', 'TRUE');

--PERMISOS MENU ADMIN NUEVO ERP
INSERT INTO "public"."sis_perfil_opcion" ("ide_peop", "ide_perf", "ide_opci", "lectura_peop") VALUES
(1000, 20, 1000, FALSE);

INSERT INTO "public"."sis_perfil_opcion" ("ide_peop", "ide_perf", "ide_opci", "lectura_peop") VALUES
(1001, 20, 1001, FALSE);

INSERT INTO "public"."sis_perfil_opcion" ("ide_peop", "ide_perf", "ide_opci", "lectura_peop") VALUES (1002, 20, 1002, 'f');

INSERT INTO "public"."sis_perfil_opcion" ("ide_peop", "ide_perf", "ide_opci", "lectura_peop") VALUES (1003, 20, 1003, 'f');


-- 02 Ago 2024
-- actualiza las opciones al sistema 1
--update sis_perfil set ide_sist = 1;

-- 21 Ago 2024
ALTER TABLE sis_tabla ADD COLUMN query_name_tabl varchar(100); 
ALTER TABLE sis_tabla ADD COLUMN usuario_ingre varchar(50); 
ALTER TABLE sis_tabla ADD COLUMN hora_ingre TIMESTAMP;
ALTER TABLE sis_tabla ADD COLUMN usuario_actua varchar(50); 
ALTER TABLE sis_tabla ADD COLUMN hora_actua TIMESTAMP;

CREATE INDEX idx_query_name_sis_tabla ON sis_tabla(query_name_tabl);
CREATE INDEX idx_query_name_opci_sis_tabla ON sis_tabla(ide_opci,query_name_tabl);

ALTER TABLE sis_campo ADD COLUMN usuario_ingre varchar(50); 
ALTER TABLE sis_campo ADD COLUMN hora_ingre TIMESTAMP;
ALTER TABLE sis_campo ADD COLUMN usuario_actua varchar(50); 
ALTER TABLE sis_campo ADD COLUMN hora_actua TIMESTAMP;
ALTER TABLE sis_campo ADD COLUMN table_id_camp int4; 
ALTER TABLE sis_campo ADD COLUMN data_type_id_camp int4; 
ALTER TABLE sis_campo ADD COLUMN data_type_camp varchar(50); 
ALTER TABLE sis_campo ADD COLUMN length_camp int4; 
ALTER TABLE sis_campo ADD COLUMN decimals_camp int4; 
ALTER TABLE sis_campo ADD COLUMN precision_camp int4; 
ALTER TABLE sis_campo ADD COLUMN component_camp varchar(80); 
ALTER TABLE sis_campo ADD COLUMN size_camp int4; 
ALTER TABLE sis_campo ADD COLUMN align_camp varchar(50); 












// 30 Ago 2024

ALTER TABLE cxc_datos_fac ADD COLUMN establecimiento_ccdfa varchar(3); 
ALTER TABLE cxc_datos_fac ADD COLUMN pto_emision_ccdfa varchar(3); 
ALTER TABLE cxc_datos_fac ADD COLUMN num_actual_ccdfa TIMESTAMP;
ALTER TABLE cxc_datos_fac ADD COLUMN usuario_ingre varchar(50); 
ALTER TABLE cxc_datos_fac ADD COLUMN hora_ingre TIMESTAMP;

// 12 Sep 2024

ALTER TABLE inv_caracteristica ADD COLUMN usuario_ingre varchar(50); 
ALTER TABLE inv_caracteristica ADD COLUMN hora_ingre TIMESTAMP;
ALTER TABLE inv_caracteristica ADD COLUMN usuario_actua varchar(50); 
ALTER TABLE inv_caracteristica ADD COLUMN hora_actua TIMESTAMP;
ALTER TABLE inv_caracteristica ADD COLUMN ide_empr int;
ALTER TABLE inv_caracteristica ADD COLUMN ide_sucu int;





CREATE INDEX idx_inv_conversion_unidad_ide_inuni ON inv_conversion_unidad(ide_inuni);
CREATE INDEX idx_inv_conversion_unidad_inv_ide_inuni ON inv_conversion_unidad(inv_ide_inuni);







--sis_usuario_sucursal
ALTER TABLE sis_usuario_sucursal ADD COLUMN activo_ussu bool DEFAULT true;
ALTER TABLE sis_usuario_sucursal ADD COLUMN usuario_ingre varchar(50); 
ALTER TABLE sis_usuario_sucursal ADD COLUMN hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE sis_usuario_sucursal ADD COLUMN usuario_actua varchar(50); 
ALTER TABLE sis_usuario_sucursal ADD COLUMN hora_actua TIMESTAMP;


ALTER TABLE sis_sucursal ADD COLUMN activo_sucu bool DEFAULT true;
ALTER TABLE sis_sucursal ADD COLUMN usuario_ingre varchar(50); 
ALTER TABLE sis_sucursal ADD COLUMN hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE sis_sucursal ADD COLUMN usuario_actua varchar(50); 
ALTER TABLE sis_sucursal ADD COLUMN hora_actua TIMESTAMP ;


-- 12 Nov 2024



-- 04-02-2025



ALTER TABLE "public"."cxc_cabece_proforma"
ADD COLUMN "ide_geper" int4;

ALTER TABLE "public"."cxc_cabece_proforma"
ADD COLUMN "fecha_abre_cccpr" timestamp;

ALTER TABLE "public"."cxc_cabece_proforma"
ADD COLUMN "usuario_abre_cccpr" varchar(80);

ALTER TABLE public.cxc_cabece_proforma
	ADD CONSTRAINT cxc_cabece_proforma_ide_geper_fkey
	FOREIGN KEY(ide_geper)
	REFERENCES public.gen_persona(ide_geper)
	MATCH SIMPLE
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT ;
  
    

-- 4. Índice para cálculo de agregados por ide_geper
CREATE INDEX idx_geper_nom_uuid 
ON gen_persona (ide_geper, nom_geper, uuid);



ALTER TABLE con_deta_forma_pago ADD COLUMN usuario_ingre varchar(50); 
ALTER TABLE con_deta_forma_pago ADD COLUMN hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE con_deta_forma_pago ADD COLUMN usuario_actua varchar(50); 
ALTER TABLE con_deta_forma_pago ADD COLUMN hora_actua TIMESTAMP;

ALTER TABLE con_cabece_forma_pago ADD COLUMN usuario_ingre varchar(50); 
ALTER TABLE con_cabece_forma_pago ADD COLUMN hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE con_cabece_forma_pago ADD COLUMN usuario_actua varchar(50); 
ALTER TABLE con_cabece_forma_pago ADD COLUMN hora_actua TIMESTAMP;





ALTER TABLE sis_parametros ADD COLUMN es_empr_para bool DEFAULT false;  -- para saber si el parametro se maneja por empresa
ALTER TABLE sis_parametros ADD COLUMN empresa_para  INT;    -- se llena cuando  es_empr_para = true
ALTER TABLE sis_parametros ADD COLUMN activo_para bool DEFAULT true;
ALTER TABLE sis_parametros ADD COLUMN usuario_ingre varchar(50); 
ALTER TABLE sis_parametros ADD COLUMN hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE sis_parametros ADD COLUMN usuario_actua varchar(50); 
ALTER TABLE sis_parametros ADD COLUMN hora_actua TIMESTAMP;

CREATE INDEX idx_sis_parametros_nom_empresa ON sis_parametros (nom_para, empresa_para);
CREATE INDEX idx_sis_parametros_lower_nom_empresa ON sis_parametros (LOWER(nom_para), empresa_para);

--- actualiza categorias de productos existentes

WITH
	numbered_fragrances AS (
		SELECT
			ide_inarti,
			ROW_NUMBER() OVER (
				ORDER BY
					ide_inarti
			) AS row_num
		FROM
			inv_articulo
		WHERE
			upper(nombre_inarti) LIKE 'FRAG%'
	)
UPDATE inv_articulo a
SET
	cod_auto_inarti = 'FRA-' || LPAD(f.row_num::text, 6, '0'),
	ide_incate = 2
FROM
	numbered_fragrances f
WHERE
	a.ide_inarti = f.ide_inarti;



WITH
	numbered_fragrances AS (
		SELECT
			ide_inarti,
			ROW_NUMBER() OVER (
				ORDER BY
					ide_inarti
			) AS row_num
		FROM
			inv_articulo
		WHERE
			upper(nombre_inarti) LIKE 'SABO%'
	)
UPDATE inv_articulo a
SET
	cod_auto_inarti = 'SAB-' || LPAD(f.row_num::text, 6, '0'),
	ide_incate = 3
FROM
	numbered_fragrances f
WHERE
	a.ide_inarti = f.ide_inarti;


	
WITH
	numbered_fragrances AS (
		SELECT
			ide_inarti,
			ROW_NUMBER() OVER (
				ORDER BY
					ide_inarti
			) AS row_num
		FROM
			inv_articulo
		WHERE
			upper(nombre_inarti) LIKE 'ACEITE%' AND ide_inarti > 1800
	)
UPDATE inv_articulo a
SET
	cod_auto_inarti = 'AES-' || LPAD(f.row_num::text, 6, '0'),
	ide_incate = 7
FROM
	numbered_fragrances f
WHERE
	a.ide_inarti = f.ide_inarti;




WITH
	numbered_fragrances AS (
		SELECT
			ide_inarti,
			ROW_NUMBER() OVER (
				ORDER BY
					ide_inarti
			) AS row_num
		FROM
			inv_articulo
		WHERE
			upper(nombre_inarti) like 'GALO%'  OR  upper(nombre_inarti) like 'CANE%' OR upper(nombre_inarti) like 'TANQ%' OR upper(nombre_inarti) like 'FUND%' OR upper(nombre_inarti) like 'FRASC%' OR upper(nombre_inarti) like 'ENVAS%'
	)
UPDATE inv_articulo a
SET
	cod_auto_inarti = 'ENV-' || LPAD(f.row_num::text, 6, '0'),
	ide_incate = 4
FROM
	numbered_fragrances f
WHERE
	a.ide_inarti = f.ide_inarti;



WITH
	numbered_fragrances AS (
		SELECT
			ide_inarti,
			ROW_NUMBER() OVER (
				ORDER BY
					ide_inarti
			) AS row_num
		FROM
			inv_articulo
		WHERE
			upper(nombre_inarti) like 'COLO%'  OR  upper(nombre_inarti) like 'MICA%' 
	)
UPDATE inv_articulo a
SET
	cod_auto_inarti = 'COL-' || LPAD(f.row_num::text, 6, '0'),
	ide_incate = 8
FROM
	numbered_fragrances f
WHERE
	a.ide_inarti = f.ide_inarti;



WITH
	numbered_fragrances AS (
		SELECT
			ide_inarti,
			ROW_NUMBER() OVER (
				ORDER BY
					ide_inarti
			) AS row_num
		FROM
			inv_articulo
		WHERE
			upper(nombre_inarti) like 'MOL%'  
	)
UPDATE inv_articulo a
SET
	cod_auto_inarti = 'MOL-' || LPAD(f.row_num::text, 6, '0'),
	ide_incate = 9
FROM
	numbered_fragrances f
WHERE
	a.ide_inarti = f.ide_inarti;
	

WITH
	numbered_fragrances AS (
		SELECT
			ide_inarti,
			ROW_NUMBER() OVER (
				ORDER BY
					ide_inarti
			) AS row_num
		FROM
			inv_articulo
		WHERE
			hace_kardex_inarti = TRUE AND nivel_inarti = 'HIJO' and ide_incate IS NULL
	)
UPDATE inv_articulo a
SET
	cod_auto_inarti = 'MPR-' || LPAD(f.row_num::text, 6, '0'),
	ide_incate = 1
FROM
	numbered_fragrances f
WHERE
	a.ide_inarti = f.ide_inarti;




--
ALTER TABLE "public"."gen_persona"
ADD COLUMN "whatsapp_geper" varchar(15);

ALTER TABLE "public"."gen_persona"
ADD COLUMN "fecha_veri_what_geper" timestamp ,
ADD COLUMN "ide_gepais" int4;
ALTER TABLE "public"."gen_persona" ADD FOREIGN KEY ("ide_gepais") REFERENCES "public"."gen_pais" ("ide_gepais");

CREATE INDEX idx_gen_persona_whatsapp_geper
ON gen_persona (whatsapp_geper);
CREATE INDEX idx_wha_det_camp_envio_telefono_whden
ON wha_det_camp_envio (telefono_whden);









CREATE TABLE inv_lote (
    ide_inlot int8 PRIMARY KEY,
    lote_inlot VARCHAR(50) NULL,
    fecha_ingreso_inlot TIMESTAMP DEFAULT NOW(),
    fecha_caducidad_inlot DATE,
	pais_inlot VARCHAR(80),
	peso_inlot numeric(12,3),
    peso_tara_inlot numeric(12,3),
    diferencia_peso_inlot numeric(12,3),    ---  para cuando existen diferencias de peso
    ide_indci_ingreso INTEGER,
    es_saldo_inicial BOOLEAN DEFAULT FALSE, -- Para identificar si es saldo inicial
    activo_inlot BOOLEAN DEFAULT TRUE,  
	archivo1_inlot varchar(250),
	archivo2_inlot varchar(250),
	archivo3_inlot varchar(250),
	observacion_inlot varchar(250),
	usuario_verif_inlot VARCHAR(50),
	fecha_verif_inlot TIMESTAMP,
	verificado_inlot BOOLEAN DEFAULT FALSE, 
    usuario_ingre VARCHAR(50),
    fecha_ingre TIMESTAMP DEFAULT NOW(),
    usuario_actua VARCHAR(50),
    fecha_actua TIMESTAMP,
    FOREIGN KEY (ide_indci_ingreso) REFERENCES inv_det_comp_inve(ide_indci)
);


ALTER TABLE "public"."inv_det_comp_inve" ADD FOREIGN KEY ("ide_inlot") REFERENCES "public"."inv_lote" ("ide_inlot");


ALTER TABLE inv_est_prev_inve ADD COLUMN usuario_ingre varchar(50); 
ALTER TABLE inv_est_prev_inve ADD COLUMN hora_ingre TIMESTAMP;
ALTER TABLE inv_est_prev_inve ADD COLUMN usuario_actua varchar(50); 
ALTER TABLE inv_est_prev_inve ADD COLUMN hora_actua TIMESTAMP;




CREATE INDEX IF NOT EXISTS idx_sis_parametros_nom_para ON sis_parametros (nom_para);
CREATE INDEX IF NOT EXISTS idx_sis_parametros_ide_empr ON sis_parametros (ide_empr);
CREATE INDEX IF NOT EXISTS idx_sis_parametros_ide_modu ON sis_parametros (ide_modu);
CREATE INDEX IF NOT EXISTS idx_sis_parametros_es_empr_para ON sis_parametros (es_empr_para);
CREATE INDEX IF NOT EXISTS idx_sis_parametros_nom_para_ide_empr ON sis_parametros (nom_para, ide_empr);
CREATE INDEX IF NOT EXISTS idx_sis_parametros_nom_para_ide_modu ON sis_parametros (nom_para, ide_modu);
CREATE INDEX IF NOT EXISTS idx_sis_parametros_nom_para_es_empr ON sis_parametros (nom_para, es_empr_para);


ALTER TABLE sis_perfil_opcion ADD COLUMN usuario_ingre varchar(50); 
ALTER TABLE sis_perfil_opcion ADD COLUMN fecha_ingre TIMESTAMP;
ALTER TABLE sis_perfil_opcion ADD COLUMN usuario_actua varchar(50); 
ALTER TABLE sis_perfil_opcion ADD COLUMN fecha_actua TIMESTAMP;
ALTER TABLE sis_perfil_opcion ADD COLUMN ide_empr int;
ALTER TABLE sis_perfil_opcion ADD COLUMN ide_sucu int;


ALTER TABLE "public"."inv_lote"
ADD COLUMN "peso_verifica_inlot" numeric(12,3),
ADD COLUMN "ide_indci_egreso" int4;

ALTER TABLE "public"."inv_lote" ADD FOREIGN KEY ("ide_indci_egreso") REFERENCES "public"."inv_det_comp_inve" ("ide_indci") ON DELETE RESTRICT;


ALTER TABLE public.inv_lote
ADD COLUMN inv_ide_inlot BIGINT;

ALTER TABLE public.inv_lote
ADD CONSTRAINT fk_inv_lote_origen
FOREIGN KEY (inv_ide_inlot)
REFERENCES public.inv_lote (ide_inlot)
ON DELETE RESTRICT;


CREATE INDEX idx_inv_lote_inv_ide_inlot
ON public.inv_lote (inv_ide_inlot);




-------- 



-----
-- ÍNDICES PARA OPTIMIZAR CONSULTAS DE CUENTAS POR COBRAR




---CONTEO INVENTARIO 
