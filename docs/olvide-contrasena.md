# "Olvidé mi contraseña" (código de 6 dígitos por correo)

## Flujo
1. **Login → "¿Olvidaste tu contraseña?"** → pantalla `/auth/jwt/forgot-password`.
2. El usuario escribe su **correo o usuario** → `POST auth/forgotPassword`. Si la cuenta existe, está activa, no está bloqueada y tiene correo válido, se envía un **código de 6 dígitos** (plantilla `codigo-recuperacion.hbs`) al correo registrado. La respuesta es **siempre la misma**, exista o no la cuenta (no revela qué usuarios existen).
3. Digita los 6 números → `POST auth/verifyResetCode`. Si es correcto devuelve un `resetToken` de un solo uso.
4. Pantalla **nueva contraseña** (con confirmación) → `POST auth/resetPasswordWithCode`. Se guarda la clave, se quita la marca de cambio obligatorio, se **cierran todas las sesiones** del usuario y se limpian bloqueos de login por intentos fallidos. Vuelve al inicio de sesión.

## Seguridad
| Control | Detalle |
|---|---|
| Código | 6 dígitos con CSPRNG; en Redis (DB 4) solo se guarda un **HMAC** (con `JWT_SECRET`), nunca el código; vence a los **10 min** |
| Intentos | Máx. **5** por código; al quinto fallo se descarta y hay que pedir otro |
| Reenvío | 1 solicitud por minuto y usuario (también limita el spam al correo de la víctima) |
| Un solo uso | El código se consume al verificarlo; el `resetToken` (256 bits, 10 min) se consume al usarlo |
| Enumeración | Misma respuesta y mismos mensajes con cuenta existente o no; errores de verificación genéricos ("Código inválido o vencido") |
| Rate limit | `@Throttle` por IP: 5/min en solicitar, 10/min en verificar y en cambiar |
| Cuentas ambiguas | Si el dato coincide con **más de una** cuenta activa, no se envía nada (se registra en log) |
| Correo caído | Si el envío falla, el código se descarta y no se informa al cliente (se registra en log) |
| Contraseña nueva | Misma regla que el cambio normal: 6+ caracteres, 1 mayúscula, 1 minúscula, 1 número (`@$!%*?&` permitidos); debe coincidir con la confirmación |

Los endpoints son `@Public()` (no requieren sesión). Ningún dato sensible aparece en logs.

## Requisitos
- El usuario necesita **correo válido** en `sis_usuario.mail_usua` y la empresa la cuenta de correo `default` activa (igual que la clave temporal por correo).
- Redis disponible (DB 4 para estos datos; 1 = blacklist, 2 = intentos de login, 3 = refresh tokens).
- Sin variables nuevas.

## Pruebas
`password-recovery.service.spec.ts` (8 casos: cuenta inexistente/ambigua/sin correo, código hasheado y cooldown, fallo de correo, uso único, bloqueo a los 5 intentos, cambio de clave con cierre de sesiones y token de un solo uso).
Prueba manual: ver `Cómo probar` en el mensaje de entrega (usuario de prueba con correo propio).

## Front
Rama `claude/front-olvide-clave`: vista `JwtForgotPasswordView` (3 pasos), ruta `forgot-password`, enlace en el login, contador de 60 s para reenviar, entrada de código con 6 casillas (verifica sola al completar) y etiquetas accesibles.
