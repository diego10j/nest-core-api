ALTER TABLE sis_usuario ADD COLUMN uuid UUID DEFAULT (uuid_generate_v4());
CREATE INDEX idx_uuid_usuario ON sis_usuario(uuid);

ALTER TABLE sis_usuario_clave ALTER COLUMN "clave_uscl" SET DATA TYPE varchar(80);
/**1234 = $2a$10$YmzXZuCX1sBWIGkw//4rVumKQuXuhY/RR3T4jJSUIOfYu74weKdZu */
UPDATE sis_usuario SET avatar_usua = 'avatar_default.jpg'

ALTER TABLE sis_opcion ADD COLUMN uuid UUID DEFAULT (uuid_generate_v4());

/**27/04/2023 Cambia de tipo bytea a string el logo de la empresa*/
ALTER TABLE "public"."sis_empresa" ALTER COLUMN "logo_empr" TYPE varchar(180)
GO

/**15/08/2023 Campos tabla articulo*/
ALTER TABLE inv_articulo ADD COLUMN uuid UUID DEFAULT (uuid_generate_v4());
ALTER TABLE inv_articulo ADD COLUMN activo_inarti BOOLEAN;
ALTER TABLE inv_articulo ADD COLUMN foto_inarti varchar(120);

UPDATE inv_articulo SET  activo_inarti = true;

/**18/09/2023 */
ALTER TABLE inv_articulo ADD COLUMN publicacion_inarti Text;
CREATE INDEX idx_uuid ON inv_articulo(uuid);
ALTER TABLE inv_articulo ADD COLUMN tags_inarti json;

ALTER TABLE inv_articulo ADD COLUMN cant_stock1_inarti decimal(12,3);     -- Cantidad minima stock
ALTER TABLE inv_articulo ADD COLUMN cant_stock2_inarti decimal(12,3);     -- Cantidad maxima stock
ALTER TABLE inv_articulo ADD COLUMN por_util1_inarti decimal(12,3); 	  -- % Utilidad venta por mayor
ALTER TABLE inv_articulo ADD COLUMN por_util2_inarti decimal(12,3); 	
ALTER TABLE inv_articulo ADD COLUMN precio_inarti decimal(12,3); -- % Cuando tiene precio fjo



CREATE TABLE inv_categoria  ( 
	ide_incate  	integer NOT NULL,
	nombre_incate	varchar(150) NULL,
	inv_ide_incate 	integer NULL,
	activo_incate 	boolean NULL,
	ide_empr     	integer NULL,
	ide_sucu     	integer NULL,
	usuario_ingre	varchar(50) NULL,
	fecha_ingre  	date NULL,
	hora_ingre   	time(6) NULL,
	usuario_actua	varchar(50) NULL,
	fecha_actua  	date NULL,
	hora_actua   	time(6) NULL,
	CONSTRAINT pk_inv_categoria PRIMARY KEY(ide_incate)
);
ALTER TABLE public.inv_categoria
	ADD CONSTRAINT inv_categoria_ide_sucu_fkey
	FOREIGN KEY(ide_sucu)
	REFERENCES public.sis_sucursal(ide_sucu)
	MATCH SIMPLE
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT ;
ALTER TABLE public.inv_categoria
	ADD CONSTRAINT inv_categoria_ide_empr_fkey
	FOREIGN KEY(ide_empr)
	REFERENCES public.sis_empresa(ide_empr)
	MATCH SIMPLE
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT ;

ALTER TABLE inv_articulo ADD COLUMN ide_incate integer; 	  -- % Categoria

ALTER TABLE public.inv_articulo
	ADD CONSTRAINT inv_categoria_articulo_fkey
	FOREIGN KEY(ide_incate)
	REFERENCES public.inv_categoria(ide_incate)
	MATCH SIMPLE
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT ;

INSERT INTO "public"."inv_categoria"("ide_incate", "nombre_incate", "activo_incate", "ide_empr", "ide_sucu")
VALUES(1, 'MATERIA PRIMA', true, 0, 0);
INSERT INTO "public"."inv_categoria"("ide_incate", "nombre_incate", "activo_incate", "ide_empr", "ide_sucu")
VALUES(2, 'FRAGANCIAS', true, 0, 0);
INSERT INTO "public"."inv_categoria"("ide_incate", "nombre_incate", "activo_incate", "ide_empr", "ide_sucu")
VALUES(3, 'SABORIZANTES', true, 0, 0);
INSERT INTO "public"."inv_categoria"("ide_incate", "nombre_incate", "activo_incate", "ide_empr", "ide_sucu")
VALUES(4, 'ENVASES', true, 0, 0);
INSERT INTO "public"."inv_categoria"("ide_incate", "nombre_incate", "activo_incate", "ide_empr", "ide_sucu")
VALUES(5, 'MATERIAL DE LABORATORIO', true, 0, 0);
INSERT INTO "public"."inv_categoria"("ide_incate", "nombre_incate", "activo_incate", "ide_empr", "ide_sucu")
VALUES(6, 'OTROS', true, 0, 0);

/**27-11-2023**/
ALTER TABLE gen_persona ADD COLUMN uuid UUID DEFAULT (uuid_generate_v4());
CREATE INDEX idx_uuid_persona ON gen_persona(uuid);


/**21/05/22024**/
CREATE INDEX idx_cxp_detall_factur_ide_cpcfa ON cxp_detall_factur (ide_cpcfa);
CREATE INDEX idx_cxp_detall_factur_ide_inarti ON cxp_detall_factur (ide_inarti);
CREATE INDEX idx_cxp_cabece_factur_ide_cpcfa ON cxp_cabece_factur (ide_cpcfa);
CREATE INDEX idx_cxp_cabece_factur_fecha_emisi_cpcfa ON cxp_cabece_factur (fecha_emisi_cpcfa);
CREATE INDEX idx_cxp_cabece_factur_ide_cpefa ON cxp_cabece_factur (ide_cpefa);

