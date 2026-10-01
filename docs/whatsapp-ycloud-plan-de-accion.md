# WhatsApp con YCloud: cómo se usa y plan de acción

> Las **campañas masivas de WhatsApp se retiraron** del ERP (backend y front) por las nuevas políticas de la API de Meta.
> YCloud es el único proveedor: ya no existe ningún envío directo a la Graph API de Meta (`WHATSAPP_API_URL` se eliminó).
> Las tablas `wha_*` de campañas (`wha_cab_camp_envio`, `wha_det_camp_envio` y las de estados/tipos de campaña) **no se tocaron**: los datos históricos siguen en la base.
> Las **campañas de correo** (módulo de email) no cambian.

## 1. Cómo funciona hoy

| Flujo | Cómo va | Dónde está en el código |
|---|---|---|
| **Mensaje entrante** | Meta → YCloud → webhook `POST /api/webhook/ycloud` (público, con token de verificación) → se guarda en la BD → el socket avisa al navegador (`newMessage`, `totalChatsNoLeidos`) | `ycloud-webhook.controller.ts`, `ycloud.service.ts`, `whatsapp.gateway.ts` |
| **Responder desde el chat** | Texto o archivo desde el ERP → `YcloudService.sendText/sendImage/sendDocument...` → YCloud | `whatsapp-chat.service.ts` (`enviarMensajeTexto`, `enviarMensajeMedia`) |
| **Fuera de la ventana de 24 h** | Solo se puede enviar una **plantilla aprobada**: `POST /api/whatsapp/ycloud/send-template` (con documento: `send-template-document`) | `ycloud.controller.ts`, `ycloud-window.service.ts` (`check-window`) |
| **Bot QuimIA** | Contesta y deriva a un asesor según horario y reglas; usa los mismos envíos por YCloud | `src/core/whatsapp/bot/*` |
| **Mensajes rápidos** | Textos predefinidos para agentes | `mensaje-rapido/*` |
| **Métricas y sincronización** | Reporte diario, por agente, tiempos de respuesta y conciliación con YCloud | `ycloud-metrics.service.ts`, endpoints `metrics/*` y `sync/*` |

Credenciales: el número y el token de cada cuenta están **en la base de datos** (`wha_cuenta`), no en el `.env`. En el `.env` solo van `WHATSAPP_SOCKET_PORT` y, si se usa, `YCLOUD_API_KEY`, `YCLOUD_WEBHOOK_VERIFY_TOKEN` y `YCLOUD_API_URL`.

## 2. Qué se retiró
- **Backend:** los endpoints `getListaCampanias`, `getDetalleCampania`, `getCampaniaById`, `saveCampania`, `sendCampania`, `deleteDetailCampaniaById`, `updateEstadoCampania` (en `/api/whatsapp`) y `campanias`, `campania`, `campania/enviar` (en `/api/whatsapp/ycloud`); el servicio de campañas y sus DTO; los envíos de campaña de `YcloudService`.
- **Front:** la opción de menú "Campañas" (Sistema → WhatsApp), sus 3 pantallas (listado, crear, editar), el diálogo de envío y sus llamadas de API.
- **Menú en la BD:** la opción sigue en `sis_opcion` hasta que se regenere el menú (`POST sistema/admin/generarOpciones` desde el front) o se desactive a mano. No molesta, solo no tiene pantalla.

## 3. Plan de acción (en orden)

### Fase 1: verificar la base (una vez)
1. **Cuenta WhatsApp en la BD:** comprobar que `wha_cuenta` tiene la cuenta activa de la empresa (número y token de YCloud).
2. **Webhook en YCloud:** en el panel de YCloud, registrar `https://<tu-api>/api/webhook/ycloud` con el mismo token de verificación del `.env` (`YCLOUD_WEBHOOK_VERIFY_TOKEN`).
3. **`HOST_API` correcto** en el `.env` (los archivos recibidos se sirven desde `HOST_API/api/whatsapp/media/...`).
4. **Prueba de ida y vuelta:** escribir al número desde un teléfono, comprobar que aparece en el chat del ERP y responder desde el ERP.

### Fase 2: operación diaria sin campañas
1. **Atención 1:1** desde el chat del ERP dentro de la ventana de 24 h.
2. **Fuera de la ventana:** usar plantillas **aprobadas** por Meta (`send-template`). Mantener un catálogo corto de plantillas útiles y transaccionales: confirmación de pedido, proforma enviada, aviso de entrega, recordatorio de pago, respuesta a consulta. Aprobar las plantillas en YCloud/Meta antes de usarlas.
3. **Bot QuimIA** para el primer contacto, con derivación a asesor: revisar horario, productos no disponibles y mensajes de bienvenida.
4. **Mensajes rápidos** para respuestas repetidas (precios, horarios, formas de pago).
5. **Asignación de agentes** para que cada chat tenga responsable (`assign-agent`).

### Fase 3: alternativas a las campañas masivas
- **Avisos puntuales a un cliente concreto** (proforma, estado de pedido, cobranza) con **plantilla de utilidad**, enviados desde la ficha del cliente o la proforma, solo a quien ya tiene relación con la empresa.
- **Promociones o novedades de producto:** correo (módulo de correo/campañas de email) o el catálogo de WhatsApp Business, en lugar de envíos masivos por WhatsApp.
- **Consentimiento (opt-in):** guardar de dónde viene el permiso del cliente para recibir mensajes y respetar las bajas.
- Revisar con YCloud/Meta qué categorías de plantilla y qué volúmenes de envío permiten las **políticas vigentes** antes de automatizar cualquier envío nuevo.

### Fase 4: monitoreo
1. **Métricas** (`metrics/daily`, `metrics/agents`, `metrics/response-time`) y pantalla "Métricas YCloud": revisar tiempos de respuesta y volumen.
2. **Sincronización** (`sync/log`, `sync/reconcile`): revisar mensajes pendientes y errores de conciliación con YCloud.
3. **Log del backend:** vigilar errores de YCloud (token vencido, plantilla rechazada, número inválido).
4. **Calidad del número** en Meta Business: mantenerla alta (pocas quejas, respuestas rápidas) para no perder límites de envío.

### Fase 5: limpieza
- **Quitar la opción "Campañas" del menú:** en Administración → Opciones: 1) pulsar **Importar** (marca como inactivas las opciones que ya no están en el archivo de menú); 2) pulsar **Borrar rutas no usadas** (solo administradores): compara el archivo de menú contra `sis_opcion`, muestra las rutas obsoletas y, al aceptar, borra sus permisos (`sis_perfil_opcion`) y las opciones (`sis_opcion`).
- Si no se necesita el histórico, archivar las tablas de campañas; no es urgente ni se borró nada.

## 4. Riesgos y vuelta atrás
- **Datos:** nada se eliminó de la base de datos. Las campañas anteriores siguen consultables por SQL.
- **Código:** el retiro está en commits separados; volver atrás es revertir esos commits (`git revert`).
- **Dependencia de YCloud:** si YCloud falla, no hay otro proveedor. Tener a mano el acceso al panel de YCloud y WhatsApp Business para responder manualmente si hace falta.

## 5. Pruebas para validar tras el despliegue
1. Mensaje entrante → aparece en el chat y sube el contador de no leídos.
2. Responder con texto, imagen y PDF desde el ERP.
3. Enviar una plantilla a un cliente de prueba (fuera de la ventana de 24 h).
4. Activar y desactivar el bot en un chat.
5. Abrir Métricas YCloud y Sincronización.
6. Confirmar que Sistema → WhatsApp ya no muestra "Campañas" y que ninguna URL de campañas responde (404).
