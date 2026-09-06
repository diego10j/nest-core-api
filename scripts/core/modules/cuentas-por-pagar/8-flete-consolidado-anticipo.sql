-- ================================================================
-- ⚠ REEMPLAZADO por tesoreria/2-anticipo-proveedores-simplificado.sql,
-- que borra la columna ide_teanp creada acá y agrega ide_cpctr_anticipo
-- en su lugar (el anticipo ahora vive en cxp_cabece_transa, no en
-- tes_cab_anticipo_prov). No volver a correr este script.
-- ================================================================
-- SCRIPT: Cuentas por Pagar - Factura Consolidada de Flete
--         Vincula el grupo "Pendiente Factura" con el Anticipo a
--         Proveedores que se le haya registrado (si lo hay), para
--         que la pantalla de detalle sepa que ya existe uno y no
--         vuelva a ofrecer "Registrar Anticipo" sobre el mismo
--         grupo (ver AnticipoProveedorSaveService.registrar,
--         parámetro opcional ideCpcfc).
-- ================================================================

ALTER TABLE public.cxp_cab_flete_cons
    ADD COLUMN IF NOT EXISTS ide_teanp INT8 NULL REFERENCES public.tes_cab_anticipo_prov(ide_teanp);

CREATE INDEX IF NOT EXISTS idx_cxp_cab_flete_cons_ide_teanp ON public.cxp_cab_flete_cons(ide_teanp);