CREATE INDEX idx_inv_det_comp_inve_ide_inarti ON inv_det_comp_inve (ide_inarti);
CREATE INDEX idx_inv_cab_comp_inve_ide_inepi ON inv_cab_comp_inve (ide_inepi);
CREATE INDEX idx_inv_cab_comp_inve_ide_incci ON inv_cab_comp_inve (ide_incci);
CREATE INDEX idx_inv_tip_tran_inve_ide_intti ON inv_tip_tran_inve (ide_intti);

CREATE INDEX idx_cxc_cabece_factura_fecha_emisi_cccfa ON cxc_cabece_factura (fecha_emisi_cccfa);
CREATE INDEX idx_cxc_cabece_factura_ide_ccefa ON cxc_cabece_factura (ide_ccefa);
CREATE INDEX idx_cxc_deta_factura_ide_cccfa ON cxc_deta_factura (ide_cccfa);
CREATE INDEX idx_cxc_deta_factura_ide_inarti ON cxc_deta_factura (ide_inarti);

CREATE INDEX idx_gen_mes_ide_gemes ON gen_mes (ide_gemes);

ALTER TABLE inv_doc_producto ADD COLUMN uuid UUID DEFAULT (uuid_generate_v4());
CREATE INDEX idx_uuid_inv_doc_producto ON inv_doc_producto(uuid);


CREATE TABLE "public"."sis_archivo" (
    "ide_arch" int4,
    "nombre_arch" varchar(200),
    "nombre2_arch" varchar(80),
    "url_arch" varchar(200),
    "carpeta_arch" bool,
    "peso_arch" int4,
    "ide_empr" int2,
    "ide_sucu" int2,
    "usuario_ingre" varchar(50),
    "fecha_ingre" date,
    "hora_ingre" time,
    "usuario_actua" varchar(50),
    "fecha_actua" date,
    "hora_actua" time,
    "sis_ide_arch" int4,
    "public_arch" bool,
    "favorita_arch" bool,
    "descargable_arch" bool,
    "comentario_arch" bool,
    "type_arch" varchar(150),
	"extension_arch" varchar(50),
	"descargas_arch" int4,
	"ide_inarti" int4,
    CONSTRAINT pk_sis_archivo PRIMARY KEY(ide_arch)
);
ALTER TABLE public.sis_archivo
	ADD CONSTRAINT sis_archivo_ide_sucu_fkey
	FOREIGN KEY(ide_sucu)
	REFERENCES public.sis_sucursal(ide_sucu)
	MATCH SIMPLE
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT ;
ALTER TABLE public.sis_archivo
	ADD CONSTRAINT sis_archivo_ide_empr_fkey
	FOREIGN KEY(ide_empr)
	REFERENCES public.sis_empresa(ide_empr)
	MATCH SIMPLE
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT ;	
ALTER TABLE public.sis_archivo
	ADD CONSTRAINT sis_archivo_ide_arch_sis_fkey
	FOREIGN KEY(sis_ide_arch)
	REFERENCES public.sis_archivo(ide_arch)
	MATCH SIMPLE
	ON DELETE CASCADE 
	ON UPDATE CASCADE ;
ALTER TABLE sis_archivo ADD COLUMN uuid UUID DEFAULT (uuid_generate_v4());
CREATE INDEX idx_uuid_sis_archivo ON sis_archivo(uuid);

ALTER TABLE public.sis_archivo
	ADD CONSTRAINT sis_archivo_ide_inarti_fkey
	FOREIGN KEY(ide_inarti)
	REFERENCES public.inv_articulo(ide_inarti)
	MATCH SIMPLE
	ON DELETE CASCADE 
	ON UPDATE CASCADE ;


/**29/05/22024**/
ALTER TABLE gen_persona ADD COLUMN activo_geper BOOLEAN;
UPDATE gen_persona SET  activo_geper = true;


CREATE INDEX idx_gen_persona_cliente_identificacion_nivel
ON gen_persona (es_cliente_geper, identificac_geper, nivel_geper);
CREATE INDEX idx_gen_persona_ide_cndfp
ON gen_persona (ide_cndfp);
CREATE INDEX idx_gen_persona_ide_vgven
ON gen_persona (ide_vgven);
CREATE INDEX idx_con_deta_forma_pago_ide_cndfp
ON con_deta_forma_pago (ide_cndfp);
CREATE INDEX idx_ven_vendedor_ide_vgven
ON ven_vendedor (ide_vgven);
CREATE INDEX idx_cxc_detall_transa_ide_ccctr_ide_ccttr
ON cxc_detall_transa (ide_ccctr, ide_ccttr);
CREATE INDEX idx_cxc_cabece_transa_ide_ccctr
ON cxc_cabece_transa (ide_ccctr);
CREATE INDEX idx_cxc_tipo_transacc_ide_ccttr
ON cxc_tipo_transacc (ide_ccttr);

CREATE INDEX idx_sis_auditoria_acceso_optimized ON sis_auditoria_acceso (ide_usua, ide_acau, fin_auac);
CREATE INDEX idx_sis_auditoria_acceso_ide_acau_fin_auac ON sis_auditoria_acceso(ide_acau, fin_auac);
CREATE INDEX idx_sis_usuario_ide_usua ON sis_usuario(ide_usua);
CREATE INDEX idx_sis_usuario_clave_ide_usua ON sis_usuario_clave(ide_usua);
CREATE INDEX idx_sis_usuario_sucursal_ide_usua ON sis_usuario_sucursal(ide_usua);
CREATE INDEX idx_sis_auditoria_acceso_ide_usua ON sis_auditoria_acceso(ide_usua);
CREATE INDEX idx_sis_usuario_ide_perf ON sis_usuario(ide_perf);
CREATE INDEX idx_sis_perfil_ide_perf ON sis_perfil(ide_perf);

