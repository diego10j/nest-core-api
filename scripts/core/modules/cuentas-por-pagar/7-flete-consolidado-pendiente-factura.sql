-- ================================================================
-- SCRIPT: Cuentas por Pagar - Factura Consolidada de Flete
--         Permitir registrar el grupo de envíos ANTES de tener la
--         factura del transportista (llega días después en algunos
--         casos) y completarla luego cargando el XML o asociando una
--         factura ya existente en Documentos por Pagar, opcionalmente
--         reutilizando un anticipo ya pagado a ese proveedor.
-- Cambios:
--   - cxp_cab_flete_cons.ide_cpcfa: ahora NULLABLE (grupo "Pendiente
--     Factura" todavía no tiene factura CxP).
--   - cxp_det_flete_cons.ide_cpdfa: ahora NULLABLE (sin factura, no
--     hay línea real de cxp_detall_factur que referenciar todavía).
--   - cxp_det_flete_cons.valor_cpdfc / observacion_cpdfc: guardan el
--     valor/observación del envío mientras ide_cpdfa es NULL. Una vez
--     que se asocia/crea la factura, ide_cpdfa queda seteado y el
--     valor "en vivo" se vuelve a leer desde cxp_detall_factur (ver
--     FleteConsolidadoService.getFleteConsolidadoById/getFletesConsolidados,
--     que ahora hacen COALESCE entre ambas fuentes) - estas columnas
--     no se borran, quedan como registro de lo estimado antes de la
--     factura real.
--   - cxp_estado_flete_cons: nuevo estado 4 "PENDIENTE FACTURA".
-- ================================================================

ALTER TABLE public.cxp_cab_flete_cons ALTER COLUMN ide_cpcfa DROP NOT NULL;
ALTER TABLE public.cxp_det_flete_cons ALTER COLUMN ide_cpdfa DROP NOT NULL;

ALTER TABLE public.cxp_det_flete_cons ADD COLUMN IF NOT EXISTS valor_cpdfc NUMERIC(12,2) NULL;
ALTER TABLE public.cxp_det_flete_cons ADD COLUMN IF NOT EXISTS observacion_cpdfc VARCHAR(500) NULL;

INSERT INTO public.cxp_estado_flete_cons (ide_cpefc, nombre_cpefc, activo_cpefc, color_cpefc)
SELECT 4, 'PENDIENTE FACTURA', true, 'default'
WHERE NOT EXISTS (SELECT 1 FROM public.cxp_estado_flete_cons WHERE ide_cpefc = 4);
