-- Nuevo tipo de transacción de inventario para el kardex de ENTRADA que genera una
-- Nota de Crédito de venta (devuelve al stock lo acreditado). El catálogo
-- inv_tip_tran_inve no tenía ninguna fila de tipo INGRESO (ide_intci=0) para este caso
-- ("Anulación de factura" existe pero está clasificada como EGRESO ide_intci=1, no sirve).
INSERT INTO inv_tip_tran_inve (ide_intti, ide_intci, ide_sucu, ide_empr, hace_asient_intti, nombre_intti)
SELECT 38, 0, 0, 0, true, 'Devolución en Ventas (Nota de Crédito)'
WHERE NOT EXISTS (SELECT 1 FROM inv_tip_tran_inve WHERE ide_intti = 38);

INSERT INTO sis_parametros (ide_para, nom_para, valor_para, tabla_para, campo_codigo_para, campo_nombre_para, es_empr_para, activo_para, descripcion_para)
SELECT 721, 'p_inv_tipo_transaccion_devolucion_venta', '38', 'inv_tip_tran_inve', 'ide_intti', 'nombre_intti', false, true,
       'Tipo de transacción de inventario (inv_tip_tran_inve) para el kardex de entrada generado por una Nota de Crédito de venta'
WHERE NOT EXISTS (SELECT 1 FROM sis_parametros WHERE nom_para = 'p_inv_tipo_transaccion_devolucion_venta');
