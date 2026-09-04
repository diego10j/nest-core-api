-- Propaga el descuento de línea de factura (cxc_deta_factura.descuento_ccdfa /
-- porcentaje_descuento_ccdfa, en uso desde agosto 2026) a la nota de crédito de venta.
-- Sin esto, una NC creada desde una factura con descuento acredita el valor bruto en
-- vez del neto realmente facturado.
ALTER TABLE cxp_detalle_nota
    ADD COLUMN IF NOT EXISTS descuento_cpdno numeric(12,2),
    ADD COLUMN IF NOT EXISTS porcentaje_descuento_cpdno numeric(8,3);

ALTER TABLE cxp_cabecera_nota
    ADD COLUMN IF NOT EXISTS descuento_cpcno numeric(12,2);
