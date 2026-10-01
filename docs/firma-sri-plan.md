# Firma electrónica SRI: plan de seguridad

## Estado
| Fase | Qué | Estado |
|---|---|---|
| A | Dejar de filtrar la clave del .p12 (API y Redis) | **Hecha** |
| B | Clave de cifrado fuera del código (`SRI_ENCRYPTION_KEY`, AES-256-GCM, formato versionado) | Pendiente |
| C | Re-cifrar `password_srfid` y los secretos de Telegram/Groq con la clave nueva | Pendiente (requiere respaldo de BD y probar una factura) |
| D | Rotar lo expuesto: token del bot de Telegram y clave de Groq (y, si se sospecha filtración, la clave del .p12) | Pendiente, trabajo manual |
| E | Restringir `saveFirma`, `uploadFirma`, `validateFirma`, `saveEmisor` a administradores y limitar la ruta de `validateFirma` a la carpeta de firmas | Pendiente |

## Fase A: qué cambió
- `GET sri/cel/firma/getFirma` devolvía la clave del .p12 **descifrada** a cualquier usuario autenticado; ahora no devuelve `claveFirma`. `getFirmas` tampoco consulta `password_srfid`.
- La caché de Redis (`firma_<sucursal>`) guardaba la clave descifrada y sin caducidad. Ahora usa `firma_v2_<sucursal>` y guarda la clave **cifrada**; se descifra solo al firmar (`getFirmaParaFirmar`, usado por `FirmaXmlService`).
- Al iniciar, la aplicación borra las entradas antiguas `firma_*` de Redis.
- El front no usa estos endpoints (no hay referencias en `react-front-erp`).

## Por qué el resto sigue pendiente
La clave de cifrado sigue escrita en `crypto.util.ts` y el repo es público: quien obtenga una copia de la BD puede descifrar `password_srfid`, el token de Telegram y la clave de Groq. Las fases B y C lo cierran; D neutraliza lo que ya estuvo expuesto.

## Decisiones pendientes
1. ¿El repo `nest-core-api` debe ser público? Se recomienda hacerlo privado.
2. Dónde guardar `SRI_ENCRYPTION_KEY` (propuesta: `.env` del servidor, con respaldo aparte).
3. Rotar el token de Telegram y la clave de Groq.
4. Ventana para la fase C (respaldo de BD, ejecutar el script, firmar una factura real).
