// 29-10-2024

ALTER TABLE public.sis_sucursal
ADD CONSTRAINT unique_ide_sucu UNIQUE (ide_sucu);

ALTER TABLE public.sis_usuario
ADD CONSTRAINT unique_ide_usua UNIQUE (ide_usua);

ALTER TABLE public.sis_empresa
ADD CONSTRAINT unique_ide_empr UNIQUE (ide_empr);

ALTER TABLE public.con_deta_forma_pago
ADD CONSTRAINT unique_ide_cndfp UNIQUE (ide_cndfp);

ALTER TABLE public.gen_persona
ADD CONSTRAINT unique_ide_geper UNIQUE (ide_geper);

CREATE TABLE public.cxc_estado_orden (
    ide_ccesor INT PRIMARY KEY, -- Primary key 
    titulo_ccesor varchar(100) NOT NULL,
    activo_cceso boolean DEFAULT true, 
    color_cceso varchar(30) NOT NULL,
    ide_empr     	int NULL REFERENCES public.sis_empresa(ide_empr),
	ide_sucu     	int NULL REFERENCES public.sis_sucursal(ide_sucu),
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
);


INSERT INTO "public"."cxc_estado_orden" ("ide_ccesor", "titulo_ccesor", "activo_cceso", "color_cceso") VALUES
(1, 'PROCESADA', 'TRUE', 'success');

INSERT INTO "public"."cxc_estado_orden" ("ide_ccesor", "titulo_ccesor", "activo_cceso", "color_cceso") VALUES
(2, 'PENDIENTE', 'TRUE', 'warning');

INSERT INTO "public"."cxc_estado_orden" ("ide_ccesor", "titulo_ccesor", "activo_cceso", "color_cceso") VALUES
(3, 'REVERSADA', 'TRUE', 'error');


CREATE TABLE public.cxc_punto_venta (
    ide_ccptv int PRIMARY KEY,
    titulo_ccptv varchar(100) NOT NULL,
    descripcion_ccptv text,
    ide_ccdaf int,
    color_ccptv  varchar(50),
    activo_ccptv  bool,
	ide_empr     	int NULL REFERENCES public.sis_empresa(ide_empr),
	ide_sucu     	int NULL REFERENCES public.sis_sucursal(ide_sucu),
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
);

CREATE TABLE public.cxc_aper_cierre_pnto_vta (
    ide_ccacpv int4 PRIMARY KEY, -- Primary key 
    ide_ccptv INT REFERENCES public.cxc_punto_venta(ide_ccptv), -- Foreign key hacia el punto de venta
    ide_usua  	int NULL REFERENCES public.sis_usuario(ide_usua), -- Usuario apertura
    fecha_aper_ccacpv DATE DEFAULT CURRENT_TIMESTAMP, -- Fecha apertura
    monto_aper_ccacpv DECIMAL(15, 2) NOT NULL, -- Monto de apertura 
    comenta_aper_ccacpv VARCHAR(250), -- Comentarios apertura
    cierre_ccacpv  boolean DEFAULT false, 
    sis_ide_usua  	int NULL REFERENCES public.sis_usuario(ide_usua), -- Usuario cierre
    fecha_cierre_ccacpv DATE DEFAULT CURRENT_TIMESTAMP, -- Fecha cierre
    monto_cierre_ccacpv DECIMAL(15, 2) NOT NULL, -- Monto de cierre 
    comenta_cierre_ccacpv VARCHAR(250), -- Comentarios cierre
    monto_trn_ccacpv DECIMAL(15, 2) NOT NULL, -- Monto de transacciones
    activo_ccacpv bool DEFAULT true,
	ide_empr     	int NULL REFERENCES public.sis_empresa(ide_empr),
	ide_sucu     	int NULL REFERENCES public.sis_sucursal(ide_sucu),
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
);


CREATE TABLE public.cxc_usuario_punto_venta (
    ide_ccupvt INT PRIMARY KEY, -- Primary key 
    ide_ccptv INT REFERENCES public.cxc_punto_venta(ide_ccptv), -- Foreign key hacia el punto de venta
    ide_usua  	int NULL REFERENCES public.sis_usuario(ide_usua), -- Usuario puede facturar
    activo_ccupvt  boolean DEFAULT true, 
    ide_empr     	int NULL REFERENCES public.sis_empresa(ide_empr),
	ide_sucu     	int NULL REFERENCES public.sis_sucursal(ide_sucu),
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
);


