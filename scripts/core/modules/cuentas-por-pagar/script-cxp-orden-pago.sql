-- ================================================================
-- SCRIPT: Cuentas por Pagar - Órdenes de Pago
-- Descripción: Creación de tablas para gestión de órdenes de pago
--              de proveedores en el módulo de Cuentas por Pagar.
-- Tablas:
--   cxp_estado_orden     - Catálogo de estados de la orden
--   cxp_cab_orden_pago   - Cabecera de la orden de pago
--   cxp_det_orden_pago   - Detalle de facturas a pagar
-- ================================================================


-- ----------------------------------------------------------------
-- TABLA: cxp_estado_orden
-- Catálogo de estados para las órdenes de pago
-- ----------------------------------------------------------------
CREATE TABLE public.cxp_estado_orden (
    ide_cpeo        INT PRIMARY KEY,
    nombre_cpeo     VARCHAR(100) NOT NULL,
    activo_cpeo     BOOLEAN DEFAULT true,
    color_cpeo      VARCHAR(30) NOT NULL,
    ide_empr        INT NULL REFERENCES public.sis_empresa(ide_empr),
    ide_sucu        INT NULL REFERENCES public.sis_sucursal(ide_sucu),
    usuario_ingre   VARCHAR(50),
    hora_ingre      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua   VARCHAR(50),
    hora_actua      TIMESTAMP
);

INSERT INTO public.cxp_estado_orden (ide_cpeo, nombre_cpeo, activo_cpeo, color_cpeo) VALUES
(1, 'GENERADA', true, 'primary');

INSERT INTO public.cxp_estado_orden (ide_cpeo, nombre_cpeo, activo_cpeo, color_cpeo) VALUES
(2, 'EN_PROCESO', true, 'warning');

INSERT INTO public.cxp_estado_orden (ide_cpeo, nombre_cpeo, activo_cpeo, color_cpeo) VALUES
(3, 'PAGADA', true, 'success');

INSERT INTO public.cxp_estado_orden (ide_cpeo, nombre_cpeo, activo_cpeo, color_cpeo) VALUES
(4, 'ANULADA', true, 'error');


-- ----------------------------------------------------------------
-- TABLA: cxp_cab_orden_pago
-- Cabecera de la orden de pago a proveedores
-- ----------------------------------------------------------------
CREATE TABLE public.cxp_cab_orden_pago (
    ide_cpcop                   INT8 PRIMARY KEY,
    ide_cpeo                    INT NOT NULL REFERENCES public.cxp_estado_orden(ide_cpeo),    -- Estado de la orden
    fecha_genera_cpcop          DATE NOT NULL DEFAULT CURRENT_DATE,                           -- Fecha de generación
    fecha_pago_cpcop            DATE,                                                          -- Fecha planificada de pago
    fecha_efectiva_pago_cpcop   DATE,   
    secuencial_cpcop            VARCHAR(9),                                                           -- Secuencial de la orden
    referencia_cpcop            VARCHAR(100),                                                  -- Referencia o descripción de la orden
    activo_cpcop                BOOLEAN DEFAULT true,
    ide_usua                    INT NULL REFERENCES public.sis_usuario(ide_usua),              -- Usuario responsable de la orden
    ide_empr                    INT NULL REFERENCES public.sis_empresa(ide_empr),
    ide_sucu                    INT NULL REFERENCES public.sis_sucursal(ide_sucu),
    usuario_ingre               VARCHAR(50),
    hora_ingre                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua               VARCHAR(50),
    hora_actua                  TIMESTAMP
);


-- ----------------------------------------------------------------
-- TABLA: cxp_det_orden_pago
-- Detalle de facturas/transacciones incluidas en la orden de pago
-- ----------------------------------------------------------------
CREATE TABLE public.cxp_det_orden_pago (
    ide_cpcdop                  INT8 PRIMARY KEY,
    ide_cpcop                   INT8 NOT NULL REFERENCES public.cxp_cab_orden_pago(ide_cpcop),   -- Cabecera de la orden
    ide_cpctr                   INT8 NOT NULL REFERENCES public.cxp_cabece_transa(ide_cpctr),    -- Transacción CXP (de getPagosProveedores)
    ide_cpeo                    INT NOT NULL REFERENCES public.cxp_estado_orden(ide_cpeo),       -- Estado del detalle
    fecha_pago_cpcdop           DATE,                                                             -- Fecha de pago del detalle
    num_comprobante_cpcdop      VARCHAR(50),                                                      -- Número de comprobante de pago
    valor_pagado_cpcdop         NUMERIC(15, 2),                                                   -- Valor pagado al proveedor
    saldo_pendiente_cpcdop      NUMERIC(15, 2),                                                   -- Saldo pendiente del proveedor a la fecha
    documento_referencia_cpcdop VARCHAR(100),                                                     -- Documento de referencia (cheque, transferencia, etc.)
    notifica_cpcdop             BOOLEAN DEFAULT false,                                            -- Indica si se notificó al proveedor
    activo_cpcdop               BOOLEAN DEFAULT true,
    valor_pagado_banco_cpcdop   NUMERIC(15, 2),                                                   -- Valor debitado de la cuenta bancaria
    ide_tecba                   INT NULL REFERENCES public.tes_cuenta_banco(ide_tecba),           -- Cuenta bancaria de pago
    ide_tettb                   INT NULL REFERENCES public.tes_tip_tran_banc(ide_tettb),          -- Tipo de transacción bancaria (transferencia, cheque, etc.)
    observacion_cpcdop          VARCHAR(250),                                                     -- Observaciones del pago
    foto_cpcdop                 VARCHAR(200),      
    fecha_cheque_cpcdop         DATE,                                               -- Nombre del archivo (imagen/PDF) del comprobante de transferencia
    usuario_ingre               VARCHAR(50),
    hora_ingre                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua               VARCHAR(50),
    hora_actua                  TIMESTAMP
);


-- ----------------------------------------------------------------
-- ÍNDICES para optimizar consultas por FK
-- ----------------------------------------------------------------
CREATE INDEX idx_cxp_cab_orden_pago_ide_cpeo  ON public.cxp_cab_orden_pago(ide_cpeo);
CREATE INDEX idx_cxp_cab_orden_pago_ide_usua  ON public.cxp_cab_orden_pago(ide_usua);
CREATE INDEX idx_cxp_cab_orden_pago_ide_empr  ON public.cxp_cab_orden_pago(ide_empr);

CREATE INDEX idx_cxp_det_orden_pago_ide_cpcop ON public.cxp_det_orden_pago(ide_cpcop);
CREATE INDEX idx_cxp_det_orden_pago_ide_cpctr ON public.cxp_det_orden_pago(ide_cpctr);
CREATE INDEX idx_cxp_det_orden_pago_ide_cpeo  ON public.cxp_det_orden_pago(ide_cpeo);
CREATE INDEX idx_cxp_det_orden_pago_ide_tecba ON public.cxp_det_orden_pago(ide_tecba);
