
-- Índice para búsquedas en cabecera de compras
CREATE INDEX idx_inv_cab_comp_inve_fecha ON inv_cab_comp_inve(fecha_trans_incci, ide_inepi);

-- Índice para relación cabecera-detalle de compras
CREATE INDEX idx_inv_det_comp_inve_cabecera ON inv_det_comp_inve(ide_incci);

-- Índice para búsqueda de precios por artículo
CREATE INDEX idx_inv_det_comp_inve_articulo ON inv_det_comp_inve(ide_inarti, precio_indci) WHERE precio_indci > 0;

-- Índice para tipo de transacción/comprobante
CREATE INDEX idx_inv_tip_tran_inve_tipo ON inv_tip_tran_inve(ide_intti, ide_intci);



-- Índice para búsqueda de facturas por fecha y empresa
CREATE INDEX idx_cxc_cabece_factura_fecha ON cxc_cabece_factura(fecha_emisi_cccfa, ide_empr, ide_ccefa);

-- Índice para relación cabecera-detalle de facturas
CREATE INDEX idx_cxc_deta_factura_cabecera ON cxc_deta_factura(ide_cccfa);

-- Índice para búsqueda de artículos en detalles de factura
CREATE INDEX idx_cxc_deta_factura_articulo ON cxc_deta_factura(ide_inarti);

-- Índice para búsqueda de notas de crédito por documento modificado
CREATE INDEX idx_cxp_cabecera_nota_doc_mod ON cxp_cabecera_nota(num_doc_mod_cpcno, fecha_emisi_cpcno);




-- Índices para tablas maestras (claves primarias generalmente ya están indexadas)
CREATE INDEX idx_inv_articulo_unidad ON inv_articulo(ide_inarti, ide_inuni, hace_kardex_inarti);

-- Índice para búsqueda de personas
CREATE INDEX idx_gen_persona_id ON gen_persona(ide_geper);

-- Índice para búsqueda de vendedores
CREATE INDEX idx_ven_vendedor_id ON ven_vendedor(ide_vgven);



-- Índice para búsqueda de secuenciales de factura (usado en notas de crédito)
CREATE INDEX idx_cxc_cabece_factura_secuencial ON cxc_cabece_factura(secuencial_cccfa);

-- Índice compuesto para consultas frecuentes en detalles de factura
CREATE INDEX idx_cxc_deta_factura_completo ON cxc_deta_factura(ide_cccfa, ide_inarti, cantidad_ccdfa, precio_ccdfa, total_ccdfa);


    -- Índices para mejorar los filtros y joins en inv_cab_comp_inve
CREATE INDEX idx_cab_fecha_inepi_intti
ON inv_cab_comp_inve (fecha_trans_incci, ide_inepi, ide_intti);

-- Índice para joins en inv_det_comp_inve por ide_incci y búsqueda por artículo
CREATE INDEX idx_det_incci_inarti_precio
ON inv_det_comp_inve (ide_incci, ide_inarti, precio_indci);

-- Índice para inv_tip_tran_inve para join con ide_intti
CREATE INDEX idx_tran_intti_intci
ON inv_tip_tran_inve (ide_intti, ide_intci);

-- Índice para inv_tip_comp_inve por signo y clave
CREATE INDEX idx_tip_comp_intci_signo
ON inv_tip_comp_inve (ide_intci, signo_intci);

-- Opcional: si haces muchos filtros por tipo de transacción específica
CREATE INDEX idx_cab_intti
ON inv_cab_comp_inve (ide_intti);

-- Si consultas frecuentemente por ide_inarti
CREATE INDEX idx_det_inarti
ON inv_det_comp_inve (ide_inarti);

-- Para acelerar el NOT IN final con ide_inarti
-- (en compras_periodo CTE)
CREATE INDEX idx_temp_compras_periodo_inarti
ON inv_det_comp_inve (ide_inarti);









--- version mejorada para precios de compra    
    
