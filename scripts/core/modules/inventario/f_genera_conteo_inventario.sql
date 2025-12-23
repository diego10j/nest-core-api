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
    v_usuario_login VARCHAR(50);
    v_primer_id_detalle INT8;
BEGIN
    /* ================= VALIDACIONES ================= */
    IF p_fecha_corte > CURRENT_DATE THEN
        RAISE EXCEPTION 'Fecha de corte no puede ser futura';
    END IF;

    IF p_fecha_corte_desde > p_fecha_corte THEN
        RAISE EXCEPTION 'Fecha corte desde no puede ser mayor a fecha corte';
    END IF;

    v_mes  := EXTRACT(MONTH FROM p_fecha_corte);
    v_anio := EXTRACT(YEAR  FROM p_fecha_corte);

    SELECT nick_usua
    INTO v_usuario_login
    FROM sis_usuario
    WHERE ide_usua = p_ide_usua;

    IF v_usuario_login IS NULL THEN
        RAISE EXCEPTION 'Usuario no válido';
    END IF;

    SELECT ide_inec INTO v_id_estado
    FROM inv_estado_conteo
    WHERE codigo_inec = 'PENDIENTE';

    SELECT ide_intc INTO v_id_tipo
    FROM inv_tipo_conteo
    WHERE codigo_intc = 'TOTAL';

    /* ================= SECUENCIAL ================= */
    SELECT COALESCE(MAX(
        CASE
            WHEN secuencial_inccf LIKE TO_CHAR(p_fecha_corte,'YYMM')||'-%'
            THEN SUBSTRING(secuencial_inccf FROM 6)::INT
        END
    ),0) + 1
    INTO v_correlativo
    FROM inv_cab_conteo_fisico
    WHERE ide_inbod = p_ide_inbod;

    v_secuencial := TO_CHAR(p_fecha_corte,'YYMM') || '-' || LPAD(v_correlativo::TEXT,4,'0');

    /* ================= CONTAR ITEMS ================= */
    WITH base_articulos AS (
        SELECT
            a.ide_inarti,
            COALESCE(
                f_redondeo(
                    SUM(
                        CASE
                            WHEN c.fecha_trans_incci <= p_fecha_corte::timestamp
                            THEN d.cantidad_indci * tci.signo_intci
                            ELSE 0
                        END
                    ),
                    a.decim_stock_inarti
                ),0
            ) AS saldo_corte,
            SUM(
                CASE
                    WHEN c.fecha_trans_incci BETWEEN
                         p_fecha_corte_desde::timestamp
                     AND (p_fecha_corte + 1)::timestamp
                    THEN 1 ELSE 0
                END
            ) AS movimientos
        FROM inv_articulo a
        JOIN inv_det_comp_inve d ON d.ide_inarti = a.ide_inarti
        JOIN inv_cab_comp_inve c ON c.ide_incci = d.ide_incci
        JOIN inv_tip_tran_inve tti ON tti.ide_intti = c.ide_intti
        JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
        WHERE c.ide_inbod = p_ide_inbod
          AND c.ide_inepi = 1
          AND a.nivel_inarti = 'HIJO'
          AND a.hace_kardex_inarti
          AND a.activo_inarti
          AND a.ide_empr = p_ide_empr
        GROUP BY a.ide_inarti, a.decim_stock_inarti
    )
    SELECT COUNT(*)
    INTO v_total_items
    FROM base_articulos
    WHERE NOT (
        p_excluir_ceros_sin_movimientos
        AND saldo_corte = 0
        AND movimientos = 0
    );

    IF v_total_items = 0 THEN
        RAISE EXCEPTION 'No existen productos para generar el conteo';
    END IF;

    /* ================= IDS ================= */
    v_id_nuevo_conteo := get_seq_table(
        'inv_cab_conteo_fisico','ide_inccf',1,v_usuario_login
    );

    v_primer_id_detalle := get_seq_table(
        'inv_det_conteo_fisico','ide_indcf',v_total_items,v_usuario_login
    );

    /* ================= CABECERA ================= */
    INSERT INTO inv_cab_conteo_fisico (
        ide_inccf, ide_inbod, ide_usua,
        ide_inec, ide_intc,
        secuencial_inccf, mes_inccf, anio_inccf,
        fecha_corte_desde_inccf, fecha_corte_inccf,
        observacion_inccf,
        usuario_ingre, fecha_ingre,
        productos_estimados_inccf,
        activo_inccf, ide_empr, ide_sucu
    ) VALUES (
        v_id_nuevo_conteo, p_ide_inbod, p_ide_usua,
        v_id_estado, v_id_tipo,
        v_secuencial, v_mes, v_anio,
        p_fecha_corte_desde, p_fecha_corte,
        p_observacion,
        v_usuario_login, CURRENT_TIMESTAMP,
        v_total_items,
        true, p_ide_empr, p_ide_sucu
    );

    /* ================= DETALLE ================= */
    WITH base_articulos AS (
        SELECT
            a.ide_inarti,
            COALESCE(
                f_redondeo(
                    SUM(
                        CASE
                            WHEN c.fecha_trans_incci <= p_fecha_corte::timestamp
                            THEN d.cantidad_indci * tci.signo_intci
                            ELSE 0
                        END
                    ),
                    a.decim_stock_inarti
                ),0
            ) AS saldo_corte,
            SUM(
                CASE
                    WHEN c.fecha_trans_incci BETWEEN
                         p_fecha_corte_desde::timestamp
                     AND (p_fecha_corte + 1)::timestamp
                    THEN 1 ELSE 0
                END
            ) AS movimientos
        FROM inv_articulo a
        JOIN inv_det_comp_inve d ON d.ide_inarti = a.ide_inarti
        JOIN inv_cab_comp_inve c ON c.ide_incci = d.ide_incci
        JOIN inv_tip_tran_inve tti ON tti.ide_intti = c.ide_intti
        JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
        WHERE c.ide_inbod = p_ide_inbod
          AND c.ide_inepi = 1
          AND a.nivel_inarti = 'HIJO'
          AND a.hace_kardex_inarti
          AND a.activo_inarti
          AND a.ide_empr = p_ide_empr
        GROUP BY a.ide_inarti, a.decim_stock_inarti
    )
    INSERT INTO inv_det_conteo_fisico (
        ide_indcf, ide_inccf, ide_inarti,
        saldo_corte_indcf, cantidad_fisica_indcf,
        estado_item_indcf, usuario_ingre, fecha_ingre,
        saldo_conteo_indcf, requiere_ajuste_indcf,
        movimientos_conteo_indcf, activo_indcf
    )
    SELECT
        v_primer_id_detalle + ROW_NUMBER() OVER (ORDER BY ide_inarti) - 1,
        v_id_nuevo_conteo,
        ide_inarti,
        saldo_corte,
        0,
        'PENDIENTE',
        v_usuario_login,
        CURRENT_TIMESTAMP,
        saldo_corte,
        false,
        movimientos,
        true
    FROM base_articulos
    WHERE NOT (
        p_excluir_ceros_sin_movimientos
        AND saldo_corte = 0
        AND movimientos = 0
    );

    /* ================= RETORNO ================= */
    id_conteo := v_id_nuevo_conteo;
    secuencial_conteo := v_secuencial;
    mensaje_conteo := 'Conteo generado correctamente';
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

