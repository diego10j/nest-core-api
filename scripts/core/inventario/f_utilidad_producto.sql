CREATE OR REPLACE FUNCTION f_utilidad_producto(
    id_empresa BIGINT,
    id BIGINT, 
    fecha_inicio DATE,
    fecha_fin DATE
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
    fecha_ultima_compra DATE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        uv.ide_ccdfa,
        uv.ide_inarti,
        uv.fecha_emisi_cccfa,
        uv.secuencial_cccfa,
        uv.nom_geper,
        uv.nombre_inarti,
        uv.cantidad_ccdfa,
        uv.siglas_inuni,
        uv.precio_venta,
        uv.total_ccdfa,
        uv.nombre_vgven,
        uv.hace_kardex_inarti,
        uv.precio_compra,
        uv.utilidad,
        uv.utilidad_neta,
        uv.porcentaje_utilidad,
        uv.nota_credito,
        uv.fecha_ultima_compra
    FROM f_utilidad_ventas(id_empresa,fecha_inicio, fecha_fin, id) uv;
END;
$$ LANGUAGE plpgsql;


--  SELECT * FROM f_utilidad_producto (0, 1704,'2025-04-01', '2025-04-30')


