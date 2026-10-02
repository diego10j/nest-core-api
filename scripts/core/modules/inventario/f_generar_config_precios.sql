-- Genera la configuración de precios de venta de un artículo a partir de sus facturas en un período.
--
-- Cómo calcula (v3):
--   1. Costo: el costo promedio ponderado móvil (PPMP) vigente a la fecha de cada factura, por sucursal; es el mismo
--      que usa f_calcula_precio_venta, así el precio que se regenera es coherente con el que se configura.
--   2. Precio de venta: el realmente cobrado por unidad (total de la línea / cantidad, ya con descuento), sin IVA. Si
--      el precio de la línea incluye IVA (iva_inarti_ccdfa = -1) se divide con la tarifa de la propia factura.
--      Se excluyen las ventas a los RUC 1719020883001 y 1793234926001 (traspasos por cambio de razón social).
--   3. Utilidad: ponderada por costo, SUM(utilidad) / SUM(costo). Las líneas sin costo, de productos sin kardex o con
--      nota de crédito NO entran al promedio.
--   4. Rangos: el margen real baja de forma gradual y con ruido al subir la cantidad, así que no se corta cada vez que
--      cambia un poco. Para cada forma de pago se buscan los cortes que mejor explican el margen (segmentación óptima por
--      programación dinámica, error cuadrático ponderado por número de ventas) y solo se agrega un rango más si reduce
--      el error más de lo que "cuesta" (p_tolerancia). Cada rango exige un mínimo de ventas (8 % de las del grupo, al
--      menos 3) y hay un tope de p_max_rangos por forma de pago.
--   5. Se configura por TIPO de pago (contado, crédito, tarjeta…), no por cada medio: las configuraciones quedan con
--      ide_cncfp y sin ide_cndfp y el motor las aplica a todas las formas de ese tipo. Los tipos con pocas ventas
--      (menos de 4 líneas válidas) se agrupan en una genérica («Otras formas de pago»). El total entre todos los tipos
--      no pasa de p_max_total (15).
--   6. Cobertura: los rangos son continuos (sin huecos): el primero parte de 0, cada uno termina justo antes del
--      siguiente (inclusivo, con el paso de decimales del artículo) y el último es abierto (sin límite).
--
-- Solo reemplaza las configuraciones generadas antes por esta función (observación «Config automática…»); las
-- creadas a mano se conservan. Devuelve cuántas configuraciones creó.

DROP FUNCTION IF EXISTS f_generar_config_precios(BIGINT, INT, DATE, DATE, TEXT);
DROP FUNCTION IF EXISTS f_generar_config_precios(BIGINT, INT, DATE, DATE, TEXT, NUMERIC);
DROP FUNCTION IF EXISTS f_generar_config_precios(BIGINT, INT, DATE, DATE, TEXT, NUMERIC, INT, INT);

-- ---------------------------------------------------------------------------------------------------------------
-- Segmenta una serie ordenada (nivel de cantidad → margen) en como máximo p_max_k tramos contiguos que minimizan
-- el error cuadrático ponderado + p_lambda por tramo. Devuelve los índices (base 1) donde empieza cada tramo.
CREATE OR REPLACE FUNCTION f_segmentar_margenes(
    p_pesos     NUMERIC[],
    p_margenes  NUMERIC[],
    p_min_peso  NUMERIC,
    p_max_k     INT,
    p_lambda    NUMERIC
) RETURNS INT[] AS $$
DECLARE
    n       INT := COALESCE(array_length(p_pesos, 1), 0);
    inf     CONSTANT NUMERIC := 1e30;
    pw      NUMERIC[] := ARRAY[0]::NUMERIC[];
    pwm     NUMERIC[] := ARRAY[0]::NUMERIC[];
    pwm2    NUMERIC[] := ARRAY[0]::NUMERIC[];
    dp      NUMERIC[];
    bk      INT[];
    k       INT;
    i       INT;
    j       INT;
    w       NUMERIC;
    c       NUMERIC;
    prev    NUMERIC;
    mejor_k INT := 0;
    mejor_c NUMERIC := inf;
    total   NUMERIC;
    res     INT[] := ARRAY[]::INT[];
