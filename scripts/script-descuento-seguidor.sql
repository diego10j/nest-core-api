-- Descuento de bienvenida (5%, una sola factura) para clientes recién marcados como seguidores
-- en redes sociales (ver script-seguidor-redes-sociales.sql / ClientesSaveService.marcarSeguidorRedes).
-- Se activa junto con es_seguidor_geper y se consume (pasa a false) la primera vez que se factura
-- con el descuento aplicado - ver FacturasSaveService (dtoIn.aplicarDescuentoSeguidor).
ALTER TABLE gen_persona ADD COLUMN descuento_seguidor_geper bool DEFAULT false;

update gen_persona set descuento_seguidor_geper = false where descuento_seguidor_geper is null; --valores por defecto
