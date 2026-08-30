-- Provisión contable automática de décimo tercero, décimo cuarto y fondos de reserva.
-- Reemplaza el asiento mensual "REGISTRO ROL DE PROVISIONES <mes>" que hoy registra la
-- contadora a mano en Contabilidad (verificado contra con_det_comp_cont real de DIQUIMEC,
-- 2026-08-29): un asiento por mes, HABER a la cuenta de pasivo de cada concepto por el
-- total de todos los empleados, DEBE partido entre gasto de Ventas y gasto Administrativo
-- según a qué departamento pertenece cada empleado.
--
-- Cuentas confirmadas contra con_det_plan_cuen real de DIQUIMEC (no inventadas):
--   Pasivo:            10078 Fondos de reserva (2.1.5.04)
--                       10079 Décimo tercero    (2.1.5.05)
--                       10080 Décimo cuarto     (2.1.5.06)
--   Gasto Ventas:       10114 Fondos de reserva (6.1.03)
--                       10115 Décimo tercero    (6.1.04)
--                       10116 Décimo cuarto     (6.1.05)
--   Gasto Admin:        10140 Fondos de reserva (6.2.03)
--                       10141 Décimo tercero    (6.2.04)
--                       10142 Décimo cuarto     (6.2.05)
-- Se registran como parámetros p_con_cuenta_* en src/core/variables/data/6-nrh-var.ts,
-- no hardcodeadas en el código — si cambian de ID se ajustan desde Sistema > Variables.

-- 1) gen_departamento.tipo_gasto_gedep — clasifica cada departamento como centro de
--    costo de Ventas o Administrativo, para partir el gasto igual que hoy lo hace la
--    contadora manualmente. Nullable a propósito: los departamentos existentes de
--    DIQUIMEC no vienen clasificados, hay que asignarlo desde Nómina > Catálogos >
--    Departamentos antes de generar la primera provisión automática.
ALTER TABLE public.gen_departamento
    ADD COLUMN IF NOT EXISTS tipo_gasto_gedep varchar(20); -- 'venta' | 'administrativo'

-- 2) nrh_rol.ide_cnmoc_provisiones — comprobante de provisiones generado para este rol,
--    separado de nrh_rol.ide_cnmoc (el asiento normal de sueldos/descuentos/líquido).
--    Mismo patrón que reh_cab_rol_pago.ide_cnccc_provisiones del sistema anterior del
--    usuario (con_cab_comp_cont), que ya separaba ambos asientos.
ALTER TABLE public.nrh_rol
    ADD COLUMN IF NOT EXISTS ide_cnmoc_provisiones int8 REFERENCES public.con_cab_comp_cont(ide_cnccc);
