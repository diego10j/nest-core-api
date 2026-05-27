
-- IMPORTACIONES 

CREATE TABLE imp_incoterm (
    ide_iminco int4,	
    nombre_iminco  VARCHAR(20) NOT NULL UNIQUE,
    descripcion_iminco  VARCHAR(200),
	activo_iminco  bool,
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP,
    CONSTRAINT pk_imp_incoterm PRIMARY KEY(ide_iminco)
);

INSERT INTO "imp_incoterm"("ide_iminco", "nombre_iminco", "activo_iminco") VALUES(1, 'FOB', true);
INSERT INTO "imp_incoterm"("ide_iminco", "nombre_iminco", "activo_iminco") VALUES(2, 'CIF', true);


CREATE TABLE imp_estado_orden(
    ide_imesor int4,	
    nombre_imesor   VARCHAR(50) NOT NULL UNIQUE,
    descripcion_imesor  VARCHAR(200),
	activo_imesor   bool,
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP,
    CONSTRAINT pk_imp_estado_orden PRIMARY KEY(ide_imesor)
);


INSERT INTO "imp_estado_orden"("ide_imesor", "nombre_imesor", "activo_imesor") VALUES(1, 'Pendiente', true);
INSERT INTO "imp_estado_orden"("ide_imesor", "nombre_imesor", "activo_imesor") VALUES(2, 'Confirmada', true);
INSERT INTO "imp_estado_orden"("ide_imesor", "nombre_imesor", "activo_imesor") VALUES(3, 'En tránsito', true);
INSERT INTO "imp_estado_orden"("ide_imesor", "nombre_imesor", "activo_imesor") VALUES(4, 'Recibida', true);
INSERT INTO "imp_estado_orden"("ide_imesor", "nombre_imesor", "activo_imesor") VALUES(5, 'Anulada', true);


create table imp_tipo_costo ( 
ide_imtco  int4,
nombre_imtco varchar(50) NOT NULL UNIQUE,
descripcion_imtco varchar(200),
activo_imtco bool,
usuario_ingre varchar(50),
hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
usuario_actua varchar(50),
hora_actua TIMESTAMP,
CONSTRAINT pk_imp_tipo_costo PRIMARY KEY(ide_imtco)
);

insert into imp_tipo_costo (ide_imtco, nombre_imtco, activo_imtco) values (1, 'Flete Internacional', true);
insert into imp_tipo_costo (ide_imtco, nombre_imtco, activo_imtco) values (2, 'Seguro Internacional', true);
insert into imp_tipo_costo (ide_imtco, nombre_imtco, activo_imtco) values (3, 'Arancel Ad-Valorem', true);
insert into imp_tipo_costo (ide_imtco, nombre_imtco, activo_imtco) values (4, 'IVA', true);
insert into imp_tipo_costo (ide_imtco, nombre_imtco, activo_imtco) values (5, 'ICE', true);
insert into imp_tipo_costo (ide_imtco, nombre_imtco, activo_imtco) values (6, 'FODINFA', true);
insert into imp_tipo_costo (ide_imtco, nombre_imtco, activo_imtco) values (7, 'Almacenaje', true);
insert into imp_tipo_costo (ide_imtco, nombre_imtco, activo_imtco) values (8, 'Transporte Local', true);
insert into imp_tipo_costo (ide_imtco, nombre_imtco, activo_imtco) values (9, 'Honorarios Agente Aduana', true);
insert into imp_tipo_costo (ide_imtco, nombre_imtco, activo_imtco) values (10, 'Otros Impuestos', true);
insert into imp_tipo_costo (ide_imtco, nombre_imtco, activo_imtco) values (11, 'Multas', true);
insert into imp_tipo_costo (ide_imtco, nombre_imtco, activo_imtco) values (12, 'ISD', true);
insert into imp_tipo_costo (ide_imtco, nombre_imtco, activo_imtco) values (13, 'Comisiones Bancarias', true);
insert into imp_tipo_costo (ide_imtco, nombre_imtco, activo_imtco) values (14, 'Otros', true);


