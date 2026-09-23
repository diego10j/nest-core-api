-- =============================================================================
-- MIGRACIÓN: Retención de venta distribuida entre varias facturas (con_detall_retenc)
-- Fecha: 2026-09-22
-- Ejecutar ANTES de tesoreria/devolucion_cobro_tarjeta_retencion_migration.sql
-- Descripción:
--   Un procesador de tarjeta (ej. Bendo) emite uno o varios comprobantes de
--   retención al mes (con_cabece_retenc), y cada uno puede amparar 1..N facturas
--   de venta cobradas con tarjeta, de uno o varios depósitos. El XML del SRI
--   nunca desglosa esto por factura (llega agregado en un solo docSustento), así
--   que el desglose se hace en el ERP al registrar el comprobante (ver
--   RetencionVentaSaveService.saveRetencionLote).
--
--   con_detall_retenc guardaba las líneas de impuesto del comprobante COMPLETO
--   (ej. 1 línea de Renta + 1 de IVA con la base/valor total). Con esta columna
--   se insertan 2×N filas (una por factura), cada una con la porción de esa
--   factura recalculada aplicando el mismo porcentaje del comprobante sobre la
--   base/IVA propios de la factura - así la suma por ide_cccfa siempre
--   reconstruye el total del XML.
--
--   El backfill deja poblada la columna para las retenciones de venta ya
--   existentes (siempre 1 comprobante : 1 factura hasta ahora, vía
--   cxc_cabece_factura.ide_cncre) - necesario para que el filtro por ide_cccfa
--   de ats.service.ts (ret_iva_cccfa/ret_fuente_cccfa) no deje esos valores en
--   NULL para períodos ya declarados.
--
--   Idempotente: se puede ejecutar más de una vez.
-- =============================================================================

-- ============================================================
-- 1. Columna de distribución por factura
-- ============================================================
ALTER TABLE con_detall_retenc
    ADD COLUMN IF NOT EXISTS ide_cccfa BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'con_detall_retenc_cccfa_fkey'
    ) THEN
        ALTER TABLE con_detall_retenc
            ADD CONSTRAINT con_detall_retenc_cccfa_fkey
            FOREIGN KEY (ide_cccfa) REFERENCES cxc_cabece_factura(ide_cccfa)
            ON DELETE SET NULL ON UPDATE RESTRICT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_con_detall_retenc_ide_cccfa
    ON con_detall_retenc (ide_cccfa);

COMMENT ON COLUMN con_detall_retenc.ide_cccfa IS
    'FK a cxc_cabece_factura: factura de venta a la que corresponde esta línea de retención, cuando el comprobante (con_cabece_retenc) ampara varias facturas. NULL para retenciones de compras (es_venta_cncre = false).';

-- ============================================================
-- 2. Backfill de retenciones de venta existentes (1 comprobante : 1 factura)
-- ============================================================
UPDATE con_detall_retenc d
SET ide_cccfa = f.ide_cccfa
FROM con_cabece_retenc c
INNER JOIN cxc_cabece_factura f ON f.ide_cncre = c.ide_cncre
WHERE d.ide_cncre = c.ide_cncre
  AND c.es_venta_cncre = TRUE
  AND d.ide_cccfa IS NULL;
