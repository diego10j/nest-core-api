-- =============================================================================
-- MIGRACIÓN: Devolución de Cobros con Tarjeta (Tesorería)
-- Fecha: 2026-08-24
-- Descripción:
--   Trazabilidad del ciclo completo de un cobro con tarjeta que llega a través
--   de un procesador (ej. Bendo, Payphone): factura(s) de venta cobradas con
--   tarjeta -> factura de comisión del proveedor (CxP) -> retención SRI que el
--   proveedor nos emite (opcional) -> transferencia del neto a la cuenta bancaria
--   real. Cada fila de tes_cab_devol_cobro_tarjeta amarra un ciclo completo y deja
--   la cuenta del proveedor de tarjeta en cero.
-- =============================================================================

-- ============================================================
-- 1. Cuenta destino de acreditación por defecto (tes_cuenta_banco)
-- ============================================================
-- Solo tiene sentido para cuentas cuyo banco está marcado como tarjeta
-- (tes_banco.es_tarjeta_teban = true) - es la cuenta bancaria real donde el
-- procesador deposita el neto de los cobros con tarjeta (ej. Banco Guayaquil).
-- Precarga el campo "cuenta destino" del wizard de Devolución de Cobros con
-- Tarjeta, pero queda editable en cada ejecución.
ALTER TABLE tes_cuenta_banco
    ADD COLUMN IF NOT EXISTS ide_tecba_destino_acredit BIGINT;

ALTER TABLE tes_cuenta_banco
    ADD CONSTRAINT tes_cuenta_banco_destino_acredit_fkey
    FOREIGN KEY (ide_tecba_destino_acredit) REFERENCES tes_cuenta_banco(ide_tecba)
    ON DELETE SET NULL ON UPDATE RESTRICT;

COMMENT ON COLUMN tes_cuenta_banco.ide_tecba_destino_acredit IS
    'FK a tes_cuenta_banco: cuenta bancaria real donde el procesador de tarjeta acredita el neto de los cobros (ej. Banco Guayaquil). Solo aplica a cuentas de bancos con es_tarjeta_teban = true.';

