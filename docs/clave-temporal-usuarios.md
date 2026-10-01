# Contraseña temporal por usuario (se eliminó la clave por defecto `Temporal1`)

Antes, un usuario nuevo (o al que se le reseteaba la clave) quedaba con `Temporal1`, un valor visible en el repo. Ahora cada alta o reseteo genera **una contraseña aleatoria distinta** y la envía al correo registrado del usuario.

## Qué cambió
| Flujo | Antes | Ahora |
|---|---|---|
| `POST sistema/usuarios/saveConfigPassword` (crear la configuración de clave, sin `ide_uscl`) | Clave `Temporal1` | Si **no** se envía `password_uscl`: se genera una clave aleatoria de 12 caracteres (mayúscula, minúscula y número, sin caracteres ambiguos), se envía por correo y se marca `cambia_clave_usua = true`. Si el administrador envía `password_uscl`, se respeta esa clave. |
| `POST auth/resetPassword` | Clave `Temporal1` | Clave aleatoria enviada al correo; se marca el cambio obligatorio en el próximo inicio de sesión |
| Respuesta | Texto fijo | Nunca incluye la contraseña; solo el correo enmascarado (`j***@empresa.com`) |

## Orden seguro
1. Se valida que el usuario exista y tenga un **correo válido** en `sis_usuario.mail_usua`. Si no lo tiene, se responde 400 y **no se cambia nada**.
2. Se envía el correo con la plantilla.
3. **Solo si el envío fue bien** se guarda la clave (hash bcrypt) y la marca de cambio obligatorio.
   Si el correo falla, la contraseña anterior sigue vigente (no queda una clave que nadie conoce).

La clave solo existe en memoria durante la petición y en el correo; en base de datos queda el hash.

## Plantilla de correo
`src/core/email/templates/sistema/credenciales-acceso.hbs` (usa el encabezado y pie estándar). Variables: `appName`, `nombre`, `usuario`, `password`, `loginUrl` (opcional), `esNuevoUsuario` (cambia el título y el texto entre alta y reseteo). Se copia a `dist` en el build (`nest-cli.json` → `assets`).
Asunto: "Tus credenciales de acceso a Pro-ERP" (alta) / "Tu contraseña temporal de Pro-ERP" (reseteo).

## Configuración
- `APP_LOGIN_URL` (opcional, en `.env.template`): URL del ERP para el botón "Iniciar sesión" del correo. Sin ella, el botón no se muestra.
- Se envía con la cuenta de correo `default` de la empresa del usuario (`sis_correo`, proveedor Resend), igual que el resto de correos del sistema. **Debe existir y estar activa**, o el alta/reseteo responderá 500 sin cambiar la clave.

## Pruebas
`password-util.spec.ts` (formato, aleatoriedad, nunca `Temporal1`) y `temporary-password.service.spec.ts` (sin correo → 400 sin enviar, fallo de envío → error sin exponer la clave, contenido del correo).
Para probar de punta a punta: crear/resetear un usuario de prueba con un correo propio y comprobar que llega el mensaje y que el sistema pide cambiar la clave al entrar.

## Notas
- Los usuarios existentes **no se tocan**: quienes sigan con `Temporal1` deben cambiarla (se puede resetear desde el ERP, ya con clave única por correo). Consulta útil para ubicarlos: no es posible por SQL (bcrypt), pero se puede comparar en una pasada con un script si se desea.
- El front (`claude/front-clave-temporal`) muestra los mensajes nuevos y el error real del servidor (por ejemplo "no tiene un correo válido").
