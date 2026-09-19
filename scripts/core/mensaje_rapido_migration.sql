-- =====================================================================
-- MIGRACIÓN: Mensajes rápidos de WhatsApp (plantillas para reenviar)
-- =====================================================================
-- Mensajes prearmados que los agentes reenvían desde /dashboard/whatsapp:
-- texto con formato WhatsApp (*negrita*, _cursiva_, emojis), imágenes/videos/
-- documentos y/o una ubicación (ej. dirección de la sucursal).
--
-- Los adjuntos se guardan como JSONB (arreglo) porque un mismo mensaje puede llevar
-- varios archivos; cada elemento: {"url","nombre","tipo","mime"} con
-- tipo = image | video | document. La url apunta a /api/whatsapp/media/<archivo>
-- (permanente en nuestro servidor, no expira como los links de YCloud).

CREATE TABLE IF NOT EXISTS wha_mensaje_rapido (
  ide_whmer            BIGSERIAL     PRIMARY KEY,
  ide_empr             INT4          NOT NULL,
  titulo_whmer         VARCHAR(100)  NOT NULL,
  mensaje_whmer        TEXT,
  adjuntos_whmer       JSONB         NOT NULL DEFAULT '[]'::jsonb,
  latitud_whmer        NUMERIC(10,7),
  longitud_whmer       NUMERIC(10,7),
  ubicacion_nombre_whmer     VARCHAR(150),
  ubicacion_direccion_whmer  VARCHAR(300),
  activo_whmer         BOOL          NOT NULL DEFAULT TRUE,
  ide_usua             INT4,
  usuario_ingre        VARCHAR(50),
  hora_ingre           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  usuario_actua        VARCHAR(50),
  hora_actua           TIMESTAMPTZ,
  -- Debe tener contenido: texto, adjuntos o ubicación
  CONSTRAINT ck_wha_mensaje_rapido_contenido CHECK (
    COALESCE(BTRIM(mensaje_whmer), '') <> ''
    OR jsonb_array_length(adjuntos_whmer) > 0
    OR (latitud_whmer IS NOT NULL AND longitud_whmer IS NOT NULL)
  ),
  CONSTRAINT ck_wha_mensaje_rapido_ubicacion CHECK (
    (latitud_whmer IS NULL) = (longitud_whmer IS NULL)
  )
);

COMMENT ON TABLE  wha_mensaje_rapido IS 'Mensajes rápidos (plantillas internas) que los agentes reenvían desde el chat de WhatsApp: texto con formato/emojis, adjuntos y/o ubicación.';
COMMENT ON COLUMN wha_mensaje_rapido.titulo_whmer   IS 'Nombre corto para buscar el mensaje en el listado (no se envía al cliente)';
COMMENT ON COLUMN wha_mensaje_rapido.mensaje_whmer  IS 'Texto con formato WhatsApp (*negrita*, _cursiva_, ~tachado~, ```código```) y emojis; se envía como texto o como caption del primer adjunto';
COMMENT ON COLUMN wha_mensaje_rapido.adjuntos_whmer IS 'Arreglo JSON de adjuntos [{url,nombre,tipo,mime}], tipo = image|video|document';
COMMENT ON COLUMN wha_mensaje_rapido.latitud_whmer  IS 'Latitud de la ubicación a enviar (junto con longitud_whmer)';
COMMENT ON COLUMN wha_mensaje_rapido.activo_whmer   IS 'Solo los activos aparecen al elegir una respuesta rápida en el chat';

CREATE INDEX IF NOT EXISTS idx_wha_mensaje_rapido_empr
  ON wha_mensaje_rapido(ide_empr, activo_whmer);
