-- FK: wha_mensaje.ide_whcha → wha_chat.ide_whcha
-- Los mensajes outbound tienen ide_whcha NULL (no FK applies para ellos)
-- Los mensajes inbound tienen ide_whcha seteado por insertMensajeInbound

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_whmem_ide_whcha'
          AND table_name = 'wha_mensaje'
    ) THEN
        ALTER TABLE wha_mensaje
            ADD CONSTRAINT fk_whmem_ide_whcha
            FOREIGN KEY (ide_whcha)
            REFERENCES wha_chat(ide_whcha)
            ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wha_mensaje_ide_whcha
    ON wha_mensaje (ide_whcha)
    WHERE ide_whcha IS NOT NULL;
