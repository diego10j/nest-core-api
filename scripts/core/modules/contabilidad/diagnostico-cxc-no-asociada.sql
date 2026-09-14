-- ============================================================================
-- DIAGNÓSTICO Y LIMPIEZA — comprobantes duplicados generados por doble clic
-- en Mayorizar (Documentos por Pagar / Facturas de Venta / Notas de Crédito,
-- venta y costo). Aparecen en Contabilidad > Asientos Contables con Errores
-- con distintas observaciones ("CXC NO ASOCIADA A TRANSACCION", "CXP NO
-- ASOCIADA A TRANSACCION") porque el duplicado sobrante nunca queda enlazado
-- a ningún documento (cxp_cabece_factur / cxc_cabece_factura /
-- cxp_cabecera_nota), solo el primero que gana la carrera.
--
-- Caso confirmado 2026-09-14: factura de venta 000003460, comprobantes
-- 104612 y 104613 (mismo usuario, misma hora_ingre exacta) - cxc_cabece_
-- factura.ide_cnccc apunta a 104613; 104612 es el huérfano.
--
-- generarAsientoComprasCxP / generarAsientoFacturaCxC / generarAsientoCosto
-- Venta / generarAsientoNotaCredito / generarAsientoCostoNotaCredito ya
-- tienen desde esta fecha un guard atómico (reclamarEnlaceAsiento en
-- asientos-automaticos.service.ts) que anula automáticamente el duplicado
-- en el momento en que ocurre - este script es para limpiar lo YA generado
-- antes del fix.
--
-- Clave de duplicado: misma observación (texto determinístico, incluye el
-- número del documento) + mismo ide_geper (evita falsos positivos si una
-- compra y una venta coincidieran en el mismo número de documento).
--
-- AJUSTAR en la sección "automaticos" (aparece 2 veces, dejarlas iguales):
--   - ide_sucu = 0                              (sucursal a revisar)
--   - rango de fecha_ingre (por defecto: mes actual)
-- ============================================================================

-- ── 1. Diagnóstico (solo lectura) ───────────────────────────────────────────
WITH automaticos AS (
    SELECT a.ide_cnccc, a.numero_cnccc, a.observacion_cnccc, a.ide_geper,
           a.fecha_trans_cnccc, a.fecha_ingre, a.hora_ingre, a.usuario_ingre
    FROM con_cab_comp_cont a
    WHERE a.automatico_cnccc = true
      AND a.ide_cneco = 0
      AND a.ide_sucu = 0                                            -- <-- AJUSTAR
      AND a.fecha_ingre >= date_trunc('month', CURRENT_DATE)::date  -- <-- AJUSTAR (mes actual)
      AND a.fecha_ingre <  (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
      AND (
            a.observacion_cnccc LIKE 'V/. FACTURA N.%'
         OR a.observacion_cnccc LIKE 'V/. NOTA DE CREDITO N%'
         OR a.observacion_cnccc LIKE 'V/. COSTO FACTURA N.%'
         OR a.observacion_cnccc LIKE 'V/. COSTO NOTA DE CREDITO N%'
      )
),
duplicados AS (
    SELECT observacion_cnccc, ide_geper
    FROM automaticos
    GROUP BY observacion_cnccc, ide_geper
    HAVING COUNT(*) > 1
),
clasificado AS (
    SELECT au.*,
        (
             EXISTS (SELECT 1 FROM cxp_cabece_factur f WHERE f.ide_cnccc = au.ide_cnccc)
          OR EXISTS (SELECT 1 FROM cxc_cabece_factura f WHERE f.ide_cnccc = au.ide_cnccc OR f.ide_cnccc_costo = au.ide_cnccc)
          OR EXISTS (SELECT 1 FROM cxp_cabecera_nota n WHERE n.ide_cnccc = au.ide_cnccc OR n.ide_cnccc_costo = au.ide_cnccc)
        ) AS esta_enlazado
    FROM automaticos au
    INNER JOIN duplicados d
        ON d.observacion_cnccc = au.observacion_cnccc AND d.ide_geper = au.ide_geper
)
SELECT ide_cnccc, numero_cnccc, observacion_cnccc, ide_geper,
       fecha_trans_cnccc, fecha_ingre, hora_ingre, usuario_ingre,
       CASE WHEN esta_enlazado THEN 'ENLAZADO (no tocar)' ELSE 'HUERFANO -> anular' END AS estado
FROM clasificado
ORDER BY observacion_cnccc, ide_geper, ide_cnccc;

-- ── 2. Resumen ───────────────────────────────────────────────────────────
-- (misma lógica de arriba, agregada) - revisar que "ENLAZADO" tenga
-- exactamente 1 por grupo y el resto sea "HUERFANO" antes de pasar al punto 3.
WITH automaticos AS (
    SELECT a.ide_cnccc, a.observacion_cnccc, a.ide_geper
    FROM con_cab_comp_cont a
    WHERE a.automatico_cnccc = true
      AND a.ide_cneco = 0
      AND a.ide_sucu = 0                                            -- <-- AJUSTAR
      AND a.fecha_ingre >= date_trunc('month', CURRENT_DATE)::date  -- <-- AJUSTAR
      AND a.fecha_ingre <  (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
      AND (
            a.observacion_cnccc LIKE 'V/. FACTURA N.%'
         OR a.observacion_cnccc LIKE 'V/. NOTA DE CREDITO N%'
         OR a.observacion_cnccc LIKE 'V/. COSTO FACTURA N.%'
         OR a.observacion_cnccc LIKE 'V/. COSTO NOTA DE CREDITO N%'
      )
),
duplicados AS (
    SELECT observacion_cnccc, ide_geper
    FROM automaticos
    GROUP BY observacion_cnccc, ide_geper
    HAVING COUNT(*) > 1
)
SELECT
    CASE WHEN (
             EXISTS (SELECT 1 FROM cxp_cabece_factur f WHERE f.ide_cnccc = au.ide_cnccc)
          OR EXISTS (SELECT 1 FROM cxc_cabece_factura f WHERE f.ide_cnccc = au.ide_cnccc OR f.ide_cnccc_costo = au.ide_cnccc)
          OR EXISTS (SELECT 1 FROM cxp_cabecera_nota n WHERE n.ide_cnccc = au.ide_cnccc OR n.ide_cnccc_costo = au.ide_cnccc)
         ) THEN 'ENLAZADO' ELSE 'HUERFANO -> anular' END AS estado,
    COUNT(*) AS cantidad
FROM automaticos au
INNER JOIN duplicados d ON d.observacion_cnccc = au.observacion_cnccc AND d.ide_geper = au.ide_geper
GROUP BY 1;

-- ============================================================================
-- 3. LIMPIEZA: anula (ide_cneco = ANULADO, NO delete) todos los huérfanos
-- detectados arriba - mismo mecanismo que ComprobanteContabilidadService.anular
-- (Editar comprobante > Anular). Revisar el punto 1/2 primero; el UPDATE queda
-- en transacción para poder hacer ROLLBACK si el conteo no cuadra.
-- ============================================================================
BEGIN;

WITH automaticos AS (
    SELECT a.ide_cnccc, a.observacion_cnccc, a.ide_geper
    FROM con_cab_comp_cont a
    WHERE a.automatico_cnccc = true
      AND a.ide_cneco = 0
      AND a.ide_sucu = 0                                            -- <-- AJUSTAR (igual que arriba)
      AND a.fecha_ingre >= date_trunc('month', CURRENT_DATE)::date  -- <-- AJUSTAR (igual que arriba)
      AND a.fecha_ingre <  (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
      AND (
            a.observacion_cnccc LIKE 'V/. FACTURA N.%'
         OR a.observacion_cnccc LIKE 'V/. NOTA DE CREDITO N%'
         OR a.observacion_cnccc LIKE 'V/. COSTO FACTURA N.%'
         OR a.observacion_cnccc LIKE 'V/. COSTO NOTA DE CREDITO N%'
      )
),
duplicados AS (
    SELECT observacion_cnccc, ide_geper
    FROM automaticos
    GROUP BY observacion_cnccc, ide_geper
    HAVING COUNT(*) > 1
),
huerfanos AS (
    SELECT au.ide_cnccc
    FROM automaticos au
    INNER JOIN duplicados d ON d.observacion_cnccc = au.observacion_cnccc AND d.ide_geper = au.ide_geper
    WHERE NOT (
             EXISTS (SELECT 1 FROM cxp_cabece_factur f WHERE f.ide_cnccc = au.ide_cnccc)
          OR EXISTS (SELECT 1 FROM cxc_cabece_factura f WHERE f.ide_cnccc = au.ide_cnccc OR f.ide_cnccc_costo = au.ide_cnccc)
          OR EXISTS (SELECT 1 FROM cxp_cabecera_nota n WHERE n.ide_cnccc = au.ide_cnccc OR n.ide_cnccc_costo = au.ide_cnccc)
    )
)
UPDATE con_cab_comp_cont
SET ide_cneco     = (SELECT ide_cneco FROM con_estado_compro WHERE UPPER(nombre_cneco) LIKE 'ANULADO%' LIMIT 1),
    usuario_actua = 'limpieza_duplicados_mayorizar',
    fecha_actua   = CURRENT_DATE,
    hora_actua    = CURRENT_TIME
WHERE ide_cnccc IN (SELECT ide_cnccc FROM huerfanos);

-- Verificar que el número de filas afectadas (arriba, "UPDATE N") coincide con
-- "cantidad" de HUERFANO en el punto 2. Si coincide:
COMMIT;
-- Si no coincide o algo se ve raro, en vez de COMMIT correr:
-- ROLLBACK;
