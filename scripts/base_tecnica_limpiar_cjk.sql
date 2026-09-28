-- ============================================================
-- Base técnica: quitar texto chino/japonés/coreano (CJK) de lo YA extraído.
--
-- Desde esta versión la extracción no guarda CJK en valores, secciones, resumen, sinónimos ni
-- metadatos (ver quitarCjkDeDatos en helpers/normalizar.helper.ts y la regla 9 del prompt). Este
-- script limpia los documentos extraídos antes. NO toca el texto original (texto_original_bddoc,
-- contenido_original_bdsec) ni datos_bddoc: son la copia fiel del documento.
--
-- Un campo que era SOLO chino no se puede traducir aquí: se deja como está y el documento aparece
-- en la consulta del final para volver a extraerlo (tab Datos técnicos → "Volver a extraer").
-- Seguro de re-correr.
-- ============================================================

CREATE OR REPLACE FUNCTION bdt_f_quitar_cjk(t text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
    IF t IS NULL THEN RETURN NULL; END IF;
    -- Ancho completo → ASCII (Ａ１（％） → A1(%))
    t := translate(t, '！＂＃＄％＆＇（）＊＋，－．／０１２３４５６７８９：；＜＝＞？＠ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ［＼］＾＿｀ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ｛｜｝～', '!"#$%&''()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\]^_`abcdefghijklmnopqrstuvwxyz{|}~');
    -- Ideogramas, kana, hangul y puntuación CJK
    t := regexp_replace(t, '[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF\u3000-\u303F\uFF5F-\uFF9F]', ' ', 'g');
    t := regexp_replace(t, '[ \t]{2,}', ' ', 'g');
    t := regexp_replace(t, '\|([ \t]*\|)+', '|', 'g');          -- celdas vacías
    t := regexp_replace(t, '/([ \t]*/)+', '/', 'g');
    t := regexp_replace(t, '\([ \t]*\)', '', 'g');
    -- separadores huérfanos al inicio/fin de línea ("|" no: rompería las tablas markdown)
    t := regexp_replace(t, '(^|\n)[ \t/\\,;:·-]+', '\1', 'g');
    t := regexp_replace(t, '[ \t/\\,;:·-]+(\n|$)', '\1', 'g');
    t := regexp_replace(t, '\n[^\n[:alnum:]]*(?=\n|$)', '', 'g');  -- líneas que quedaron vacías
    t := btrim(t, E' \t\n');
    -- Sin letras ("水分（％）" → "(%)") ya no dice nada
    IF t !~ '[[:alpha:]]' THEN RETURN NULL; END IF;
    RETURN t;
END;
$$;

-- Hay CJK en el texto
CREATE OR REPLACE FUNCTION bdt_f_tiene_cjk(t text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$ SELECT t ~ '[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]' $$;

-- 1. Valores: solo los que tienen también texto latino (bilingües). Los que eran solo chino se
--    listan al final para re-extraer.
UPDATE bdt_valor SET nombre_original_bdval = bdt_f_quitar_cjk(nombre_original_bdval)
 WHERE bdt_f_tiene_cjk(nombre_original_bdval) AND bdt_f_quitar_cjk(nombre_original_bdval) IS NOT NULL;
UPDATE bdt_valor SET valor_texto_bdval = bdt_f_quitar_cjk(valor_texto_bdval)
 WHERE bdt_f_tiene_cjk(valor_texto_bdval) AND bdt_f_quitar_cjk(valor_texto_bdval) IS NOT NULL;
UPDATE bdt_valor SET especificacion_bdval = bdt_f_quitar_cjk(especificacion_bdval)
 WHERE bdt_f_tiene_cjk(especificacion_bdval) AND bdt_f_quitar_cjk(especificacion_bdval) IS NOT NULL;
UPDATE bdt_valor SET metodo_bdval = bdt_f_quitar_cjk(metodo_bdval) WHERE bdt_f_tiene_cjk(metodo_bdval);
UPDATE bdt_valor SET unidad_bdval = bdt_f_quitar_cjk(unidad_bdval) WHERE bdt_f_tiene_cjk(unidad_bdval);

-- 2. Secciones (contenido en español; el original no se toca)
UPDATE bdt_seccion SET titulo_bdsec = bdt_f_quitar_cjk(titulo_bdsec) WHERE bdt_f_tiene_cjk(titulo_bdsec);
UPDATE bdt_seccion SET contenido_bdsec = bdt_f_quitar_cjk(contenido_bdsec)
 WHERE bdt_f_tiene_cjk(contenido_bdsec) AND bdt_f_quitar_cjk(contenido_bdsec) IS NOT NULL;

-- 3. Documento: resumen, traducción y metadatos detectados
UPDATE bdt_documento
   SET markdown_bddoc = COALESCE(bdt_f_quitar_cjk(markdown_bddoc), markdown_bddoc),
       texto_es_bddoc = COALESCE(bdt_f_quitar_cjk(texto_es_bddoc), texto_es_bddoc),
       producto_detectado_bddoc = bdt_f_quitar_cjk(producto_detectado_bddoc),
       fabricante_detectado_bddoc = bdt_f_quitar_cjk(fabricante_detectado_bddoc),
       proveedor_detectado_bddoc = bdt_f_quitar_cjk(proveedor_detectado_bddoc)
 WHERE bdt_f_tiene_cjk(markdown_bddoc) OR bdt_f_tiene_cjk(texto_es_bddoc) OR bdt_f_tiene_cjk(producto_detectado_bddoc)
    OR bdt_f_tiene_cjk(fabricante_detectado_bddoc) OR bdt_f_tiene_cjk(proveedor_detectado_bddoc);

-- 4. Sinónimos en chino: no sirven para buscar el producto ni para "Otros nombres"
DELETE FROM bdt_sinonimo WHERE bdt_f_tiene_cjk(sinonimo_bdsin);

-- 5. Documentos que siguen con campos SOLO en chino → volver a extraerlos
SELECT a.nombre_inarti, d.ide_bddoc, d.nombre_original_bddoc,
       (SELECT COUNT(*) FROM bdt_valor v WHERE v.ide_bddoc = d.ide_bddoc
           AND (bdt_f_tiene_cjk(v.nombre_original_bdval) OR bdt_f_tiene_cjk(v.valor_texto_bdval)
                OR bdt_f_tiene_cjk(v.especificacion_bdval))) AS valores_en_chino,
       (SELECT COUNT(*) FROM bdt_seccion s WHERE s.ide_bddoc = d.ide_bddoc
           AND bdt_f_tiene_cjk(s.contenido_bdsec)) AS secciones_en_chino
  FROM bdt_documento d
  JOIN inv_articulo a ON a.ide_inarti = d.ide_inarti
 WHERE EXISTS (SELECT 1 FROM bdt_valor v WHERE v.ide_bddoc = d.ide_bddoc
                  AND (bdt_f_tiene_cjk(v.nombre_original_bdval) OR bdt_f_tiene_cjk(v.valor_texto_bdval)
                       OR bdt_f_tiene_cjk(v.especificacion_bdval)))
    OR EXISTS (SELECT 1 FROM bdt_seccion s WHERE s.ide_bddoc = d.ide_bddoc AND bdt_f_tiene_cjk(s.contenido_bdsec))
 ORDER BY a.nombre_inarti;

-- Fabricantes/proveedores con nombre en chino (revisar a mano: el nombre es clave única del catálogo)
SELECT 'fabricante' AS catalogo, ide_bdfab AS id, nombre_bdfab AS nombre FROM bdt_fabricante WHERE bdt_f_tiene_cjk(nombre_bdfab)
UNION ALL
SELECT 'proveedor', ide_bdprv, nombre_bdprv FROM bdt_proveedor WHERE bdt_f_tiene_cjk(nombre_bdprv);