CREATE OR REPLACE FUNCTION f_utilidad_ventas(
    id_empresa BIGINT,
    fecha_inicio DATE,
    fecha_fin DATE,
    id_articulo BIGINT DEFAULT NULL  -- Parámetro opcional
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
    nombre_cndfp  VARCHAR(50),
    dias_cndfp BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH
    compras_periodo AS (
        SELECT
            d.ide_inarti,
            c.fecha_trans_incci,
            d.precio_indci,
            1 AS tiene_compras_en_periodo
        FROM inv_det_comp_inve d
        JOIN inv_cab_comp_inve c ON d.ide_incci = c.ide_incci
        JOIN inv_tip_tran_inve t ON c.ide_intti = t.ide_intti
        JOIN inv_tip_comp_inve e ON t.ide_intci = e.ide_intci
        WHERE
            c.ide_inepi = 1
            AND c.fecha_trans_incci BETWEEN (fecha_inicio - INTERVAL '5 days') AND (fecha_fin + INTERVAL '5 days')
            AND e.signo_intci = 1
            AND d.precio_indci > 0
            AND c.ide_intti IN (19, 16, 3025)
            AND (id_articulo IS NULL OR d.ide_inarti = id_articulo)
            AND c.ide_empr = id_empresa
    ),
    ultima_compra_fuera_periodo AS (
        SELECT DISTINCT ON (d.ide_inarti)
            d.ide_inarti,
            c.fecha_trans_incci,
            d.precio_indci,
            0 AS tiene_compras_en_periodo
        FROM inv_det_comp_inve d
        JOIN inv_cab_comp_inve c ON d.ide_incci = c.ide_incci
        JOIN inv_tip_tran_inve t ON c.ide_intti = t.ide_intti
        JOIN inv_tip_comp_inve e ON t.ide_intci = e.ide_intci
        WHERE
            c.ide_inepi = 1
            AND e.signo_intci = 1
            AND d.precio_indci > 0
            AND c.ide_intti IN (19, 16, 3025)
            AND c.fecha_trans_incci < (fecha_inicio - INTERVAL '5 days')
            AND (id_articulo IS NULL OR d.ide_inarti = id_articulo)
            AND c.ide_empr = id_empresa
        ORDER BY d.ide_inarti, c.fecha_trans_incci DESC
    ),
    precios_compra AS (
        SELECT * FROM compras_periodo
        UNION
        SELECT * FROM ultima_compra_fuera_periodo ucx
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
            -- Precio de compra mixto: primero antes de la venta, luego después si no hay
            COALESCE((
                SELECT pc.precio_indci
                FROM precios_compra pc
                WHERE pc.ide_inarti = cdf.ide_inarti
                  AND pc.fecha_trans_incci <= cf.fecha_emisi_cccfa
                ORDER BY pc.fecha_trans_incci DESC
                LIMIT 1
            ), (
                SELECT pc.precio_indci
                FROM precios_compra pc
                WHERE pc.ide_inarti = cdf.ide_inarti
                  AND pc.fecha_trans_incci > cf.fecha_emisi_cccfa
                  AND pc.fecha_trans_incci <= (cf.fecha_emisi_cccfa + INTERVAL '5 days')
                ORDER BY pc.fecha_trans_incci
                LIMIT 1
            ), 0) AS precio_compra,

            COALESCE((
                SELECT pc.fecha_trans_incci
                FROM precios_compra pc
                WHERE pc.ide_inarti = cdf.ide_inarti
                  AND pc.fecha_trans_incci <= cf.fecha_emisi_cccfa
                ORDER BY pc.fecha_trans_incci DESC
                LIMIT 1
            ), (
                SELECT pc.fecha_trans_incci
                FROM precios_compra pc
                WHERE pc.ide_inarti = cdf.ide_inarti
                  AND pc.fecha_trans_incci > cf.fecha_emisi_cccfa
                  AND pc.fecha_trans_incci <= (cf.fecha_emisi_cccfa + INTERVAL '5 days')
                ORDER BY pc.fecha_trans_incci
                LIMIT 1
            ), NULL) AS fecha_ultima_compra,

            cf.secuencial_cccfa AS numero_factura
        FROM cxc_deta_factura cdf
        JOIN cxc_cabece_factura cf ON cf.ide_cccfa = cdf.ide_cccfa
        JOIN inv_articulo iart ON iart.ide_inarti = cdf.ide_inarti
        JOIN gen_persona per ON cf.ide_geper = per.ide_geper
        LEFT JOIN ven_vendedor ven ON cf.ide_vgven = ven.ide_vgven
        LEFT JOIN inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
        left join con_deta_forma_pago  fp ON cf.ide_cndfp1 = fp.ide_cndfp

        WHERE
            cf.ide_ccefa = 0 -- 0 ESTADO NORMAL
            AND cf.fecha_emisi_cccfa BETWEEN fecha_inicio AND fecha_fin
            AND cf.ide_empr = id_empresa
            AND (id_articulo IS NULL OR cdf.ide_inarti = id_articulo)
    ),
    facturas_con_nota AS (
        SELECT 
            lpad(cf.secuencial_cccfa::text, 9, '0') AS secuencial_padded,
            cdn.ide_inarti,
            SUM(cdn.valor_cpdno) AS valor_nota_credito
        FROM cxp_cabecera_nota cn
        JOIN cxp_detalle_nota cdn ON cn.ide_cpcno = cdn.ide_cpcno
        JOIN cxc_cabece_factura cf ON cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
        WHERE cn.fecha_emisi_cpcno BETWEEN fecha_inicio AND fecha_fin
          AND cn.ide_cpeno = 1  -- 1 ESTADO NORMAL
          AND (id_articulo IS NULL OR cdn.ide_inarti = id_articulo)
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
        dc.precio_venta,
        dc.total_ccdfa,
        dc.nombre_vgven,
        dc.hace_kardex_inarti,
        dc.precio_compra,
        (dc.precio_venta - dc.precio_compra) AS utilidad,
        ROUND((dc.precio_venta - dc.precio_compra) * dc.cantidad_ccdfa, 2) AS utilidad_neta,
        CASE
            WHEN dc.precio_compra > 0 THEN ROUND(((dc.precio_venta - dc.precio_compra) / dc.precio_compra) * 100, 2)
            ELSE 0
        END AS porcentaje_utilidad,
        COALESCE(fn.valor_nota_credito, 0) AS nota_credito,
        dc.fecha_ultima_compra,
        dc.ide_cndfp::BIGINT,
        dc.nombre_cndfp,
        dc.dias_cndfp::BIGINT
    FROM datos_completos dc
    LEFT JOIN facturas_con_nota fn ON lpad(dc.numero_factura::text, 9, '0') = fn.secuencial_padded 
                                   AND dc.ide_inarti = fn.ide_inarti
    ORDER BY dc.fecha_emisi_cccfa DESC, dc.secuencial_cccfa;
END;
$$ LANGUAGE plpgsql;







-- SELECT * FROM f_utilidad_ventas (0,'2024-09-01', '2025-04-30',1704)
-- SELECT * FROM f_utilidad_ventas (0,'2025-01-01', '2025-01-31')
