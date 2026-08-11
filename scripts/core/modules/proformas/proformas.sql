-- Descuento por línea y total en proforma, espejo de cxc_deta_factura/cxc_cabece_factura (ver
-- scripts/core/modules/ventas/facturas/facturas.sql) - la proforma es el origen de la factura
-- (Nueva Factura > "Cargar Proforma"), así que necesita los mismos campos para que el
-- descuento se traspase correctamente al crear la factura desde la proforma.
ALTER TABLE cxc_deta_proforma
    ADD COLUMN descuento_ccdpr NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN porcentaje_descuento_ccdpr NUMERIC(6,3) DEFAULT 0;

ALTER TABLE cxc_cabece_proforma
    ADD COLUMN descuento_cccpr NUMERIC(12,2) DEFAULT 0;

-- Cuenta de tarjeta (tes_cuenta_banco.ide_tecba) usada al cotizar con tarjeta - permite revertir
-- correctamente el recargo de tarjeta (ya horneado en precio_ccdpr) al editar la proforma,
-- mismo patrón que factura usa con fact_mig_cccfa (ver scripts/core/modules/ventas/facturas.sql).
ALTER TABLE cxc_cabece_proforma
    ADD COLUMN ide_tecba_cccpr INT8;
