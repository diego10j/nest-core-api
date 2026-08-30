-- Fix: nrh_hora_extra_candidata quedó sin 4 columnas que horas-extra.service.ts ya usa
-- (detectarCandidatas/getCandidatas/aprobar). Rompe con:
--   "error: column c.sugerencia_nrhec does not exist"
-- al abrir Nómina > Horas Extra (GET getCandidatas siempre falla, 500).
--
-- Encontrado 2026-08-30 probando el módulo end-to-end en el navegador. La tabla se creó
-- (ver DDL original en el plan de Nómina) sin anticipar estas 4 columnas, que se agregaron
-- después solo en el código:
--   sugerencia_nrhec: tipo sugerido automáticamente al detectar (sugerirTipo(): 'extraordinaria'
--     si es domingo/feriado, si no 'suplementaria') — se muestra antes de aprobar.
--   tipo_nrhec / justificacion_nrhec: los fija quien aprueba (aprobar()), decide el tipo final
--     y por qué se trabajó.
--   ide_nrrol: qué rol de pagos terminó incluyendo esta hora extra (se llena al cerrar un rol,
--     no en este script).

ALTER TABLE nrh_hora_extra_candidata
    ADD COLUMN IF NOT EXISTS sugerencia_nrhec character varying(20),
    ADD COLUMN IF NOT EXISTS tipo_nrhec character varying(20),
    ADD COLUMN IF NOT EXISTS justificacion_nrhec character varying(1000),
    ADD COLUMN IF NOT EXISTS ide_nrrol integer;

-- FK opcional (nrh_rol ya existe) — solo si no existe todavía
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'nrh_hora_extra_candidata_ide_nrrol_fkey'
    ) THEN
        ALTER TABLE nrh_hora_extra_candidata
            ADD CONSTRAINT nrh_hora_extra_candidata_ide_nrrol_fkey
            FOREIGN KEY (ide_nrrol) REFERENCES nrh_rol(ide_nrrol);
    END IF;
END $$;

-- Verificación esperada tras aplicar:
-- \d nrh_hora_extra_candidata  -- debe mostrar las 4 columnas nuevas
