# SarahIA — Bot Comercial WhatsApp DIQUIMEC

## Descripción
Asistente virtual comercial especializado en venta de materias primas y productos químicos. Diseñado para calificar leads, responder consultas informativas y generar cotizaciones automáticas vía WhatsApp usando YCloud como BSP.

El nombre visible del bot (`nombre_bot`) es configurable por cuenta en `wha_bot_config`; el valor por defecto en código es `QuimIA` (usado solo si no hay config), pero la cuenta de DIQUIMEC está configurada como **SarahIA**.

---

## Flujo completo

```
Cliente escribe cualquier mensaje
        │
        ▼
[INICIO] → Guarda texto_inicial → Envía bienvenida con botones [⚡ Cotizar ahora / 👤 Hablar con asesor]
        │
        ▼
[ESPERANDO_CONFIRMACION]
  NO/ASESOR ──→ Deriva a asesor
  SI ──→ Clasifica texto_inicial (GPT + regex)
           ├─ PRODUCTO ──────────────────────→ [PREGUNTA_ES_CLIENTE] (o directo a [SELECCION_PRODUCTOS] si hay memoria)
           ├─ UBICACION/HORARIO/ENVIO/CATALOGO → responde info → [ATENCION_LIBRE]
           └─ GENERAL ────────────────────────→ [ATENCION_LIBRE]
        │
        ▼
[ATENCION_LIBRE]
  Detecta intención (regex rápido + GPT `clasificarConsulta`):
  ├─ UBICACION/HORARIO/ENVIO/CATALOGO → responde con template de `wha_bot_config` (ver más abajo)
  ├─ PRODUCTO   → [PREGUNTA_ES_CLIENTE] (o directo a [SELECCION_PRODUCTOS] si hay memoria)
  └─ GENERAL    → GPT responde en contexto (`prompt_sistema` de la cuenta)
        │
        ▼
[PREGUNTA_ES_CLIENTE]  — botones: [✅ Sí, soy cliente] [❌ No]
  SI ──→ [IDENTIFICACION]
  NO ──→ [DATOS_NUEVO_CLIENTE]
        │
        ├─ [IDENTIFICACION]
        │    Pide cédula/RUC → busca en gen_persona
        │    Encontrado:
        │      - Guarda: ide_geper, nombres, correo, telefono, direccion_registrada, ide_getid, ide_vgven
        │      - → [SELECCION_PRODUCTOS] (o directo a [ESPERANDO_CANTIDAD]/[CONFIRMACION_PRODUCTOS]
        │        si ya había un producto pendiente o productos acumulados)
        │    No encontrado → [DATOS_NUEVO_CLIENTE] (pide nombre + correo)
        │
        └─ [DATOS_NUEVO_CLIENTE]
             1. Pide nombre completo
             2. Pide correo electrónico
             Listo ──→ [SELECCION_PRODUCTOS] (mismo criterio de atajo que IDENTIFICACION)
        │
        ▼
[SELECCION_PRODUCTOS]  — captura de productos EN LOTE
  El cliente puede listar productos y cantidades en uno o varios mensajes seguidos
  (ej: "3kg cera de palma, 5kg cera de soya" en un solo mensaje, o uno por uno).
  Cada mensaje se acumula en `texto_acumulado` y se envía completo a
  `BotGptService.analizarLoteProductos()` PRIMERO (antes que cualquier otra clasificación),
  que en un solo call GPT decide:
    - "completo": true si el cliente escribió FIN (aislada) o dio a entender que ya
      terminó de listar ("eso es todo", "ya", "nada más"...). false → sigue acumulando
      (el bot responde solo un acuse breve "Anotado ✅...", sin tocar la BDD todavía).
    - "items": arreglo [{producto, cantidad}] con TODOS los productos mencionados hasta
      el momento (cantidad: número si vino explícita, 0 si el cliente pidió "cantidad
      mínima", null si no la mencionó).
  Solo si "items" viene VACÍO se evalúa si el mensaje es una consulta informativa mid-
  cotización (`clasificarConsulta` → UBICACION/HORARIO/ENVIO/CATALOGO). Este orden es
  importante: si la detección de consulta informativa corriera primero (como en una
  versión anterior), GPT podía clasificar erróneamente líneas de productos con varias
  cantidades (ej. "cera de coco 10kg, cera en gel 20kg") como CATALOGO y el bot
  respondía con los links de catálogo en vez de seguir acumulando — bug real detectado
  y corregido en producción.
  Cuando completo=true, los items pasan a `cola_productos` y arranca resolverColaProductos.
        │
        ▼
  resolverColaProductos — procesa la cola ítem por ítem, síncrono, hasta vaciarla o
  toparse con algo que requiera respuesta del cliente:
    Búsqueda por ítem:
      - Si el nombre matchea categoría genérica (sabor/saborizante/color/colorante/
        fragancia/aceite/esencia, sing. o plural) → SOLO búsqueda exacta (ILIKE frase
        completa / otro_nombre exacto), SIN fallbacks difusos. Evita falsos positivos
        tipo "de mango" → "MANTECA DE MANGO".
      - Si no es categoría genérica → cadena completa: ILIKE exacto → reducción
        progresiva de palabras → palabras significativas con score.
    Resultado del ítem:
      ├─ 0 resultados + categoría genérica → construye producto_pendiente con
      │    ide_inarti=2102 (artículo genérico), nombre=texto del cliente,
      │    es_generico=true → [ESPERANDO_USO_PRODUCTO] (se detiene a preguntar)
      ├─ 0 resultados + no genérico → se anota en "no encontrados" (aviso breve al
      │    final) y CONTINÚA con el siguiente ítem de la cola (no bloquea el lote)
      ├─ 1 resultado + cantidad ya conocida (incl. 0) → se agrega directo a
      │    `productos[]` sin preguntar nada, sigue con el siguiente ítem
      ├─ 1 resultado + cantidad desconocida → producto_pendiente = ese producto
      │    → [ESPERANDO_CANTIDAD] (se detiene a preguntar)
      └─ N resultados (>1) → guarda opciones_producto + item_cantidad_conocida
           → [SELECCION_MULTIPLE] (se detiene, pide *solo el número*)
    Cola vacía → finalizarColeccionProductos:
      - Si falta cliente.nombres → [PREGUNTA_ES_CLIENTE]
      - Si no → [CONFIRMACION_PRODUCTOS] con resumen
        │
        ├─ [SELECCION_MULTIPLE]
        │    Cliente responde número → si item_cantidad_conocida ya estaba seteado,
        │    se agrega directo y se sigue drenando la cola (resolverColaProductos);
        │    si no, → [ESPERANDO_CANTIDAD]
        │
        ├─ [ESPERANDO_CANTIDAD]
        │    Extrae cantidad (regex numérico → fallback GPT `extraerCantidad`)
        │    Agrega producto a `productos[]` (con uso_generico si aplica) y sigue
        │    drenando la cola (resolverColaProductos) — ya NO vuelve a preguntar
        │    "¿otro producto?" si aún quedan ítems pendientes del lote original.
        │
        └─ [ESPERANDO_USO_PRODUCTO]  (solo para ítems de categoría genérica sin match)
             Pregunta "¿para qué uso lo necesitas?" → guarda uso_generico
             Si item_cantidad_conocida ya estaba seteado (incl. 0) → agrega directo
             y sigue drenando la cola; si no → [ESPERANDO_CANTIDAD]
        │
        ▼
[CONFIRMACION_PRODUCTOS]  — botones: [✅ Confirmar pedido] [✏️ Modificar lista]
  Resumen: lista de productos + cantidades (cantidad=0 se muestra como
  "(cantidad mínima disponible)")
  MODIFICAR → reinicia [SELECCION_PRODUCTOS] (productos=[])
  CONFIRMAR →
        │
        ├─ Cliente registrado CON dirección/provincia guardada:
        │    "Tengo registrada esta info. ¿La utilizamos?"
        │    [✅ Sí, son correctos] [📝 Cambiar dirección]
        │    → [DATOS_ENVIO] pendiente=confirmar_envio_guardado
        │
        └─ Cliente sin dirección registrada / cliente nuevo:
             → [DATOS_ENVIO] pendiente=tipo_direccion
        │
        ▼
[DATOS_ENVIO]
  pendiente=confirmar_envio_guardado:
    Usar mismo → toma dirección/provincia guardadas → [DATOS_PAGO]
    Cambiar    → pendiente=tipo_direccion
  pendiente=usar_direccion_existente (flujo legacy, aún soportado):
    SI usar → toma direccion_registrada → pendiente=provincia
    NO usar → pendiente=tipo_direccion
  pendiente=tipo_direccion — botones: [📝 Escribir dirección] [📍 Mi ubicación]
  pendiente=direccion_texto:
    Pide "dirección completa + punto de referencia" → pendiente=provincia
  pendiente=esperar_ubicacion:
    WhatsApp envía location (lat, lng, name, address)
    → Geocodificación inversa con Nominatim (OSM)
    → muestra dirección obtenida → guarda lat, lng, dirección → pendiente=provincia
  pendiente=provincia:
    Pide provincia → → [DATOS_PAGO]
        │
        ▼
[DATOS_PAGO]  — botones: [💵 Efectivo] [💳 Tarjeta de crédito]
  (transferencia/depósito se tratan como efectivo)
        │
        ▼
[PROCESANDO PROFORMA]
  "⏳ Espera un momento..."
  Por cada producto:
    → buscarPrecioConfigurado(ide_inarti, cantidad, ideEmpr)
    → si precio: calcula con/sin IVA → precio_unitario, precio_total
  Condiciones:
    AUTOMÁTICA: todos tienen precio AND todos en catálogo
    CON_PRECIO:  todos tienen precio BUT alguno fuera de catálogo (ej. ítems genéricos)
    BORRADOR:    algún producto sin precio configurado (ítems genéricos casi siempre caen aquí)
  → En BORRADOR/CON_PRECIO, los productos que SÍ tienen precio configurado igual se
    escriben en `cxc_deta_proforma` (precio_ccdpr/total_ccdpr) — antes había un bug donde
    si UN SOLO producto no tenía precio, se salteaba el guardado de precios de TODOS los
    productos de la cotización (incluidos los que sí lo tenían), quedando en NULL. Corregido.
  → createProformaWeb (solicitante, detalles)
     · cada detalle envía `ideInarti` explícito (el que el bot ya resolvió) y
       `producto` = observación: nombre tal como lo escribió el cliente + " — Uso: X"
       (si aplica) + " - CANTIDAD MINIMA" (si cantidad=0). Se guarda en `observacion_ccdpr`.
  → UPDATE cabecera: ide_cctpr=3(WhatsApp), referencia='WhatsApp', ide_ccvap=6, ide_ccten=0,
      ide_geper (cliente real o 7712), identificac_cccpr, ide_getid, correo_cccpr,
      telefono_cccpr (formato local 0XXXXXXXXX), direccion_cccpr
  → UPDATE detalles: precio_ccdpr, total_ccdpr, iva_inarti_ccdpr (solo si automática)
  → UPDATE cabecera totales: base_grabada, valor_iva, total
  → Validar total > 0 antes de generar PDF

  AUTOMÁTICA + total>0:
    → asignarVendedor(ide_usua=32, ide_vgven=cliente.ide_vgven || 16)
    → generar PDF → guardar en whatsapp_media/ → enviar como documento (link público)
    → resumen financiero + botones [🛒 Nueva cotización] [👤 Hablar con asesor]
    → [FINALIZADO]

  CON_PRECIO / BORRADOR:
    → "Cotización #XXX registrada. Un asesor será asignado..."
    → deriva a ASESOR (con nota interna, incluye conteo de productos sin precio)
    → [FINALIZADO]

[FINALIZADO]
  NUEVA_COTIZACION → cierra sesión, crea una nueva:
    - si el cliente ya se identificó en la sesión que se cierra → conserva cliente
      (+ provincia) y salta directo a [SELECCION_PRODUCTOS] (no vuelve a preguntar)
    - si no hay cliente conocido → [PREGUNTA_ES_CLIENTE]
  HABLAR_ASESOR / palabra asesor → deriva a asesor
  Otro mensaje → "¿Puedo ayudarte con algo más?" + botones
```

