-- Unifica la configuración de cuentas contables de rubros en una sola tabla
-- (nrh_rubro_cuenta) en vez de tabla + 9 variables sueltas en sis_parametros.
--
-- Motivo (ver docs/modulo-nomina.md, sección 6.1): la provisión de décimos/fondos de
-- reserva necesita 3 cuentas por concepto (pasivo + gasto-venta + gasto-admin, porque
-- el gasto se parte por departamento), que no cabían en el modelo de 1-cuenta-por-rubro
-- de nrh_rubro_cuenta — se había resuelto con 9 variables nombradas a mano
-- (p_nrh_cuenta_pasivo_decimo_tercero, etc.), configurables solo desde "Sistema >
-- Variables" sin contexto de negocio, y frágiles (un nombre mal escrito o un valor 0
-- mal validado se traducían en errores confusos — encontrado y corregido esta misma
-- sesión, ver docs/modulo-nomina.md sección 8, hallazgo #8).
--
-- Con este cambio, Nómina > Catálogos > Cuenta Contable de Rubros pasa a tener 4
-- columnas de cuenta por rubro: la "simple" (asiento principal del rol) más las 3 de
-- provisión — un rubro puede usar cualquier combinación, pero no las 4 vacías.

-- 1) ide_cndpc pasa a ser opcional: los rubros de provisión (décimo3/décimo4/fondos de
--    reserva) no necesitan cuenta "simple" — son informativos en el rol, correctamente
--    excluidos del asiento principal (getTotalesPorCuenta), solo usan las 3 cuentas
--    nuevas para su propio asiento de provisión.
ALTER TABLE nrh_rubro_cuenta ALTER COLUMN ide_cndpc DROP NOT NULL;

ALTER TABLE nrh_rubro_cuenta
    ADD COLUMN IF NOT EXISTS ide_cndpc_pasivo bigint REFERENCES con_det_plan_cuen(ide_cndpc),
    ADD COLUMN IF NOT EXISTS ide_cndpc_gasto_venta bigint REFERENCES con_det_plan_cuen(ide_cndpc),
    ADD COLUMN IF NOT EXISTS ide_cndpc_gasto_admin bigint REFERENCES con_det_plan_cuen(ide_cndpc);

-- 2) Migrar los valores ya configurados en sis_parametros (verificados contra DIQUIMEC,
--    2026-08-29/30 — ver 06-script-provision-decimos-fondos-reserva.sql para el origen)
--    a filas de nrh_rubro_cuenta, una por cada rubro de provisión. Si el rubro ya tiene
--    una fila activa (ide_cndpc simple configurado), se actualiza esa misma fila en vez
--    de crear una nueva — un rubro tiene una sola fila activa a la vez
--    (ux_nrh_rubro_cuenta_rubro).
DO $$
DECLARE
    v_rubro_fondos_reserva int;
    v_rubro_decimo_tercero int;
    v_rubro_decimo_cuarto int;
    v_ide_nrrucu int;