create table imp_tipo_documento(
ide_itd int4,
nombre_itd varchar(50) NOT NULL UNIQUE,
descripcion_itd varchar(200),
activo_itd bool,
usuario_ingre varchar(50),
hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
usuario_actua varchar(50),
hora_actua TIMESTAMP,
CONSTRAINT pk_imp_tipo_documento PRIMARY KEY(ide_itd)
);

insert into imp_tipo_documento (ide_itd, nombre_itd, activo_itd) values (1, 'Factura Comercial', true);
insert into imp_tipo_documento (ide_itd, nombre_itd, activo_itd) values (2, 'Packing List', true);
insert into imp_tipo_documento (ide_itd, nombre_itd, activo_itd) values (3, 'Certificado Origen', true);
insert into imp_tipo_documento (ide_itd, nombre_itd, activo_itd) values (4, 'BL/AWB', true);
insert into imp_tipo_documento (ide_itd, nombre_itd, activo_itd) values (5, 'Documentos Transporte', true);
insert into imp_tipo_documento (ide_itd, nombre_itd, activo_itd) values (6, 'Certificados Sanitarios', true);
insert into imp_tipo_documento (ide_itd, nombre_itd, activo_itd) values (7, 'Liquidación Aduana', true);
insert into imp_tipo_documento (ide_itd, nombre_itd, activo_itd) values (8, 'Documentos Aduaneros', true);
insert into imp_tipo_documento (ide_itd, nombre_itd, activo_itd) values (9, 'Pagos', true);
insert into imp_tipo_documento (ide_itd, nombre_itd, activo_itd) values (10, 'Seguros', true);
insert into imp_tipo_documento (ide_itd, nombre_itd, activo_itd) values (11, 'Otros', true);
insert into imp_tipo_documento (ide_itd, nombre_itd, descripcion_itd, activo_itd) values (12, 'DAU', 'Documento Único Aduanero', true);

create table imp_tipo_transporte(
ide_itt int4,
nombre_itt varchar(50) NOT NULL UNIQUE,
descripcion_itt varchar(200),
activo_itt bool,
usuario_ingre varchar(50),
hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
usuario_actua varchar(50),
hora_actua TIMESTAMP,
CONSTRAINT pk_imp_tipo_transporte PRIMARY KEY(ide_itt)
);

insert into imp_tipo_transporte (ide_itt, nombre_itt, activo_itt) values (1, 'Marítimo', true);
insert into imp_tipo_transporte (ide_itt, nombre_itt, activo_itt) values (2, 'Aéreo', true);
insert into imp_tipo_transporte (ide_itt, nombre_itt, activo_itt) values (3, 'Terrestre', true);
insert into imp_tipo_transporte (ide_itt, nombre_itt, activo_itt) values (4, 'Courier', true);


CREATE TABLE imp_estado_envio (
    ide_imev int4,	
    nombre_imev   VARCHAR(50) NOT NULL UNIQUE,
    descripcion_imev  VARCHAR(200),
    activo_imev   bool,
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP,
    CONSTRAINT pk_imp_estado_envio PRIMARY KEY(ide_imev)
);

INSERT INTO "imp_estado_envio"("ide_imev", "nombre_imev", "activo_imev") VALUES(1, 'En tránsito', true);
INSERT INTO "imp_estado_envio"("ide_imev", "nombre_imev", "activo_imev") VALUES(2, 'En aduana', true);
INSERT INTO "imp_estado_envio"("ide_imev", "nombre_imev", "activo_imev") VALUES(3, 'Liberado', true);
INSERT INTO "imp_estado_envio"("ide_imev", "nombre_imev", "activo_imev") VALUES(4, 'Entregado', true);

create table imp_tipo_aforo(
ide_imtaf int4,
nombre_imtaf varchar(50) NOT NULL UNIQUE,
descripcion_imtaf varchar(200),
activo_imtaf bool,
usuario_ingre varchar(50),
hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
usuario_actua varchar(50),
hora_actua TIMESTAMP,
CONSTRAINT pk_imp_tipo_aforo PRIMARY KEY(ide_imtaf)
);  