CREATE TABLE public.cxc_autoriza_punto_venta (
    ide_ccapvt INT PRIMARY KEY, -- Primary key 
    ide_ccptv INT REFERENCES public.cxc_punto_venta(ide_ccptv), -- Foreign key hacia el punto de venta
    ide_usua  	int NULL REFERENCES public.sis_usuario(ide_usua), -- Usuario autorizante trn 
    activo_ccapvt  boolean DEFAULT true, 
    ide_empr     	int NULL REFERENCES public.sis_empresa(ide_empr),
	ide_sucu     	int NULL REFERENCES public.sis_sucursal(ide_sucu),
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
);


ALTER TABLE public.cxc_cabece_factura ADD COLUMN ide_ccptv int;

ALTER TABLE public.cxc_cabece_factura
	ADD CONSTRAINT cxc_cabece_factura_ide_ccptv_fkey
	FOREIGN KEY(ide_ccptv)
	REFERENCES public.cxc_punto_venta(ide_ccptv)
	MATCH SIMPLE
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT ;



CREATE TABLE public.cxc_forma_pago_pnto_vta (
    ide_ccfpvt INT PRIMARY KEY, -- Primary key 
    ide_ccptv INT REFERENCES public.cxc_punto_venta(ide_ccptv), -- Foreign key hacia el punto de venta
    monto_min_ccfpvt DECIMAL(15, 2) NOT NULL, -- Monto mínimo para la forma de pago
    monto_max_ccfpvt DECIMAL(15, 2) NOT NULL, -- Monto máximo para la forma de pago
    activo_ccfpvt  boolean DEFAULT true, 
    ide_cndfp INT REFERENCES public.con_deta_forma_pago(ide_cndfp), -- Foreign key hacia forma de pago
    ide_empr     	int NULL REFERENCES public.sis_empresa(ide_empr),
	ide_sucu     	int NULL REFERENCES public.sis_sucursal(ide_sucu),
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
);


CREATE TABLE public.cxc_orden_punto_venta (
    ide_ccopvt int8 NOT NULL,
    ide_ccacpv INT REFERENCES public.cxc_aper_cierre_pnto_vta(ide_ccacpv), 
    ide_ccptv INT REFERENCES public.cxc_punto_venta(ide_ccptv), -- Foreign key hacia el punto de venta
    ide_vgven int8 NULL,
    ide_ccesor INT REFERENCES public.cxc_estado_orden(ide_ccesor), 
    ide_geper int8 NULL,
    ide_usua  int8 NULL REFERENCES public.sis_usuario(ide_usua),
    ide_cndfp INT REFERENCES public.con_deta_forma_pago(ide_cndfp), -- Foreign key hacia forma de pago
    fecha_emisi_ccopvt date,
    secuencial_ccopvt varchar(15),
    direccion_ccopvt varchar(180),
    observacion_ccopvt text,
    base_no_objeto_iva_ccopvt numeric(12,2),
    base_tarifa0_ccopvt numeric(12,2),
    base_grabada_ccopvt numeric(12,2),
    valor_iva_ccopvt numeric(12,2),
    total_ccopvt numeric(12,2),
    descuento_ccopvt numeric(12,2) DEFAULT 0,
    solo_guardar_ccopvt bool DEFAULT false,
    telefono_ccopvt varchar(20),
    tarifa_iva_ccopvt numeric(12,2),
    correo_ccopvt varchar(100),
    activo_ccopvt  boolean DEFAULT true, 
    ide_empr     	int NULL REFERENCES public.sis_empresa(ide_empr),
	ide_sucu     	int NULL REFERENCES public.sis_sucursal(ide_sucu),
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
);
    ALTER TABLE public.cxc_orden_punto_venta
	ADD CONSTRAINT cxc_orden_punto_venta_ide_geper_fkey
	FOREIGN KEY(ide_geper)
	REFERENCES public.gen_persona(ide_geper)
	MATCH SIMPLE
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT ;


ALTER TABLE public.cxc_orden_punto_venta
ADD CONSTRAINT unique_ide_ccopvt UNIQUE (ide_ccopvt);


ALTER TABLE public.cxc_deta_factura ADD COLUMN ide_ccopvt int8;


ALTER TABLE public.cxc_deta_factura
	ADD CONSTRAINT cxc_deta_factura_ide_ccopvt_fkey
	FOREIGN KEY(ide_ccopvt)
	REFERENCES public.cxc_orden_punto_venta(ide_ccopvt)
	MATCH SIMPLE
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT ;