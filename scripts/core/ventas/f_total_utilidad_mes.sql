CREATE OR REPLACE FUNCTION f_total_utilidad_mes(
    id_empresa BIGINT,
    p_mes BIGINT,
    p_anio BIGINT
) RETURNS NUMERIC AS $$
DECLARE
    fecha_inicio DATE;
    fecha_fin DATE;
    sumatoria NUMERIC;
BEGIN
    -- Calculate the first and last day of the month with proper type casting
    fecha_inicio := MAKE_DATE(p_anio::INTEGER, p_mes::INTEGER, 1);
    fecha_fin := (MAKE_DATE(p_anio::INTEGER, p_mes::INTEGER, 1) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    
    SELECT SUM(utilidad_neta) 
    INTO sumatoria
    FROM f_utilidad_ventas(id_empresa, fecha_inicio, fecha_fin)
    WHERE nota_credito = 0
    AND hace_kardex_inarti = true;
    
    RETURN COALESCE(sumatoria, 0); -- Return 0 if sumatoria is NULL
END;
$$ LANGUAGE plpgsql;

--SELECT  f_total_utilidad_mes(0,2,2025);