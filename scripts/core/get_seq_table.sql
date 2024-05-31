/************************************************************************/
/*   Módulo:                 Core                                       */
/*   Disenado por:           D. Jacome                                  */
/*   Fecha de escritura:     31-May-2024                                */
/************************************************************************/
/*                           PROPOSITO                                  */
/*   Esta funcion retorna el maximo secuencial de una tabla para control*/
/*   de concurrencia                                                    */
/************************************************************************/
/*                              MODIFICACIONES                          */
/*  FECHA           AUTOR           RAZON                               */
/*  31/May/2024     D. Jacome    Emision inicial                        */
/************************************************************************/

CREATE OR REPLACE FUNCTION get_seq_table(
    table_name TEXT,
    primary_key TEXT,
    number_rows_added INTEGER DEFAULT 1,
    login TEXT DEFAULT 'sa'    
)
RETURNS INTEGER AS $$
DECLARE
    seq INTEGER;
    max_bloq INTEGER;
    new_max INTEGER;
    ide_bloq INTEGER;
BEGIN
    -- Busca el máximo en la tabla sis_bloqueo
    SELECT maximo_bloq INTO max_bloq FROM sis_bloqueo WHERE tabla_bloq = LOWER(table_name);

    IF max_bloq IS NOT NULL THEN
        -- Si existe, actualiza el secuencial en la tabla sis_bloqueo
        seq := max_bloq;
        new_max := seq + number_rows_added;
        UPDATE sis_bloqueo SET maximo_bloq = new_max WHERE tabla_bloq = LOWER(table_name);
    ELSE
        -- Si no existe, busca el máximo en la tabla específica
        EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %I', primary_key, table_name) INTO seq;

        -- Inserta el nuevo secuencial en la tabla sis_bloqueo
        EXECUTE 'SELECT COALESCE(MAX(ide_bloq), 0) + 1 FROM sis_bloqueo' INTO ide_bloq;
        INSERT INTO sis_bloqueo (maximo_bloq, tabla_bloq, ide_bloq, usuario_bloq)
        VALUES (seq + number_rows_added, LOWER(table_name), ide_bloq, login);  
    END IF;

    RETURN seq + 1;
END;
$$ LANGUAGE plpgsql;


-- SELECT get_seq_table('sis_opcion', 'ide_opci', 1, 'diego') AS seq