-- 1 June 2024 10:14:46 AM
ALTER TABLE "public"."inv_unidad"
ADD COLUMN "siglas_inuni" varchar(4);
UPDATE "public"."inv_unidad" SET "siglas_inuni" = 'UNI' WHERE "ide_inuni" = 0;
UPDATE "public"."inv_unidad" SET "siglas_inuni" = 'LIB' WHERE "ide_inuni" = 8;
UPDATE "public"."inv_unidad" SET "siglas_inuni" = 'FRA' WHERE "ide_inuni" = 7;
UPDATE "public"."inv_unidad" SET "siglas_inuni" = 'LT' WHERE "ide_inuni" = 6;
UPDATE "public"."inv_unidad" SET "siglas_inuni" = 'KG' WHERE "ide_inuni" = 5;
UPDATE "public"."inv_unidad" SET "siglas_inuni" = 'FUN' WHERE "ide_inuni" = 4;
UPDATE "public"."inv_unidad" SET "siglas_inuni" = 'CAJ' WHERE "ide_inuni" = 1;
UPDATE "public"."inv_unidad" SET "siglas_inuni" = 'GAL' WHERE "ide_inuni" = 2;


CREATE INDEX idx_ide_geper_cab_transa ON cxc_cabece_transa (ide_geper);
CREATE INDEX idx_fecha_trans_ccdtr ON cxc_detall_transa (fecha_trans_ccdtr);
CREATE INDEX idx_ide_sucu ON cxc_detall_transa (ide_sucu);
CREATE INDEX idx_ide_ccctr ON cxc_cabece_transa (ide_ccctr);
CREATE INDEX idx_ide_ccttr ON cxc_tipo_transacc (ide_ccttr);
CREATE INDEX idx_ide_usua ON sis_usuario (ide_usua);

-- Índice compuesto en la tabla cxc_cabece_factura
CREATE INDEX idx_facturas_fecha_geper_ccefa ON cxc_cabece_factura (fecha_emisi_cccfa, ide_geper, ide_ccefa);

-- Índice adicional en las columnas ide_geper y ide_ccefa (opcional)
CREATE INDEX idx_facturas_geper_ccefa ON cxc_cabece_factura (ide_geper, ide_ccefa);

-- Índice en la columna fecha_emisi_cccfa (opcional si el índice compuesto no se puede usar)
CREATE INDEX idx_facturas_fecha ON cxc_cabece_factura (fecha_emisi_cccfa);

-- 07 June 2024 10:14:46 AM
CREATE TABLE "public"."sis_calendario" (
    "ide_cale" int4,
    "titulo_cale" text NOT NULL,
    "descripcion_cale" text,
    "fecha_inicio_cale" timestamp,
    "fecha_fin_cale" timestamp,
    "todo_el_dia_cale" bool,
    "color_cale" varchar(50),
    "ide_usua" int4,
    "usuario_ingre" varchar(50),
    "fecha_ingre" date,
    "hora_ingre" time,
    "usuario_actua" varchar(50),
    "fecha_actua" date,
    "hora_actua" time,
    "ide_geper" int4,
    "ide_inarti" int4,
    "publico_cale" bool,
	"notificar_cale" bool,
	"ide_empr" int2,
	"ide_sucu" int2,
	CONSTRAINT pk_sis_calendario PRIMARY KEY(ide_cale)
);
ALTER TABLE public.sis_calendario
	ADD CONSTRAINT sis_calendario_ide_usua_fkey
	FOREIGN KEY(ide_usua)
	REFERENCES public.sis_usuario(ide_usua)
	MATCH SIMPLE
	ON DELETE CASCADE 
	ON UPDATE CASCADE ;
ALTER TABLE public.sis_calendario
	ADD CONSTRAINT sis_calendario_ide_inarti_fkey
	FOREIGN KEY(ide_inarti)
	REFERENCES public.inv_articulo(ide_inarti)
	MATCH SIMPLE
	ON DELETE CASCADE 
	ON UPDATE CASCADE ;
ALTER TABLE public.sis_calendario
	ADD CONSTRAINT sis_calendario_ide_geper_fkey
	FOREIGN KEY(ide_geper)
	REFERENCES public.gen_persona(ide_geper)
	MATCH SIMPLE
	ON DELETE CASCADE 
	ON UPDATE CASCADE ;
ALTER TABLE sis_calendario ADD COLUMN uuid UUID DEFAULT (uuid_generate_v4());
CREATE INDEX idx_uuid_sis_calendario ON sis_calendario(uuid);

-- 12 June 2024 16:34:46 PM
CREATE TABLE "public"."sis_sistema" (
    "ide_sist" int4,
    "nombre_sist" varchar(60),
    "descripcion_sist" text,
    "nombre_corto_sist" varchar(30),
    "icono_sist" varchar(250),
    "activo_sist" bool,
	CONSTRAINT pk_sis_sistema PRIMARY KEY(ide_sist)
);
ALTER TABLE "public"."sis_opcion" ADD COLUMN "ide_sist" int4;
ALTER TABLE "public"."sis_opcion" ADD COLUMN "refe_opci" varchar(60);
ALTER TABLE "public"."sis_opcion" ADD COLUMN "activo_opci" bool;

