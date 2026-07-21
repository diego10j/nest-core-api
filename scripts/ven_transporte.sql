-- ============================================================================
-- Módulo: Ventas / Transportes
-- Tablas para gestión de empresas de transporte y tarifas de envío
-- Estándar: prefijo ven_, sufijo de columna consistente (_vgtra, _vgttr)
-- ============================================================================

-- 1. Transportes (empresas que realizan envíos)
CREATE TABLE IF NOT EXISTS ven_transporte (
    ide_vgtra               SERIAL PRIMARY KEY,
    ide_geper               INTEGER NOT NULL,              -- FK gen_persona (empresa de transporte)
    nombre_vgtra            VARCHAR(100) NOT NULL,         -- Nombre corto / alias comercial
    descripcion_vgtra       TEXT,                          -- Notas u observaciones
    logo_vgtra              VARCHAR(500),                  -- Path del logo de la empresa de transporte
    cobertura_nacional_vgtra BOOLEAN NOT NULL DEFAULT FALSE,-- ¿Cubre todas las provincias del país?
    flete_cobro_vgtra       BOOLEAN NOT NULL DEFAULT FALSE,-- ¿Permite cobrar flete al entregar?
    activo_vgtra            BOOLEAN NOT NULL DEFAULT TRUE,
    ide_empr                INTEGER NOT NULL,
    ide_sucu                INTEGER NOT NULL,
    usuario_ingre           VARCHAR(50),
    fecha_ingre             DATE DEFAULT CURRENT_DATE,
    hora_ingre              TIME DEFAULT CURRENT_TIME,
    usuario_actua           VARCHAR(50),
    fecha_actua             DATE,
    hora_actua              TIME,

    CONSTRAINT fk_ven_transporte_geper
        FOREIGN KEY (ide_geper) REFERENCES gen_persona (ide_geper),
    CONSTRAINT fk_ven_transporte_empr
        FOREIGN KEY (ide_empr) REFERENCES sis_empresa (ide_empr),
    CONSTRAINT fk_ven_transporte_sucu
        FOREIGN KEY (ide_sucu) REFERENCES sis_sucursal (ide_sucu),
    CONSTRAINT uq_ven_transporte_geper UNIQUE (ide_geper)
);

COMMENT ON TABLE  ven_transporte IS 'Empresas de transporte que realizan envíos de facturas/guías';
COMMENT ON COLUMN ven_transporte.cobertura_nacional_vgtra IS 'Si TRUE, el transporte está disponible para todas las provincias aunque no tenga tarifa configurada';
COMMENT ON COLUMN ven_transporte.flete_cobro_vgtra IS 'Si TRUE, el transporte permite cobrar el flete al destinatario al momento de la entrega';

-- 2. Tarifas de transporte (destinos + hasta 4 rangos de precio por destino)
CREATE TABLE IF NOT EXISTS ven_tarifa_transporte (
    ide_vgttr               SERIAL PRIMARY KEY,
    ide_vgtra               INTEGER NOT NULL,              -- FK ven_transporte
    ide_geprov              INTEGER NOT NULL,              -- FK gen_provincia (provincia destino)
    ide_gecant              INTEGER NOT NULL,              -- FK gen_canton (cantón destino)
    ciudad_vgttr            VARCHAR(100),                  -- Ciudad destino (texto libre opcional, puede ser múltiple separado por coma)

    -- Tarifa 1
    nombre1_vgttr           VARCHAR(100),                  -- Ej: "1-25 kg", "Sobre hasta 500g"
    precio1_vgttr           NUMERIC(10,2),                 -- Precio en dólares
    descripcion1_vgttr      VARCHAR(200),                  -- Detalle adicional
    activo1_vgttr           BOOLEAN DEFAULT TRUE,

    -- Tarifa 2
    nombre2_vgttr           VARCHAR(100),
    precio2_vgttr           NUMERIC(10,2),
    descripcion2_vgttr      VARCHAR(200),
    activo2_vgttr           BOOLEAN DEFAULT TRUE,

    -- Tarifa 3
    nombre3_vgttr           VARCHAR(100),
    precio3_vgttr           NUMERIC(10,2),
    descripcion3_vgttr      VARCHAR(200),
    activo3_vgttr           BOOLEAN DEFAULT TRUE,

    -- Tarifa 4
    nombre4_vgttr           VARCHAR(100),
    precio4_vgttr           NUMERIC(10,2),
    descripcion4_vgttr      VARCHAR(200),
    activo4_vgttr           BOOLEAN DEFAULT TRUE,

    comentario_vgttr        TEXT,                          -- Notas generales del destino
    activo_vgttr            BOOLEAN NOT NULL DEFAULT TRUE,
    ide_empr                INTEGER NOT NULL,
    ide_sucu                INTEGER NOT NULL,
    usuario_ingre           VARCHAR(50),
    fecha_ingre             DATE DEFAULT CURRENT_DATE,
    hora_ingre              TIME DEFAULT CURRENT_TIME,
    usuario_actua           VARCHAR(50),
    fecha_actua             DATE,
    hora_actua              TIME,

    CONSTRAINT fk_ven_tarifa_transporte_vgtra
        FOREIGN KEY (ide_vgtra) REFERENCES ven_transporte (ide_vgtra),
    CONSTRAINT fk_ven_tarifa_transporte_geprov
        FOREIGN KEY (ide_geprov) REFERENCES gen_provincia (ide_geprov),
    CONSTRAINT fk_ven_tarifa_transporte_gecant
        FOREIGN KEY (ide_gecant) REFERENCES gen_canton (ide_gecant),
    CONSTRAINT fk_ven_tarifa_transporte_empr
        FOREIGN KEY (ide_empr) REFERENCES sis_empresa (ide_empr),
    CONSTRAINT fk_ven_tarifa_transporte_sucu
        FOREIGN KEY (ide_sucu) REFERENCES sis_sucursal (ide_sucu),
    CONSTRAINT uq_ven_tarifa_transporte UNIQUE (ide_vgtra, ide_geprov, ide_gecant)
);

