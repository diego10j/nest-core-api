-- Variable de sistema para la cuenta contable "Clientes" (con_det_plan_cuen), usada
-- para conciliar el saldo contable de clientes contra Cuentas por Cobrar. Se crea
-- como parámetro (no se hardcodea el ide_cndpc) para que sea configurable si cambia
-- el plan de cuentas.
INSERT INTO sis_parametros (
    ide_para, ide_empr, ide_modu, nom_para, descripcion_para, valor_para,
    tabla_para, campo_codigo_para, campo_nombre_para, es_empr_para, activo_para
)
SELECT
    719, 0, 0, 'p_con_cuenta_clientes_cxc',
    'Cuenta contable "Clientes" (con_det_plan_cuen) usada para conciliar contra Cuentas por Cobrar',
    '10013', 'con_det_plan_cuen', 'ide_cndpc', 'nombre_cndpc', false, true
WHERE NOT EXISTS (
    SELECT 1 FROM sis_parametros WHERE nom_para = 'p_con_cuenta_clientes_cxc'
);
