-- ============================================================================
-- Módulo: Cuentas por Pagar — Reembolso de gastos dentro de Liquidación de
-- Compra (Anexo 17 Ficha Técnica SRI: codDocReemb=41 + <reembolsos>).
--
-- Revisión: se descartó el diseño anterior (self-referencing en
-- cxp_cabece_factur vía ide_referencia_cpcfa/tipo_proveedor_cpcfa/
-- cod_pais_pago_cpcfa) al confirmar que YA EXISTE en el core la tabla
-- cxp_datos_com_reembolso, usada activamente por el sistema Java legacy
-- (pkg_cuentas_x_pagar/pre_factura_cxp.java, guardada en la misma
-- transacción que la Liquidación de Compra) para exactamente este propósito.
-- Este script amplía esa tabla con lo que le falta para el XML del Anexo 17,
-- en vez de duplicar el mecanismo en otra tabla.
--
-- Nota: el tipo de documento "REEMBOLSOS" del ATS (mandatorio, filas hijas
-- self-referencing de cxp_cabece_factur vía ide_rem_cpcfa) NO se toca — es
-- un mecanismo distinto (excluye sub-facturas reembolsadas de ATS/F103/F104)
-- y sigue funcionando igual.
-- ============================================================================

-- Revierte las 3 columnas agregadas a cxp_cabece_factur en la iteración
-- anterior de este mismo feature (nunca llegaron a usarse en producción).
ALTER TABLE cxp_cabece_factur
    DROP CONSTRAINT IF EXISTS fk_cxp_cabece_factur_referencia;
ALTER TABLE cxp_cabece_factur
    DROP COLUMN IF EXISTS ide_referencia_cpcfa;
ALTER TABLE cxp_cabece_factur
    DROP COLUMN IF EXISTS tipo_proveedor_cpcfa;
ALTER TABLE cxp_cabece_factur
    DROP COLUMN IF EXISTS cod_pais_pago_cpcfa;

-- ── cxp_datos_com_reembolso: ampliar columnas insuficientes para SRI ────────
-- secuencial_cpdcr(6) no alcanza para un secuencial SRI (siempre 9 dígitos).
ALTER TABLE cxp_datos_com_reembolso
    ALTER COLUMN secuencial_cpdcr TYPE VARCHAR(9);

-- autorizacion_cpdcr(10) solo alcanza para autorización física; una clave de
-- acceso electrónica tiene 37 o 49 caracteres (misma regla que retención:
-- LONGITUDES_AUTORIZACION = [10, 37, 49]).
ALTER TABLE cxp_datos_com_reembolso
    ALTER COLUMN autorizacion_cpdcr TYPE VARCHAR(49);

-- ── Campos que el XML del Anexo 17 exige y la tabla no tenía ────────────────
-- codPaisPagoProveedorReembolso (Tabla 25 SRI): no hay forma de derivarlo de
-- nada existente. tipoProveedorReembolso (Tabla 26) NO se agrega como columna:
-- se deriva en el momento de armar el XML a partir de ide_getid (tipo de
-- identificación) + identificacion_cpdcr, sin duplicar dato.
ALTER TABLE cxp_datos_com_reembolso
    ADD COLUMN IF NOT EXISTS cod_pais_pago_cpdcr INTEGER DEFAULT 593; -- 593 = Ecuador

-- Modo referenciado (mejora sobre el legacy, que solo digitaba a mano):
-- si el reembolso corresponde a un documento de compra YA REGISTRADO, se
-- guarda la referencia para no volver a digitar sus datos y para evitar
-- reembolsarlo dos veces. NULL = digitado manualmente (comportamiento
-- original de pre_factura_cxp.java).
ALTER TABLE cxp_datos_com_reembolso
    ADD COLUMN IF NOT EXISTS ide_cpcfa_sustento INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'cxp_datos_com_reembolso_ide_cpcfa_sustento_fkey'
    ) THEN
        ALTER TABLE cxp_datos_com_reembolso
            ADD CONSTRAINT cxp_datos_com_reembolso_ide_cpcfa_sustento_fkey
                FOREIGN KEY (ide_cpcfa_sustento) REFERENCES cxp_cabece_factur (ide_cpcfa)
                ON DELETE RESTRICT ON UPDATE RESTRICT;
    END IF;
END $$;

COMMENT ON COLUMN cxp_datos_com_reembolso.cod_pais_pago_cpdcr IS
    'Código de país de pago del proveedor reembolsado (Tabla 25 SRI, 593 = Ecuador).';
COMMENT ON COLUMN cxp_datos_com_reembolso.ide_cpcfa_sustento IS
    'FK opcional a cxp_cabece_factur: documento de compra YA REGISTRADO que sustenta este reembolso (modo referenciado). NULL si los datos se digitaron a mano (modo manual, paridad legacy).';