COMMENT ON TABLE ven_tarifa_transporte IS 'Tarifas de envío por transporte, provincia y cantón (hasta 4 rangos de precio)';

-- Migración: si la tabla ya existe sin ide_gecant, agregar columna y ajustar restricción
-- ALTER TABLE ven_tarifa_transporte ADD COLUMN IF NOT EXISTS ide_gecant INTEGER;
-- ALTER TABLE ven_tarifa_transporte DROP CONSTRAINT IF EXISTS uq_ven_tarifa_transporte;
-- ALTER TABLE ven_tarifa_transporte ADD CONSTRAINT uq_ven_tarifa_transporte UNIQUE (ide_vgtra, ide_geprov, ide_gecant);

-- ============================================================================
-- Índices sugeridos
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_ven_transporte_activo ON ven_transporte (activo_vgtra) WHERE activo_vgtra = TRUE;
CREATE INDEX IF NOT EXISTS idx_ven_tarifa_transporte_vgtra ON ven_tarifa_transporte (ide_vgtra);
CREATE INDEX IF NOT EXISTS idx_ven_tarifa_transporte_ciudad ON ven_tarifa_transporte (ide_geprov, ciudad_vgttr);
CREATE INDEX IF NOT EXISTS idx_ven_tarifa_transporte_gecant ON ven_tarifa_transporte (ide_geprov, ide_gecant);

-- ============================================================================
-- 3. Estados de envío (catálogo global, sin ide_empr)
-- ============================================================================
CREATE TABLE IF NOT EXISTS cxc_estado_envio (
    ide_cceen               SERIAL PRIMARY KEY,
    nombre_cceen            VARCHAR(50) NOT NULL,
    descripcion_cceen       VARCHAR(200),
    color_cceen             VARCHAR(30) DEFAULT 'default',
    icono_cceen             VARCHAR(100),
    orden_cceen             INTEGER NOT NULL DEFAULT 0,
    activo_cceen            BOOLEAN NOT NULL DEFAULT TRUE
);

COMMENT ON TABLE cxc_estado_envio IS 'Catálogo de estados para el seguimiento de envíos';

-- Estados iniciales
INSERT INTO cxc_estado_envio (nombre_cceen, descripcion_cceen, color_cceen, icono_cceen, orden_cceen) VALUES
    ('PENDIENTE',          'Envío registrado, pendiente de recolectar',      'info',    'fluent:clock-24-regular',           1),
    ('EN RUTA',            'Transporte en camino al destino',                'warning', 'fluent:vehicle-truck-24-regular',    2),
    ('ENVIADO',            'Mercadería despachada',                          'info',    'fluent:send-24-regular',            3),
    ('ENTREGADO',          'Entrega confirmada por el destinatario',         'success', 'fluent:checkmark-circle-24-regular', 4),
    ('FINALIZADO',         'Envío cerrado sin novedades',                    'success', 'fluent:task-list-square-24-regular', 5),
    ('PROBLEMA DE ENTREGA','Incidencia reportada: dirección incorrecta, daño, rechazo, etc.', 'error', 'fluent:error-circle-24-regular', 6);

