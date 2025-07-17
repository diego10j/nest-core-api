CREATE OR REPLACE FUNCTION f_generar_codigo_articulo(p_categoria_id INTEGER)
RETURNS TEXT AS $$
DECLARE
    v_prefijo TEXT;
    v_nombre_categoria TEXT;
    v_max_codigo TEXT;
    v_ultimo_numero INTEGER;
    v_nuevo_codigo TEXT;
BEGIN
    -- Obtener el prefijo y nombre de la categoría
    SELECT 
        COALESCE(NULLIF(TRIM(prefijo_cod_incate), ''), 
                UPPER(SUBSTRING(TRIM(nombre_incate) FROM 1 FOR 3))),
        nombre_incate
    INTO v_prefijo, v_nombre_categoria
    FROM inv_categoria
    WHERE ide_incate = p_categoria_id;
    
    -- Si no existe la categoría
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Categoría con ID % no encontrada', p_categoria_id;
    END IF;
    
    -- Validar que el prefijo tenga al menos 2 caracteres
    IF LENGTH(v_prefijo) < 2 THEN
        v_prefijo := UPPER(SUBSTRING(TRIM(v_nombre_categoria) FROM 1 FOR 3));
    END IF;
    
    -- Buscar el máximo código existente para la categoría
    SELECT MAX(cod_auto_inarti) INTO v_max_codigo
    FROM inv_articulo
    WHERE ide_incate = p_categoria_id
    AND cod_auto_inarti LIKE v_prefijo || '-%';
    
    -- Extraer el número del código existente o empezar desde 1
    IF v_max_codigo IS NULL THEN
        v_ultimo_numero := 0;
    ELSE
        BEGIN
            v_ultimo_numero := COALESCE(
                CAST(SUBSTRING(v_max_codigo FROM '[0-9]+$') AS INTEGER),
                0
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Error al extraer número del código existente %, empezando desde 1', v_max_codigo;
            v_ultimo_numero := 0;
        END;
    END IF;
    
    -- Generar el nuevo código
    v_nuevo_codigo := v_prefijo || '-' || LPAD((v_ultimo_numero + 1)::TEXT, 7, '0');
    
    RETURN v_nuevo_codigo;
END;
$$ LANGUAGE plpgsql;

-- SELECT f_generar_codigo_articulo(2) AS nuevo_codigo;