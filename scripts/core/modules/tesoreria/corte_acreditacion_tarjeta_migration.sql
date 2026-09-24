-- =============================================================================
-- MIGRACIÓN: Cortes y acreditaciones de cobros con tarjeta (procesador Bendo)
-- Fecha: 2026-09-24
-- Ejecutar DESPUÉS de tesoreria/devolucion_cobro_tarjeta_retencion_migration.sql
-- Descripción:
--   Bendo acredita cada pago por transferencia hasta 72 h después (casi siempre 1 pago = 1
--   transferencia) y emite en dos cortes al mes una factura de comisión y un comprobante de
--   retención sobre el MISMO conjunto de pagos, que no coincide con los depósitos. Son tres
--   agrupaciones N:M independientes, por lo que se registran por separado y en cualquier orden:
--
--   * ACREDITACIÓN (tes_cab_devol_cobro_tarjeta): la transferencia del neto a la cuenta real.
--     Cubre 1..N pagos (tes_det_devol_cobro_tarjeta_fact) y guarda, por pago, los valores que el
--     procesador aplicó según el Excel de liquidación (comisión, IVA de comisión, retención IVA e
--     IR). El neto por pago = bruto - comisión - IVA comisión - retención (no se guarda).
--   * CORTE (tes_cab_corte_tarjeta): la factura de comisión y/o el comprobante de retención de un
--     corte, con los pagos que cubren (tes_det_corte_tarjeta) y los movimientos de libro banco
--     que los contabilizaron contra la cuenta de tarjeta.
--
--   Los ciclos anteriores (comisión + retención + transferencia juntas) siguen siendo válidos:
--   por eso ide_cpcfa e ide_teclb_pago_comision pasan a ser opcionales en el ciclo.
--
--   Idempotente: se puede ejecutar más de una vez.
-- =============================================================================

-- ============================================================
-- 1. Acreditación: comisión/retención opcionales + valores por pago del Excel
-- ============================================================
ALTER TABLE tes_cab_devol_cobro_tarjeta
    ALTER COLUMN ide_cpcfa DROP NOT NULL,
    ALTER COLUMN ide_teclb_pago_comision DROP NOT NULL;

ALTER TABLE tes_det_devol_cobro_tarjeta_fact
    ADD COLUMN IF NOT EXISTS valor_comision_tedtf NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS valor_iva_comision_tedtf NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS valor_ret_iva_tedtf NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS valor_ret_renta_tedtf NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS numero_liquidacion_tedtf VARCHAR(40);

COMMENT ON COLUMN tes_det_devol_cobro_tarjeta_fact.valor_comision_tedtf IS
    'Comisión (sin IVA) que el procesador aplicó a este pago según su Excel de liquidación. NULL en ciclos anteriores al Excel.';

