-- Depuración de sis_parametros (módulo Nómina, ide_modu=6) — deja solo lo que el ERP
-- nuevo realmente lee, corrige valores desactualizados, y desactiva (nunca DELETE) el
-- resto: motor de fórmulas legado de sigafi (forma_calculo/tipo_rubro/rubro auxiliar
-- acumula-decimos), el sistema reh_ (otro sistema del usuario, no relacionado), y
-- reportes (Liquidación de Haberes / Acciones de Personal) no construidos todavía.
--
-- Verificado 1:1 contra el resultado real de:
--   SELECT ide_para, nom_para, descripcion_para, valor_para, tabla_para, activo_para
--   FROM sis_parametros WHERE ide_modu = 6 ORDER BY nom_para;
-- (2026-08-29). Los 24 nom_para que el código realmente usa están listados en
-- src/core/variables/data/6-nrh-var.ts — cualquier fila con otro nombre no se lee.

-- ─── 1) CORREGIR — estos 4 ya están activos y el ERP los usa, pero con el valor del
--        esquema viejo de nrh_estado_rol (antes de que se sembrara 1-4 esta sesión).
--        Si no se corrigen, generarRol()/cerrarRol() usan el estado equivocado.
UPDATE public.sis_parametros SET valor_para = '1' WHERE ide_modu = 6 AND nom_para = 'p_nrh_estado_pre_nomina';
UPDATE public.sis_parametros SET valor_para = '2' WHERE ide_modu = 6 AND nom_para = 'p_nrh_estado_nomina_aprobada';
UPDATE public.sis_parametros SET valor_para = '3' WHERE ide_modu = 6 AND nom_para = 'p_nrh_estado_nomina_cerrada';
UPDATE public.sis_parametros SET valor_para = '4' WHERE ide_modu = 6 AND nom_para = 'p_nrh_estado_nomina_anulada';

-- Vacíos — el generador no calcula horas extra hasta que estos tengan valor.
UPDATE public.sis_parametros SET valor_para = '17'  WHERE ide_modu = 6 AND nom_para = 'p_nrh_rubro_horas_supl';
UPDATE public.sis_parametros SET valor_para = '336' WHERE ide_modu = 6 AND nom_para = 'p_nrh_rubro_horas_extra';

-- ─── 2) DEPURAR — motor de fórmulas legado de sigafi (forma_calculo, tipo_rubro,
--        rubro auxiliar "acumula decimos/fondos", días/subrogación/ajustes que ya no
--        se usan porque el cálculo se movió a código, ver CalculoLegalService).
UPDATE public.sis_parametros
SET activo_para = false
WHERE ide_modu = 6
  AND ide_para IN (
    543, 544, 550, 551, 554, 555, 556, 557, 558, 559, 560, 561, 562, 563, 564, 565,
    566, 567, 568, 569, 570, 571, 572, 573, 574, 575, 576, 577, 578, 579, 580, 581,
    582, 583, 584, 585, 586, 587, 588, 589, 590, 591, 592, 593, 594, 595, 596, 597,
    598, 599, 600, 601, 602, 603, 604, 608, 609, 610, 611, 612, 613, 614
  );

-- ─── 3) DEPURAR — sistema reh_ (otro sistema del usuario, sin relación con el ERP
--        nuevo, que usa nrh_/gth_).
UPDATE public.sis_parametros
SET activo_para = false
WHERE ide_modu = 6
  AND ide_para IN (64, 109, 112, 113, 114, 116, 124, 158, 159);

-- ─── 4) DEPURAR — firmas para reportes (Liquidación de Haberes, Acciones de Personal)
--        no construidos en el ERP nuevo. Reactivar (activo_para=true) el día que se
--        implementen esos reportes.
UPDATE public.sis_parametros
SET activo_para = false
WHERE ide_modu = 6
  AND ide_para IN (545, 546, 547, 548, 549, 552, 553);

-- ─── 5) Los 16 parámetros que faltan (cuentas de provisión, p_nrh_sbu_vigente,
--        p_nrh_region_decimo4, p_nrh_rubro_decimo_tercero/cuarto/fondos_reserva,
--        p_nrh_rubro_horas_nocturna, p_nrh_parametro_horas_extra) NO se crean acá —
--        usar Sistema > Variables (sincroniza contra 6-nrh-var.ts) para que el ide_para
--        se genere por el mecanismo normal de la app.
