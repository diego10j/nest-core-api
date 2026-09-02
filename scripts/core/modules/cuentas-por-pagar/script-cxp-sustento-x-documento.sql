-- ============================================================================
-- Módulo: Cuentas por Pagar / SRI
-- Sustento tributario (Tabla 5: SUSTENTO DEL COMPROBANTE) y su aplicabilidad
-- por tipo de documento (Tabla 4: TIPOS COMPROBANTES AUTORIZADOS, columna
-- "Sustento tributario"), ambas transcritas de "Ficha Técnica Anexo
-- Transaccional Simplificado (ATS)" del SRI, pág. 78-80.
--
-- Este script hace TRES cosas, en orden, cada una idempotente (se puede
-- re-correr en cualquier ambiente sin duplicar ni romper nada):
--
--   1) Asegura que sri_tipo_sustento_tributario tenga los 16 códigos (00 a
--      15) del catálogo oficial - inserta solo los que falten.
--   2) Corrige el texto (nombre_srtst) de los 16 códigos contra el texto
--      oficial de la Tabla 5, sin importar si la fila ya existía con otro
--      texto. Esto corrige un error real que ya estaba en la base ANTES de
--      este script: el código '10' tenía guardado el texto de otro concepto
--      ("Comprobante de venta emitido por no domiciliado - Importaciones",
--      que en realidad es el sustento de la Tabla 4/comprobante 41, no un
--      código de esta tabla) en vez de "Distribución de Dividendos,
--      Beneficios o Utilidades" (el texto real del código 10 en Tabla 5).
--   3) Crea (si no existe) sri_sustento_x_documento - la relación
--      sustento↔tipo de documento (antes hardcodeada en TypeScript en
--      sustento-tributario.util.ts, ahora parametrizable por tabla) - y la
--      siembra completa según la columna "Sustento tributario" de Tabla 4
--      para Factura, Liquidación de compra, Nota de crédito y Reembolso -
--      ESTOS 4 CONJUNTOS DE CÓDIGOS YA ESTABAN CORRECTOS (coinciden exacto
--      con la Tabla 4 oficial), no se modificó nada de esa clasificación.
-- ============================================================================


-- ── 1) Asegurar que existan los 16 códigos (00-15) ──────────────────────────
INSERT INTO sri_tipo_sustento_tributario (ide_srtst, ide_empr, ide_sucu, alterno_srtst, nombre_srtst)
SELECT
    (SELECT COALESCE(MAX(ide_srtst), -1) FROM sri_tipo_sustento_tributario)
        + ROW_NUMBER() OVER (ORDER BY v.alterno_srtst),
    0, 0, v.alterno_srtst, v.nombre_srtst
FROM (VALUES
    ('00', 'CASOS ESPECIALES CUYO SUSTENTO NO APLICA EN LAS OPCIONES ANTERIORES'),
    ('01', 'CRÉDITO TRIBUTARIO PARA DECLARACIÓN DE IVA (SERVICIOS Y BIENES DISTINTOS DE INVENTARIOS Y ACTIVOS FIJOS)'),
    ('02', 'COSTO O GASTO PARA DECLARACIÓN DE IR (SERVICIOS Y BIENES DISTINTOS DE INVENTARIOS Y ACTIVOS FIJOS)'),
    ('03', 'ACTIVO FIJO - CRÉDITO TRIBUTARIO PARA DECLARACIÓN DE IVA'),
    ('04', 'ACTIVO FIJO - COSTO O GASTO PARA DECLARACIÓN DE IR'),
    ('05', 'LIQUIDACIÓN GASTOS DE VIAJE, HOSPEDAJE Y ALIMENTACIÓN GASTOS IR (A NOMBRE DE EMPLEADOS Y NO DE LA EMPRESA)'),
    ('06', 'INVENTARIO - CRÉDITO TRIBUTARIO PARA DECLARACIÓN DE IVA'),
    ('07', 'INVENTARIO - COSTO O GASTO PARA DECLARACIÓN DE IR'),
    ('08', 'VALOR PAGADO PARA SOLICITAR REEMBOLSO DE GASTO (INTERMEDIARIO)'),
    ('09', 'REEMBOLSO POR SINIESTROS'),
    ('10', 'DISTRIBUCIÓN DE DIVIDENDOS, BENEFICIOS O UTILIDADES'),
    ('11', 'CONVENIOS DE DÉBITO O RECAUDACIÓN PARA IFI´S'),
    ('12', 'IMPUESTOS Y RETENCIONES PRESUNTIVOS'),
    ('13', 'VALORES RECONOCIDOS POR ENTIDADES DEL SECTOR PÚBLICO A FAVOR DE SUJETOS PASIVOS'),
    ('14', 'VALORES FACTURADOS POR SOCIOS A OPERADORAS DE TRANSPORTE (QUE NO CONSTITUYEN GASTO DE DICHA OPERADORA)'),
    ('15', 'PAGOS EFECTUADOS POR CONSUMOS PROPIOS Y DE TERCEROS DE SERVICIOS DIGITALES')
) AS v(alterno_srtst, nombre_srtst)
WHERE NOT EXISTS (
    SELECT 1 FROM sri_tipo_sustento_tributario s WHERE s.alterno_srtst = v.alterno_srtst
);