ALTER TABLE public.sis_opcion
	ADD CONSTRAINT sis_opcion_ide_sist_fkey
	FOREIGN KEY(ide_sist)
	REFERENCES public.sis_sistema(ide_sist)
	MATCH SIMPLE
	ON DELETE CASCADE 
	ON UPDATE CASCADE ;

INSERT INTO "public"."sis_sistema" ("ide_sist", "nombre_sist", "nombre_corto_sist", "activo_sist") VALUES
(1, 'Sistema de Gestión Administrativa y Financiera', 'SIGAFI', 'true');
INSERT INTO "public"."sis_sistema" ("ide_sist", "nombre_sist", "nombre_corto_sist", "activo_sist") VALUES
(2, 'Erp', 'Arkei Cloud ERP', 'TRUE');
-- actualiza las opciones al sistema 1
update sis_opcion set ide_sist = 1, activo_opci = true;


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

-- 07 July 2024 10:14:46 AM  ******************************BORRAR
CREATE TABLE cha_mensajes (
    uuid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	from_chmen VARCHAR(50),
    to_chmen VARCHAR(50),
    body_chmen TEXT,
	created_at_chmen TIMESTAMP NOT NULL DEFAULT NOW(),
    content_type_chmen VARCHAR(50) NOT NULL,
	status_chmen VARCHAR(20) DEFAULT 'unread',  -- 'read' o 'pending'
	attachment_url_chmen TEXT,
    attachment_type_chmen VARCHAR(20),
    direction_chmen VARCHAR(10) -- 'inbound' o 'outbound'
);

-- 02 Ago 2024
ALTER TABLE "public"."sis_perfil" ADD COLUMN "ide_sist" int4;

ALTER TABLE public.sis_perfil
	ADD CONSTRAINT sis_perfil_ide_sist_fkey
	FOREIGN KEY(ide_sist)
	REFERENCES public.sis_sistema(ide_sist)
	MATCH SIMPLE
	ON DELETE CASCADE 
	ON UPDATE CASCADE;
-- actualiza las opciones al sistema 1
update sis_perfil set ide_sist = 1;

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

-- 24 Ago 2024
ALTER TABLE "public"."inv_articulo"
ADD COLUMN "url_inarti" varchar(200),
ADD COLUMN "se_vende_inarti" bool,
ADD COLUMN "se_compra_inarti" bool,
ADD COLUMN "ide_inbod" int4,
ADD COLUMN "cod_barras_inarti" varchar(50);

ALTER TABLE public.inv_articulo
	ADD CONSTRAINT inv_articulo_ide_inbod_fkey
	FOREIGN KEY(ide_inbod)
	REFERENCES public.inv_bodega(ide_inbod)
	MATCH SIMPLE
	ON DELETE CASCADE 
	ON UPDATE CASCADE ;


update inv_articulo set se_vende_inarti = true, se_compra_inarti = true,  ide_inbod = 2,
url_inarti= 'https://produquimic.com.ec/product';



ALTER TABLE inv_bodega ADD COLUMN usuario_ingre varchar(50); 
ALTER TABLE inv_bodega ADD COLUMN hora_ingre TIMESTAMP;
ALTER TABLE inv_bodega ADD COLUMN usuario_actua varchar(50); 
ALTER TABLE inv_bodega ADD COLUMN hora_actua TIMESTAMP;

ALTER TABLE inv_bodega ADD COLUMN ide_geprov int4;
ALTER TABLE inv_bodega ADD COLUMN ide_gecant int4;
ALTER TABLE inv_bodega ADD COLUMN activo_inbod bool;

update inv_bodega set  activo_inbod = true

ALTER TABLE public.inv_bodega
	ADD CONSTRAINT inv_bodega_ide_geprov_fkey
	FOREIGN KEY(ide_geprov)
	REFERENCES public.gen_provincia(ide_geprov)
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT;

ALTER TABLE public.inv_bodega
	ADD CONSTRAINT inv_bodega_ide_gecant_fkey
	FOREIGN KEY(ide_gecant)
	REFERENCES public.gen_canton(ide_gecant)
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT;

CREATE INDEX idx_inv_cab_comp_inve_filter
ON inv_cab_comp_inve (ide_inepi, fecha_trans_incci, ide_empr);

CREATE INDEX idx_inv_articulo_hace_kardex
ON inv_articulo (hace_kardex_inarti);

CREATE INDEX idx_inv_cab_comp_inve_order
ON inv_cab_comp_inve (fecha_trans_incci, ide_incci);

ALTER TABLE inv_cab_comp_inve ADD COLUMN automatico_incci bool;
update inv_cab_comp_inve set automatico_incci=false;

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

ALTER TABLE inv_articulo ADD COLUMN notas_inarti TEXT;

ALTER TABLE inv_articulo_carac DROP COLUMN ide_inare;

CREATE INDEX idx_inv_marca_ide_inmar ON inv_marca(ide_inmar);
CREATE INDEX idx_inv_unidad_ide_inuni ON inv_unidad(ide_inuni);
CREATE INDEX idx_inv_tipo_producto_ide_intpr ON inv_tipo_producto(ide_intpr);
CREATE INDEX idx_inv_categoria_ide_incate ON inv_categoria(ide_incate);
CREATE INDEX idx_inv_bodega_ide_inbod ON inv_bodega(ide_inbod);
CREATE INDEX idx_inv_fabricante_ide_infab ON inv_fabricante(ide_infab);

CREATE INDEX idx_inv_conversion_unidad_ide_inuni ON inv_conversion_unidad(ide_inuni);
CREATE INDEX idx_inv_conversion_unidad_inv_ide_inuni ON inv_conversion_unidad(inv_ide_inuni);
CREATE INDEX idx_inv_articulo_uuid ON inv_articulo(uuid);

