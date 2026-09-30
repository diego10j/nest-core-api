-- =============================================================================
-- MIGRACIÓN: Conciliación bancaria mensual (estados de cuenta de cualquier banco)
-- Fecha: 2026-09-30
-- Ejecutar DESPUÉS de tesoreria/corte_acreditacion_tarjeta_migration.sql
-- Descripción:
--   Una CONCILIACIÓN es una cuenta (tes_cuenta_banco) + un mes completo. Se le cargan uno o más
--   ARCHIVOS del banco (Excel/CSV/PDF; para cuentas como Deuna se puede subir un corte parcial y
--   luego el de fin de mes: solo se insertan los movimientos nuevos). Del archivo se guardan los
--   MOVIMIENTOS del banco en tablas propias y se cruzan contra tes_cab_libr_banc mediante MATCHES
--   (automáticos, sugeridos por IA o manuales).
--
--   tes_cab_libr_banc NO se modifica: ya tiene conciliado_teclb + fecha_concilia_teclb, que se
--   mantienen sincronizados al conciliar/desconciliar (para no romper reportes/pantallas
--   existentes). La trazabilidad (quién, cómo, contra qué movimiento del banco) vive en
--   tes_conciliacion_match.
--
--   Las tablas legadas tes_conciliacion_banco y tes_configura_conciliacion (importación por
--   número de columna) NO se usan: se dejan intactas.
--
--   El número de cuenta de cada banco se guarda en tes_cuenta_banco.nombre_tecba (convención del
--   ERP): la cuenta del archivo se detecta comparando sus dígitos contra ese campo.
--
--   Idempotente: se puede ejecutar más de una vez.
-- =============================================================================

