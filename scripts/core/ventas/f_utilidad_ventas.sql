

CREATE OR REPLACE FUNCTION Utilidad_en_Ventas(
    fecha_inicio DATE,
    fecha_fin DATE
)
RETURNS TABLE (
    ide_inarti BIGINT,
    ide_ccdfa BIGINT,
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
    nota_credito BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    WITH
        precios_compra AS (
            SELECT
                d.ide_inarti,
                c.fecha_trans_incci AS fecha_emisi_cpcfa,
                precio_indci AS precio_cpdfa
            FROM
                inv_det_comp_inve d
                INNER JOIN inv_cab_comp_inve c ON d.ide_incci = c.ide_incci
                INNER JOIN inv_tip_tran_inve t ON c.ide_intti = t.ide_intti
                INNER JOIN inv_tip_comp_inve e ON t.ide_intci = e.ide_intci
            WHERE
                c.ide_inepi = 1
                AND c.fecha_trans_incci <= (fecha_fin + INTERVAL '3 days')
                AND signo_intci = 1
                AND precio_indci > 0
				and c.ide_intti in (19,16, 3025)   --Compra, Orden de Producción, Saldo inicial,Otros ingresos ( + )
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
                COALESCE(
                    (
                        SELECT
                            pc.precio_cpdfa
                        FROM
                            precios_compra pc
                        WHERE
                            pc.ide_inarti = cdf.ide_inarti
                            AND pc.fecha_emisi_cpcfa <= cf.fecha_emisi_cccfa 
                        ORDER BY
                            pc.fecha_emisi_cpcfa DESC
                        LIMIT
                            1
                    ),
                    0
                ) AS PRECIO_COMPRA,
                cf.secuencial_cccfa AS numero_factura
            FROM
                cxc_deta_factura cdf
                INNER JOIN cxc_cabece_factura cf ON cf.ide_cccfa = cdf.ide_cccfa
                INNER JOIN inv_articulo iart ON iart.ide_inarti = cdf.ide_inarti
                INNER JOIN gen_persona per on cf.ide_geper = per.ide_geper
                LEFT JOIN ven_vendedor ven ON cf.ide_vgven = ven.ide_vgven
                LEFT JOIN inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
            WHERE
                cf.ide_ccefa = 0
                AND cf.fecha_emisi_cccfa BETWEEN fecha_inicio AND fecha_fin
                AND cf.ide_empr = 0
        ),
        facturas_con_nota AS (
            SELECT 
                lpad(cf.secuencial_cccfa::text, 9, '0') AS secuencial_padded,
                TRUE AS tiene_nota_credito
            FROM 
                cxc_cabece_factura cf
            WHERE 
                EXISTS (
                    SELECT 1 
                    FROM cxp_cabecera_nota cn 
                    WHERE cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
                    AND cn.fecha_emisi_cpcno BETWEEN fecha_inicio AND fecha_fin
                )
        )
    SELECT
        dc.ide_inarti,
        dc.ide_ccdfa,
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
        COALESCE(fn.tiene_nota_credito, FALSE) AS nota_credito
    FROM
        datos_completos dc
        LEFT JOIN facturas_con_nota fn ON lpad(dc.numero_factura::text, 9, '0') = fn.secuencial_padded
    ORDER BY
        dc.fecha_emisi_cccfa DESC,
        dc.secuencial_cccfa;
END;
$$ LANGUAGE plpgsql;



--  SELECT * FROM Utilidad_en_Ventas('2024-09-01', '2024-09-30');



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