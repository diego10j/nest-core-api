-- =====================================================================
-- Índices para optimizar el Libro Mayor (y reportes contables en general)
--
-- con_cab_comp_cont:  filtro por fecha_trans_cnccc + ide_sucu + ide_cneco
-- con_det_comp_cont:  join por ide_cnccc (cabecera) y filtro por ide_cndpc
-- con_signo_cuenta:   join por (ide_cntcu, ide_cnlap)
--
-- IF NOT EXISTS: seguro para re-ejecutar. Verificar planes con:
--   EXPLAIN (ANALYZE, BUFFERS) <query del libro mayor>
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_con_cab_comp_cont_fecha_sucu_estado
    ON con_cab_comp_cont (ide_sucu, fecha_trans_cnccc, ide_cneco);

CREATE INDEX IF NOT EXISTS idx_con_det_comp_cont_cnccc
    ON con_det_comp_cont (ide_cnccc);

CREATE INDEX IF NOT EXISTS idx_con_det_comp_cont_cndpc
    ON con_det_comp_cont (ide_cndpc);

CREATE INDEX IF NOT EXISTS idx_con_signo_cuenta_cntcu_cnlap
    ON con_signo_cuenta (ide_cntcu, ide_cnlap);

ANALYZE con_cab_comp_cont;
ANALYZE con_det_comp_cont;
ANALYZE con_signo_cuenta;
