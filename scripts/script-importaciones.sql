
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


CREATE TABLE imp_cab_orden_compra (
    ide_imcaoc int4,
	ide_geper INT REFERENCES gen_persona(ide_geper) ON DELETE RESTRICT,  
    ide_iminco INT REFERENCES imp_incoterm(ide_iminco) ON DELETE RESTRICT,    
    ide_imesor INT REFERENCES imp_estado_orden(ide_imesor) ON DELETE RESTRICT,    
	fecha_orden_imcaoc DATE, 
    numero_imcaoc VARCHAR(20) NOT NULL UNIQUE,
    fecha_produccion_imcaoc DATE, 
    fecha_factura_imcaoc DATE,
    num_factura_imcaoc varchar(20),
    fecha_envio_imcaoc DATE,
    fecha_est_llegada_imcaoc DATE,
    fecha_real_llegada_imcaoc DATE,
    total_factrua numeric(12,2),
    peso_factura  numeric(12,2),
    peso_carga numeric(12,2),
    volumen_carga numeric(12,2),
    pallets_carga int2,
    observaciones_imcaoc TEXT,
	activo_imcaoc bool,
	ide_gepais INT REFERENCES gen_pais(ide_gepais) ON DELETE RESTRICT,    
    ide_empr INT REFERENCES sis_empresa(ide_empr) ON DELETE RESTRICT,   
    ide_sucu INT REFERENCES sis_sucursal(ide_sucu) ON DELETE RESTRICT,    
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP,
    CONSTRAINT pk_imp_cab_importacion PRIMARY KEY(ide_imcaoc)
);




---- IA
-- Creación de la base de datos
CREATE DATABASE SistemaImportacionesEcuador;
USE SistemaImportacionesEcuador;


-- Tabla de Productos (ítems que se importan)
CREATE TABLE Productos (
    id_producto INT PRIMARY KEY AUTO_INCREMENT,
    codigo_arancelario VARCHAR(12) NOT NULL,  -- Nomenclatura ANDINA o HS Code
    descripcion VARCHAR(200) NOT NULL,
    categoria VARCHAR(50),  -- Categoría del producto para agrupaciones
    peso_unitario DECIMAL(10,2),  -- en kg
    volumen_unitario DECIMAL(10,2),  -- en m3
    unidad_medida VARCHAR(20),  -- Unidad, caja, rollo, etc.
    impuesto_ad_valorem DECIMAL(5,2),  -- % de arancel aplicable
    iva DECIMAL(5,2) DEFAULT 12.00,  -- IVA en Ecuador (12% en 2023)
    partida_arancelaria VARCHAR(10),  -- Clasificación arancelaria específica
    regulacion_ecuatoriana TEXT  -- Descripción de regulaciones específicas en Ecuador
) COMMENT 'Catálogo de productos que se importan, con información clave para cálculo de impuestos';

-- Tabla de Ordenes de Compra (documento inicial de la importación)
CREATE TABLE OrdenesCompra (
    id_orden_compra INT PRIMARY KEY AUTO_INCREMENT,
    id_importador INT NOT NULL,
    id_proveedor INT NOT NULL,
    numero_orden VARCHAR(20) NOT NULL UNIQUE,
    fecha_orden DATE NOT NULL,
    fecha_estimada_entrega DATE,
    incoterm VARCHAR(10) NOT NULL,  -- FOB, CIF, etc.
    moneda VARCHAR(3) NOT NULL,  -- Moneda de la transacción
    tipo_cambio DECIMAL(10,4),  -- Tipo de cambio a USD para el día
    estado ENUM('Pendiente', 'Confirmada', 'En tránsito', 'Recibida', 'Cancelada') DEFAULT 'Pendiente',
    observaciones TEXT,
    FOREIGN KEY (id_importador) REFERENCES Importadores(id_importador),
    FOREIGN KEY (id_proveedor) REFERENCES Proveedores(id_proveedor)
) COMMENT 'Orden de compra internacional que inicia el proceso de importación';

