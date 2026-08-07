-- =============================================================================
-- DIAGNÓSTICO: Guías de remisión con datos incompletos que el SRI rechaza
-- Fecha: 2026-08-07
-- Sólo lectura (SELECT) - para identificar registros a corregir manualmente,
-- especialmente guías migradas desde el aplicativo Java.
--
-- Motivado por:
--  - ERROR.35 (XML no cumple estructura): razonSocialTransportista vacío. La guía
--    exige nombre de chofer (si es_transporte_propio_cctfa=true) o de la empresa
--    de transporte vía ven_transporte (si es false); ver getTransportistaGuia en
--    comprobantes-elec.service.ts.
--  - ERROR.69 (identificación del receptor): el SRI no permite guías de remisión
--    para Consumidor Final (identificac_geper = 9999999999999).
--
-- El backend ahora valida esto ANTES de generar/enviar el XML (BadRequestException
-- con mensaje accionable) en vez de dejar que el SRI lo rechace después - pero las
-- guías YA EXISTENTES con estos problemas siguen sin poder enviarse hasta corregir
-- los datos abajo listados.
-- =============================================================================

-- 1. Guías SIN transportista/chofer resuelto (razonSocialTransportista quedaría vacío)
SELECT
    g.ide_ccgui,
    h.claveacceso_srcom,
    h.secuencial_srcom,
    h.fechaemision_srcom,
    t.es_transporte_propio_cctfa,
    t.ide_vgtra,
    t.ide_geper AS ide_geper_chofer,
    tr.nombre_vgtra,
    ch.nom_geper AS nombre_chofer
FROM cxc_guia g
INNER JOIN sri_comprobante h ON g.ide_srcom = h.ide_srcom
LEFT JOIN cxc_transporte_factura t ON t.ide_cccfa = g.ide_cccfa
LEFT JOIN ven_transporte tr ON t.ide_vgtra = tr.ide_vgtra
LEFT JOIN gen_persona ch ON t.ide_geper = ch.ide_geper
WHERE h.coddoc_srcom = '06'
  AND (
        t.ide_cctfa IS NULL  -- no existe fila en cxc_transporte_factura
        OR (t.es_transporte_propio_cctfa = TRUE  AND (ch.nom_geper IS NULL OR TRIM(ch.nom_geper) = ''))
        OR (t.es_transporte_propio_cctfa = FALSE AND (tr.nombre_vgtra IS NULL OR TRIM(tr.nombre_vgtra) = ''))
      )
ORDER BY h.fechaemision_srcom DESC;

-- 2. Guías cuyo destinatario es Consumidor Final (el SRI las rechaza siempre)
SELECT
    g.ide_ccgui,
    h.claveacceso_srcom,
    h.secuencial_srcom,
    h.fechaemision_srcom,
    p.identificac_geper,
    p.nom_geper
FROM cxc_guia g
INNER JOIN sri_comprobante h ON g.ide_srcom = h.ide_srcom
INNER JOIN gen_persona p ON g.ide_geper = p.ide_geper
WHERE h.coddoc_srcom = '06'
  AND p.identificac_geper = '9999999999999'
ORDER BY h.fechaemision_srcom DESC;

-- 3. Guías con ide_cntdo guardado como factura (3) en vez de guía (7) - bug corregido en
--    facturas-save.service.ts (buildSriFullInsert); esto corrige los registros YA insertados.
-- Revisar el SELECT primero; descomentar el UPDATE para aplicar.
SELECT ide_srcom, coddoc_srcom, ide_cntdo
FROM sri_comprobante
WHERE coddoc_srcom = '06' AND ide_cntdo <> 7;

-- UPDATE sri_comprobante SET ide_cntdo = 7 WHERE coddoc_srcom = '06' AND ide_cntdo <> 7;
