-- Depuración de nrh_detalle_tipo_nomina / nrh_detalle_rubro para dejar SOLO lo que el
-- módulo de Nómina nuevo necesita para DIQUIMEC. La BD real venía de una plantilla
-- genérica multi-empresa (9 ide_nrdtn distintos, la mayoría plantilla nunca usada);
-- este script no borra nada (todo es UPDATE activo_*=false, nunca DELETE) — solo
-- desactiva lo que sobra y corrige lo que estaba mal, para que la pantalla de
-- Parametría de Rubros (Nómina > Catálogos) quede legible.
--
-- Contexto confirmado con el usuario (2026-08-29):
--   - gth_tipo_empleado está VACÍA (0 filas) — por eso "Normal" venía partido en dos
--     ide_nrdtn (2 y 4) según ide_gttem, un eje que nunca se pobló. Se deja un solo
--     ide_nrdtn "Normal" con ide_gttem=NULL (aplica a cualquier empleado).
--   - ide_nrdtn=4 tenía las tasas IESS correctas (personal 9.45%, patronal 11.15%);
--     ide_nrdtn=2 las tenía cruzadas/mal (11.45%/9.15%) — se usa el 4 como base.
--   - "Nómina Pago Décimos" (ide_nrtin=4) SE MANTIENE ACTIVO — el usuario quiere que
--     los décimos generen un rol independiente. La lógica de liquidación anual (sumar
--     el histórico del período, fecha de corte por región) NO está implementada
--     todavía — este script solo deja la configuración base, no el cálculo.
--   - Liquidación, Pasantías y Escenarios se desactivan por ahora (no están en uso);
--     se reactivan fácilmente (activo_nrdtn=true) el día que se necesiten.
--
-- Los 6 rubros clave (sueldo, horas supl/extra, décimo 3°/4°, fondos de reserva) ya
-- NO se calculan por fórmula — RolPagosService.generarRol los inyecta directo en
-- código (CalculoLegalService) — ver src/core/variables/data/6-nrh-var.ts. Sus filas en
-- nrh_detalle_rubro se dejan ACTIVAS (el generador las busca por ide_nrrub dentro del
-- ide_nrdtn) pero su fórmula vieja queda muerta, no hace falta borrarla.

-- ─── 1) nrh_detalle_tipo_nomina ────────────────────────────────────────────

-- "Normal" único: ide_nrdtn=4 (ya tenía las tasas IESS correctas), sin depender de
-- ide_gttem (catálogo vacío).
UPDATE public.nrh_detalle_tipo_nomina
SET ide_gttem = NULL
WHERE ide_nrdtn = 4;

-- "Nómina Pago Décimos": mismo problema de ide_gttem partido — se deja ide_nrdtn=7
-- como el único, también con ide_gttem=NULL.
UPDATE public.nrh_detalle_tipo_nomina
SET ide_gttem = NULL
WHERE ide_nrdtn = 7;

-- Desactivar duplicados y tipos no usados hoy (Liquidación, Pasantías, Escenarios).
UPDATE public.nrh_detalle_tipo_nomina
SET activo_nrdtn = false
WHERE ide_nrdtn IN (2, 15, 5, 13, 6, 10, 12);

-- ─── 2) nrh_detalle_rubro — dentro de ide_nrdtn=4 ("Normal") ───────────────

-- Rubros de soporte que solo alimentaban las fórmulas viejas de décimos/fondos de
-- reserva/horas 25% — ya no los usa nada (RolPagosService inyecta el valor directo).
UPDATE public.nrh_detalle_rubro
SET activo_nrder = false
WHERE ide_nrdtn = 4
  AND ide_nrrub IN (
    46,   -- ACUMULADO DE FONDO DE RESERVA
    60,   -- DIAS TRAB. ANTIGUEDAD
    63,   -- DIAS TRABAJADOS D3
    65,   -- DIAS TRABAJADOS D4
    69,   -- DIAS_TRABAJADOS FOND. RESERVA
    276,  -- SBUV (ahora se usa p_nrh_sbu_vigente)
    282,  -- REGION
    283,  -- AJUSTE D4
    284,  -- SBU (Anterior)
    330,  -- ACUMULA DECIMOS (ahora nrh_solicitud_mensualizacion)
    332,  -- NRO HORAS CON RECARGO AL 25% (conteo viejo — ahora la cantidad viene de
          -- nrh_hora_extra_candidata; el rubro 331 "HORAS EXTRAS 25%" queda activo y
          -- recibe el valor en dólares calculado en código, igual que 17 y 336)
    333,  -- DECIMO CUARTO (duplicado de PROVISION DECIMO CUARTO, ide_nrrub=121)
    334   -- DECIMO TERCERO (duplicado de PROVISION DECIMO TERCERO, ide_nrrub=125)
  );

-- Fórmulas simplificadas: base imponible / subtotales, referenciando solo sueldo +
-- horas extra (se quitan las ramas de RMU proporcional, ajustes manuales, subrogación,
-- devoluciones — no aplican al rol simple de DIQUIMEC; se pueden reintroducir después
-- si hace falta un caso específico).
UPDATE public.nrh_detalle_rubro SET formula_nrder = '=[69]+[50]+[1975]+[1966]' WHERE ide_nrder = 1977; -- BASE IMPONIBLE
UPDATE public.nrh_detalle_rubro SET formula_nrder = '=[69]+[50]+[1975]+[1966]' WHERE ide_nrder = 696;  -- SUBTOTAL INGRESOS
UPDATE public.nrh_detalle_rubro SET formula_nrder = '=[129]+[581]+[584]+[595]+[111]' WHERE ide_nrder = 697; -- SUBTOTAL EGRESOS
-- 381 TOTAL A RECIBIR (=[696]-[697]), 129 IESS PERSONAL (=[1977]*0.0945) y
-- 829 IESS PATRONAL (=[1977]*0.1115) ya estaban correctos, no se tocan.
