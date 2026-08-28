-- =============================================================================
-- MIGRACIÓN: Cheques por Cobrar Devueltos (Tesorería / CxC)
-- Fecha: 2026-08-28
-- Descripción:
--   Cuando un cheque de un cliente es rechazado por el banco (fondos
--   insuficientes, firma no autorizada, cuenta cerrada, etc.), el sistema:
--     1. Reversa el cobro CxC original (vía PreLibroBancosSaveService.
--        anularMovimiento, la misma primitiva que usa "Consulta de
--        Movimientos > Anular") y, si el cheque ya había sido cubierto por un
--        Depósito de Caja COMPLETADO, primero reversa ese depósito también
--        (DepositoCajaSaveService.anular).
--     2. Marca el movimiento original devuelto_teclb = true.
--     3. Opcionalmente (si el banco nos debitó una comisión): registra el
--        gasto de esa comisión + su IVA (config por cuenta bancaria, editable
--        caso a caso) y genera un CARGO INTERNO al cliente por el mismo monto
--        (vía cxc_cabece_transa/cxc_detall_transa con ide_cccfa NULL - mismo
--        patrón ya usado hoy para "saldo a favor" - sin pasar por el pipeline
--        de facturación electrónica SRI, a pedido explícito).
--
--   Ver ChequeDevueltoSaveService.registrar() y AsientosAutomaticosService.
--   generarAsientoComisionChequeDevuelto/generarAsientoCargoClienteChequeDevuelto.
--
--   Los 2 tipos de transacción que este flujo necesita YA EXISTEN (heredados
--   del legacy sigafi) - no requieren migración, solo están hardcodeados en
--   ChequeDevueltoSaveService (mismo criterio que el resto del módulo con
--   CxcTransaccionesSaveService.IDE_TETTB_CHEQUE_POSFECHADO_CXC=13):
--     - cxc_tipo_transacc: ide_ccttr=17 'COMISION CHEQUE DEVUELTO', signo=1
--       (cxc_tipo_transacc también tiene ide_ccttr=19 'CHEQUE DEVUELTO',
--       signo=1 - no se usa: la reversión del cobro original se hace vía
--       anularMovimiento, que borra la fila en vez de insertar una reversa).
--     - tes_tip_tran_banc: ide_tettb=16 'COMISION CH DEVUELTO', signo=-1
-- =============================================================================

-- ============================================================
-- Comisión por defecto de cheque devuelto, por cuenta bancaria
-- ============================================================
-- Cada banco cobra un monto distinto por cheque devuelto - se configura una
-- vez por cuenta bancaria y se prellena (editable) al registrar la devolución.
ALTER TABLE tes_cuenta_banco
    ADD COLUMN IF NOT EXISTS comision_cheque_devuelto_tecba NUMERIC(12,2);

ALTER TABLE tes_cuenta_banco
    ADD COLUMN IF NOT EXISTS iva_comision_cheque_tecba BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN tes_cuenta_banco.comision_cheque_devuelto_tecba IS
    'Valor por defecto que este banco cobra por cada cheque devuelto - se prellena (editable) al registrar la devolución.';
COMMENT ON COLUMN tes_cuenta_banco.iva_comision_cheque_tecba IS
    'Si la comisión por cheque devuelto de este banco causa IVA - se desglosa tanto en el gasto (lado banco) como en el cargo al cliente (lado CxC).';

-- =============================================================================
-- PASOS MANUALES REQUERIDOS DESPUÉS DE APLICAR ESTA MIGRACIÓN
-- (con_cab_conf_asie no se seedea por código en este proyecto - se configura
-- vía la pantalla de administración existente)
-- =============================================================================
--
-- 1. Contabilidad > Configuración de Asientos (con_cab_conf_asie): crear 3
--    entradas nuevas y mapearlas a la cuenta contable real que corresponda:
--      - GASTO COMISION CHEQUE DEVUELTO
--      - IVA COMPRAS COMISION CHEQUE DEVUELTO   (solo si se maneja IVA)
--      - INGRESO COMISION COBRADA A CLIENTE
--    (IVA EN VENTAS para el lado del cargo al cliente ya existe y se reutiliza.)
--
-- 2. Tesorería > Catálogos > Cuentas Bancarias: configurar, por cada cuenta
--    bancaria real, su comisión por defecto (comision_cheque_devuelto_tecba)
--    y si causa IVA (iva_comision_cheque_tecba).
-- =============================================================================