BEGIN
    IF n = 0 THEN
        RETURN ARRAY[]::INT[];
    END IF;

    FOR i IN 1..n LOOP
        pw   := pw   || (pw[i]   + p_pesos[i]);
        pwm  := pwm  || (pwm[i]  + p_pesos[i] * p_margenes[i]);
        pwm2 := pwm2 || (pwm2[i] + p_pesos[i] * p_margenes[i] * p_margenes[i]);
    END LOOP;

    p_max_k := GREATEST(1, LEAST(p_max_k, n));
    dp := array_fill(inf, ARRAY[(p_max_k + 1) * (n + 1)]);
    bk := array_fill(0,   ARRAY[(p_max_k + 1) * (n + 1)]);
    dp[1] := 0;  -- dp[k=0][j=0]

    FOR k IN 1..p_max_k LOOP
        FOR j IN k..n LOOP
            FOR i IN k..j LOOP
                prev := dp[(k - 1) * (n + 1) + (i - 1) + 1];
                IF prev < inf THEN
                    w := pw[j + 1] - pw[i];
                    IF w >= p_min_peso THEN
                        c := prev + (pwm2[j + 1] - pwm2[i]) - POWER(pwm[j + 1] - pwm[i], 2) / w;
                        IF c < dp[k * (n + 1) + j + 1] THEN
                            dp[k * (n + 1) + j + 1] := c;
                            bk[k * (n + 1) + j + 1] := i;
                        END IF;
                    END IF;
                END IF;
            END LOOP;
        END LOOP;
    END LOOP;

    -- Mejor cantidad de tramos: error + costo por tramo.
    FOR k IN 1..p_max_k LOOP
        c := dp[k * (n + 1) + n + 1];
        IF c < inf AND c + k * p_lambda < mejor_c THEN
            mejor_c := c + k * p_lambda;
            mejor_k := k;
        END IF;
    END LOOP;

    total := pw[n + 1];
    IF mejor_k = 0 THEN
        -- Ningún tramo cumple el mínimo de ventas: un solo rango con todo.
        RETURN ARRAY[1];
    END IF;

    j := n;
    FOR k IN REVERSE mejor_k..1 LOOP
        i := bk[k * (n + 1) + j + 1];
        res := i || res;
        j := i - 1;
    END LOOP;
    RETURN res;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ---------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION f_generar_config_precios(
    id_empresa      BIGINT,
    p_ide_inarti    INT,
    p_fecha_inicio  DATE,
    p_fecha_fin     DATE,
    p_login         TEXT    DEFAULT 'sa',
    p_tolerancia    NUMERIC DEFAULT 5,   -- puntos de margen que justifican abrir un rango nuevo
    p_max_rangos    INT     DEFAULT 5,   -- tope de rangos por forma de pago
    p_min_ventas_fp INT     DEFAULT 4,   -- líneas válidas mínimas para tener configuración propia por tipo de pago
    p_max_total     INT     DEFAULT 15   -- tope de configuraciones entre todos los tipos de pago
) RETURNS INT AS $$
DECLARE
    v_count        INT;
    v_grupo        RECORD;
    v_ide_cncfp    INT;
    v_descripcion  TEXT;
    v_insertados   INT := 0;
    v_decimales    INT;
    v_grupos       INT;
    v_max_grupo    INT;
    v_paso         NUMERIC;

    v_cants        NUMERIC[];
    v_pesos        NUMERIC[];
    v_margenes     NUMERIC[];
    v_costos       NUMERIC[];
    v_utils        NUMERIC[];
    v_total_pesos  NUMERIC;
    v_min_peso     NUMERIC;
    v_inicios      INT[];
    v_n            INT;
    t              INT;
    i              INT;
    v_desde        INT;
    v_hasta        INT;
    v_costo        NUMERIC;
    v_util         NUMERIC;
    v_validas      NUMERIC;
    v_siguiente    NUMERIC;
