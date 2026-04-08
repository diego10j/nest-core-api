CREATE OR REPLACE FUNCTION f_total_utilidad_mes(
    id_empresa BIGINT,
    p_mes      BIGINT,
    p_anio     BIGINT,
    id_sucursal BIGINT DEFAULT NULL  -- Parámetro opcional
) RETURNS NUMERIC AS $$
DECLARE
    fecha_inicio      DATE;
    fecha_fin         DATE;
    fecha_inicio_anio DATE;
    fecha_fin_anio    DATE;
    sumatoria         NUMERIC;
BEGIN
    fecha_inicio      := MAKE_DATE(p_anio::INTEGER, p_mes::INTEGER, 1);
    fecha_fin         := (MAKE_DATE(p_anio::INTEGER, p_mes::INTEGER, 1) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    fecha_inicio_anio := MAKE_DATE(p_anio::INTEGER, 1, 1);
    fecha_fin_anio    := MAKE_DATE(p_anio::INTEGER, 12, 31);

    WITH
    -- ═══ Compras del año completo ±5 días (igual que getTotalVentasPeriodo) ═══
    -- Escaneo anual permite que precio_pasado resuelva por (artículo, fecha-venta)
    -- sin perder compras de meses anteriores al mes consultado.
    compras_anual AS MATERIALIZED (
        SELECT
            d.ide_inarti          AS ca_ide_inarti,
            c.fecha_trans_incci   AS ca_fecha_compra,
            d.precio_indci        AS ca_precio
        FROM inv_det_comp_inve d
        JOIN inv_cab_comp_inve c ON d.ide_incci = c.ide_incci
        WHERE
            c.ide_empr = id_empresa
            AND c.ide_inepi = 1
            AND c.fecha_trans_incci BETWEEN (fecha_inicio_anio - INTERVAL '5 days')
                                        AND (fecha_fin_anio   + INTERVAL '5 days')
            AND c.ide_intti IN (19, 16, 3025)
            AND d.precio_indci > 0
            AND (id_sucursal IS NULL OR c.ide_sucu = id_sucursal)
            AND EXISTS (
                SELECT 1
                FROM inv_tip_tran_inve t
                JOIN inv_tip_comp_inve e ON t.ide_intci = e.ide_intci
                WHERE t.ide_intti = c.ide_intti
                  AND e.signo_intci = 1
            )
    ),
    -- ═══ Última compra histórica por artículo (fallback antes del año) ═══
    ultima_compra AS MATERIALIZED (
        SELECT DISTINCT ON (d.ide_inarti)
            d.ide_inarti        AS uc_ide_inarti,
            d.precio_indci      AS uc_precio
        FROM inv_det_comp_inve d
        JOIN inv_cab_comp_inve c ON d.ide_incci = c.ide_incci
        WHERE
            c.ide_empr = id_empresa
            AND c.ide_inepi = 1
            AND c.fecha_trans_incci < (fecha_inicio_anio - INTERVAL '5 days')
            AND c.ide_intti IN (19, 16, 3025)
            AND d.precio_indci > 0
            AND (id_sucursal IS NULL OR c.ide_sucu = id_sucursal)
            AND EXISTS (
                SELECT 1
                FROM inv_tip_tran_inve t
                JOIN inv_tip_comp_inve e ON t.ide_intci = e.ide_intci
                WHERE t.ide_intti = c.ide_intti
                  AND e.signo_intci = 1
            )
        ORDER BY d.ide_inarti, c.fecha_trans_incci DESC
    ),
    -- ═══ Notas de crédito del mes (para excluir ventas con NC en el mismo mes) ═══
    -- IMPORTANTE: solo excluye cuando la NC es del mismo mes que la factura,
    -- igual que getTotalVentasPeriodo (fn_mes para correlacionar).
    facturas_con_nota AS MATERIALIZED (
        SELECT
            lpad(cf.secuencial_cccfa::text, 9, '0') AS fn_secuencial_pad,
            cdn.ide_inarti                           AS fn_ide_inarti
        FROM cxp_cabecera_nota cn
        JOIN cxp_detalle_nota cdn ON cdn.ide_cpcno = cn.ide_cpcno
        JOIN cxc_cabece_factura cf
          ON cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
         AND cf.ide_empr  = cn.ide_empr
         AND cf.ide_sucu  = cn.ide_sucu
         AND cf.ide_ccefa = 0
         AND cf.fecha_emisi_cccfa BETWEEN fecha_inicio AND fecha_fin
         AND (id_sucursal IS NULL OR cf.ide_sucu = id_sucursal)
        WHERE
            cn.ide_empr  = id_empresa
            AND cn.ide_cpeno = 1
            AND cn.fecha_emisi_cpcno BETWEEN fecha_inicio AND fecha_fin
            AND EXTRACT(MONTH FROM cn.fecha_emisi_cpcno) = EXTRACT(MONTH FROM cf.fecha_emisi_cccfa)
            AND (id_sucursal IS NULL OR cn.ide_sucu = id_sucursal)
        GROUP BY lpad(cf.secuencial_cccfa::text, 9, '0'), cdn.ide_inarti
        HAVING SUM(cdn.valor_cpdno) <> 0
    ),
    -- ═══ Ventas del mes (solo kardex, sin nota crédito) ═══
    ventas_mes AS MATERIALIZED (
        SELECT
            cdf.ide_inarti          AS vm_ide_inarti,
            cf.fecha_emisi_cccfa    AS vm_fecha_venta,
            cdf.precio_ccdfa        AS vm_precio_venta,
            cdf.cantidad_ccdfa      AS vm_cantidad
        FROM cxc_deta_factura cdf
        JOIN cxc_cabece_factura cf ON cf.ide_cccfa    = cdf.ide_cccfa
        JOIN inv_articulo iart      ON iart.ide_inarti = cdf.ide_inarti
        WHERE
            cf.ide_empr  = id_empresa
            AND cf.ide_ccefa = 0
            AND cf.fecha_emisi_cccfa BETWEEN fecha_inicio AND fecha_fin
            AND iart.hace_kardex_inarti = true
            AND (id_sucursal IS NULL OR cf.ide_sucu = id_sucursal)
            AND NOT EXISTS (
                SELECT 1 FROM facturas_con_nota fn
                WHERE fn.fn_secuencial_pad = lpad(cf.secuencial_cccfa::text, 9, '0')
                  AND fn.fn_ide_inarti = cdf.ide_inarti
            )
    ),
    -- ═══ Pares únicos (artículo, fecha) para resolver precios en batch ═══
    fechas_unicas AS (
        SELECT DISTINCT vm_ide_inarti, vm_fecha_venta FROM ventas_mes
    ),
    -- ═══ Precio Prioridad 1: compra futura más cercana (≤5 días) ═══
    precio_futuro AS (
        SELECT DISTINCT ON (fu.vm_ide_inarti, fu.vm_fecha_venta)
            fu.vm_ide_inarti, fu.vm_fecha_venta, ca.ca_precio AS precio
        FROM fechas_unicas fu
        JOIN compras_anual ca ON ca.ca_ide_inarti = fu.vm_ide_inarti
            AND ca.ca_fecha_compra >  fu.vm_fecha_venta
            AND ca.ca_fecha_compra <= (fu.vm_fecha_venta + INTERVAL '5 days')
        ORDER BY fu.vm_ide_inarti, fu.vm_fecha_venta, ca.ca_fecha_compra ASC
    ),
    -- ═══ Precio Prioridad 2: compra pasada más reciente ═══
    precio_pasado AS (
        SELECT DISTINCT ON (fu.vm_ide_inarti, fu.vm_fecha_venta)
            fu.vm_ide_inarti, fu.vm_fecha_venta, ca.ca_precio AS precio
        FROM fechas_unicas fu
        JOIN compras_anual ca ON ca.ca_ide_inarti = fu.vm_ide_inarti
            AND ca.ca_fecha_compra <= fu.vm_fecha_venta
        ORDER BY fu.vm_ide_inarti, fu.vm_fecha_venta, ca.ca_fecha_compra DESC
    ),
    -- ═══ Precios resueltos: COALESCE de 3 prioridades ═══
    precios_resueltos AS (
        SELECT
            fu.vm_ide_inarti,
            fu.vm_fecha_venta,
            COALESCE(pf.precio, pp.precio, uc.uc_precio, 0) AS precio_compra
        FROM fechas_unicas fu
        LEFT JOIN precio_futuro pf ON pf.vm_ide_inarti = fu.vm_ide_inarti AND pf.vm_fecha_venta = fu.vm_fecha_venta
        LEFT JOIN precio_pasado pp ON pp.vm_ide_inarti = fu.vm_ide_inarti AND pp.vm_fecha_venta = fu.vm_fecha_venta
        LEFT JOIN ultima_compra  uc ON uc.uc_ide_inarti = fu.vm_ide_inarti
    )
    SELECT COALESCE(SUM(
        ROUND((vm.vm_precio_venta - pr.precio_compra) * vm.vm_cantidad, 2)
    ), 0)
    INTO sumatoria
    FROM ventas_mes vm
    JOIN precios_resueltos pr ON pr.vm_ide_inarti  = vm.vm_ide_inarti
                              AND pr.vm_fecha_venta = vm.vm_fecha_venta;

    RETURN sumatoria;
END;
$$ LANGUAGE plpgsql;

-- SELECT f_total_utilidad_mes(0, 2, 2025);
-- SELECT f_total_utilidad_mes(0, 2, 2025, 1);  -- Filtrado por sucursal