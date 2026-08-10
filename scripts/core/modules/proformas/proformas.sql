-- Descuento por línea y total en proforma, espejo de cxc_deta_factura/cxc_cabece_factura (ver
-- scripts/core/modules/ventas/facturas/facturas.sql) - la proforma es el origen de la factura
-- (Nueva Factura > "Cargar Proforma"), así que necesita los mismos campos para que el
-- descuento se traspase correctamente al crear la factura desde la proforma.
ALTER TABLE cxc_deta_proforma
    ADD COLUMN descuento_ccdpr NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN porcentaje_descuento_ccdpr NUMERIC(6,3) DEFAULT 0;

ALTER TABLE cxc_cabece_proforma
    ADD COLUMN descuento_cccpr NUMERIC(12,2) DEFAULT 0;
