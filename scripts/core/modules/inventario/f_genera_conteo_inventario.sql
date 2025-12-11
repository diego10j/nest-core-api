CREATE OR REPLACE FUNCTION public.f_genera_conteo_inventario(
    p_ide_inbod INT8,
    p_fecha_corte DATE,
    p_ide_usua INT8,
    p_observacion VARCHAR(500) DEFAULT NULL
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
BEGIN
    -- Validaciones básicas
    IF p_fecha_corte > CURRENT_DATE THEN
        RAISE EXCEPTION 'Fecha de corte no puede ser futura';
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
    
    -- **1. CONTAR ARTÍCULOS Y OBTENER DATOS EN UNA SOLA CONSULTA**
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
            AND dci.ide_empr = 0
            AND cci.ide_inbod = p_ide_inbod
            AND fecha_trans_incci <= p_fecha_corte
        GROUP BY dci.ide_inarti
    ),
    articulos_a_contar AS (
        SELECT
            a.ide_inarti,
            COALESCE(f_redondeo(ec.existencia, a.decim_stock_inarti), 0) as saldo,
            ROW_NUMBER() OVER (ORDER BY a.ide_inarti) as rn
        FROM inv_articulo a
        LEFT JOIN existencia_cte ec ON a.ide_inarti = ec.ide_inarti
        WHERE a.ide_intpr = 1
          AND a.nivel_inarti = 'HIJO'
          AND a.hace_kardex_inarti = true
          AND a.ide_empr = 0
          AND a.activo_inarti = true
    )
    SELECT COUNT(*) INTO v_total_items
    FROM articulos_a_contar;
    
    IF v_total_items = 0 THEN
        RAISE EXCEPTION 'No hay productos para contar en esta bodega';
    END IF;
    
    -- **2. OBTENER ID PARA CABECERA**
    v_id_nuevo_conteo := get_seq_table(
        table_name := 'inv_cab_conteo_fisico',
        primary_key := 'ide_inccf',
        number_rows_added := 1,
        login := v_usuario_login
    );
    
    -- **3. OBTENER PRIMER ID PARA DETALLES**
    v_primer_id_detalle := get_seq_table(
        table_name := 'inv_det_conteo_fisico',
        primary_key := 'ide_indcf',
        number_rows_added := v_total_items,
        login := v_usuario_login
    );
    
    -- Insertar cabecera
    INSERT INTO inv_cab_conteo_fisico (
        ide_inccf,
        ide_inbod, 
        ide_usua, 
        ide_inec, 
        ide_intc,
        secuencial_inccf, 
        mes_inccf, 
        anio_inccf, 
        fecha_corte_inccf,
        observacion_inccf, 
        fecha_ini_conteo_inccf, 
        usuario_ingre,
        fecha_ingre
    ) VALUES (
        v_id_nuevo_conteo,
        p_ide_inbod, 
        p_ide_usua, 
        v_id_estado, 
        v_id_tipo,
        v_secuencial, 
        v_mes, 
        v_anio, 
        p_fecha_corte,
        p_observacion, 
        CURRENT_TIMESTAMP, 
        v_usuario_login,
        CURRENT_TIMESTAMP
    );
    
    -- **4. INSERTAR DETALLES MASIVAMENTE CON ROW_NUMBER**
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
            AND dci.ide_empr = 0
            AND cci.ide_inbod = p_ide_inbod
            AND fecha_trans_incci <= p_fecha_corte
        GROUP BY dci.ide_inarti
    ),
    articulos_con_ids AS (
        SELECT
            a.ide_inarti,
            COALESCE(f_redondeo(ec.existencia, a.decim_stock_inarti), 0) as saldo,
            ROW_NUMBER() OVER (ORDER BY a.ide_inarti) as rn
        FROM inv_articulo a
        LEFT JOIN existencia_cte ec ON a.ide_inarti = ec.ide_inarti
        WHERE a.ide_intpr = 1
          AND a.nivel_inarti = 'HIJO'
          AND a.hace_kardex_inarti = true
          AND a.ide_empr = 0
          AND a.activo_inarti = true
    )
    INSERT INTO inv_det_conteo_fisico (
        ide_indcf,
        ide_inccf, 
        ide_inarti, 
        saldo_corte_indcf, 
        cantidad_fisica_indcf,
        estado_item_indcf, 
        usuario_ingre, 
        fecha_ingre
    )
    SELECT
        v_primer_id_detalle + ac.rn - 1,  -- IDs consecutivos
        v_id_nuevo_conteo,
        ac.ide_inarti,
        ac.saldo,
        0,  -- Cantidad física inicial en 0
        'PENDIENTE',
        v_usuario_login,
        CURRENT_TIMESTAMP
    FROM articulos_con_ids ac;
    
    -- Obtener total de productos insertados
    GET DIAGNOSTICS v_total_items = ROW_COUNT;
    
    
    -- Retornar resultados
    id_conteo := v_id_nuevo_conteo;
    secuencial_conteo := v_secuencial;
    mensaje_conteo := 'Conteo creado exitosamente con ' || v_total_items || ' productos';
    total_items := v_total_items;
    estado_conteo := 'PENDIENTE';
    
    RETURN NEXT;
END;
$$;


--- Ejecutar
SELECT * FROM f_genera_conteo_inventario(
    p_ide_inbod := 2,
    p_fecha_corte := '2025-03-30',
    p_ide_usua := 11,
    p_observacion := 'Conteo mensual de Marzo'
);
