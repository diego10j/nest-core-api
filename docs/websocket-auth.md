# Autenticación de WebSockets

Los dos gateways (`/` de WhatsApp y `/notificaciones`, ambos en `WHATSAPP_SOCKET_PORT`) autentican el **handshake** con el mismo access token de la API.

- El token llega en `handshake.auth.token` (o header `Authorization: Bearer …` para clientes que no son navegador).
- Se valida igual que en HTTP: firma y expiración, blacklist de Redis y usuario activo/no bloqueado.
- `/notificaciones`: la sala `usua:<ide_usua>` se arma con el usuario **del token**. Antes se usaba el `ide_usua` que declaraba el cliente, así que cualquiera podía suscribirse a las notificaciones de otro usuario.
- Gateway de WhatsApp: todos sus eventos se emiten a todos los sockets (`newMessage` con el teléfono, `totalChatsNoLeidos`, `botStatus`…). Ahora solo reciben usuarios autenticados.
- `AUTH_GUARD_MODE` se aplica igual que en HTTP: en `warn` se deja conectar y solo se registra; en `enforce` se rechaza con `connect_error: unauthorized`.
  En `warn`, `/notificaciones` todavía acepta el `ide_usua` declarado por clientes que aún no envían token.

## Cambio necesario en `react-front-erp`

Mientras el front no envíe el token, funciona solo en modo `warn`. Cambios:

`src/hooks/use-notificaciones.ts`
```ts
socket = io(`${base}/notificaciones`, {
  auth: (cb) => cb({ token: localStorage.getItem('jwt_access_token') }), // token vigente en cada (re)conexión
  transports: ['websocket', 'polling'],
  withCredentials: true,
});
```

`src/lib/whatsapp-socket.ts`
```ts
socket = io(CONFIG.webSocketUrl, {
  auth: (cb) => cb({ token: localStorage.getItem('jwt_access_token') }),
  transports: ['websocket', 'polling'],
  withCredentials: true,
});
```

El access token dura 15 min y solo se valida al conectar. Si el socket se reconecta con el token vencido, el servidor responde `unauthorized`; conviene renovar y reintentar (en ambos archivos, tras crear el socket):
```ts
import { refreshAccessToken } from 'src/lib/axios';

socket.on('connect_error', async (err) => {
  if (err.message !== 'unauthorized') return;
  try {
    await refreshAccessToken(); // guarda el token nuevo en localStorage
    socket?.connect();
  } catch {
    /* sesión terminada: el interceptor de axios ya maneja el logout */
  }
});
```

## Orden de despliegue

1. Backend con `AUTH_GUARD_MODE=warn`.
2. Front con el cambio de arriba.
3. Revisar el log (`SocketAuth:*` `[warn-mode]`): no deben quedar conexiones sin token.
4. Pasar a `AUTH_GUARD_MODE=enforce`.
