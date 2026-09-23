-- ================================================================
-- SCRIPT: Cuentas por Pagar - Órdenes de Pago - "Asociar pago"
-- Descripción: permite completar el detalle de una orden de pago con pagos que YA existen
--              en Tesorería (movimientos de tes_cab_libr_banc), en vez de registrar un pago
--              nuevo desde la orden. Útil cuando un proveedor se pagó en varias
--              transferencias (p.ej. una por error de menos + otra que completa el valor).
--
-- Diseño: el detalle guarda solo los ide_teclb asociados (arreglo tipado). El valor, la fecha
-- y el comprobante se leen siempre de Tesorería, por eso no hay nada que quede desactualizado.
-- Las órdenes ya pagadas 1 a 1 NO requieren migración: sin movimientos asociados (arreglo
-- vacío) se comportan exactamente igual que antes.
-- ================================================================

ALTER TABLE public.cxp_det_orden_pago
    ADD COLUMN IF NOT EXISTS ide_teclb_asoc_cpcdop BIGINT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.cxp_det_orden_pago.ide_teclb_asoc_cpcdop IS
    'ide_teclb (tes_cab_libr_banc) de los pagos de Tesorería asociados a este detalle para completar su pago. Vacío = el pago se registró desde la orden (flujo clásico) o el detalle aún está pendiente.';

-- Búsqueda inversa: "¿a qué detalle de orden está asociado este movimiento?" (elegibilidad y desvinculación al anular el movimiento)
CREATE INDEX IF NOT EXISTS idx_cxp_det_orden_pago_teclb_asoc
    ON public.cxp_det_orden_pago USING GIN (ide_teclb_asoc_cpcdop);
