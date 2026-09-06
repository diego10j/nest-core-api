-- ================================================================
-- SCRIPT: Tesorería - Anticipo a Proveedores (simplificado)
-- Descripción: Reemplaza el diseño de 1-anticipo-proveedores.sql.
--   En vez de duplicar cabecera/valor/proveedor del pago en tablas
--   propias, el anticipo pasa a vivir en cxp_cabece_transa /
--   cxp_detall_transa (mismo mecanismo genérico que ya usan
--   savePagoCxP/saveAnticipoCxP) - así aparece de una en las
--   pantallas existentes de Transacciones CxP y en el detalle de
--   movimientos de Tesorería. Solo se mantiene una tabla chica
--   nueva para el caso que cxp_cabece_transa NO soporta: liquidar
--   un mismo anticipo contra VARIAS facturas (o parcialmente) -
--   cxp_cabece_transa.ide_cpcfa solo puede apuntar a una.
--
-- ADVERTENCIA: esto BORRA tes_cab_anticipo_prov/tes_det_anticipo_prov
-- y cualquier dato de prueba que tengan (incluye el ide_teanp que
-- haya quedado vinculado en cxp_cab_flete_cons). Correr solo cuando
-- no haya anticipos reales pendientes en esas tablas.
-- ================================================================

ALTER TABLE public.cxp_cab_flete_cons DROP CONSTRAINT IF EXISTS cxp_cab_flete_cons_ide_teanp_fkey;
ALTER TABLE public.cxp_cab_flete_cons DROP COLUMN IF EXISTS ide_teanp;
ALTER TABLE public.cxp_cab_flete_cons
    ADD COLUMN IF NOT EXISTS ide_cpctr_anticipo INT8 NULL REFERENCES public.cxp_cabece_transa(ide_cpctr);
CREATE INDEX IF NOT EXISTS idx_cxp_cab_flete_cons_ide_cpctr_anticipo
    ON public.cxp_cab_flete_cons(ide_cpctr_anticipo);

DROP TABLE IF EXISTS public.tes_det_anticipo_prov;
DROP TABLE IF EXISTS public.tes_cab_anticipo_prov;
DROP TABLE IF EXISTS public.tes_estado_anticipo_prov;

-- ----------------------------------------------------------------
-- TABLA: cxp_aplicacion_anticipo
-- Registra cada factura a la que se aplicó (parcial o totalmente)
-- un anticipo (cxp_cabece_transa con ide_cpttr = anticipo). Cuando
-- el anticipo se aplica completo a UNA sola factura, no hace falta
-- ninguna fila acá: alcanza con cxp_cabece_transa.ide_cpcfa (mismo
-- mecanismo ya usado por DocumentosCxPSaveService.
-- resolverCabeceraTransaccion vía ide_cpctr_anticipo). Esta tabla
-- solo se usa para el caso de varias facturas o aplicación parcial.
-- ----------------------------------------------------------------
CREATE TABLE public.cxp_aplicacion_anticipo (
    ide_cpaan             INT8 PRIMARY KEY,
    ide_cpctr             INT8 NOT NULL REFERENCES public.cxp_cabece_transa(ide_cpctr),
    ide_cpcfa             INT8 NOT NULL REFERENCES public.cxp_cabece_factur(ide_cpcfa),
    valor_aplicado_cpaan  NUMERIC(12,2) NOT NULL,
    ide_cnccc             INT8 NULL,
    fecha_cpaan           DATE NOT NULL,
    activo_cpaan          BOOLEAN DEFAULT true,
    usuario_ingre         VARCHAR(50),
    hora_ingre            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cxp_aplicacion_anticipo_ide_cpctr ON public.cxp_aplicacion_anticipo(ide_cpctr);
CREATE INDEX idx_cxp_aplicacion_anticipo_ide_cpcfa ON public.cxp_aplicacion_anticipo(ide_cpcfa);