---

## Comandos especiales (cualquier estado)

| Comando | Acción |
|---------|--------|
| `SALIR` | Deriva inmediatamente a asesor |
| `ASESOR`, `AGENTE`, `HUMANO`, `PERSONA`, `VENDEDOR` | Deriva a asesor |
| `FIN` (o cierre semántico detectado por GPT) | Cierra la captura de productos del lote actual |
| Saludo (`Hola`, `Buenas`, etc.) en estado activo | Cierra la sesión y arranca una nueva desde INICIO |

**Sesiones** (`BotSessionService`):
- Estados de flujo activo (`SELECCION_PRODUCTOS`, `SELECCION_MULTIPLE`, `ESPERANDO_CANTIDAD`, `ESPERANDO_USO_PRODUCTO`, `CONFIRMACION_PRODUCTOS`, `DATOS_ENVIO`, `DATOS_PAGO`, `PREGUNTA_ES_CLIENTE`, `IDENTIFICACION`, `DATOS_NUEVO_CLIENTE`, `ATENCION_LIBRE`) expiran a los **20 minutos** de inactividad.
- `INICIO` / `ESPERANDO_CONFIRMACION` (sesión que no avanzó) expiran a las **4 horas**.

---

## Respuestas informativas (configurables, NO hardcodeadas)

