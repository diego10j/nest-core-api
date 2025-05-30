CREATE OR REPLACE FUNCTION Utilidad_Mes(
    p_mes BIGINT,
    p_anio BIGINT
) RETURNS NUMERIC AS $$
DECLARE
    fecha_inicio DATE;
    fecha_fin DATE;
    sumatoria NUMERIC;
BEGIN
    -- Calculate the first and last day of the month
    fecha_inicio := MAKE_DATE(p_anio, p_mes, 1);
    fecha_fin := (MAKE_DATE(p_anio, p_mes, 1) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    
    SELECT SUM(utilidad_neta) 
    INTO sumatoria
    FROM Utilidad_en_Ventas(fecha_inicio, fecha_fin)
    WHERE nota_credito = FALSE
    AND hace_kardex_inarti = true;
    
    RETURN COALESCE(sumatoria, 0); -- Return 0 if sumatoria is NULL
END;
$$ LANGUAGE plpgsql;