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


---------------

CREATE TABLE "public"."tes_cab_libr_banc" (
    "ide_teclb" int8 NOT NULL,
    "ide_tecba" int8,
    "ide_sucu" int8,
    "ide_tettb" int8,
    "ide_teelb" int8,
    "ide_empr" int8,
    "ide_cnccc" int8,
    "valor_teclb" numeric(12,2) NOT NULL,
    "numero_teclb" varchar(20),
    "fecha_trans_teclb" date,
    "fecha_venci_teclb" date,
    "fec_cam_est_teclb" date,
    "conciliado_teclb" bool,
    "beneficiari_teclb" varchar(150),
    "observacion_teclb" text,
    "num_comprobante_teclb" varchar(30),
    "usuario_ingre" varchar(50),
    "fecha_ingre" date,
    "hora_ingre" time,
    "usuario_actua" varchar(50),
    "fecha_actua" date,
    "hora_actua" time,
    "tes_ide_teclb" int8,
    "tes_ide_teclb1" int8,
    "depositado_teclb" bool DEFAULT false,
    "devuelto_teclb" bool DEFAULT false,
    "ide_teban" int8,
    "fecha_concilia_teclb" date,
    CONSTRAINT "tes_cab_libr_banc_ide_cnccc_fkey" FOREIGN KEY ("ide_cnccc") REFERENCES "public"."con_cab_comp_cont"("ide_cnccc") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "tes_cab_libr_banc_ide_empr_fkey" FOREIGN KEY ("ide_empr") REFERENCES "public"."sis_empresa"("ide_empr") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "tes_cab_libr_banc_ide_sucu_fkey" FOREIGN KEY ("ide_sucu") REFERENCES "public"."sis_sucursal"("ide_sucu") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "tes_cab_libr_banc_ide_teban_fkey" FOREIGN KEY ("ide_teban") REFERENCES "public"."tes_banco"("ide_teban") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "tes_cab_libr_banc_ide_tecba_fkey" FOREIGN KEY ("ide_tecba") REFERENCES "public"."tes_cuenta_banco"("ide_tecba") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "tes_cab_libr_banc_ide_teelb_fkey" FOREIGN KEY ("ide_teelb") REFERENCES "public"."tes_estado_libro_banco"("ide_teelb") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "tes_cab_libr_banc_ide_tettb_fkey" FOREIGN KEY ("ide_tettb") REFERENCES "public"."tes_tip_tran_banc"("ide_tettb") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "tes_cab_libr_banc_tes_ide_teclb1_fkey" FOREIGN KEY ("tes_ide_teclb1") REFERENCES "public"."tes_cab_libr_banc"("ide_teclb") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "tes_cab_libr_banc_tes_ide_teclb_fkey" FOREIGN KEY ("tes_ide_teclb") REFERENCES "public"."tes_cab_libr_banc"("ide_teclb") ON DELETE RESTRICT ON UPDATE RESTRICT,
    PRIMARY KEY ("ide_teclb")
);


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