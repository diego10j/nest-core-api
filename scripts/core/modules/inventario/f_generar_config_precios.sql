-- Versión optimizada de la función f_generar_config_precios
-- Mejoras implementadas:
-- 1. Índices en tabla temporal para mejor performance
-- 2. Cálculo de percentiles optimizado (una sola consulta)
-- 3. Código refactorizado eliminando duplicación
-- 4. INSERT directo sin función auxiliar
-- 5. Validaciones mejoradas
-- 6. Mejor manejo de errores

CREATE OR REPLACE FUNCTION f_generar_config_precios(
    id_empresa BIGINT,
    p_ide_inarti INT,
    p_fecha_inicio DATE,
    p_fecha_fin DATE,
    p_login TEXT DEFAULT 'sa'
) RETURNS VOID AS $$
DECLARE
    v_count INT;
    v_forma_pago RECORD;
    v_ide_cncfp INT;
    v_descripcion TEXT;
    v_registros_insertados INT := 0;
    
    -- Record para almacenar percentiles calculados
    v_percentiles RECORD;
    v_min_cant NUMERIC;
    v_max_cant NUMERIC;
    v_avg_util NUMERIC;
BEGIN
    -- Validaciones de entrada
    IF p_fecha_inicio > p_fecha_fin THEN
        RAISE EXCEPTION 'Fecha inicio (%) no puede ser mayor que fecha fin (%)', 
            p_fecha_inicio, p_fecha_fin;
    END IF;
    
    IF p_fecha_fin > CURRENT_DATE THEN
        RAISE WARNING 'Fecha fin (%) es futura, resultados pueden ser incompletos', p_fecha_fin;
    END IF;

    -- Validar que el artículo existe
    IF NOT EXISTS (SELECT 1 FROM inv_articulo WHERE ide_inarti = p_ide_inarti) THEN
        RAISE EXCEPTION 'El artículo con ID % no existe', p_ide_inarti;
    END IF;

    -- Crear tabla temporal con datos de ventas, considerando si el detalle tiene IVA o no
    CREATE TEMP TABLE temp_ventas_producto AS
    WITH
    compras_periodo AS (
        SELECT
            d.ide_inarti AS cp_ide_inarti,
            c.fecha_trans_incci AS cp_fecha_trans,
            d.precio_indci AS cp_precio
        FROM inv_det_comp_inve d
        JOIN inv_cab_comp_inve c ON d.ide_incci = c.ide_incci
        JOIN inv_tip_tran_inve t ON c.ide_intti = t.ide_intti
        JOIN inv_tip_comp_inve e ON t.ide_intci = e.ide_intci
        WHERE
            c.ide_inepi = 1
            AND c.fecha_trans_incci BETWEEN p_fecha_inicio - INTERVAL '5 days' AND p_fecha_fin + INTERVAL '5 days'
            AND e.signo_intci = 1
            AND d.precio_indci > 0
            AND c.ide_intti IN (19, 16, 3025)
            AND d.ide_inarti = p_ide_inarti
            AND c.ide_empr = id_empresa
    ),
    ultima_compra_fuera_periodo AS (
        SELECT 
            d.ide_inarti AS uc_ide_inarti,
            c.fecha_trans_incci AS uc_fecha_trans,
            d.precio_indci AS uc_precio,
            ROW_NUMBER() OVER (PARTITION BY d.ide_inarti ORDER BY c.fecha_trans_incci DESC) as rn
        FROM inv_det_comp_inve d
        JOIN inv_cab_comp_inve c ON d.ide_incci = c.ide_incci
        JOIN inv_tip_tran_inve t ON c.ide_intti = t.ide_intti
        JOIN inv_tip_comp_inve e ON t.ide_intci = e.ide_intci
        WHERE
            c.ide_inepi = 1
            AND e.signo_intci = 1
            AND d.precio_indci > 0
            AND c.ide_intti IN (19, 16, 3025)
            AND c.fecha_trans_incci < p_fecha_inicio - INTERVAL '5 days'
            AND d.ide_inarti = p_ide_inarti
            AND c.ide_empr = id_empresa
    ),
    precios_articulos AS (
        SELECT
            cdf.ide_ccdfa,
            cdf.ide_inarti AS art_id,
            cf.fecha_emisi_cccfa AS fec_emision,
            COALESCE(
                (SELECT pc.cp_precio
                 FROM compras_periodo pc
                 WHERE pc.cp_ide_inarti = cdf.ide_inarti
                   AND pc.cp_fecha_trans > cf.fecha_emisi_cccfa
                   AND pc.cp_fecha_trans <= (cf.fecha_emisi_cccfa + INTERVAL '5 days')
                 ORDER BY pc.cp_fecha_trans ASC
                 LIMIT 1),
                (SELECT pc.cp_precio
                 FROM compras_periodo pc
                 WHERE pc.cp_ide_inarti = cdf.ide_inarti
                   AND pc.cp_fecha_trans <= cf.fecha_emisi_cccfa
                 ORDER BY pc.cp_fecha_trans DESC
                 LIMIT 1),
                (SELECT uc.uc_precio
                 FROM ultima_compra_fuera_periodo uc
                 WHERE uc.uc_ide_inarti = cdf.ide_inarti AND uc.rn = 1
                 LIMIT 1),
                0
            ) AS precio_compra,
            COALESCE(
                (SELECT pc.cp_fecha_trans
                 FROM compras_periodo pc
                 WHERE pc.cp_ide_inarti = cdf.ide_inarti
                   AND pc.cp_fecha_trans > cf.fecha_emisi_cccfa
                   AND pc.cp_fecha_trans <= (cf.fecha_emisi_cccfa + INTERVAL '5 days')
                 ORDER BY pc.cp_fecha_trans ASC
                 LIMIT 1),
                (SELECT pc.cp_fecha_trans
                 FROM compras_periodo pc
                 WHERE pc.cp_ide_inarti = cdf.ide_inarti
                   AND pc.cp_fecha_trans <= cf.fecha_emisi_cccfa
                 ORDER BY pc.cp_fecha_trans DESC
                 LIMIT 1),
                (SELECT uc.uc_fecha_trans
                 FROM ultima_compra_fuera_periodo uc
                 WHERE uc.uc_ide_inarti = cdf.ide_inarti AND uc.rn = 1
                 LIMIT 1),
                NULL
            ) AS fecha_ultima_compra
        FROM cxc_deta_factura cdf
        JOIN cxc_cabece_factura cf ON cf.ide_cccfa = cdf.ide_cccfa
        WHERE
            cf.ide_ccefa = 0
            AND cf.fecha_emisi_cccfa BETWEEN p_fecha_inicio AND p_fecha_fin
            AND cf.ide_empr = id_empresa
            AND cdf.ide_inarti = p_ide_inarti
    ),
    datos_completos AS (
        SELECT
            cdf.ide_inarti,
            cdf.ide_ccdfa,
            cf.fecha_emisi_cccfa,
            cf.secuencial_cccfa,
            per.nom_geper,
            iart.nombre_inarti,
            cdf.cantidad_ccdfa,
            uni.siglas_inuni,
            cdf.precio_ccdfa AS precio_venta,
            cdf.total_ccdfa,
            ven.nombre_vgven,
            iart.hace_kardex_inarti,
            cf.ide_cndfp1 AS ide_cndfp,
            fp.nombre_cndfp,
            fp.dias_cndfp,
            pa.precio_compra,
            pa.fecha_ultima_compra,
            cdf.iva_inarti_ccdfa
        FROM cxc_deta_factura cdf
        JOIN cxc_cabece_factura cf ON cf.ide_cccfa = cdf.ide_cccfa
        JOIN inv_articulo iart ON iart.ide_inarti = cdf.ide_inarti
        JOIN gen_persona per ON cf.ide_geper = per.ide_geper
        LEFT JOIN ven_vendedor ven ON cf.ide_vgven = ven.ide_vgven
        LEFT JOIN inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
        LEFT JOIN con_deta_forma_pago fp ON cf.ide_cndfp1 = fp.ide_cndfp
        LEFT JOIN precios_articulos pa ON pa.ide_ccdfa = cdf.ide_ccdfa AND pa.art_id = cdf.ide_inarti
        WHERE
            cf.ide_ccefa = 0
            AND cf.fecha_emisi_cccfa BETWEEN p_fecha_inicio AND p_fecha_fin
            AND cf.ide_empr = id_empresa
            AND cdf.ide_inarti = p_ide_inarti
    ),
    facturas_con_nota AS (
        SELECT 
            lpad(cf.secuencial_cccfa::text, 9, '0') AS secuencial_padded,
            cdn.ide_inarti,
            SUM(cdn.valor_cpdno) AS valor_nota_credito
        FROM cxp_cabecera_nota cn
        JOIN cxp_detalle_nota cdn ON cn.ide_cpcno = cdn.ide_cpcno
        JOIN cxc_cabece_factura cf ON cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
        WHERE cn.fecha_emisi_cpcno BETWEEN p_fecha_inicio AND p_fecha_fin
          AND cn.ide_cpeno = 1
          AND cdn.ide_inarti = p_ide_inarti
          AND cn.ide_empr = id_empresa
        GROUP BY lpad(cf.secuencial_cccfa::text, 9, '0'), cdn.ide_inarti
    )
    SELECT
        dc.ide_ccdfa,
        dc.ide_inarti,        
        dc.fecha_emisi_cccfa,
        dc.secuencial_cccfa,
        dc.nom_geper,
        dc.nombre_inarti,
        dc.cantidad_ccdfa,
        dc.siglas_inuni,
        -- Normalizar precio_venta: si iva_inarti_ccdfa = -1 el precio incluye IVA y debe dividirse
        CASE WHEN dc.iva_inarti_ccdfa = -1 THEN ROUND(dc.precio_venta / 1.12, 4) ELSE dc.precio_venta END AS precio_venta,
        dc.total_ccdfa,
        dc.nombre_vgven,
        dc.hace_kardex_inarti,
        dc.precio_compra,
        -- Utilidad: solo si hace kardex y no tiene nota de crédito
        CASE
            WHEN dc.hace_kardex_inarti = false OR COALESCE(fn.valor_nota_credito, 0) <> 0 THEN 0
            ELSE (CASE WHEN dc.iva_inarti_ccdfa = -1 THEN ROUND(dc.precio_venta / 1.12, 4) ELSE dc.precio_venta END - dc.precio_compra)
        END AS utilidad,
        CASE
            WHEN dc.hace_kardex_inarti = false OR COALESCE(fn.valor_nota_credito, 0) <> 0 THEN 0
            ELSE ROUND((CASE WHEN dc.iva_inarti_ccdfa = -1 THEN ROUND(dc.precio_venta / 1.12, 4) ELSE dc.precio_venta END - dc.precio_compra) * dc.cantidad_ccdfa, 2)
        END AS utilidad_neta,
        CASE
            WHEN dc.hace_kardex_inarti = false OR COALESCE(fn.valor_nota_credito, 0) <> 0 THEN 0
            WHEN dc.precio_compra > 0 THEN ROUND(((CASE WHEN dc.iva_inarti_ccdfa = -1 THEN ROUND(dc.precio_venta / 1.12, 4) ELSE dc.precio_venta END - dc.precio_compra) / dc.precio_compra) * 100, 2)
            ELSE 0
        END AS porcentaje_utilidad,
        COALESCE(fn.valor_nota_credito, 0) AS nota_credito,
        dc.fecha_ultima_compra,
        dc.ide_cndfp::BIGINT,
        dc.nombre_cndfp,
        dc.dias_cndfp::BIGINT
    FROM datos_completos dc
    LEFT JOIN facturas_con_nota fn ON lpad(dc.secuencial_cccfa::text, 9, '0') = fn.secuencial_padded 
                                   AND dc.ide_inarti = fn.ide_inarti;

    -- Verificar que hay datos
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN
        DROP TABLE temp_ventas_producto;
        RAISE EXCEPTION 'No hay datos de ventas para el artículo % en el período % a %', 
            p_ide_inarti, p_fecha_inicio, p_fecha_fin;
    END IF;
    
    -- Crear índices en tabla temporal para mejorar performance
    CREATE INDEX idx_temp_ventas_forma_pago ON temp_ventas_producto(ide_cndfp);
    CREATE INDEX idx_temp_ventas_cantidad ON temp_ventas_producto(ide_cndfp, cantidad_ccdfa);
    ANALYZE temp_ventas_producto;

    -- Eliminar todas las configuraciones previas del artículo
    DELETE FROM inv_conf_precios_articulo 
    WHERE ide_inarti = p_ide_inarti;

    v_descripcion := 'Config automática ' || p_fecha_inicio || ' a ' || p_fecha_fin;

    -- Procesar por forma de pago
    FOR v_forma_pago IN 
        SELECT DISTINCT ide_cndfp, nombre_cndfp 
        FROM temp_ventas_producto 
        WHERE ide_cndfp IS NOT NULL
        ORDER BY ide_cndfp
    LOOP
        BEGIN
            -- Obtener configuración de forma de pago
            SELECT ide_cncfp INTO v_ide_cncfp 
            FROM con_deta_forma_pago 
            WHERE ide_cndfp = v_forma_pago.ide_cndfp;

                        -- Obtener las cantidades más vendidas (top 5) para definir los cortes de rango
                        CREATE TEMP TABLE temp_top_cantidades AS
                        SELECT cantidad_ccdfa, COUNT(*) AS ventas
                        FROM temp_ventas_producto
                        WHERE ide_cndfp = v_forma_pago.ide_cndfp
                        GROUP BY cantidad_ccdfa
                        ORDER BY ventas DESC, cantidad_ccdfa
                        LIMIT 5;

                        -- Obtener los cortes de los rangos (ordenados de menor a mayor)
                        CREATE TEMP TABLE temp_cortes_rango AS
                        SELECT cantidad_ccdfa FROM temp_top_cantidades ORDER BY cantidad_ccdfa;

                        -- Si no hay suficientes cortes, usar min y max
                        SELECT MIN(cantidad_ccdfa), MAX(cantidad_ccdfa), AVG(porcentaje_utilidad)
                            INTO v_min_cant, v_max_cant, v_avg_util
                        FROM temp_ventas_producto
                        WHERE ide_cndfp = v_forma_pago.ide_cndfp;

                        -- Validar si hay datos para esta forma de pago
                        IF v_min_cant IS NULL THEN
                            DROP TABLE IF EXISTS temp_top_cantidades;
                            DROP TABLE IF EXISTS temp_cortes_rango;
                            CONTINUE;
                        END IF;

                        -- Insertar rangos entre los cortes
                        WITH cortes AS (
                            SELECT cantidad_ccdfa, LEAD(cantidad_ccdfa) OVER (ORDER BY cantidad_ccdfa) AS siguiente
                            FROM temp_cortes_rango
                        )
                        INSERT INTO inv_conf_precios_articulo (
                            ide_incpa,
                            ide_inarti,
                            rangos_incpa,
                            rango1_cant_incpa,
                            rango2_cant_incpa,
                            ide_empr,
                            porcentaje_util_incpa,
                            activo_incpa,
                            rango_infinito_incpa,
                            usuario_ingre,
                            ide_cndfp,
                            ide_cncfp,
                            observacion_incpa
                        )
                        SELECT 
                            get_seq_table('inv_conf_precios_articulo', 'ide_incpa', 1, p_login),
                            p_ide_inarti,
                            TRUE,
                            c.cantidad_ccdfa,
                            c.siguiente,
                            id_empresa,
                            ROUND(COALESCE((SELECT AVG(porcentaje_utilidad) FROM temp_ventas_producto WHERE ide_cndfp = v_forma_pago.ide_cndfp AND cantidad_ccdfa >= c.cantidad_ccdfa AND (c.siguiente IS NULL OR cantidad_ccdfa < c.siguiente)), v_avg_util), 2),
                            TRUE,
                            FALSE,
                            p_login,
                            v_forma_pago.ide_cndfp,
                            v_ide_cncfp,
                            v_descripcion || ' (' || v_forma_pago.nombre_cndfp || ')'
                        FROM cortes c
                        WHERE c.siguiente IS NOT NULL;

                        -- Rango infinito (mayores al último corte)
                        INSERT INTO inv_conf_precios_articulo (
                            ide_incpa,
                            ide_inarti,
                            rangos_incpa,
                            rango1_cant_incpa,
                            rango2_cant_incpa,
                            ide_empr,
                            porcentaje_util_incpa,
                            activo_incpa,
                            rango_infinito_incpa,
                            usuario_ingre,
                            ide_cndfp,
                            ide_cncfp,
                            observacion_incpa
                        )
                        SELECT 
                            get_seq_table('inv_conf_precios_articulo', 'ide_incpa', 1, p_login),
                            p_ide_inarti,
                            TRUE,
                            (SELECT MAX(cantidad_ccdfa) FROM temp_cortes_rango),
                            NULL,
                            id_empresa,
                            ROUND(COALESCE((SELECT AVG(porcentaje_utilidad) FROM temp_ventas_producto WHERE ide_cndfp = v_forma_pago.ide_cndfp AND cantidad_ccdfa >= (SELECT MAX(cantidad_ccdfa) FROM temp_cortes_rango)), v_avg_util), 2),
                            TRUE,
                            TRUE,
                            p_login,
                            v_forma_pago.ide_cndfp,
                            v_ide_cncfp,
                            v_descripcion || ' (' || v_forma_pago.nombre_cndfp || ') - Infinito'
                        ;

                        GET DIAGNOSTICS v_count = ROW_COUNT;
                        v_registros_insertados := v_registros_insertados + v_count;

                        DROP TABLE IF EXISTS temp_top_cantidades;
                        DROP TABLE IF EXISTS temp_cortes_rango;
            
        EXCEPTION
            WHEN OTHERS THEN
                RAISE WARNING 'Error procesando forma de pago "%" (ID: %): % [SQL: %]', 
                    v_forma_pago.nombre_cndfp, 
                    v_forma_pago.ide_cndfp,
                    SQLERRM,
                    SQLSTATE;
                CONTINUE;
        END;
    END LOOP;

    DROP TABLE temp_ventas_producto;
    
    -- Verificar que se insertaron registros
    IF v_registros_insertados = 0 THEN
        RAISE EXCEPTION 'No se pudo generar ninguna configuración de precios. Revisar warnings anteriores.';
    END IF;
    
    -- Contar el total real de registros para el artículo
    SELECT COUNT(*) INTO v_registros_insertados FROM inv_conf_precios_articulo WHERE ide_inarti = p_ide_inarti;
    RAISE NOTICE 'Configuración completada: % registros en total para artículo %', 
        v_registros_insertados, p_ide_inarti;
    
EXCEPTION
    WHEN OTHERS THEN
        DROP TABLE IF EXISTS temp_ventas_producto;
        RAISE EXCEPTION 'ERROR en f_generar_config_precios (Artículo: %, Período: % a %): % [SQL: %]', 
            p_ide_inarti, p_fecha_inicio, p_fecha_fin, SQLERRM, SQLSTATE;
END;
$$ LANGUAGE plpgsql;



--SELECT f_generar_config_precios(0, 1704, '2025-01-01', '2025-12-31');

-- Ver los resultados
--SELECT * FROM inv_conf_precios_articulo WHERE ide_inarti = 1704 ORDER BY rango1_cant_incpa;