// 25 Sep 2024

ALTER TABLE inv_articulo ADD COLUMN otro_nombre_inarti varchar(200);   -- Otros nombres del producto     --contador de vistas 
ALTER TABLE inv_articulo DROP COLUMN por_util1_inarti; 
ALTER TABLE inv_articulo DROP COLUMN por_util2_inarti;  

ALTER TABLE inv_articulo ADD COLUMN total_vistas_inarti int;
ALTER TABLE inv_articulo ADD COLUMN fotos_inarti JSONB;  
ALTER TABLE inv_articulo ADD COLUMN ratings_inaerti JSON;   
ALTER TABLE inv_articulo ADD COLUMN total_ratings_inarti decimal(12,2);
ALTER TABLE inv_articulo ADD COLUMN publicado_inarti boolean; 
ALTER TABLE inv_articulo ADD COLUMN desc_corta_inarti varchar(500); 

update inv_articulo set publicado_inarti = false, total_vistas_inarti =0, total_ratings_inarti= 0;
CREATE EXTENSION IF NOT EXISTS unaccent;


CREATE INDEX idx_cdf_ide_inarti ON cxc_deta_factura (ide_inarti);
CREATE INDEX idx_cf_ide_ccefa ON cxc_cabece_factura (ide_ccefa);
CREATE INDEX idx_cdp_ide_inarti ON cxp_detall_factur (ide_inarti);
CREATE INDEX idx_cp_ide_cpefa ON cxp_cabece_factur (ide_cpefa);

CREATE INDEX idx_immutable_unaccent_replace_nombre_inarti
ON inv_articulo (immutable_unaccent_replace(nombre_inarti));

CREATE INDEX idx_immutable_unaccent_replace_otro_nombre_inarti
ON inv_articulo (immutable_unaccent_replace(otro_nombre_inarti));


// 17 Oct 2024
// Horarios login

CREATE TABLE sis_tipo_horario (
    ide_tihor int PRIMARY KEY ,
	nombre_tihor  VARCHAR(80),
    activo_tihor bool,
	ide_empr     	int NULL,
	ide_sucu     	int NULL,
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP

   );
ALTER TABLE public.sis_tipo_horario
	ADD CONSTRAINT sis_tipo_horario_ide_sucu_fkey
	FOREIGN KEY(ide_sucu)
	REFERENCES public.sis_sucursal(ide_sucu)
	MATCH SIMPLE
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT ;
ALTER TABLE public.sis_tipo_horario
	ADD CONSTRAINT sis_tipo_horario_ide_empr_fkey
	FOREIGN KEY(ide_empr)
	REFERENCES public.sis_empresa(ide_empr)
	MATCH SIMPLE
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT ;
INSERT INTO "public"."sis_tipo_horario" ("ide_tihor", "nombre_tihor", "activo_tihor", "ide_empr", "ide_sucu") VALUES
(1, 'HORARIO ADMIN', 't', 0, 2);

CREATE TABLE sis_horario (
    ide_hora int PRIMARY KEY ,
	ide_tihor int ,
	dia_hora  int,
	hora_inicio_hora time,
	hora_fin_hora time,
    activo_hora bool,
	ide_empr     	int NULL,
	ide_sucu     	int NULL,
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP

   );
ALTER TABLE public.sis_horario
	ADD CONSTRAINT sis_horario_ide_tihor_fkey
	FOREIGN KEY(ide_tihor)
	REFERENCES public.sis_tipo_horario(ide_tihor)
	MATCH SIMPLE
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT ;
ALTER TABLE public.sis_horario
	ADD CONSTRAINT sis_horario_ide_sucu_fkey
	FOREIGN KEY(ide_sucu)
	REFERENCES public.sis_sucursal(ide_sucu)
	MATCH SIMPLE
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT ;
ALTER TABLE public.sis_horario
	ADD CONSTRAINT sis_horario_ide_empr_fkey
	FOREIGN KEY(ide_empr)
	REFERENCES public.sis_empresa(ide_empr)
	MATCH SIMPLE
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT ;

INSERT INTO "public"."sis_horario" ("ide_hora", "ide_tihor", "dia_hora", "hora_inicio_hora", "hora_fin_hora", "activo_hora", "ide_empr", "ide_sucu") VALUES (1, 1, 1, '00:00:00', '23:59:59', 't', 0,2);
INSERT INTO "public"."sis_horario" ("ide_hora", "ide_tihor", "dia_hora", "hora_inicio_hora", "hora_fin_hora", "activo_hora", "ide_empr", "ide_sucu") VALUES (2, 1, 2, '00:00:00', '23:59:59', 't', 0,2);
INSERT INTO "public"."sis_horario" ("ide_hora", "ide_tihor", "dia_hora", "hora_inicio_hora", "hora_fin_hora", "activo_hora", "ide_empr", "ide_sucu") VALUES (3, 1, 3, '00:00:00', '23:59:59', 't', 0,2);
INSERT INTO "public"."sis_horario" ("ide_hora", "ide_tihor", "dia_hora", "hora_inicio_hora", "hora_fin_hora", "activo_hora", "ide_empr", "ide_sucu") VALUES (4, 1, 4, '00:00:00', '23:59:59', 't', 0,2);
INSERT INTO "public"."sis_horario" ("ide_hora", "ide_tihor", "dia_hora", "hora_inicio_hora", "hora_fin_hora", "activo_hora", "ide_empr", "ide_sucu") VALUES (5, 1, 5, '00:00:00', '23:59:59', 't', 0,2);
INSERT INTO "public"."sis_horario" ("ide_hora", "ide_tihor", "dia_hora", "hora_inicio_hora", "hora_fin_hora", "activo_hora", "ide_empr", "ide_sucu") VALUES (6, 1, 6, '00:00:00', '23:59:59', 't', 0,2);
INSERT INTO "public"."sis_horario" ("ide_hora", "ide_tihor", "dia_hora", "hora_inicio_hora", "hora_fin_hora", "activo_hora", "ide_empr", "ide_sucu") VALUES (7, 1, 7, '00:00:00', '23:59:59', 't', 0,2);