-- ============================================================================
-- 4. Envíos / tracking de transporte por factura
--    Una factura puede tener múltiples registros (re-envíos por incidencias).
--    Si una factura NO tiene registros aquí → el cliente retiró en sucursal.
-- ============================================================================
CREATE TABLE IF NOT EXISTS cxc_transporte_factura (
    ide_cctfa               SERIAL PRIMARY KEY,
    ide_cccfa               INTEGER NOT NULL,              -- FK cxc_cabece_factura
    ide_vgtra               INTEGER,                       -- FK ven_transporte (NULL = retiro en sucursal)
    es_transporte_propio_cctfa BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE = transporte propio, FALSE = empresa externa
    ide_gecam               VARCHAR(15),                   -- FK gen_camion (vehículo asignado, se define en la ruta)
    ide_geper               INTEGER,                       -- FK gen_persona (chofer asignado, se define en la ruta)
    ide_cceen               INTEGER NOT NULL,              -- FK cxc_estado_envio (estado actual del envío)

    -- Fechas
    fecha_inicio_cctfa      DATE,                          -- Fecha estimada de inicio del traslado
    fecha_fin_cctfa         DATE,                          -- Fecha estimada de entrega
    fecha_fin_real_cctfa    DATE,                          -- Fecha real de entrega (cuando se confirma)

    -- Comprobante de entrega
    path_imagen_guia_cctfa  VARCHAR(500),                  -- Ruta de la imagen de la guía firmada

    -- Valores cotizados / sistema (lo que se facturó al cliente por el flete)
    base_flete_cctfa        NUMERIC(10,2) DEFAULT 0,
    valor_iva_flete_cctfa   NUMERIC(10,2) DEFAULT 0,
    total_flete_cctfa       NUMERIC(10,2) DEFAULT 0,

    -- Valores reales (lo que efectivamente cobró el transporte)
    base_flete_real_cctfa   NUMERIC(10,2) DEFAULT 0,
    valor_iva_flete_real_cctfa NUMERIC(10,2) DEFAULT 0,
    total_flete_real_cctfa  NUMERIC(10,2) DEFAULT 0,

    -- Flete pagado por el cliente (TRUE) o flete al cobro en destino (FALSE)
    flete_pagado_cctfa      BOOLEAN NOT NULL DEFAULT TRUE,

    comentario_cctfa        TEXT,

    ide_empr                INTEGER NOT NULL,
    ide_sucu                INTEGER NOT NULL,
    usuario_ingre           VARCHAR(50),
    fecha_ingre             DATE DEFAULT CURRENT_DATE,
    hora_ingre              TIME DEFAULT CURRENT_TIME,
    usuario_actua           VARCHAR(50),
    fecha_actua             DATE,
    hora_actua              TIME,

    CONSTRAINT fk_cxc_transporte_factura_cccfa
        FOREIGN KEY (ide_cccfa) REFERENCES cxc_cabece_factura (ide_cccfa),
    CONSTRAINT fk_cxc_transporte_factura_vgtra
        FOREIGN KEY (ide_vgtra) REFERENCES ven_transporte (ide_vgtra),
    CONSTRAINT fk_cxc_transporte_factura_cceen
        FOREIGN KEY (ide_cceen) REFERENCES cxc_estado_envio (ide_cceen),
    CONSTRAINT fk_cxc_transporte_factura_gecam
        FOREIGN KEY (ide_gecam) REFERENCES gen_camion (placa_gecam),
    CONSTRAINT fk_cxc_transporte_factura_geper
        FOREIGN KEY (ide_geper) REFERENCES gen_persona (ide_geper),
    CONSTRAINT fk_cxc_transporte_factura_empr
        FOREIGN KEY (ide_empr) REFERENCES sis_empresa (ide_empr),
    CONSTRAINT fk_cxc_transporte_factura_sucu
        FOREIGN KEY (ide_sucu) REFERENCES sis_sucursal (ide_sucu)
);

