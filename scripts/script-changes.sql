

ALTER TABLE sis_usuario ADD COLUMN uuid UUID DEFAULT (uuid_generate_v4());
CREATE INDEX idx_uuid_usuario ON sis_usuario(uuid);


ALTER TABLE sis_usuario_clave ALTER COLUMN "clave_uscl" SET DATA TYPE varchar(80);

UPDATE sis_usuario SET avatar_usua = 'avatar_default.jpg'

ALTER TABLE sis_opcion ADD COLUMN uuid UUID DEFAULT (uuid_generate_v4());

/**15/08/2023 Campos tabla articulo*/

ALTER TABLE inv_articulo ADD COLUMN uuid UUID DEFAULT (uuid_generate_v4());



/**18/09/2023 */
ALTER TABLE inv_articulo ADD COLUMN publicacion_inarti Text;
CREATE INDEX idx_uuid ON inv_articulo(uuid);
ALTER TABLE inv_articulo ADD COLUMN tags_inarti json;

ALTER TABLE inv_articulo ADD COLUMN cant_stock1_inarti decimal(12,3);     -- Cantidad minima stock
ALTER TABLE inv_articulo ADD COLUMN cant_stock2_inarti decimal(12,3);     -- Cantidad maxima stock
ALTER TABLE inv_articulo ADD COLUMN cod_auto_inarti varchar(10);--Codigo generado automaticamente



/**27-11-2023**/
ALTER TABLE gen_persona ADD COLUMN uuid UUID DEFAULT (uuid_generate_v4());
CREATE INDEX idx_uuid_persona ON gen_persona(uuid);


/**21/05/22024**/
ALTER TABLE inv_doc_producto ADD COLUMN uuid UUID DEFAULT (uuid_generate_v4());
CREATE INDEX idx_uuid_inv_doc_producto ON inv_doc_producto(uuid);



/**29/05/22024**/
ALTER TABLE gen_persona ADD COLUMN activo_geper BOOLEAN;
UPDATE gen_persona SET  activo_geper = true;



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
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP,
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



CREATE INDEX idx_inv_conversion_unidad_ide_inuni ON inv_conversion_unidad(ide_inuni);
CREATE INDEX idx_inv_conversion_unidad_inv_ide_inuni ON inv_conversion_unidad(inv_ide_inuni);
CREATE INDEX idx_inv_articulo_uuid ON inv_articulo(uuid);

// 25 Sep 2024

ALTER TABLE inv_articulo ADD COLUMN total_vistas_inarti int;
ALTER TABLE inv_articulo ADD COLUMN fotos_inarti JSONB;  
ALTER TABLE inv_articulo ADD COLUMN ratings_inaerti JSON;   
ALTER TABLE inv_articulo ADD COLUMN total_ratings_inarti decimal(12,2);
ALTER TABLE inv_articulo ADD COLUMN publicado_inarti boolean; 
ALTER TABLE inv_articulo ADD COLUMN desc_corta_inarti varchar(500); 

update inv_articulo set publicado_inarti = false, total_vistas_inarti =0, total_ratings_inarti= 0;


CREATE EXTENSION IF NOT EXISTS unaccent;
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

CREATE INDEX IF NOT EXISTS idx_inv_articulo_inarti ON inv_articulo(ide_inarti, uuid);

-- 04-02-2025


