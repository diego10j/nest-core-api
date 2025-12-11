

CREATE TABLE gen_tipo_direccion (
    "ide_getidi" int4,
    "nombre_getidi" varchar(100),
    "descripcion_getidi" text,
    "icono_getidi" varchar(80),
    "activo_getidi" bool,   
    "usuario_ingre" varchar(50),
    "hora_ingre" TIMESTAMP,
    "usuario_actua" varchar(50),
    "hora_actua" TIMESTAMP,
	CONSTRAINT pk_gen_tipo_direccion PRIMARY KEY(ide_getidi)
);


insert into gen_tipo_direccion values(1, 'Contacto','Utiliza esta opción para organizar los detalles de contacto de los empleados de una empresa, créalos según su departamento, como ventas, contabilidad, entre otros.',null,true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into gen_tipo_direccion values(2, 'Dirección de factura','La dirección preferida para todas las facturas. Se selecciona de forma predeterminada cuando factura una orden que pertenece a esta empresa.',null,true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into gen_tipo_direccion values(3, 'Dirección de entrega','La dirección preferida para todas las entregas. Se selecciona de forma predeterminada al entregar una orden que pertenece a esta empresa.',null,true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into gen_tipo_direccion values(4, 'Otra Dirección','Otras direcciones para la empresa (por ejemplo, sucursales...)',null,true, 'sa',CURRENT_TIMESTAMP,null,null);


CREATE TABLE gen_titulo_persona (
    "ide_getitp" int4,
    "nombre_getitp" varchar(100),
    "abreviatura_getitp" text,
    "activo_getitp" bool,   
    "usuario_ingre" varchar(50),
    "hora_ingre" TIMESTAMP,
    "usuario_actua" varchar(50),
    "hora_actua" TIMESTAMP,
	CONSTRAINT pk_gen_titulo_persona PRIMARY KEY(ide_getitp)
);

insert into gen_titulo_persona values(1, 'Señor','Sr.',true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into gen_titulo_persona values(2, 'Señora','Sra.',true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into gen_titulo_persona values(3, 'Señorita','Srita.',true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into gen_titulo_persona values(4, 'Doctor','Dr.',true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into gen_titulo_persona values(5, 'Ingeniero','Ing.',true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into gen_titulo_persona values(6, 'Licenciado','Lic.',true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into gen_titulo_persona values(7, 'Magister','Mag.',true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into gen_titulo_persona values(8, 'Químico','Quím.',true, 'sa',CURRENT_TIMESTAMP,null,null);

-- titulo persona 
ALTER TABLE gen_persona ADD COLUMN ide_getitp int4;     
ALTER TABLE gen_persona ADD COLUMN es_contacto_geper bool;    
ALTER TABLE gen_persona ADD COLUMN cargo_con_geper varchar(80); 
ALTER TABLE gen_persona ADD COLUMN notas_gecodi text; 
ALTER TABLE gen_persona ADD COLUMN requiere_actua_geper bool;    

ALTER TABLE public.gen_persona
	ADD CONSTRAINT gen_persona_ide_getitp_fkey
	FOREIGN KEY(ide_getitp)
	REFERENCES public.gen_titulo_persona(ide_getitp)
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT;
update gen_persona set es_contacto_geper = true, requiere_actua_geper = true; --valores por defecto

INSERT INTO "public"."gen_tipo_persona" ("ide_getip", "detalle_getip", "activo_getip") VALUES
(1, 'PERSONA', 'TRUE');

INSERT INTO "public"."gen_tipo_persona" ("ide_getip", "detalle_getip", "activo_getip") VALUES
(2, 'EMPRESA', 'TRUE');

ALTER TABLE gen_persona ADD COLUMN ide_getip int4;  
 ALTER TABLE public.gen_persona
	ADD CONSTRAINT gen_persona_ide_getip_fkey
	FOREIGN KEY(ide_getip)
	REFERENCES public.gen_tipo_persona(ide_getip)
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT;

update gen_persona set ide_getip = 1 ;  -- por defecto todos tipo persona
update gen_persona
set ide_getip = 2   -- tipo empresa
WHERE nom_geper ILIKE ANY(ARRAY[
      '%LTDA.',
      '%LTDA',
      '%S.A',
      '%S.A.',
      '%S.A.S.',
      '%S.A.S',
      '%C.A',
      '%C.A.'
  ]);
  
-----------------------------------------------

-- Direccion de persona
CREATE TABLE "public"."gen_direccion_persona" (
    "ide_gedirp" int4,
    "ide_getidi" int4,
    "ide_gepais" int4,
    "ide_geprov" int4,
    "ide_gecant" int4,
    "ide_geper" int4,
    "nombre_dir_gedirp" varchar(100),
    "correo_gedirp" varchar(80),
    "direccion_gedirp" varchar(200),
    "referencia_gedirp" varchar(200),
    "longitud_gedirp" varchar(25),
    "latitud_gedirp" varchar(25),
    "telefono_gedirp" varchar(60),
    "movil_gedirp" varchar(10),
    "activo_gedirp" bool,
    "usuario_ingre" varchar(50),
    "hora_ingre" TIMESTAMP,
    "usuario_actua" varchar(50),
    "hora_actua" TIMESTAMP,
	CONSTRAINT "pk_gen_direccion_contacto" PRIMARY KEY("ide_gedirp"),
    CONSTRAINT "gen_direccion_contacto_ide_geper_fkey" FOREIGN KEY ("ide_geper") REFERENCES "public"."gen_persona"("ide_geper") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "gen_direccion_contacto_ide_gepais_fkey" FOREIGN KEY ("ide_gepais") REFERENCES "public"."gen_pais"("ide_gepais") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "gen_direccion_contacto_ide_geprov_fkey" FOREIGN KEY ("ide_geprov") REFERENCES "public"."gen_provincia"("ide_geprov") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "gen_direccion_contacto_ide_getidi_fkey" FOREIGN KEY ("ide_getidi") REFERENCES "public"."gen_tipo_direccion"("ide_getidi") ON DELETE RESTRICT ON UPDATE RESTRICT
);


-------------Log Actividades

-- Esta tabla almacenará los tipos de actividades posibles, como "cambio de datos", "envío de factura", "cotización", "programación de llamada", "creación", etc.

CREATE TABLE sis_actividad_tipo (
    ide_actti int4 PRIMARY KEY,
    nom_actti VARCHAR(100) NOT NULL, 
    icono_actti VARCHAR(50), 
    nemonico_actti VARCHAR(5),
    activo_gedirp bool,
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
);

insert into sis_actividad_tipo values(1, 'Registro creado',null,'I',true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into sis_actividad_tipo values(2, 'Registro modificado',null,'M',true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into sis_actividad_tipo values(3, 'Registro Eliminado',null,'E',true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into sis_actividad_tipo values(4, 'Registro Consultado',null,'C',true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into sis_actividad_tipo values(5, 'Otra Actividad',null,'O',true, 'sa',CURRENT_TIMESTAMP,null,null);


-- Esta tabla almacenará los posibles estados de una actividad, como "pendiente", "hecho", "cancelado", etc.
CREATE TABLE sis_actividad_estado (
    ide_actes int4 PRIMARY KEY,
    nom_actes VARCHAR(50) NOT NULL,
    activo_actes bool,
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
);

insert into sis_actividad_estado values(1, 'Pendiente',true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into sis_actividad_estado values(2, 'Realizado',true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into sis_actividad_estado values(3, 'En proceso',true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into sis_actividad_estado values(4, 'Cancelado',true, 'sa',CURRENT_TIMESTAMP,null,null);


-- Esta tabla almacenará las actividades relacionadas con las personas. Cada actividad estará vinculada a un tipo de actividad, un estado, y a una persona específica.
--- ejemplo historial_acti
-- [
--     {
--         "campo_modificado": "estado_actividad",
--         "label_campo": "Estado Actividad",
--         "valor_anterior": "pendiente",
--         "valor_nuevo": "completado",
--         "fecha_cambio": "2024-08-16T14:30:00Z",
--         "usuario_actua": "sa"
--     },
--     {
--         "campo_modificado": "descripcion",
--         "label_campo": "Descripción",
--         "valor_anterior": "Reunión inicial con cliente",
--         "valor_nuevo": "Reunión finalizada",
--         "fecha_cambio": "2024-08-16T15:00:00Z",
--         "usuario_actua": "sa"
--     }
-- ]


CREATE TABLE sis_actividad (
    ide_acti SERIAL PRIMARY KEY,
    tabla_acti VARCHAR(50) NOT NULL,
    valor_pk_acti INT8 NOT NULL,
    nom_acti VARCHAR(80) NOT NULL,
    ide_usua INT REFERENCES sis_usuario(ide_usua) ON DELETE SET NULL, -- Usuario crea actividad
    sis_ide_usua INT REFERENCES sis_usuario(ide_usua) ON DELETE SET NULL, -- Usuario asignado a la actividad
    ide_actti INT REFERENCES sis_actividad_tipo(ide_actti) ON DELETE SET NULL,
    ide_actes INT REFERENCES sis_actividad_estado(ide_actes) ON DELETE SET NULL,
    descripcion_acti TEXT, -- Descripción de la actividad
    fecha_actividad_acti TIMESTAMP NOT NULL, -- Fecha y hora de la actividad programada
    fecha_creacion_acti TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Fecha de creación de la actividad
    fecha_completada_acti TIMESTAMP, -- Fecha en que la actividad fue marcada como hecha
    historial_acti JSONB DEFAULT '[]'::jsonb, -- Historial de cambios campos en formato JSON
    activo_acti bool,
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
);
CREATE INDEX idx_actividad_tabla ON sis_actividad(tabla_acti,valor_pk_acti);
CREATE INDEX idx_actividad_tabla_fecha ON sis_actividad(tabla_acti,fecha_actividad_acti);

CREATE TABLE sis_actividad_comentario (
    ide_actco SERIAL PRIMARY KEY,
    ide_acti INT REFERENCES sis_actividad(ide_acti) ON DELETE CASCADE,
    ide_usua INT REFERENCES sis_usuario(ide_usua) ON DELETE SET NULL, -- Usuario crea comentario
    comentario_actco TEXT NOT NULL, -- El comentario realizado
    fecha_comentario_actco TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Fecha y hora en que se hizo el comentario
    activo_actco bool,
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
);




-- 07/09/2024
ALTER TABLE gen_direccion_persona ADD COLUMN defecto_gedirp boolean default false;
ALTER TABLE gen_direccion_persona ADD COLUMN ide_gegen int;


--  insertar direcciones exiistentes de gen_persona


WITH max_id AS (
    SELECT COALESCE(MAX(ide_gedirp), 0) AS max_ide FROM gen_direccion_persona
)
INSERT INTO gen_direccion_persona (
    ide_gedirp,
    ide_getidi,
    ide_gepais,
    ide_geprov,
    ide_gecant,
    ide_geper,
    nombre_dir_gedirp,
    direccion_gedirp,
    telefono_gedirp,
    movil_gedirp,
    activo_gedirp,
    defecto_gedirp,
    usuario_ingre,
    hora_ingre
)
SELECT
    max_id.max_ide + ROW_NUMBER() OVER () AS ide_gedirp, -- Incrementa dinámicamente
    1 AS ide_getidi,            -- Tipo de dirección, valor nulo
    1 AS ide_gepais,               -- País por defecto
    gp.ide_geprov,                 -- Provincia
    gp.ide_gecant,                 -- Cantón
    gp.ide_geper,
    'Direccion Principal' as   nombre_dir_gedirp,                -- Persona
    gp.direccion_geper,    
    gp.telefono_geper,
    LEFT(gp.movil_geper, 10) AS movil_gedirp, -- Móvil truncado a 10 dígitos     -- Dirección
    TRUE AS activo_gedirp,  
    TRUE AS defecto_gedirp,         -- Activo
    'sa' AS usuario_ingre,     -- Usuario de ingreso
    NOW() AS hora_ingre            -- Fecha y hora de ingreso
FROM
    gen_persona gp,
    max_id
WHERE
    gp.direccion_geper IS NOT NULL;



-- inserta contactos 

WITH max_id AS (
    SELECT COALESCE(MAX(ide_gedirp), 0) AS max_ide FROM gen_direccion_persona
)
INSERT INTO gen_direccion_persona (
    ide_gedirp,
    ide_geper,
    nombre_dir_gedirp,
    telefono_gedirp,
    movil_gedirp,
    correo_gedirp,
    activo_gedirp,
    usuario_ingre,
    hora_ingre
)
SELECT
    max_id.max_ide + ROW_NUMBER() OVER () AS ide_gedirp, -- Incrementa dinámicamente         -- Tipo de dirección, valor nulo               -- Cantón
    gp.ide_geper,
    gp.contacto_geper as   nombre_dir_gedirp,                -- Persona  
    gp.telefono_geper,
    LEFT(gp.movil_geper, 10) AS movil_gedirp, 
    gp.correo_geper, -- Móvil truncado a 10 dígitos     -- Dirección
    TRUE AS activo_gedirp,          -- Activo
    'sa' AS usuario_ingre,     -- Usuario de ingreso
    NOW() AS hora_ingre            -- Fecha y hora de ingreso
FROM
    gen_persona gp,
    max_id
WHERE
    gp.contacto_geper is not null



