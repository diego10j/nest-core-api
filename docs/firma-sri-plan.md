# Firma electrónica SRI: plan de seguridad

## Estado
| Fase | Qué | Estado |
|---|---|---|
| A | Dejar de filtrar la clave del .p12 (API y Redis) | **Hecha** |
| B | Clave de cifrado fuera del código (`SRI_ENCRYPTION_KEY`, AES-256-GCM, formato versionado) | **Hecha en el código; falta activarla en el servidor** (ver abajo) |
| C | Re-cifrar `password_srfid` y los secretos de Telegram/Groq con la clave nueva | Pendiente (requiere respaldo de BD y probar una factura) |
| D | Rotar lo expuesto: token del bot de Telegram y clave de Groq (y, si se sospecha filtración, la clave del .p12) | Pendiente, trabajo manual |
| E | Restringir `saveFirma`, `uploadFirma`, `validateFirma`, `saveEmisor` a administradores y limitar la ruta de `validateFirma` a la carpeta de firmas | Pendiente |

## Fase A: qué cambió
- `GET sri/cel/firma/getFirma` devolvía la clave del .p12 **descifrada** a cualquier usuario autenticado; ahora no devuelve `claveFirma`. `getFirmas` tampoco consulta `password_srfid`.
- La caché de Redis (`firma_<sucursal>`) guardaba la clave descifrada y sin caducidad. Ahora usa `firma_v2_<sucursal>` y guarda la clave **cifrada**; se descifra solo al firmar (`getFirmaParaFirmar`, usado por `FirmaXmlService`).
- Al iniciar, la aplicación borra las entradas antiguas `firma_*` de Redis.
- El front no usa estos endpoints (no hay referencias en `react-front-erp`).

## Fase B: qué cambió y cómo activarla
`crypto.util.ts` ahora cifra con AES-256-GCM (`ENC:v3:<kid>:<iv>:<tag>:<texto>`) usando la clave de la variable `SRI_ENCRYPTION_KEY`, y detecta si un valor fue alterado. **Sin la variable no cambia nada**: se sigue cifrando y descifrando como antes (formato `v2` con la clave antigua) y la aplicación avisa en el log al iniciar. **Con la variable**, lo que se guarde desde ese momento (clave de la firma, token de Telegram, clave de Groq) usa `v3`, y los valores `v2` ya guardados se siguen leyendo. Un valor `v3` nunca se devuelve como basura: si falta la variable, o es otra clave, o el dato fue alterado, lanza un error claro.

### Cómo activarla (sin afectar el flujo)
1. Generar la clave: `openssl rand -base64 32`.
2. **Respaldarla fuera del servidor** (gestor de contraseñas). Si se pierde, los valores `v3` no se pueden recuperar y habría que volver a ingresar las claves.
3. Agregar `SRI_ENCRYPTION_KEY=<la clave>` al `.env` del servidor y reiniciar el backend. El log ya no mostrará el aviso.
4. Verificar firmando una factura. Lo guardado antes sigue funcionando; solo lo que se guarde después usará `v3`.

### Precauciones
- **No volver a una versión anterior del backend después de guardar valores `v3`**: la versión anterior no sabe leerlos. Si hay que revertir, quitar antes la variable no sirve para esos valores; hay que volver a ingresarlos.
- **No cambiar `SRI_ENCRYPTION_KEY` más tarde sin migrar** (fase C): los valores `v3` guardados con la clave anterior dejarían de descifrarse (el error indica `otra clave`).
- Una clave mal formada (que no sea de 32 bytes) hace fallar el cifrado con un mensaje claro: revisar el valor del `.env`.
- Hasta la fase C la clave antigua sigue en el código para leer los `v2`: no protege nada, solo mantiene la compatibilidad.

## Herramienta: endpoint para cifrar una clave
`POST /api/sri/configuracion/cifrarClave` con `{ "password": "texto a cifrar" }` devuelve `{ "valor": "ENC:v3:...", "formato": "v3" }`, listo para guardarlo en la columna que corresponda (por ejemplo `tlg_cuenta` o `sri_firma_digital.password_srfid`).
- **Solo administradores del sistema** (`admin_usua`); cualquier otro usuario recibe 403 y sin sesión 401. Máximo 10 peticiones por minuto, sin caché y sin registrar el cuerpo.
- **Solo cifra.** No existe un endpoint para descifrar, a propósito.
- Responde **409 si `SRI_ENCRYPTION_KEY` no está configurada**: de lo contrario el valor quedaría cifrado con la clave antigua, que es pública.
- Las pantallas del ERP (guardar la firma, la cuenta de Telegram) ya cifran solas al guardar; este endpoint sirve para cargar un valor a mano en la BD.
- Ejemplo: `curl -X POST https://<servidor>/api/sri/configuracion/cifrarClave -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"password":"..."}'`

## Por qué el resto sigue pendiente
Los valores guardados antes de activar la fase B siguen cifrados con la clave antigua, que es pública (el repo lo es): quien obtenga una copia de la BD puede descifrar `password_srfid`, el token de Telegram y la clave de Groq. La fase C los re-cifra con la clave nueva; D neutraliza lo que ya estuvo expuesto.

## Decisiones pendientes
1. El repo `nest-core-api` sigue público (confirmado). Se recomienda hacerlo privado, porque contiene la clave antigua, las IPs de CORS y toda la lógica del ERP.
2. Decidido: `SRI_ENCRYPTION_KEY` en el `.env` del servidor, con respaldo aparte.
3. Rotar el token de Telegram y la clave de Groq.
4. Dato del servidor: **no guarda copias de disco**. Con eso el archivo .p12 solo existe en el disco del servidor, y filtrar la BD no alcanza para firmar facturas: el riesgo real de la clave del .p12 es bajo y rotarla es opcional. Lo que sí conviene rotar es Telegram y Groq (D).
5. Ventana para la fase C (respaldo de BD, ejecutar el script, firmar una factura real).

## Requisito previo de la fase B: ampliar `password_srfid`

La columna `sri_firma_digital.password_srfid` era `varchar(80)` y un valor `ENC:v3:...` no cabe (error `value too long for type character varying(80)` en `saveFirma`). Ejecutar antes de activar `SRI_ENCRYPTION_KEY`:

`scripts/core/sri_firma_password_ampliar_migration.sql` (`ALTER ... TYPE varchar(255)`).

`tlg_cuenta.token_tlcue` y `groq_api_key_tlcue` ya son `TEXT`.
