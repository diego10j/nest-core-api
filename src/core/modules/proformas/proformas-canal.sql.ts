/**
 * Canal por el que llegó una proforma, deducido de `referencia_cccpr`:
 *  - vacío                       → 'Manual' (la creó un asesor desde el ERP)
 *  - 'WHATSAPP'                  → 'WhatsApp'
 *  - 'QuimIA' / 'Telegram'       → asistente de IA / bot de Telegram
 *  - un UUID                     → 'Página web' (el portal guarda ahí el UUID de la solicitud)
 *  - cualquier otro texto        → 'Otro'
 *
 * @param alias alias de la tabla `cxc_cabece_proforma` en la consulta (ej. 'c').
 */
export const canalProformaSql = (alias: string): string => `
  CASE
    WHEN NULLIF(TRIM(${alias}.referencia_cccpr), '') IS NULL THEN 'Manual'
    WHEN UPPER(TRIM(${alias}.referencia_cccpr)) = 'WHATSAPP' THEN 'WhatsApp'
    WHEN UPPER(TRIM(${alias}.referencia_cccpr)) = 'QUIMIA' THEN 'QuimIA'
    WHEN UPPER(TRIM(${alias}.referencia_cccpr)) = 'TELEGRAM' THEN 'Telegram'
    WHEN TRIM(${alias}.referencia_cccpr) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 'Página web'
    ELSE 'Otro'
  END`;
