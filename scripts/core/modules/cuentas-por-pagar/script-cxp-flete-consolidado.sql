-- ================================================================
-- SCRIPT: Cuentas por Pagar - Factura Consolidada de Flete
-- Descripción: Creación de tablas para el control del proceso de
--              "una sola factura de flete por varios envíos" de un
--              mismo transportista (Ventas > Transportes > Factura
--              Consolidada de Flete). Registra qué envíos quedaron
--              agrupados en una factura CxP y el valor de cada uno,
--              para poder retomar el registro del pago o anular todo
--              el proceso más adelante.
-- Tablas:
--   cxp_estado_flete_cons - Catálogo de estados del proceso
--   cxp_cab_flete_cons    - Cabecera (proveedor, rango, factura CxP)
--   cxp_det_flete_cons    - Detalle: envíos incluidos y su valor
-- ================================================================

-- ----------------------------------------------------------------
-- DROP: borra las tablas si ya existen (permite re-correr el script
-- completo mientras se itera el diseño, antes de tener datos reales)
-- ----------------------------------------------------------------
DROP TABLE IF EXISTS public.cxp_det_flete_cons;
DROP TABLE IF EXISTS public.cxp_cab_flete_cons;
DROP TABLE IF EXISTS public.cxp_estado_flete_cons;


-- ----------------------------------------------------------------
-- TABLA: cxp_estado_flete_cons
-- Catálogo de estados del proceso de factura consolidada de flete
-- ----------------------------------------------------------------
CREATE TABLE public.cxp_estado_flete_cons (
    ide_cpefc       INT PRIMARY KEY,
    nombre_cpefc    VARCHAR(100) NOT NULL,
    activo_cpefc    BOOLEAN DEFAULT true,
    color_cpefc     VARCHAR(30) NOT NULL,
    ide_empr        INT NULL REFERENCES public.sis_empresa(ide_empr),
    ide_sucu        INT NULL REFERENCES public.sis_sucursal(ide_sucu),
    usuario_ingre   VARCHAR(50),
    hora_ingre      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua   VARCHAR(50),
    hora_actua      TIMESTAMP
);

INSERT INTO public.cxp_estado_flete_cons (ide_cpefc, nombre_cpefc, activo_cpefc, color_cpefc) VALUES
(1, 'PENDIENTE DE PAGO', true, 'warning');

INSERT INTO public.cxp_estado_flete_cons (ide_cpefc, nombre_cpefc, activo_cpefc, color_cpefc) VALUES
(2, 'PAGADO', true, 'success');

INSERT INTO public.cxp_estado_flete_cons (ide_cpefc, nombre_cpefc, activo_cpefc, color_cpefc) VALUES
(3, 'ANULADO', true, 'error');


-- ----------------------------------------------------------------
-- TABLA: cxp_cab_flete_cons
-- Cabecera del proceso: proveedor, rango de fechas consultado y la
-- factura CxP consolidada que se creó a partir del XML
-- ----------------------------------------------------------------
CREATE TABLE public.cxp_cab_flete_cons (
    ide_cpcfc           INT8 PRIMARY KEY,
    ide_cpefc           INT NOT NULL REFERENCES public.cxp_estado_flete_cons(ide_cpefc),  -- Estado del proceso
    ide_geper           INT NOT NULL REFERENCES public.gen_persona(ide_geper),            -- Proveedor/transportista
    ide_cpcfa           INT NOT NULL REFERENCES public.cxp_cabece_factur(ide_cpcfa),      -- Factura CxP consolidada creada
    fecha_desde_cpcfc    DATE NOT NULL,                                                    -- Rango usado al buscar los envíos
    fecha_hasta_cpcfc    DATE NOT NULL,
    ide_teclb           INT NULL REFERENCES public.tes_cab_libr_banc(ide_teclb),          -- Movimiento de pago, una vez registrado
    activo_cpcfc         BOOLEAN DEFAULT true,
    ide_empr            INT NULL REFERENCES public.sis_empresa(ide_empr),
    ide_sucu             INT NULL REFERENCES public.sis_sucursal(ide_sucu),
    usuario_ingre        VARCHAR(50),
    hora_ingre           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua        VARCHAR(50),
    hora_actua           TIMESTAMP
);


-- ----------------------------------------------------------------
-- TABLA: cxp_det_flete_cons
-- Detalle: cada envío incluido en la factura consolidada, vinculado
-- directamente a la línea real de la factura CxP que le corresponde
-- (emparejada por GPT o a mano en el visualizador). El valor/
-- observación "facturado" se lee siempre en vivo desde
-- cxp_detall_factur vía ide_cpdfa (no se guarda una copia acá), así
-- nunca queda desactualizado si la factura se edita después. El
-- ON DELETE RESTRICT impide borrar esa línea desde la edición
-- genérica de documentos CxP mientras el proceso siga activo (ver
-- documentos-cxp-save.service.ts, buildDiffDetalle/CHILD_GUARDS_DETALLE).
-- ----------------------------------------------------------------
CREATE TABLE public.cxp_det_flete_cons (
    ide_cpdfc            INT8 PRIMARY KEY,
    ide_cpcfc            INT8 NOT NULL REFERENCES public.cxp_cab_flete_cons(ide_cpcfc),
    ide_cctfa            INT8 NOT NULL REFERENCES public.cxc_transporte_factura(ide_cctfa), -- Envío
    ide_cpdfa            INT8 NOT NULL REFERENCES public.cxp_detall_factur(ide_cpdfa) ON DELETE RESTRICT, -- Línea real de la factura
    usuario_ingre        VARCHAR(50),
    hora_ingre           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ----------------------------------------------------------------
-- ÍNDICES para optimizar consultas por FK
-- ----------------------------------------------------------------
CREATE INDEX idx_cxp_cab_flete_cons_ide_cpefc ON public.cxp_cab_flete_cons(ide_cpefc);
CREATE INDEX idx_cxp_cab_flete_cons_ide_geper ON public.cxp_cab_flete_cons(ide_geper);
CREATE INDEX idx_cxp_cab_flete_cons_ide_cpcfa ON public.cxp_cab_flete_cons(ide_cpcfa);
CREATE INDEX idx_cxp_cab_flete_cons_ide_empr  ON public.cxp_cab_flete_cons(ide_empr);

CREATE INDEX idx_cxp_det_flete_cons_ide_cpcfc ON public.cxp_det_flete_cons(ide_cpcfc);
CREATE INDEX idx_cxp_det_flete_cons_ide_cctfa ON public.cxp_det_flete_cons(ide_cctfa);
CREATE INDEX idx_cxp_det_flete_cons_ide_cpdfa ON public.cxp_det_flete_cons(ide_cpdfa);