BEGIN
    SELECT valor_para::int INTO v_rubro_fondos_reserva FROM sis_parametros WHERE ide_modu = 6 AND nom_para = 'p_nrh_rubro_fondos_reserva';
    SELECT valor_para::int INTO v_rubro_decimo_tercero FROM sis_parametros WHERE ide_modu = 6 AND nom_para = 'p_nrh_rubro_decimo_tercero';
    SELECT valor_para::int INTO v_rubro_decimo_cuarto FROM sis_parametros WHERE ide_modu = 6 AND nom_para = 'p_nrh_rubro_decimo_cuarto';

    -- Fondos de reserva
    IF v_rubro_fondos_reserva IS NOT NULL THEN
        SELECT ide_nrrucu INTO v_ide_nrrucu FROM nrh_rubro_cuenta WHERE ide_nrrub = v_rubro_fondos_reserva AND activo_nrrucu = true;
        IF v_ide_nrrucu IS NOT NULL THEN
            UPDATE nrh_rubro_cuenta SET
                ide_cndpc_pasivo = (SELECT valor_para::bigint FROM sis_parametros WHERE ide_modu = 6 AND nom_para = 'p_nrh_cuenta_pasivo_fondos_reserva'),
                ide_cndpc_gasto_venta = (SELECT valor_para::bigint FROM sis_parametros WHERE ide_modu = 6 AND nom_para = 'p_nrh_cuenta_gasto_venta_fondos_reserva'),
                ide_cndpc_gasto_admin = (SELECT valor_para::bigint FROM sis_parametros WHERE ide_modu = 6 AND nom_para = 'p_nrh_cuenta_gasto_admin_fondos_reserva')
            WHERE ide_nrrucu = v_ide_nrrucu;
        ELSE
            INSERT INTO nrh_rubro_cuenta (ide_nrrucu, ide_nrrub, ide_cndpc_pasivo, ide_cndpc_gasto_venta, ide_cndpc_gasto_admin, activo_nrrucu)
            SELECT
                (SELECT COALESCE(MAX(ide_nrrucu), 0) + 1 FROM nrh_rubro_cuenta),
                v_rubro_fondos_reserva,
                (SELECT valor_para::bigint FROM sis_parametros WHERE ide_modu = 6 AND nom_para = 'p_nrh_cuenta_pasivo_fondos_reserva'),
                (SELECT valor_para::bigint FROM sis_parametros WHERE ide_modu = 6 AND nom_para = 'p_nrh_cuenta_gasto_venta_fondos_reserva'),
                (SELECT valor_para::bigint FROM sis_parametros WHERE ide_modu = 6 AND nom_para = 'p_nrh_cuenta_gasto_admin_fondos_reserva'),
                true;
        END IF;
    END IF;

    -- Décimo tercero
    IF v_rubro_decimo_tercero IS NOT NULL THEN
        SELECT ide_nrrucu INTO v_ide_nrrucu FROM nrh_rubro_cuenta WHERE ide_nrrub = v_rubro_decimo_tercero AND activo_nrrucu = true;
        IF v_ide_nrrucu IS NOT NULL THEN
            UPDATE nrh_rubro_cuenta SET
                ide_cndpc_pasivo = (SELECT valor_para::bigint FROM sis_parametros WHERE ide_modu = 6 AND nom_para = 'p_nrh_cuenta_pasivo_decimo_tercero'),
                ide_cndpc_gasto_venta = (SELECT valor_para::bigint FROM sis_parametros WHERE ide_modu = 6 AND nom_para = 'p_nrh_cuenta_gasto_venta_decimo_tercero'),
                ide_cndpc_gasto_admin = (SELECT valor_para::bigint FROM sis_parametros WHERE ide_modu = 6 AND nom_para = 'p_nrh_cuenta_gasto_admin_decimo_tercero')
            WHERE ide_nrrucu = v_ide_nrrucu;
        ELSE
            INSERT INTO nrh_rubro_cuenta (ide_nrrucu, ide_nrrub, ide_cndpc_pasivo, ide_cndpc_gasto_venta, ide_cndpc_gasto_admin, activo_nrrucu)
            SELECT
                (SELECT COALESCE(MAX(ide_nrrucu), 0) + 1 FROM nrh_rubro_cuenta),
                v_rubro_decimo_tercero,
                (SELECT valor_para::bigint FROM sis_parametros WHERE ide_modu = 6 AND nom_para = 'p_nrh_cuenta_pasivo_decimo_tercero'),
                (SELECT valor_para::bigint FROM sis_parametros WHERE ide_modu = 6 AND nom_para = 'p_nrh_cuenta_gasto_venta_decimo_tercero'),
                (SELECT valor_para::bigint FROM sis_parametros WHERE ide_modu = 6 AND nom_para = 'p_nrh_cuenta_gasto_admin_decimo_tercero'),
                true;
        END IF;
    END IF;

    -- Décimo cuarto
    IF v_rubro_decimo_cuarto IS NOT NULL THEN
        SELECT ide_nrrucu INTO v_ide_nrrucu FROM nrh_rubro_cuenta WHERE ide_nrrub = v_rubro_decimo_cuarto AND activo_nrrucu = true;
        IF v_ide_nrrucu IS NOT NULL THEN
            UPDATE nrh_rubro_cuenta SET
                ide_cndpc_pasivo = (SELECT valor_para::bigint FROM sis_parametros WHERE ide_modu = 6 AND nom_para = 'p_nrh_cuenta_pasivo_decimo_cuarto'),
                ide_cndpc_gasto_venta = (SELECT valor_para::bigint FROM sis_parametros WHERE ide_modu = 6 AND nom_para = 'p_nrh_cuenta_gasto_venta_decimo_cuarto'),
                ide_cndpc_gasto_admin = (SELECT valor_para::bigint FROM sis_parametros WHERE ide_modu = 6 AND nom_para = 'p_nrh_cuenta_gasto_admin_decimo_cuarto')
            WHERE ide_nrrucu = v_ide_nrrucu;
        ELSE
            INSERT INTO nrh_rubro_cuenta (ide_nrrucu, ide_nrrub, ide_cndpc_pasivo, ide_cndpc_gasto_venta, ide_cndpc_gasto_admin, activo_nrrucu)
            SELECT
                (SELECT COALESCE(MAX(ide_nrrucu), 0) + 1 FROM nrh_rubro_cuenta),
                v_rubro_decimo_cuarto,
                (SELECT valor_para::bigint FROM sis_parametros WHERE ide_modu = 6 AND nom_para = 'p_nrh_cuenta_pasivo_decimo_cuarto'),
                (SELECT valor_para::bigint FROM sis_parametros WHERE ide_modu = 6 AND nom_para = 'p_nrh_cuenta_gasto_venta_decimo_cuarto'),
                (SELECT valor_para::bigint FROM sis_parametros WHERE ide_modu = 6 AND nom_para = 'p_nrh_cuenta_gasto_admin_decimo_cuarto'),
                true;
        END IF;
    END IF;
