-- =====================================================================
-- MIGRACIÓN: Selector de editor por nota (Base de Conocimiento)
-- =====================================================================
-- El editor de notas se migró de un editor de texto enriquecido "clásico"
-- (HTML, Tiptap) a un editor de bloques nuevo tipo Notion (JSON, BlockNote).
-- En vez de forzar la migración de todas las notas, se deja elegir por nota
-- cuál editor usar — este campo indica cuál, para que tanto el formulario de
-- edición como la vista de solo lectura sepan qué componente/formato usar en
-- vez de tener que adivinarlo a partir del contenido guardado.
--
-- Las notas existentes quedan en 'HTML' (el editor de siempre) — no se
-- migran de un jalón, cada una se pasa a 'BLOCKS' recién si alguien la edita
-- eligiendo el editor nuevo desde el selector del formulario.

ALTER TABLE sis_conocimiento
  ADD COLUMN IF NOT EXISTS modo_editor_cono VARCHAR(10) NOT NULL DEFAULT 'HTML';

COMMENT ON COLUMN sis_conocimiento.modo_editor_cono IS
  'Editor usado para contenido_cono de esta nota: HTML (editor clásico Tiptap) o BLOCKS (editor de bloques BlockNote, JSON). Elegido desde el selector del formulario, ver ConocimientoFormDialog en el frontend.';

-- IMPORTANTE (recordatorio operativo, no lo ejecuta este script):
-- Tras correr este ALTER TABLE, limpiar el caché de columnas de la tabla para
-- que el ORM interno (InsertQuery/UpdateQuery) reconozca la columna nueva:
--   redis-cli DEL table_columns:sis_conocimiento
-- Si no se limpia, los guardados van a ignorar modo_editor_cono en silencio
-- (mismo síntoma ya visto antes con otras columnas agregadas a mano).
