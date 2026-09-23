-- =============================================================================
-- MIGRACIÓN: Retención aplicada a un ciclo de Devolución de Cobros con Tarjeta
-- Fecha: 2026-09-23
-- Descripción:
--   Un procesador de tarjeta (ej. Bendo) emite uno o varios comprobantes de
--   retención al mes, y cada comprobante puede amparar 1..N cobros de UNO o
--   VARIOS depósitos (ciclos). Por eso la retención ya no se amarra a un solo
--   ciclo (tes_cab_devol_cobro_tarjeta.ide_cncre, 1:1): el comprobante se
--   registra por su cuenta sobre las facturas de venta que cubre (ver
--   con_detall_retenc.ide_cccfa) y cada ciclo toma la porción de las facturas que
--   contiene.
--
--   Esta tabla solo vincula (ciclo, comprobante) y guarda el movimiento contable que
--   descontó la retención de la cuenta de tarjeta (nota de débito + asiento). NO
--   guarda valores: la porción de IVA/Renta de un ciclo se deriva sumando
--   con_detall_retenc de las facturas del ciclo (tes_det_devol_cobro_tarjeta_fact),
--   igual que los totales de retención de la cabecera, que por eso se eliminan al
--   final de este script (valor_neto_calculado_tecdt se conserva: es el esperado al
--   liquidar, dato de un momento que se compara con lo realmente depositado).
--   Permite que un ciclo tenga varios comprobantes y que un comprobante repartido
--   en varios ciclos se contabilice una sola vez por ciclo, y que anular el ciclo
--   revierta exactamente lo suyo.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tes_det_devol_cobro_tarjeta_ret (
    ide_tedtr BIGINT NOT NULL,
    ide_tecdt BIGINT NOT NULL,
    ide_cncre BIGINT NOT NULL,
    -- Nota de débito sobre la cuenta de tarjeta que contabilizó esta porción. NULL cuando la
    -- retención se adjuntó solo como respaldo documental (el depósito ya venía neto de ella).
    ide_teclb_debito_retencion BIGINT,

    usuario_ingre VARCHAR(50),
    hora_ingre TIMESTAMP DEFAULT NOW(),

    CONSTRAINT pk_tes_det_devol_cobro_tarjeta_ret PRIMARY KEY (ide_tedtr),
    CONSTRAINT tes_det_devol_cobro_tarjeta_ret_tecdt_fkey
        FOREIGN KEY (ide_tecdt) REFERENCES tes_cab_devol_cobro_tarjeta(ide_tecdt)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_det_devol_cobro_tarjeta_ret_cncre_fkey
        FOREIGN KEY (ide_cncre) REFERENCES con_cabece_retenc(ide_cncre)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_det_devol_cobro_tarjeta_ret_teclb_fkey
        FOREIGN KEY (ide_teclb_debito_retencion) REFERENCES tes_cab_libr_banc(ide_teclb)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    -- Un comprobante se contabiliza una sola vez por ciclo
    CONSTRAINT tes_det_devol_cobro_tarjeta_ret_unique UNIQUE (ide_tecdt, ide_cncre)
);

COMMENT ON TABLE tes_det_devol_cobro_tarjeta_ret IS
    'Porción de un comprobante de retención (con_cabece_retenc) que corresponde a un ciclo de devolución de cobros con tarjeta, con el movimiento de libro banco que la contabilizó. Un ciclo puede tener varios comprobantes y un comprobante puede repartirse entre varios ciclos.';

CREATE INDEX IF NOT EXISTS idx_tedtr_tecdt ON tes_det_devol_cobro_tarjeta_ret(ide_tecdt);
CREATE INDEX IF NOT EXISTS idx_tedtr_cncre ON tes_det_devol_cobro_tarjeta_ret(ide_cncre);

-- ============================================================
-- Backfill: ciclos existentes con retención (modelo anterior 1 ciclo : 1 comprobante)
-- ============================================================
-- Requiere haber ejecutado ANTES ventas/retencion_venta_detalle_factura_migration.sql: su
-- backfill de con_detall_retenc.ide_cccfa es lo que permite derivar el valor de estos ciclos.
-- Se ejecuta solo si la cabecera aún tiene la columna legacy (el script es idempotente).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tes_cab_devol_cobro_tarjeta' AND column_name = 'ide_cncre'
    ) THEN
        EXECUTE $q$
            INSERT INTO tes_det_devol_cobro_tarjeta_ret (
                ide_tedtr, ide_tecdt, ide_cncre, ide_teclb_debito_retencion, usuario_ingre
            )
            SELECT
                COALESCE((SELECT MAX(ide_tedtr) FROM tes_det_devol_cobro_tarjeta_ret), 0)
                    + ROW_NUMBER() OVER (ORDER BY c.ide_tecdt),
                c.ide_tecdt, c.ide_cncre, c.ide_teclb_debito_retencion, 'migracion'
            FROM tes_cab_devol_cobro_tarjeta c
            WHERE c.ide_cncre IS NOT NULL
              AND c.anulado_tecdt = FALSE
              AND NOT EXISTS (
                  SELECT 1 FROM tes_det_devol_cobro_tarjeta_ret r
                  WHERE r.ide_tecdt = c.ide_tecdt AND r.ide_cncre = c.ide_cncre
              )
        $q$;
    END IF;
END $$;

-- ============================================================
-- Eliminar los datos de retención duplicados de la cabecera (ahora viven en la tabla de arriba
-- y en con_detall_retenc). DROP COLUMN elimina también sus FKs.
-- ============================================================
ALTER TABLE tes_cab_devol_cobro_tarjeta
    DROP COLUMN IF EXISTS ide_cncre,
    DROP COLUMN IF EXISTS ide_teclb_debito_retencion,
    DROP COLUMN IF EXISTS valor_retencion_iva_tecdt,
    DROP COLUMN IF EXISTS valor_retencion_renta_tecdt;
-- valor_neto_calculado_tecdt se CONSERVA a propósito: es lo que el sistema esperaba recibir al
-- liquidar el ciclo (dato de un momento, no derivable después) y se compara con
-- valor_neto_transferido_tecdt (lo que realmente depositó el procesador).
