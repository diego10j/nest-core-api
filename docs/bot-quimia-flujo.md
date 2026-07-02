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
           ├─ PRODUCTO ──────────────────────→ [PREGUNTA_ES_CLIENTE] (o directo a
           │     procesarTextoProductos(texto_inicial) si hay memoria — ver nota)
           ├─ UBICACION/HORARIO/ENVIO/CATALOGO → responde info → [ATENCION_LIBRE]
           └─ GENERAL ────────────────────────→ [ATENCION_LIBRE]
        │
        ▼
[ATENCION_LIBRE]
  Detecta intención (regex rápido + GPT `clasificarConsulta`):
  ├─ UBICACION/HORARIO/ENVIO/CATALOGO → responde con template de `wha_bot_config` (ver más abajo)
  ├─ PRODUCTO   → [PREGUNTA_ES_CLIENTE] (o directo a procesarTextoProductos(texto) si hay memoria — ver nota)
  └─ GENERAL    → GPT responde en contexto (`prompt_sistema` de la cuenta)

  > **Nota (bug corregido 2026-07-02):** cuando el cliente ya tiene memoria cargada
  > (`cliente.nombres && memoria_cargada`) y su mensaje se clasifica como PRODUCTO, antes
  > se cambiaba el estado a `SELECCION_PRODUCTOS` y se mandaba el mensaje genérico
  > "Dime los productos..." — **descartando** el contenido que el cliente ya había escrito
  > (ej. "quiero 5kg cera de palma" se ignoraba por completo). Ahora se llama de inmediato
  > a `procesarTextoProductos()` (lógica extraída de `handleSeleccionProductos`) con ese
  > mismo texto, así el producto ya mencionado se procesa en el acto sin pedirlo de nuevo.
  > Pendiente (no corregido aún, caso menos frecuente): cuando el cliente NO tiene memoria
  > cargada, pasa primero por `PREGUNTA_ES_CLIENTE`/`IDENTIFICACION` y el texto original con
  > el producto se pierde igual — al llegar a `SELECCION_PRODUCTOS` después de identificarse
  > vuelve a mostrar el mensaje genérico en vez de recordar lo que pidió al principio.
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
        │    No encontrado → [DATOS_NUEVO_CLIENTE] (solo pide nombre)
        │
        └─ [DATOS_NUEVO_CLIENTE]
             Pide nombre completo (ya NO pide correo — se usa `info@diquimec.com.ec`
             por defecto, mismo criterio que un cliente existente sin correo registrado)
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
  resolverColaProductos — resuelve TODA la cola contra catálogo primero (Fase 1,
  silenciosa), y solo AL FINAL agrupa las preguntas pendientes por tipo (Fase 2) en vez
  de preguntar una por una — el objetivo es agilidad: un asesor experto no hace 5
  preguntas cuando puede resolver todo en 1-2.

  **Fase 1 — resolución silenciosa** (recorre toda la cola sin enviar nada al cliente):
    Búsqueda por ítem:
      - Si el nombre matchea categoría genérica (sabor/saborizante/color/colorante/
        fragancia/aceite/esencia, sing. o plural) → SOLO búsqueda exacta (ILIKE frase
        completa / otro_nombre exacto), SIN fallbacks difusos. Evita falsos positivos
        tipo "de mango" → "MANTECA DE MANGO".
      - Si no es categoría genérica → cadena completa: ILIKE exacto → reducción
        progresiva de palabras → palabras significativas con score.
    Resultado del ítem:
      ├─ 0 resultados + categoría genérica → se agrega a `pendientes_uso[]`
      │    (ide_inarti=2102, nombre=texto del cliente, cantidad_conocida=la ya detectada)
      │    — NO bloquea, sigue con el siguiente ítem de la cola
      ├─ 0 resultados + no genérico → se anota en `noEncontrados` (aviso breve al
      │    final) y CONTINÚA con el siguiente ítem (no bloquea el lote)
      ├─ 1 resultado + cantidad ya conocida (incl. 0) → se agrega directo a
      │    `productos[]` sin preguntar nada, sigue con el siguiente ítem
      ├─ 1 resultado + cantidad desconocida → se agrega a `pendientes_cantidad[]`
      │    — NO bloquea, sigue con el siguiente ítem
      └─ N resultados (>1) → ESTO SÍ bloquea de inmediato: guarda opciones_producto
           (+ pendientes_uso/pendientes_cantidad acumulados hasta ahora) →
           [SELECCION_MULTIPLE] (pide *solo el número*)

  **Fase 2 — preguntas agrupadas** (solo si la cola se vació sin necesitar desambiguar):
      ├─ `pendientes_uso.length > 0` → UN solo mensaje listando todos los productos
      │    genéricos pendientes y pidiendo el uso de cada uno → [ESPERANDO_USO_LOTE]
      │    (si es 1 solo, la pregunta es igual de natural que antes: "Para cotizar
      │    X, ¿para qué uso lo necesitas?"; si son varios, lista numerada +
      │    "Ejemplo: 1. repostería, 2. ambiental")
      ├─ si no, `pendientes_cantidad.length > 0` → UN solo mensaje pidiendo la
      │    cantidad de todos los pendientes → [ESPERANDO_CANTIDAD_LOTE]
      └─ si no queda nada pendiente → finalizarColeccionProductos:
           - Si falta cliente.nombres → [PREGUNTA_ES_CLIENTE]
           - Si no → [CONFIRMACION_PRODUCTOS] con resumen
        │
        ├─ [SELECCION_MULTIPLE]
        │    Cliente responde número → si item_cantidad_conocida ya estaba seteado,
        │    se agrega directo y se sigue resolviendo (resolverColaProductos); si no,
        │    se agrega a `pendientes_cantidad[]` (se pregunta agrupado más adelante,
        │    NO de inmediato) y también se sigue resolviendo.
        │
        ├─ [ESPERANDO_USO_LOTE]  (uno o varios productos genéricos a la vez)
        │    `BotGptService.extraerUsosPorProducto(nombres, respuesta)` mapea la
        │    respuesta libre del cliente a cada producto en el mismo orden que se
        │    preguntaron — puede responder todo junto ("1. repostería 2. ambiental")
        │    o uno a la vez. Los que ya tenían cantidad conocida se agregan directo;
        │    el resto pasa a `pendientes_cantidad[]`. Los que GPT no pudo mapear se
        │    vuelven a preguntar (solo esos) en un mensaje corto de confirmación.
        │    Al terminar, sigue resolviendo (resolverColaProductos).
        │
        └─ [ESPERANDO_CANTIDAD_LOTE]  (uno o varios productos ya identificados)
             `BotGptService.extraerCantidadesPorProducto(nombres, respuesta)` — misma
             mecánica que arriba pero para cantidades (entiende número, "cantidad
             mínima" y "al por mayor"/mayorista → ambos como 0). Al terminar, agrega
             los productos resueltos y sigue resolviendo (resolverColaProductos).
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
  NUEVA_COTIZACION → cierra la sesión actual como FINALIZADO (no CANCELADO — ver nota)
    y crea una nueva:
    - si el cliente ya se identificó en la sesión que se cierra → conserva cliente
      (+ provincia) y salta directo a [SELECCION_PRODUCTOS] (no vuelve a preguntar)
    - si no hay cliente conocido → [PREGUNTA_ES_CLIENTE]
  HABLAR_ASESOR / palabra asesor → deriva a asesor
  Otro mensaje → "¿Puedo ayudarte con algo más?" + botones

  > **Nota (bug corregido 2026-07-02):** `handlePostCotizacion` solo se invoca con
  > `sesion.estado === FINALIZADO` (cotización ya generada con éxito). La rama
  > NUEVA_COTIZACION cerraba esa sesión con `cerrar(ide_whbse, BotState.CANCELADO)` —
  > sobrescribiendo su estado de FINALIZADO a CANCELADO. Como `getMemoriaCliente()`
  > excluía explícitamente sesiones `CANCELADO`/`EXPIRADO`, esa cotización exitosa dejaba
  > de servir como fuente de memoria para el cliente en conversaciones futuras. Por eso,
  > tras pedir una "Nueva cotización", el bot con el tiempo dejaba de reconocer al cliente
  > (saludo genérico en vez de "¡Hola de nuevo, NOMBRE!", y volvía a pedir identificación).
  > Corregido en dos frentes: (1) se cierra como `BotState.FINALIZADO` (su estado real),
  > no `CANCELADO`; (2) `getMemoriaCliente()` (`bot-session.service.ts`) ya NO filtra por
  > `estado` — solo exige `cliente.nombres` capturado. El mismo problema volvió a aparecer
  > por otro lado: los fixes de `derivarAsesor`/`liberarChat` (ver sección de arriba) cierran
  > sesiones colgadas como `CANCELADO` para evitar el bug de resumen con GPT, pero esas
  > sesiones podían tener un `cliente.nombres` perfectamente válido capturado antes de
  > quedar atascadas — que el cliente ya se haya identificado no depende de si la cotización
  > se completó, canceló o expiró después.
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
- Estados de flujo activo (`SELECCION_PRODUCTOS`, `SELECCION_MULTIPLE`, `ESPERANDO_CANTIDAD`, `ESPERANDO_CANTIDAD_LOTE`, `ESPERANDO_USO_LOTE`, `CONFIRMACION_PRODUCTOS`, `DATOS_ENVIO`, `DATOS_PAGO`, `PREGUNTA_ES_CLIENTE`, `IDENTIFICACION`, `DATOS_NUEVO_CLIENTE`, `ATENCION_LIBRE`) expiran a los **20 minutos** de inactividad.
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

### Serialización por chat (condición de carrera)

Aun con el dedupe de wamid, dos mensajes **distintos** del mismo chat que llegan casi al mismo tiempo (el cliente escribe rápido, dos mensajes separados) se procesaban en **paralelo** — ambos leían `wha_bot_sesion.datos_sesion` antes de que el primero terminara de guardar su resultado, así que el segundo pisaba el progreso del primero al escribir. Síntoma real reportado: cliente envía "5kg de cera de palma" y luego, en un mensaje aparte, "FIN" — el bot respondía "Aún no has agregado ningún producto", como si `texto_acumulado` del primer mensaje nunca se hubiera guardado.

### `derivarAsesor` debe cerrar la sesión activa (bug corregido 2026-07-02)

`derivarAsesor()` solo cambiaba `bot_activo_whcha`/`bot_modo_whcha` en `wha_chat` — **no cerraba** la sesión de bot que estuviera activa (`wha_bot_sesion.activa = TRUE`). Si el cliente escribía "ASESOR"/"SALIR" (detección global, la más común) en medio de un flujo — ej. en `DATOS_ENVIO` o `ESPERANDO_CANTIDAD` — la sesión quedaba viva con ese estado intermedio (ni `FINALIZADO` ni `CANCELADO`). Cuando un agente reactivaba el chat después vía `POST bot/liberar-chat/:ideWhcha` (que por defecto llama a `iniciarConContextoChat`), ese método encontraba la sesión colgada en estado no terminal y, en vez de tomar el atajo "sesión anterior finalizada/cancelada → esperar en silencio", intentaba **adivinar el contexto con GPT** usando el historial de mensajes de la conversación abandonada — generando respuestas confusas mezclando datos viejos (ej. "¡Hola, Arleth! ... necesito la dirección de entrega de los 10kg de cera de coco" a partir de una conversación de horas antes que nunca se completó). Como esta lógica no es determinista, cada reactivación podía producir una respuesta ligeramente distinta.

**Corregido:** `derivarAsesor()` ahora cierra (`BotSessionService.cerrar(..., BotState.CANCELADO)`) cualquier sesión activa del chat, sin importar desde qué punto del código se haya llamado. Con la sesión correctamente en `CANCELADO`, `iniciarConContextoChat` toma el atajo esperado (espera en silencio el próximo mensaje real del cliente, que arranca un `INICIO` limpio) en vez de intentar resumir con GPT.

**Red de seguridad adicional en `liberarChat()` (mismo bug, retroactivo):** el fix de `derivarAsesor()` solo previene el problema **hacia adelante** — no corrige sesiones que ya hubieran quedado colgadas de pruebas/uso anterior al fix. Por eso `BotService.liberarChat()` (llamado tanto por `POST bot/toggle-chat` como por `POST bot/liberar-chat/:ideWhcha`, éste último el que dispara `iniciarConContextoChat`) ahora también verifica si existe una sesión `activa=TRUE` para el chat y la cierra como `CANCELADO` antes de continuar — autocorrige cualquier chat con una sesión colgada de antes del fix, sin necesidad de limpiar datos a mano.

**Fix:** `BotService.processMessage()` ahora es un wrapper delgado que encola la ejecución real (`processMessageInternal`) en `chatLocks: Map<ideWhcha, Promise<void>>` — cada mensaje nuevo de un chat espera a que el anterior del **mismo** chat termine (leer sesión → procesar → guardar) antes de empezar el suyo. Mensajes de chats distintos siguen procesándose en paralelo sin bloquearse entre sí. Es un lock en memoria del proceso Node — cubre condiciones de carrera dentro de la misma instancia; si en el futuro se corre más de una instancia del backend detrás de un balanceador, este lock no protege entre instancias (haría falta uno basado en Redis).

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

## Detección de "chat nuevo" (2 capas) y su relación con el toggle global

`processMessage` (`bot.service.ts`) decide si un chat es genuinamente nuevo en 2 capas, para no perder leads cuando la BD local no tiene historial completo (ej. un contacto que ya escribía a DIQUIMEC antes de conectar el webhook):

1. **Capa 1 (local):** ¿existe alguna fila en `wha_bot_sesion` para este chat? Si sí, no es nuevo.
2. **Capa 2 (YCloud, fuente de verdad):** si no hay sesión local, se consulta `YcloudService.hasPriorMessages(waId)` — `GET /whatsapp/messages?phoneNumber=...` — para ver si YCloud tiene registro de mensajes previos con ese número, aunque nuestra BD no los tenga.

**Bug corregido:** `hasPriorMessages` llamaba a la API de YCloud con el número en formato "solo dígitos" (`waId`, sin `+`), mientras que el resto de llamadas a la API de YCloud en este servicio siempre usan formato E.164 con `+` (ver `sendText`/`saveMessageSent`). Esto podía producir falsos negativos — un chat con historial real quedaba marcado como `esChatNuevo=true`. Corregido: se normaliza a `+<número>` antes de consultar, y se agregó logging (`[hasPriorMessages]`) para diagnosticar futuros casos.

**Comportamiento confirmado (por diseño, no es un bug) — depende del ambiente:**

- **En PROD:** un chat genuinamente nuevo (`esChatNuevo=true`, sin mensajes ni en `wha_bot_sesion`/`wha_mensaje` ni en la API de YCloud) **SIEMPRE** activa el bot y recibe el saludo — sin importar `activo_manual` ni horario. Es el primer contacto real de esa persona con la empresa y no debe perderse aunque el bot esté apagado globalmente en ese momento. El toggle global (`isBotActive`) solo aplica a chats que **ya tienen historial** (`esChatNuevo=false`) — ahí sí gobierna por completo si el bot responde o no.
- **En DEV:** un chat nuevo **nunca** se auto-activa, sin importar el estado global del bot. En DEV la única forma de que un chat responda es activarlo manualmente por chat desde el front (`bot/toggle-chat`) — igual que el resto del control por ambiente (sección siguiente). El chequeo de `MODE` corre primero, antes de cualquier otra lógica de activación de chat nuevo.

Por eso la corrección del formato en `hasPriorMessages` es crítica en PROD: un falso "no tiene historial" activaría el bot indebidamente incluso con el toggle global apagado — ese fue el bug reportado y corregido.

**Código muerto/conflictivo eliminado (2026-07-02):** justo antes de `getOrCreate`, había un bloque legacy (anterior al mecanismo de 2 capas de arriba) que volvía a chequear `wha_bot_sesion` y, si no existía, buscaba CUALQUIER fila en `wha_mensaje` con `direction_whmem != '0'` (cualquier mensaje saliente, de humano o del propio bot) para decidir "omitir inicio automático". Esto no solo era redundante con la Capa 1 — podía **contradecir** la decisión ya tomada por `esChatNuevo`: si `esChatNuevo=true` (confirmado sin sesión local y sin historial en YCloud) pero existía cualquier fila saliente suelta en `wha_mensaje` (ej. un mensaje de campaña previo, o un catch-up de `insertOutboundMessage`), este bloque viejo bloqueaba la respuesta igual, silenciosamente, pisando la regla confirmada de "chat nuevo siempre responde en PROD". Eliminado — la detección de chat nuevo/con historial de asesor ya vive completa en el mecanismo de 2 capas + el chequeo preciso `tieneAgenteHumano` (que sí filtra mensajes del bot vía `es_bot_whmem`, a diferencia del bloque eliminado).

---

## Configuración técnica

### Control por ambiente (`MODE=DEV` / `MODE=PROD`)

Dos reglas de activación automática del bot solo aplican en producción (`envs.mode === 'PROD'`), para no interferir con pruebas en DEV:

| Regla | Dónde | Comportamiento en DEV | Comportamiento en PROD |
|-------|-------|------------------------|--------------------------|
| Auto-activación de chats nuevos | `YcloudService.upsertChat()` | Un chat nuevo siempre arranca con `bot_activo_whcha=FALSE` / `bot_modo_whcha='ASESOR'`, sin importar `activo_manual` ni horario. Hay que activarlo manualmente por chat (`POST bot/toggle-chat` con `activar: true`) para probar el bot. | Un chat nuevo arranca con `bot_activo_whcha = BotConfigService.isBotActive(ideWhcue)` — es decir, `activo_manual OR (usa_horario AND en horario)`. Si la cuenta usa horario, un chat que llega dentro del horario configurado arranca directo en modo BOT aunque `activo_manual` esté en FALSE. |
| Horario automático | `BotConfigService.isBotActive()` + `BotScheduleService.evaluarHorarioBot()` (cron cada minuto) | `isBotActive()` ignora `usa_horario`/`estaEnHorario` — el bot global solo se activa vía `activo_manual` explícito. El cron de horario ni siquiera se ejecuta. | Funciona con normalidad: `isBotActive()` evalúa horario, y el cron corre cada minuto. |
| Chat nuevo detectado en runtime (`esChatNuevo`, sección anterior) | `BotService.processMessage()` | El gate de `MODE` corre antes que cualquier otra cosa: nunca se fuerza `bot_activo_whcha=TRUE` ni se responde, sin importar `activo_manual`/horario. Requiere activación manual por chat. | El bot **siempre** responde y fuerza `bot_activo_whcha=TRUE`, sin importar `activo_manual`/horario — es el único caso donde el toggle global no aplica. |

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
  producto_pendiente?: {              // ítem en resolución (solo ESPERANDO_CANTIDAD, flujo legacy de 1 ítem)
    ide_inarti, nombre, siglas_unidad, nombre_unidad, en_catalogo, uso_generico?: string
  }
  texto_acumulado?: string            // buffer de texto mientras el cliente sigue listando (antes de FIN)
  cola_productos?: [{ producto: string; cantidad: number | null }]  // ítems del lote aún sin resolver
  item_cantidad_conocida?: number | null  // cantidad ya detectada por GPT para el ítem que bloquea SELECCION_MULTIPLE
  pendientes_uso?: [{ ide_inarti, nombre, siglas_unidad, nombre_unidad, en_catalogo, cantidad_conocida: number|null }]
  // ítems genéricos sin match, agrupados para preguntar el uso de todos juntos (ESPERANDO_USO_LOTE)
  pendientes_cantidad?: [{ ide_inarti, nombre, siglas_unidad, nombre_unidad, en_catalogo, uso_generico?: string }]
  // ítems ya identificados sin cantidad, agrupados para preguntar todos juntos (ESPERANDO_CANTIDAD_LOTE)
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

## Métricas diarias (`wha_metrics_diaria`)

`BotScheduleService.generarMetricasDiarias()` corre a diario a las **00:05 (hora del servidor)** vía `@Cron('5 0 * * *')`, calcula métricas del día anterior por empresa (`YcloudMetricsService.generateDailyMetrics`) e inserta/actualiza (`ON CONFLICT (ide_empr, fecha_whmed) DO UPDATE`) una fila en `wha_metrics_diaria`. Requiere `ScheduleModule.forRoot()` registrado (está en `MailModule`, importado por `AppModule` — global para toda la app) y `BotScheduleService` como provider (`whatsapp.module.ts`) — la infraestructura de cron está correctamente cableada.

**Bug confirmado y corregido (2026-07-02):** `generateDailyMetrics` armaba el `INSERT INTO wha_metrics_diaria (...) SELECT ... ON CONFLICT ... DO UPDATE` usando `new SelectQuery(...)` + `dataSource.createQuery()`. Pero `createQuery()` envuelve **cualquier** `SelectQuery` en `prepareBaseQuery()` como `SELECT * FROM (<query>) AS wrapped_query` (pensado para SELECTs paginables/filtrables) — envolver un `INSERT INTO ...` así es SQL inválido. Error real visto en logs de producción: `syntax error at or near "INTO"`. Por eso la tabla quedaba completamente vacía después de varios días: el cron corría bien, pero el INSERT fallaba siempre, en cada empresa, para siempre — no era un problema de scheduling ni de datos. Corregido: `generateDailyMetrics` ahora ejecuta el SQL crudo directo contra `dataSource.pool.query(...)`, sin pasar por `SelectQuery`/`createQuery`.

**Regla general para el resto del código:** `SelectQuery` + `createQuery()`/`createSelectQuery()` es solo para SELECTs (se envuelven para paginación/filtros). Cualquier `INSERT`/`UPDATE` con lógica no soportada por `InsertQuery`/`UpdateQuery` (ej. `INSERT ... SELECT ...`, `ON CONFLICT`, subqueries complejas) debe ejecutarse con `dataSource.pool.query(sql, params)` directo, nunca envuelto en `SelectQuery`.

**Verificación rápida sin esperar al cron:** `GET whatsapp/ycloud/metrics/generate-today` genera (o actualiza) la fila de HOY para la empresa del header.

**Nota de diseño (no es la causa de la tabla vacía, pero es una limitación conocida):** `generateDailyMetrics` no filtra explícitamente por `ide_empr` en el `WHERE` de la subconsulta de `wha_mensaje`/`wha_chat` — el `JOIN` es solo por `wa_id_whmem = wa_id_whcha`. Con una sola empresa usando WhatsApp esto no afecta el resultado, pero si en el futuro hay más de una cuenta activa, las métricas por empresa se calcularían sobre el total global, no por cuenta.

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
