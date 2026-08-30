-- Fix: nrh_detalle_tipo_nomina fue sembrada con ide_sucu = 1, un valor huérfano que no
-- existe en sis_sucursal (DIQUIMEC S.A.S. es en realidad ide_sucu = 0 en este sistema).
-- Esto deja vacío el combo "Tipo de Nómina" en Nómina > Catálogos > Parametría y en
-- Nómina > Roles de Pago > Nuevo Rol (getDetalleTipoNomina filtra por dtn.ide_sucu = $1),
-- bloqueando por completo la generación de un rol de pagos.
--
-- Encontrado 2026-08-30 probando el módulo de Nómina end-to-end en el navegador.
-- Verificado antes de aplicar: ide_sucu=1 no existe en sis_sucursal (solo 0 y 2), y
-- ninguna otra tabla de nómina (gth_empleado, nrh_rubro, gth_cargo, nrh_detalle_rubro,
-- nrh_rubro_asiento) tiene columna ide_sucu, así que el problema está aislado a esta
-- tabla (9 filas totales, todas con ide_sucu=1).

UPDATE nrh_detalle_tipo_nomina SET ide_sucu = 0 WHERE ide_sucu = 1;

-- Verificación esperada tras aplicar: las 2 filas activas (ide_nrdtn 4 "Normal" y 7
-- "Nómina Pago Décimos") deben quedar con ide_sucu = 0.
-- select ide_nrdtn, ide_sucu, activo_nrdtn from nrh_detalle_tipo_nomina;
