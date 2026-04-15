CREATE TABLE IF NOT EXISTS inv_kardex_ppmp (
    ide_kardex          SERIAL       PRIMARY KEY,
    ide_empr            INT          NOT NULL,
    ide_sucu            INT          NOT NULL,
    ide_inarti          BIGINT          NOT NULL,
    ide_incci           BIGINT          NOT NULL,   -- comprobante origen
    fecha_mov           DATE            NOT NULL,
    orden_mov           BIGINT          NOT NULL,   -- orden global del movimiento
    signo               SMALLINT        NOT NULL,   -- 1=ingreso, -1=egreso
    cantidad            NUMERIC(18,6)   NOT NULL,
    precio_compra       NUMERIC(18,6)   NOT NULL DEFAULT 0,  -- 0 en egresos
    saldo_cantidad      NUMERIC(18,6)   NOT NULL,
    saldo_valor         NUMERIC(18,6)   NOT NULL,
    costo_promedio      NUMERIC(18,6)   NOT NULL,
    fecha_proceso       TIMESTAMPTZ     NOT NULL DEFAULT now(),
    CONSTRAINT uq_kardex_incci UNIQUE (ide_incci, ide_inarti)
);

-- Índices críticos para la consulta de costo unitario
CREATE INDEX idx_kardex_ppmp_lookup
    ON inv_kardex_ppmp (ide_empr, ide_sucu, ide_inarti, fecha_mov, orden_mov DESC)
    INCLUDE (costo_promedio, saldo_cantidad, signo, precio_compra);

CREATE INDEX idx_kardex_ppmp_orden
    ON inv_kardex_ppmp (ide_empr, ide_sucu, ide_inarti, orden_mov);


    

-- 1. Corregir el constraint único (incluir sucursal + línea de detalle)
ALTER TABLE inv_kardex_ppmp DROP CONSTRAINT IF EXISTS uq_kardex_incci;

-- Necesitamos identificar la línea del detalle para unicidad
-- Agregar columna ide_indci si no existe (id del detalle)
ALTER TABLE inv_kardex_ppmp 
    ADD COLUMN IF NOT EXISTS ide_indci BIGINT;  -- FK a inv_det_comp_inve

-- Nuevo constraint: empresa + sucursal + comprobante + artículo + línea detalle
ALTER TABLE inv_kardex_ppmp 
    ADD CONSTRAINT uq_kardex_ppmp 
    UNIQUE (ide_empr, ide_sucu, ide_inarti, ide_incci, ide_indci);

