
      
   
   CREATE OR REPLACE FUNCTION f_costo_unitario_ppmp(
    p_id_empresa  BIGINT,
    p_id_sucursal BIGINT,
    p_ide_inarti  BIGINT,
    p_fecha_venta DATE
)
RETURNS TABLE (
    costo_unitario  NUMERIC,
    fecha_costo     DATE,
    saldo_cantidad  NUMERIC,
    metodo_aplicado VARCHAR(50)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ROUND(COALESCE(k.costo_promedio, 0), 6)  AS costo_unitario,
        k.fecha_mov                               AS fecha_costo,
        COALESCE(k.saldo_cantidad, 0)             AS saldo_cantidad,
        CASE
            WHEN k.costo_promedio IS NULL THEN 'SIN_COSTO'
            WHEN k.saldo_cantidad  <= 0   THEN 'PPMP_SALDO_CERO'
            ELSE                               'PPMP_NORMAL'
        END::VARCHAR(50)                          AS metodo_aplicado
    FROM (
        SELECT
            k.costo_promedio,
            k.saldo_cantidad,
            k.fecha_mov
        FROM inv_kardex_ppmp k
        WHERE k.ide_empr   = p_id_empresa
          AND k.ide_sucu   = p_id_sucursal
          AND k.ide_inarti = p_ide_inarti
          AND k.fecha_mov  <= p_fecha_venta
        ORDER BY k.fecha_mov DESC, k.orden_mov DESC
        LIMIT 1
    ) k
    -- Si no hay ningún movimiento previo a la fecha
    RIGHT JOIN (SELECT 1) dummy ON true;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL SAFE;

  --  select * from f_costo_unitario_ppmp(0,1704,'2026-01-18') ;