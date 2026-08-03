-- ==============================================================================
-- Índices de rendimiento para módulo Tesorería (Pre Libro Bancos)
-- ==============================================================================
-- Generado: 2026-08-01
-- Objetivo: optimizar getTransaccionesCuenta, getDetalleTransaccion,
--           getTransaccionesCuentaKPI, getSaldoInicialCuenta, existeNumTransaccion
-- ==============================================================================

-- ─── 1. tes_cab_libr_banc — índice compuesto principal ────────────────────────
-- Cubre todas las consultas del módulo que filtran por cuenta + estado + sucursal
-- + rango de fechas. El orden de columnas es:
--   columnas de igualdad (ide_tecba, ide_teelb, ide_sucu) primero,
--   columna de rango (fecha_trans_teclb) al final.
-- Esto permite al planificador usar el índice tanto para el BETWEEN del período
-- como para el < de saldo_inicial (getTransaccionesCuenta modo=2 y KPI).
CREATE INDEX IF NOT EXISTS idx_teclb_consulta
    ON tes_cab_libr_banc (ide_tecba, ide_teelb, ide_sucu, fecha_trans_teclb);

-- ─── 2. tes_cab_libr_banc — índice para filtro solo no conciliados ────────────
-- Índice parcial que cubre el caso adicional: conciliado_teclb = false.
-- Solo indexa las filas no conciliadas (típicamente una fracción pequeña).
CREATE INDEX IF NOT EXISTS idx_teclb_consulta_noconc
    ON tes_cab_libr_banc (ide_tecba, ide_teelb, ide_sucu, fecha_trans_teclb)
    WHERE conciliado_teclb = false;

-- ─── 3. tes_cab_libr_banc — auto-referencias para getDetalleTransaccion ───────
-- La cuarta rama del UNION busca WHERE tes_ide_teclb = $1 OR tes_ide_teclb1 = $1.
-- Dos índices separados permiten al planificador usar BitmapOr.
CREATE INDEX IF NOT EXISTS idx_teclb_tes_ref1
    ON tes_cab_libr_banc (tes_ide_teclb);

CREATE INDEX IF NOT EXISTS idx_teclb_tes_ref2
    ON tes_cab_libr_banc (tes_ide_teclb1);

-- ─── 4. tes_cab_libr_banc — índice para existeNumTransaccion ──────────────────
-- Busca unicidad: WHERE ide_tettb= AND ide_sucu= AND ide_tecba= AND numero_teclb= AND ide_teelb=
CREATE INDEX IF NOT EXISTS idx_teclb_existe_num
    ON tes_cab_libr_banc (ide_tettb, ide_sucu, ide_tecba, numero_teclb, ide_teelb);

-- ─── 5. tes_det_libr_banc — primera rama del UNION en getDetalleTransaccion ───
-- WHERE a.ide_teclb = $1 + JOIN con tes_cab_libr_banc por ide_teclb
CREATE INDEX IF NOT EXISTS idx_tedlb_teclb
    ON tes_det_libr_banc (ide_teclb);

-- ─── 6. cxp_detall_transa — segunda rama del UNION ────────────────────────────
-- WHERE ide_teclb = $1 AND ide_cpttr IN (3, 19)
CREATE INDEX IF NOT EXISTS idx_cpdtr_teclb_cpttr
    ON cxp_detall_transa (ide_teclb, ide_cpttr);

-- ─── 7. cxc_detall_transa — tercera rama del UNION ────────────────────────────
-- WHERE ide_teclb = $1 AND ide_ccttr IN (0, 10)
CREATE INDEX IF NOT EXISTS idx_ccdtr_teclb_ccttr
    ON cxc_detall_transa (ide_teclb, ide_ccttr);

-- ==============================================================================
-- NOTAS
-- ==============================================================================
-- • idx_teclb_consulta es el índice más importante. Sin él, toda consulta de
--   transacciones hace seq scan sobre tes_cab_libr_banc.
-- • idx_teclb_consulta_noconc es parcial: solo indexa ~5-10% de filas (las no
--   conciliadas). El planificador lo usará automáticamente cuando la cláusula
--   WHERE incluya conciliado_teclb = false.
-- • Las FK (ide_tecba, ide_teelb, ide_sucu, ide_tettb) ya están cubiertas por
--   el índice compuesto principal; no hacen falta índices individuales extra.
-- • La PK (ide_teclb) ya tiene índice implícito.
-- • Los JOINS a tes_tip_tran_banc, tes_cuenta_banco, tes_banco usan sus PKs
--   (ya indexadas). No requieren índices adicionales.
