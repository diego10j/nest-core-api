-- ============================================================================
-- Estado de Flujo de Efectivo - NIC 7 (Método Indirecto)
-- Clasificación de cuentas del plan contable para las tres secciones del EFE.
-- Las cuentas de Efectivo y Equivalentes se obtienen automáticamente desde
-- tes_cuenta_banco.ide_cndpc, por lo que no requieren clasificación aquí.
-- ============================================================================

CREATE TABLE IF NOT EXISTS con_flujo_cuenta_clasif (
    ide_cnfcc         SERIAL          PRIMARY KEY,
    ide_cndpc         INTEGER         NOT NULL
                                      REFERENCES con_det_plan_cuen(ide_cndpc)
                                      ON DELETE RESTRICT ON UPDATE RESTRICT,
    ide_empr          INTEGER         NOT NULL
                                      REFERENCES sis_empresa(ide_empr)
                                      ON DELETE RESTRICT ON UPDATE RESTRICT,
    ide_sucu          INTEGER         NOT NULL
                                      REFERENCES sis_sucursal(ide_sucu)
                                      ON DELETE RESTRICT ON UPDATE RESTRICT,
    -- OPERACION | INVERSION | FINANCIAMIENTO
    clasificacion_cnfcc VARCHAR(20)   NOT NULL
                                      CHECK (clasificacion_cnfcc IN ('OPERACION','INVERSION','FINANCIAMIENTO')),
    -- Partidas que no implican movimiento de efectivo (depreciación, provisiones, etc.)
    -- Se suman/restan como ajuste al resultado en la sección Operacional (método indirecto)
    es_no_monetaria_cnfcc BOOLEAN     NOT NULL DEFAULT FALSE,
    -- Etiqueta personalizada que aparece en el reporte impreso
    descripcion_cnfcc VARCHAR(120),
    -- Orden de presentación dentro de su sección (0 = sin orden específico)
    orden_cnfcc       INTEGER         NOT NULL DEFAULT 0,
    usuario_ingre     VARCHAR(50),
    hora_ingre        TIMESTAMP       DEFAULT NOW(),
    usuario_actua     VARCHAR(50),
    hora_actua        TIMESTAMP,
    CONSTRAINT uq_flujo_cuenta_clasif UNIQUE (ide_cndpc, ide_sucu)
);

COMMENT ON TABLE  con_flujo_cuenta_clasif IS 'Clasificación de cuentas contables para el Estado de Flujo de Efectivo (NIC 7)';
COMMENT ON COLUMN con_flujo_cuenta_clasif.clasificacion_cnfcc IS 'OPERACION: actividades operativas | INVERSION: compra/venta de activos | FINANCIAMIENTO: préstamos, capital, dividendos';
COMMENT ON COLUMN con_flujo_cuenta_clasif.es_no_monetaria_cnfcc IS 'TRUE para partidas no monetarias (depreciación, amortización, provisiones) que se ajustan al resultado en el método indirecto';
COMMENT ON COLUMN con_flujo_cuenta_clasif.descripcion_cnfcc IS 'Etiqueta a mostrar en el reporte PDF. Si es NULL se usa el nombre de la cuenta del plan.';




--Qué cuentas va a clasificar el contador
--Cuenta del plan	clasificacion_cnfcc	es_no_monetaria_cnfcc
--Depreciación Acumulada	OPERACION	true
--Provisión Cuentas Incobrables	OPERACION	true
--Provisión Jubilación Patronal	OPERACION	true
--Cuentas por Cobrar Clientes	OPERACION	false
--Inventarios	OPERACION	false
--Cuentas por Pagar Proveedores	OPERACION	false
--IVA por Pagar	OPERACION	false
--Maquinaria y Equipo	INVERSION	false
--Vehículos	INVERSION	false
--Intangibles / Software	INVERSION	false
--Préstamos Bancarios L/P	FINANCIAMIENTO	false
--Capital Social	FINANCIAMIENTO	false
--Dividendos por Pagar	FINANCIAMIENTO	false