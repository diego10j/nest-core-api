-- Fix: gen_perido_rol (período que se selecciona en Nómina > Roles de Pago > Nuevo Rol)
-- estaba completamente vacía, en cascada con gen_periodo y gen_anio también vacías (salvo
-- una única fila legado ide_geani=0 → "2017"). Sin esto el combo "Período" queda vacío y
-- no se puede generar ningún rol — mismo síntoma que los otros 2 gaps de catálogo
-- encontrados en esta sesión de pruebas (ver script-fix-sucursal-detalle-tipo-nomina.sql y
-- script-seed-catalogos-puesto-salario.sql).
--
-- IMPORTANTE — esto NO es un catálogo de infraestructura genérica como los otros 2 scripts:
-- son períodos de calendario reales que hay que seguir creando cada año. Hoy no existe
-- ninguna pantalla en el ERP para gestionar esto (crear un período nuevo requiere correr
-- SQL a mano) — queda como gap real para una futura sesión, no se resuelve acá, solo se
-- destraba lo necesario para probar el flujo de generar un rol en 2026.
--
-- gen_mes (ide_gemes 1-12 = Enero..Diciembre) ya está poblado, no hace falta tocarlo.
-- nrh_tipo_rol ya está poblado: ide_nrtit=0 es "MENSUAL", el único que usa DIQUIMEC.

-- 1) gen_anio: agrega 2025, 2026, 2027 (ide_geani es un id surrogate, no el año literal —
--    la única fila existente es ide_geani=0 → nom_geani='2017')
INSERT INTO gen_anio (ide_geani, nom_geani, activo_geani)
SELECT 1, '2025', true WHERE NOT EXISTS (SELECT 1 FROM gen_anio WHERE nom_geani = '2025');

INSERT INTO gen_anio (ide_geani, nom_geani, activo_geani)
SELECT 2, '2026', true WHERE NOT EXISTS (SELECT 1 FROM gen_anio WHERE nom_geani = '2026');

INSERT INTO gen_anio (ide_geani, nom_geani, activo_geani)
SELECT 3, '2027', true WHERE NOT EXISTS (SELECT 1 FROM gen_anio WHERE nom_geani = '2027');

-- 2) gen_periodo: los 12 meses de cada uno de esos 3 años
INSERT INTO gen_periodo (ide_gemes, ide_geani, activo_geper)
SELECT m.ide_gemes, a.ide_geani, true
FROM gen_mes m
CROSS JOIN gen_anio a
WHERE a.nom_geani IN ('2025', '2026', '2027')
  AND NOT EXISTS (
      SELECT 1 FROM gen_periodo p WHERE p.ide_gemes = m.ide_gemes AND p.ide_geani = a.ide_geani
  );

-- 3) gen_perido_rol: un período de rol MENSUAL (ide_nrtit=0) por cada mes de esos 3 años,
--    con fecha_inicial/fecha_final abarcando el mes calendario completo
INSERT INTO gen_perido_rol
    (ide_gepro, ide_nrtit, ide_gemes, ide_geani, fecha_inicial_gepro, fecha_final_gepro, detalle_periodo_gepro, activo_gepro)
SELECT
    (a.ide_geani * 100 + m.ide_gemes) AS ide_gepro,
    0 AS ide_nrtit,
    m.ide_gemes,
    a.ide_geani,
    make_date(a.nom_geani::int, m.ide_gemes::int, 1) AS fecha_inicial_gepro,
    (make_date(a.nom_geani::int, m.ide_gemes::int, 1) + interval '1 month' - interval '1 day')::date AS fecha_final_gepro,
    initcap(m.nombre_gemes) || ' ' || a.nom_geani AS detalle_periodo_gepro,
    true
FROM gen_mes m
CROSS JOIN gen_anio a
WHERE a.nom_geani IN ('2025', '2026', '2027')
  AND NOT EXISTS (
      SELECT 1 FROM gen_perido_rol r WHERE r.ide_gemes = m.ide_gemes AND r.ide_geani = a.ide_geani AND r.ide_nrtit = 0
  );

-- Verificación esperada tras aplicar:
-- select ide_gepro, detalle_periodo_gepro, fecha_inicial_gepro, fecha_final_gepro from gen_perido_rol order by ide_gepro;
-- (36 filas: 12 meses x 3 años)