insert into imp_tipo_aforo (ide_imtaf, nombre_imtaf, activo_imtaf) values (1, 'Aforo por Inspección Física', true);
insert into imp_tipo_aforo (ide_imtaf, nombre_imtaf, activo_imtaf) values (2, 'Aforo Automático', true);



CREATE TABLE imp_cab_importa (
    ide_imcaim int8,
    ide_geper INT NOT NULL REFERENCES gen_persona(ide_geper) ON DELETE RESTRICT,
    ide_iminco INT NOT NULL REFERENCES imp_incoterm(ide_iminco) ON DELETE RESTRICT,
    ide_imesor INT NOT NULL REFERENCES imp_estado_orden(ide_imesor) ON DELETE RESTRICT,
    ide_gepais INT REFERENCES gen_pais(ide_gepais) ON DELETE RESTRICT,
    ide_empr INT REFERENCES sis_empresa(ide_empr) ON DELETE RESTRICT,
    ide_sucu INT REFERENCES sis_sucursal(ide_sucu) ON DELETE RESTRICT,
    ide_cpcfa INT REFERENCES cxp_cabece_factur(ide_cpcfa) ON DELETE RESTRICT,   --Factura interna cxp
    ide_incci INT REFERENCES inv_cab_comp_inve(ide_incci) ON DELETE RESTRICT,   --Comprobante inventario
    fecha_imcaim DATE NOT NULL,
    numero_imcaim VARCHAR(20) NOT NULL,  --generado automáticamente con formato: IMP-2026060001
    fecha_produccion_imcaim DATE,
    fecha_factura_imcaim DATE,
    num_factura_imcaim varchar(20),
    total_factura_imcaim numeric(12,2),
    peso_neto_imcaim numeric(12,2),
    peso_carga_imcaim numeric(12,2),
    volumen_carga_imcaim numeric(12,2),
    observaciones_imcaim TEXT,
    activo_imcaim bool,
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP,
    CONSTRAINT pk_imp_cab_importacion PRIMARY KEY(ide_imcaim),
    CONSTRAINT uq_imp_cab_numero UNIQUE(numero_imcaim, ide_empr)
);
COMMENT ON TABLE imp_cab_importa IS 'Cabecera de la orden de importación, con información general';


CREATE TABLE imp_documentos (
    ide_imdocu int8,
    ide_imcaim int8 REFERENCES imp_cab_importa(ide_imcaim) ON DELETE RESTRICT,
    ide_itd int4 REFERENCES imp_tipo_documento(ide_itd) ON DELETE RESTRICT,
    numero_documento_imdocu VARCHAR(50),
    fecha_emision_imdocu DATE,
    fecha_recepcion_imdocu DATE,
    archivo_ruta_imdocu TEXT,  -- Ruta al documento digital
    observaciones_imdocu TEXT,
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP,
    CONSTRAINT pk_imp_documentos PRIMARY KEY(ide_imdocu)
);

CREATE TABLE imp_envio (
    ide_imenv int8,
    ide_imcaim int8 REFERENCES imp_cab_importa(ide_imcaim) ON DELETE RESTRICT,
    ide_imev int4 REFERENCES imp_estado_envio(ide_imev) ON DELETE RESTRICT,
    ide_itt int4 REFERENCES imp_tipo_transporte(ide_itt) ON DELETE RESTRICT,
    naviera_aerolinea_imenv VARCHAR(100),  -- Nombre de la naviera o aerolínea
    fecha_embarque_imenv DATE,
    fecha_estimada_llegada_imenv DATE,
    fecha_real_llegada_imenv DATE,
    puerto_embarque_imenv VARCHAR(100),
    puerto_destino_imenv VARCHAR(100) NOT NULL,  -- En Ecuador: Guayaquil, Manta, etc.
    agente_carga_imenv VARCHAR(100),  -- Agente de carga internacional
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP,
    CONSTRAINT pk_imp_envio PRIMARY KEY(ide_imenv)
);



