-- Asocia una FACTURA con el uso del % de descuento seguidor (ver
-- script-descuento-seguidor.sql / FacturasSaveService). Es solo un flag booleano: identifica
-- CUÁL factura consumió el beneficio. El monto del descuento NO se guarda aparte — en el
-- Reporte de Seguidores se lee el descuento existente de la factura (descuento_cccfa).
--
-- Idempotente: puede re-ejecutarse sin error (ADD COLUMN IF NOT EXISTS, Postgres 9.6+).
ALTER TABLE cxc_cabece_factura ADD COLUMN IF NOT EXISTS descuento_seguidor_cccfa bool DEFAULT false;

update cxc_cabece_factura set descuento_seguidor_cccfa = false where descuento_seguidor_cccfa is null; --valores por defecto




-- Registro de que una PROFORMA incluyó el 5% de descuento seguidor (ver
-- script-descuento-seguidor.sql / ClientesSaveService.marcarSeguidorRedes). A diferencia de
-- facturas, el beneficio se consume (gen_persona.descuento_seguidor_geper -> false) al GUARDAR
-- la proforma, no al convertirla en factura - ver ProformasService.saveProforma. Esta columna es
-- sólo registro/UI (qué proforma lo usó) y le indica a getProformaParaFactura que no debe
-- volver a ofrecer el botón al convertir esa proforma en factura.
ALTER TABLE cxc_cabece_proforma ADD COLUMN descuento_seguidor_cccpr bool DEFAULT false;

update cxc_cabece_proforma set descuento_seguidor_cccpr = false where descuento_seguidor_cccpr is null; --valores por defecto






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
