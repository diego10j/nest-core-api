-- ============================================================
-- Módulo: Ventas - Configuración de Punto de Venta POS
-- Tablas: ven_pos_punto_venta, ven_usuario_punto_venta
-- ============================================================
-- Ejecutar con: psql -h localhost -U postgres -d proerp -f scripts/script-pos-configuracion.sql

-- ============================================================
-- Tabla: ven_pos_punto_venta
-- Descripción: Configuración de puntos de venta POS (impresora, punto emisión SRI)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ven_pos_punto_venta (
    ide_vgpos                 int8 NOT NULL,
    nombre_vgpos              varchar(100) NOT NULL,
    printer_url_vgpos         varchar(500),
    printer_token_vgpos       varchar(500),
    ide_ccdaf                 int8,
    activo_vgpos              boolean DEFAULT true,
    ide_empr                  int NULL REFERENCES public.sis_empresa(ide_empr),
    ide_sucu                  int NULL REFERENCES public.sis_sucursal(ide_sucu),
    usuario_ingre             varchar(50),
    hora_ingre                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua             varchar(50),
    hora_actua                TIMESTAMP,
    CONSTRAINT pk_ven_pos_punto_venta PRIMARY KEY (ide_vgpos)
);

COMMENT ON TABLE public.ven_pos_punto_venta IS 'Configuración de puntos de venta POS';
COMMENT ON COLUMN public.ven_pos_punto_venta.printer_url_vgpos IS 'URL del servidor de impresión térmica (null = usar env VITE_POS_PRINTER_URL)';
COMMENT ON COLUMN public.ven_pos_punto_venta.printer_token_vgpos IS 'Token del servidor de impresión térmica (null = usar env VITE_POS_PRINTER_TOKEN)';
COMMENT ON COLUMN public.ven_pos_punto_venta.ide_ccdaf IS 'FK a cxc_datos_fac - Punto de emisión del SRI';

CREATE INDEX IF NOT EXISTS idx_ven_pos_punto_venta_empr ON public.ven_pos_punto_venta(ide_empr);
CREATE INDEX IF NOT EXISTS idx_ven_pos_punto_venta_sucu ON public.ven_pos_punto_venta(ide_sucu);
CREATE INDEX IF NOT EXISTS idx_ven_pos_punto_venta_ccdaf ON public.ven_pos_punto_venta(ide_ccdaf);

-- ============================================================
-- Tabla: ven_usuario_punto_venta
-- Descripción: Relación usuarios asignados a puntos de venta POS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ven_usuario_punto_venta (
    ide_vgupvt                int8 NOT NULL,
    ide_vgpos                 int8 NOT NULL,
    ide_usua                  int4 NULL REFERENCES public.sis_usuario(ide_usua),
    activo_vgupvt             boolean DEFAULT true,
    ide_empr                  int NULL REFERENCES public.sis_empresa(ide_empr),
    ide_sucu                  int NULL REFERENCES public.sis_sucursal(ide_sucu),
    usuario_ingre             varchar(50),
    hora_ingre                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua             varchar(50),
    hora_actua                TIMESTAMP,
    CONSTRAINT pk_ven_usuario_punto_venta PRIMARY KEY (ide_vgupvt)
);

COMMENT ON TABLE public.ven_usuario_punto_venta IS 'Relación usuarios asignados a puntos de venta POS';

ALTER TABLE public.ven_usuario_punto_venta
    ADD CONSTRAINT fk_vgupvt_vgpos
    FOREIGN KEY (ide_vgpos) REFERENCES public.ven_pos_punto_venta(ide_vgpos) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_ven_usuario_punto_venta_empr ON public.ven_usuario_punto_venta(ide_empr);
CREATE INDEX IF NOT EXISTS idx_ven_usuario_punto_venta_sucu ON public.ven_usuario_punto_venta(ide_sucu);
CREATE INDEX IF NOT EXISTS idx_ven_usuario_punto_venta_vgpos ON public.ven_usuario_punto_venta(ide_vgpos);
CREATE INDEX IF NOT EXISTS idx_ven_usuario_punto_venta_usua ON public.ven_usuario_punto_venta(ide_usua);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ven_usuario_punto_venta ON public.ven_usuario_punto_venta(ide_vgpos, ide_usua);