CREATE TABLE imp_gestion_aduana (
    ide_imga int8,
    ide_imcaim int8 REFERENCES imp_cab_importa(ide_imcaim) ON DELETE RESTRICT,
    ide_imtaf int4 REFERENCES imp_tipo_aforo(ide_imtaf) ON DELETE RESTRICT,
    ide_geper int4 REFERENCES gen_persona(ide_geper) ON DELETE RESTRICT,  -- Agente/empresa de aduanas responsable
    ide_empr INT REFERENCES sis_empresa(ide_empr) ON DELETE RESTRICT,
    numero_dau_imga VARCHAR(30),  -- Número del Documento Único Aduanero (DAU)
    fecha_presentacion_imga DATE,
    fecha_liquidacion_imga DATE,
    fecha_liberacion_imga DATE,
    observaciones_imga TEXT,
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP,
    CONSTRAINT pk_imp_gestion_aduana PRIMARY KEY(ide_imga),
    CONSTRAINT uq_imp_gestion_dau UNIQUE(numero_dau_imga, ide_empr)
);
COMMENT ON TABLE imp_gestion_aduana IS 'Información sobre el proceso de desaduanización en Ecuador';


CREATE TABLE imp_liquidacion_aduana (
    ide_imliq int8,
    ide_imga int8 REFERENCES imp_gestion_aduana(ide_imga) ON DELETE RESTRICT,
    base_imponible_liq_imliq numeric(12,2),  -- Valor CIF en USD
    arancel_advalorem_liq_imliq numeric(12,2),
    iva_liquidacion_imliq numeric(12,2),
    ice_liquidacion_imliq numeric(12,2) NOT NULL DEFAULT 0,  -- Impuesto a Consumos Especiales (si aplica)
    fodinfa_liquidacion_imliq numeric(12,2) NOT NULL DEFAULT 0,  -- Fondo de Desarrollo Infantil (FODINFA)
    total_impuestos_liq_imliq numeric(12,2) GENERATED ALWAYS AS (
        COALESCE(arancel_advalorem_liq_imliq, 0) + COALESCE(iva_liquidacion_imliq, 0) +
        ice_liquidacion_imliq + fodinfa_liquidacion_imliq
    ) STORED,
    fecha_liquidacion_imliq DATE,
    numero_liquidacion_imliq VARCHAR(30) NOT NULL UNIQUE,
    observaciones_liquidacion_imliq TEXT,
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP,
    CONSTRAINT pk_imp_liquidacion_aduana PRIMARY KEY(ide_imliq)
);
COMMENT ON TABLE imp_liquidacion_aduana IS 'Cálculo detallado de los impuestos pagados en aduana para cada gestión aduanera';



CREATE TABLE imp_det_importa (
    ide_imdet int8,
    ide_imcaim int8 REFERENCES imp_cab_importa(ide_imcaim) ON DELETE RESTRICT,
    ide_inarti int4 REFERENCES inv_articulo(ide_inarti) ON DELETE RESTRICT,  -- Producto específico
    ide_inuni int4 REFERENCES inv_unidad(ide_inuni) ON DELETE RESTRICT,  -- Unidad de medida
    cantidad_imdet numeric(12,2),
    precio_unitario_imdet numeric(12,2),
    subtotal_imdet numeric(12,2) GENERATED ALWAYS AS (COALESCE(cantidad_imdet, 0) * COALESCE(precio_unitario_imdet, 0)) STORED,
    descripcion_prod_imdet VARCHAR(200),  -- Descripción detallada del producto para referencia
    num_paquetes_imdet varchar(100),  -- Número de paquetes para este producto específico
    observaciones_imdet VARCHAR(200),  -- Observaciones adicionales para este producto específico
    partida_aduana_imdet VARCHAR(12) NOT NULL,  -- Nomenclatura partida arancelaria para este producto específico
    descripcion_partida_imdet VARCHAR(250) NOT NULL, -- Descripción de la partida arancelaria para este producto específico
    categoria_imdet VARCHAR(50),  -- Categoría del producto para agrupaciones
    peso_neto_imdet numeric(12,2),  -- Peso neto para este producto específico
    peso_carga_imdet DECIMAL(10,2),  -- Peso bruto para este producto específico
    volumen_unitario_imdet DECIMAL(10,2),  -- Volumen total para este producto específico m3
    impuesto_ad_valorem_imdet DECIMAL(5,2),  -- % de arancel aplicable
    regulacion_ecuatoriana_imdet TEXT,  -- Descripción de regulaciones específicas en Ecuador
    --CAMPOS PRECIO FINAL YA CON TODOS LOS COSTOS OPERATIVOS INCLUIDOS PARA CADA PRODUCTO (se calculan automáticamente)
    precio_unit_final_imdet numeric(12,2),  -- Precio unitario final incluyendo todos los costos operativos
    subtotal_final_imdet numeric(12,2),  -- Subtotal final (cantidad * precio_unit_final_imdet)
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP,
    CONSTRAINT pk_imp_det_importacion PRIMARY KEY(ide_imdet)
);
COMMENT ON TABLE imp_det_importa IS 'Detalle de productos de cada orden de importación, con información clave para cálculo de impuestos y gestión aduanera';