COMMENT ON TABLE cxc_transporte_factura IS 'Seguimiento de envíos por factura. Sin registro = cliente retiró en sucursal';
COMMENT ON COLUMN cxc_transporte_factura.es_transporte_propio_cctfa IS 'TRUE = vehículo propio, FALSE = empresa de transporte externa';
COMMENT ON COLUMN cxc_transporte_factura.ide_gecam IS 'Vehículo + chofer asignados al crear la ruta diaria (NULL hasta que se planifique)';
COMMENT ON COLUMN cxc_transporte_factura.flete_pagado_cctfa IS 'TRUE = flete prepagado por el cliente, FALSE = flete al cobro en destino';
COMMENT ON COLUMN cxc_transporte_factura.path_imagen_guia_cctfa IS 'Ruta en disco/cloud de la imagen de la guía de entrega firmada';

-- ============================================================================
-- Índices
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_cxc_transporte_factura_cccfa ON cxc_transporte_factura (ide_cccfa);
CREATE INDEX IF NOT EXISTS idx_cxc_transporte_factura_vgtra ON cxc_transporte_factura (ide_vgtra);
CREATE INDEX IF NOT EXISTS idx_cxc_transporte_factura_cceen ON cxc_transporte_factura (ide_cceen);
CREATE INDEX IF NOT EXISTS idx_cxc_transporte_factura_fechas ON cxc_transporte_factura (fecha_inicio_cctfa, fecha_fin_real_cctfa);

-- ============================================================================
-- 5. Rutas diarias de vehículos (planificación de entregas, retiros, otros)
--    Una ruta agrupa múltiples paradas/destinos asignados a un vehículo + chofer
--    para una fecha determinada.
-- ============================================================================
CREATE TABLE IF NOT EXISTS ven_ruta (
    ide_vgrta               SERIAL PRIMARY KEY,
    ide_gecam               VARCHAR(15) NOT NULL,           -- FK gen_camion (vehículo asignado)
    ide_geper               INTEGER NOT NULL,              -- FK gen_persona (chofer / responsable)
    ide_usua                INTEGER NOT NULL,              -- FK sis_usuario (quién generó la ruta)
    fecha_ruta_vgrta        DATE NOT NULL,                 -- Fecha de la ruta

    nombre_vgrta            VARCHAR(100),                  -- Ej: "Ruta Zona Norte AM"
    latitud_inicio_vgrta    NUMERIC(10,7),                 -- Punto de partida (empresa)
    longitud_inicio_vgrta   NUMERIC(10,7),
    direccion_inicio_vgrta  VARCHAR(300),                  -- Dirección de partida legible

    comentario_vgrta        TEXT,
    activo_vgrta            BOOLEAN NOT NULL DEFAULT TRUE,
    ide_empr                INTEGER NOT NULL,
    ide_sucu                INTEGER NOT NULL,
    usuario_ingre           VARCHAR(50),
    fecha_ingre             DATE DEFAULT CURRENT_DATE,
    hora_ingre              TIME DEFAULT CURRENT_TIME,
    usuario_actua           VARCHAR(50),
    fecha_actua             DATE,
    hora_actua              TIME,

    CONSTRAINT fk_ven_ruta_gecam
        FOREIGN KEY (ide_gecam) REFERENCES gen_camion (placa_gecam),
    CONSTRAINT fk_ven_ruta_geper
        FOREIGN KEY (ide_geper) REFERENCES gen_persona (ide_geper),
    CONSTRAINT fk_ven_ruta_usua
        FOREIGN KEY (ide_usua) REFERENCES sis_usuario (ide_usua),
    CONSTRAINT fk_ven_ruta_empr
        FOREIGN KEY (ide_empr) REFERENCES sis_empresa (ide_empr),
    CONSTRAINT fk_ven_ruta_sucu
        FOREIGN KEY (ide_sucu) REFERENCES sis_sucursal (ide_sucu)
);

COMMENT ON TABLE ven_ruta IS 'Planificación diaria de rutas de vehículos (entregas, retiros, otros)';
COMMENT ON COLUMN ven_ruta.latitud_inicio_vgrta IS 'Punto de partida de la ruta (coordenadas de la empresa por defecto)';
COMMENT ON COLUMN ven_ruta.fecha_ruta_vgrta IS 'Fecha para la cual se planifica la ruta';