CREATE TABLE sis_usuario_perfil (
	ide_usper int PRIMARY KEY ,
	ide_usua  int,
    ide_perf  int,
	ide_tihor int,
	extra_util_usper bool DEFAULT false,
	activo_usper bool,
	ide_empr     	int NULL,
	ide_sucu     	int NULL,
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
   );
ALTER TABLE public.sis_usuario_perfil
	ADD CONSTRAINT sis_usuario_perfil_ide_usua_fkey
	FOREIGN KEY(ide_usua)
	REFERENCES public.sis_usuario(ide_usua)
	MATCH SIMPLE
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT ;
ALTER TABLE public.sis_usuario_perfil
	ADD CONSTRAINT sis_usuario_perfil_ide_perf_fkey
	FOREIGN KEY(ide_perf)
	REFERENCES public.sis_perfil(ide_perf)
	MATCH SIMPLE
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT ;
ALTER TABLE public.sis_usuario_perfil
	ADD CONSTRAINT sis_usuario_perfil_ide_tihor_fkey
	FOREIGN KEY(ide_tihor)
	REFERENCES public.sis_tipo_horario(ide_tihor)
	MATCH SIMPLE
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT ;
ALTER TABLE public.sis_usuario_perfil
	ADD CONSTRAINT sis_usuario_perfil_ide_sucu_fkey
	FOREIGN KEY(ide_sucu)
	REFERENCES public.sis_sucursal(ide_sucu)
	MATCH SIMPLE
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT ;
ALTER TABLE public.sis_usuario_perfil
	ADD CONSTRAINT sis_usuario_perfil_ide_empr_fkey
	FOREIGN KEY(ide_empr)
	REFERENCES public.sis_empresa(ide_empr)
	MATCH SIMPLE
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT ;

--ROLES ADMIN
INSERT INTO "public"."sis_usuario_perfil" ("ide_usper", "ide_usua", "ide_perf", "ide_tihor", "activo_usper", "ide_empr", "ide_sucu") VALUES (1, 0, 0, 1, 't', 0, 2);
INSERT INTO "public"."sis_usuario_perfil" ("ide_usper", "ide_usua", "ide_perf", "ide_tihor", "activo_usper", "ide_empr", "ide_sucu") VALUES (2, 11, 0, 1, 't', 0, 2);

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


CREATE INDEX IF NOT EXISTS idx_cxp_cabece_factur_fecha_estado ON cxp_cabece_factur(ide_cpefa, fecha_emisi_cpcfa, ide_empr);
CREATE INDEX IF NOT EXISTS idx_cxc_deta_factura_inarti_ccdfa ON cxc_deta_factura(ide_cccfa, ide_inarti);
CREATE INDEX IF NOT EXISTS idx_cxc_deta_factura_precio ON cxc_deta_factura(precio_ccdfa, total_ccdfa);
CREATE INDEX IF NOT EXISTS idx_cxc_cabece_factura_geper_fecha_estado ON cxc_cabece_factura(ide_geper, ide_ccefa, fecha_emisi_cccfa, ide_empr);
CREATE INDEX IF NOT EXISTS idx_inv_articulo_inarti ON inv_articulo(ide_inarti, uuid);
CREATE INDEX IF NOT EXISTS idx_inv_unidad_inuni ON inv_unidad(ide_inuni);


-- 04-02-2025


-- cuenta API WhatsApp
CREATE TABLE wha_cuenta (
	ide_whcue INT primary KEY ,
	nombre_whcue varchar(100),
	id_telefono_whcue varchar(20),
	id_aplicacion_whcue varchar(100),
	id_cuenta_whcue varchar(50),
	id_token_whcue varchar(200),
	activo_whcue bool,
	envia_msg_bienv_whcue bool,
	msg_bienv_whcue TEXT,
	ide_empr INT REFERENCES sis_empresa(ide_empr) ON DELETE CASCADE,  
	ide_sucu INT REFERENCES sis_sucursal(ide_sucu) ON DELETE CASCADE,  
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
);
 --- Agentes que tienen acceso a whatsaap 
  
CREATE TABLE wha_cuenta_agente (
	ide_whcuag INT primary KEY ,
	ide_whcue INT REFERENCES wha_cuenta(ide_whcue) ON DELETE CASCADE,  
	ide_usua INT REFERENCES sis_usuario(ide_usua) ON DELETE CASCADE,  
	activo_whcuag bool,
	ide_empr INT REFERENCES sis_empresa(ide_empr) ON DELETE CASCADE,  
	ide_sucu INT REFERENCES sis_sucursal(ide_sucu) ON DELETE CASCADE,  
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
);
ALTER TABLE wha_cuenta_agente ADD CONSTRAINT wha_cuenta_agente_unique UNIQUE (ide_whcue,ide_usua);

CREATE INDEX idx_wha_chat_phone_number_id_whcha ON wha_chat(phone_number_id_whcha);
CREATE INDEX idx_wha_cuenta_ide_empr ON wha_cuenta(ide_empr);
CREATE INDEX idx_wha_cuenta_agente_ide_usua ON wha_cuenta_agente(ide_usua);
CREATE INDEX idx_wha_cuenta_agente_ide_whcue ON wha_cuenta_agente(ide_whcue);
CREATE INDEX idx_wha_cuenta_ide_empr_id_cuenta_whcue ON wha_cuenta(ide_empr, id_cuenta_whcue);