-- ============================================================
-- 1. Cabecera: cuenta + mes
-- ============================================================
CREATE TABLE IF NOT EXISTS tes_conciliacion (
    ide_tecnc BIGINT NOT NULL,
    ide_empr BIGINT NOT NULL,
    ide_sucu BIGINT NOT NULL,
    ide_tecba BIGINT NOT NULL,
    anio_tecnc SMALLINT NOT NULL,
    mes_tecnc SMALLINT NOT NULL,
    fecha_desde_tecnc DATE NOT NULL,
    fecha_hasta_tecnc DATE NOT NULL,

    -- Saldos REALES del banco: se recalculan de los movimientos cargados (cadena de saldos del
    -- estado de cuenta) cada vez que se sube un archivo, así un corte posterior los actualiza.
    saldo_inicial_banco_tecnc NUMERIC(14,2),
    saldo_final_banco_tecnc NUMERIC(14,2),
    -- Saldos del ERP (libro de bancos) al cerrar el cálculo; foto del último recálculo.
    saldo_inicial_erp_tecnc NUMERIC(14,2),
    saldo_final_erp_tecnc NUMERIC(14,2),
    -- Fecha del último movimiento del banco cargado (para cortes parciales: 29/09 de un mes de 30)
    fecha_ultimo_mov_tecnc DATE,

    tolerancia_dias_tecnc SMALLINT NOT NULL DEFAULT 3,
    estado_tecnc VARCHAR(10) NOT NULL DEFAULT 'ABIERTA',
    observacion_tecnc VARCHAR(500),

    usuario_cierre VARCHAR(50),
    fecha_cierre_tecnc TIMESTAMP,

    anulado_tecnc BOOLEAN NOT NULL DEFAULT FALSE,
    usuario_ingre VARCHAR(50),
    hora_ingre TIMESTAMP DEFAULT NOW(),
    usuario_actua VARCHAR(50),
    hora_actua TIMESTAMP,

    CONSTRAINT pk_tes_conciliacion PRIMARY KEY (ide_tecnc),
    CONSTRAINT tes_conciliacion_estado_chk CHECK (estado_tecnc IN ('ABIERTA', 'CERRADA')),
    CONSTRAINT tes_conciliacion_mes_chk CHECK (mes_tecnc BETWEEN 1 AND 12),
    CONSTRAINT tes_conciliacion_empr_fkey
        FOREIGN KEY (ide_empr) REFERENCES sis_empresa(ide_empr) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_conciliacion_sucu_fkey
        FOREIGN KEY (ide_sucu) REFERENCES sis_sucursal(ide_sucu) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_conciliacion_tecba_fkey
        FOREIGN KEY (ide_tecba) REFERENCES tes_cuenta_banco(ide_tecba) ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- Una sola conciliación vigente por cuenta y mes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tecnc_cuenta_mes_vigente
    ON tes_conciliacion (ide_tecba, anio_tecnc, mes_tecnc) WHERE anulado_tecnc = FALSE;
CREATE INDEX IF NOT EXISTS idx_tecnc_sucu_periodo ON tes_conciliacion (ide_sucu, anio_tecnc, mes_tecnc);

COMMENT ON TABLE tes_conciliacion IS
    'Conciliación bancaria de UNA cuenta (tes_cuenta_banco) para UN mes completo. Estado ABIERTA mientras se cargan cortes/se concilia; CERRADA cuando el contador la da por terminada.';

-- ============================================================
-- 2. Archivos del banco subidos (respaldo descargable + resultado de la lectura)
-- ============================================================
CREATE TABLE IF NOT EXISTS tes_conciliacion_archivo (
    ide_tecar BIGINT NOT NULL,
    ide_tecnc BIGINT NOT NULL,
    nombre_original_tecar VARCHAR(255) NOT NULL,
    -- Nombre en disco dentro de PATH_DRIVE/tesoreria/conciliaciones (NO es temp_media: esa carpeta
    -- se purga a los 90 días y el contador necesita el respaldo indefinidamente).
    nombre_archivo_tecar VARCHAR(255) NOT NULL,
    mime_tecar VARCHAR(120),
    tamano_tecar BIGINT,
    sha256_tecar CHAR(64) NOT NULL,
    -- Formato reconocido: GUAYAQUIL, PICHINCHA, PRODUBANCO, DEUNA (extensible)
    formato_tecar VARCHAR(30) NOT NULL,
    cuenta_detectada_tecar VARCHAR(40),
    fecha_desde_tecar DATE,
    fecha_hasta_tecar DATE,
    saldo_inicial_tecar NUMERIC(14,2),
    saldo_final_tecar NUMERIC(14,2),
    num_movimientos_tecar INTEGER NOT NULL DEFAULT 0,
    num_nuevos_tecar INTEGER NOT NULL DEFAULT 0,
    num_duplicados_tecar INTEGER NOT NULL DEFAULT 0,
    advertencias_tecar TEXT,

    usuario_ingre VARCHAR(50),
    hora_ingre TIMESTAMP DEFAULT NOW(),

    CONSTRAINT pk_tes_conciliacion_archivo PRIMARY KEY (ide_tecar),
    CONSTRAINT tes_conciliacion_archivo_tecnc_fkey
        FOREIGN KEY (ide_tecnc) REFERENCES tes_conciliacion(ide_tecnc) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_tecar_tecnc ON tes_conciliacion_archivo (ide_tecnc);

COMMENT ON TABLE tes_conciliacion_archivo IS
    'Cada archivo del banco cargado a una conciliación (un corte). Se conserva el original para descargarlo en cualquier momento.';

-- ============================================================
-- 3. Movimientos del banco (una fila por movimiento del estado de cuenta)
-- ============================================================
CREATE TABLE IF NOT EXISTS tes_conciliacion_mov (
    ide_tecmv BIGINT NOT NULL,
    ide_tecnc BIGINT NOT NULL,
    -- Archivo en que apareció por primera vez
    ide_tecar BIGINT NOT NULL,
    -- Orden cronológico ascendente (independiente de si el banco lo lista al revés)
    orden_tecmv INTEGER NOT NULL,
    fecha_tecmv DATE NOT NULL,
    documento_tecmv VARCHAR(60),
    descripcion_tecmv VARCHAR(400),
    referencia_tecmv VARCHAR(400),
    oficina_tecmv VARCHAR(80),
    -- Monto SIEMPRE positivo; el signo va aparte (1 = crédito/ingreso, -1 = débito/egreso)
    monto_tecmv NUMERIC(14,2) NOT NULL,
    signo_tecmv SMALLINT NOT NULL,
    -- Saldo del banco DESPUÉS del movimiento
    saldo_tecmv NUMERIC(14,2),
    -- Huella para no re-insertar un movimiento al subir otro corte del mismo mes
    hash_tecmv CHAR(40) NOT NULL,
    -- PENDIENTE (sin cruzar), CONCILIADO (con match vigente), FALTANTE (el contador confirmó que
    -- no está en el ERP y debe registrarse), IGNORADO (no requiere registro)
    estado_tecmv VARCHAR(10) NOT NULL DEFAULT 'PENDIENTE',
    nota_tecmv VARCHAR(400),

    usuario_ingre VARCHAR(50),
    hora_ingre TIMESTAMP DEFAULT NOW(),
    usuario_actua VARCHAR(50),
    hora_actua TIMESTAMP,

    CONSTRAINT pk_tes_conciliacion_mov PRIMARY KEY (ide_tecmv),
    CONSTRAINT tes_conciliacion_mov_signo_chk CHECK (signo_tecmv IN (1, -1)),
    CONSTRAINT tes_conciliacion_mov_estado_chk CHECK (estado_tecmv IN ('PENDIENTE', 'CONCILIADO', 'FALTANTE', 'IGNORADO')),
    CONSTRAINT tes_conciliacion_mov_tecnc_fkey
        FOREIGN KEY (ide_tecnc) REFERENCES tes_conciliacion(ide_tecnc) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_conciliacion_mov_tecar_fkey
        FOREIGN KEY (ide_tecar) REFERENCES tes_conciliacion_archivo(ide_tecar) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_conciliacion_mov_hash_unique UNIQUE (ide_tecnc, hash_tecmv)
);

CREATE INDEX IF NOT EXISTS idx_tecmv_tecnc_estado ON tes_conciliacion_mov (ide_tecnc, estado_tecmv);
CREATE INDEX IF NOT EXISTS idx_tecmv_tecnc_fecha ON tes_conciliacion_mov (ide_tecnc, fecha_tecmv, orden_tecmv);

COMMENT ON TABLE tes_conciliacion_mov IS
    'Movimientos del estado de cuenta del banco, ya normalizados (monto positivo + signo), cargados desde los archivos de una conciliación.';

-- ============================================================
-- 4. Matches: movimiento(s) del banco <-> movimiento(s) del libro de bancos
-- ============================================================
CREATE TABLE IF NOT EXISTS tes_conciliacion_match (
    ide_tecmt BIGINT NOT NULL,
    ide_tecnc BIGINT NOT NULL,
    ide_tecmv BIGINT NOT NULL,
    ide_teclb BIGINT NOT NULL,
    -- Filas con el mismo grupo forman UN cruce N:M (ej. un depósito del banco = 3 cheques del ERP)
    grupo_tecmt BIGINT NOT NULL,
    -- AUTO (reglas), IA (sugerencia GPT aceptada) o MANUAL
    tipo_tecmt VARCHAR(10) NOT NULL,
    regla_tecmt VARCHAR(40),
    confianza_tecmt SMALLINT,
    observacion_tecmt VARCHAR(400),
    activo_tecmt BOOLEAN NOT NULL DEFAULT TRUE,

    usuario_ingre VARCHAR(50),
    hora_ingre TIMESTAMP DEFAULT NOW(),
    usuario_desconcilia VARCHAR(50),
    hora_desconcilia TIMESTAMP,

    CONSTRAINT pk_tes_conciliacion_match PRIMARY KEY (ide_tecmt),
    CONSTRAINT tes_conciliacion_match_tipo_chk CHECK (tipo_tecmt IN ('AUTO', 'IA', 'MANUAL')),
    CONSTRAINT tes_conciliacion_match_tecnc_fkey
        FOREIGN KEY (ide_tecnc) REFERENCES tes_conciliacion(ide_tecnc) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_conciliacion_match_tecmv_fkey
        FOREIGN KEY (ide_tecmv) REFERENCES tes_conciliacion_mov(ide_tecmv) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tes_conciliacion_match_teclb_fkey
        FOREIGN KEY (ide_teclb) REFERENCES tes_cab_libr_banc(ide_teclb) ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- Un movimiento del libro solo puede estar conciliado UNA vez (en cualquier conciliación), y un
-- movimiento del banco solo en un par (movimiento, libro) vigente.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tecmt_teclb_vigente
    ON tes_conciliacion_match (ide_teclb) WHERE activo_tecmt = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tecmt_par_vigente
    ON tes_conciliacion_match (ide_tecmv, ide_teclb) WHERE activo_tecmt = TRUE;
CREATE INDEX IF NOT EXISTS idx_tecmt_tecnc ON tes_conciliacion_match (ide_tecnc) WHERE activo_tecmt = TRUE;
CREATE INDEX IF NOT EXISTS idx_tecmt_tecmv ON tes_conciliacion_match (ide_tecmv) WHERE activo_tecmt = TRUE;

COMMENT ON TABLE tes_conciliacion_match IS
    'Cruce entre movimientos del banco y del libro de bancos. Al desconciliar la fila queda inactiva (historial) y tes_cab_libr_banc.conciliado_teclb vuelve a false.';

-- Consulta frecuente de candidatos del libro por cuenta y fecha (si no existiera ya)
CREATE INDEX IF NOT EXISTS idx_teclb_tecba_fecha_trans
    ON tes_cab_libr_banc (ide_tecba, fecha_trans_teclb);
