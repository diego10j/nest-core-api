/************************************************************************/
/*   Módulo:                 Core                                       */
/*   Disenado por:           D. Jacome                                  */
/*   Fecha de escritura:     06-Jun-2024                                */
/************************************************************************/
/*                           PROPOSITO                                  */
/*   Esta funcion transforma un texto a formato tipo titulo             */
/************************************************************************/
/*                              MODIFICACIONES                          */
/*  FECHA           AUTOR           RAZON                               */
/*  06/Jun/2024     D. Jacome    Emision inicial                        */
/************************************************************************/

CREATE OR REPLACE FUNCTION toTitleCase(input_text TEXT)
RETURNS TEXT AS $$
DECLARE
    word TEXT;
    title_case_text TEXT := '';
BEGIN
    -- Split the input text into words
    FOR word IN
        SELECT regexp_split_to_table(input_text, E'\\s+') -- Split by whitespace
    LOOP
        -- Convert the first character to upper case and the rest to lower case
        word := CASE 
                    WHEN word = upper(word) THEN word  -- Mantener las palabras en mayúsculas como están
                    ELSE upper(substring(word FROM 1 FOR 1)) || lower(substring(word FROM 2)) -- Convertir las demás palabras
                END;
        
        -- Append the word to the result string with a space separator
        title_case_text := title_case_text || word || ' ';
    END LOOP;
    
    -- Trim the trailing space and return the result
    RETURN trim(title_case_text);
END;
$$ LANGUAGE plpgsql;



--SELECT toTitleCase('a tale of two cities');      -- Resultado: "A Tale Of Two Cities"
--SELECT toTitleCase('gROWL to the rescue');       -- Resultado: "Growl To The Rescue"
--SELECT toTitleCase('inside the US government');  -- Resultado: "Inside The US Government"
--SELECT toTitleCase('sports and MLB baseball');   -- Resultado: "Sports And MLB Baseball"
--SELECT toTitleCase('The Return of Sherlock Holmes'); -- Resultado: "The Return Of Sherlock Holmes"
--SELECT toTitleCase('UNICEF and children');       -- Resultado: "UNICEF And Children"