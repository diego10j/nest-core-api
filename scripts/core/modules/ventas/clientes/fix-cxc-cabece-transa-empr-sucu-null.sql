-- ============================================================================
-- DIAGNÓSTICO Y FIX — cxc_cabece_transa con ide_empr / ide_sucu en NULL (o
-- distintos a los de su propio detalle cxc_detall_transa).
--
-- Encontrado 2026-09-22 comparando ClientesService.getSaldo (filtra por
-- ct.ide_empr, cabecera) contra ClientesService.getTrnCliente (filtra por
-- dt.ide_empr, detalle): para el cliente AGHEMOR (ide_geper=14753) el saldo
-- no cuadraba en 0.01 porque 3 grupos factura/pago/retención (facturas
-- 000002325, 000002455, 000002843, jun-jul 2026) tenían su cxc_cabece_transa
-- con ide_empr/ide_sucu = NULL, así que `ct.ide_empr = $ideEmpr` los excluía
-- en silencio de la suma (NULL = x nunca es true).
--
-- Regla de negocio (confirmada con el usuario): ide_empr/ide_sucu de la
-- cabecera SIEMPRE deben coincidir con los de sus detalles - no hay caso de
-- negocio legítimo donde difieran. getSaldo ya se corrigió para tolerar el
-- NULL con COALESCE(ct.ide_empr, dt.ide_empr) (ver clientes.service.ts), pero
-- eso es un parche en la consulta - este script corrige el dato en la fuente
-- para que cualquier otra query que confíe en ct.ide_empr/ct.ide_sucu (hay
-- varias en el módulo, y el mismo patrón existe en CxP) deje de tener este
-- problema.
--
-- AJUSTAR antes de correr: ninguno de los 3 pasos necesita parámetros; el
-- paso 3 es genérico (backfilla cualquier cabecera CxC afectada, no solo la
-- del cliente 14753).
-- ============================================================================

-- ── 1. Diagnóstico (solo lectura): cuántas cabeceras están afectadas ────────
-- "afectada" = ide_empr o ide_sucu en NULL, O el valor de la cabecera no
-- coincide con el (único) valor que reportan sus detalles.
WITH detalle_agregado AS (
    SELECT
        ide_ccctr,
        COUNT(DISTINCT ide_empr) AS n_empr_distintos,
        COUNT(DISTINCT ide_sucu) AS n_sucu_distintos,
        MAX(ide_empr) AS ide_empr_detalle,  -- válido solo si n_empr_distintos = 1
        MAX(ide_sucu) AS ide_sucu_detalle,  -- válido solo si n_sucu_distintos = 1
        MIN(fecha_trans_ccdtr) AS primera_fecha_detalle,
        MAX(fecha_trans_ccdtr) AS ultima_fecha_detalle
    FROM cxc_detall_transa
    WHERE ide_ccctr IS NOT NULL
    GROUP BY ide_ccctr
)
SELECT
    ct.ide_ccctr,
    ct.ide_geper,
    ct.observacion_ccctr,
    ct.fecha_trans_ccctr,
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
FROM cxc_cabece_transa ct
INNER JOIN detalle_agregado da ON da.ide_ccctr = ct.ide_ccctr
WHERE da.n_empr_distintos > 1 OR da.n_sucu_distintos > 1
   OR ct.ide_empr IS NULL OR ct.ide_sucu IS NULL
   OR ct.ide_empr IS DISTINCT FROM da.ide_empr_detalle
   OR ct.ide_sucu IS DISTINCT FROM da.ide_sucu_detalle
ORDER BY ct.fecha_trans_ccctr DESC;

-- ── 2. Resumen + señal de "¿sigue pasando desde el ERP hoy?" ───────────────
-- Si "mes_ultima_fecha_detalle" incluye meses recientes (el actual o el
-- anterior), el problema sigue ocurriendo en inserciones nuevas y hay que
-- revisar el flujo de guardado (FacturasSaveService.buildInsertTrnCabecera /
-- NotasCreditoSaveService, que dependen de que dtoIn.ideEmpr/ideSucu vengan
-- poblados desde el request - probablemente un caller que arma el dtoIn sin
-- pasar por el controller/@AppHeaders normal, ej. un job o un flujo interno).
-- Si todo cae en meses viejos y ninguno reciente, es un problema histórico
-- ya cerrado y basta con el backfill del paso 3.
WITH detalle_agregado AS (
    SELECT
        ide_ccctr,
        COUNT(DISTINCT ide_empr) AS n_empr_distintos,
        COUNT(DISTINCT ide_sucu) AS n_sucu_distintos,
        MAX(ide_empr) AS ide_empr_detalle,
        MAX(ide_sucu) AS ide_sucu_detalle,
        MAX(fecha_trans_ccdtr) AS ultima_fecha_detalle
    FROM cxc_detall_transa
    WHERE ide_ccctr IS NOT NULL
    GROUP BY ide_ccctr
)
SELECT
    TO_CHAR(ct.fecha_trans_ccctr, 'YYYY-MM') AS mes_cabecera,
    COUNT(*) AS cabeceras_afectadas,
    COUNT(*) FILTER (WHERE ct.ide_empr IS NULL OR ct.ide_sucu IS NULL) AS con_null,
    COUNT(*) FILTER (WHERE da.n_empr_distintos > 1 OR da.n_sucu_distintos > 1) AS con_conflicto_en_detalle