END $$;

-- 3) Desactivar (nunca DELETE, mismo criterio que el resto de scripts de este módulo)
--    las 9 variables sueltas que ya no se leen — el código ahora usa nrh_rubro_cuenta.
UPDATE sis_parametros SET activo_para = false
WHERE ide_modu = 6 AND nom_para IN (
    'p_nrh_cuenta_pasivo_fondos_reserva', 'p_nrh_cuenta_gasto_venta_fondos_reserva', 'p_nrh_cuenta_gasto_admin_fondos_reserva',
    'p_nrh_cuenta_pasivo_decimo_tercero', 'p_nrh_cuenta_gasto_venta_decimo_tercero', 'p_nrh_cuenta_gasto_admin_decimo_tercero',
    'p_nrh_cuenta_pasivo_decimo_cuarto', 'p_nrh_cuenta_gasto_venta_decimo_cuarto', 'p_nrh_cuenta_gasto_admin_decimo_cuarto'
);

-- Verificación esperada tras aplicar:
-- select rc.ide_nrrub, rub.detalle_nrrub, rc.ide_cndpc, rc.ide_cndpc_pasivo, rc.ide_cndpc_gasto_venta, rc.ide_cndpc_gasto_admin
-- from nrh_rubro_cuenta rc join nrh_rubro rub on rub.ide_nrrub = rc.ide_nrrub where rc.activo_nrrucu = true;
-- (debe mostrar 5 filas: REMUNERACION UNIFICADA + IESS PERSONAL con ide_cndpc simple,
--  y FONDOS RESERVA NOMINA + DECIMO TERCERO + DECIMO CUARTO con las 3 cuentas de provisión)
