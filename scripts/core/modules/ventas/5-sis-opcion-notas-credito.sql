-- Registra la nueva página "Notas de Crédito" en el menú Ventas (mismo padre sis_ide_opci=358
-- que "Gestión de Facturas", ide_opci=378), y otorga permiso de lectura al perfil 16 (mismo
-- patrón usado para "Editar Transacciones" ide_opci=557 y "Diferencias Contable vs CxC" 558).
INSERT INTO sis_opcion (ide_opci, sis_ide_opci, nom_opci, tipo_opci, ide_sist, activo_opci, orden_opci, usuario_ingre, fecha_ingre, usuario_actua, fecha_actua)
SELECT 559, 358, 'Notas de Crédito', '/dashboard/ventas/notas-credito/list', 2, true, 5, 'diego', now(), 'diego', now()
WHERE NOT EXISTS (SELECT 1 FROM sis_opcion WHERE ide_opci = 559);

INSERT INTO sis_perfil_opcion (ide_peop, ide_perf, ide_opci, lectura_peop, usuario_ingre, hora_ingre, ide_empr, ide_sucu)
SELECT COALESCE((SELECT MAX(ide_peop) FROM sis_perfil_opcion), 0) + 1, 16, 559, false, 'diego', now(), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM sis_perfil_opcion WHERE ide_perf = 16 AND ide_opci = 559);