`responderInfo()` lee siempre de columnas dedicadas en `wha_bot_config` por cuenta — no hay texto fijo en código:

| Tipo    | Columna            |
|---------|---------------------|
| UBICACION | `resp_ubicacion` (+ pin de mapa si `lat_empresa`/`lng_empresa` están configurados) |
| HORARIO   | `resp_horario` |
| ENVIO     | `resp_envio` |
| CATALOGO  | `resp_catalogo` |

Los templates admiten placeholders `{BOT_NOMBRE}` y `{NOMBRE_EMPRESA}`. Si una columna es `NULL`, el bot **no envía nada** para ese tipo de consulta (se registra un warning) — deben estar siempre configuradas antes de activar el bot.

---

## Búsqueda de productos

**Flujo normal** (nombre de producto no genérico) — 3 niveles:
1. **ILIKE exacto** — `nombre_inarti ILIKE '%texto%' OR otro_nombre_inarti = texto` (coincidencia exacta sin tildes/mayúsculas)
2. **Reducción progresiva** — quita una palabra del final por iteración hasta encontrar match (mínimo 2 palabras)
3. **Palabras significativas** — elimina stop words, busca por OR con score ≥ 2 palabras coincidentes

**Categorías genéricas** (sabor/saborizante/color/colorante/fragancia/aceite/esencia, singular o plural): **solo** se ejecuta el nivel 1 (ILIKE exacto). Si no hay match, se trata directo como "no encontrado" — no se intentan los niveles 2 y 3, para evitar falsos positivos por coincidencia de una sola palabra (ej. "saborizante de mango" no debe matchear "MANTECA DE MANGO" solo porque comparten "mango").

