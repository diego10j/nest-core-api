-- Agrega los códigos de sustento tributario "00 - CASOS ESPECIALES..." y
-- "09 - REEMBOLSO POR SINIESTROS" al set válido de Liquidación de Compra
-- (ide_cntdo=4), para que quede igual al de Factura/Nota de Crédito (ide_cntdo=3/0) -
-- ambos ya estaban presentes ahí pero faltaban en Liquidación (probablemente un olvido
-- al sembrar sri_sustento_x_documento, dado que el resto del set es idéntico).
INSERT INTO sri_sustento_x_documento (ide_srtst, ide_cntdo, usuario_ingre)
SELECT a.ide_srtst, 4, 'diego'
FROM sri_tipo_sustento_tributario a
WHERE a.alterno_srtst IN ('00', '09')
  AND NOT EXISTS (
    SELECT 1 FROM sri_sustento_x_documento sxd
    WHERE sxd.ide_srtst = a.ide_srtst AND sxd.ide_cntdo = 4
  );