-- ============================================================================
-- 6. Detalle de ruta (paradas / destinos)
--    Cada fila representa un punto de parada con su orden, tipo y estado.
--    Se puede reordenar, agregar o quitar sobre la marcha.
--    Paradas no completadas pueden migrarse a la ruta del día siguiente.
-- ============================================================================
CREATE TABLE IF NOT EXISTS ven_ruta_det (
    ide_vgrtd               SERIAL PRIMARY KEY,
    ide_vgrta               INTEGER NOT NULL,              -- FK ven_ruta (ruta padre)
    orden_vgrtd             INTEGER NOT NULL,              -- Orden de la parada (1,2,3...)
    tipo_vgrtd              VARCHAR(20) NOT NULL DEFAULT 'ENTREGA', -- ENTREGA | RETIRO | OTRO

    -- Vinculación opcional a factura y tracking de envío
    ide_cccfa               INTEGER,                       -- FK cxc_cabece_factura (si es entrega de factura)
    ide_cctfa               INTEGER,                       -- FK cxc_transporte_factura (tracking del envío)

    descripcion_vgrtd       VARCHAR(300) NOT NULL,         -- Qué se hace en esta parada

    -- Coordenadas del destino
    latitud_vgrtd           NUMERIC(10,7),
    longitud_vgrtd          NUMERIC(10,7),
    direccion_vgrtd         VARCHAR(300),                  -- Dirección legible

    -- Control de cumplimiento
    realizado_vgrtd         BOOLEAN NOT NULL DEFAULT FALSE,
    comentario_vgrtd        TEXT,                          -- Notas: "cliente no atendió", "reprogramado", etc.

    usuario_ingre           VARCHAR(50),
    fecha_ingre             DATE DEFAULT CURRENT_DATE,
    hora_ingre              TIME DEFAULT CURRENT_TIME,
    usuario_actua           VARCHAR(50),
    fecha_actua             DATE,
    hora_actua              TIME,

    CONSTRAINT fk_ven_ruta_det_vgrta
        FOREIGN KEY (ide_vgrta) REFERENCES ven_ruta (ide_vgrta) ON DELETE CASCADE,
    CONSTRAINT fk_ven_ruta_det_cccfa
        FOREIGN KEY (ide_cccfa) REFERENCES cxc_cabece_factura (ide_cccfa),
    CONSTRAINT fk_ven_ruta_det_cctfa
        FOREIGN KEY (ide_cctfa) REFERENCES cxc_transporte_factura (ide_cctfa)
);

COMMENT ON TABLE ven_ruta_det IS 'Paradas/destinos de una ruta diaria. Se reordena, agrega o quita sobre la marcha';
COMMENT ON COLUMN ven_ruta_det.tipo_vgrtd IS 'ENTREGA = delivery de factura, RETIRO = recoger producto/proveedor, OTRO = gestión interna';
COMMENT ON COLUMN ven_ruta_det.realizado_vgrtd IS 'TRUE cuando el chofer confirma que la parada fue completada';
COMMENT ON COLUMN ven_ruta_det.latitud_vgrtd IS 'Coordenadas del destino (desde gen_direccion, Google Maps o ingreso manual)';

-- ============================================================================
-- Índices
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_ven_ruta_fecha ON ven_ruta (fecha_ruta_vgrta, ide_empr);
CREATE INDEX IF NOT EXISTS idx_ven_ruta_gecam ON ven_ruta (ide_gecam);
CREATE INDEX IF NOT EXISTS idx_ven_ruta_det_vgrta ON ven_ruta_det (ide_vgrta);
CREATE INDEX IF NOT EXISTS idx_ven_ruta_det_cccfa ON ven_ruta_det (ide_cccfa);
CREATE INDEX IF NOT EXISTS idx_ven_ruta_det_realizado ON ven_ruta_det (ide_vgrta, realizado_vgrtd);

-- ============================================================================
-- ALTER TABLE cxc_transporte_factura — Campos para envío por correo
-- ============================================================================
ALTER TABLE cxc_transporte_factura
    ADD COLUMN IF NOT EXISTS enviar_por_correo_cctfa BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE cxc_transporte_factura
    ADD COLUMN IF NOT EXISTS correo_cctfa VARCHAR(200);

ALTER TABLE cxc_transporte_factura
    ADD COLUMN IF NOT EXISTS fecha_envio_cctfa TIMESTAMP;

COMMENT ON COLUMN cxc_transporte_factura.enviar_por_correo_cctfa IS 'TRUE = enviar guía de entrega al cliente por correo electrónico';
COMMENT ON COLUMN cxc_transporte_factura.correo_cctfa IS 'Correo electrónico del destinatario para envío de guía';
COMMENT ON COLUMN cxc_transporte_factura.fecha_envio_cctfa IS 'Fecha y hora en que se envió la guía por correo';