-- Tabla de Detalles de Orden de Compra (productos específicos ordenados)
CREATE TABLE DetallesOrdenCompra (
    id_detalle INT PRIMARY KEY AUTO_INCREMENT,
    id_orden_compra INT NOT NULL,
    id_producto INT NOT NULL,
    cantidad INT NOT NULL,
    precio_unitario DECIMAL(12,2) NOT NULL,
    descuento DECIMAL(5,2) DEFAULT 0,
    subtotal DECIMAL(12,2) GENERATED ALWAYS AS (cantidad * precio_unitario * (1 - descuento/100)) STORED,
    FOREIGN KEY (id_orden_compra) REFERENCES OrdenesCompra(id_orden_compra),
    FOREIGN KEY (id_producto) REFERENCES Productos(id_producto)
) COMMENT 'Detalle de productos incluidos en cada orden de compra';

-- Tabla de Envíos (gestión del transporte internacional)
CREATE TABLE Envios (
    id_envio INT PRIMARY KEY AUTO_INCREMENT,
    id_orden_compra INT NOT NULL,
    numero_bl VARCHAR(50) UNIQUE,  -- Número de Bill of Lading o AWB
    tipo_transporte ENUM('Marítimo', 'Aéreo', 'Terrestre') NOT NULL,
    naviera_aerolinea VARCHAR(100),  -- Nombre de la naviera o aerolínea
    fecha_embarque DATE,
    fecha_estimada_llegada DATE,
    fecha_real_llegada DATE,
    puerto_embarque VARCHAR(100),
    puerto_destino VARCHAR(100) NOT NULL,  -- En Ecuador: Guayaquil, Manta, etc.
    estado ENUM('En tránsito', 'En aduana', 'Liberado', 'Entregado') DEFAULT 'En tránsito',
    agente_carga VARCHAR(100),  -- Agente de carga internacional
    FOREIGN KEY (id_orden_compra) REFERENCES OrdenesCompra(id_orden_compra)
) COMMENT 'Información sobre el transporte internacional de la mercancía';

-- Tabla de Documentos de Importación (gestión documental)
CREATE TABLE DocumentosImportacion (
    id_documento INT PRIMARY KEY AUTO_INCREMENT,
    id_envio INT NOT NULL,
    tipo_documento ENUM('Factura Comercial', 'Packing List', 'Certificado Origen', 'BL/AWB', 'Documentos Transporte', 'Certificados Sanitarios', 'Otros') NOT NULL,
    numero_documento VARCHAR(50),
    fecha_emision DATE,
    fecha_recepcion DATE,
    archivo_ruta VARCHAR(255),  -- Ruta al documento escaneado/subido
    observaciones TEXT,
    FOREIGN KEY (id_envio) REFERENCES Envios(id_envio)
) COMMENT 'Documentación requerida para el proceso de importación';

-- Tabla de Gestión Aduanera (proceso en la aduana ecuatoriana)
CREATE TABLE GestionAduanera (
    id_gestion INT PRIMARY KEY AUTO_INCREMENT,
    id_envio INT NOT NULL,
    numero_dau VARCHAR(30) UNIQUE,  -- Número del Documento Único Aduanero (DAU)
    agente_aduana VARCHAR(100),  -- Nombre del agente de aduanas
    fecha_presentacion DATE,
    fecha_liquidacion DATE,
    fecha_liberacion DATE,
    tipo_regimen VARCHAR(50),  -- Régimen aduanero (importación definitiva, temporal, etc.)
    canal ENUM('Verde', 'Amarillo', 'Rojo', 'Naranja') NOT NULL,  -- Canal de asignación en aduana
    observaciones TEXT,
    FOREIGN KEY (id_envio) REFERENCES Envios(id_envio)
) COMMENT 'Información sobre el proceso de desaduanización en Ecuador';

-- Tabla de Costos de Importación (desglose de todos los costos asociados)
CREATE TABLE CostosImportacion (
    id_costo INT PRIMARY KEY AUTO_INCREMENT,
    id_envio INT NOT NULL,
    tipo_costo ENUM('Flete Internacional', 'Seguro Internacional', 'Arancel Ad-Valorem', 'IVA', 'ICE', 'FODINFA', 'Almacenaje', 'Transporte Local', 'Honorarios Agente Aduana', 'Otros Impuestos', 'Multas', 'Otros') NOT NULL,
    monto DECIMAL(12,2) NOT NULL,
    moneda VARCHAR(3) DEFAULT 'USD',  -- En Ecuador los impuestos se pagan en USD
    fecha_pago DATE,
    descripcion TEXT,
    comprobante VARCHAR(50),  -- Número de factura/comprobante
    FOREIGN KEY (id_envio) REFERENCES Envios(id_envio)
) COMMENT 'Registro de todos los costos asociados a la importación';