Cuando coincide por `otro_nombre_inarti` (no por nombre principal) → muestra `NOMBRE / OTRO_NOMBRE`.

### Productos sin match en categoría genérica → ítem genérico
Si un producto de categoría genérica no tiene match en catálogo, el bot no repite la pregunta ni entra en bucle: pregunta para qué uso lo necesita, pide la cantidad (o usa la ya detectada por GPT) y lo agrega a la cotización asociado al **artículo genérico `ide_inarti = 2102`**, con el nombre tal como lo escribió el cliente. Ese ítem normalmente queda sin precio configurado → la cotización cae en modo BORRADOR y un asesor la completa manualmente. **Prerrequisito de datos**: el artículo `2102` debe existir, estar activo, y (idealmente) sin precio configurado / fuera de catálogo, para que nunca dispare una cotización automática con precio $0.

---

## Geocodificación inversa

Cuando el cliente comparte ubicación WhatsApp:
- Se capturan lat, lng desde el webhook `data.location`
- Se llama a **Nominatim (OpenStreetMap)**: `GET /reverse?lat={lat}&lon={lng}&format=json&accept-language=es`
- Se extrae: road + house_number + suburb + city
- Se guarda en `EnvioSesion.direccion` (texto), `.latitud`, `.longitud`
- El cliente ve la dirección obtenida confirmada en el chat

---

## Idempotencia de webhooks (YCloud)

`YcloudService.insertMensajeInbound()` deduplica por `wamid` (`data.wamid || data.id`) contra `wha_mensaje.id_whmem`. Si YCloud reintenta el mismo webhook (timeout, respuesta no-2xx, etc.), `processInboundMessage()` corta el flujo apenas detecta el duplicado — **no** vuelve a invocar al bot ni a las notificaciones de ventana/gateway. Antes de esta corrección, el insert se deduplicaba correctamente pero el resto del pipeline (incluido `messageHandler` del bot) igual se ejecutaba de nuevo, generando respuestas duplicadas del bot para el mismo mensaje del cliente.