-- cuenta API WhatsApp
CREATE TABLE wha_cuenta (
	ide_whcue INT primary KEY ,
	nombre_whcue varchar(100),
	tipo_whcue varchar(5),
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
	ide_whlis SERIAL PRIMARY KEY,
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

CREATE TABLE wha_estado_camp_envio (
	ide_whesce INT primary KEY ,
	nombre_whesce VARCHAR(150) NOT NULL,
	color_whesce VARCHAR(50),
	icono_whesce VARCHAR(50),
	activo_whesce bool DEFAULT true, 
	ide_empr INT REFERENCES sis_empresa(ide_empr) ON DELETE SET NULL,  
	ide_sucu INT REFERENCES sis_sucursal(ide_sucu) ON DELETE SET NULL,  
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
);
INSERT INTO "public"."wha_estado_camp_envio" ("ide_whesce", "nombre_whesce","color_whesce") VALUES
(1, 'PENDIENTE', 'warning' );

INSERT INTO "public"."wha_estado_camp_envio" ("ide_whesce", "nombre_whesce","color_whesce") VALUES
(2, 'PROCESANDO', 'info');

INSERT INTO "public"."wha_estado_camp_envio" ("ide_whesce", "nombre_whesce","color_whesce") VALUES
(3, 'ENVIADA', 'success');
INSERT INTO "public"."wha_estado_camp_envio" ("ide_whesce", "nombre_whesce","color_whesce") VALUES
(4, 'ANULADA', 'error');



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
	ide_whesce  INT REFERENCES wha_estado_camp_envio(ide_whesce) ON DELETE SET NULL,  --estado
	ide_whcue INT REFERENCES wha_cuenta(ide_whcue) ON DELETE SET NULL,  --cuenta whatsapp
	ide_usua INT REFERENCES sis_usuario(ide_usua) ON DELETE SET NULL,   	
	ide_geper INT REFERENCES gen_persona(ide_geper) ON DELETE SET NULL,    -- Asocia a una persona
	descripcion_whcenv text,
	mensaje_whcenv TEXT NOT NULL,  
	media_whcenv VARCHAR(200),
	programado_whcenv boolean default false,
	hora_progra_whcenv  TIMESTAMP,
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
	observacion_whden VARCHAR(200),  	
	error_whden VARCHAR(200),  	
	fecha_envio_whden  TIMESTAMP,
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

CREATE INDEX IF NOT EXISTS idx_cxc_cabece_proforma_fecha_anulado ON cxc_cabece_proforma(fecha_cccpr, anulado_cccpr, ide_empr);
CREATE INDEX IF NOT EXISTS idx_cxc_deta_proforma_articulo ON cxc_deta_proforma(ide_cccpr, ide_inarti);
CREATE INDEX IF NOT EXISTS idx_cxc_cabece_factura_fecha_proforma ON cxc_cabece_factura(fecha_emisi_cccfa, ide_ccefa, num_proforma_cccfa);
CREATE INDEX IF NOT EXISTS idx_cxc_deta_factura_articulo ON cxc_deta_factura(ide_cccfa, ide_inarti);
CREATE INDEX IF NOT EXISTS idx_inv_articulo_unidad ON inv_articulo(ide_inarti, ide_inuni);


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
  
    

CREATE TABLE inv_conf_precios_articulo (
	ide_incpa INT primary KEY ,
	ide_inarti INT REFERENCES inv_articulo(ide_inarti) ON DELETE RESTRICT,  --articulo
	ide_cncfp INT REFERENCES con_cabece_forma_pago(ide_cncfp) ON DELETE RESTRICT,  --det forma de pago
	ide_cndfp INT REFERENCES con_deta_forma_pago(ide_cndfp) ON DELETE RESTRICT,  --det forma de pago
	rangos_incpa bool default false, -- si maneja rangos,
	rango1_cant_incpa decimal(12,3), -- en caso que maneje rangos es rango 1
	rango2_cant_incpa decimal(12,3),  -- en caso que maneje rangos es rango 2
	rango_infinito_incpa bool DEFAULT false,  -- en caso que quiera establecer rango infinito debe tener rango1
	precio_fijo_incpa  decimal(12,2),  --si establece precio fijo
	porcentaje_util_incpa decimal(12,2),  --para manejar porcentaje de utilidad, en este caso no se maneja precio fijo
	incluye_iva_incpa  bool default false, -- si el precio o utilidad ya contempla iva
	observacion_incpa VARCHAR(200),  --- observacion
	activo_incpa bool DEFAULT true, 
	autorizado_incpa bool DEFAULT false,   -- en caso que la configuracion este autorizada
	ide_empr INT REFERENCES sis_empresa(ide_empr) ON DELETE CASCADE,  
	ide_sucu INT REFERENCES sis_sucursal(ide_sucu) ON DELETE CASCADE,  
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
);
    

CREATE INDEX idx_inv_conf_precios_articulo_inarti ON inv_conf_precios_articulo(ide_inarti);

-- 4. Índice para cálculo de agregados por ide_geper
CREATE INDEX idx_geper_nom_uuid 
ON gen_persona (ide_geper, nom_geper, uuid);


ALTER TABLE con_deta_forma_pago ADD COLUMN activo_cndfp bool DEFAULT true;
ALTER TABLE con_deta_forma_pago ADD COLUMN usuario_ingre varchar(50); 
ALTER TABLE con_deta_forma_pago ADD COLUMN hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE con_deta_forma_pago ADD COLUMN usuario_actua varchar(50); 
ALTER TABLE con_deta_forma_pago ADD COLUMN hora_actua TIMESTAMP;
ALTER TABLE con_deta_forma_pago ADD COLUMN icono_cndfp  varchar(50);


ALTER TABLE con_cabece_forma_pago ADD COLUMN icono_cncfp varchar(50);
ALTER TABLE con_cabece_forma_pago ADD COLUMN activo_cncfp bool DEFAULT true;
ALTER TABLE con_cabece_forma_pago ADD COLUMN usuario_ingre varchar(50); 
ALTER TABLE con_cabece_forma_pago ADD COLUMN hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE con_cabece_forma_pago ADD COLUMN usuario_actua varchar(50); 
ALTER TABLE con_cabece_forma_pago ADD COLUMN hora_actua TIMESTAMP;


CREATE INDEX idx_articulo_filtros ON inv_articulo (
    ide_empr,
    ide_intpr,
    nivel_inarti,
    activo_inarti,
    nombre_inarti
) INCLUDE (
    ide_inarti,
    uuid,
    nombre_inarti,
    codigo_inarti,
    foto_inarti,
    ide_inuni,
    otro_nombre_inarti,
    ide_incate,
    decim_stock_inarti
);


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




-- Índice compuesto para mejorar el GROUP BY
CREATE INDEX IF NOT EXISTS idx_inv_articulo_grouping ON inv_articulo(
    ide_inarti, 
    nombre_inarti, 
    decim_stock_inarti, 
    cant_stock1_inarti, 
    cant_stock2_inarti
);



ALTER TABLE "public"."inv_articulo"
ADD COLUMN "control_fec_cadu_inarti" bool DEFAULT false,
ADD COLUMN "control_verifica_inarti" bool DEFAULT true,   -- para nsaber a que productos aplica el control de ingreso de comprobante de inventario
ADD COLUMN "perm_fact_sin_stock_inarti" bool DEFAULT true;

-- Para registar compras y ventas info adicional 
ALTER TABLE "public"."inv_det_comp_inve"
ADD COLUMN "foto_verifica_indci" varchar(250),   --- path foto del producto que recibimos / facturado  *****
ADD COLUMN "verifica_indci" bool DEFAULT false,
ADD COLUMN "usuario_verifica_indci" varchar(50),
ADD COLUMN "observ_verifica_indci" varchar(250),
ADD COLUMN "peso_verifica_inlot" numeric(12,3),
ADD COLUMN "fecha_verifica_indci" TIMESTAMP,
add COLUMN "ide_inlot" int8;      --- Para ventas se registra el lote vendido

-- Actualizar los registros existentes para que tengan verifica_indci = true
update inv_det_comp_inve set verifica_indci = true;


CREATE TABLE inv_lote (
    ide_inlot int8 PRIMARY KEY,
    lote_inlot VARCHAR(50) NOT NULL,
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

ALTER TABLE "public"."inv_cab_comp_inve" ALTER COLUMN "automatico_incci" BOOLEAN SET DEFAULT 'true';
update inv_cab_comp_inve set  automatico_incci = true;

ALTER TABLE inv_cab_comp_inve ADD COLUMN fecha_anula_incci TIMESTAMP;
ALTER TABLE inv_cab_comp_inve ADD COLUMN verifica_incci bool DEFAULT false;
ALTER TABLE inv_cab_comp_inve ADD COLUMN fecha_verifica_incci TIMESTAMP;
ALTER TABLE inv_cab_comp_inve ADD COLUMN usuario_verifica_incci VARCHAR(30);

update inv_cab_comp_inve set  verifica_incci = true;


CREATE INDEX IF NOT EXISTS idx_sis_parametros_nom_para ON sis_parametros (nom_para);
CREATE INDEX IF NOT EXISTS idx_sis_parametros_ide_empr ON sis_parametros (ide_empr);
CREATE INDEX IF NOT EXISTS idx_sis_parametros_ide_modu ON sis_parametros (ide_modu);
CREATE INDEX IF NOT EXISTS idx_sis_parametros_es_empr_para ON sis_parametros (es_empr_para);
CREATE INDEX IF NOT EXISTS idx_sis_parametros_nom_para_ide_empr ON sis_parametros (nom_para, ide_empr);
CREATE INDEX IF NOT EXISTS idx_sis_parametros_nom_para_ide_modu ON sis_parametros (nom_para, ide_modu);
CREATE INDEX IF NOT EXISTS idx_sis_parametros_nom_para_es_empr ON sis_parametros (nom_para, es_empr_para);


ALTER TABLE sis_perfil_opcion ADD COLUMN usuario_ingre varchar(50); 
ALTER TABLE sis_perfil_opcion ADD COLUMN hora_ingre TIMESTAMP;
ALTER TABLE sis_perfil_opcion ADD COLUMN usuario_actua varchar(50); 
ALTER TABLE sis_perfil_opcion ADD COLUMN hora_actua TIMESTAMP;
ALTER TABLE sis_perfil_opcion ADD COLUMN ide_empr int;
ALTER TABLE sis_perfil_opcion ADD COLUMN ide_sucu int;



CREATE TABLE public.sis_correo (
	ide_corr int4 NOT NULL,
	alias_corr varchar(50) NULL,
	smtp_corr varchar(50) NULL,
	puerto_corr varchar(50) NULL,
	usuario_corr varchar(50) NULL,
	correo_corr varchar(50) NULL,
	nom_correo_corr varchar(50) NULL,
	clave_corr varchar(50) NULL,
	secure_corr BOOLEAN DEFAULT TRUE, 
	activo_corr BOOLEAN DEFAULT TRUE, 
	observacion_corr varchar(250),
	ide_sucu int4  NULL,
	ide_empr int4  NULL,
	ide_usua int4  NULL,   -- para asociar cuenta a usuario especifico
    usuario_ingre VARCHAR(50),
    fecha_ingre TIMESTAMP DEFAULT NOW(),
    usuario_actua VARCHAR(50),
    fecha_actua TIMESTAMP,
	CONSTRAINT pk_sis_correo PRIMARY KEY (ide_corr)
);

CREATE TABLE public.sis_conf_correo (
	ide_ccor int4 NOT NULL,
	ide_corr int4 NOT NULL,
	propiedad_corr varchar(50) NULL,
	valor_corr varchar(50) NULL,
	activo_corr BOOLEAN DEFAULT TRUE, 
    usuario_ingre VARCHAR(50),
    fecha_ingre TIMESTAMP DEFAULT NOW(),
    usuario_actua VARCHAR(50),
    fecha_actua TIMESTAMP,
	CONSTRAINT pk_sis_conf_correo PRIMARY KEY (ide_ccor)
);
ALTER TABLE public.sis_conf_correo ADD CONSTRAINT sis_conf_correo_sis_correo_fk FOREIGN KEY (ide_corr) REFERENCES public.sis_correo(ide_corr);


-- Tabla para plantillas de correo
CREATE TABLE public.sis_plantilla_correo (
    ide_plco INT4 NOT NULL,
    nombre_plco VARCHAR(100) NOT NULL,
    asunto_plco VARCHAR(255) NOT NULL,
    contenido_plco TEXT NOT NULL,
    variables_plco JSONB NULL,
    estado_plco BOOLEAN DEFAULT TRUE,
    ide_corr INT4 NULL,
    usuario_ingre VARCHAR(50),
    fecha_ingre TIMESTAMP DEFAULT NOW(),
    usuario_actua VARCHAR(50),
    fecha_actua TIMESTAMP,
    CONSTRAINT pk_sis_plantilla_correo PRIMARY KEY (ide_plco),
    CONSTRAINT fk_plco_correo FOREIGN KEY (ide_corr) REFERENCES public.sis_correo(ide_corr)
);

-- Tabla para campañas de correo
CREATE TABLE public.sis_campania_correo (
    ide_caco INT4 NOT NULL,
    nombre_caco VARCHAR(100) NOT NULL,
    asunto_caco VARCHAR(255) NOT NULL,
    contenido_caco TEXT NOT NULL,
    destinatarios_caco TEXT NOT NULL, -- JSON array o lista separada por comas
    estado_caco VARCHAR(20) DEFAULT 'PENDIENTE', -- PENDIENTE, PROCESANDO, COMPLETADA, ERROR
    enviados_caco INT4 DEFAULT 0,
    fallidos_caco INT4 DEFAULT 0,
    programacion_caco TIMESTAMP NULL,
    ide_corr INT4 NULL,
    usuario_ingre VARCHAR(50),
    fecha_ingre TIMESTAMP DEFAULT NOW(),
    usuario_actua VARCHAR(50),
    fecha_actua TIMESTAMP,
    CONSTRAINT pk_sis_campania_correo PRIMARY KEY (ide_caco),
    CONSTRAINT fk_caco_correo FOREIGN KEY (ide_corr) REFERENCES public.sis_correo(ide_corr)
);

-- Tabla para colas de correo
CREATE TABLE public.sis_cola_correo (
    ide_coco INT4 NOT NULL,
    destinatario_coco VARCHAR(255) NOT NULL,
    asunto_coco VARCHAR(255) NOT NULL,
    contenido_coco TEXT NOT NULL,
    tipo_coco VARCHAR(20) DEFAULT 'INDIVIDUAL', -- INDIVIDUAL, CAMPAÑA
    estado_coco VARCHAR(20) DEFAULT 'PENDIENTE', -- PENDIENTE, ENVIADO, ERROR, REINTENTANDO
    intentos_coco INT4 DEFAULT 0,
    ide_plco INT4 NULL,
    ide_caco INT4 NULL,
    ide_corr INT4 NULL,
    error_coco TEXT NULL,
	job_id_coco VARCHAR(50),
    fecha_programada_coco TIMESTAMP DEFAULT NOW(),
    fecha_envio_coco TIMESTAMP NULL,
    usuario_ingre VARCHAR(50),
    fecha_ingre TIMESTAMP DEFAULT NOW(),
    usuario_actua VARCHAR(50),
    fecha_actua TIMESTAMP,
    CONSTRAINT pk_sis_cola_correo PRIMARY KEY (ide_coco),
    CONSTRAINT fk_coco_plantilla FOREIGN KEY (ide_plco) REFERENCES public.sis_plantilla_correo(ide_plco),
    CONSTRAINT fk_coco_campania FOREIGN KEY (ide_caco) REFERENCES public.sis_campania_correo(ide_caco),
    CONSTRAINT fk_coco_correo FOREIGN KEY (ide_corr) REFERENCES public.sis_correo(ide_corr)
);



-- Tabla para adjuntos de correo
CREATE TABLE public.sis_adjunto_correo (
    ide_adco INT4 NOT NULL,
    nombre_archivo_adco VARCHAR(255) NOT NULL,
    tipo_mime_adco VARCHAR(100) NULL,
    tamano_adco INT4 NULL,
    ruta_adco VARCHAR(500) NOT NULL,
    ide_plco INT4 NULL,
    ide_caco INT4 NULL,
    ide_coco INT4 NULL,
    usuario_ingre VARCHAR(50),
    fecha_ingre TIMESTAMP DEFAULT NOW(),
    usuario_actua VARCHAR(50),
    fecha_actua TIMESTAMP,
    CONSTRAINT pk_sis_adjunto_correo PRIMARY KEY (ide_adco),
    CONSTRAINT fk_adco_plantilla FOREIGN KEY (ide_plco) REFERENCES public.sis_plantilla_correo(ide_plco),
    CONSTRAINT fk_adco_campania FOREIGN KEY (ide_caco) REFERENCES public.sis_campania_correo(ide_caco),
    CONSTRAINT fk_adco_cola FOREIGN KEY (ide_coco) REFERENCES public.sis_cola_correo(ide_coco)
);

-- Secuencias para las tablas
--CREATE SEQUENCE public.seq_sis_plantilla_correo_ide_plco;
--CREATE SEQUENCE public.seq_sis_campania_correo_ide_caco;
--CREATE SEQUENCE public.seq_sis_cola_correo_ide_coco;
--CREATE SEQUENCE public.seq_sis_adjunto_correo_ide_adco;

-- Índices para mejorar el rendimiento
CREATE INDEX idx_sis_cola_correo_estado ON public.sis_cola_correo(estado_coco);
CREATE INDEX idx_sis_cola_correo_fecha_programada ON public.sis_cola_correo(fecha_programada_coco);
CREATE INDEX idx_sis_campania_correo_estado ON public.sis_campania_correo(estado_caco);
-- Crea índice para búsquedas más rápidas
CREATE INDEX IF NOT EXISTS idx_sis_cola_correo_job_id 
ON sis_cola_correo(job_id_coco);

-------- 
CREATE INDEX CONCURRENTLY idx_inv_articulo_empresa_stock 
ON inv_articulo (ide_empr, cant_stock1_inarti, cant_stock2_inarti) 
WHERE cant_stock1_inarti IS NOT NULL OR cant_stock2_inarti IS NOT NULL;


-----
-- ÍNDICES PARA OPTIMIZAR CONSULTAS DE CUENTAS POR COBRAR

-- Índices principales para cxc_cabece_factura (tabla más crítica)
CREATE INDEX IF NOT EXISTS idx_cf_fecha_emisi_ide_empr ON cxc_cabece_factura(fecha_emisi_cccfa, ide_empr);
CREATE INDEX IF NOT EXISTS idx_cf_ide_geper_fecha ON cxc_cabece_factura(ide_geper, fecha_emisi_cccfa);
CREATE INDEX IF NOT EXISTS idx_cf_ide_ccefa_dias_credito ON cxc_cabece_factura(ide_ccefa, dias_credito_cccfa);
CREATE INDEX IF NOT EXISTS idx_cf_ide_cccfa_empr ON cxc_cabece_factura(ide_cccfa, ide_empr);

-- Índices para cxc_cabece_transa
CREATE INDEX IF NOT EXISTS idx_ct_ide_cccfa ON cxc_cabece_transa(ide_cccfa);
CREATE INDEX IF NOT EXISTS idx_ct_fecha_trans_empr ON cxc_cabece_transa(fecha_trans_ccctr, ide_empr);
CREATE INDEX IF NOT EXISTS idx_ct_ide_geper_fecha ON cxc_cabece_transa(ide_geper, fecha_trans_ccctr);
CREATE INDEX IF NOT EXISTS idx_ct_empr_sucu ON cxc_cabece_transa(ide_empr, ide_sucu);

-- Índices para cxc_detall_transa
CREATE INDEX IF NOT EXISTS idx_dt_ide_ccctr ON cxc_detall_transa(ide_ccctr);
CREATE INDEX IF NOT EXISTS idx_dt_ide_ccttr_sucu ON cxc_detall_transa(ide_ccttr, ide_sucu);
CREATE INDEX IF NOT EXISTS idx_dt_ide_ccttr_excluidos ON cxc_detall_transa(ide_ccttr) WHERE ide_ccttr NOT IN (7, 9);

-- Índices para gen_persona
CREATE INDEX IF NOT EXISTS idx_gp_ide_geper ON gen_persona(ide_geper);
CREATE INDEX IF NOT EXISTS idx_gp_identificac ON gen_persona(identificac_geper);

-- Índices para cxc_tipo_transacc
CREATE INDEX IF NOT EXISTS idx_tt_ide_ccttr_signo ON cxc_tipo_transacc(ide_ccttr, signo_ccttr);
CREATE INDEX IF NOT EXISTS idx_tt_signo_negativo ON cxc_tipo_transacc(signo_ccttr) WHERE signo_ccttr < 0;

-- Índices para cxc_datos_fac
CREATE INDEX IF NOT EXISTS idx_df_ide_ccdaf ON cxc_datos_fac(ide_ccdaf);

-- Índices compuestos para consultas específicas
CREATE INDEX IF NOT EXISTS idx_cf_completo_analitico ON cxc_cabece_factura (
    ide_empr, 
    ide_ccefa, 
    fecha_emisi_cccfa, 
    dias_credito_cccfa, 
    ide_geper
);

CREATE INDEX IF NOT EXISTS idx_ct_completo_analitico ON cxc_cabece_transa (
    ide_empr,
    ide_sucu,
    fecha_trans_ccctr,
    ide_geper,
    ide_cccfa
);

CREATE INDEX IF NOT EXISTS idx_dt_completo_analitico ON cxc_detall_transa (
    ide_ccctr,
    ide_ccttr,
    ide_sucu
);


CREATE INDEX IF NOT EXISTS idx_ct_transacciones_pago ON cxc_cabece_transa (ide_cccfa, fecha_trans_ccctr)
WHERE ide_cccfa IS NOT NULL;


---CONTEO INVENTARIO 

ALTER TABLE "public"."inv_bodega"
ADD COLUMN "codigo_inbod " varchar(10);

CREATE TABLE public.inv_estado_conteo (
    ide_inec INT8 NOT NULL,
    codigo_inec VARCHAR(20) NOT NULL,
    nombre_inec VARCHAR(50) NOT NULL,
    descripcion_inec VARCHAR(200),
    orden_inec INT DEFAULT 0,
    permite_modificacion_inec BOOLEAN DEFAULT true,
    permite_eliminacion_inec BOOLEAN DEFAULT false,
    activo_inec BOOLEAN DEFAULT true,
    usuario_ingre VARCHAR(50),
    fecha_ingre TIMESTAMP DEFAULT NOW(),
    usuario_actua VARCHAR(50),
    fecha_actua TIMESTAMP,
    CONSTRAINT pk_inv_estado_conteo PRIMARY KEY (ide_inec),
    CONSTRAINT uk_estado_conteo_codigo UNIQUE (codigo_inec)
);

-- Datos iniciales
INSERT INTO public.inv_estado_conteo (ide_inec,codigo_inec, nombre_inec, descripcion_inec, orden_inec, permite_modificacion_inec) VALUES
(1,'PENDIENTE', 'Pendiente', 'Conteo creado pero no iniciado', 1, true),
(2,'EN_PROCESO', 'En Proceso', 'Conteo en ejecución', 2, true),
(3,'CONCLUIDO', 'Concluído', 'Conteo finalizado, pendiente de revisión', 3, false),
(4,'CERRADO', 'Cerrado', 'Conteo cerrado sin ajustes', 4, false),
(5,'AJUSTADO', 'Ajustado', 'Conteo cerrado con ajustes realizados', 5, false),
(6,'CANCELADO', 'Cancelado', 'Conteo cancelado', 6, false);


CREATE TABLE public.inv_tipo_conteo (
    ide_intc INT8 NOT NULL,
    codigo_intc VARCHAR(20) NOT NULL,
    nombre_intc VARCHAR(50) NOT NULL,
    descripcion_intc VARCHAR(200),
    requiere_reconteo_intc BOOLEAN DEFAULT false,
    ciclico_intc BOOLEAN DEFAULT false,
    frecuencia_dias_intc INT DEFAULT 0,
    porcentaje_muestreo_intc NUMERIC(5,2) DEFAULT 100.00,
    tolerancia_porcentaje_intc NUMERIC(5,2) DEFAULT 2.00,
    requiere_aprobacion_intc BOOLEAN DEFAULT false,
    activo_intc BOOLEAN DEFAULT true,
    usuario_ingre VARCHAR(50),
    fecha_ingre TIMESTAMP DEFAULT NOW(),
    usuario_actua VARCHAR(50),
    fecha_actua TIMESTAMP,
    CONSTRAINT pk_inv_tipo_conteo PRIMARY KEY (ide_intc),
    CONSTRAINT uk_tipo_conteo_codigo UNIQUE (codigo_intc)
);

-- Datos iniciales
INSERT INTO public.inv_tipo_conteo (ide_intc,codigo_intc, nombre_intc, descripcion_intc, requiere_reconteo_intc, ciclico_intc, porcentaje_muestreo_intc) VALUES
(1,'CICLICO', 'Cíclico', 'Conteo por ciclos de productos de alta rotación', true, true, 100.00),
(2,'TOTAL', 'Total', 'Conteo completo de todos los productos', true, false, 100.00),
(3,'POR_ZONA', 'Por Zona', 'Conteo por áreas o zonas específicas', false, false, 100.00),
(4,'ALEATORIO', 'Aleatorio', 'Conteo aleatorio de productos', true, true, 30.00),
(5,'MUESTREO', 'Muestreo', 'Conteo por muestreo estadístico', true, true, 20.00),
(6,'ABC', 'Conteo ABC', 'Conteo por clasificación ABC', true, true, 100.00);




-- Tabla cabecera corte_conteo_fisico
CREATE TABLE public.inv_cab_conteo_fisico (
    -- Identificador principal
    ide_inccf INT8 NOT NULL,
    
    -- Referencias a otras tablas
    ide_inbod INT8 NOT NULL,                     -- Bodega
    ide_usua INT8 NOT NULL,                      -- Responsable del conteo
    ide_inec INT8 NOT NULL,                      -- Estado del conteo
    ide_intc INT8 NOT NULL,                      -- Tipo de conteo
    
    -- Información básica del conteo
    secuencial_inccf VARCHAR(12) NOT NULL,       -- Ejemplo: BOD-2025-001
    mes_inccf INT NOT NULL,                      -- Mes (1-12)
    anio_inccf INT NOT NULL,                     -- Año (2025)
	fecha_corte_desde_inccf  DATE NOT NULL,      -- Fecha inicio para conteo de inventario
    fecha_corte_inccf DATE NOT NULL,             -- Fecha de corte del inventario
    
    -- Control de tiempos
    fecha_ini_conteo_inccf TIMESTAMP,            -- Inicio del conteo
    fecha_fin_conteo_inccf TIMESTAMP,            -- Fin del conteo
    fecha_cierre_inccf TIMESTAMP,                -- Fecha de cierre formal
    fecha_reconteo_inccf DATE,                   -- Fecha de reconteo general
    
    -- Información de aprobación
    ide_usua_aprueba INT8,                       -- Usuario que aprueba
    fecha_aprobacion_inccf TIMESTAMP,            -- Fecha de aprobación
    observacion_aprobacion_inccf VARCHAR(200),   -- Observaciones de aprobación
    
    -- Estadísticas del conteo
    productos_estimados_inccf INT DEFAULT 0,     -- Productos estimados a contar
    productos_contados_inccf INT DEFAULT 0,      -- Productos realmente contados
    productos_con_diferencia_inccf INT DEFAULT 0,-- Productos con diferencias
    productos_ajustados_inccf INT DEFAULT 0,     -- Productos ajustados
    
    -- Valores monetarios
    valor_total_corte_inccf NUMERIC(15,3) DEFAULT 0,    -- Valor teórico
    valor_total_fisico_inccf NUMERIC(15,3) DEFAULT 0,   -- Valor físico
    valor_total_diferencias_inccf NUMERIC(15,3) DEFAULT 0, -- Valor diferencias
    
    -- Métricas de calidad
    porcentaje_exactitud_inccf NUMERIC(5,2) DEFAULT 0,  -- % de exactitud
    porcentaje_avance_inccf NUMERIC(5,2) DEFAULT 0,     -- % de avance
    tolerancia_porcentaje_inccf NUMERIC(5,2) DEFAULT 2.00, -- Tolerancia configurada
    
    -- Información general
    observacion_inccf VARCHAR(500),              -- Observaciones generales
    motivo_cancelacion_inccf VARCHAR(200),       -- Motivo si se cancela
    
    -- Control de flujo
    conteo_numero_inccf INT DEFAULT 1,           -- Número de conteo (1, 2, 3...)
    es_reconteo_inccf BOOLEAN DEFAULT false,     -- Indica si es un reconteo
    ide_inccf_original INT8,                     -- Conteo original si es reconteo
    
    -- Auditoría y control
    activo_inccf BOOLEAN DEFAULT true,
    usuario_ingre VARCHAR(50) NOT NULL,
    fecha_ingre TIMESTAMP DEFAULT NOW(),
    usuario_actua VARCHAR(50),
    fecha_actua TIMESTAMP,
	ide_empr int2,
	ide_sucu int2,
    
    -- Llaves primarias y foráneas
    CONSTRAINT pk_inv_cab_conteo_fisico PRIMARY KEY (ide_inccf),
    CONSTRAINT fk_cab_conteo_bodega FOREIGN KEY (ide_inbod) 
        REFERENCES public.inv_bodega(ide_inbod),
    CONSTRAINT fk_cab_conteo_usuario FOREIGN KEY (ide_usua) 
        REFERENCES public.sis_usuario(ide_usua),
    CONSTRAINT fk_cab_conteo_estado FOREIGN KEY (ide_inec) 
        REFERENCES public.inv_estado_conteo(ide_inec),
    CONSTRAINT fk_cab_conteo_tipo FOREIGN KEY (ide_intc) 
        REFERENCES public.inv_tipo_conteo(ide_intc),
    CONSTRAINT fk_cab_conteo_usuario_aprueba FOREIGN KEY (ide_usua_aprueba) 
        REFERENCES public.sis_usuario(ide_usua),
    CONSTRAINT fk_cab_conteo_original FOREIGN KEY (ide_inccf_original) 
        REFERENCES public.inv_cab_conteo_fisico(ide_inccf),
    
    -- Restricciones de negocio
    CONSTRAINT chk_fechas_validas CHECK (
        fecha_ini_conteo_inccf <= fecha_fin_conteo_inccf AND
        fecha_corte_inccf <= COALESCE(fecha_cierre_inccf, CURRENT_DATE)
    ),
    CONSTRAINT chk_mes_valido CHECK (mes_inccf BETWEEN 1 AND 12),
    CONSTRAINT chk_anio_valido CHECK (anio_inccf BETWEEN 2000 AND 2100),
    CONSTRAINT chk_porcentajes_validos CHECK (
        porcentaje_exactitud_inccf BETWEEN 0 AND 100 AND
        porcentaje_avance_inccf BETWEEN 0 AND 100
    )
);


-- para guardar comprobante de ajustes positivo y negativo
ALTER TABLE inv_cab_conteo_fisico 
ADD COLUMN ide_incci INT8;

ALTER TABLE inv_cab_conteo_fisico 
ADD COLUMN ide_incci_nega INT8;

-- Agregar constraint de llave foránea
ALTER TABLE inv_cab_conteo_fisico
ADD CONSTRAINT fk_cab_conteo_comprobante_posi
FOREIGN KEY (ide_incci) 
REFERENCES inv_cab_comp_inve(ide_incci) 
ON DELETE SET NULL;

ALTER TABLE inv_cab_conteo_fisico
ADD CONSTRAINT fk_cab_conteo_comprobante_nega
FOREIGN KEY (ide_incci_nega) 
REFERENCES inv_cab_comp_inve(ide_incci) 
ON DELETE SET NULL;

ALTER TABLE public.inv_cab_conteo_fisico
	ADD CONSTRAINT inv_cab_conteo_fisico_ide_sucu_fkey
	FOREIGN KEY(ide_sucu)
	REFERENCES public.sis_sucursal(ide_sucu)
	MATCH SIMPLE
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT ;
ALTER TABLE public.inv_cab_conteo_fisico
	ADD CONSTRAINT inv_cab_conteo_fisico_ide_empr_fkey
	FOREIGN KEY(ide_empr)
	REFERENCES public.sis_empresa(ide_empr)
	MATCH SIMPLE
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT ;

-- Índices para mejor performance
CREATE INDEX idx_cab_conteo_bodega ON inv_cab_conteo_fisico(ide_inbod, ide_inec);
CREATE INDEX idx_cab_conteo_fechas ON inv_cab_conteo_fisico(fecha_corte_inccf, anio_inccf, mes_inccf);
CREATE INDEX idx_cab_conteo_estado ON inv_cab_conteo_fisico(ide_inec, activo_inccf);
CREATE INDEX idx_cab_conteo_secuencial ON inv_cab_conteo_fisico(secuencial_inccf);
CREATE INDEX idx_cab_conteo_usuario ON inv_cab_conteo_fisico(ide_usua, fecha_ingre);



-- Agregar columnas faltantes a la tabla inv_cab_conteo_fisico


ALTER TABLE public.inv_cab_conteo_fisico 
ADD COLUMN IF NOT EXISTS productos_stock_cero_inccf INT DEFAULT 0;

ALTER TABLE public.inv_cab_conteo_fisico 
ADD COLUMN IF NOT EXISTS productos_stock_negativo_inccf INT DEFAULT 0;

ALTER TABLE public.inv_cab_conteo_fisico 
ADD COLUMN IF NOT EXISTS conteo_parcial_inccf BOOLEAN DEFAULT false;

ALTER TABLE public.inv_cab_conteo_fisico 
ADD COLUMN IF NOT EXISTS tiempo_promedio_conteo_inccf NUMERIC(8,2) DEFAULT 0;



-- Tabla detalles conteto fisico
CREATE TABLE public.inv_det_conteo_fisico (
    -- Identificador principal
    ide_indcf INT8 NOT NULL,
    
    -- Referencias
    ide_inccf INT8 NOT NULL,                     -- Cabecera del conteo
    ide_inarti INT8 NOT NULL,                    -- Artículo/producto
    
    -- Saldos y cantidades
    saldo_corte_indcf NUMERIC(12,3) NOT NULL DEFAULT 0,    -- Saldo al corte
    cantidad_fisica_indcf NUMERIC(12,3) NOT NULL DEFAULT 0, -- Cantidad contada
    saldo_conteo_indcf NUMERIC(12,3) DEFAULT 0,  -- Saldo al momento del conteo
	movimientos_conteo_indcf  INT8,  --- Numero de movimientos en el rango de fechas
    movimientos_desde_corte_indcf  INT8 DEFAULT 0,
    -- Cálculos automáticos (generated columns)
    diferencia_cantidad_indcf NUMERIC(12,3) 
        GENERATED ALWAYS AS (cantidad_fisica_indcf - saldo_corte_indcf) STORED,
    diferencia_porcentaje_indcf NUMERIC(6,2) 
        GENERATED ALWAYS AS (
            CASE 
                WHEN saldo_corte_indcf = 0 THEN 0
                ELSE (cantidad_fisica_indcf - saldo_corte_indcf) / saldo_corte_indcf * 100
            END
        ) STORED,
    
    -- Reconteo
    cantidad_reconteo_indcf NUMERIC(12,3),       -- Cantidad en reconteo
    fecha_reconteo_indcf TIMESTAMP,              -- Fecha de reconteo
    usuario_reconteo_indcf VARCHAR(50),          -- Usuario que hace reconteo
    
    -- Ajuste de inventario
    requiere_ajuste_indcf BOOLEAN DEFAULT false, -- Requiere ajuste?
    aprobado_ajuste_indcf BOOLEAN DEFAULT false, -- Ajuste aprobado?
    cantidad_ajuste_indcf NUMERIC(12,3),         -- Cantidad a ajustar
    fecha_ajuste_indcf TIMESTAMP,                -- Fecha del ajuste
    ide_usua_ajusta INT8,                        -- Usuario que aprueba ajuste
    saldo_antes_ajuste_indcf NUMERIC(12,3),      -- Saldo antes del ajuste
    saldo_despues_ajuste_indcf NUMERIC(12,3),    -- Saldo después del ajuste
    
    -- Costos y valores
    costo_unitario_indcf NUMERIC(12,3) DEFAULT 0, -- Costo unitario
    valor_corte_indcf NUMERIC(15,3)              -- Valor teórico
        GENERATED ALWAYS AS (saldo_corte_indcf * costo_unitario_indcf) STORED,
    valor_fisico_indcf NUMERIC(15,3)             -- Valor físico
        GENERATED ALWAYS AS (cantidad_fisica_indcf * costo_unitario_indcf) STORED,
    valor_diferencia_indcf NUMERIC(15,3)
        GENERATED ALWAYS AS (
            (cantidad_fisica_indcf - saldo_corte_indcf) * costo_unitario_indcf
        ) STORED,

    
    -- Información específica del producto
    lote_indcf VARCHAR(50),                      -- Lote específico
    serial_indcf VARCHAR(50),                    -- Serial específico
    fecha_vencimiento_indcf DATE,                -- Fecha de vencimiento
    ubicacion_indcf VARCHAR(100),                -- Ubicación física
    
    -- Control de proceso
    fecha_conteo_indcf TIMESTAMP  NULL,       -- Fecha del conteo
    usuario_conteo_indcf VARCHAR(50)  NULL,   -- Usuario que contó
    equipo_conteo_indcf VARCHAR(50),             -- Equipo/terminal usado
    
    -- Estados y validaciones
    estado_item_indcf VARCHAR(20) DEFAULT 'PENDIENTE', -- PENDIENTE, CONTADO, RECONTADO, AJUSTADO
    validado_indcf BOOLEAN DEFAULT false,        -- Validado por supervisor?
    ide_usua_valida INT8,                        -- Usuario que valida
    
    -- Observaciones y comentarios
    observacion_indcf VARCHAR(200),              -- Observaciones del conteo
	observacion_reconteo_indcf VARCHAR(200),              -- Observaciones del conteo
    motivo_diferencia_indcf VARCHAR(200),        -- Posible motivo de diferencia
    

	numero_reconteos_indcf INTEGER NOT NULL DEFAULT 0,

    -- Auditoría y control
    activo_indcf BOOLEAN DEFAULT true,
    usuario_ingre VARCHAR(50)  NULL,
    fecha_ingre TIMESTAMP DEFAULT NOW(),
    usuario_actua VARCHAR(50),
    fecha_actua TIMESTAMP,
    
    -- Llaves primarias y foráneas
    CONSTRAINT pk_inv_det_conteo_fisico PRIMARY KEY (ide_indcf),
    CONSTRAINT fk_det_cab_conteo FOREIGN KEY (ide_inccf) 
        REFERENCES public.inv_cab_conteo_fisico(ide_inccf) ON DELETE CASCADE,
    CONSTRAINT fk_det_articulo FOREIGN KEY (ide_inarti) 
        REFERENCES public.inv_articulo(ide_inarti),
    CONSTRAINT fk_det_usuario_ajusta FOREIGN KEY (ide_usua_ajusta) 
        REFERENCES public.sis_usuario(ide_usua),
    CONSTRAINT fk_det_usuario_valida FOREIGN KEY (ide_usua_valida) 
        REFERENCES public.sis_usuario(ide_usua),
    
    CONSTRAINT chk_estado_item_valido CHECK (
        estado_item_indcf IN ('PENDIENTE', 'CONTADO', 'RECONTADO', 'AJUSTADO', 'VALIDADO', 'RECHAZADO', 'REVISION','ACTUALIZADO')
    ),
    CONSTRAINT un_detalle_articulo_conteo UNIQUE (ide_inccf, ide_inarti, lote_indcf, serial_indcf)
);


-- Índices para mejor performance
CREATE INDEX idx_det_conteo_articulo ON inv_det_conteo_fisico(ide_inarti, ide_inccf);
CREATE INDEX idx_det_conteo_estado ON inv_det_conteo_fisico(estado_item_indcf, activo_indcf);
CREATE INDEX idx_det_conteo_diferencia ON inv_det_conteo_fisico(diferencia_cantidad_indcf);
CREATE INDEX idx_det_conteo_fecha ON inv_det_conteo_fisico(fecha_conteo_indcf);
CREATE INDEX idx_det_conteo_lote ON inv_det_conteo_fisico(lote_indcf, fecha_vencimiento_indcf);
CREATE INDEX idx_det_conteo_ubicacion ON inv_det_conteo_fisico(ubicacion_indcf);

ALTER TABLE inv_det_conteo_fisico 
ADD COLUMN ide_incci INT8;

-- Agregar constraint de llave foránea
ALTER TABLE inv_det_conteo_fisico
ADD CONSTRAINT fk_det_conteo_comprobante 
FOREIGN KEY (ide_incci) 
REFERENCES inv_cab_comp_inve(ide_incci) 
ON DELETE SET NULL;