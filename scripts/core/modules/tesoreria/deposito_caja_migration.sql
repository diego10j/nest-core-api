-- =============================================================================
-- MIGRACIÓN: Depósitos de Caja (Tesorería)
-- Fecha: 2026-08-26
-- Descripción:
--   Trazabilidad de un depósito de caja a banco en DOS etapas:
--     1. GENERADO: el usuario elige la caja, el banco destino y qué movimientos
--        de ingreso pendientes (ventas al contado, cobros, etc.) va a llevar
--        físicamente al banco. Esto solo RESERVA esos movimientos (quedan
--        excluidos de la lista de pendientes de cualquier otro depósito) - aún
--        no se toca el libro bancos ni se genera asiento contable.
--     2. COMPLETADO: cuando el usuario ya hizo el depósito físico, vuelve a
--        este registro y carga fecha real, número de comprobante e imagen. Ahí
--        sí se generan el retiro de caja + el ingreso a banco + el asiento
--        contable (HABER caja / DEBE banco), y los movimientos cubiertos
--        quedan marcados depositado_teclb=true.
--   Anular libera los movimientos reservados en cualquiera de las 2 etapas, y
--   si ya estaba completado además reversa los movimientos y el asiento.
-- =============================================================================

-- ============================================================
-- 1. Cabecera de Depósito de Caja
-- ============================================================
CREATE TABLE IF NOT EXISTS tes_cab_deposito_caja (
    ide_tedca BIGINT NOT NULL,
    ide_empr BIGINT NOT NULL,
    ide_sucu BIGINT NOT NULL,

    -- Caja origen del depósito (cuenta de tipo caja) - elegida al generar
    ide_tecba_origen BIGINT NOT NULL,
    -- Cuenta bancaria real destino del depósito - elegida al generar
    ide_tecba_destino BIGINT NOT NULL,

    -- Movimientos de libro banco generados al COMPLETAR (NULL mientras está
    -- solo "generado")
    ide_teclb_retiro BIGINT,
    ide_teclb_ingreso BIGINT,
    -- Comprobante del depósito (foto/OCR), tes_info_comprobante_banco - se
    -- carga al COMPLETAR
    ide_teincb BIGINT,

    -- Fecha en que se generó/reservó el lote (independiente de cuándo se
    -- complete)
    fecha_genera_tedca DATE NOT NULL DEFAULT CURRENT_DATE,
    -- Fecha real del depósito físico - se carga al COMPLETAR
    fecha_tedca DATE,
    -- Número de comprobante del depósito - se carga al COMPLETAR
    numero_tedca VARCHAR(50),
    -- Suma de los movimientos seleccionados al GENERAR (monto que se envía a depositar)
    valor_tedca NUMERIC(12,2) NOT NULL,
    observacion_tedca VARCHAR(300),

    -- 3 estados posibles: generado (default) -> completado -> [anulado desde
    -- cualquiera de los 2 anteriores]
    completado_tedca BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_completa_tedca TIMESTAMP,
    anulado_tedca BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_anula_tedca TIMESTAMP,
    usuario_anula VARCHAR(50),
    motivo_anula_tedca VARCHAR(300),

    usuario_ingre VARCHAR(50),
    hora_ingre TIMESTAMP DEFAULT NOW(),
    usuario_actua VARCHAR(50),
    hora_actua TIMESTAMP,

    CONSTRAINT pk_tes_cab_deposito_caja PRIMARY KEY (ide_tedca),
    CONSTRAINT tes_cab_deposito_caja_empr_fkey
        FOREIGN KEY (ide_empr) REFERENCES sis_empresa(ide_empr)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_cab_deposito_caja_sucu_fkey
        FOREIGN KEY (ide_sucu) REFERENCES sis_sucursal(ide_sucu)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_cab_deposito_caja_tecba_origen_fkey
        FOREIGN KEY (ide_tecba_origen) REFERENCES tes_cuenta_banco(ide_tecba)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_cab_deposito_caja_tecba_destino_fkey
        FOREIGN KEY (ide_tecba_destino) REFERENCES tes_cuenta_banco(ide_tecba)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_cab_deposito_caja_teclb_retiro_fkey
        FOREIGN KEY (ide_teclb_retiro) REFERENCES tes_cab_libr_banc(ide_teclb)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_cab_deposito_caja_teclb_ingreso_fkey
        FOREIGN KEY (ide_teclb_ingreso) REFERENCES tes_cab_libr_banc(ide_teclb)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_cab_deposito_caja_teincb_fkey
        FOREIGN KEY (ide_teincb) REFERENCES tes_info_comprobante_banco(ide_teincb)
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

COMMENT ON TABLE tes_cab_deposito_caja IS
    'Cabecera de un depósito de caja a banco (2 etapas: generado -> completado): amarra los movimientos de ingreso de caja reservados/cubiertos con el retiro/ingreso y el asiento contable generados al completar.';

CREATE INDEX IF NOT EXISTS idx_tedca_tecba_origen ON tes_cab_deposito_caja(ide_tecba_origen);
CREATE INDEX IF NOT EXISTS idx_tedca_empr_sucu ON tes_cab_deposito_caja(ide_empr, ide_sucu);

-- ============================================================
-- 2. Detalle: movimientos de ingreso de caja cubiertos por el depósito
-- ============================================================
CREATE TABLE IF NOT EXISTS tes_det_deposito_caja_mov (
    ide_tedcm BIGINT NOT NULL,
    ide_tedca BIGINT NOT NULL,
    ide_teclb BIGINT NOT NULL,
    valor_tedcm NUMERIC(12,2) NOT NULL,

    usuario_ingre VARCHAR(50),
    hora_ingre TIMESTAMP DEFAULT NOW(),

    CONSTRAINT pk_tes_det_deposito_caja_mov PRIMARY KEY (ide_tedcm),
    CONSTRAINT tes_det_deposito_caja_mov_tedca_fkey
        FOREIGN KEY (ide_tedca) REFERENCES tes_cab_deposito_caja(ide_tedca)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_det_deposito_caja_mov_teclb_fkey
        FOREIGN KEY (ide_teclb) REFERENCES tes_cab_libr_banc(ide_teclb)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    -- Un mismo movimiento de ingreso de caja solo puede quedar cubierto por UN
    -- depósito - evita incluirlo dos veces en depósitos distintos.
    CONSTRAINT tes_det_deposito_caja_mov_teclb_unique UNIQUE (ide_teclb)
);

COMMENT ON TABLE tes_det_deposito_caja_mov IS
    'Detalle de tes_cab_deposito_caja: qué movimientos de ingreso de caja (tes_cab_libr_banc) cubre cada depósito.';

CREATE INDEX IF NOT EXISTS idx_tedcm_tedca ON tes_det_deposito_caja_mov(ide_tedca);