---

## Echoes de WhatsApp nativo (agente escribiendo fuera del dashboard)

Cuando un agente escribe un mensaje directo desde la app nativa de WhatsApp (o WhatsApp Web) — es decir, sin pasar por el dashboard/API de DIQUIMEC — YCloud reenvía ese mensaje como un evento `whatsapp.smb.message.echoes`, manejado por `YcloudService.processEchoMessage()`.

**Antes:** este handler solo reseteaba `no_leidos_whcha`/`leido_whcha` — **no guardaba el mensaje en `wha_mensaje`**. Eso significaba que si un agente escribía primero a un contacto (ej. un proveedor, o un cliente al que se le hace seguimiento manual) directamente desde la app, el chat quedaba sin ningún registro de que un humano ya había intervenido. Cuando esa persona respondía, el bot corría el chequeo "¿el chat es nuevo?" (`processMessage`, sección `El bot global solo inicia en chats nuevos`), no encontraba historial en `wha_mensaje`, y se auto-iniciaba con el saludo — aunque la conversación en WhatsApp ya llevaba varios mensajes. Peor aún: el chequeo `tieneAgenteHumano` (que corre en **cada** mensaje, no solo al inicio, y es un opt-out **permanente** del bot para ese chat) tampoco detectaba nada, así que el bot podía seguir interviniendo indefinidamente en una conversación que un agente ya estaba llevando manualmente.

**Ahora:** `processEchoMessage()`:
1. Resuelve la cuenta por `id_telefono_whcue` (formato con el que YCloud manda `data.from` en este tipo de evento) y traduce a `id_cuenta_whcue` (convención usada en el resto del código).
2. Llama a `upsertChat({..., isInbound: false})` — crea el chat si no existía (ej. el agente inició la conversación) o lo actualiza si ya existía, **sin auto-activar el bot** en ningún caso (los chats que nacen de un mensaje saliente nunca se auto-activan, sin importar `MODE`/horario — un humano ya está a cargo).
3. Guarda el mensaje en `wha_mensaje` vía `insertMensajeEcho()` (`direction_whmem=1`, deduplicado por `wamid`, igual que los mensajes entrantes).

`upsertChat()` también se corrigió para que, en su rama `ON CONFLICT` (chat ya existente), **solo** marque el chat como no leído / actualice `ultimo_ingreso_cliente_whcha` cuando `isInbound=true` — antes lo hacía siempre, así que una llamada para un echo saliente sobre un chat existente habría marcado el chat como "no leído" y sobrescrito con `NULL` la fecha del último mensaje real del cliente.

---

## Configuración técnica

### Control por ambiente (`MODE=DEV` / `MODE=PROD`)

Dos reglas de activación automática del bot solo aplican en producción (`envs.mode === 'PROD'`), para no interferir con pruebas en DEV:

| Regla | Dónde | Comportamiento en DEV | Comportamiento en PROD |
|-------|-------|------------------------|--------------------------|
| Auto-activación de chats nuevos | `YcloudService.upsertChat()` | Un chat nuevo siempre arranca con `bot_activo_whcha=FALSE` / `bot_modo_whcha='ASESOR'`, sin importar `activo_manual` ni horario. Hay que activarlo manualmente por chat (`POST bot/toggle-chat` con `activar: true`) para probar el bot. | Un chat nuevo arranca con `bot_activo_whcha = BotConfigService.isBotActive(ideWhcue)` — es decir, `activo_manual OR (usa_horario AND en horario)`. Si la cuenta usa horario, un chat que llega dentro del horario configurado arranca directo en modo BOT aunque `activo_manual` esté en FALSE. |
| Horario automático | `BotConfigService.isBotActive()` + `BotScheduleService.evaluarHorarioBot()` (cron cada minuto) | `isBotActive()` ignora `usa_horario`/`estaEnHorario` — el bot global solo se activa vía `activo_manual` explícito. El cron de horario ni siquiera se ejecuta. | Funciona con normalidad: `isBotActive()` evalúa horario, y el cron corre cada minuto. |