-- ── 2) Corregir el texto de los 16 códigos contra el oficial (idempotente -
-- pisa cualquier texto previo, correcto o no, para no depender de en qué
-- estado haya quedado la tabla en cada ambiente) ────────────────────────────
UPDATE sri_tipo_sustento_tributario SET nombre_srtst = 'CASOS ESPECIALES CUYO SUSTENTO NO APLICA EN LAS OPCIONES ANTERIORES' WHERE alterno_srtst = '00';
UPDATE sri_tipo_sustento_tributario SET nombre_srtst = 'CRÉDITO TRIBUTARIO PARA DECLARACIÓN DE IVA (SERVICIOS Y BIENES DISTINTOS DE INVENTARIOS Y ACTIVOS FIJOS)' WHERE alterno_srtst = '01';
UPDATE sri_tipo_sustento_tributario SET nombre_srtst = 'COSTO O GASTO PARA DECLARACIÓN DE IR (SERVICIOS Y BIENES DISTINTOS DE INVENTARIOS Y ACTIVOS FIJOS)' WHERE alterno_srtst = '02';
UPDATE sri_tipo_sustento_tributario SET nombre_srtst = 'ACTIVO FIJO - CRÉDITO TRIBUTARIO PARA DECLARACIÓN DE IVA' WHERE alterno_srtst = '03';
UPDATE sri_tipo_sustento_tributario SET nombre_srtst = 'ACTIVO FIJO - COSTO O GASTO PARA DECLARACIÓN DE IR' WHERE alterno_srtst = '04';
UPDATE sri_tipo_sustento_tributario SET nombre_srtst = 'LIQUIDACIÓN GASTOS DE VIAJE, HOSPEDAJE Y ALIMENTACIÓN GASTOS IR (A NOMBRE DE EMPLEADOS Y NO DE LA EMPRESA)' WHERE alterno_srtst = '05';
UPDATE sri_tipo_sustento_tributario SET nombre_srtst = 'INVENTARIO - CRÉDITO TRIBUTARIO PARA DECLARACIÓN DE IVA' WHERE alterno_srtst = '06';
UPDATE sri_tipo_sustento_tributario SET nombre_srtst = 'INVENTARIO - COSTO O GASTO PARA DECLARACIÓN DE IR' WHERE alterno_srtst = '07';
UPDATE sri_tipo_sustento_tributario SET nombre_srtst = 'VALOR PAGADO PARA SOLICITAR REEMBOLSO DE GASTO (INTERMEDIARIO)' WHERE alterno_srtst = '08';
UPDATE sri_tipo_sustento_tributario SET nombre_srtst = 'REEMBOLSO POR SINIESTROS' WHERE alterno_srtst = '09';
UPDATE sri_tipo_sustento_tributario SET nombre_srtst = 'DISTRIBUCIÓN DE DIVIDENDOS, BENEFICIOS O UTILIDADES' WHERE alterno_srtst = '10';
UPDATE sri_tipo_sustento_tributario SET nombre_srtst = 'CONVENIOS DE DÉBITO O RECAUDACIÓN PARA IFI´S' WHERE alterno_srtst = '11';
UPDATE sri_tipo_sustento_tributario SET nombre_srtst = 'IMPUESTOS Y RETENCIONES PRESUNTIVOS' WHERE alterno_srtst = '12';
UPDATE sri_tipo_sustento_tributario SET nombre_srtst = 'VALORES RECONOCIDOS POR ENTIDADES DEL SECTOR PÚBLICO A FAVOR DE SUJETOS PASIVOS' WHERE alterno_srtst = '13';
UPDATE sri_tipo_sustento_tributario SET nombre_srtst = 'VALORES FACTURADOS POR SOCIOS A OPERADORAS DE TRANSPORTE (QUE NO CONSTITUYEN GASTO DE DICHA OPERADORA)' WHERE alterno_srtst = '14';
UPDATE sri_tipo_sustento_tributario SET nombre_srtst = 'PAGOS EFECTUADOS POR CONSUMOS PROPIOS Y DE TERCEROS DE SERVICIOS DIGITALES' WHERE alterno_srtst = '15';