-- API
CREATE TABLE wha_etiqueta(
	ide_wheti int PRIMARY KEY,
	nombre_wheti varchar(80),
	color_wheti varchar(30),
	descripcion_wheti text,
	activo_wheti bool DEFAULT true,
	ide_empr INT REFERENCES sis_empresa(ide_empr) ON DELETE CASCADE,  
	ide_sucu INT REFERENCES sis_sucursal(ide_sucu) ON DELETE CASCADE,  
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
);
CREATE INDEX idx_wlc_ide_wheti ON wha_etiqueta (ide_wheti);

-- API
CREATE TABLE wha_lista (
	ide_whlis SERIAL PRIMARY KEY,,
	nombre_whlis varchar(80),
	icono_whlis varchar(50),
	color_whlis varchar(30),
	descripcion_whlis text,
	activo_whlis bool DEFAULT true,
	ide_empr INT REFERENCES sis_empresa(ide_empr) ON DELETE CASCADE,  
	ide_sucu INT REFERENCES sis_sucursal(ide_sucu) ON DELETE CASCADE,  
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
);
-- API
CREATE TABLE wha_chat (
	ide_whcha SERIAL PRIMARY KEY,   -- secuencial de chats
	fecha_crea_whcha TIMESTAMP DEFAULT CURRENT_TIMESTAMP, --fecha crea chat
	fecha_msg_whcha TIMESTAMP,  --fecha último mensaje
	nombre_whcha varchar(80),
	name_whcha varchar(80),   				--- name API
	wa_id_whcha varchar(20),  				--- wa_id API ---telefono
	id_whcha varchar(80),  				    ---  id ultimo mensaje
	phone_number_id_whcha  varchar(20),  	-- phone_number_id API
	phone_number_whcha varchar(20),  		-- display_phone_number API
	leido_whcha bool DEFAULT false,
	eliminado_whcha bool DEFAULT false,
	favorito_whcha bool DEFAULT false,
	notas_whcha TEXT,
	no_leidos_whcha  INT DEFAULT 0,
	ide_geper INT REFERENCES gen_persona(ide_geper) ON DELETE SET NULL,    -- Asocia a una persona
	ide_wheti INT REFERENCES wha_etiqueta(ide_wheti) ON DELETE CASCADE,   -- Asocia a etiqueta 
	ide_vgven INT,  -- Asocia a un vendedor
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
);
ALTER TABLE wha_chat ADD CONSTRAINT wha_chat_ide_whcha_unique UNIQUE (ide_whcha);
ALTER TABLE wha_chat ADD CONSTRAINT wha_chat_wa_id_unique UNIQUE (wa_id_whcha);

CREATE INDEX IF NOT EXISTS idx_wha_chat_wa_id_whcha ON wha_chat(wa_id_whcha);
CREATE INDEX IF NOT EXISTS idx_wha_chat_favorito_whcha ON wha_chat(favorito_whcha);
CREATE INDEX IF NOT EXISTS idx_wha_chat_leido_whcha ON wha_chat(leido_whcha);

--- Asociar listas de Chats   API
CREATE TABLE wha_lista_chat (
	ide_whlic  SERIAL primary KEY ,
	ide_whlis INT REFERENCES wha_lista(ide_whlis) ON DELETE CASCADE,   -- Asocia a lista 
	wa_id_whlic varchar(20),   -- Asocia a chats   --TELEFONO
	ide_empr INT REFERENCES sis_empresa(ide_empr) ON DELETE CASCADE,  
	ide_sucu INT REFERENCES sis_sucursal(ide_sucu) ON DELETE CASCADE,  
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
);
  
CREATE INDEX idx_wlc_ide_whlis ON wha_lista_chat (ide_whlis);
CREATE INDEX idx_wla_ide_whlis ON wha_lista (ide_whlis);
CREATE INDEX idx_wlc_wa_id_whlic ON wha_lista_chat (wa_id_whlic);
CREATE INDEX idx_wch_wa_id_whcha ON wha_chat (wa_id_whcha);
CREATE UNIQUE INDEX idx_unique_ide_whlis_wa_id_whlic ON wha_lista_chat (ide_whlis, wa_id_whlic);


CREATE TABLE wha_mensaje (
    uuid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	ide_whmem SERIAL,
	ide_whcha INT8,   -- Chat
    phone_number_id_whmem  varchar(20),  	-- phone_number_id API
	phone_number_whmem varchar(20),  		-- display_phone_number API
	id_whmem  VARCHAR(80),         -- id
    wa_id_whmem VARCHAR(20),                -- wa_id   telefono 
	wa_id_context_whmem  VARCHAR(80),       -- context wa_id
    body_whmem TEXT,                        -- mensaje
    fecha_whmem TIMESTAMP NOT NULL,         -- timestamp
    content_type_whmem  VARCHAR(80) NOT NULL,
    leido_whmem  bool DEFAULT false,       -- 'read' o 'pending'
	caption_whmem  TEXT,
	attachment_id_whmem   VARCHAR(100),
    attachment_type_whmem  VARCHAR(150),
	attachment_name_whmem   VARCHAR(250),
	attachment_url_whmem   VARCHAR(200),
	attachment_size_whmem  int8,
    direction_whmem  CHAR(1), -- 0 = recibidos, 1 = enviados
	status_whmem    VARCHAR(10) ,  -- 'sent', 'delivered' , 'read'
	timestamp_sent_whmem TIMESTAMP ,  
	timestamp_read_whmem TIMESTAMP ,  
	timestamp_whmem VARCHAR(20),
	error_whmem VARCHAR(500),
	code_error_whmem VARCHAR(250),
	tipo_whmem VARCHAR(3),       -- API, WEB
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
);
ALTER TABLE public.wha_mensaje
ADD CONSTRAINT wha_mensaje_ide_whcha_fkey
FOREIGN KEY (ide_whcha)
REFERENCES public.wha_chat (ide_whcha)
ON DELETE RESTRICT 
ON UPDATE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_wha_mensaje_ide_whcha ON wha_mensaje(ide_whcha);
CREATE INDEX IF NOT EXISTS idx_wha_mensaje_wa_id_whmem ON wha_mensaje(wa_id_whmem);
CREATE INDEX IF NOT EXISTS idx_wha_mensaje_attachment_id_whmem ON wha_mensaje(attachment_id_whmem);
CREATE INDEX idx_wha_mensaje_phone_attachment ON wha_mensaje (phone_number_id_whmem, attachment_id_whmem);

