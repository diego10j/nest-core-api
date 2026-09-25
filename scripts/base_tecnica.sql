-- ============================================================
-- Módulo: Base Técnica DIQUIMEC (BDT)
-- Fichas técnicas (FT), Certificados de análisis (COA), Hojas de seguridad (SDS)
--
-- Estructura autónoma, fuera del módulo de inventario: la ÚNICA relación con el ERP es
-- inv_articulo (ide_inarti). Fabricantes, proveedores y lotes son INFORMACIÓN TÉCNICA propia
-- de esta base (detectada de los documentos o cargada a mano) — no se enlazan a ninguna otra
-- tabla del ERP (inventario, compras, archivos), a propósito.
--
-- Tablas:
--   bdt_fabricante            catálogo técnico de fabricantes
--   bdt_proveedor             catálogo técnico de proveedores / distribuidores
--   bdt_producto_fabricante   producto ERP + fabricante (+ grado) → "origen técnico"
--   bdt_documento             documento: referencia al adjunto + texto original/traducido + metadatos
--   bdt_lote                  lotes (principalmente desde COA)
--   bdt_propiedad             diccionario de propiedades normalizadas (ES/EN + sinónimos)
--   bdt_valor                 valores técnicos extraídos (especificación / resultado / típico)
--   bdt_seccion               fragmentos de texto para búsqueda (secciones SDS, bloques FT/COA)
--   bdt_sinonimo              nombres alternos del producto (inglés, comercial, E-number…)
--   bdt_consulta              log de preguntas al chat técnico (costos, fuentes, feedback)
--   bdt_proceso               corridas de procesamiento (botón por producto / cron en fase 2)
--   bdt_producto              estado actual de la base técnica por producto (última actualización)
--   bdt_historial             bitácora de cambios por producto (qué se agregó/cambió/quitó y cuándo)
--
-- Seguro de re-correr (IF NOT EXISTS).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() no es IMMUTABLE y no se puede usar en columnas generadas / índices;
-- este wrapper con el diccionario explícito sí lo es.
CREATE OR REPLACE FUNCTION bdt_f_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;


-- 1. Fabricantes (catálogo propio de la base técnica)
CREATE TABLE IF NOT EXISTS bdt_fabricante (
    ide_bdfab           SERIAL PRIMARY KEY,
    nombre_bdfab        VARCHAR(200) NOT NULL,
    nombre_norm_bdfab   VARCHAR(200) GENERATED ALWAYS AS (UPPER(bdt_f_unaccent(TRIM(nombre_bdfab)))) STORED,
    pais_bdfab          VARCHAR(80),
    ciudad_bdfab        VARCHAR(80),
    direccion_bdfab     VARCHAR(300),
    web_bdfab           VARCHAR(200),
    email_bdfab         VARCHAR(150),
    telefono_bdfab      VARCHAR(60),
    origen_bdfab        VARCHAR(20) DEFAULT 'DOCUMENTO', -- DOCUMENTO (detectado por IA) | MANUAL
    activo_bdfab        BOOLEAN DEFAULT TRUE,
    -- Auditoría
    ide_empr            INTEGER NOT NULL,
    usuario_ingre       VARCHAR(50),
    fecha_ingre         TIMESTAMP DEFAULT NOW(),
    usuario_actua       VARCHAR(50),
    fecha_actua         TIMESTAMP,
    UNIQUE (ide_empr, nombre_norm_bdfab)
);


-- 1b. Proveedores / distribuidores (catálogo técnico propio, no es gen_persona)
CREATE TABLE IF NOT EXISTS bdt_proveedor (
    ide_bdprv           SERIAL PRIMARY KEY,
    nombre_bdprv        VARCHAR(200) NOT NULL,
    nombre_norm_bdprv   VARCHAR(200) GENERATED ALWAYS AS (UPPER(bdt_f_unaccent(TRIM(nombre_bdprv)))) STORED,
    pais_bdprv          VARCHAR(80),
    web_bdprv           VARCHAR(200),
    email_bdprv         VARCHAR(150),
    telefono_bdprv      VARCHAR(60),
    contacto_bdprv      VARCHAR(150),
    origen_bdprv        VARCHAR(20) DEFAULT 'DOCUMENTO', -- DOCUMENTO | MANUAL
    activo_bdprv        BOOLEAN DEFAULT TRUE,
    -- Auditoría
    ide_empr            INTEGER NOT NULL,
    usuario_ingre       VARCHAR(50),
    fecha_ingre         TIMESTAMP DEFAULT NOW(),
    usuario_actua       VARCHAR(50),
    fecha_actua         TIMESTAMP,
    UNIQUE (ide_empr, nombre_norm_bdprv)
);