-- ── 3) Tabla puente sustento ↔ tipo de documento ────────────────────────────
CREATE TABLE IF NOT EXISTS sri_sustento_x_documento (
    ide_srxtd      SERIAL PRIMARY KEY,
    ide_srtst      INTEGER NOT NULL,   -- FK sri_tipo_sustento_tributario
    ide_cntdo      INTEGER NOT NULL,   -- FK con_tipo_document
    usuario_ingre  VARCHAR(50),
    fecha_ingre    DATE DEFAULT CURRENT_DATE,
    hora_ingre     TIME DEFAULT CURRENT_TIME,

    CONSTRAINT fk_sri_sustento_x_documento_srtst
        FOREIGN KEY (ide_srtst) REFERENCES sri_tipo_sustento_tributario (ide_srtst),
    CONSTRAINT fk_sri_sustento_x_documento_cntdo
        FOREIGN KEY (ide_cntdo) REFERENCES con_tipo_document (ide_cntdo),
    CONSTRAINT uq_sri_sustento_x_documento UNIQUE (ide_srtst, ide_cntdo)
);

COMMENT ON TABLE sri_sustento_x_documento IS
    'Sustento tributario aplicable por tipo de documento (Tabla 4 SRI - Ficha Técnica Anexo Transaccional Simplificado, pág. 78-79). Editar directamente (INSERT/DELETE) para reflejar cambios del SRI, sin deploy de backend.';

-- Seed: columna "Sustento tributario" de Tabla 4 para Factura (cód. 1),
-- Liquidación de compra de bienes o prestación de servicios (cód. 3), Nota
-- de crédito (cód. 4) y Comprobante de venta emitido por reembolso (cód.
-- 41) - los 4 tipos de documento CxP que usa ide_srtst en este sistema.
DO $$
DECLARE
    v_factura      INTEGER;
    v_liq_compra   INTEGER;
    v_nota_credito INTEGER;
    v_reembolso    INTEGER;
BEGIN
    SELECT valor_para::INTEGER INTO v_factura
        FROM sis_parametros WHERE LOWER(nom_para) = 'p_con_tipo_documento_factura';
    SELECT valor_para::INTEGER INTO v_liq_compra
        FROM sis_parametros WHERE LOWER(nom_para) = 'p_con_tipo_documento_liquidacion_compra';
    SELECT valor_para::INTEGER INTO v_nota_credito
        FROM sis_parametros WHERE LOWER(nom_para) = 'p_con_tipo_documento_nota_credito';
    SELECT valor_para::INTEGER INTO v_reembolso
        FROM sis_parametros WHERE LOWER(nom_para) = 'p_con_tipo_documento_reembolso';

    IF v_factura IS NULL OR v_liq_compra IS NULL OR v_nota_credito IS NULL OR v_reembolso IS NULL THEN
        RAISE EXCEPTION 'No se pudo resolver alguno de los tipos de documento en sis_parametros (factura=%, liq_compra=%, nota_credito=%, reembolso=%)',
            v_factura, v_liq_compra, v_nota_credito, v_reembolso;
    END IF;

    -- FACTURA: 01,02,03,04,05,06,07,08,09,14,15,00
    INSERT INTO sri_sustento_x_documento (ide_srtst, ide_cntdo)
    SELECT ide_srtst, v_factura FROM sri_tipo_sustento_tributario
    WHERE alterno_srtst IN ('01','02','03','04','05','06','07','08','09','14','15','00')
    ON CONFLICT (ide_srtst, ide_cntdo) DO NOTHING;

    -- LIQUIDACION DE COMPRA: 01,02,03,04,05,06,07,08,14,15 (sin '09' ni '00')
    INSERT INTO sri_sustento_x_documento (ide_srtst, ide_cntdo)
    SELECT ide_srtst, v_liq_compra FROM sri_tipo_sustento_tributario
    WHERE alterno_srtst IN ('01','02','03','04','05','06','07','08','14','15')
    ON CONFLICT (ide_srtst, ide_cntdo) DO NOTHING;

    -- NOTA DE CREDITO: 01,02,03,04,05,06,07,08,09,14,15,00
    INSERT INTO sri_sustento_x_documento (ide_srtst, ide_cntdo)
    SELECT ide_srtst, v_nota_credito FROM sri_tipo_sustento_tributario
    WHERE alterno_srtst IN ('01','02','03','04','05','06','07','08','09','14','15','00')
    ON CONFLICT (ide_srtst, ide_cntdo) DO NOTHING;

    -- REEMBOLSO: 01,02,03,04,05,06,07
    INSERT INTO sri_sustento_x_documento (ide_srtst, ide_cntdo)
    SELECT ide_srtst, v_reembolso FROM sri_tipo_sustento_tributario
    WHERE alterno_srtst IN ('01','02','03','04','05','06','07')
    ON CONFLICT (ide_srtst, ide_cntdo) DO NOTHING;
END $$;
