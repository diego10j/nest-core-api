-- ============================================================================
-- DIAGNÓSTICO Y FIX — cxp_cabece_transa con ide_empr / ide_sucu en NULL (o
-- distintos a los de su propio detalle cxp_detall_transa).
--
-- Mismo problema encontrado y corregido 2026-09-22 en CxC (ver
-- scripts/core/modules/ventas/clientes/fix-cxc-cabece-transa-empr-sucu-null.sql
-- y ProveedorService.getSaldo, que filtraba por ct.ide_empr de la cabecera y
-- por eso excluía en silencio las cabeceras con ide_empr NULL). Este script
-- es el mismo análisis aplicado a Cuentas por Pagar (cxp_cabece_transa /
-- cxp_detall_transa) para confirmar si le pasa lo mismo con algún proveedor.
--
-- Regla de negocio: ide_empr/ide_sucu de la cabecera SIEMPRE deben coincidir
-- con los de sus detalles.
-- ============================================================================

-- ── 1. Diagnóstico (solo lectura): cuántas cabeceras están afectadas ────────
WITH detalle_agregado AS (
    SELECT
        ide_cpctr,
        COUNT(DISTINCT ide_empr) AS n_empr_distintos,
        COUNT(DISTINCT ide_sucu) AS n_sucu_distintos,
        MAX(ide_empr) AS ide_empr_detalle,  -- válido solo si n_empr_distintos = 1
        MAX(ide_sucu) AS ide_sucu_detalle,  -- válido solo si n_sucu_distintos = 1
        MAX(fecha_trans_cpdtr) AS ultima_fecha_detalle
    FROM cxp_detall_transa
    WHERE ide_cpctr IS NOT NULL
    GROUP BY ide_cpctr
)
SELECT
    ct.ide_cpctr,
    ct.ide_geper,
    ct.observacion_cpctr,
    ct.fecha_trans_cpctr,
    ct.ide_empr AS empr_cabecera,
    da.ide_empr_detalle,
    ct.ide_sucu AS sucu_cabecera,
    da.ide_sucu_detalle,
    da.n_empr_distintos,
    da.n_sucu_distintos,
    da.ultima_fecha_detalle,
    CASE
        WHEN da.n_empr_distintos > 1 OR da.n_sucu_distintos > 1
            THEN 'CONFLICTO EN DETALLE -> revisar a mano'
        WHEN ct.ide_empr IS NULL OR ct.ide_sucu IS NULL
            THEN 'NULL EN CABECERA -> auto-fix seguro'
        WHEN ct.ide_empr IS DISTINCT FROM da.ide_empr_detalle
          OR ct.ide_sucu IS DISTINCT FROM da.ide_sucu_detalle
            THEN 'CABECERA DISTINTA AL DETALLE -> auto-fix seguro'
        ELSE 'OK'
    END AS estado
FROM cxp_cabece_transa ct
INNER JOIN detalle_agregado da ON da.ide_cpctr = ct.ide_cpctr
WHERE da.n_empr_distintos > 1 OR da.n_sucu_distintos > 1
   OR ct.ide_empr IS NULL OR ct.ide_sucu IS NULL
   OR ct.ide_empr IS DISTINCT FROM da.ide_empr_detalle
   OR ct.ide_sucu IS DISTINCT FROM da.ide_sucu_detalle
ORDER BY ct.fecha_trans_cpctr DESC;

-- ── 2. Resumen por mes + señal de "¿sigue pasando desde el ERP hoy?" ───────
-- Igual que en CxC: si aparecen meses recientes, el problema sigue vivo hoy.
WITH detalle_agregado AS (
    SELECT
        ide_cpctr,
        COUNT(DISTINCT ide_empr) AS n_empr_distintos,
        COUNT(DISTINCT ide_sucu) AS n_sucu_distintos,
        MAX(ide_empr) AS ide_empr_detalle,
        MAX(ide_sucu) AS ide_sucu_detalle
    FROM cxp_detall_transa
    WHERE ide_cpctr IS NOT NULL
    GROUP BY ide_cpctr
)
SELECT
    TO_CHAR(ct.fecha_trans_cpctr, 'YYYY-MM') AS mes_cabecera,
    COUNT(*) AS cabeceras_afectadas,
    COUNT(*) FILTER (WHERE ct.ide_empr IS NULL OR ct.ide_sucu IS NULL) AS con_null,
    COUNT(*) FILTER (WHERE da.n_empr_distintos > 1 OR da.n_sucu_distintos > 1) AS con_conflicto_en_detalle
FROM cxp_cabece_transa ct
INNER JOIN detalle_agregado da ON da.ide_cpctr = ct.ide_cpctr
WHERE da.n_empr_distintos > 1 OR da.n_sucu_distintos > 1
   OR ct.ide_empr IS NULL OR ct.ide_sucu IS NULL
   OR ct.ide_empr IS DISTINCT FROM da.ide_empr_detalle
   OR ct.ide_sucu IS DISTINCT FROM da.ide_sucu_detalle
