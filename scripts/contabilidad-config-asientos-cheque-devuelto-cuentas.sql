-- ============================================================================
-- Módulo: Contabilidad / Configuración de Asientos Automáticos
-- Completa vigencia + detalle (con_vig_conf_asie / con_det_conf_asie) para las
-- 3 cabeceras creadas en contabilidad-config-asientos-protegido.sql (GASTO
-- COMISION CHEQUE DEVUELTO, INGRESO COMISION COBRADA A CLIENTE, IVA COMPRAS
-- COMISION CHEQUE DEVUELTO), asociando la cuenta contable real del plan de
-- cuentas (con_det_plan_cuen) confirmada manualmente por el usuario -
-- reemplaza la versión anterior de este archivo, que buscaba por ILIKE y no
-- encontró nada porque el plan de cuentas relevante vive en ide_sucu = 0.
--
-- Cuentas confirmadas (2026-09-03, todas en ide_sucu = 0):
--   GASTO COMISION CHEQUE DEVUELTO        -> ide_cndpc 10163  (6.3.01 Comisiones bancarias)
--   IVA COMPRAS COMISION CHEQUE DEVUELTO  -> ide_cndpc 10027  (1.1.07.01 IVA en compras)
--   INGRESO COMISION COBRADA A CLIENTE    -> ide_cndpc 10013  (1.1.04.01 Clientes) - por
--     decisión explícita del usuario, se recarga al saldo del cliente (cuenta por cobrar)
--     en vez de reconocer un ingreso nuevo en el estado de resultados.
--
-- Idempotente: si la cabecera ya tiene una vigencia activa en ide_sucu = 0, no crea otra.
-- Ejecutar después de contabilidad-config-asientos-protegido.sql.
-- ============================================================================

DO $$
DECLARE
    config RECORD;
BEGIN
    FOR config IN
        SELECT * FROM (VALUES
            ('GASTO COMISION CHEQUE DEVUELTO', 10163::BIGINT),
            ('IVA COMPRAS COMISION CHEQUE DEVUELTO', 10027::BIGINT),
            ('INGRESO COMISION COBRADA A CLIENTE', 10013::BIGINT)
        ) AS t(nombre_cncca, ide_cndpc)
    LOOP
        DECLARE
            r_cabecera con_cab_conf_asie%ROWTYPE;
            r_cuenta con_det_plan_cuen%ROWTYPE;
            ide_cnvca_existente BIGINT;
            nuevo_cnvca BIGINT;
            nuevo_cndca BIGINT;
        BEGIN
            SELECT * INTO r_cabecera FROM con_cab_conf_asie WHERE UPPER(nombre_cncca) = config.nombre_cncca LIMIT 1;
            IF NOT FOUND THEN
                RAISE EXCEPTION '% : no existe la cabecera - corra primero contabilidad-config-asientos-protegido.sql', config.nombre_cncca;
            END IF;

            SELECT * INTO r_cuenta FROM con_det_plan_cuen WHERE ide_cndpc = config.ide_cndpc;
            IF NOT FOUND THEN
                RAISE EXCEPTION '% : no existe con_det_plan_cuen.ide_cndpc=% - verifique el ID antes de reintentar', config.nombre_cncca, config.ide_cndpc;
            END IF;

            SELECT ide_cnvca INTO ide_cnvca_existente
            FROM con_vig_conf_asie
            WHERE ide_cncca = r_cabecera.ide_cncca AND ide_sucu = 0 AND estado_cnvca = TRUE
            LIMIT 1;

            IF FOUND THEN
                RAISE NOTICE '% : ya tenía una vigencia activa (ide_cnvca=%) en ide_sucu=0 - no se creó otra. Revise con_det_conf_asie manualmente si necesita cambiar la cuenta.', config.nombre_cncca, ide_cnvca_existente;
                CONTINUE;
            END IF;

            nuevo_cnvca := get_seq_table('con_vig_conf_asie', 'ide_cnvca', 1, 'sistema');
            INSERT INTO con_vig_conf_asie (ide_cnvca, ide_cncca, ide_sucu, ide_empr, nombre_cnvca, fecha_inici_cnvca, fecha_final_cnvca, estado_cnvca)
            -- nombre_cnvca es varchar(30) - es solo texto descriptivo (la resolución real usa
            -- con_cab_conf_asie.nombre_cncca), así que truncar acá es seguro.
            VALUES (nuevo_cnvca, r_cabecera.ide_cncca, 0, r_cabecera.ide_empr, LEFT(config.nombre_cncca, 30), CURRENT_DATE, NULL, TRUE);

            nuevo_cndca := get_seq_table('con_det_conf_asie', 'ide_cndca', 1, 'sistema');
            INSERT INTO con_det_conf_asie (ide_cndca, ide_cnvca, ide_sucu, ide_empr, ide_cndpc)
            VALUES (nuevo_cndca, nuevo_cnvca, 0, r_cabecera.ide_empr, config.ide_cndpc);

            RAISE NOTICE '% : asociada cuenta "%" (código %, ide_cndpc=%) - ide_cnvca=%, ide_cndca=%',
                config.nombre_cncca, r_cuenta.nombre_cndpc, r_cuenta.codig_recur_cndpc, config.ide_cndpc, nuevo_cnvca, nuevo_cndca;
        END;
    END LOOP;
END $$;
