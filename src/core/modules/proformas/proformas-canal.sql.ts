/**
 * Canal por el que llegó una proforma. Se deduce de `referencia_cccpr` y, si está vacía, del nombre del tipo de
 * proforma (`cxc_tipo_proforma.nombre_cctpr`), porque no todos los canales llenan la referencia:
 *
 *  - referencia 'WHATSAPP'                → 'WhatsApp' (bot de WhatsApp)
 *  - referencia 'QuimIA'                  → 'QuimIA' (asistente de IA en el ERP)
 *  - referencia 'Telegram'                → 'Telegram'
 *  - referencia con forma de UUID         → 'Página web' (el portal guarda ahí el UUID de la solicitud)
 *  - referencia vacía y tipo que dice WhatsApp / Telegram / Agente / IA / Web → ese canal
 *  - referencia vacía y cualquier otro tipo → 'Manual' (la creó un asesor desde el ERP)
 *  - cualquier otro texto en la referencia  → 'Otro'
 *
 * @param alias alias de la tabla `cxc_cabece_proforma` en la consulta (ej. 'c').
 */
export const canalProformaSql = (alias: string): string => {
  const tipo = `UPPER((SELECT t.nombre_cctpr FROM cxc_tipo_proforma t WHERE t.ide_cctpr = ${alias}.ide_cctpr))`;
  return `
  CASE
    WHEN NULLIF(TRIM(${alias}.referencia_cccpr), '') IS NULL THEN
      CASE
        WHEN ${tipo} LIKE '%WHATSAPP%' THEN 'WhatsApp'
        WHEN ${tipo} LIKE '%TELEGRAM%' THEN 'Telegram'
        WHEN ${tipo} LIKE '%AGENTE%' OR ${tipo} LIKE '%QUIMIA%' THEN 'QuimIA'
        WHEN ${tipo} LIKE '%WEB%' THEN 'Página web'
        ELSE 'Manual'
      END
    WHEN UPPER(TRIM(${alias}.referencia_cccpr)) = 'WHATSAPP' THEN 'WhatsApp'
    WHEN UPPER(TRIM(${alias}.referencia_cccpr)) = 'QUIMIA' THEN 'QuimIA'
    WHEN UPPER(TRIM(${alias}.referencia_cccpr)) = 'TELEGRAM' THEN 'Telegram'
    WHEN TRIM(${alias}.referencia_cccpr) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 'Página web'
    ELSE 'Otro'
  END`;
};
