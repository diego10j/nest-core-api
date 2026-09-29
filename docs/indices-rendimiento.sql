-- Índices recomendados para los dashboards nuevos (Clientes por ubicación, Facturas por provincia,
-- Análisis de inventario, Control de stock y Archivos cargados).
--
-- 1) ANTES de crear nada, ver qué índices ya existen (para no duplicar):
--
--    SELECT tablename, indexname, indexdef
--      FROM pg_indexes
--     WHERE schemaname = 'public'
--       AND tablename IN ('cxc_cabece_factura', 'cxc_transporte_factura', 'gen_persona', 'gen_direccion_persona',
--                         'inv_kardex_ppmp', 'inv_cab_comp_inve', 'inv_det_comp_inve', 'inv_articulo',
--                         'sis_archivo', 'bdt_documento', 'ven_tarifa_transporte')
--     ORDER BY tablename, indexname;
--
-- 2) Cada CREATE INDEX usa CONCURRENTLY (no bloquea las ventas en curso). No se puede ejecutar dentro de una
--    transacción: correr una sentencia por vez (psql / DBeaver en modo auto-commit).
--
-- 3) Después de crearlos:  ANALYZE <tabla>;   y comparar con EXPLAIN (ANALYZE, BUFFERS) la consulta lenta.

-- ── Facturas ─────────────────────────────────────────────────────────────────────────────────────
-- Casi todo el BI de ventas filtra por empresa + sucursal + estado + rango de fechas y luego agrupa por cliente.
-- INCLUDE permite resolver clientes-ubicación y facturas-por-provincia con "index only scan" (sin ir a la tabla).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cxc_cabece_factura_bi
    ON cxc_cabece_factura (ide_empr, ide_sucu, ide_ccefa, fecha_emisi_cccfa)
    INCLUDE (ide_geper, total_cccfa, base_grabada_cccfa, base_tarifa0_cccfa, base_no_objeto_iva_cccfa);

-- Resumen diario por punto de emisión y "última compra" de un cliente.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cxc_cabece_factura_ptoemi_fecha
    ON cxc_cabece_factura (ide_ccdaf, fecha_emisi_cccfa);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cxc_cabece_factura_geper
    ON cxc_cabece_factura (ide_geper, fecha_emisi_cccfa);

-- Proformas convertidas: el resumen y el análisis de proformas buscan las facturas por el secuencial de la proforma.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cxc_cabece_factura_num_proforma
    ON cxc_cabece_factura (num_proforma_cccfa)
    WHERE num_proforma_cccfa IS NOT NULL;

-- Envíos de la factura (mirada de transportes).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cxc_transporte_factura_cccfa
    ON cxc_transporte_factura (ide_cccfa);

-- Proformas: filtro por empresa, sucursal y fecha (resumen diario y análisis de proformas).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cxc_cabece_proforma_fecha
    ON cxc_cabece_proforma (ide_empr, ide_sucu, fecha_cccpr)
    INCLUDE (secuencial_cccpr, total_cccpr, anulado_cccpr);

-- ── Clientes y direcciones ───────────────────────────────────────────────────────────────────────
-- Listado de clientes activos de la empresa (índice parcial: solo los que son cliente).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gen_persona_clientes
    ON gen_persona (ide_empr, ide_geper)
    WHERE es_cliente_geper = TRUE;

-- Dirección activa más reciente / predeterminada de cada cliente (LATERAL y agregado de GPS).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gen_direccion_persona_geper
    ON gen_direccion_persona (ide_geper, defecto_gedirp DESC, ide_gedirp DESC);

-- ── Kardex e inventario ──────────────────────────────────────────────────────────────────────────
-- Es la tabla más pesada del dashboard de inventario: LAG por producto ordenado por fecha, "último movimiento"
-- (DISTINCT ON) y saldos. El orden del índice coincide con PARTITION BY / ORDER BY de esas consultas.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inv_kardex_ppmp_art_fecha
    ON inv_kardex_ppmp (ide_empr, ide_sucu, ide_inarti, fecha_mov, orden_mov)
    INCLUDE (saldo_cantidad, saldo_valor, costo_promedio, cantidad, signo, ide_incci);

-- Movimientos por comprobante (control de stock: saldo, última salida y salidas de 90 días).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inv_cab_comp_inve_bi
    ON inv_cab_comp_inve (ide_empr, ide_sucu, ide_inepi, fecha_trans_incci)
    INCLUDE (ide_intti, ide_inbod);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inv_det_comp_inve_cab
    ON inv_det_comp_inve (ide_incci)
    INCLUDE (ide_inarti, cantidad_indci);

-- Productos de inventario que se listan (activos, hijos, con kardex).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inv_articulo_inventario
    ON inv_articulo (ide_empr, ide_incate)
    WHERE nivel_inarti = 'HIJO' AND hace_kardex_inarti = TRUE;

-- ── Archivos cargados (base técnica) ─────────────────────────────────────────────────────────────
-- Recorrido recursivo del árbol de carpetas y archivos de cada producto.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sis_archivo_padre
    ON sis_archivo (sis_ide_arch);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sis_archivo_producto
    ON sis_archivo (ide_empr, ide_inarti)
    WHERE sis_ide_arch IS NULL AND ide_inarti IS NOT NULL;
-- (bdt_documento ya tiene idx_bdt_doc_uuid sobre uuid_origen_bddoc en scripts/base_tecnica_masivo.sql.)

-- ── Tarifas de transporte ────────────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ven_tarifa_transporte_prov
    ON ven_tarifa_transporte (ide_empr, ide_geprov);
