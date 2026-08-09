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


-- Migración: cuentas tipo tarjeta (Datafast/Banco de Ecuador, Payphone link de pagos, etc.)
-- es_tarjeta_teban identifica al banco/procesador como emisor de cuentas de tarjeta, para
-- filtrarlo en getCuentasTarjeta sin depender del nombre.
ALTER TABLE tes_banco ADD COLUMN es_tarjeta_teban BOOLEAN DEFAULT FALSE;

-- Configuración de comisión de la cuenta de tarjeta - permite parametrizar el descuento que
-- cobra el procesador (Datafast, Payphone, etc.) para calcular cuánto se recibe neto y cuánto
-- hay que aumentar en la factura para no perder margen:
--  - porcentaje_comision_tecba: % de descuento/comisión que cobra el procesador sobre el total
--    cobrado con tarjeta (pago corriente, un solo pago).
--  - permite_diferido_tecba / porcentaje_comision_diferido_tecba: si la cuenta admite pagos
--    diferidos (cuotas), suele tener una comisión distinta (normalmente mayor) a la corriente.
--  - iva_comision_tecba: si el procesador grava IVA sobre su comisión (caso normal, default true).
--  - retiene_iva_tecba / porcentaje_retencion_iva_tecba: si el comercio actúa como agente de
--    retención de IVA sobre la comisión del procesador (retención a favor del comercio).
--  - retiene_renta_tecba / porcentaje_retencion_renta_tecba: idem para retención de Impuesto a
--    la Renta sobre el valor de la comisión.
ALTER TABLE tes_cuenta_banco
    ADD COLUMN porcentaje_comision_tecba NUMERIC(6,3) DEFAULT 0,
    ADD COLUMN permite_diferido_tecba BOOLEAN DEFAULT FALSE,
    ADD COLUMN porcentaje_comision_diferido_tecba NUMERIC(6,3) DEFAULT 0,
    ADD COLUMN iva_comision_tecba BOOLEAN DEFAULT TRUE,
    ADD COLUMN retiene_iva_tecba BOOLEAN DEFAULT FALSE,
    ADD COLUMN porcentaje_retencion_iva_tecba NUMERIC(6,3) DEFAULT 0,
    ADD COLUMN retiene_renta_tecba BOOLEAN DEFAULT FALSE,
    ADD COLUMN porcentaje_retencion_renta_tecba NUMERIC(6,3) DEFAULT 0;