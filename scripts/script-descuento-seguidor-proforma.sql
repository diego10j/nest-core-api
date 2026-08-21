-- Registro de que una PROFORMA incluyó el 5% de descuento seguidor (ver
-- script-descuento-seguidor.sql / ClientesSaveService.marcarSeguidorRedes). A diferencia de
-- facturas, el beneficio se consume (gen_persona.descuento_seguidor_geper -> false) al GUARDAR
-- la proforma, no al convertirla en factura - ver ProformasService.saveProforma. Esta columna es
-- sólo registro/UI (qué proforma lo usó) y le indica a getProformaParaFactura que no debe
-- volver a ofrecer el botón al convertir esa proforma en factura.
ALTER TABLE cxc_cabece_proforma ADD COLUMN descuento_seguidor_cccpr bool DEFAULT false;

update cxc_cabece_proforma set descuento_seguidor_cccpr = false where descuento_seguidor_cccpr is null; --valores por defecto