Chats que ya estaban en modo BOT antes de cambiar a DEV (o activados manualmente durante las pruebas) siguen respondiendo con normalidad en cualquier ambiente — `bot_activo_whcha`/`bot_modo_whcha` de un chat existente **nunca** se tocan en el upsert (`ON CONFLICT DO UPDATE` no los incluye); el gate por ambiente solo afecta el valor inicial de chats **nuevos** y la activación por horario, no apaga el bot globalmente ni reescribe chats existentes.

**Nota de diseño en DEV:** la única forma de que el bot responda un chat es que ese chat tenga `bot_activo_whcha=TRUE` y `bot_modo_whcha='BOT'` — ambos campos siempre se escriben juntos (nunca divergen) en todo el código (`upsertChat`, `liberarChat`, `derivarAsesor`, `toggle-chat`), así que en la práctica es un único gate. En DEV nada los pone en `TRUE` automáticamente — solo el toggle manual por chat.

**Endpoint para que el front detecte el ambiente:** `GET whatsapp/bot/environment` → `{ mode: 'DEV'|'PROD', esDev: boolean }`. También viene incluido en `GET whatsapp/bot/status/:ideWhcue` y `GET whatsapp/bot/config/:ideWhcue` (mismos dos campos), para no forzar una llamada extra si el front ya consume esos endpoints.

### Proforma WhatsApp — constantes
```typescript
IDE_CCTPR_WHATSAPP  = 3   // Tipo proforma WhatsApp
IDE_CCVAP_WHATSAPP  = 6   // Canal de venta
IDE_CCTEN_WHATSAPP  = 0   // ide_ccten
REFERENCIA          = 'WhatsApp'
IDE_USUA_BOT        = 32  // Usuario bot (cotización automática)
IDE_VGVEN_DEFAULT   = 16  // Vendedor por defecto (si el cliente no tiene ide_vgven propio)
PRODUCTO_GENERICO_IDE_INARTI = 2102  // Artículo genérico para sabor/color/fragancia/aceite sin match
```

### Teléfono formato local
`+593983113543` → `0983113543` (función `toLocalPhone`, equivale a SQL `f_phone_number`)

### Endpoint `createProformaWeb` — campo `ideInarti`
`DetalleItemDto` acepta un campo opcional `ideInarti`. Si viene presente, el backend lo usa directo para `cxc_deta_proforma.ide_inarti` **en vez de** resolverlo por coincidencia exacta de nombre contra `inv_articulo` (`lookupArticulos`). El bot siempre lo envía (ya conoce el `ide_inarti` real de su propia búsqueda); el formulario web público sigue funcionando por nombre al no enviarlo. Esto permite que `producto` (que se guarda tal cual en `observacion_ccdpr`) incluya texto adicional ("— Uso: ...", "- CANTIDAD MINIMA") sin romper el emparejamiento del artículo.

**Nota para frontend**: el endpoint `GET getProformaByID` ya devuelve `observacion_ccdpr` por línea junto a `nombre_inarti`. En la pantalla de detalle de proforma (`/dashboard/proformas/:id/details`), cuando `ide_inarti = 2102` (o cuando `observacion_ccdpr` sea más específico que `nombre_inarti`), conviene mostrar `observacion_ccdpr` como texto principal del producto para que el asesor vea literalmente lo que pidió el cliente.

### Variables de estado (wha_bot_sesion.datos_sesion JSONB)
```typescript
{
  texto_inicial?: string
  memoria_cargada?: boolean
  cliente?: {
    ide_geper?: number          // PK gen_persona (cliente registrado)
    ide_getid?: number          // Tipo de identificación
    ide_vgven?: number          // Vendedor asociado al cliente
    identificacion?: string
    nombres: string
    correo: string
    telefono?: string
    direccion_registrada?: string  // dirección de gen_persona
    es_cliente_registrado: boolean
    pendiente_campo?: 'nombres' | 'correo'
  }
  productos: [{
    ide_inarti: number
    nombre: string
    cantidad: number            // 0 = "cantidad mínima disponible"
    siglas_unidad: string
    en_catalogo: boolean
    uso_generico?: string       // solo ítems de categoría genérica (sabor/color/etc.)
    precio_unitario?: number
    precio_total?: number
    tiene_precio?: boolean
  }]
  opciones_producto?: [...]           // candidatos durante SELECCION_MULTIPLE
  producto_pendiente?: {              // ítem en resolución (ESPERANDO_CANTIDAD / ESPERANDO_USO_PRODUCTO)
    ide_inarti, nombre, siglas_unidad, nombre_unidad, en_catalogo,
    es_generico?: boolean, uso_generico?: string
  }
  texto_acumulado?: string            // buffer de texto mientras el cliente sigue listando (antes de FIN)
  cola_productos?: [{ producto: string; cantidad: number | null }]  // ítems del lote aún sin resolver
  item_cantidad_conocida?: number | null  // cantidad ya detectada por GPT para el ítem que bloquea el flujo
  envio?: {
    direccion?: string
    provincia?: string
    latitud?: number
    longitud?: number
    pendiente_campo?: 'confirmar_envio_guardado' | 'usar_direccion_existente' | 'tipo_direccion' |
                      'direccion_texto' | 'esperar_ubicacion' | 'provincia'
  }
  forma_pago?: 'cash' | 'credit'
  proforma_ide?: number
  proforma_secuencial?: string
}
```