GROUP BY 1
ORDER BY 1 DESC;

-- ── 2b. Forense: ¿quién/qué generó las cabeceras afectadas? ────────────────
-- Si sale un único usuario_ingre técnico (bot/import), es un flujo puntual.
-- Si salen muchos usuarios distintos, el bug estaba en el flujo compartido de
-- guardado de compras (mismo patrón que en CxC: FacturasSaveService-equivalente
-- de Compras armando el INSERT de cxp_cabece_transa sin ide_empr/ide_sucu).
WITH detalle_agregado AS (
    SELECT
        ide_cpctr,
        COUNT(DISTINCT ide_empr) AS n_empr_distintos,
        COUNT(DISTINCT ide_sucu) AS n_sucu_distintos
    FROM cxp_detall_transa
    WHERE ide_cpctr IS NOT NULL
    GROUP BY ide_cpctr
)
SELECT ct.usuario_ingre, COUNT(*) AS cantidad, MIN(ct.fecha_ingre) AS primera, MAX(ct.fecha_ingre) AS ultima
FROM cxp_cabece_transa ct
INNER JOIN detalle_agregado da ON da.ide_cpctr = ct.ide_cpctr
WHERE ct.ide_empr IS NULL OR ct.ide_sucu IS NULL
GROUP BY ct.usuario_ingre
ORDER BY cantidad DESC;

-- ============================================================================
-- 3. FIX: backfill de cabeceras donde el detalle es inequívoco (n_empr_
-- distintos = 1 y n_sucu_distintos = 1). Las filas "CONFLICTO EN DETALLE" del
-- paso 1 NO se tocan acá - requieren revisión manual. Revisar también si
-- alguna fila "CABECERA DISTINTA AL DETALLE" tiene un ide_empr/ide_sucu que
-- no encaje con el resto del sistema (ver nota del caso ide_ccctr=36666 en el
-- script de CxC) antes de confiar en el backfill automático.
-- ============================================================================
BEGIN;

WITH detalle_agregado AS (
    SELECT
        ide_cpctr,
        COUNT(DISTINCT ide_empr) AS n_empr_distintos,
        COUNT(DISTINCT ide_sucu) AS n_sucu_distintos,
        MAX(ide_empr) AS ide_empr_detalle,
        MAX(ide_sucu) AS ide_sucu_detalle
    FROM cxp_detall_transa
    WHERE ide_cpctr IS NOT NULL
    GROUP BY ide_cpctr
),
a_corregir AS (
    SELECT ct.ide_cpctr, da.ide_empr_detalle, da.ide_sucu_detalle
    FROM cxp_cabece_transa ct
    INNER JOIN detalle_agregado da ON da.ide_cpctr = ct.ide_cpctr
    WHERE da.n_empr_distintos = 1 AND da.n_sucu_distintos = 1
      AND (
            ct.ide_empr IS DISTINCT FROM da.ide_empr_detalle
         OR ct.ide_sucu IS DISTINCT FROM da.ide_sucu_detalle
      )
)
UPDATE cxp_cabece_transa ct
SET ide_empr     = a.ide_empr_detalle,
    ide_sucu     = a.ide_sucu_detalle,
    usuario_actua = 'fix_cxp_cabece_transa_empr_sucu_null',
    fecha_actua   = CURRENT_DATE,
    hora_actua    = CURRENT_TIME
FROM a_corregir a
WHERE ct.ide_cpctr = a.ide_cpctr;

-- Verificar que el número de filas afectadas ("UPDATE N") coincide con el
-- total del paso 2 menos "con_conflicto_en_detalle". Si coincide:
COMMIT;
-- Si no coincide o algo se ve raro, en vez de COMMIT correr:
-- ROLLBACK;

-- ============================================================================
-- 4. GUARDRAIL definitivo — mismo razonamiento que el paso 5 del script de
-- CxC (fix-cxc-cabece-transa-empr-sucu-null.sql). Confirmar 0 filas NULL
-- antes de aplicar el ALTER:
--   SELECT COUNT(*) FROM cxp_cabece_transa WHERE ide_empr IS NULL OR ide_sucu IS NULL;
-- Revisé los inserts de cxp_cabece_transa en el código (CxpTransaccionesSaveService
-- y el flujo de compras equivalente a FacturasSaveService) - si todos pasan por
-- InsertQuery/incluyen ide_empr,ide_sucu explícitos igual que en CxC, este NOT
-- NULL no debería romper nada; si algún insert de compras arma la cabecera sin
-- esos campos, el ALTER lo va a hacer fallar de inmediato (que es lo que
-- queremos: error visible ya, no un dato corrupto que se nota semanas después).
ALTER TABLE cxp_cabece_transa
    ALTER COLUMN ide_empr SET NOT NULL,
    ALTER COLUMN ide_sucu SET NOT NULL;
