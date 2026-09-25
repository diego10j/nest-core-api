-- ================================================================
-- SCRIPT: Ventas - Destinatario de la guía de envío
--         Nombre de la persona a la que va dirigida la guía del
--         transportista. No siempre coincide con el cliente facturado
--         (se factura a "Pepito Pérez" pero la guía va a nombre de
--         "María López"); al registrar la factura del transportista
--         (Transportes > Registrar Envíos) las líneas vienen con el
--         nombre de la guía y sin este dato no se sabía a qué factura
--         de venta correspondía cada envío.
--         Obligatorio desde el frontend/backend al completar un envío
--         por transporte externo (TransportesSaveService.completarEnvio);
--         queda NULL para envíos históricos y transporte propio.
-- ================================================================

ALTER TABLE public.cxc_transporte_factura
    ADD COLUMN IF NOT EXISTS destinatario_guia_cctfa VARCHAR(200) NULL;

COMMENT ON COLUMN public.cxc_transporte_factura.destinatario_guia_cctfa
    IS 'Nombre del destinatario tal como aparece en la guía del transportista (puede diferir del cliente facturado)';
