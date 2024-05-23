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
ALTER TABLE inv_articulo ADD COLUMN por_util2_inarti decimal(12,3); 	  -- % Utilidad venta por menor


CREATE TABLE public.inv_categoria  ( 
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
)
GO
ALTER TABLE public.inv_categoria
	ADD CONSTRAINT inv_categoria_ide_sucu_fkey
	FOREIGN KEY(ide_sucu)
	REFERENCES public.sis_sucursal(ide_sucu)
	MATCH SIMPLE
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT 
GO
ALTER TABLE public.inv_categoria
	ADD CONSTRAINT inv_categoria_ide_empr_fkey
	FOREIGN KEY(ide_empr)
	REFERENCES public.sis_empresa(ide_empr)
	MATCH SIMPLE
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT 
GO
ALTER TABLE public.inv_categoria OWNER TO postgres
GO

ALTER TABLE inv_articulo ADD COLUMN ide_incate integer; 	  -- % Categoria

ALTER TABLE public.inv_articulo
	ADD CONSTRAINT inv_categoria_articulo_fkey
	FOREIGN KEY(ide_incate)
	REFERENCES public.inv_categoria(ide_incate)
	MATCH SIMPLE
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT 
GO

INSERT INTO "public"."inv_categoria"("ide_incate", "nombre_incate", "activo_incate", "ide_empr", "ide_sucu")
VALUES(1, 'MATERIA PRIMA', true, 0, 0)
GO
INSERT INTO "public"."inv_categoria"("ide_incate", "nombre_incate", "activo_incate", "ide_empr", "ide_sucu")
VALUES(2, 'FRAGANCIAS', true, 0, 0)
GO
INSERT INTO "public"."inv_categoria"("ide_incate", "nombre_incate", "activo_incate", "ide_empr", "ide_sucu")
VALUES(3, 'SABORIZANTES', true, 0, 0)
GO
INSERT INTO "public"."inv_categoria"("ide_incate", "nombre_incate", "activo_incate", "ide_empr", "ide_sucu")
VALUES(4, 'ENVASES', true, 0, 0)
GO
INSERT INTO "public"."inv_categoria"("ide_incate", "nombre_incate", "activo_incate", "ide_empr", "ide_sucu")
VALUES(5, 'MATERIAL DE LABORATORIO', true, 0, 0)
GO
INSERT INTO "public"."inv_categoria"("ide_incate", "nombre_incate", "activo_incate", "ide_empr", "ide_sucu")
VALUES(6, 'OTROS', true, 0, 0)
GO

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
    "ruta_arch" varchar(250),
    "url_arch" varchar(200),
    "carpeta_arch" bool,
    "peso_arch" int2,
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
    "type_arch" varchar,
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
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT ;
ALTER TABLE sis_archivo ADD COLUMN uuid UUID DEFAULT (uuid_generate_v4());
CREATE INDEX idx_uuid_sis_archivo ON sis_archivo(uuid);
