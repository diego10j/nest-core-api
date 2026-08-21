-- Asocia una FACTURA con el uso del % de descuento seguidor (ver
-- script-descuento-seguidor.sql / FacturasSaveService). Es solo un flag booleano: identifica
-- CUÁL factura consumió el beneficio. El monto del descuento NO se guarda aparte — en el
-- Reporte de Seguidores se lee el descuento existente de la factura (descuento_cccfa).
--
-- Idempotente: puede re-ejecutarse sin error (ADD COLUMN IF NOT EXISTS, Postgres 9.6+).
ALTER TABLE cxc_cabece_factura ADD COLUMN IF NOT EXISTS descuento_seguidor_cccfa bool DEFAULT false;

update cxc_cabece_factura set descuento_seguidor_cccfa = false where descuento_seguidor_cccfa is null; --valores por defecto