FROM cxc_cabece_transa ct
INNER JOIN detalle_agregado da ON da.ide_ccctr = ct.ide_ccctr
WHERE da.n_empr_distintos > 1 OR da.n_sucu_distintos > 1
   OR ct.ide_empr IS NULL OR ct.ide_sucu IS NULL
   OR ct.ide_empr IS DISTINCT FROM da.ide_empr_detalle
   OR ct.ide_sucu IS DISTINCT FROM da.ide_sucu_detalle
GROUP BY 1
ORDER BY 1 DESC;

-- ============================================================================
-- 3. FIX: backfill de cabeceras donde el detalle es inequívoco (n_empr_
-- distintos = 1 y n_sucu_distintos = 1). Las filas "CONFLICTO EN DETALLE" del
-- paso 1 NO se tocan acá - requieren revisión manual porque no hay un único
-- valor correcto que copiar. Reversible/idempotente: correrlo de nuevo cuando
-- no queden filas para corregir es un no-op.
-- ============================================================================
BEGIN;

WITH detalle_agregado AS (
    SELECT
        ide_ccctr,
        COUNT(DISTINCT ide_empr) AS n_empr_distintos,
        COUNT(DISTINCT ide_sucu) AS n_sucu_distintos,
        MAX(ide_empr) AS ide_empr_detalle,
        MAX(ide_sucu) AS ide_sucu_detalle
    FROM cxc_detall_transa
    WHERE ide_ccctr IS NOT NULL
    GROUP BY ide_ccctr
),
a_corregir AS (
    SELECT ct.ide_ccctr, da.ide_empr_detalle, da.ide_sucu_detalle
    FROM cxc_cabece_transa ct
    INNER JOIN detalle_agregado da ON da.ide_ccctr = ct.ide_ccctr
    WHERE da.n_empr_distintos = 1 AND da.n_sucu_distintos = 1
      AND (
            ct.ide_empr IS DISTINCT FROM da.ide_empr_detalle
         OR ct.ide_sucu IS DISTINCT FROM da.ide_sucu_detalle
      )
)
UPDATE cxc_cabece_transa ct
SET ide_empr     = a.ide_empr_detalle,
    ide_sucu     = a.ide_sucu_detalle,
    usuario_actua = 'fix_cxc_cabece_transa_empr_sucu_null',
    fecha_actua   = CURRENT_DATE,
    hora_actua    = CURRENT_TIME
FROM a_corregir a
WHERE ct.ide_ccctr = a.ide_ccctr;

-- Verificar que el número de filas afectadas ("UPDATE N") coincide con el
-- total del paso 2 menos "con_conflicto_en_detalle". Si coincide:
COMMIT;
-- Si no coincide o algo se ve raro, en vez de COMMIT correr:
-- ROLLBACK;

-- ============================================================================
-- 4. FORENSE (post-fix) — ¿quién/qué generó las cabeceras que quedaron NULL?
-- El backfill del paso 3 solo tocó usuario_actua/fecha_actua/hora_actua, así
-- que usuario_ingre/fecha_ingre originales siguen intactos y sirven para
-- identificar el origen. Corrido 2026-09-22: 838 filas NULL, TODAS con
-- fecha_trans_ccctr entre 2026-06-12 y 2026-07-22, CERO en agosto o
-- septiembre 2026 - el problema no está activo hoy, quedó acotado a esa
-- ventana. Se revisaron los 4 flujos que insertan cxc_cabece_transa
-- (FacturasSaveService.buildInsertTrnCabecera, NotasCreditoSaveService y los
-- 2 casos de "saldo a favor" en CxcTransaccionesSaveService) y todos usan la
-- clase InsertQuery, que agrega ide_empr/ide_sucu automáticamente desde
-- dtoIn.ideEmpr/ideSucu (ver insert-query.ts) - o los agregan explícitos en
-- el INSERT crudo. No se encontró ningún camino de código que inserte sin
-- esos campos, así que el forense de abajo es para confirmar (no se pudo
-- correr sin acceso a la BD) si esas 838 filas comparten un único
-- usuario_ingre/origen puntual (ej. una migración o importación de datos de
-- ese período) en vez de venir de múltiples usuarios por el flujo normal.
SELECT usuario_ingre, COUNT(*) AS cantidad, MIN(fecha_ingre) AS primera, MAX(fecha_ingre) AS ultima
FROM cxc_cabece_transa
WHERE usuario_actua = 'fix_cxc_cabece_transa_empr_sucu_null'
GROUP BY usuario_ingre
ORDER BY cantidad DESC;

-- ============================================================================
-- 5. GUARDRAIL definitivo — evita que esto pueda volver a pasar en silencio.
-- Ya no debería quedar ninguna fila NULL tras el paso 3 (correr esto primero
-- para confirmarlo; debe devolver 0 antes de aplicar el ALTER):
--   SELECT COUNT(*) FROM cxc_cabece_transa WHERE ide_empr IS NULL OR ide_sucu IS NULL;
-- Con eso en 0, agregar NOT NULL convierte un futuro insert incompleto en un
-- error inmediato (constraint violation) en vez de un dato corrupto silencioso
-- que solo se nota semanas después comparando dos endpoints - todo el código
-- de inserción actual ya manda estos valores, así que esto no debería romper
-- ningún flujo existente.
ALTER TABLE cxc_cabece_transa
    ALTER COLUMN ide_empr SET NOT NULL,
    ALTER COLUMN ide_sucu SET NOT NULL;