-- ============================================================
-- 2. Corte: factura de comisión + comprobante de retención sobre un conjunto de pagos
-- ============================================================
CREATE TABLE IF NOT EXISTS tes_cab_corte_tarjeta (
    ide_tecct BIGINT NOT NULL,
    ide_empr BIGINT NOT NULL,
    ide_sucu BIGINT NOT NULL,
    -- Cuenta del procesador de tarjeta contra la que se contabilizan comisión y retención
    ide_tecba BIGINT NOT NULL,
    fecha_tecct DATE NOT NULL,

    -- Factura de compra de la comisión (cxp_cabece_factur) y el movimiento que la pagó
    ide_geper BIGINT,
    ide_cpcfa BIGINT,
    ide_teclb_pago_comision BIGINT,

    -- Comprobante de retención (con_cabece_retenc) y el movimiento que lo descontó
    ide_cncre BIGINT,
    ide_teclb_debito_retencion BIGINT,

    observacion_tecct VARCHAR(300),

    anulado_tecct BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_anula_tecct TIMESTAMP,
    usuario_anula VARCHAR(50),
    motivo_anula_tecct VARCHAR(300),

    usuario_ingre VARCHAR(50),
    hora_ingre TIMESTAMP DEFAULT NOW(),

    CONSTRAINT pk_tes_cab_corte_tarjeta PRIMARY KEY (ide_tecct),
    CONSTRAINT tes_cab_corte_tarjeta_docs_chk CHECK (ide_cpcfa IS NOT NULL OR ide_cncre IS NOT NULL),
    CONSTRAINT tes_cab_corte_tarjeta_empr_fkey
        FOREIGN KEY (ide_empr) REFERENCES sis_empresa(ide_empr) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_cab_corte_tarjeta_sucu_fkey
        FOREIGN KEY (ide_sucu) REFERENCES sis_sucursal(ide_sucu) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_cab_corte_tarjeta_tecba_fkey
        FOREIGN KEY (ide_tecba) REFERENCES tes_cuenta_banco(ide_tecba) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_cab_corte_tarjeta_geper_fkey
        FOREIGN KEY (ide_geper) REFERENCES gen_persona(ide_geper) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_cab_corte_tarjeta_cpcfa_fkey
        FOREIGN KEY (ide_cpcfa) REFERENCES cxp_cabece_factur(ide_cpcfa) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_cab_corte_tarjeta_teclb_pago_fkey
        FOREIGN KEY (ide_teclb_pago_comision) REFERENCES tes_cab_libr_banc(ide_teclb) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_cab_corte_tarjeta_cncre_fkey
        FOREIGN KEY (ide_cncre) REFERENCES con_cabece_retenc(ide_cncre) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_cab_corte_tarjeta_teclb_ret_fkey
        FOREIGN KEY (ide_teclb_debito_retencion) REFERENCES tes_cab_libr_banc(ide_teclb) ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- Una factura de comisión / un comprobante solo pueden estar en UN corte vigente (al anular el
-- corte quedan libres para registrarse de nuevo).
CREATE UNIQUE INDEX IF NOT EXISTS uq_tecct_cpcfa_vigente
    ON tes_cab_corte_tarjeta (ide_cpcfa) WHERE ide_cpcfa IS NOT NULL AND anulado_tecct = FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tecct_cncre_vigente
    ON tes_cab_corte_tarjeta (ide_cncre) WHERE ide_cncre IS NOT NULL AND anulado_tecct = FALSE;
CREATE INDEX IF NOT EXISTS idx_tecct_tecba ON tes_cab_corte_tarjeta (ide_tecba);

COMMENT ON TABLE tes_cab_corte_tarjeta IS
    'Corte de un procesador de tarjeta (ej. Bendo): factura de comisión y/o comprobante de retención emitidos sobre el mismo conjunto de pagos con tarjeta, con los movimientos de libro banco que los contabilizaron contra la cuenta de tarjeta.';

CREATE TABLE IF NOT EXISTS tes_det_corte_tarjeta (
    ide_tedct BIGINT NOT NULL,
    ide_tecct BIGINT NOT NULL,
    ide_cccfa BIGINT NOT NULL,
    usuario_ingre VARCHAR(50),
    hora_ingre TIMESTAMP DEFAULT NOW(),

    CONSTRAINT pk_tes_det_corte_tarjeta PRIMARY KEY (ide_tedct),
    CONSTRAINT tes_det_corte_tarjeta_tecct_fkey
        FOREIGN KEY (ide_tecct) REFERENCES tes_cab_corte_tarjeta(ide_tecct) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_det_corte_tarjeta_cccfa_fkey
        FOREIGN KEY (ide_cccfa) REFERENCES cxc_cabece_factura(ide_cccfa) ON DELETE RESTRICT ON UPDATE RESTRICT,
    -- Un pago pertenece a un solo corte (las filas se eliminan al anular el corte)
    CONSTRAINT tes_det_corte_tarjeta_cccfa_unique UNIQUE (ide_cccfa)
);

CREATE INDEX IF NOT EXISTS idx_tedct_tecct ON tes_det_corte_tarjeta (ide_tecct);

COMMENT ON TABLE tes_det_corte_tarjeta IS
    'Pagos con tarjeta (facturas de venta) que ampara un corte del procesador.';
