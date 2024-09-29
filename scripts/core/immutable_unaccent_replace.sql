/************************************************************************/
/*   Módulo:                 Core                                       */
/*   Disenado por:           D. Jacome                                  */
/*   Fecha de escritura:     26-Sep-2024                                */
/************************************************************************/
/*                           PROPOSITO                                  */
/*   Esta funcion remplaza caracteres como . , en nombres para mejorar  */
/*   la busqueda                                                        */
/************************************************************************/
/*                              MODIFICACIONES                          */
/*  FECHA           AUTOR           RAZON                               */
/*  25/Sep/2024     D. Jacome    Emision inicial                        */
/************************************************************************/

CREATE OR REPLACE FUNCTION immutable_unaccent_replace(text)
RETURNS text AS $$
BEGIN
    RETURN unaccent(REPLACE(REPLACE($1, '.', ''), ' ', ''));
END;
$$ LANGUAGE plpgsql IMMUTABLE;