BEGIN
    IF p_fecha_inicio > p_fecha_fin THEN
        RAISE EXCEPTION 'Fecha inicio (%) no puede ser mayor que fecha fin (%)', p_fecha_inicio, p_fecha_fin;
    END IF;

    SELECT COALESCE(decim_stock_inarti, 2) INTO v_decimales FROM inv_articulo WHERE ide_inarti = p_ide_inarti;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El artículo con ID % no existe', p_ide_inarti;
    END IF;
    v_paso := POWER(10::NUMERIC, -v_decimales);

    DROP TABLE IF EXISTS temp_ventas_producto;

    -- Una fila por línea de factura, con costo PPMP, precio neto sin IVA y la marca de si cuenta para el margen.
    CREATE TEMP TABLE temp_ventas_producto AS
    WITH facturas_con_nota AS (
        SELECT
            lpad(cf.secuencial_cccfa::text, 9, '0') AS secuencial_padded,
            SUM(cdn.valor_cpdno) AS valor_nota_credito
        FROM cxp_cabecera_nota cn
        JOIN cxp_detalle_nota cdn ON cn.ide_cpcno = cdn.ide_cpcno
        JOIN cxc_cabece_factura cf ON cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
        WHERE cn.fecha_emisi_cpcno BETWEEN p_fecha_inicio AND p_fecha_fin
          AND cn.ide_cpeno = 1
          AND cdn.ide_inarti = p_ide_inarti
          AND cn.ide_empr = cf.ide_empr
          AND cn.ide_sucu = cf.ide_sucu
        GROUP BY lpad(cf.secuencial_cccfa::text, 9, '0')
    ),
    lineas AS (
        SELECT
            cdf.ide_ccdfa,
            cdf.cantidad_ccdfa,
            fpg.ide_cncfp AS ide_cncfp,
            iart.hace_kardex_inarti,
            COALESCE(fn.valor_nota_credito, 0) AS nota_credito,
            ppmp.costo_unitario AS costo,
            cdf.total_ccdfa / NULLIF(cdf.cantidad_ccdfa, 0) AS precio_neto,
            1 + COALESCE(NULLIF(CASE WHEN cf.tarifa_iva_cccfa > 1 THEN cf.tarifa_iva_cccfa / 100
                                     ELSE cf.tarifa_iva_cccfa END, 0), 0.15) AS factor_iva,
            cdf.iva_inarti_ccdfa
        FROM cxc_deta_factura cdf
        JOIN cxc_cabece_factura cf ON cf.ide_cccfa = cdf.ide_cccfa
        JOIN inv_articulo iart ON iart.ide_inarti = cdf.ide_inarti
        JOIN gen_persona per ON per.ide_geper = cf.ide_geper
        LEFT JOIN con_deta_forma_pago fpg ON fpg.ide_cndfp = cf.ide_cndfp1
        LEFT JOIN facturas_con_nota fn ON fn.secuencial_padded = lpad(cf.secuencial_cccfa::text, 9, '0')
        LEFT JOIN LATERAL (
            SELECT p.costo_unitario
            FROM f_costo_unitario_ppmp(id_empresa, cf.ide_sucu, cdf.ide_inarti, cf.fecha_emisi_cccfa) p
        ) ppmp ON TRUE
        WHERE cf.ide_ccefa = 0
          AND cf.fecha_emisi_cccfa BETWEEN p_fecha_inicio AND p_fecha_fin
          AND cf.ide_empr = id_empresa
          AND cdf.ide_inarti = p_ide_inarti
          AND cdf.cantidad_ccdfa > 0
          -- Traspasos por cambio de razón social (persona natural → jurídica): no son ventas reales y distorsionan
          -- el margen. Se excluyen las ventas hechas a cualquiera de los dos RUC.
          AND per.identificac_geper NOT IN ('1719020883001', '1793234926001')
    )
    SELECT
        l.ide_ccdfa,
        l.cantidad_ccdfa,
        l.ide_cncfp,
        l.costo,
        CASE WHEN l.iva_inarti_ccdfa = -1 THEN l.precio_neto / l.factor_iva ELSE l.precio_neto END AS precio_sin_iva,
        (l.hace_kardex_inarti IS TRUE AND COALESCE(l.costo, 0) > 0 AND l.nota_credito = 0 AND l.precio_neto > 0) AS valida,
        l.ide_cncfp AS grupo
    FROM lineas l;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN
        DROP TABLE temp_ventas_producto;
        RAISE EXCEPTION 'No hay datos de ventas para el artículo % en el período % a %',
            p_ide_inarti, p_fecha_inicio, p_fecha_fin;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM temp_ventas_producto WHERE valida) THEN
        DROP TABLE temp_ventas_producto;
        RAISE EXCEPTION 'Las ventas del período no tienen costo en kardex: no se puede calcular la utilidad (artículo %)',
            p_ide_inarti;
    END IF;

    -- Tipos de pago con pocas ventas válidas se agrupan en la configuración genérica (grupo NULL).
    UPDATE temp_ventas_producto t
    SET grupo = NULL
    WHERE t.ide_cncfp IS NULL
       OR t.ide_cncfp IN (
            SELECT ide_cncfp FROM temp_ventas_producto
            WHERE ide_cncfp IS NOT NULL
            GROUP BY ide_cncfp
            HAVING COUNT(*) FILTER (WHERE valida) < p_min_ventas_fp
       );

    -- Diagnóstico: líneas válidas por tipo de pago (NULL = genérica).
    FOR v_grupo IN
        SELECT grupo, COUNT(*) AS lineas, COUNT(*) FILTER (WHERE valida) AS validas
        FROM temp_ventas_producto GROUP BY grupo ORDER BY grupo NULLS LAST
    LOOP
        RAISE NOTICE 'Tipo de pago % (NULL = genérica): % líneas, % válidas', v_grupo.grupo, v_grupo.lineas, v_grupo.validas;
    END LOOP;

    -- El tope total se reparte entre los grupos que quedan (contado, crédito, …).
    SELECT COUNT(DISTINCT grupo) + (CASE WHEN EXISTS (SELECT 1 FROM temp_ventas_producto WHERE grupo IS NULL AND valida) THEN 1 ELSE 0 END)
      INTO v_grupos FROM temp_ventas_producto;
    v_max_grupo := GREATEST(1, LEAST(p_max_rangos, p_max_total / GREATEST(v_grupos, 1)));

    -- Solo se reemplazan las configuraciones generadas automáticamente; las manuales se conservan.
    DELETE FROM inv_conf_precios_articulo
    WHERE ide_inarti = p_ide_inarti
      AND observacion_incpa LIKE 'Config automática%';

    v_descripcion := 'Config automática ' || p_fecha_inicio || ' a ' || p_fecha_fin;

    FOR v_grupo IN
        SELECT DISTINCT grupo FROM temp_ventas_producto ORDER BY grupo NULLS LAST
    LOOP
        BEGIN
            v_ide_cncfp := v_grupo.grupo;

            -- Una fila por cantidad vendida (solo líneas válidas), con su margen real y su peso (nº de ventas).
            SELECT
                array_agg(cant ORDER BY cant),
                array_agg(validas ORDER BY cant),
                array_agg(ROUND(util_total / costo_total * 100, 6) ORDER BY cant),
                array_agg(costo_total ORDER BY cant),
                array_agg(util_total ORDER BY cant)
            INTO v_cants, v_pesos, v_margenes, v_costos, v_utils
            FROM (
                SELECT
                    cantidad_ccdfa AS cant,
                    COUNT(*)::NUMERIC AS validas,
                    SUM(costo * cantidad_ccdfa) AS costo_total,
                    SUM((precio_sin_iva - costo) * cantidad_ccdfa) AS util_total
                FROM temp_ventas_producto
                WHERE grupo IS NOT DISTINCT FROM v_grupo.grupo
                  AND valida
                GROUP BY cantidad_ccdfa
            ) n;

            v_n := COALESCE(array_length(v_cants, 1), 0);
            -- Un grupo con muy pocas ventas válidas no da una utilidad confiable.
            IF v_n = 0 OR (SELECT SUM(x) FROM unnest(v_pesos) x) < 3 THEN
                CONTINUE;
            END IF;

            SELECT SUM(x) INTO v_total_pesos FROM unnest(v_pesos) x;
            v_min_peso := GREATEST(3, CEIL(v_total_pesos * 0.08));

            v_inicios := f_segmentar_margenes(
                v_pesos, v_margenes, v_min_peso, v_max_grupo, p_tolerancia * p_tolerancia * v_min_peso
            );

            FOR t IN 1..array_length(v_inicios, 1) LOOP
                v_desde := v_inicios[t];
                v_hasta := CASE WHEN t < array_length(v_inicios, 1) THEN v_inicios[t + 1] - 1 ELSE v_n END;
                v_costo := 0; v_util := 0; v_validas := 0;
                FOR i IN v_desde..v_hasta LOOP
                    v_costo := v_costo + v_costos[i];
                    v_util := v_util + v_utils[i];
                    v_validas := v_validas + v_pesos[i];
                END LOOP;
                v_siguiente := CASE WHEN t < array_length(v_inicios, 1) THEN v_cants[v_inicios[t + 1]] ELSE NULL END;

                INSERT INTO inv_conf_precios_articulo (
                    ide_incpa, ide_inarti, rangos_incpa, rango1_cant_incpa, rango2_cant_incpa, ide_empr,
                    porcentaje_util_incpa, activo_incpa, rango_infinito_incpa, usuario_ingre, ide_cndfp, ide_cncfp,
                    observacion_incpa
                )
                VALUES (
                    get_seq_table('inv_conf_precios_articulo', 'ide_incpa', 1, p_login),
                    p_ide_inarti,
                    TRUE,
                    CASE WHEN t = 1 THEN 0 ELSE v_cants[v_desde] END,
                    CASE WHEN v_siguiente IS NULL THEN NULL ELSE v_siguiente - v_paso END,
                    id_empresa,
                    ROUND(v_util / v_costo * 100, 2),
                    TRUE,
                    v_siguiente IS NULL,
                    p_login,
                    NULL,           -- aplica a todos los medios de pago del tipo
                    v_ide_cncfp,
                    v_descripcion || ' (' ||
                        COALESCE((SELECT nombre_cncfp FROM con_cabece_forma_pago WHERE ide_cncfp = v_grupo.grupo),
                                 'Otras formas de pago') || ', ' || v_validas::INT || ' ventas)'
                );
                v_insertados := v_insertados + 1;
            END LOOP;

        EXCEPTION
            WHEN OTHERS THEN
                RAISE WARNING 'Error procesando forma de pago (ID: %): % [SQL: %]', v_grupo.grupo, SQLERRM, SQLSTATE;
        END;
    END LOOP;

    DROP TABLE IF EXISTS temp_ventas_producto;

    IF v_insertados = 0 THEN
        RAISE EXCEPTION 'No se pudo generar ninguna configuración de precios. Revisar warnings anteriores.';
    END IF;

    RETURN v_insertados;

EXCEPTION
    WHEN OTHERS THEN
        DROP TABLE IF EXISTS temp_ventas_producto;
        RAISE EXCEPTION 'ERROR en f_generar_config_precios (Artículo: %, Período: % a %): % [SQL: %]',
            p_ide_inarti, p_fecha_inicio, p_fecha_fin, SQLERRM, SQLSTATE;
END;
$$ LANGUAGE plpgsql;

-- SELECT f_generar_config_precios(0, 1704, '2026-01-01', '2026-12-31');
-- SELECT * FROM inv_conf_precios_articulo WHERE ide_inarti = 1704 ORDER BY ide_cncfp NULLS LAST, rango1_cant_incpa;
