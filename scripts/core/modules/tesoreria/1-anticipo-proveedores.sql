-- ================================================================
-- SCRIPT: Tesorería - Anticipo a Proveedores
-- Descripción: Pago anticipado a un proveedor SIN factura todavía,
--              contabilizado contra una cuenta dedicada de activo
--              ("Anticipo a Proveedores", ej. 1.1.06.03) en vez de
--              la cuenta por pagar del proveedor. Cuando llega la
--              factura, el anticipo se "liquida" aplicándolo a una o
--              varias facturas (reclasifica Anticipo -> Cuenta por
--              Pagar del proveedor).
--
-- La cuenta contable NO se configura acá: se usa el mecanismo ya
-- existente de Contabilidad > Configuración de Asientos
-- (con_cab_conf_asie / con_vig_conf_asie / con_det_conf_asie, mismas
-- tablas que ya resuelven "CUENTA POR PAGAR"/"CUENTA POR COBRAR") -
-- crear ahí una cabecera "ANTICIPO A PROVEEDORES" con su vigencia y
-- cuenta contable (ver AsientosAutomaticosService.
-- generarAsientoAnticipoProveedor/generarAsientoLiquidacionAnticipo).
--
-- Tablas:
--   tes_estado_anticipo_prov - Catálogo de estados
--   tes_cab_anticipo_prov    - Cabecera: proveedor, pago, saldo
--   tes_det_anticipo_prov    - Detalle: facturas a las que se aplicó
-- ================================================================

CREATE TABLE IF NOT EXISTS public.tes_estado_anticipo_prov (
    ide_teeap       INT PRIMARY KEY,
    nombre_teeap    VARCHAR(100) NOT NULL,
    activo_teeap    BOOLEAN DEFAULT true,
    color_teeap     VARCHAR(30) NOT NULL,
    ide_empr        INT NULL REFERENCES public.sis_empresa(ide_empr),
    ide_sucu        INT NULL REFERENCES public.sis_sucursal(ide_sucu),
    usuario_ingre   VARCHAR(50),
    hora_ingre      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua   VARCHAR(50),
    hora_actua      TIMESTAMP
);

INSERT INTO public.tes_estado_anticipo_prov (ide_teeap, nombre_teeap, activo_teeap, color_teeap)
SELECT * FROM (VALUES
    (1, 'PENDIENTE DE LIQUIDAR', true, 'warning'),
    (2, 'PARCIALMENTE LIQUIDADO', true, 'info'),
    (3, 'LIQUIDADO', true, 'success'),
    (4, 'ANULADO', true, 'error')
) AS v(ide_teeap, nombre_teeap, activo_teeap, color_teeap)
WHERE NOT EXISTS (SELECT 1 FROM public.tes_estado_anticipo_prov WHERE ide_teeap = v.ide_teeap);


-- ----------------------------------------------------------------
-- TABLA: tes_cab_anticipo_prov
-- Cabecera del anticipo: proveedor, pago que lo originó, estado y
-- saldo (valor_teanp - valor_liquidado_teanp = disponible para
-- aplicar a facturas futuras).
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tes_cab_anticipo_prov (
    ide_teanp               INT8 PRIMARY KEY,
    ide_geper               INT8 NOT NULL REFERENCES public.gen_persona(ide_geper),
    ide_teclb               INT8 NOT NULL REFERENCES public.tes_cab_libr_banc(ide_teclb),
    ide_cnccc               INT8 NULL,
    ide_teeap               INT NOT NULL REFERENCES public.tes_estado_anticipo_prov(ide_teeap),
    valor_teanp             NUMERIC(12,2) NOT NULL,
    valor_liquidado_teanp   NUMERIC(12,2) NOT NULL DEFAULT 0,
    fecha_teanp             DATE NOT NULL,
    observacion_teanp       VARCHAR(500) NULL,
    activo_teanp            BOOLEAN DEFAULT true,
    ide_empr                INT NULL REFERENCES public.sis_empresa(ide_empr),
    ide_sucu                INT NULL REFERENCES public.sis_sucursal(ide_sucu),
    usuario_ingre           VARCHAR(50),
    hora_ingre              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua           VARCHAR(50),
    hora_actua              TIMESTAMP
);


-- ----------------------------------------------------------------
-- TABLA: tes_det_anticipo_prov
-- Detalle: cada factura a la que se aplicó (parcial o totalmente)
-- este anticipo, con su propio asiento de reclasificación.
-- activo_tedap permite "desasociar" una liquidación puntual sin
-- afectar las demás (mismo patrón que desasignarFacturaCxp en
-- Importaciones).
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tes_det_anticipo_prov (
    ide_tedap             INT8 PRIMARY KEY,
    ide_teanp             INT8 NOT NULL REFERENCES public.tes_cab_anticipo_prov(ide_teanp),
    ide_cpcfa             INT8 NOT NULL REFERENCES public.cxp_cabece_factur(ide_cpcfa),
    valor_aplicado_tedap  NUMERIC(12,2) NOT NULL,
    ide_cnccc             INT8 NULL,
    fecha_tedap           DATE NOT NULL,
    activo_tedap          BOOLEAN DEFAULT true,
    usuario_ingre         VARCHAR(50),
    hora_ingre            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ----------------------------------------------------------------
-- ÍNDICES para optimizar consultas por FK
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tes_cab_anticipo_prov_ide_geper ON public.tes_cab_anticipo_prov(ide_geper);
CREATE INDEX IF NOT EXISTS idx_tes_cab_anticipo_prov_ide_teeap ON public.tes_cab_anticipo_prov(ide_teeap);
CREATE INDEX IF NOT EXISTS idx_tes_cab_anticipo_prov_ide_teclb ON public.tes_cab_anticipo_prov(ide_teclb);
CREATE INDEX IF NOT EXISTS idx_tes_cab_anticipo_prov_ide_empr  ON public.tes_cab_anticipo_prov(ide_empr);

CREATE INDEX IF NOT EXISTS idx_tes_det_anticipo_prov_ide_teanp ON public.tes_det_anticipo_prov(ide_teanp);
CREATE INDEX IF NOT EXISTS idx_tes_det_anticipo_prov_ide_cpcfa ON public.tes_det_anticipo_prov(ide_cpcfa);