---

## Arquitectura de servicios

| Servicio | Responsabilidad |
|----------|----------------|
| `BotService` | Máquina de estados, orquestación, captura de productos en lote (`resolverColaProductos`) |
| `BotConfigService` | Config bot desde wha_bot_config (cache Redis) |
| `BotSessionService` | Sesiones con TTL (20 min en flujo activo, 4h en INICIO) en wha_bot_sesion |
| `BotToolsService` | Queries BD: clientes (con dirección), búsqueda de productos, artículo por id (`obtenerProductoPorId`), precios |
| `BotGptService` | OpenAI: clasificación de intenciones/consultas, extracción de cantidad, extracción de lote de productos (`analizarLoteProductos`), generación de respuestas |
| `BotProformaService` | Creación de proforma + precios + totales cabecera + observación por línea |
| `YcloudService` | Envío mensajes/botones/documentos, geocodificación inversa (Nominatim) |
| `FileTempService` | Guardado PDF en whatsapp_media/ |

---

## Mejoras sugeridas

### Implementadas recientemente
- ✅ Captura de productos en lote (uno o varios mensajes, cierre por FIN o detección semántica de GPT) en vez de un producto a la vez.
- ✅ Búsqueda más estricta para categorías genéricas (sabor/color/fragancia/aceite) — evita falsos positivos por coincidencia de una sola palabra.
- ✅ Flujo de "producto genérico" (`ide_inarti=2102`) para categorías sin match, evitando el bucle de "no tenemos X".
- ✅ Observación de la proforma con el nombre real escrito por el cliente + uso + marca de "cantidad mínima".
- ✅ Saludo inicial y textos clave más breves y orientados a motivar continuar con el bot.

### Corto plazo
1. **Template aprobado**: reemplazar mensaje de texto bienvenida por template WhatsApp Business cuando esté aprobado (pendiente en `handleInicio`).
2. **Botones interactivos en más pasos**: el paso de provincia podría tener botones con las provincias más frecuentes (Pichincha, Guayas, etc.).
3. **Resumen previo a pago**: mostrar dirección + provincia + forma de pago antes de crear proforma para que el cliente confirme todo.
4. **Historial de cotizaciones**: en clientes registrados, mostrar "tu última cotización fue #XXX" para reorden rápido.
5. **Frontend de proformas**: mostrar `observacion_ccdpr` en el detalle cuando el artículo sea el genérico (2102), para que el asesor vea el texto literal del cliente.

### Mediano plazo
6. **Actualizar gen_persona**: cuando un cliente registrado cambia su dirección via bot, ofrecer actualizar la BD.
7. **Imágenes de productos**: en selección múltiple, enviar foto del producto si existe en el catálogo.
8. **Stock en tiempo real**: informar disponibilidad inmediata al mostrar el producto.
9. **Notificación al cliente**: cuando el asesor completa la cotización borrador, notificar al cliente via WhatsApp automáticamente.
10. **GPT con RAG**: alimentar el modelo con fichas técnicas de productos para respuestas más precisas sobre composición, usos y aplicaciones.

### Largo plazo
11. **Pedido automático**: cuando el cliente confirma y paga, generar orden de venta directamente.
12. **Dashboard analítico**: tasa de conversión, productos más cotizados, abandono por estado, tiempo promedio de respuesta.
13. **Multi-idioma**: soporte básico para inglés (clientes de importación/exportación).
14. **Integración pagos**: link de pago directo en el mensaje de cotización (Payphone, Kushki).