-- Índice para acelerar la búsqueda 
CREATE INDEX idx_wha_chat_phone_number_id ON wha_chat(phone_number_id_whcha);
CREATE INDEX idx_wha_mensaje_id_whmem ON wha_mensaje(id_whmem);
CREATE INDEX idx_wha_chat_id_whcha ON wha_chat(id_whcha);
CREATE INDEX idx_wha_chat_fecha_msg ON wha_chat(phone_number_id_whcha, fecha_msg_whcha DESC);

CREATE INDEX idx_wha_mensaje_phone_wa_fecha 
ON wha_mensaje(phone_number_id_whmem, wa_id_whmem, fecha_whmem DESC);
CREATE INDEX idx_wha_mensaje_phone ON wha_mensaje(phone_number_id_whmem);
CREATE INDEX idx_wha_mensaje_wa_id ON wha_mensaje(wa_id_whmem);

CREATE EXTENSION pgcrypto;
SELECT * FROM pg_extension WHERE extname = 'pgcrypto';

SET TIME ZONE 'America/Guayaquil';



-- 15052025 Campaña de mensajes
CREATE TABLE wha_tipo_camp_envio (
	ide_whtice INT primary KEY ,
	nombre_whtice VARCHAR(150) NOT NULL,
	color_whtice VARCHAR(50) NOT NULL,
	icono_whtice VARCHAR(50) NOT NULL,
	descripcion_whtice text,	
	activo_whtice bool DEFAULT true, 
	ide_empr INT REFERENCES sis_empresa(ide_empr) ON DELETE SET NULL,  
	ide_sucu INT REFERENCES sis_sucursal(ide_sucu) ON DELETE SET NULL,  
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
);
ALTER TABLE wha_tipo_camp_envio ADD CONSTRAINT wha_tipo_camp_envio_unique UNIQUE (nombre_whtice);


CREATE TABLE wha_cab_camp_envio (
	ide_whcenv INT primary KEY ,
	ide_whtice INT REFERENCES wha_tipo_camp_envio(ide_whtice) ON DELETE SET NULL,  --tipo campaña
	ide_whcue INT REFERENCES wha_cuenta(ide_whcue) ON DELETE SET NULL,  --cuenta whatsapp
	ide_usua INT REFERENCES sis_usuario(ide_usua) ON DELETE SET NULL,   
	nombre_whcenv VARCHAR(150) NOT NULL,
	descripcion_whcenv text,
	mensaje_whcenv TEXT NOT NULL,  
	media_whcenv VARCHAR(200),
	programado_whcenv boolean default false,
	hora_progra_whcenv  TIMESTAMP NOT NULL,
	status_auto_whcenv  VARCHAR(1) DEFAULT 'P' ,   -- P PENIENTE, E ENVIADA, A ANULADA
	activo_whcenv bool DEFAULT false, 
	ide_empr INT REFERENCES sis_empresa(ide_empr) ON DELETE SET NULL,  
	ide_sucu INT REFERENCES sis_sucursal(ide_sucu) ON DELETE SET NULL,  
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
);


CREATE TABLE wha_det_camp_envio (
	ide_whdenv INT primary KEY ,
	ide_whcenv INT REFERENCES wha_cab_camp_envio(ide_whcenv) ON DELETE CASCADE,  --cuenta whatsapp
	telefono_whden VARCHAR(20) NOT NULL,
	tiene_whats_whden bool DEFAULT false,    --- valida que el numero tenga whatsapp
	nombre_whden VARCHAR(200),  	
	fecha_envio_whden  TIMESTAMP NOT NULL,
	id_mensaje_whden VARCHAR(80), 
	ide_empr INT REFERENCES sis_empresa(ide_empr) ON DELETE CASCADE,  
	ide_sucu INT REFERENCES sis_sucursal(ide_sucu) ON DELETE CASCADE,  
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
);
ALTER TABLE wha_det_camp_envio ADD CONSTRAINT wha_det_camp_envio_unique UNIQUE (ide_whdenv,telefono_whden);
 
CREATE INDEX idx_wha_cuenta_empresa_activo ON wha_cuenta(ide_empr, activo_whcue);

CREATE INDEX idx_wha_cab_camp_envio_cuenta ON wha_cab_camp_envio(ide_whcue);
CREATE INDEX idx_wha_cab_camp_envio_tipo ON wha_cab_camp_envio(ide_whtice);
CREATE INDEX idx_wha_cab_camp_envio_usuario ON wha_cab_camp_envio(ide_usua);
CREATE INDEX idx_wha_det_camp_envio_cabecera ON wha_det_camp_envio(ide_whcenv);

CREATE INDEX idx_wha_det_camp_envio_mensaje ON wha_det_camp_envio(ide_whcenv, id_mensaje_whden);