-- Tabla de Pagos (registro de pagos realizados)
CREATE TABLE Pagos (
    id_pago INT PRIMARY KEY AUTO_INCREMENT,
    id_importador INT NOT NULL,
    id_envio INT,  -- Puede ser NULL si el pago no está asociado a un envío específico
    tipo_pago ENUM('Anticipo Proveedor', 'Pago Proveedor', 'Pago Impuestos', 'Pago Flete', 'Pago Agente Aduana', 'Otros') NOT NULL,
    monto DECIMAL(12,2) NOT NULL,
    moneda VARCHAR(3) NOT NULL,
    tipo_cambio DECIMAL(10,4),  -- Tipo de cambio aplicado si fue en otra moneda
    fecha_pago DATE NOT NULL,
    metodo_pago ENUM('Transferencia', 'Cheque', 'Tarjeta', 'Efectivo') NOT NULL,
    referencia VARCHAR(50),  -- Número de referencia/transacción
    observaciones TEXT,
    FOREIGN KEY (id_importador) REFERENCES Importadores(id_importador),
    FOREIGN KEY (id_envio) REFERENCES Envios(id_envio)
) COMMENT 'Registro de pagos realizados por el importador';

-- Tabla de Inventario (registro de mercancía recibida)
CREATE TABLE Inventario (
    id_item_inventario INT PRIMARY KEY AUTO_INCREMENT,
    id_envio INT NOT NULL,
    id_producto INT NOT NULL,
    cantidad_recibida INT NOT NULL,
    lote_proveedor VARCHAR(50),  -- Número de lote del proveedor
    fecha_ingreso DATE NOT NULL,
    ubicacion VARCHAR(100),  -- Ubicación en almacén
    estado ENUM('Bueno', 'Dañado', 'Faltante', 'Rechazado') DEFAULT 'Bueno',
    FOREIGN KEY (id_envio) REFERENCES Envios(id_envio),
    FOREIGN KEY (id_producto) REFERENCES Productos(id_producto)
) COMMENT 'Registro de mercancía recibida y su estado al ingreso';

-- Tabla de Liquidación de Aduana (cálculo de impuestos)
CREATE TABLE LiquidacionAduana (
    id_liquidacion INT PRIMARY KEY AUTO_INCREMENT,
    id_gestion INT NOT NULL,
    base_imponible DECIMAL(12,2) NOT NULL,  -- Valor CIF en USD
    arancel_advalorem DECIMAL(12,2) NOT NULL,
    iva DECIMAL(12,2) NOT NULL,
    ice DECIMAL(12,2) DEFAULT 0,  -- Impuesto a Consumos Especiales (si aplica)
    fodinfra DECIMAL(12,2) DEFAULT 0,  -- Fondo de Desarrollo Infantil
    total_impuestos DECIMAL(12,2) GENERATED ALWAYS AS (arancel_advalorem + iva + ice + fodinfra) STORED,
    fecha_liquidacion DATE NOT NULL,
    numero_liquidacion VARCHAR(30) NOT NULL,
    FOREIGN KEY (id_gestion) REFERENCES GestionAduanera(id_gestion)
) COMMENT 'Cálculo detallado de los impuestos pagados en aduana';

-- Tabla de Auditoría (registro de cambios importantes)
CREATE TABLE AuditoriaImportaciones (
    id_auditoria INT PRIMARY KEY AUTO_INCREMENT,
    tabla_afectada VARCHAR(50) NOT NULL,
    id_registro INT NOT NULL,
    accion ENUM('INSERT', 'UPDATE', 'DELETE') NOT NULL,
    usuario VARCHAR(50) NOT NULL,
    fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
    valores_anteriores TEXT,
    valores_nuevos TEXT
) COMMENT 'Registro de auditoría para cambios importantes en el sistema';