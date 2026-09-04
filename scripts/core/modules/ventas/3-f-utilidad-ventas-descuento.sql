-- Agrega la columna "descuento" (cxc_deta_factura.descuento_ccdfa) a la salida de
-- f_utilidad_ventas, para mostrarla en el reporte de utilidad de ventas. El cálculo
-- de utilidad_neta/porcentaje_utilidad YA usa dc_total (neto de descuento) desde la
-- versión PPMP vigente - esto solo agrega el dato para que se pueda mostrar en pantalla,
-- no cambia ninguna fórmula de utilidad ya existente.
--
-- CREATE OR REPLACE no permite cambiar la lista de columnas de RETURNS TABLE, hace
-- falta DROP + CREATE (misma firma exacta que la función vigente).
DROP FUNCTION IF EXISTS f_utilidad_ventas(BIGINT, DATE, DATE, BIGINT, BIGINT);

CREATE OR REPLACE FUNCTION f_utilidad_ventas(
    id_empresa    BIGINT,
    fecha_inicio  DATE,
    fecha_fin     DATE,
    id_articulo   BIGINT DEFAULT NULL,
    id_sucursal   BIGINT DEFAULT NULL
)
RETURNS TABLE (
    ide_ccdfa              BIGINT,
    ide_inarti             BIGINT,
    fecha_emisi_cccfa      DATE,
    secuencial_cccfa       VARCHAR(50),
    nom_geper              VARCHAR(250),
    nombre_inarti          VARCHAR(250),
    cantidad_ccdfa         NUMERIC,
    siglas_inuni           VARCHAR(10),
    precio_venta           NUMERIC,
    total_ccdfa            NUMERIC,
    descuento_ccdfa         NUMERIC,   -- NUEVO: descuento de línea (cxc_deta_factura.descuento_ccdfa)
    nombre_vgven           VARCHAR(150),
    hace_kardex_inarti     BOOLEAN,
    precio_compra          NUMERIC,
    metodo_costo           VARCHAR(50),   -- trazabilidad del costo
    utilidad               NUMERIC,
    utilidad_neta          NUMERIC,
    porcentaje_utilidad    NUMERIC,
    nota_credito           NUMERIC,
    fecha_ultima_compra    DATE,          -- fecha del kardex usado
    ide_cndfp              BIGINT,
    nombre_cndfp           VARCHAR(50),
    dias_cndfp             BIGINT,
    ide_sucu               BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH
    -- ─────────────────────────────────────────────
    -- Datos de ventas (sin CTEs de compras, ya no necesarios)
    -- ─────────────────────────────────────────────
    datos_completos AS (
        SELECT
            cdf.ide_ccdfa                                   AS dc_ide_ccdfa,
            cdf.ide_inarti                                  AS dc_ide_inarti,
            cf.ide_sucu                                     AS dc_ide_sucu,
            cf.fecha_emisi_cccfa                            AS dc_fecha_emisi,
            cf.secuencial_cccfa                             AS dc_secuencial,
            lpad(cf.secuencial_cccfa::text, 9, '0')         AS dc_secuencial_pad,
            per.nom_geper                                   AS dc_nom_geper,
            iart.nombre_inarti                              AS dc_nombre_inarti,
            cdf.cantidad_ccdfa                              AS dc_cantidad,
            uni.siglas_inuni                                AS dc_siglas_inuni,
            cdf.precio_ccdfa                               AS dc_precio_venta,
            cdf.total_ccdfa                                AS dc_total,
            cdf.descuento_ccdfa                            AS dc_descuento,
            ven.nombre_vgven                               AS dc_nombre_vgven,
            iart.hace_kardex_inarti                        AS dc_hace_kardex,
            cf.ide_cndfp1                                  AS dc_ide_cndfp,
            fp.nombre_cndfp                                AS dc_nombre_cndfp,
            fp.dias_cndfp                                  AS dc_dias_cndfp,
            -- PPMP vía LATERAL: un acceso limpio al kardex por fila
            COALESCE(ppmp.costo_unitario, 0)               AS dc_precio_compra,
            ppmp.metodo_aplicado                           AS dc_metodo_costo,
            ppmp.fecha_costo                               AS dc_fecha_ult_compra
        FROM cxc_deta_factura cdf
        JOIN cxc_cabece_factura cf   ON cf.ide_cccfa    = cdf.ide_cccfa
        JOIN inv_articulo iart       ON iart.ide_inarti = cdf.ide_inarti
        JOIN gen_persona per         ON per.ide_geper   = cf.ide_geper
        LEFT JOIN ven_vendedor ven   ON ven.ide_vgven   = cf.ide_vgven
        LEFT JOIN inv_unidad uni     ON uni.ide_inuni   = iart.ide_inuni
        LEFT JOIN con_deta_forma_pago fp ON fp.ide_cndfp = cf.ide_cndfp1
        -- ── Reemplaza los 2 CTEs + LATERAL con 3 UNION ALL ──────────────
        -- f_costo_unitario_ppmp devuelve el CPP vigente a la fecha de venta,
        -- que es el costo contable correcto bajo el método PPMP.
        -- Usa ide_sucu de la factura para respetar el kardex por sucursal.
        LEFT JOIN LATERAL (
            SELECT
                p.costo_unitario,
                p.fecha_costo,
                p.metodo_aplicado
            FROM f_costo_unitario_ppmp(
                id_empresa,
                cf.ide_sucu,          -- sucursal de la factura (no el filtro)
                cdf.ide_inarti,
                cf.fecha_emisi_cccfa
            ) p
        ) ppmp ON true
        WHERE
            cf.ide_empr          = id_empresa
            AND cf.ide_ccefa     = 0
            AND cf.fecha_emisi_cccfa BETWEEN fecha_inicio AND fecha_fin
            AND (id_sucursal IS NULL OR cf.ide_sucu = id_sucursal)
            AND (id_articulo IS NULL OR cdf.ide_inarti = id_articulo)
    ),
    -- ─────────────────────────────────────────────
    -- Notas de crédito (sin cambios)
    -- ─────────────────────────────────────────────
    facturas_con_nota AS (
        SELECT
            lpad(cf.secuencial_cccfa::text, 9, '0')  AS fn_secuencial_pad,
            cdn.ide_inarti                            AS fn_ide_inarti,
            SUM(cdn.valor_cpdno)                      AS fn_valor_nota
        FROM cxp_cabecera_nota cn
        JOIN cxp_detalle_nota cdn ON cdn.ide_cpcno = cn.ide_cpcno
        JOIN cxc_cabece_factura cf
          ON cn.ide_cccfa = cf.ide_cccfa
         AND cf.ide_empr     = cn.ide_empr
         AND cf.ide_ccefa    = 0
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
    -- ─────────────────────────────────────────────
    -- Proyección final
    -- ─────────────────────────────────────────────
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
        dc.dc_descuento,
        dc.dc_nombre_vgven,
        dc.dc_hace_kardex,
        dc.dc_precio_compra,
        dc.dc_metodo_costo,         -- trazabilidad: PPMP_NORMAL, SIN_COSTO, etc.
        CASE
            WHEN dc.dc_hace_kardex = false
              OR COALESCE(fn.fn_valor_nota, 0) <> 0
              OR dc.dc_metodo_costo IN ('SIN_COSTO', 'SIN_PRECIO_COMPRA')
            THEN 0
            ELSE (dc.dc_precio_venta - dc.dc_precio_compra)
        END AS utilidad,
        -- utilidad_neta usa dc_total (cxc_deta_factura.total_ccdfa, YA neto de descuento de
        -- línea) en vez de precio_venta*cantidad - de lo contrario la utilidad queda inflada
        -- exactamente en el valor del descuento otorgado.
        CASE
            WHEN dc.dc_hace_kardex = false
              OR COALESCE(fn.fn_valor_nota, 0) <> 0
              OR dc.dc_metodo_costo IN ('SIN_COSTO', 'SIN_PRECIO_COMPRA')
            THEN 0
            ELSE ROUND(dc.dc_total - (dc.dc_precio_compra * dc.dc_cantidad), 2)
        END AS utilidad_neta,
        CASE
            WHEN dc.dc_hace_kardex = false
              OR COALESCE(fn.fn_valor_nota, 0) <> 0
              OR dc.dc_metodo_costo IN ('SIN_COSTO', 'SIN_PRECIO_COMPRA')
            THEN 0
            WHEN dc.dc_precio_compra > 0 AND dc.dc_cantidad > 0
            THEN ROUND(((dc.dc_total - (dc.dc_precio_compra * dc.dc_cantidad)) / (dc.dc_precio_compra * dc.dc_cantidad)) * 100, 2)
            ELSE 0
        END AS porcentaje_utilidad,
        COALESCE(fn.fn_valor_nota, 0)  AS nota_credito,
        dc.dc_fecha_ult_compra,        -- fecha del kardex PPMP usado
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
