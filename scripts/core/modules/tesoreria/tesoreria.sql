ALTER TABLE "public"."tes_banco"
ADD COLUMN "foto_teban" varchar(200),
ADD COLUMN "color_teban" varchar(50);

ALTER TABLE tes_banco ADD COLUMN usuario_ingre varchar(50); 
ALTER TABLE tes_banco ADD COLUMN hora_ingre TIMESTAMP default now();
ALTER TABLE tes_banco ADD COLUMN usuario_actua varchar(50); 
ALTER TABLE tes_banco ADD COLUMN hora_actua TIMESTAMP;


ALTER TABLE "public"."tes_cuenta_banco"
ADD COLUMN "hace_pagos_tecba" boolean DEFAULT false,
ADD COLUMN "hace_cheque_tecba" boolean DEFAULT false,
ADD COLUMN "activo_tecba" bool DEFAULT 'true';

ALTER TABLE tes_cuenta_banco ADD COLUMN usuario_ingre varchar(50); 
ALTER TABLE tes_cuenta_banco ADD COLUMN hora_ingre TIMESTAMP default now();
ALTER TABLE tes_cuenta_banco ADD COLUMN usuario_actua varchar(50); 
ALTER TABLE tes_cuenta_banco ADD COLUMN hora_actua TIMESTAMP;



-- tabla tes_info_comprobante_banco
CREATE TABLE tes_info_comprobante_banco (
    ide_teincb BIGSERIAL PRIMARY KEY,          -- Auto incremental, evita proveer manualmente
    ide_teclb BIGINT,
    ide_empr BIGINT,
    ide_sucu BIGINT,
    foto_teincb VARCHAR(200),
    tipo_trns_teincb VARCHAR(20) NOT NULL CHECK (tipo_trns_teincb IN ('enviada', 'recibida')),
    valor_teincb NUMERIC(12,2),
    num_comprobante_teincb VARCHAR(50),
    fecha_teincb DATE,
    ordenante_teincb VARCHAR(50),
    cuenta_origen_teincb VARCHAR(50),
    banco_origen_teincb VARCHAR(50),
    beneficiario_teincb VARCHAR(50),
    cuenta_destino_teincb VARCHAR(50),
    banco_destino_teincb VARCHAR(50),
    texto_original_teincb TEXT,                -- JSON con datos originales
    por_ocr_teincb BOOLEAN DEFAULT FALSE,
    por_ia_teincb BOOLEAN DEFAULT FALSE,
    validado_teincb BOOLEAN DEFAULT TRUE,
    fecha_validacion_teincb TIMESTAMP,
    activo_teincb BOOLEAN DEFAULT TRUE,
    es_efectivo_teincb BOOLEAN DEFAULT FALSE,
    valor_entregado_teincb NUMERIC(12,2),
    cambio_teincb NUMERIC(12,2),
    usuario_ingre VARCHAR(50),
    hora_ingre TIMESTAMP DEFAULT NOW(),
    usuario_actua VARCHAR(50),
    hora_actua TIMESTAMP,

    -- Claves foráneas
    CONSTRAINT tes_info_comprobante_banco_ide_empr_fkey
        FOREIGN KEY (ide_empr) REFERENCES sis_empresa(ide_empr)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_info_comprobante_banco_ide_sucu_fkey
        FOREIGN KEY (ide_sucu) REFERENCES sis_sucursal(ide_sucu)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_info_comprobante_banco_ide_teclb_fkey
        FOREIGN KEY (ide_teclb) REFERENCES tes_cab_libr_banc(ide_teclb)
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- Índice sugerido para búsquedas frecuentes por tipo de transacción
CREATE INDEX idx_tipo_trns ON tes_info_comprobante_banco(tipo_trns_teincb);

-- Migración: tipo efectivo (valor entregado + cambio)
-- Ejecutar en BD:
-- ALTER TABLE tes_info_comprobante_banco
--     ADD COLUMN es_efectivo_teincb BOOLEAN DEFAULT FALSE,
--     ADD COLUMN valor_entregado_teincb NUMERIC(12,2),
--     ADD COLUMN cambio_teincb NUMERIC(12,2);