-- Depuración de nrh_detalle_rubro (parametría dentro de "Normal", ide_nrdtn=4) para
-- reducir el ruido de rubros en $0 que aparecen en cada rol generado sin usarse en
-- DIQUIMEC. A diferencia de 11-script-depuracion-catalogo-rubros.sql (que desactiva
-- nrh_rubro.activo_nrrub, el catálogo visible en Nómina > Catálogos > Rubros),
-- generarRol() filtra por nrh_detalle_rubro.activo_nrder — desactivar solo el catálogo
-- NO reduce lo que trae un rol nuevo. Este script es el que sí lo hace.
-- Ningún DELETE — todo es UPDATE activo_nrder=false, reversible.
--
-- Contexto (confirmado contra un rol real de DIQUIMEC, 2026-08-31):
--   - 8 variantes duplicadas de "FONDOS RESERVA..." (IESS/NOMINA × MESANT/MANUAL/a./b./c.)
--     — se ven como iteraciones de prueba al armar la fórmula. Se deja activa solo
--     "FONDOS RESERVA NOMINA" (ide_nrrub=29, la que sí tiene valor calculado hoy).
--     "DESCUENTO FONDOS RESERVA" (ide_nrrub=321) NO se toca — es un concepto real
--     distinto (descuento si el empleado no acumula fondos de reserva).
--   - 4 rubros de sector público / subrogación de puesto que DIQUIMEC no usa:
--     DESC SUBROGACION MANUAL, ENCARGO/SUBROGACION MANUAL, RMU_HONORARIOS (honorarios
--     profesionales, otro régimen laboral), INGRESO DEVOLUCION TELF CELULA (reintegro
--     de celular, beneficio típico de sector público). Sus pares "sin MANUAL"
--     (ENCARGO/SUBROGACION, OTROS ING. SUBROGACION) ya estaban inactivos de antes.
--
-- PENDIENTE — no se tocan en este script, requieren decisión de negocio:
--   - IECE (¿aporte patronal eliminado por ley, o sigue vigente? verificar con
--     contador antes de desactivar — si se confirma que ya no aplica, agregar acá).
--   - EXTENSION SALUD, DESCUENTO EXTENSION COBERTURA CONYUGE, VIATICOS/DESCUENTO
--     VIATICOS, ANTICIPO REMUN. BIESS, DEVOLUCION AP PERSONAL IESS, DESCUENTO
--     ANTICIPO MANUAL, BENEFICIO_ALIMENTACION MN — quedan activos hasta confirmar si
--     DIQUIMEC los usa.

UPDATE public.nrh_detalle_rubro
SET activo_nrder = false
WHERE ide_nrdtn = 4
  AND ide_nrder IN (
    396,   -- FONDOS RESERVA IESS
    1980,  -- FONDOS RESERVA IESS (MESANT)
    1995,  -- FONDOS RESERVA IESS (MESANT) MANUAL
    2001,  -- FONDOS RESERVA IESS b.
    1997,  -- FONDOS RESERVA IESS c.
    1981,  -- FONDOS RESERVA NOMINA (MESANT)
    1996,  -- FONDOS RESERVA NOMINA (MESANT) MANUAL
    1998,  -- FONDOS RESERVA NOMINA a.
    1940,  -- DESC SUBROGACION MANUAL
    1910,  -- ENCARGO / SUBROGACION MANUAL
    1905,  -- INGRESO DEVOLUCION TELF CELULA
    1952   -- RMU_HONORARIOS
  );
