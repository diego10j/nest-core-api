-- Segunda pasada de depuración de nrh_detalle_rubro dentro de "Normal" (ide_nrdtn=4),
-- confirmada directamente con el usuario sobre un rol real de DIQUIMEC (2026-08-31).
-- Complementa a 12-script-depuracion-parametria-rubros-normal.sql. Ningún DELETE.
--
-- Confirmado que DIQUIMEC NO usa: IECE, viáticos, cobertura médica extendida al
-- cónyuge/extensión de salud, beneficio de alimentación, "otros ingresos" genéricos.
--
--   - IECE (ide_nrder=356): fórmula `=[1977]*0.005` — EXACTAMENTE la misma fórmula que
--     SECAP (ide_nrder=1986, `=[1977]*0.005`, mismo 0.5% sobre la misma base). Son el
--     mismo 0.5% calculado dos veces con nombre distinto — el aporte patronal a IECE
--     (crédito educativo) fue eliminado por ley hace años, solo queda vigente el de
--     SECAP. SECAP se queda activo (es un aporte patronal real, no se descuenta al
--     empleado, pero sí es un costo/pasivo de la empresa que hay que registrar).
--
--   - NRO. HORAS SUPLEMENTARIAS 50%_MN (659) / NRO. HORAS EXTRAORDINARIAS 100% MN
--     (684): mismo caso que "NRO HORAS CON RECARGO AL 25%" (ide_nrrub=332, ya
--     desactivado en 04-script) — son los contadores manuales viejos de horas extra.
--     Confirmado en rol-pagos.service.ts#construirDetalleRol: HORAS EXTRAS 50%/100%
--     NUNCA evalúan su fórmula (que referencia [659]/[684]) — su valor se calcula en
--     código desde nrh_hora_extra_candidata y se inyecta directo (mismo mecanismo que
--     ya dejaba muerta la fórmula vieja de HORAS EXTRAS 25%). Los contadores quedan
--     como filas sueltas en $0 sin que nada los lea. HORAS EXTRAS 50%/25%/100% NO se
--     tocan — son los reales, activos, con valor calculado.
--
--   - BENEFICIO_ALIMENTACION MN, EXTENSION SALUD, DESCUENTO EXTENSION COBERTURA
--     CONYUGE, VIATICOS, DESCUENTO VIATICOS, OTROS INGRESOS NO APO-TRB, OTROS
--     INGRESOS PROPORCIONALES: confirmado con el usuario que DIQUIMEC no los usa.

UPDATE public.nrh_detalle_rubro
SET activo_nrder = false
WHERE ide_nrdtn = 4
  AND ide_nrder IN (
    356,   -- IECE (duplica SECAP)
    659,   -- NRO. HORAS SUPLEMENTARIAS 50%_MN
    684,   -- NRO. HORAS EXTRAORDINARIAS 100% MN
    835,   -- BENEFICIO_ALIMENTACION MN
    557,   -- EXTENSION SALUD
    1983,  -- DESCUENTO EXTENSION COBERTURA CONYUGE
    1897,  -- VIATICOS
    1856,  -- DESCUENTO VIATICOS
    464,   -- OTROS INGRESOS NO APO-TRB
    467    -- OTROS INGRESOS PROPORCIONALES
  );