CREATE TABLE imp_costos_import(
    ide_imcoim int8,
    ide_imcaim int8 REFERENCES imp_cab_importa(ide_imcaim) ON DELETE RESTRICT,
    ide_imtco int4 REFERENCES imp_tipo_costo(ide_imtco) ON DELETE RESTRICT,
    ide_mone int4 REFERENCES sis_moneda(ide_mone) ON DELETE RESTRICT,
    ide_cpcfa INT REFERENCES cxp_cabece_factur(ide_cpcfa) ON DELETE RESTRICT,   --Documento x pagar
    fecha_imcoim DATE,
    monto_imcoim numeric(12,2),
    observaciones_imcoim VARCHAR(255),
    referencia_imcoim VARCHAR(50),
    activo_imcoim bool,
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP,
    CONSTRAINT pk_imp_costo_importacion PRIMARY KEY(ide_imcoim)
);


CREATE TABLE imp_pagos_import(
    ide_impag int8,
    ide_imcaim int8 REFERENCES imp_cab_importa(ide_imcaim) ON DELETE RESTRICT,
    ide_imcoim int8 REFERENCES imp_costos_import(ide_imcoim) ON DELETE RESTRICT,
    ide_mone int4 REFERENCES sis_moneda(ide_mone) ON DELETE RESTRICT,
    ide_cpcfa INT REFERENCES cxp_cabece_factur(ide_cpcfa) ON DELETE RESTRICT,   --Documento cxp cuando aplique
    ide_teclb int4 REFERENCES tes_cab_libr_banc(ide_teclb) ON DELETE RESTRICT, --cab libro banco
    fecha_pago_impag DATE,
    monto_pago_impag numeric(12,2),
    referencia_pago_impag VARCHAR(50),  -- Número de referencia/transacción
    observaciones_pago_impag TEXT,
    path_comprobante_impag TEXT,  -- Ruta al archivo escaneado del comprobante de pago
    es_costo_operativo_impag bool,  -- true=costo operativo (aduana, flete, etc.), false=pago al proveedor
    activo_impag bool,
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP,
    CONSTRAINT pk_imp_pagos_import PRIMARY KEY(ide_impag)
);


-- ============================================================
-- TABLA: historial de cambios de estado de la orden
-- ============================================================
CREATE TABLE imp_historial_estado (
    ide_imhest int8,
    ide_imcaim int8 NOT NULL REFERENCES imp_cab_importa(ide_imcaim) ON DELETE RESTRICT,
    ide_imesor_anterior INT REFERENCES imp_estado_orden(ide_imesor) ON DELETE RESTRICT,
    ide_imesor_nuevo INT NOT NULL REFERENCES imp_estado_orden(ide_imesor) ON DELETE RESTRICT,
    fecha_cambio_imhest TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    observacion_imhest TEXT,
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_imp_historial_estado PRIMARY KEY(ide_imhest)
);
COMMENT ON TABLE imp_historial_estado IS 'Registro de transiciones de estado de cada orden de importación';


