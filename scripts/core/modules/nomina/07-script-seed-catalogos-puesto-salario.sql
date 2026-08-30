-- Seed mínimo para poder asignar Puesto/Salario a un empleado (gen_empleados_departamento_par)
-- en DIQUIMEC. Esa tabla tiene varias columnas NOT NULL heredadas del diseño original de
-- sector público (partida presupuestaria, grupo de cargo, área) que DIQUIMEC no necesita
-- conceptualmente pero la tabla exige — ver plan de Nómina, sección "Nota sobre
-- gen_empleados_departamento_par". Este script crea el combo "genérico" mínimo necesario,
-- más los 2 departamentos reales (Ventas/Administrativo) que ya usa la provisión de
-- décimos/fondos de reserva (rol-pagos.service.ts, generarProvisionDecimosFondos —
-- LEFT JOIN gen_departamento dep ON dep.ide_gedep = ged.ide_gedep, agrupa por
-- dep.tipo_gasto_gedep).
--
-- Encontrado 2026-08-30 probando "Puestos y Salarios" end-to-end en el navegador: el guardado
-- fallaba con "null value in column ide_gepgc... violates not-null constraint" porque
-- gen_partida_grupo_cargo, gen_departamento y gen_departamento_sucursal estaban vacías
-- (0 filas) — nunca se sembraron pese a que el DTO ya documentaba la necesidad
-- ("deben resolverse con catálogos 'genéricos' ya creados para DIQUIMEC").
--
-- Valores reutilizados de catálogos YA poblados (verificado antes de escribir este script):
--   gen_grupo_cargo: (ide_gegro=1, ide_gecaf=1) ya existe.
--   gen_area: ide_geare=1 ("Casa Inspectorial") ya existe — es basura heredada de sigafi,
--     sin relación con DIQUIMEC, pero solo se usa como valor FK dummy, ningún reporte
--     muestra "área" en este módulo.
--   sis_sucursal: DIQUIMEC S.A.S. es ide_sucu = 0 en este sistema (ver
--     fix-sucursal-detalle-tipo-nomina.sql para el detalle de esa confusión).
--   gth_tipo_empleado: ide_gttem=1 "CODIGO DE TRABAJO" (privado, correcto para DIQUIMEC).

-- 1) Departamentos reales (venta/administrativo) — idempotente
INSERT INTO gen_departamento (ide_gedep, detalle_gedep, tipo_gasto_gedep, activo_gedep)
SELECT 1, 'Ventas', 'venta', true
WHERE NOT EXISTS (SELECT 1 FROM gen_departamento WHERE ide_gedep = 1);

INSERT INTO gen_departamento (ide_gedep, detalle_gedep, tipo_gasto_gedep, activo_gedep)
SELECT 2, 'Administrativo', 'administrativo', true
WHERE NOT EXISTS (SELECT 1 FROM gen_departamento WHERE ide_gedep = 2);

-- 2) gen_departamento_sucursal: vincula cada departamento a la sucursal DIQUIMEC (ide_sucu=0)
--    con el área dummy ide_geare=1
INSERT INTO gen_departamento_sucursal (ide_sucu, ide_gedep, ide_geare, activo_gedes)
SELECT 0, 1, 1, true
WHERE NOT EXISTS (
    SELECT 1 FROM gen_departamento_sucursal WHERE ide_sucu = 0 AND ide_gedep = 1 AND ide_geare = 1
);

INSERT INTO gen_departamento_sucursal (ide_sucu, ide_gedep, ide_geare, activo_gedes)
SELECT 0, 2, 1, true
WHERE NOT EXISTS (
    SELECT 1 FROM gen_departamento_sucursal WHERE ide_sucu = 0 AND ide_gedep = 2 AND ide_geare = 1
);

-- 3) gen_partida_grupo_cargo: el combo final que gen_empleados_departamento_par referencia.
--    ide_gepgc=1 se reutiliza igual en ambas filas — la PK compuesta ya queda distinta por
--    ide_gedep, no hace falta variar el número de partida.
INSERT INTO gen_partida_grupo_cargo
    (ide_gepgc, ide_gegro, ide_gecaf, ide_sucu, ide_gedep, ide_geare, ide_gttem, activo_gepgc)
SELECT 1, 1, 1, 0, 1, 1, 1, true
WHERE NOT EXISTS (
    SELECT 1 FROM gen_partida_grupo_cargo
    WHERE ide_gepgc = 1 AND ide_gegro = 1 AND ide_gecaf = 1 AND ide_sucu = 0 AND ide_gedep = 1 AND ide_geare = 1
);

INSERT INTO gen_partida_grupo_cargo
    (ide_gepgc, ide_gegro, ide_gecaf, ide_sucu, ide_gedep, ide_geare, ide_gttem, activo_gepgc)
SELECT 1, 1, 1, 0, 2, 1, 1, true
WHERE NOT EXISTS (
    SELECT 1 FROM gen_partida_grupo_cargo
    WHERE ide_gepgc = 1 AND ide_gegro = 1 AND ide_gecaf = 1 AND ide_sucu = 0 AND ide_gedep = 2 AND ide_geare = 1
);

-- Verificación esperada tras aplicar:
-- select * from gen_departamento;               -- 2 filas: Ventas, Administrativo
-- select * from gen_departamento_sucursal;       -- 2 filas, ide_sucu=0
-- select * from gen_partida_grupo_cargo;         -- 2 filas, ide_gepgc=1, ide_gedep 1 y 2
