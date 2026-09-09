-- ============================================================
-- Módulo: Contabilidad — Log de Mayorización
-- Tabla: con_mayorizacion_log
--
-- Registra cada generación/anulación de asiento automático hecha desde la
-- pantalla Mayorizar (Documentos por Pagar, Facturas de Venta, Notas de
-- Crédito), con su resultado (OK / ADVERTENCIA / ERROR), para poder auditar
-- después qué se hizo en un período sin depender del toast momentáneo de la
-- pantalla. Alimenta las tabs "Resumen" y "Log" de Mayorizar.
-- ============================================================

CREATE TABLE con_mayorizacion_log (
    ide_cnmlg               SERIAL PRIMARY KEY,
    tipo_origen_cnmlg        VARCHAR(20)  NOT NULL,   -- FACTURA_VENTA | DOCUMENTOS_PAGAR | NOTA_CREDITO
    accion_cnmlg             VARCHAR(10)  NOT NULL,   -- GENERAR | ANULAR
    subtipo_cnmlg            VARCHAR(20),              -- 'Asiento' | 'Costo' (orígenes que generan 2 asientos)
    ide_documento_cnmlg      INTEGER NOT NULL,         -- ide_cpcfa / ide_cccfa / ide_cpcno según origen
    numero_documento_cnmlg   VARCHAR(50),
    ide_cnccc_cnmlg          INTEGER,                  -- asiento afectado (si se generó/existía)
    numero_cnccc_cnmlg       VARCHAR(50),
    resultado_cnmlg          VARCHAR(15) NOT NULL,     -- OK | ADVERTENCIA | ERROR
    advertencias_cnmlg       JSONB DEFAULT '[]',
    mes_cnmlg                INTEGER NOT NULL,
    periodo_cnmlg             INTEGER NOT NULL,         -- año
    ide_empr                 INTEGER NOT NULL,
    ide_sucu                  INTEGER NOT NULL,
    usuario_ingre              VARCHAR(50),
    fecha_reg_cnmlg             TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_cnmlg_periodo
    ON con_mayorizacion_log (ide_empr, ide_sucu, periodo_cnmlg, mes_cnmlg, tipo_origen_cnmlg);
