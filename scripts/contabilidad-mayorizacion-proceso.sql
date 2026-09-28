-- ============================================================
-- Módulo: Contabilidad — Corridas de Mayorización en segundo plano
-- Tabla: con_mayorizacion_proceso
--
-- "Generar / Anular asientos" de la pantalla Mayorizar corre en el servidor: el avance se guarda
-- aquí, así que la página puede cerrarse y al volver muestra la barra de avance (o nada, si ya
-- terminó). Una sola corrida activa por empresa. Cada asiento sigue quedando además en
-- con_mayorizacion_log (auditoría), como antes.
-- Seguro de re-correr.
-- ============================================================

CREATE TABLE IF NOT EXISTS con_mayorizacion_proceso (
    ide_cnmpr               SERIAL PRIMARY KEY,
    tipo_origen_cnmpr       VARCHAR(20) NOT NULL,   -- FACTURA_VENTA | DOCUMENTOS_PAGAR | NOTA_CREDITO
    accion_cnmpr            VARCHAR(10) NOT NULL,   -- GENERAR | ANULAR
    mes_cnmpr               INTEGER NOT NULL,
    periodo_cnmpr           INTEGER NOT NULL,       -- año
    estado_cnmpr            VARCHAR(15) NOT NULL DEFAULT 'EJECUTANDO',
                            -- EJECUTANDO | OK | CON_ERRORES | CANCELADO | INTERRUMPIDO (reinicio del servidor) | FALLIDO
    total_cnmpr             INTEGER NOT NULL DEFAULT 0,
    procesados_cnmpr        INTEGER NOT NULL DEFAULT 0,
    correctos_cnmpr         INTEGER NOT NULL DEFAULT 0,
    advertencias_cnmpr      INTEGER NOT NULL DEFAULT 0,
    errores_cnmpr           INTEGER NOT NULL DEFAULT 0,
    cancelado_cnmpr         BOOLEAN NOT NULL DEFAULT FALSE,   -- se revisa entre un documento y el siguiente
    documento_actual_cnmpr  VARCHAR(250),
    -- [{ id, numero, persona, total, estado, pasos: [{ label, ok, ide_cnccc }], mensajes: [] }]
    detalle_cnmpr           JSONB NOT NULL DEFAULT '[]',
    error_cnmpr             TEXT,
    fecha_inicio_cnmpr      TIMESTAMP NOT NULL DEFAULT NOW(),
    fecha_fin_cnmpr         TIMESTAMP,
    ide_empr                INTEGER NOT NULL,
    ide_sucu                INTEGER NOT NULL,
    usuario_ingre           VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_cnmpr_empresa ON con_mayorizacion_proceso (ide_empr, ide_cnmpr DESC);
