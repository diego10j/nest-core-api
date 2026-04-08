-- version mejorada para precios de compra
-- 
-- ÍNDICES RECOMENDADOS PARA OPTIMIZAR PERFORMANCE:
-- CREATE INDEX IF NOT EXISTS idx_inv_cab_comp_inve_lookup ON inv_cab_comp_inve(ide_empr, ide_inepi, fecha_trans_incci, ide_intti) INCLUDE (ide_incci, ide_sucu);
-- CREATE INDEX IF NOT EXISTS idx_inv_det_comp_inve_articulo ON inv_det_comp_inve(ide_inarti, ide_incci) WHERE precio_indci > 0;
-- CREATE INDEX IF NOT EXISTS idx_cxc_cabece_factura_ventas ON cxc_cabece_factura(ide_empr, ide_ccefa, fecha_emisi_cccfa) INCLUDE (ide_cccfa, secuencial_cccfa, ide_geper, ide_vgven, ide_cndfp1, ide_sucu);
-- CREATE INDEX IF NOT EXISTS idx_cxc_deta_factura_articulo ON cxc_deta_factura(ide_cccfa, ide_inarti);
-- CREATE INDEX IF NOT EXISTS idx_cxp_cabecera_nota_lookup ON cxp_cabecera_nota(ide_empr, ide_cpeno, fecha_emisi_cpcno) INCLUDE (ide_cpcno, num_doc_mod_cpcno, ide_sucu);
      
CREATE OR REPLACE FUNCTION f_utilidad_ventas(
    id_empresa BIGINT,
    fecha_inicio DATE,
    fecha_fin DATE,
    id_articulo BIGINT DEFAULT NULL,  -- Parámetro opcional
    id_sucursal BIGINT DEFAULT NULL  -- Parámetro opcional
)
RETURNS TABLE (
    ide_ccdfa BIGINT,
    ide_inarti BIGINT,    
    fecha_emisi_cccfa DATE,
    secuencial_cccfa VARCHAR(50),
    nom_geper VARCHAR(250),
    nombre_inarti VARCHAR(250),
    cantidad_ccdfa NUMERIC,
    siglas_inuni VARCHAR(10),
    precio_venta NUMERIC,
    total_ccdfa NUMERIC,
    nombre_vgven VARCHAR(150),
    hace_kardex_inarti BOOLEAN,
    precio_compra NUMERIC,
    utilidad NUMERIC,
    utilidad_neta NUMERIC,
    porcentaje_utilidad NUMERIC,
    nota_credito NUMERIC,
    fecha_ultima_compra DATE,
    ide_cndfp BIGINT,
    nombre_cndfp VARCHAR(50),
    dias_cndfp BIGINT,
    ide_sucu BIGINT
) AS $$
DECLARE
    fecha_inicio_ext DATE := fecha_inicio - INTERVAL '5 days';
    fecha_fin_ext DATE := fecha_fin + INTERVAL '5 days';
