-- Registro de que una FACTURA usó el % de descuento seguidor (ver
-- script-descuento-seguidor.sql / FacturasSaveService). A diferencia de la proforma (que usa
-- cxc_cabece_proforma.descuento_seguidor_cccpr), en facturas el beneficio se consume al guardar
-- la factura y esta columna deja rastro de CUÁL factura lo aplicó y por cuánto, para el
-- Reporte de Seguidores (ventas/reportes/seguidores).
ALTER TABLE cxc_cabece_factura ADD COLUMN descuento_seguidor_cccfa bool DEFAULT false;
ALTER TABLE cxc_cabece_factura ADD COLUMN valor_descuento_seguidor_cccfa numeric(12,2) DEFAULT 0;

update cxc_cabece_factura set descuento_seguidor_cccfa = false where descuento_seguidor_cccfa is null; --valores por defecto
update cxc_cabece_factura set valor_descuento_seguidor_cccfa = 0 where valor_descuento_seguidor_cccfa is null; --valores por defecto
