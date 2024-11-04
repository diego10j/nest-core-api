
DO
$$
DECLARE
    table_rec RECORD;
BEGIN
    FOR table_rec IN
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE schemaname = 'public' -- Cambia 'public' si tienes otro esquema
    LOOP
        EXECUTE format('GRANT ALL PRIVILEGES ON TABLE %I.%I TO doadmin;', table_rec.schemaname, table_rec.tablename);
    END LOOP;
END
$$;

DO
$$
DECLARE
    seq_rec RECORD;
BEGIN
    FOR seq_rec IN
        SELECT schemaname, sequencename
        FROM pg_sequences
        WHERE schemaname = 'public' -- Cambia 'public' si es necesario
    LOOP
        EXECUTE format('GRANT ALL PRIVILEGES ON SEQUENCE %I.%I TO doadmin;', seq_rec.schemaname, seq_rec.sequencename);
    END LOOP;
END
$$;


DO
$$
DECLARE
    func_rec RECORD;
BEGIN
    FOR func_rec IN
        SELECT n.nspname as schemaname, p.proname as funcname
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' -- Cambia 'public' si tienes otro esquema
    LOOP
        EXECUTE format('GRANT ALL PRIVILEGES ON FUNCTION %I.%I TO doadmin;', func_rec.schemaname, func_rec.funcname);
    END LOOP;
END
$$;