BEGIN
    RETURN QUERY
    WITH
    -- Materializar compras del período para reutilizar en LATERAL
    compras_periodo AS MATERIALIZED (
        SELECT
            d.ide_inarti AS cp_ide_inarti,
            c.fecha_trans_incci AS cp_fecha_trans,
            d.precio_indci AS cp_precio
        FROM inv_det_comp_inve d
        JOIN inv_cab_comp_inve c ON d.ide_incci = c.ide_incci
        WHERE
            c.ide_empr = id_empresa
            AND c.ide_inepi = 1
            AND c.fecha_trans_incci BETWEEN fecha_inicio_ext AND fecha_fin_ext
            AND c.ide_intti IN (19, 16, 3025)
            AND d.precio_indci > 0
            AND (id_sucursal IS NULL OR c.ide_sucu = id_sucursal)
            AND (id_articulo IS NULL OR d.ide_inarti = id_articulo)
            AND EXISTS (
                SELECT 1
                FROM inv_tip_tran_inve t
                JOIN inv_tip_comp_inve e ON t.ide_intci = e.ide_intci
                WHERE t.ide_intti = c.ide_intti
                  AND e.signo_intci = 1
            )
    ),
    -- Materializar última compra fuera del período con DISTINCT ON
    ultima_compra_fuera_periodo AS MATERIALIZED (
        SELECT DISTINCT ON (d.ide_inarti)
            d.ide_inarti AS uc_ide_inarti,
            c.fecha_trans_incci AS uc_fecha_trans,
            d.precio_indci AS uc_precio
        FROM inv_det_comp_inve d
        JOIN inv_cab_comp_inve c ON d.ide_incci = c.ide_incci
        WHERE
            c.ide_empr = id_empresa
            AND c.ide_inepi = 1
            AND c.fecha_trans_incci < fecha_inicio_ext
            AND c.ide_intti IN (19, 16, 3025)
            AND d.precio_indci > 0
            AND (id_sucursal IS NULL OR c.ide_sucu = id_sucursal)
            AND (id_articulo IS NULL OR d.ide_inarti = id_articulo)
            AND EXISTS (
                SELECT 1
                FROM inv_tip_tran_inve t
                JOIN inv_tip_comp_inve e ON t.ide_intci = e.ide_intci
                WHERE t.ide_intti = c.ide_intti
                  AND e.signo_intci = 1
            )
        ORDER BY d.ide_inarti, c.fecha_trans_incci DESC
    ),
    -- Fusión de precios_articulos + datos_completos en un solo CTE con LATERAL
    datos_completos AS (
        SELECT
            cdf.ide_ccdfa                           AS dc_ide_ccdfa,
            cdf.ide_inarti                          AS dc_ide_inarti,
            cf.ide_sucu                             AS dc_ide_sucu,
            cf.fecha_emisi_cccfa                    AS dc_fecha_emisi,
            cf.secuencial_cccfa                     AS dc_secuencial,
            lpad(cf.secuencial_cccfa::text, 9, '0') AS dc_secuencial_pad,
            per.nom_geper                           AS dc_nom_geper,
            iart.nombre_inarti                      AS dc_nombre_inarti,
            cdf.cantidad_ccdfa                      AS dc_cantidad,
            uni.siglas_inuni                        AS dc_siglas_inuni,
            cdf.precio_ccdfa                        AS dc_precio_venta,
            cdf.total_ccdfa                         AS dc_total,
            ven.nombre_vgven                        AS dc_nombre_vgven,
            iart.hace_kardex_inarti                 AS dc_hace_kardex,
            cf.ide_cndfp1                           AS dc_ide_cndfp,
            fp.nombre_cndfp                         AS dc_nombre_cndfp,
            fp.dias_cndfp                           AS dc_dias_cndfp,
            COALESCE(mc.mc_precio, 0)               AS dc_precio_compra,
            mc.mc_fecha                             AS dc_fecha_ult_compra
        FROM cxc_deta_factura cdf
        JOIN cxc_cabece_factura cf  ON cf.ide_cccfa    = cdf.ide_cccfa
        JOIN inv_articulo iart      ON iart.ide_inarti = cdf.ide_inarti
        JOIN gen_persona per        ON per.ide_geper   = cf.ide_geper
        LEFT JOIN ven_vendedor ven  ON ven.ide_vgven   = cf.ide_vgven
        LEFT JOIN inv_unidad uni    ON uni.ide_inuni   = iart.ide_inuni
        LEFT JOIN con_deta_forma_pago fp ON fp.ide_cndfp = cf.ide_cndfp1
        -- LATERAL: resuelve precio y fecha de compra en 1 operación (reemplaza 6 subconsultas)
        LEFT JOIN LATERAL (
            SELECT sub.mc_precio, sub.mc_fecha
            FROM (
                (SELECT pc.cp_precio AS mc_precio, pc.cp_fecha_trans AS mc_fecha, 1 AS prioridad
                 FROM compras_periodo pc
                 WHERE pc.cp_ide_inarti = cdf.ide_inarti
                   AND pc.cp_fecha_trans > cf.fecha_emisi_cccfa
                   AND pc.cp_fecha_trans <= (cf.fecha_emisi_cccfa + INTERVAL '5 days')
                 ORDER BY pc.cp_fecha_trans ASC
                 LIMIT 1)
                UNION ALL
                (SELECT pc2.cp_precio, pc2.cp_fecha_trans, 2
                 FROM compras_periodo pc2
                 WHERE pc2.cp_ide_inarti = cdf.ide_inarti
                   AND pc2.cp_fecha_trans <= cf.fecha_emisi_cccfa
                 ORDER BY pc2.cp_fecha_trans DESC
                 LIMIT 1)
                UNION ALL
                (SELECT uc.uc_precio, uc.uc_fecha_trans, 3
                 FROM ultima_compra_fuera_periodo uc
                 WHERE uc.uc_ide_inarti = cdf.ide_inarti
                 LIMIT 1)
            ) sub
            ORDER BY sub.prioridad
            LIMIT 1
        ) mc ON true
        WHERE
            cf.ide_empr = id_empresa
            AND cf.ide_ccefa = 0
            AND cf.fecha_emisi_cccfa BETWEEN fecha_inicio AND fecha_fin
            AND (id_sucursal IS NULL OR cf.ide_sucu = id_sucursal)
            AND (id_articulo IS NULL OR cdf.ide_inarti = id_articulo)
    ),
    -- Notas de crédito: filtro de empresa/período en JOIN para acotar cross-join
    facturas_con_nota AS (
        SELECT
            lpad(cf.secuencial_cccfa::text, 9, '0') AS fn_secuencial_pad,
            cdn.ide_inarti                           AS fn_ide_inarti,
            SUM(cdn.valor_cpdno)                     AS fn_valor_nota
        FROM cxp_cabecera_nota cn
        JOIN cxp_detalle_nota cdn ON cdn.ide_cpcno = cn.ide_cpcno
        JOIN cxc_cabece_factura cf
          ON cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
         AND cf.ide_empr = cn.ide_empr
         AND cf.ide_sucu = cn.ide_sucu
         AND cf.ide_ccefa = 0
         AND cf.fecha_emisi_cccfa BETWEEN fecha_inicio AND fecha_fin
         AND (id_sucursal IS NULL OR cf.ide_sucu = id_sucursal)
        WHERE
            cn.ide_empr = id_empresa
            AND cn.ide_cpeno = 1
            AND cn.fecha_emisi_cpcno BETWEEN fecha_inicio AND fecha_fin
            AND (id_sucursal IS NULL OR cn.ide_sucu = id_sucursal)
            AND (id_articulo IS NULL OR cdn.ide_inarti = id_articulo)
        GROUP BY lpad(cf.secuencial_cccfa::text, 9, '0'), cdn.ide_inarti
    )
    SELECT
        dc.dc_ide_ccdfa,
        dc.dc_ide_inarti,
        dc.dc_fecha_emisi,
        dc.dc_secuencial,
        dc.dc_nom_geper,
        dc.dc_nombre_inarti,
        dc.dc_cantidad,
        dc.dc_siglas_inuni,
        dc.dc_precio_venta,
        dc.dc_total,
        dc.dc_nombre_vgven,
        dc.dc_hace_kardex,
        dc.dc_precio_compra,
        CASE
            WHEN dc.dc_hace_kardex = false OR COALESCE(fn.fn_valor_nota, 0) <> 0 THEN 0
            ELSE (dc.dc_precio_venta - dc.dc_precio_compra)
        END AS utilidad,
        CASE
            WHEN dc.dc_hace_kardex = false OR COALESCE(fn.fn_valor_nota, 0) <> 0 THEN 0
            ELSE ROUND((dc.dc_precio_venta - dc.dc_precio_compra) * dc.dc_cantidad, 2)
        END AS utilidad_neta,
        CASE
            WHEN dc.dc_hace_kardex = false OR COALESCE(fn.fn_valor_nota, 0) <> 0 THEN 0
            WHEN dc.dc_precio_compra > 0 THEN ROUND(((dc.dc_precio_venta - dc.dc_precio_compra) / dc.dc_precio_compra) * 100, 2)
            ELSE 0
        END AS porcentaje_utilidad,
        COALESCE(fn.fn_valor_nota, 0) AS nota_credito,
        dc.dc_fecha_ult_compra,
        dc.dc_ide_cndfp::BIGINT,
        dc.dc_nombre_cndfp,
        dc.dc_dias_cndfp::BIGINT,
        dc.dc_ide_sucu
    FROM datos_completos dc
    LEFT JOIN facturas_con_nota fn
        ON dc.dc_secuencial_pad = fn.fn_secuencial_pad
       AND dc.dc_ide_inarti     = fn.fn_ide_inarti
    ORDER BY dc.dc_fecha_emisi, dc.dc_secuencial;
END;
$$ LANGUAGE plpgsql;





-- SELECT * FROM f_utilidad_ventas(0, '2024-09-01', '2025-04-30', 1704)
-- SELECT * FROM f_utilidad_ventas(0, '2025-01-01', '2025-01-31')
-- SELECT * FROM f_utilidad_ventas(0, '2025-01-01', '2025-01-31', NULL, 5)  -- filtrar por sucursal