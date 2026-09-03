-- ============================================================================
-- Módulo: Contabilidad / Configuración de Asientos Automáticos
-- Marca en la propia con_cab_conf_asie qué cabeceras son identificadores que
-- AsientosAutomaticosService (y otros servicios de compras/retenciones)
-- resuelven por coincidencia exacta de texto (UPPER(nombre_cncca) = UPPER($1)).
-- Reemplaza el diseño anterior (tabla con_ident_protegido aparte + caché
-- Redis) por una columna en la tabla ya existente - más simple y sin capas
-- adicionales, a costa de requerir marcar manualmente cualquier fila nueva
-- que se cree con uno de estos nombres (ver comentario de columna).
-- ============================================================================

ALTER TABLE con_cab_conf_asie
    ADD COLUMN IF NOT EXISTS protegido_cncca BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN con_cab_conf_asie.protegido_cncca IS
    'TRUE = el motor de asientos automáticos resuelve la cuenta contable buscando por este nombre_cncca exacto (ver asientos-automaticos.service.ts). Editar/eliminar esta fila exige confirmación explícita. Si en el futuro se crea OTRA fila con el mismo nombre (con_cab_conf_asie no tiene UNIQUE en nombre_cncca), márquela también - ConfigAsientosService.saveCabConfAsie ya avisa de esto al crear.';

-- Semilla: los identificadores ya confirmados por grep sobre
-- asientos-automaticos.service.ts, proveedor.service.ts, proveedor-save.service.ts
-- y retenciones-cxp.service.ts al momento de esta migración (2026-09-03).
--
-- Marca las filas que YA existen, e INSERTA las que faltan (confirmado con datos reales de
-- producción: 'GASTO COMISION CHEQUE DEVUELTO', 'INGRESO COMISION COBRADA A CLIENTE' e
-- 'IVA COMPRAS COMISION CHEQUE DEVUELTO' no existían - son del flujo de cheques
-- devueltos/tesorería y sin esta fila el motor solo agrega una advertencia en advertencias[],
-- no falla, así que puede llevar tiempo notar que faltan). Usa get_seq_table(...) - la misma
-- función que usa el backend (ConfigAsientosService/getSeqTable) - para no desincronizar el
-- secuencial de sis_bloqueo con inserts futuros de la aplicación.
DO $$
DECLARE
    nombre TEXT;
    nuevo_id INTEGER;
BEGIN
    FOREACH nombre IN ARRAY ARRAY[
        'CUENTA POR PAGAR',
        'CUENTA POR COBRAR',
        'RETENCION IVA POR PAGAR',
        'RETENCION RENTA POR PAGAR',
        'RETENCION IVA POR COBRAR',
        'RETENCION RENTA POR COBRAR',
        'IVA CREDITO TRIBUTARIO',
        'IVA EN VENTAS',
        'VENTAS',
        'NOTAS DE CREDITO VENTAS',
        'TRANSPORTE EN VENTAS',
        'GASTO COMISION CHEQUE DEVUELTO',
        'INGRESO COMISION COBRADA A CLIENTE',
        'IVA COMPRAS COMISION CHEQUE DEVUELTO'
    ]
    LOOP
        IF EXISTS (SELECT 1 FROM con_cab_conf_asie WHERE UPPER(nombre_cncca) = nombre) THEN
            UPDATE con_cab_conf_asie SET protegido_cncca = TRUE WHERE UPPER(nombre_cncca) = nombre;
        ELSE
            nuevo_id := get_seq_table('con_cab_conf_asie', 'ide_cncca', 1, 'sistema');
            INSERT INTO con_cab_conf_asie (ide_cncca, ide_empr, ide_sucu, nombre_cncca, protegido_cncca)
            VALUES (nuevo_id, 0, 0, nombre, TRUE);
            RAISE NOTICE 'con_cab_conf_asie: creado "%" (ide_cncca=%) - no existía, revise que el motor de asientos tenga su vigencia/detalle configurados si corresponde', nombre, nuevo_id;
        END IF;
    END LOOP;
END $$;
