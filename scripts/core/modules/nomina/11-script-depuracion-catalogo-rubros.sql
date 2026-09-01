-- Depuración del Catálogo de Rubros (Nómina > Catálogos > Rubros) para dejar SOLO lo
-- que DIQUIMEC necesita. Ningún DELETE — todo es UPDATE activo_*=false, reversible
-- (poner activo_*=true de nuevo) si algún rubro resulta necesitarse después.
--
-- Contexto (confirmado contra datos reales, 2026-08-31):
--   - El módulo de Nómina nuevo solo genera rol para 3 tipos de nómina: Normal
--     (ide_nrdtn=4), Nómina Pago Décimos (ide_nrdtn=7) y Liquidación (ide_nrdtn=13).
--     Los otros 6 ide_nrdtn (2, 5, 6, 10, 12, 15) ya estaban desactivados por el
--     script 04-script-depuracion-rol-diquimec.sql (duplicados con tasas IESS
--     incorrectas, o Pasantías/Escenarios sin uso) — no se tocan de nuevo acá.
--   - "Liquidación" tenía DOS candidatos duplicados: ide_nrdtn=5 (20 rubros, IESS con
--     fórmula vacía, sin descuentos/préstamos — incompleto) e ide_nrdtn=13 (46 rubros,
--     IESS patronal 11.15% correcto, RMU/sueldo proporcional, préstamos, fondos de
--     reserva y provisión de décimos con fórmula proporcional a días trabajados —
--     completo). Se activa el 13, igual criterio que 4 vs 2 en el script anterior.
--     ide_nrdtn=5 queda igual (ya estaba inactivo).
--   - nrh_rubro tenía sus 105 filas en activo_nrrub=true sin excepción (la depuración
--     anterior solo tocó nrh_detalle_rubro, no el catálogo de rubros en sí). De esos
--     105, quedan 81 realmente en uso (referenciados por una fila activa de
--     nrh_detalle_rubro dentro de alguno de los 3 ide_nrdtn que se mantienen activos).
--     Los 24 restantes no están en uso por ningún tipo de nómina activo NI mapeados a
--     una cuenta contable (nrh_rubro_cuenta) — se desactivan.
--
-- Verificación usada para armar la lista de los 24 (repetible para auditar después):
--   SELECT r.ide_nrrub, r.detalle_nrrub,
--          EXISTS(SELECT 1 FROM nrh_rubro_cuenta rc WHERE rc.ide_nrrub=r.ide_nrrub AND rc.activo_nrrucu=true) AS tiene_cuenta
--   FROM nrh_rubro r
--   WHERE r.ide_nrrub NOT IN (
--     SELECT DISTINCT ide_nrrub FROM nrh_detalle_rubro WHERE ide_nrdtn IN (4,7,13) AND activo_nrder=true
--   )
--   ORDER BY tiene_cuenta DESC, r.detalle_nrrub;
-- (los 24 resultados dieron tiene_cuenta=false, ninguno mapeado a cuenta contable.)

-- ─── 1) nrh_detalle_tipo_nomina — activar "Liquidación" (ide_nrdtn=13) ─────────

UPDATE public.nrh_detalle_tipo_nomina
SET activo_nrdtn = true,
    ide_gttem = NULL  -- gth_tipo_empleado está vacía (0 filas), mismo fix que 4 y 7
WHERE ide_nrdtn = 13;

-- ─── 2) nrh_rubro — desactivar los 24 rubros sin uso en Normal/Décimos/Liquidación ─

UPDATE public.nrh_rubro
SET activo_nrrub = false
WHERE ide_nrrub IN (
    330,  -- ACUMULA DECIMOS (reemplazado por nrh_solicitud_mensualizacion)
    185,  -- AMONEST_PECUNIARIA
    188,  -- ANTICIPO_DEC_GTH_OWNER
    253,  -- Abono
    333,  -- DECIMO CUARTO (duplicado de PROVISION DECIMO CUARTO, ide_nrrub=121)
    334,  -- DECIMO TERCERO (duplicado de PROVISION DECIMO TERCERO, ide_nrrub=125)
    189,  -- DESC. ANTICIPOS IESS
    193,  -- DESC_DEC_TER_SUBROG
    257,  -- DIAS PERIODO NOMINA
    279,  -- DIAS SUBROGADOS
    305,  -- DIAS TRABAJADOS FOND RESERVA FORMULA (duplicado de otro rubro homónimo activo)
    286,  -- DIAS TRABAJADOS FORM
    327,  -- EGRESO FONDOS DE RESERVA
    27,   -- ENCARGO / SUBROGACION
    332,  -- NRO HORAS CON RECARGO AL 25% (conteo viejo, ahora nrh_hora_extra_candidata)
    159,  -- OTROS ING APORTABLES PROP.
    160,  -- OTROS ING. SUBROGACION
    161,  -- OTROS INGRESOS FONDOS_RESERVA
    249,  -- PROVISION IECE MN
    250,  -- PROVISION_APORTE_PATRONAL MN
    278,  -- RMU CARGO SUBROGANTE
    291,  -- SEGURO SOCIAL IMPUESTO RENTA
    129,  -- SUBSIDIO POR MATERNIDAD 75%
    130   -- SUELDO_D3
);