-- 2. Producto ERP + fabricante: el "origen técnico" de un producto.
--    Dos fabricantes (o dos grados del mismo fabricante) pueden tener especificaciones distintas,
--    por eso toda la información técnica cuelga de aquí y no del producto a secas.
--    vigente_bdpfa = el origen que se está comercializando actualmente (lo que usa QuimIA para
--    responder "el que manejamos"). Puede haber más de uno vigente si se venden en paralelo.
CREATE TABLE IF NOT EXISTS bdt_producto_fabricante (
    ide_bdpfa               SERIAL PRIMARY KEY,
    ide_inarti              INTEGER NOT NULL REFERENCES inv_articulo(ide_inarti),
    ide_bdfab               INTEGER REFERENCES bdt_fabricante(ide_bdfab), -- NULL = fabricante desconocido
    nombre_comercial_bdpfa  VARCHAR(250),  -- nombre con el que lo vende el fabricante (ej. "Citric Acid Anhydrous")
    codigo_fabricante_bdpfa VARCHAR(80),
    grado_bdpfa             VARCHAR(80),   -- Food Grade | USP | Técnico | Cosmético…
    ide_bdprv               INTEGER REFERENCES bdt_proveedor(ide_bdprv), -- distribuidor por el que llega
    pais_origen_bdpfa       VARCHAR(80),
    cas_bdpfa               VARCHAR(20),   -- validado con dígito verificador antes de guardar
    vigente_bdpfa           BOOLEAN DEFAULT TRUE,
    observacion_bdpfa       TEXT,
    -- Auditoría
    ide_empr                INTEGER NOT NULL,
    usuario_ingre           VARCHAR(50),
    fecha_ingre             TIMESTAMP DEFAULT NOW(),
    usuario_actua           VARCHAR(50),
    fecha_actua             TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bdt_pfa
    ON bdt_producto_fabricante (ide_inarti, COALESCE(ide_bdfab, 0), COALESCE(UPPER(grado_bdpfa), ''));
CREATE INDEX IF NOT EXISTS idx_bdt_pfa_articulo ON bdt_producto_fabricante (ide_inarti) WHERE vigente_bdpfa;


-- 3. Documentos. El PDF/imagen NO se copia: sigue en el almacenamiento de adjuntos del ERP y
--    aquí solo se guarda su uuid como referencia de lectura (sin FK) para abrir el original y
--    detectar re-procesos. Todo lo EXTRAÍDO (texto, traducción, markdown, valores) vive en BD.
CREATE TABLE IF NOT EXISTS bdt_documento (
    ide_bddoc               SERIAL PRIMARY KEY,
    uuid                    UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
    ide_inarti              INTEGER NOT NULL REFERENCES inv_articulo(ide_inarti),
    ide_bdpfa               INTEGER REFERENCES bdt_producto_fabricante(ide_bdpfa),  -- se resuelve tras la extracción
    ide_bdprv               INTEGER REFERENCES bdt_proveedor(ide_bdprv),            -- quien entregó este documento
    tipo_bddoc              VARCHAR(20) NOT NULL DEFAULT 'SIN_CLASIFICAR',
                            -- FICHA_TECNICA | CERTIFICADO_ANALISIS | HOJA_SEGURIDAD | OTRO | SIN_CLASIFICAR
    tipo_fuente_bddoc       VARCHAR(10),   -- REGLAS | IA | MANUAL (quién decidió el tipo)

    -- Archivo
    uuid_origen_bddoc       UUID NOT NULL,      -- uuid del adjunto de origen (referencia, sin FK)
    nombre_original_bddoc   VARCHAR(255) NOT NULL,
    ruta_carpeta_bddoc      VARCHAR(500),       -- "Documentos/COA/2026" (carpetas/subcarpetas del tab Archivos)
    mime_bddoc              VARCHAR(100),
    peso_bddoc              BIGINT,
    paginas_bddoc           SMALLINT,
    hash_bddoc              CHAR(64) NOT NULL,  -- sha256: evita procesar dos veces el mismo PDF

    -- Contenido extraído
    idioma_bddoc            VARCHAR(5),         -- es | en | pt …
    metodo_extraccion_bddoc VARCHAR(10),        -- TEXTO (capa PDF) | VISION (escaneado) | OCR (respaldo)
    texto_original_bddoc    TEXT,               -- texto tal cual, en su idioma original
    texto_es_bddoc          TEXT,               -- traducción al español (NULL si el original ya es español)
    markdown_bddoc          TEXT,               -- representación legible en español (contexto para GPT)
    datos_bddoc             JSONB,              -- respuesta estructurada completa de la extracción

    -- Metadatos detectados (texto tal como aparece en el documento)
    producto_detectado_bddoc   VARCHAR(250),
    fabricante_detectado_bddoc VARCHAR(200),
    proveedor_detectado_bddoc  VARCHAR(200),
    lote_detectado_bddoc       VARCHAR(80),
    codigo_documento_bddoc     VARCHAR(80),     -- nº de documento / versión del fabricante

    -- Fechas (conceptos distintos, no mezclar)
    fecha_emision_bddoc      DATE,
    fecha_revision_bddoc     DATE,              -- típico en SDS
    fecha_fabricacion_bddoc  DATE,              -- típico en COA
    fecha_analisis_bddoc     DATE,              -- típico en COA
    fecha_vencimiento_bddoc  DATE,              -- caducidad del lote / validez del documento
    fecha_referencia_bddoc   DATE GENERATED ALWAYS AS (
        COALESCE(fecha_analisis_bddoc, fecha_revision_bddoc, fecha_emision_bddoc, fecha_fabricacion_bddoc)
    ) STORED,                                   -- para ordenar "el más reciente" de cada tipo

    -- Proceso
    estado_bddoc            VARCHAR(15) NOT NULL DEFAULT 'PENDIENTE',
                            -- PENDIENTE | PROCESANDO | REVISION | APROBADO | RECHAZADO | ERROR
    confianza_bddoc         NUMERIC(4,3),       -- 0..1 calculada por el backend (no la que dice GPT)
    motivos_revision_bddoc  TEXT[],             -- ej. {PRODUCTO_NO_COINCIDE, SIN_FECHA, TIPO_DUDOSO}
    vigente_bddoc           BOOLEAN DEFAULT TRUE, -- FALSE cuando otro documento del mismo tipo/origen lo reemplaza
    publico_bddoc           BOOLEAN DEFAULT FALSE, -- visible para clientes (portal/bot); COA nunca por defecto
    version_extractor_bddoc SMALLINT DEFAULT 1, -- subirla permite reprocesar todo con prompts nuevos
    modelo_ia_bddoc         VARCHAR(50),
    tokens_entrada_bddoc    INTEGER DEFAULT 0,
    tokens_salida_bddoc     INTEGER DEFAULT 0,
    intentos_bddoc          SMALLINT DEFAULT 0,
    error_bddoc             TEXT,
    fecha_proceso_bddoc     TIMESTAMP,
    usuario_revisa_bddoc    VARCHAR(50),
    fecha_revisa_bddoc      TIMESTAMP,

    -- Auditoría
    ide_empr                INTEGER NOT NULL,
    usuario_ingre           VARCHAR(50),
    fecha_ingre             TIMESTAMP DEFAULT NOW(),
    usuario_actua           VARCHAR(50),
    fecha_actua             TIMESTAMP,
    UNIQUE (ide_empr, ide_inarti, hash_bddoc)  -- el mismo PDF puede estar adjunto en 2 productos
);
CREATE INDEX IF NOT EXISTS idx_bdt_doc_articulo ON bdt_documento (ide_inarti, tipo_bddoc, fecha_referencia_bddoc DESC);
CREATE INDEX IF NOT EXISTS idx_bdt_doc_estado   ON bdt_documento (estado_bddoc) WHERE estado_bddoc IN ('PENDIENTE', 'REVISION', 'ERROR');


-- 4. Lotes (propios de la base técnica, principalmente desde COA)
CREATE TABLE IF NOT EXISTS bdt_lote (
    ide_bdlot                SERIAL PRIMARY KEY,
    ide_inarti               INTEGER NOT NULL REFERENCES inv_articulo(ide_inarti),
    ide_bdpfa                INTEGER REFERENCES bdt_producto_fabricante(ide_bdpfa),
    ide_bddoc                INTEGER REFERENCES bdt_documento(ide_bddoc) ON DELETE SET NULL, -- COA que lo respalda
    numero_bdlot             VARCHAR(80) NOT NULL,
    fecha_fabricacion_bdlot  DATE,
    fecha_analisis_bdlot     DATE,
    fecha_vencimiento_bdlot  DATE,
    cumple_bdlot             BOOLEAN,          -- el COA declara conformidad (Complies / Pass)
    pais_origen_bdlot        VARCHAR(80),      -- "Country of origin" del COA (puede diferir del fabricante)
    presentacion_bdlot       VARCHAR(150),     -- empaque declarado en el COA: "Bolsa 25 kg", "Big bag 1000 kg"
    -- Auditoría
    ide_empr                 INTEGER NOT NULL,
    usuario_ingre            VARCHAR(50),
    fecha_ingre              TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bdt_lote
    ON bdt_lote (ide_inarti, COALESCE(ide_bdpfa, 0), UPPER(numero_bdlot));

ALTER TABLE bdt_documento ADD COLUMN IF NOT EXISTS ide_bdlot INTEGER REFERENCES bdt_lote(ide_bdlot) ON DELETE SET NULL;


-- 5. Diccionario de propiedades normalizadas.
--    Resuelve el idioma: "Assay", "Purity", "Pureza", "Contenido" → PUREZA.
CREATE TABLE IF NOT EXISTS bdt_propiedad (
    ide_bdpro           SERIAL PRIMARY KEY,
    clave_bdpro         VARCHAR(50) NOT NULL UNIQUE,  -- PUREZA, HUMEDAD, PH, DENSIDAD, PUNTO_FUSION, CAS…
    nombre_es_bdpro     VARCHAR(120) NOT NULL,
    nombre_en_bdpro     VARCHAR(120),
    categoria_bdpro     VARCHAR(30),                  -- FISICOQUIMICA | MICROBIOLOGICA | METALES | SEGURIDAD | IDENTIFICACION | COMERCIAL | APLICACION
    unidad_defecto_bdpro VARCHAR(30),
    sinonimos_bdpro     TEXT[] DEFAULT '{}',          -- en mayúsculas sin tildes: {ASSAY,PURITY,CONTENT,TITULO}
    activo_bdpro        BOOLEAN DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_bdt_prop_sinonimos ON bdt_propiedad USING GIN (sinonimos_bdpro);


-- 6. Valores técnicos extraídos. Filas (no columnas): cada documento aporta N propiedades.
--    naturaleza separa lo que el fabricante GARANTIZA (FT) de lo que MIDIÓ en un lote (COA).
CREATE TABLE IF NOT EXISTS bdt_valor (
    ide_bdval           SERIAL PRIMARY KEY,
    ide_bddoc           INTEGER NOT NULL REFERENCES bdt_documento(ide_bddoc) ON DELETE CASCADE,
    ide_inarti          INTEGER NOT NULL REFERENCES inv_articulo(ide_inarti),  -- desnormalizado para consulta directa
    ide_bdpfa           INTEGER REFERENCES bdt_producto_fabricante(ide_bdpfa),
    ide_bdlot           INTEGER REFERENCES bdt_lote(ide_bdlot) ON DELETE SET NULL,
    ide_bdpro           INTEGER REFERENCES bdt_propiedad(ide_bdpro),  -- NULL = aún sin normalizar
    naturaleza_bdval    VARCHAR(15) NOT NULL,     -- ESPECIFICACION | RESULTADO | TIPICO
    nombre_original_bdval VARCHAR(200) NOT NULL,  -- tal cual en el documento: "Assay (as C6H8O7)"
    valor_texto_bdval   VARCHAR(250),             -- tal cual: "≥ 99.5 %", "Complies", "White crystalline powder"
    operador_bdval      VARCHAR(8),               -- = | >= | <= | > | < | RANGO | TEXTO
    valor_num_bdval     NUMERIC(18,6),
    valor_min_bdval     NUMERIC(18,6),
    valor_max_bdval     NUMERIC(18,6),
    unidad_bdval        VARCHAR(30),
    metodo_bdval        VARCHAR(120),             -- USP, FCC, ASTM D-1298…
    especificacion_bdval VARCHAR(250),            -- en COA: la especificación que acompaña al resultado
    pagina_bdval        SMALLINT,
    publico_bdval       BOOLEAN DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_bdt_valor_art  ON bdt_valor (ide_inarti, ide_bdpro, naturaleza_bdval);
CREATE INDEX IF NOT EXISTS idx_bdt_valor_doc  ON bdt_valor (ide_bddoc);
CREATE INDEX IF NOT EXISTS idx_bdt_valor_trgm ON bdt_valor USING GIN (UPPER(bdt_f_unaccent(nombre_original_bdval)) gin_trgm_ops);


-- 7. Secciones / fragmentos de texto para búsqueda (FTS ahora, embeddings después).
--    En SDS: una fila por cada una de las 16 secciones GHS.
CREATE TABLE IF NOT EXISTS bdt_seccion (
    ide_bdsec           SERIAL PRIMARY KEY,
    ide_bddoc           INTEGER NOT NULL REFERENCES bdt_documento(ide_bddoc) ON DELETE CASCADE,
    ide_inarti          INTEGER NOT NULL REFERENCES inv_articulo(ide_inarti),
    numero_bdsec        SMALLINT,               -- 1..16 en SDS; orden en FT/COA
    clave_bdsec         VARCHAR(40),            -- IDENTIFICACION | PELIGROS | PRIMEROS_AUXILIOS | MANIPULACION | EPP | TRANSPORTE
                                                -- | APLICACIONES | FUNCIONES (acidulante, regulador de pH…) | DOSIFICACION
                                                -- | EMPAQUE (presentación) | ALMACENAMIENTO | ORIGEN …
    titulo_bdsec        VARCHAR(250),           -- título tal cual en el documento ("4- MEDIDAS DE PRIMEROS AUXILIOS")
    pagina_desde_bdsec  SMALLINT,               -- para citar: "Hoja de seguridad, sección 4, pág. 2"
    pagina_hasta_bdsec  SMALLINT,
    contenido_bdsec     TEXT NOT NULL,          -- en español (traducido si hacía falta)
    contenido_original_bdsec TEXT,              -- en el idioma original (NULL si ya era español)
    tsv_bdsec           TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('spanish', bdt_f_unaccent(COALESCE(titulo_bdsec, ''))), 'A') ||
        to_tsvector('spanish', bdt_f_unaccent(contenido_bdsec)) ||
        to_tsvector('english', COALESCE(contenido_original_bdsec, ''))
    ) STORED,
    publico_bdsec       BOOLEAN DEFAULT TRUE
    -- Fase 5 (pgvector): embedding_bdsec VECTOR(1536)
);
CREATE INDEX IF NOT EXISTS idx_bdt_sec_tsv ON bdt_seccion USING GIN (tsv_bdsec);
CREATE INDEX IF NOT EXISTS idx_bdt_sec_art ON bdt_seccion (ide_inarti, clave_bdsec);


-- 8. Sinónimos del producto (para encontrarlo aunque pregunten en inglés o por otro nombre).
--    Los detectados en documentos entran con aprobado = FALSE hasta que alguien los confirme.
CREATE TABLE IF NOT EXISTS bdt_sinonimo (
    ide_bdsin           SERIAL PRIMARY KEY,
    ide_inarti          INTEGER NOT NULL REFERENCES inv_articulo(ide_inarti),
    sinonimo_bdsin      VARCHAR(250) NOT NULL,
    sinonimo_norm_bdsin VARCHAR(250) GENERATED ALWAYS AS (UPPER(bdt_f_unaccent(TRIM(sinonimo_bdsin)))) STORED,
    tipo_bdsin          VARCHAR(20),            -- NOMBRE_EN | COMERCIAL | IUPAC | E_NUMBER | INCI | CAS
    origen_bdsin        VARCHAR(20) DEFAULT 'DOCUMENTO', -- DOCUMENTO | MANUAL
    ide_bddoc           INTEGER REFERENCES bdt_documento(ide_bddoc) ON DELETE SET NULL,
    aprobado_bdsin      BOOLEAN DEFAULT FALSE,
    ide_empr            INTEGER NOT NULL,
    usuario_ingre       VARCHAR(50),
    fecha_ingre         TIMESTAMP DEFAULT NOW(),
    UNIQUE (ide_inarti, sinonimo_norm_bdsin)
);
CREATE INDEX IF NOT EXISTS idx_bdt_sin_trgm ON bdt_sinonimo USING GIN (sinonimo_norm_bdsin gin_trgm_ops);


-- 9. Log de consultas a QuimIA técnica: costo, fuentes usadas y feedback del asesor
--    (permite medir precisión y detectar preguntas sin respuesta en la documentación).
CREATE TABLE IF NOT EXISTS bdt_consulta (
    ide_bdcon           SERIAL PRIMARY KEY,
    ide_inarti          INTEGER REFERENCES inv_articulo(ide_inarti),
    canal_bdcon         VARCHAR(15) NOT NULL,   -- ASESOR | WHATSAPP | PORTAL
    sesion_bdcon        UUID,                   -- agrupa los mensajes de una conversación del chat flotante
    modo_bdcon          VARCHAR(15) NOT NULL DEFAULT 'DOCUMENTOS',
                        -- DOCUMENTOS   respuesta basada solo en la base técnica (con citas)
                        -- IA_GENERAL   el usuario pidió respuesta de GPT tras "no encontrado" (se marca como generada por IA)
                        -- SELECCION    el bot pidió elegir entre varios productos
    citas_bdcon         JSONB,                  -- [{ide_bddoc, archivo, tipo, seccion, pagina}]
    pregunta_bdcon      TEXT NOT NULL,
    intencion_bdcon     VARCHAR(20),            -- ESPECIFICACION | ULTIMO_LOTE | SEGURIDAD | GENERAL
    respuesta_bdcon     TEXT,
    documentos_bdcon    INTEGER[],              -- ide_bddoc usados como fuente
    sin_dato_bdcon      BOOLEAN DEFAULT FALSE,  -- la documentación no tenía la respuesta
    util_bdcon          BOOLEAN,                -- feedback 👍/👎
    modelo_ia_bdcon     VARCHAR(50),
    tokens_entrada_bdcon INTEGER,
    tokens_salida_bdcon  INTEGER,
    ide_empr            INTEGER NOT NULL,
    usuario_ingre       VARCHAR(50),
    fecha_ingre         TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bdt_con_fecha  ON bdt_consulta (fecha_ingre DESC);
CREATE INDEX IF NOT EXISTS idx_bdt_con_sesion ON bdt_consulta (sesion_bdcon);


-- 10. Semilla mínima del diccionario de propiedades (ampliar con lo que aparezca en la fase 0)
INSERT INTO bdt_propiedad (clave_bdpro, nombre_es_bdpro, nombre_en_bdpro, categoria_bdpro, unidad_defecto_bdpro, sinonimos_bdpro) VALUES
  ('PUREZA',         'Pureza / Concentración', 'Assay',            'FISICOQUIMICA', '%',     '{ASSAY,PURITY,CONTENT,CONCENTRACION,CONTENIDO,TITULO,RIQUEZA}'),
  ('HUMEDAD',        'Humedad',                'Moisture',         'FISICOQUIMICA', '%',     '{MOISTURE,WATER,WATER CONTENT,LOSS ON DRYING,PERDIDA POR SECADO,AGUA}'),
  ('PH',             'pH',                     'pH',               'FISICOQUIMICA', NULL,    '{PH VALUE,PH (1%),PH (5%),PH (10%)}'),
  ('DENSIDAD',       'Densidad',               'Density',          'FISICOQUIMICA', 'g/mL',  '{DENSITY,SPECIFIC GRAVITY,GRAVEDAD ESPECIFICA,PESO ESPECIFICO}'),
  ('APARIENCIA',     'Apariencia',             'Appearance',       'FISICOQUIMICA', NULL,    '{APPEARANCE,ASPECTO,DESCRIPTION,DESCRIPCION}'),
  ('COLOR',          'Color',                  'Color',            'FISICOQUIMICA', NULL,    '{COLOUR,APHA,HAZEN}'),
  ('PUNTO_FUSION',   'Punto de fusión',        'Melting point',    'FISICOQUIMICA', '°C',    '{MELTING POINT,MELTING RANGE}'),
  ('PUNTO_EBULLICION','Punto de ebullición',   'Boiling point',    'FISICOQUIMICA', '°C',    '{BOILING POINT}'),
  ('PUNTO_INFLAMACION','Punto de inflamación', 'Flash point',      'SEGURIDAD',     '°C',    '{FLASH POINT}'),
  ('VISCOSIDAD',     'Viscosidad',             'Viscosity',        'FISICOQUIMICA', 'cP',    '{VISCOSITY}'),
  ('SOLUBILIDAD',    'Solubilidad',            'Solubility',       'FISICOQUIMICA', NULL,    '{SOLUBILITY}'),
  ('CENIZAS',        'Cenizas',                'Ash',              'FISICOQUIMICA', '%',     '{ASH,SULPHATED ASH,SULFATED ASH,RESIDUE ON IGNITION,CENIZAS SULFATADAS}'),
  ('METALES_PESADOS','Metales pesados',        'Heavy metals',     'METALES',       'ppm',   '{HEAVY METALS,METALES PESADOS (PB)}'),
  ('PLOMO',          'Plomo',                  'Lead',             'METALES',       'ppm',   '{LEAD,PB}'),
  ('ARSENICO',       'Arsénico',               'Arsenic',          'METALES',       'ppm',   '{ARSENIC,AS}'),
  ('RECUENTO_AEROBIOS','Recuento de aerobios', 'Total plate count','MICROBIOLOGICA','UFC/g', '{TOTAL PLATE COUNT,TPC,AEROBIC PLATE COUNT,TOTAL AEROBIC MICROBIAL COUNT}'),
  ('MOHOS_LEVADURAS','Mohos y levaduras',      'Yeast and mold',   'MICROBIOLOGICA','UFC/g', '{YEAST AND MOLD,YEASTS AND MOULDS,MOLDS AND YEASTS}'),
  ('CAS',            'Número CAS',             'CAS number',       'IDENTIFICACION', NULL,   '{CAS NO,CAS NUMBER,CAS #,CAS-NR}'),
  ('FORMULA',        'Fórmula molecular',      'Molecular formula','IDENTIFICACION', NULL,   '{MOLECULAR FORMULA,FORMULA}'),
  ('PESO_MOLECULAR', 'Peso molecular',         'Molecular weight', 'IDENTIFICACION', 'g/mol','{MOLECULAR WEIGHT,MW,MASA MOLAR}'),
  ('NUMERO_UN',      'Número ONU',             'UN number',        'SEGURIDAD',     NULL,    '{UN NUMBER,UN NO,UN}'),
  ('VIDA_UTIL',      'Vida útil',              'Shelf life',       'IDENTIFICACION','meses', '{SHELF LIFE,BEST BEFORE,CADUCIDAD}'),
  ('PRESENTACION',   'Presentación / Empaque', 'Packaging',        'COMERCIAL',     NULL,    '{PACKAGING,PACKING,PACKAGE,EMPAQUE,ENVASE,NET WEIGHT,PESO NETO}'),
  ('PAIS_ORIGEN',    'País de origen',         'Country of origin','COMERCIAL',     NULL,    '{COUNTRY OF ORIGIN,ORIGIN,MADE IN,PROCEDENCIA,ORIGEN}'),
  ('FUNCION',        'Función / Uso',          'Function',         'APLICACION',    NULL,    '{FUNCTION,FUNCTIONAL CLASS,APPLICATIONS,USES,USOS,APLICACIONES}')
ON CONFLICT (clave_bdpro) DO NOTHING;


-- 11. Corridas de procesamiento. Fase 1: una fila por clic en "Procesar documentos" del
--     tab Archivos del producto (el frontend consulta el avance aquí). Fase 2: el cron diario
--     reutiliza la misma tabla con origen CRON.
CREATE TABLE IF NOT EXISTS bdt_proceso (
    ide_bdrun               SERIAL PRIMARY KEY,
    origen_bdrun            VARCHAR(20) NOT NULL DEFAULT 'MANUAL_PRODUCTO', -- MANUAL_PRODUCTO | MANUAL_ARCHIVO | CRON
    ide_inarti              INTEGER REFERENCES inv_articulo(ide_inarti),  -- NULL en corridas CRON
    forzar_bdrun            BOOLEAN DEFAULT FALSE,  -- re-procesar aunque el hash ya esté procesado
    fecha_inicio_bdrun      TIMESTAMP NOT NULL DEFAULT NOW(),
    fecha_fin_bdrun         TIMESTAMP,
    total_bdrun             INTEGER DEFAULT 0,      -- archivos encontrados (recorriendo subcarpetas)
    procesados_bdrun        INTEGER DEFAULT 0,
    sin_cambios_bdrun       INTEGER DEFAULT 0,      -- mismo hash y misma versión de extractor
    omitidos_bdrun          INTEGER DEFAULT 0,      -- extensión no soportada / no técnico
    revision_bdrun          INTEGER DEFAULT 0,
    errores_bdrun           INTEGER DEFAULT 0,
    tokens_bdrun            INTEGER DEFAULT 0,
    estado_bdrun            VARCHAR(15) DEFAULT 'EJECUTANDO', -- EJECUTANDO | OK | CON_ERRORES | FALLIDO
    detalle_bdrun           JSONB,                  -- [{archivo, estado, tipo, error, ms}]
    ide_empr                INTEGER NOT NULL,
    usuario_ingre           VARCHAR(50),
    fecha_ingre             TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bdt_run_art ON bdt_proceso (ide_inarti, fecha_inicio_bdrun DESC);


-- 12. Estado de la base técnica POR PRODUCTO (una fila por ide_inarti).
--     Responde "¿cuándo se actualizó la info técnica de este producto y está al día?".
--     Se actualiza al final de cada bdt_proceso y en cada revisión/aprobación manual.
--     fecha_ultimo_proceso = se corrió el botón; fecha_ultimo_cambio = la data realmente cambió
--     (un re-proceso sin archivos nuevos actualiza la primera pero no la segunda).
CREATE TABLE IF NOT EXISTS bdt_producto (
    ide_inarti              INTEGER PRIMARY KEY REFERENCES inv_articulo(ide_inarti),
    -- Copia del nombre al momento de procesar: el chat identifica productos SOLO con las tablas
    -- bdt_ (bdt_producto + bdt_sinonimo), sin consultar inv_articulo ni otra tabla del ERP.
    nombre_bdprd            VARCHAR(250) NOT NULL,
    nombre_norm_bdprd       VARCHAR(250) GENERATED ALWAYS AS (UPPER(bdt_f_unaccent(TRIM(nombre_bdprd)))) STORED,
    codigo_bdprd            VARCHAR(50),
    estado_bdprd            VARCHAR(20) NOT NULL DEFAULT 'SIN_PROCESAR',
                            -- SIN_PROCESAR | ACTUALIZADO | CON_REVISION | DESACTUALIZADO | CON_ERRORES
    fecha_ultimo_proceso_bdprd TIMESTAMP,
    usuario_ultimo_proceso_bdprd VARCHAR(50),
    ide_bdrun               INTEGER REFERENCES bdt_proceso(ide_bdrun) ON DELETE SET NULL, -- última corrida
    fecha_ultimo_cambio_bdprd  TIMESTAMP,
    -- Huella de los adjuntos al momento del último proceso: hash de los (uuid, hash) de todos los
    -- archivos del producto (incluye subcarpetas). Si al abrir el tab la huella actual difiere,
    -- el front muestra "Hay archivos nuevos o modificados sin procesar" → estado DESACTUALIZADO.
    huella_archivos_bdprd   CHAR(64),
    total_documentos_bdprd  SMALLINT DEFAULT 0,
    total_ft_bdprd          SMALLINT DEFAULT 0,
    total_coa_bdprd         SMALLINT DEFAULT 0,
    total_sds_bdprd         SMALLINT DEFAULT 0,
    total_revision_bdprd    SMALLINT DEFAULT 0,
    total_valores_bdprd     INTEGER DEFAULT 0,
    fecha_ultimo_coa_bdprd  DATE,              -- fecha de análisis del COA más reciente
    fecha_ultima_sds_bdprd  DATE,              -- revisión de la SDS vigente (alerta si es muy antigua)
    ide_empr                INTEGER NOT NULL,
    fecha_ingre             TIMESTAMP DEFAULT NOW(),
    fecha_actua             TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bdt_prd_estado ON bdt_producto (ide_empr, estado_bdprd);
CREATE INDEX IF NOT EXISTS idx_bdt_prd_trgm   ON bdt_producto USING GIN (nombre_norm_bdprd gin_trgm_ops);


-- 13. Bitácora de cambios por producto. Una fila por evento; permite ver la línea de tiempo
--     de la información técnica de un producto y auditar correcciones manuales.
CREATE TABLE IF NOT EXISTS bdt_historial (
    ide_bdhis               BIGSERIAL PRIMARY KEY,
    ide_inarti              INTEGER NOT NULL REFERENCES inv_articulo(ide_inarti),
    ide_bdrun               INTEGER REFERENCES bdt_proceso(ide_bdrun) ON DELETE SET NULL,  -- NULL si fue manual
    ide_bddoc               INTEGER REFERENCES bdt_documento(ide_bddoc) ON DELETE SET NULL,
    accion_bdhis            VARCHAR(25) NOT NULL,
        -- DOCUMENTO_NUEVO        archivo nuevo procesado
        -- DOCUMENTO_ACTUALIZADO  mismo archivo re-procesado (forzar / nueva versión de extractor)
        -- DOCUMENTO_RETIRADO     el adjunto ya no está en el producto (se marca vigente = FALSE)
        -- DOCUMENTO_ELIMINADO    un usuario borró la extracción (el adjunto sigue existiendo)
        -- DOCUMENTO_REEMPLAZADO  una FT/SDS más reciente del mismo fabricante lo dejó no vigente
        -- VALOR_CAMBIADO         una propiedad cambió de valor respecto a la extracción anterior
        -- CORRECCION_MANUAL      un usuario editó tipo/valores en la revisión
        -- APROBADO | RECHAZADO   resultado de la revisión
        -- FABRICANTE_VIGENTE     se cambió el fabricante/proveedor vigente del producto
    descripcion_bdhis       VARCHAR(500),      -- texto legible: "PUREZA: ≥99.0% → ≥99.5% (FT Jungbunzlauer 2026-03)"
    antes_bdhis             JSONB,
    despues_bdhis           JSONB,
    usuario_ingre           VARCHAR(50),
    fecha_ingre             TIMESTAMP NOT NULL DEFAULT NOW(),
    ide_empr                INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bdt_his_art ON bdt_historial (ide_inarti, fecha_ingre DESC);