-- ============================================================
-- 2. Cabecera de Devolución de Cobro con Tarjeta
-- ============================================================
CREATE TABLE IF NOT EXISTS tes_cab_devol_cobro_tarjeta (
    ide_tecdt BIGINT NOT NULL,
    ide_empr BIGINT NOT NULL,
    ide_sucu BIGINT NOT NULL,

    -- Cuenta de tarjeta (procesador) origen del ciclo, ej. cuenta Bendo
    ide_tecba BIGINT NOT NULL,
    -- Proveedor que factura la comisión (ej. Bendo)
    ide_geper BIGINT NOT NULL,
    -- Factura de compra de la comisión (cxp_cabece_factur), cargada o seleccionada
    ide_cpcfa BIGINT NOT NULL,
    -- Comprobante de retención en venta recibido del proveedor (con_cabece_retenc,
    -- es_venta_cncre = true) - opcional, no todos los proveedores lo emiten
    ide_cncre BIGINT,
    -- Comprobante de transferencia bancaria (OCR/IA), tes_info_comprobante_banco
    ide_teincb BIGINT,
    -- Cuenta bancaria real destino de la transferencia del neto
    ide_tecba_destino BIGINT NOT NULL,

    -- Movimientos de libro banco generados por el proceso (todos sobre ide_tecba,
    -- salvo ide_teclb_ingreso que es sobre ide_tecba_destino)
    ide_teclb_pago_comision BIGINT NOT NULL,
    ide_teclb_debito_retencion BIGINT,
    ide_teclb_retiro BIGINT NOT NULL,
    ide_teclb_ingreso BIGINT NOT NULL,

    fecha_tecdt DATE NOT NULL,

    valor_total_cobros_tecdt NUMERIC(12,2) NOT NULL,
    valor_comision_tecdt NUMERIC(12,2) NOT NULL DEFAULT 0,
    valor_iva_comision_tecdt NUMERIC(12,2) NOT NULL DEFAULT 0,
    valor_retencion_iva_tecdt NUMERIC(12,2) NOT NULL DEFAULT 0,
    valor_retencion_renta_tecdt NUMERIC(12,2) NOT NULL DEFAULT 0,
    valor_neto_calculado_tecdt NUMERIC(12,2) NOT NULL,
    valor_neto_transferido_tecdt NUMERIC(12,2) NOT NULL,

    observacion_tecdt VARCHAR(300),

    usuario_ingre VARCHAR(50),
    hora_ingre TIMESTAMP DEFAULT NOW(),
    usuario_actua VARCHAR(50),
    hora_actua TIMESTAMP,

    CONSTRAINT pk_tes_cab_devol_cobro_tarjeta PRIMARY KEY (ide_tecdt),
    CONSTRAINT tes_cab_devol_cobro_tarjeta_empr_fkey
        FOREIGN KEY (ide_empr) REFERENCES sis_empresa(ide_empr)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_cab_devol_cobro_tarjeta_sucu_fkey
        FOREIGN KEY (ide_sucu) REFERENCES sis_sucursal(ide_sucu)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_cab_devol_cobro_tarjeta_tecba_fkey
        FOREIGN KEY (ide_tecba) REFERENCES tes_cuenta_banco(ide_tecba)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_cab_devol_cobro_tarjeta_geper_fkey
        FOREIGN KEY (ide_geper) REFERENCES gen_persona(ide_geper)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_cab_devol_cobro_tarjeta_cpcfa_fkey
        FOREIGN KEY (ide_cpcfa) REFERENCES cxp_cabece_factur(ide_cpcfa)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_cab_devol_cobro_tarjeta_cncre_fkey
        FOREIGN KEY (ide_cncre) REFERENCES con_cabece_retenc(ide_cncre)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_cab_devol_cobro_tarjeta_teincb_fkey
        FOREIGN KEY (ide_teincb) REFERENCES tes_info_comprobante_banco(ide_teincb)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_cab_devol_cobro_tarjeta_tecba_destino_fkey
        FOREIGN KEY (ide_tecba_destino) REFERENCES tes_cuenta_banco(ide_tecba)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_cab_devol_cobro_tarjeta_teclb_pago_fkey
        FOREIGN KEY (ide_teclb_pago_comision) REFERENCES tes_cab_libr_banc(ide_teclb)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_cab_devol_cobro_tarjeta_teclb_debito_fkey
        FOREIGN KEY (ide_teclb_debito_retencion) REFERENCES tes_cab_libr_banc(ide_teclb)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_cab_devol_cobro_tarjeta_teclb_retiro_fkey
        FOREIGN KEY (ide_teclb_retiro) REFERENCES tes_cab_libr_banc(ide_teclb)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_cab_devol_cobro_tarjeta_teclb_ingreso_fkey
        FOREIGN KEY (ide_teclb_ingreso) REFERENCES tes_cab_libr_banc(ide_teclb)
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

COMMENT ON TABLE tes_cab_devol_cobro_tarjeta IS
    'Cabecera de un ciclo de devolución/liquidación de cobros con tarjeta: amarra las facturas de venta cobradas con tarjeta con la factura de comisión del procesador, su retención (opcional) y la transferencia del neto, dejando la cuenta del procesador en cero.';

CREATE INDEX IF NOT EXISTS idx_tecdt_tecba ON tes_cab_devol_cobro_tarjeta(ide_tecba);
CREATE INDEX IF NOT EXISTS idx_tecdt_cpcfa ON tes_cab_devol_cobro_tarjeta(ide_cpcfa);
CREATE INDEX IF NOT EXISTS idx_tecdt_empr_sucu ON tes_cab_devol_cobro_tarjeta(ide_empr, ide_sucu);

-- ============================================================
-- 3. Detalle: facturas de venta cubiertas por la devolución
-- ============================================================
CREATE TABLE IF NOT EXISTS tes_det_devol_cobro_tarjeta_fact (
    ide_tedtf BIGINT NOT NULL,
    ide_tecdt BIGINT NOT NULL,
    ide_cccfa BIGINT NOT NULL,
    valor_cccfa_tedtf NUMERIC(12,2) NOT NULL,

    usuario_ingre VARCHAR(50),
    hora_ingre TIMESTAMP DEFAULT NOW(),

    CONSTRAINT pk_tes_det_devol_cobro_tarjeta_fact PRIMARY KEY (ide_tedtf),
    CONSTRAINT tes_det_devol_cobro_tarjeta_fact_tecdt_fkey
        FOREIGN KEY (ide_tecdt) REFERENCES tes_cab_devol_cobro_tarjeta(ide_tecdt)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_det_devol_cobro_tarjeta_fact_cccfa_fkey
        FOREIGN KEY (ide_cccfa) REFERENCES cxc_cabece_factura(ide_cccfa)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    -- Una factura de venta solo puede quedar cubierta por UNA devolución - evita
    -- reprocesar/duplicar la misma factura en dos ciclos distintos.
    CONSTRAINT tes_det_devol_cobro_tarjeta_fact_cccfa_unique UNIQUE (ide_cccfa)
);

COMMENT ON TABLE tes_det_devol_cobro_tarjeta_fact IS
    'Detalle de tes_cab_devol_cobro_tarjeta: qué facturas de venta cobradas con tarjeta cubre cada ciclo de devolución.';

CREATE INDEX IF NOT EXISTS idx_tedtf_tecdt ON tes_det_devol_cobro_tarjeta_fact(ide_tecdt);
