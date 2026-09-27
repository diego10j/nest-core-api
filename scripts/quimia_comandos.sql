-- ============================================================
-- QuimIA: comandos de Telegram configurables y datos para el panel de uso.
-- Requiere scripts/quimia_telegram.sql. Seguro de re-correr.
-- ============================================================

-- 1. Comandos del bot (ej. /ventas, /resumen). Ejecutan un reporte del catálogo (código del backend),
--    sin IA: inmediatos y sin costo. Solo los números con "Puede usar comandos" los ven y los usan.
CREATE TABLE IF NOT EXISTS qmi_comando (
    ide_qmcom           SERIAL PRIMARY KEY,
    ide_tlcue           INTEGER NOT NULL REFERENCES tlg_cuenta(ide_tlcue) ON DELETE CASCADE,
    comando_qmcom       VARCHAR(32) NOT NULL,          -- sin "/": minúsculas, números y "_" (regla de Telegram)
    descripcion_qmcom   VARCHAR(200) NOT NULL,         -- texto del menú "/" de Telegram
    reporte_qmcom       VARCHAR(40) NOT NULL,          -- clave del catálogo: RESUMEN_DIARIO, VENTAS_ANUALES…
    parametros_qmcom    JSONB NOT NULL DEFAULT '{}',   -- valores por defecto del reporte (ej. {"anios": 5})
    activo_qmcom        BOOLEAN NOT NULL DEFAULT TRUE,
    orden_qmcom         INTEGER NOT NULL DEFAULT 0,
    total_usos_qmcom    INTEGER NOT NULL DEFAULT 0,
    ultimo_uso_qmcom    TIMESTAMP,
    ide_empr            INTEGER NOT NULL,
    usuario_ingre       VARCHAR(50),
    fecha_ingre         TIMESTAMP DEFAULT NOW(),
    usuario_actua       VARCHAR(50),
    fecha_actua         TIMESTAMP,
    UNIQUE (ide_tlcue, comando_qmcom)
);

-- 2. Números autorizados que pueden usar los comandos (todos los activos). Por defecto no.
ALTER TABLE tlg_usuario ADD COLUMN IF NOT EXISTS comandos_tlusu BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Panel de uso: tiempo de respuesta y costo IA por consulta (modo_bdcon ahora también: COMANDO).
ALTER TABLE bdt_consulta ADD COLUMN IF NOT EXISTS ms_respuesta_bdcon INTEGER;
ALTER TABLE bdt_consulta ADD COLUMN IF NOT EXISTS costo_usd_bdcon    NUMERIC(10,5);
CREATE INDEX IF NOT EXISTS idx_bdcon_fecha ON bdt_consulta (ide_empr, fecha_ingre DESC);

-- 4. Comandos iniciales (editables/desactivables desde Administración → Telegram → Comandos).
INSERT INTO qmi_comando (ide_tlcue, comando_qmcom, descripcion_qmcom, reporte_qmcom, parametros_qmcom, orden_qmcom, ide_empr, usuario_ingre)
SELECT c.ide_tlcue, v.comando, v.descripcion, v.reporte, v.parametros::jsonb, v.orden, c.ide_empr, 'SISTEMA'
  FROM tlg_cuenta c
 CROSS JOIN (VALUES
     ('resumen',        'Resumen diario de facturas (/resumen 25/09/2026)',     'RESUMEN_DIARIO',   '{"dias_atras": 0}', 1),
     ('ventas',         'Ventas del año por mes con gráfico (/ventas 2025)',    'VENTAS_MENSUALES', '{"anio": 0}',       2),
     ('ventas_diarias', 'Ventas de los últimos días (/ventas_diarias 30)',      'VENTAS_DIARIAS',   '{"dias": 15}',      4),
     ('top_clientes',   'Mejores clientes de los últimos 12 meses',             'TOP_CLIENTES',     '{"meses": 12, "limite": 10}', 5)
 ) AS v(comando, descripcion, reporte, parametros, orden)
ON CONFLICT (ide_tlcue, comando_qmcom) DO NOTHING;

-- 5. Borradores de proforma preparados por QuimIA (chat del ERP / Telegram). La proforma real se crea
--    solo cuando el usuario pulsa "Crear proforma" (nunca por decisión de la IA).
CREATE TABLE IF NOT EXISTS qmi_proforma_borrador (
    ide_qmpbo       SERIAL PRIMARY KEY,
    uuid            UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    canal_qmpbo     VARCHAR(15) NOT NULL,              -- ASESOR | TELEGRAM
    datos_qmpbo     JSONB NOT NULL,                    -- cliente, líneas, totales
    estado_qmpbo    VARCHAR(12) NOT NULL DEFAULT 'BORRADOR', -- BORRADOR | CREADA | CANCELADA
    ide_cccpr       INTEGER,                           -- proforma creada
    secuencial_qmpbo VARCHAR(30),
    telefono_qmpbo  VARCHAR(20),
    ide_empr        INTEGER NOT NULL,
    usuario_ingre   VARCHAR(50),
    fecha_ingre     TIMESTAMP DEFAULT NOW(),
    usuario_crea    VARCHAR(50),                       -- quién confirmó
    fecha_crea      TIMESTAMP
);

-- 6. Tipo de proforma "Agente IA" (proformas creadas desde el chat del ERP). Telegram usa el tipo
--    "WhatsApp" (3), igual que el bot de WhatsApp. Se usa get_seq_table para no desfasar la
--    secuencia del catálogo (sis_bloqueo).
DO $$
DECLARE
    v_ide INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM cxc_tipo_proforma WHERE UPPER(TRIM(nombre_cctpr)) = 'AGENTE IA') THEN
        v_ide := get_seq_table('cxc_tipo_proforma', 'ide_cctpr', 1, 'sistema');
        INSERT INTO cxc_tipo_proforma (ide_cctpr, nombre_cctpr) VALUES (v_ide, 'Agente IA');
        RAISE NOTICE 'Tipo de proforma Agente IA creado (ide_cctpr = %)', v_ide;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Si el catálogo tiene otras columnas obligatorias, crearlo desde el ERP con el nombre "Agente IA".
    RAISE NOTICE 'No se pudo crear el tipo de proforma Agente IA (%): créalo en el catálogo con ese nombre', SQLERRM;
END $$;

-- 7. /ventas pasa a ser el detalle del año por mes (card "Ventas anuales" de Análisis de ventas) y
--    /ventas_mes queda desactivado porque hace lo mismo. Solo si siguen como se sembraron.
UPDATE qmi_comando
   SET reporte_qmcom = 'VENTAS_MENSUALES', parametros_qmcom = '{"anio": 0}',
       descripcion_qmcom = 'Ventas del año por mes con gráfico (/ventas 2025)', fecha_actua = NOW(), usuario_actua = 'SISTEMA'
 WHERE comando_qmcom = 'ventas' AND reporte_qmcom = 'VENTAS_ANUALES';
UPDATE qmi_comando
   SET descripcion_qmcom = 'Resumen diario de facturas (/resumen 25/09/2026)', fecha_actua = NOW(), usuario_actua = 'SISTEMA'
 WHERE comando_qmcom = 'resumen' AND reporte_qmcom = 'RESUMEN_DIARIO' AND descripcion_qmcom LIKE 'Resumen de ventas del día%';
UPDATE qmi_comando
   SET activo_qmcom = FALSE, fecha_actua = NOW(), usuario_actua = 'SISTEMA'
 WHERE comando_qmcom = 'ventas_mes' AND reporte_qmcom = 'VENTAS_MENSUALES' AND usuario_actua IS NULL;
