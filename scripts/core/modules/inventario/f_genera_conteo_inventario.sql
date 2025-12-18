CREATE OR REPLACE FUNCTION public.f_genera_conteo_inventario(
    p_ide_inbod INT8,
    p_fecha_corte_desde DATE,
    p_fecha_corte DATE,
    p_ide_usua INT8,
    p_ide_empr INT8,
    p_ide_sucu INT8,
    p_observacion VARCHAR(500) DEFAULT NULL,
    p_excluir_ceros_sin_movimientos BOOLEAN DEFAULT true
)
RETURNS TABLE (
    id_conteo INT8,
    secuencial_conteo VARCHAR(12),
    mensaje_conteo VARCHAR(200),
    total_items INT,
    estado_conteo VARCHAR(20)
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_mes INT;
    v_anio INT;
    v_id_estado INT;
    v_id_tipo INT;
    v_secuencial VARCHAR(12);
    v_id_nuevo_conteo INT8;
    v_correlativo INT;
    v_total_items INT;
    v_existe_conteo INT;
    v_usuario_login VARCHAR(50);
    v_primer_id_detalle INT8;
    v_productos_stock_cero INT := 0;
    v_productos_stock_negativo INT := 0;
    v_valor_total_corte NUMERIC(15,3) := 0;
    v_mensaje VARCHAR(200);
    v_productos_excluidos INT := 0;
    v_productos_stock_cero_general INT := 0;
    v_productos_stock_negativo_general INT := 0;
    v_total_general INT := 0;
BEGIN
    -- Validaciones básicas
    IF p_fecha_corte > CURRENT_DATE THEN
        RAISE EXCEPTION 'Fecha de corte no puede ser futura';
    END IF;
    
    IF p_fecha_corte_desde > p_fecha_corte THEN
        RAISE EXCEPTION 'Fecha de corte desde no puede ser mayor a fecha de corte hasta';
    END IF;
    
    v_mes := EXTRACT(MONTH FROM p_fecha_corte);
    v_anio := EXTRACT(YEAR FROM p_fecha_corte);
    
    -- Obtener el nombre de usuario para get_seq_table
    SELECT nick_usua INTO v_usuario_login
    FROM sis_usuario 
    WHERE ide_usua = p_ide_usua;
    
    IF v_usuario_login IS NULL THEN
        v_usuario_login := CURRENT_USER;
    END IF;
    
    -- Obtener IDs de estado y tipo
    SELECT ide_inec INTO v_id_estado 
    FROM inv_estado_conteo 
    WHERE codigo_inec = 'PENDIENTE';
    
    IF v_id_estado IS NULL THEN
        RAISE EXCEPTION 'Estado PENDIENTE no configurado';
    END IF;
    
    SELECT ide_intc INTO v_id_tipo 
    FROM inv_tipo_conteo 
    WHERE codigo_intc = 'TOTAL';
    
    IF v_id_tipo IS NULL THEN
        RAISE EXCEPTION 'Tipo TOTAL no configurado';
    END IF;
    
    -- Verificar si ya existe conteo activo
    SELECT COUNT(*) INTO v_existe_conteo
    FROM inv_cab_conteo_fisico c
    JOIN inv_estado_conteo e ON c.ide_inec = e.ide_inec
    WHERE c.ide_inbod = p_ide_inbod
      AND c.mes_inccf = v_mes
      AND c.anio_inccf = v_anio
      AND c.activo_inccf = true
      AND e.codigo_inec NOT IN ('CERRADO', 'AJUSTADO', 'CANCELADO');
    
    IF v_existe_conteo > 0 THEN
        RAISE EXCEPTION 'Ya existe un conteo activo para esta bodega en %/%', v_mes, v_anio;
    END IF;
    
    -- Generar secuencial (formato: YYMM-XXXX)
    SELECT COALESCE(MAX(
        CASE 
            WHEN secuencial_inccf LIKE TO_CHAR(p_fecha_corte, 'YYMM') || '-%'
            THEN CAST(SUBSTRING(secuencial_inccf FROM 6) AS INT)
            ELSE 0
        END
    ), 0) + 1
    INTO v_correlativo
    FROM inv_cab_conteo_fisico
    WHERE ide_inbod = p_ide_inbod;
    
    -- Formato: YYMM-XXXX (ej: 2401-0001 = 9 caracteres)
    v_secuencial := TO_CHAR(p_fecha_corte, 'YYMM') || '-' || 
                   LPAD(v_correlativo::TEXT, 4, '0');
    
    -- **1. PRIMERO CALCULAR ESTADÍSTICAS GENERALES (todos los productos)**
    WITH existencia_cte_general AS (
        SELECT
            dci.ide_inarti,
            SUM(cantidad_indci * signo_intci) AS existencia                
        FROM
            inv_det_comp_inve dci
            INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
            LEFT JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
            LEFT JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
        WHERE
            ide_inepi = 1
            AND cci.ide_inbod = p_ide_inbod
            AND fecha_trans_incci <= p_fecha_corte
        GROUP BY dci.ide_inarti
    ),
    articulos_generales AS (
        SELECT
            a.ide_inarti,
            COALESCE(f_redondeo(ec.existencia, a.decim_stock_inarti), 0) as saldo_corte
        FROM inv_articulo a
        LEFT JOIN existencia_cte_general ec ON a.ide_inarti = ec.ide_inarti
        WHERE a.ide_intpr = 1
          AND a.nivel_inarti = 'HIJO'
          AND a.hace_kardex_inarti = true
          AND a.ide_empr = 0
          AND a.activo_inarti = true
    )
    SELECT 
        COUNT(*),
        SUM(CASE WHEN saldo_corte = 0 THEN 1 ELSE 0 END),
        SUM(CASE WHEN saldo_corte < 0 THEN 1 ELSE 0 END)
    INTO 
        v_total_general,
        v_productos_stock_cero_general,
        v_productos_stock_negativo_general
    FROM articulos_generales;
    
    IF v_total_general = 0 THEN
        RAISE EXCEPTION 'No hay productos en esta bodega';
    END IF;
    
    -- **2. CALCULAR ARTÍCULOS FILTRADOS CON SALDOS, COSTOS Y MOVIMIENTOS**
    WITH existencia_cte AS (
        SELECT
            dci.ide_inarti,
            SUM(cantidad_indci * signo_intci) AS existencia                
        FROM
            inv_det_comp_inve dci
            INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
            LEFT JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
            LEFT JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
        WHERE
            ide_inepi = 1
            AND cci.ide_inbod = p_ide_inbod
            AND fecha_trans_incci <= p_fecha_corte
        GROUP BY dci.ide_inarti
    ),
    movimientos_cte AS (
        SELECT
            dci.ide_inarti,
            COUNT(*) as num_movimientos
        FROM
            inv_det_comp_inve dci
            INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
            LEFT JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
            LEFT JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
        WHERE
            ide_inepi = 1
            AND cci.ide_inbod = p_ide_inbod
            AND fecha_trans_incci BETWEEN p_fecha_corte_desde AND p_fecha_corte
        GROUP BY dci.ide_inarti
    ),
    articulos_con_datos AS (
        SELECT
            a.ide_inarti,
            COALESCE(f_redondeo(ec.existencia, a.decim_stock_inarti), 0) as saldo_corte,
            a.decim_stock_inarti,
            a.nombre_inarti,
            -- Calcular costo unitario a la fecha de corte
            (
                SELECT COALESCE(
                    -- Costo promedio ponderado
                    (SELECT ROUND(
                        SUM(dci2.precio_indci * dci2.cantidad_indci) / 
                        NULLIF(SUM(CASE WHEN tci2.signo_intci > 0 THEN dci2.cantidad_indci ELSE 0 END), 0), 
                        4
                     )
                     FROM inv_det_comp_inve dci2
                     INNER JOIN inv_cab_comp_inve cci2 ON cci2.ide_incci = dci2.ide_incci
                     INNER JOIN inv_tip_tran_inve tti2 ON tti2.ide_intti = cci2.ide_intti
                     INNER JOIN inv_tip_comp_inve tci2 ON tci2.ide_intci = tti2.ide_intci
                     WHERE dci2.ide_inarti = a.ide_inarti
                       AND tci2.signo_intci > 0
                       AND cci2.ide_inepi = 1
                       AND cci2.fecha_trans_incci <= p_fecha_corte
                       AND cci2.ide_inbod = p_ide_inbod
                       AND dci2.ide_empr = 0),
                    
                    -- Último costo
                    (SELECT dci2.precio_indci
                     FROM inv_det_comp_inve dci2
                     INNER JOIN inv_cab_comp_inve cci2 ON cci2.ide_incci = dci2.ide_incci
                     INNER JOIN inv_tip_tran_inve tti2 ON tti2.ide_intti = cci2.ide_intti
                     INNER JOIN inv_tip_comp_inve tci2 ON tci2.ide_intci = tti2.ide_intci
                     WHERE dci2.ide_inarti = a.ide_inarti
                       AND tci2.signo_intci > 0
                       AND cci2.ide_inepi = 1
                       AND cci2.fecha_trans_incci <= p_fecha_corte
                       AND cci2.ide_inbod = p_ide_inbod
                       AND dci2.ide_empr = 0
                     ORDER BY cci2.fecha_trans_incci DESC, dci2.ide_indci DESC
                     LIMIT 1),
                    0
                )
            ) as costo_unitario,
            COALESCE(mc.num_movimientos, 0) as movimientos_conteo,
            CASE 
                WHEN COALESCE(f_redondeo(ec.existencia, a.decim_stock_inarti), 0) = 0 THEN 1
                ELSE 0
            END as es_cero,
            CASE 
                WHEN COALESCE(f_redondeo(ec.existencia, a.decim_stock_inarti), 0) < 0 THEN 1
                ELSE 0
            END as es_negativo,
            ROW_NUMBER() OVER (ORDER BY a.ide_inarti) as rn
        FROM inv_articulo a
        LEFT JOIN existencia_cte ec ON a.ide_inarti = ec.ide_inarti
        LEFT JOIN movimientos_cte mc ON a.ide_inarti = mc.ide_inarti
        WHERE a.ide_intpr = 1
          AND a.nivel_inarti = 'HIJO'
          AND a.hace_kardex_inarti = true
          AND a.ide_empr = 0
          AND a.activo_inarti = true
    ),
    -- Filtrar artículos según criterio de exclusión
    articulos_filtrados AS (
        SELECT *
        FROM articulos_con_datos
        WHERE 
            NOT (
                p_excluir_ceros_sin_movimientos = true 
                AND saldo_corte = 0 
                AND movimientos_conteo = 0
            )
    ),
    articulos_excluidos AS (
        SELECT *
        FROM articulos_con_datos
        WHERE 
            p_excluir_ceros_sin_movimientos = true 
            AND saldo_corte = 0 
            AND movimientos_conteo = 0
    )
    SELECT 
        COUNT(*),
        SUM(es_cero),
        SUM(es_negativo),
        SUM(saldo_corte * costo_unitario),
        (SELECT COUNT(*) FROM articulos_excluidos)
    INTO 
        v_total_items,
        v_productos_stock_cero,      -- Estos son solo los que están en articulos_filtrados
        v_productos_stock_negativo,  -- Estos son solo los que están en articulos_filtrados
        v_valor_total_corte,
        v_productos_excluidos
    FROM articulos_filtrados;
    
    IF v_total_items = 0 THEN
        RAISE EXCEPTION 'No hay productos para contar en esta bodega después de aplicar los filtros';
    END IF;
    
    -- **3. OBTENER ID PARA CABECERA**
    v_id_nuevo_conteo := get_seq_table(
        table_name := 'inv_cab_conteo_fisico',
        primary_key := 'ide_inccf',
        number_rows_added := 1,
        login := v_usuario_login
    );
    
    -- **4. OBTENER PRIMER ID PARA DETALLES**
    v_primer_id_detalle := get_seq_table(
        table_name := 'inv_det_conteo_fisico',
        primary_key := 'ide_indcf',
        number_rows_added := v_total_items,
        login := v_usuario_login
    );
    
    -- Insertar cabecera con todas las estadísticas
    INSERT INTO inv_cab_conteo_fisico (
        ide_inccf,
        ide_inbod, 
        ide_usua, 
        ide_inec, 
        ide_intc,
        secuencial_inccf, 
        mes_inccf, 
        anio_inccf, 
        fecha_corte_desde_inccf,
        fecha_corte_inccf,
        observacion_inccf, 
        fecha_ini_conteo_inccf, 
        usuario_ingre,
        fecha_ingre,
        productos_estimados_inccf,
        productos_contados_inccf,
        productos_con_diferencia_inccf,
        productos_ajustados_inccf,
        productos_stock_cero_inccf,
        productos_stock_negativo_inccf,
        valor_total_corte_inccf,
        valor_total_fisico_inccf,
        valor_total_diferencias_inccf,
        porcentaje_avance_inccf,
        porcentaje_exactitud_inccf,
        tolerancia_porcentaje_inccf,
        activo_inccf,
        ide_empr,
        ide_sucu
    ) VALUES (
        v_id_nuevo_conteo,
        p_ide_inbod, 
        p_ide_usua, 
        v_id_estado, 
        v_id_tipo,
        v_secuencial, 
        v_mes, 
        v_anio, 
        p_fecha_corte_desde,
        p_fecha_corte,
        p_observacion, 
        CURRENT_TIMESTAMP, 
        v_usuario_login,
        CURRENT_TIMESTAMP,
        v_total_items,          -- productos_estimados_inccf (solo los que se van a contar)
        0,                      -- productos_contados_inccf (inicialmente 0)
        0,                      -- productos_con_diferencia_inccf (inicialmente 0)
        0,                      -- productos_ajustados_inccf (inicialmente 0)
        v_productos_stock_cero_general, -- productos_stock_cero_inccf (TODOS los productos con stock cero)
        v_productos_stock_negativo_general, -- productos_stock_negativo_inccf (TODOS los productos con stock negativo)
        v_valor_total_corte,    -- valor_total_corte_inccf
        0,                      -- valor_total_fisico_inccf (inicialmente 0)
        0,                      -- valor_total_diferencias_inccf (inicialmente 0)
        0,                      -- porcentaje_avance_inccf (inicialmente 0)
        100,                    -- porcentaje_exactitud_inccf (inicialmente 100%)
        2.00,                   -- tolerancia_porcentaje_inccf (valor por defecto)
        true,                    -- activo_inccf
        p_ide_empr,
        p_ide_sucu
    );
    
    -- **5. INSERTAR DETALLES MASIVAMENTE CON TODOS LOS DATOS NECESARIOS**
    WITH existencia_cte AS (
        SELECT
            dci.ide_inarti,
            SUM(cantidad_indci * signo_intci) AS existencia                
        FROM
            inv_det_comp_inve dci
            INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
            LEFT JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
            LEFT JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
        WHERE
            ide_inepi = 1
            AND cci.ide_inbod = p_ide_inbod
            AND fecha_trans_incci <= p_fecha_corte
        GROUP BY dci.ide_inarti
    ),
    movimientos_cte AS (
        SELECT
            dci.ide_inarti,
            COUNT(*) as num_movimientos
        FROM
            inv_det_comp_inve dci
            INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
            LEFT JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
            LEFT JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
        WHERE
            ide_inepi = 1
            AND cci.ide_inbod = p_ide_inbod
            AND fecha_trans_incci BETWEEN p_fecha_corte_desde AND p_fecha_corte
        GROUP BY dci.ide_inarti
    ),
    articulos_con_todo AS (
        SELECT
            a.ide_inarti,
            COALESCE(f_redondeo(ec.existencia, a.decim_stock_inarti), 0) as saldo_corte,
            a.decim_stock_inarti,
            -- Calcular costo unitario a la fecha de corte
            (
                SELECT COALESCE(
                    -- Costo promedio ponderado
                    (SELECT ROUND(
                        SUM(dci2.precio_indci * dci2.cantidad_indci) / 
                        NULLIF(SUM(CASE WHEN tci2.signo_intci > 0 THEN dci2.cantidad_indci ELSE 0 END), 0), 
                        4
                     )
                     FROM inv_det_comp_inve dci2
                     INNER JOIN inv_cab_comp_inve cci2 ON cci2.ide_incci = dci2.ide_incci
                     INNER JOIN inv_tip_tran_inve tti2 ON tti2.ide_intti = cci2.ide_intti
                     INNER JOIN inv_tip_comp_inve tci2 ON tci2.ide_intci = tti2.ide_intci
                     WHERE dci2.ide_inarti = a.ide_inarti
                       AND tci2.signo_intci > 0
                       AND cci2.ide_inepi = 1
                       AND cci2.fecha_trans_incci <= p_fecha_corte
                       AND cci2.ide_inbod = p_ide_inbod
                       AND dci2.ide_empr = 0),
                    
                    -- Último costo
                    (SELECT dci2.precio_indci
                     FROM inv_det_comp_inve dci2
                     INNER JOIN inv_cab_comp_inve cci2 ON cci2.ide_incci = dci2.ide_incci
                     INNER JOIN inv_tip_tran_inve tti2 ON tti2.ide_intti = cci2.ide_intti
                     INNER JOIN inv_tip_comp_inve tci2 ON tci2.ide_intci = tti2.ide_intci
                     WHERE dci2.ide_inarti = a.ide_inarti
                       AND tci2.signo_intci > 0
                       AND cci2.ide_inepi = 1
                       AND cci2.fecha_trans_incci <= p_fecha_corte
                       AND cci2.ide_inbod = p_ide_inbod
                       AND dci2.ide_empr = 0
                     ORDER BY cci2.fecha_trans_incci DESC, dci2.ide_indci DESC
                     LIMIT 1),
                    0
                )
            ) as costo_unitario,
            COALESCE(mc.num_movimientos, 0) as movimientos_conteo,
            ROW_NUMBER() OVER (ORDER BY a.ide_inarti) as rn
        FROM inv_articulo a
        LEFT JOIN existencia_cte ec ON a.ide_inarti = ec.ide_inarti
        LEFT JOIN movimientos_cte mc ON a.ide_inarti = mc.ide_inarti
        WHERE a.ide_intpr = 1
          AND a.nivel_inarti = 'HIJO'
          AND a.hace_kardex_inarti = true
          AND a.ide_empr = 0
          AND a.activo_inarti = true
          -- Aplicar filtro de exclusión si está activado
          AND NOT (
                p_excluir_ceros_sin_movimientos = true 
                AND COALESCE(f_redondeo(ec.existencia, a.decim_stock_inarti), 0) = 0 
                AND COALESCE(mc.num_movimientos, 0) = 0
            )
    )
    INSERT INTO inv_det_conteo_fisico (
        ide_indcf,
        ide_inccf, 
        ide_inarti, 
        saldo_corte_indcf, 
        cantidad_fisica_indcf,
        estado_item_indcf, 
        usuario_ingre, 
        fecha_ingre,
        costo_unitario_indcf,
        saldo_conteo_indcf,
        requiere_ajuste_indcf,
        movimientos_conteo_indcf,
        activo_indcf
    )
    SELECT
        v_primer_id_detalle + act.rn - 1,
        v_id_nuevo_conteo,
        act.ide_inarti,
        act.saldo_corte,
        0,
        'PENDIENTE',
        v_usuario_login,
        CURRENT_TIMESTAMP,
        act.costo_unitario,
        act.saldo_corte,
        false,
        act.movimientos_conteo,
        true
    FROM articulos_con_todo act;
    
    -- Obtener total de productos insertados
    GET DIAGNOSTICS v_total_items = ROW_COUNT;
    
    -- Construir mensaje informativo
    v_mensaje := 'Conteo creado exitosamente con ' || v_total_items || ' productos';
    
    IF v_productos_stock_cero_general > 0 THEN
        v_mensaje := v_mensaje || ' (' || v_productos_stock_cero_general || ' con stock cero en total)';
    END IF;
    
    IF v_productos_stock_negativo_general > 0 THEN
        v_mensaje := v_mensaje || ' (' || v_productos_stock_negativo_general || ' con stock negativo en total)';
    END IF;
    
    IF p_excluir_ceros_sin_movimientos AND v_productos_excluidos > 0 THEN
        v_mensaje := v_mensaje || ' - Excluidos: ' || v_productos_excluidos || ' productos sin stock ni movimientos';
    END IF;
    
    -- Retornar resultados
    id_conteo := v_id_nuevo_conteo;
    secuencial_conteo := v_secuencial;
    mensaje_conteo := v_mensaje;
    total_items := v_total_items;
    estado_conteo := 'PENDIENTE';
    
    RETURN NEXT;
END;
$$;

--- Ejecutar
SELECT * FROM f_genera_conteo_inventario(
    p_ide_inbod := 2,
    p_fecha_corte_desde := '2025-05-01',
    p_fecha_corte := '2025-05-28',
    p_ide_usua := 11,
    p_ide_empr := 0,
    p_ide_sucu := 2,
    p_observacion := 'Conteo mensual'
);

