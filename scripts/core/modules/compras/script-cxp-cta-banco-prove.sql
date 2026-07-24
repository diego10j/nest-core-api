-- ================================================================
-- SCRIPT: Compras - Cuentas Bancarias de Proveedores
-- Descripción: Creación de tabla para gestionar las cuentas
--              bancarias de los proveedores.
-- Tabla:
--   cxp_cta_banco_prove   - Cuentas bancarias de proveedores
-- ================================================================

-- ----------------------------------------------------------------
-- TABLA: cxp_cta_banco_prove
-- Cuentas bancarias asociadas a proveedores (gen_persona)
-- ----------------------------------------------------------------
CREATE TABLE public.cxp_cta_banco_prove (
    ide_cpcbp            INT8 PRIMARY KEY,
    ide_geper            INT NOT NULL REFERENCES public.gen_persona(ide_geper),
    ide_teban            INT NULL REFERENCES public.tes_banco(ide_teban),
    ide_tetcb            INT NULL REFERENCES public.tes_tip_cuen_banc(ide_tetcb),
    numero_cpcbp         VARCHAR(40),
    nombre_cpcbp         VARCHAR(100),
    observacion_cpcbp    VARCHAR(250),
    activo_cpcbp         BOOLEAN DEFAULT true,
    defecto_cpcbp        BOOLEAN DEFAULT false,
    ide_empr             INT NULL REFERENCES public.sis_empresa(ide_empr),
    ide_sucu             INT NULL REFERENCES public.sis_sucursal(ide_sucu),
    usuario_ingre        VARCHAR(50),
    hora_ingre           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua        VARCHAR(50),
    hora_actua           TIMESTAMP
);

-- ----------------------------------------------------------------
-- ÍNDICES
-- ----------------------------------------------------------------
CREATE INDEX idx_cxp_cta_banco_prove_ide_geper ON public.cxp_cta_banco_prove(ide_geper);
CREATE INDEX idx_cxp_cta_banco_prove_ide_teban ON public.cxp_cta_banco_prove(ide_teban);
CREATE INDEX idx_cxp_cta_banco_prove_ide_empr  ON public.cxp_cta_banco_prove(ide_empr);
