
      
   
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
        -- [FIX 1] Cuando no hay kardex se retorna NULL, no 0, para que el
        --   llamador distinga "sin costo" de "costo cero real".
        --   COALESCE sobre NULL queda para uso opcional del caller.
        ROUND(k.costo_promedio, 6)                AS costo_unitario,
        k.fecha_mov                               AS fecha_costo,
        k.saldo_cantidad                          AS saldo_cantidad,
        CASE
            -- [FIX 2] Evaluar costo_promedio antes que saldo_cantidad;
            --   si no hay fila (NULL propagado desde RIGHT JOIN) → SIN_COSTO.
            WHEN k.costo_promedio IS NULL          THEN 'SIN_COSTO'
            -- [FIX 3] costo_promedio = 0 es un dato inválido independientemente
            --   del saldo; puede ocurrir si el primer movimiento fue un egreso
            --   (cpp arranca en 0). Marcarlo explícitamente.
            WHEN k.costo_promedio = 0              THEN 'SIN_PRECIO_COMPRA'
            -- [FIX 4] Saldo negativo (factura antes de compra) no es error;
            --   el costo sigue siendo válido. Solo marcar SALDO_CERO cuando
            --   la cantidad es exactamente 0 (artículo sin existencia).
            WHEN k.saldo_cantidad = 0              THEN 'PPMP_SALDO_CERO'
            WHEN k.saldo_cantidad < 0              THEN 'PPMP_SALDO_NEGATIVO'
            ELSE                                        'PPMP_NORMAL'
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
          -- Considerar solo movimientos con costo válido (ingresos o egresos
          -- que ya tienen CPP calculado). Si el kardex tiene filas con cpp=0
          -- (egresos antes del primer ingreso) se prefiere el último con cpp > 0.
          AND k.costo_promedio > 0
        ORDER BY k.fecha_mov DESC, k.orden_mov DESC
        LIMIT 1
    ) k
    -- RIGHT JOIN garantiza una fila de retorno aunque no haya kardex
    RIGHT JOIN (SELECT 1) dummy ON true;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL SAFE;

-- select * from f_costo_unitario_ppmp(0, 2, 1704, '2026-01-18');