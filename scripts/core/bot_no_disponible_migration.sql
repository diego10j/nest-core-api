-- =====================================================================
-- MIGRACIÓN: Registro de productos NO comercializados (bot WhatsApp)
-- =====================================================================
-- Cuando un cliente pregunta por un producto que no existe en el catálogo
-- interno (inv_articulo), el bot antes siempre derivaba a un asesor a
-- confirmar disponibilidad — aunque ya se le hubiera dicho "no disponemos"
-- a otro cliente por el mismo producto minutos antes. Esta tabla guarda esas
-- respuestas ya confirmadas por un asesor (o cargadas manualmente desde el
-- mantenimiento del front) para que el bot responda directo la próxima vez,
-- sin esperar a un humano — el objetivo del bot es responder rápido a
-- clientes nuevos para cotizar y captarlos, no hacerlos esperar por algo que
-- ya se sabe que no se vende.

CREATE TABLE IF NOT EXISTS wha_bot_no_disponible (
  ide_whbnd          BIGSERIAL     PRIMARY KEY,
  ide_empr           INT4          NOT NULL,
  nombre_whbnd       VARCHAR(200)  NOT NULL,
  otros_nombres_whbnd VARCHAR(300),
  observacion_whbnd  VARCHAR(500),
  activo_whbnd       BOOL          NOT NULL DEFAULT TRUE,
  ide_usua           INT4,
  usuario_ingre      VARCHAR(50),
  hora_ingre         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  usuario_actua      VARCHAR(50),
  hora_actua         TIMESTAMPTZ
);

COMMENT ON TABLE  wha_bot_no_disponible IS 'Productos que la empresa confirmó que NO comercializa — el bot responde directo sin derivar a un asesor cuando el cliente pregunta por algo ya registrado acá.';
COMMENT ON COLUMN wha_bot_no_disponible.nombre_whbnd        IS 'Nombre principal del producto que NO se vende (coincidencia parcial, sin acentos/mayúsculas)';
COMMENT ON COLUMN wha_bot_no_disponible.otros_nombres_whbnd IS 'Nombres alternativos/sinónimos separados por coma (ej. "SOSA CAUSTICA" para HIDROXIDO DE SODIO) — el mismo producto puede pedirse con un nombre distinto al técnico';
COMMENT ON COLUMN wha_bot_no_disponible.observacion_whbnd   IS 'Nota opcional que el bot puede incluir en su respuesta al cliente (ej. motivo o alternativa que sí se vende)';
COMMENT ON COLUMN wha_bot_no_disponible.ide_usua            IS 'Usuario que registró que no se comercializa este producto';

CREATE INDEX IF NOT EXISTS idx_wha_bot_no_disp_empr ON wha_bot_no_disponible(ide_empr) WHERE activo_whbnd = TRUE;

-- Primer registro de ejemplo — ajusta ide_empr al de tu empresa si es distinto de 0.
-- SELECT ... WHERE NOT EXISTS en vez de VALUES simple para que sea seguro re-correr
-- este script sin duplicar la fila (no hay unique constraint sobre nombre_whbnd).
INSERT INTO wha_bot_no_disponible (ide_empr, nombre_whbnd, otros_nombres_whbnd, observacion_whbnd, usuario_ingre)
SELECT 0, 'HIDROXIDO DE SODIO', 'SOSA CAUSTICA', 'Producto restringido, no se comercializa', 'migracion'
WHERE NOT EXISTS (
  SELECT 1 FROM wha_bot_no_disponible WHERE ide_empr = 0 AND UPPER(nombre_whbnd) = 'HIDROXIDO DE SODIO'
);