-- ============================================================
-- TABLA: distribución de costos de importación por producto
-- ============================================================
CREATE TABLE imp_distribucion_costo (
    ide_imdico int8,
    ide_imcoim int8 NOT NULL REFERENCES imp_costos_import(ide_imcoim) ON DELETE RESTRICT,
    ide_imdet int8 NOT NULL REFERENCES imp_det_importa(ide_imdet) ON DELETE RESTRICT,
    metodo_dist_imdico VARCHAR(20) NOT NULL DEFAULT 'valor_fob',  -- valor_fob | peso | volumen | cantidad | manual
    porcentaje_imdico numeric(8,4),  -- % del costo asignado a este producto
    monto_imdico numeric(12,2),      -- Monto del costo asignado a este producto
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP,
    CONSTRAINT pk_imp_distribucion_costo PRIMARY KEY(ide_imdico),
    CONSTRAINT uq_imp_dist_costo_det UNIQUE(ide_imcoim, ide_imdet)
);
COMMENT ON TABLE imp_distribucion_costo IS 'Distribución proporcional de cada costo de importación entre los productos del detalle';


-- ============================================================
-- ÍNDICES para optimización de queries frecuentes
-- ============================================================
CREATE INDEX idx_imp_cab_empr        ON imp_cab_importa(ide_empr);
CREATE INDEX idx_imp_cab_imesor      ON imp_cab_importa(ide_imesor);
CREATE INDEX idx_imp_cab_geper       ON imp_cab_importa(ide_geper);
CREATE INDEX idx_imp_cab_fecha       ON imp_cab_importa(fecha_imcaim);

CREATE INDEX idx_imp_documentos_imcaim  ON imp_documentos(ide_imcaim);
CREATE INDEX idx_imp_envio_imcaim       ON imp_envio(ide_imcaim);
CREATE INDEX idx_imp_gestion_imcaim     ON imp_gestion_aduana(ide_imcaim);
CREATE INDEX idx_imp_gestion_empr       ON imp_gestion_aduana(ide_empr);
CREATE INDEX idx_imp_liquidacion_imga   ON imp_liquidacion_aduana(ide_imga);
CREATE INDEX idx_imp_det_imcaim         ON imp_det_importa(ide_imcaim);
CREATE INDEX idx_imp_det_inarti         ON imp_det_importa(ide_inarti);
CREATE INDEX idx_imp_costos_imcaim      ON imp_costos_import(ide_imcaim);
CREATE INDEX idx_imp_costos_imtco       ON imp_costos_import(ide_imtco);
CREATE INDEX idx_imp_pagos_imcaim       ON imp_pagos_import(ide_imcaim);
CREATE INDEX idx_imp_pagos_imcoim       ON imp_pagos_import(ide_imcoim);
CREATE INDEX idx_imp_historial_imcaim   ON imp_historial_estado(ide_imcaim);
CREATE INDEX idx_imp_dist_imcoim        ON imp_distribucion_costo(ide_imcoim);
CREATE INDEX idx_imp_dist_imdet         ON imp_distribucion_costo(ide_imdet);

-- MODULO 
INSERT INTO "public"."sis_modulo" ("ide_modu", "nom_modu") VALUES
(14, 'Importaciones');




ALTER TABLE sis_parametros ADD COLUMN es_empr_para bool DEFAULT false;  -- para saber si el parametro se maneja por empresa
ALTER TABLE sis_parametros ADD COLUMN empresa_para  INT;    -- se llena cuando  es_empr_para = true
ALTER TABLE sis_parametros ADD COLUMN activo_para bool DEFAULT true;
ALTER TABLE sis_parametros ADD COLUMN usuario_ingre varchar(50); 
ALTER TABLE sis_parametros ADD COLUMN hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE sis_parametros ADD COLUMN usuario_actua varchar(50); 
ALTER TABLE sis_parametros ADD COLUMN hora_actua TIMESTAMP;

CREATE INDEX idx_sis_parametros_nom_empresa ON sis_parametros (nom_para, empresa_para);
CREATE INDEX idx_sis_parametros_lower_nom_empresa ON sis_parametros (LOWER(nom_para), empresa_para);









