-- Descuento por línea y total en factura de venta, acorde a la Ficha Técnica de Comprobantes
-- Electrónicos del SRI (factura v1.1.0):
--   - <detalle><descuento> es un VALOR (no porcentaje) que se resta de cantidad*precioUnitario
--     para obtener <precioTotalSinImpuesto> (la base imponible de esa línea).
--   - <totalDescuento> en <infoFactura> es la SUMATORIA de los <descuento> de todas las líneas.
-- porcentaje_descuento_ccdfa es un campo de conveniencia interno (UI) - el SRI sólo recibe el
-- valor ya calculado (descuento_ccdfa), nunca el porcentaje.
ALTER TABLE cxc_deta_factura
    ADD COLUMN descuento_ccdfa NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN porcentaje_descuento_ccdfa NUMERIC(6,3) DEFAULT 0;

-- Total de descuento de la factura (suma de cxc_deta_factura.descuento_ccdfa), para mostrar en
-- cabecera/reportes sin tener que sumar el detalle cada vez. Espejo de sri_comprobante.descuento_srcom
-- (que ya existía y alimenta <totalDescuento>, pero estaba hardcodeado a 0 en el builder).
ALTER TABLE cxc_cabece_factura
    ADD COLUMN descuento_cccfa NUMERIC(12,2) DEFAULT 0;
