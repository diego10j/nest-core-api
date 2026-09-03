-- ============================================================================
-- Módulo: Contabilidad / Retenciones
-- Marca tipos de contribuyente a los que NO corresponde emitir/calcular
-- retención (ej. Contribuyentes Especiales / "Grandes Contribuyentes" del SRI
-- - https://www.sri.gob.ec/grandes-contribuyentes, instituciones del sector
-- público, exportadores calificados).
--
-- No es un bloqueo duro en código: el motor de sugerencia de retención
-- (RetencionesCxPService.getPorcentajeImpuesto) ya resuelve el % vigente por
-- (tipo de documento, tipo de contribuyente) desde con_detall_impues, así que
-- la forma correcta de "no retener" a un tipo de contribuyente es configurar
-- ahí el 0% para las combinaciones que correspondan (vía la nueva pantalla
-- Contabilidad > Configuración de Impuestos). Esta columna es solo una
-- bandera informativa/de alerta para que el usuario que registra la
-- retención vea una advertencia explícita antes de guardar - la normativa
-- real varía por tipo de impuesto (IVA vs Renta) y tipo de transacción, por
-- lo que un bloqueo automático incondicional sería incorrecto en algunos
-- casos (ej. honorarios profesionales entre contribuyentes especiales).
-- ============================================================================

ALTER TABLE con_tipo_contribu
    ADD COLUMN IF NOT EXISTS no_retener_cntco BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN con_tipo_contribu.no_retener_cntco IS
    'TRUE = a proveedores/clientes con este tipo de contribuyente (ej. Contribuyente Especial / Grande Contribuyente SRI) se les debe advertir antes de generar un comprobante de retención; el % efectivo de retención se sigue configurando por combinación (tipo documento + tipo contribuyente) en con_detall_impues.';

-- Nota: no se inserta aquí el registro "GRANDE CONTRIBUYENTE" / "CONTRIBUYENTE
-- ESPECIAL" a propósito - se crea desde la nueva pantalla Contabilidad >
-- Configuración de Impuestos > Tipos de Contribuyente para que el usuario lo
-- gestione como cualquier otro registro del catálogo (con_tipo_contribu no
-- tiene columnas de auditoría usuario_ingre/fecha_ingre, a diferencia de
-- con_detall_retenc).
