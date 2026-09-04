-- Identificador contable "DESCUENTO EN VENTAS" -> cuenta 10104 "Descuentos en ventas"
-- (4.1.04), siguiendo exactamente el mismo patrón de la vigencia vigente 2026 de
-- "VENTAS" (ide_cnvca=21): ide_sucu=0/ide_empr=0 (todas las sucursales), sin scoping
-- adicional por geper/artículo/tipo de transacción.
INSERT INTO con_cab_conf_asie (ide_cncca, ide_sucu, ide_empr, nombre_cncca, observacion_cncca, protegido_cncca)
SELECT 20, 0, 0, 'DESCUENTO EN VENTAS', 'IDENTIFICADOR PARA EL DESCUENTO EN EL ASIENTO DE VENTA', false
WHERE NOT EXISTS (SELECT 1 FROM con_cab_conf_asie WHERE nombre_cncca = 'DESCUENTO EN VENTAS');

INSERT INTO con_vig_conf_asie (ide_cnvca, ide_cncca, ide_sucu, ide_empr, nombre_cnvca, fecha_inici_cnvca, fecha_final_cnvca, estado_cnvca)
SELECT 29, 20, 0, 0, 'PERIODO ACTUAL', '2026-02-01', '2036-02-29', true
WHERE NOT EXISTS (SELECT 1 FROM con_vig_conf_asie WHERE ide_cnvca = 29);

INSERT INTO con_det_conf_asie (ide_cndca, ide_cnvca, ide_sucu, ide_empr, ide_cndpc)
SELECT 7691, 29, 0, 0, 10104
WHERE NOT EXISTS (SELECT 1 FROM con_det_conf_asie WHERE ide_cndca = 7691);
