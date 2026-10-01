# Token de la impresora POS

## Qué cambió
- **Front (`react-front-erp`, rama `claude/front-token-impresora`):** `VITE_POS_PRINTER_TOKEN` ya no existe. El token sale solo de la configuración del punto de venta (Ventas > Configurar POS, campo `printer_token_vgpos`). Facturas y etiquetas usan la URL y el token del punto de venta del usuario.
- **Agente (`pos-print-agent`, rama `claude/token-obligatorio`):** `AUTH_TOKEN` es obligatorio (sin él, `503`), se compara en tiempo constante y se valida el header `Host` (contra DNS rebinding). El CORS, las rutas y los trabajos de impresión no cambian.

## Por qué
Un token dentro del JS compilado lo puede leer cualquiera, así que no protegía nada. Con el token solo en la configuración del POS y en el `.env` de cada agente, una página web externa abierta en esa PC ya no puede imprimir ni abrir el cajón.

## Antes de desplegar (en este orden)
1. **En cada PC con agente:** poner `AUTH_TOKEN` en su `.env` (valor largo y aleatorio, `openssl rand -hex 24`). Un agente sin `AUTH_TOKEN`, o con `sin-token`, ahora rechaza todo.
2. **En el ERP:** en *Ventas > Configurar POS*, que el token de cada punto de venta sea igual al `AUTH_TOKEN` de su agente.
3. Actualizar los agentes y desplegar el front. El orden entre ambos da igual mientras se cumplan los puntos 1 y 2.
4. Probar: imprimir una factura y una etiqueta desde cada PC.

## Cambio de comportamiento a tener en cuenta
Las **etiquetas** antes funcionaban con el token global del `.env` aunque el usuario no tuviera punto de venta. Ahora usan la configuración del POS del usuario: quien imprima etiquetas necesita una configuración de POS con URL y token. `VITE_POS_PRINTER_URL` sigue sirviendo como URL por defecto.

## Si un agente rechaza la impresión
- `401`: el token del POS no coincide con el `AUTH_TOKEN` del agente.
- `503`: el agente no tiene `AUTH_TOKEN`.
- Mensaje de conexión: el agente no está corriendo, o el `Host` no es local (para otro nombre, `ALLOWED_HOSTS` en el `.env` del agente).
