-- Descuento de bienvenida (5%, una sola factura) para clientes recién marcados como seguidores
-- en redes sociales (ver script-seguidor-redes-sociales.sql / ClientesSaveService.marcarSeguidorRedes).
-- Se activa junto con es_seguidor_geper y se consume (pasa a false) la primera vez que se factura
-- con el descuento aplicado - ver FacturasSaveService (dtoIn.aplicarDescuentoSeguidor).
ALTER TABLE gen_persona ADD COLUMN descuento_seguidor_geper bool DEFAULT false;

update gen_persona set descuento_seguidor_geper = false where descuento_seguidor_geper is null; --valores por defecto

-- Backfill: clientes que ya eran seguidores ANTES de que marcarSeguidorRedes empezara a otorgar
-- el descuento (commit f870873, 2026-08-20 18:24). Para ellos el WHERE de marcarSeguidorRedes
-- (es_seguidor_geper IS NOT TRUE) nunca vuelve a matchear, así que sin este backfill quedarían
-- marcados como seguidores para siempre sin poder recibir el beneficio.
update gen_persona set descuento_seguidor_geper = true where es_seguidor_geper is true and descuento_seguidor_geper is not true;
