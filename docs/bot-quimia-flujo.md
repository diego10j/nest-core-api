# QuimIA — Bot Comercial WhatsApp DIQUIMEC

## Descripción
Asistente virtual comercial especializado en venta de materias primas y productos químicos. Diseñado para calificar leads, responder consultas informativas y generar cotizaciones automáticas vía WhatsApp usando YCloud como BSP.

---

## Flujo completo

```
Cliente escribe cualquier mensaje
        │
        ▼
[INICIO] → Guarda texto_inicial → Envía bienvenida con botones [Sí bot / No asesor]
        │
        ▼
[ESPERANDO_CONFIRMACION]
  NO/ASESOR ──→ Deriva a asesor
  SI ──→ Clasifica texto_inicial (GPT + regex)
           ├─ PRODUCTO ──────────────────────→ [PREGUNTA_ES_CLIENTE]
           ├─ UBICACION/HORARIO/ENVIO/CATALOGO → responde info → [ATENCION_LIBRE]
           └─ GENERAL ────────────────────────→ [ATENCION_LIBRE]
        │
        ▼
[ATENCION_LIBRE]
  Detecta intención (regex + GPT):
  ├─ UBICACION  → responde dirección + mapa Google Maps
  ├─ HORARIO    → responde horarios L-V / Sábado
  ├─ ENVIO      → responde info envíos nacionales
  ├─ CATALOGO   → responde links catálogo/productos
  ├─ PRODUCTO   → [PREGUNTA_ES_CLIENTE]
  └─ GENERAL    → GPT responde en contexto (prompt_sistema)
        │
        ▼
[PREGUNTA_ES_CLIENTE]  — botones: [✅ Sí, soy cliente] [❌ No]
  SI ──→ [IDENTIFICACION]
  NO ──→ [DATOS_NUEVO_CLIENTE]
        │
        ├─ [IDENTIFICACION]
        │    Pide cédula/RUC → Busca en gen_persona
        │    Encontrado:
        │      - Guarda: ide_geper, nombres, correo, telefono, direccion_registrada, ide_getid
        │      - → [SELECCION_PRODUCTOS]
        │    No encontrado → [DATOS_NUEVO_CLIENTE] (pide nombre + correo)
        │
        └─ [DATOS_NUEVO_CLIENTE]
             1. Pide nombre completo
             2. Pide correo electrónico
             Listo ──→ [SELECCION_PRODUCTOS]
        │
        ▼
[SELECCION_PRODUCTOS]
  Cliente escribe nombre de producto:
  Búsqueda 3 niveles:
    1. ILIKE exact phrase
    2. Reducción progresiva de palabras
    3. Palabras significativas (sin stop words) con score
  Resultado:
  ├─ 0 resultados → pide reformular + link catálogo
  ├─ 1 resultado  → muestra nombre (nombre/otro_nombre si match por otro_nombre)
  │                → [ESPERANDO_CANTIDAD]
  └─ N resultados → muestra lista numerada → [SELECCION_MULTIPLE]
  FIN/LISTO → [CONFIRMACION_PRODUCTOS]
        │
        ├─ [SELECCION_MULTIPLE]
        │    Cliente escribe número de opción → [ESPERANDO_CANTIDAD]
        │
        └─ [ESPERANDO_CANTIDAD]
               Extrae cantidad (regex numérico)
               Agrega producto a lista con en_catalogo y unidad
               → "¿Otro producto o FIN?" → vuelve a [SELECCION_PRODUCTOS]
        │
        ▼
[CONFIRMACION_PRODUCTOS]  — botones: [✅ Confirmar pedido] [✏️ Modificar lista]
  Resumen: lista de productos + cantidades
  MODIFICAR → reinicia [SELECCION_PRODUCTOS]
  CONFIRMAR →
        │
        ├─ Cliente registrado CON dirección guardada:
        │    "Tu dirección registrada es: XXX. ¿Usarla?"
        │    [✅ Sí, usar esta] [📝 Ingresar otra]
        │    → [DATOS_ENVIO] pendiente=usar_direccion_existente
        │
        └─ Cliente sin dirección registrada / cliente nuevo:
             → [DATOS_ENVIO] pendiente=tipo_direccion
        │
        ▼
[DATOS_ENVIO]
  pendiente=usar_direccion_existente:
    SI usar → toma direccion_registrada → pendiente=provincia
    NO usar → pendiente=tipo_direccion
  pendiente=tipo_direccion — botones: [📝 Escribir dirección] [📍 Mi ubicación]
  pendiente=direccion_texto:
    Pide "dirección completa + punto de referencia"
    → pendiente=provincia
  pendiente=esperar_ubicacion:
    WhatsApp envía location (lat, lng, name, address)
    → Geocodificación inversa con Nominatim (OSM)
    → muestra dirección obtenida
    → guarda lat, lng, dirección
    → pendiente=provincia
  pendiente=provincia:
    Pide provincia → → [DATOS_PAGO]
        │
        ▼
[DATOS_PAGO]  — botones: [💵 Efectivo] [💳 Tarjeta de crédito]
        │
        ▼
[PROCESANDO PROFORMA]
  "⏳ Espera un momento..."
  Por cada producto:
    → buscarPrecioConfigurado(ide_inarti, cantidad, ideEmpr)
    → si precio: calcula con/sin IVA → precio_unitario, precio_total
  Condiciones:
    AUTOMÁTICA: todos tienen precio AND todos en catálogo
    CON_PRECIO:  todos tienen precio BUT alguno fuera de catálogo
    BORRADOR:    algún producto sin precio configurado
  → createProformaWeb (Solicitante, detalles)
  → UPDATE cabecera:
      ide_cctpr=3(WhatsApp), referencia='WhatsApp'
      ide_ccvap=6, ide_ccten=0
      ide_geper (cliente real o 7712)
      identificac_cccpr, ide_getid (del cliente)
      correo_cccpr, telefono_cccpr (formato local 0XXXXXXXXX)
      direccion_cccpr (dirección de entrega)
  → UPDATE detalles: precio_ccdpr, total_ccdpr, iva_inarti_ccdpr
  → UPDATE cabecera totales: base_grabada, valor_iva, total (con IVA actual)
  → Validar total > 0 antes de PDF

  AUTOMÁTICA + total>0:
    → asignarVendedor(ide_usua=32, ide_vgven=3)
    → generateProformaPdf → guardar en whatsapp_media/
    → Enviar texto con resumen + link descarga PDF
    → Botones [🛒 Nueva cotización] [👤 Hablar con asesor]
    → [FINALIZADO]

  CON_PRECIO / BORRADOR:
    → "Cotización #XXX registrada. Un asesor será asignado..."
    → derivar a ASESOR (con nota interna)
    → [FINALIZADO]

[FINALIZADO]
  pendiente_campo en sesión:
  NUEVA_COTIZACION → reinicia → [PREGUNTA_ES_CLIENTE]
  HABLAR_ASESOR   → deriva a asesor
  Otro mensaje    → "¿Puedo ayudarte con algo más?" + botones
```

---

## Comandos especiales (cualquier estado)

| Comando | Acción |
|---------|--------|
| `SALIR` | Deriva inmediatamente a asesor |
| `ASESOR`, `AGENTE`, `HUMANO`, `PERSONA`, `VENDEDOR` | Deriva a asesor |
| `FIN`, `LISTO` | Finaliza selección de productos |
| Saludo (`Hola`, `Buenas`, etc.) en estado activo | Resetea sesión → INICIO |

**Sesiones**: expiran tras 4h de inactividad → nueva sesión en INICIO.

---

## Respuestas informativas hardcodeadas

### 📍 Ubicación
- Calles Jacinto Jijón y Caamaño & Paseo 7, Valle de los Chillos
- Referencia: Estadio del Independiente del Valle
- Link Google Maps incluido
- Nota: envíos a nivel nacional disponibles

### 🕒 Horarios
- Lunes a Viernes: 08:00 — 17:00
- Sábados: 09:00 — 13:00

### 🚚 Envíos
- Nacionales, transporte a elección del cliente

### 📦 Catálogo
- Catálogos por sector: https://diquimec.com.ec/catalogo
- Listado completo: https://diquimec.com.ec/product

---

## Búsqueda de productos (3 niveles)

1. **ILIKE exacto** — `nombre_inarti ILIKE '%texto%' OR otro_nombre_inarti ILIKE '%texto%'`
2. **Reducción progresiva** — quita una palabra por iteración hasta encontrar match
3. **Palabras significativas** — elimina stop words, busca OR con score ≥ 2 palabras coincidentes

Cuando coincide por `otro_nombre_inarti` (no por nombre principal) → muestra `NOMBRE / OTRO_NOMBRE`.

---

## Geocodificación inversa

Cuando el cliente comparte ubicación WhatsApp:
- Se capturan lat, lng desde el webhook `data.location`
- Se llama a **Nominatim (OpenStreetMap)**: `GET /reverse?lat={lat}&lon={lng}&format=json&accept-language=es`
- Se extrae: road + house_number + suburb + city
- Se guarda en `EnvioSesion.direccion` (texto), `.latitud`, `.longitud`
- El cliente ve la dirección obtenida confirmada en el chat

---

## Configuración técnica

### Proforma WhatsApp — constantes
```typescript
IDE_CCTPR_WHATSAPP  = 3   // Tipo proforma WhatsApp
IDE_CCVAP_WHATSAPP  = 6   // Canal de venta
IDE_CCTEN_WHATSAPP  = 0   // ide_ccten
REFERENCIA          = 'WhatsApp'
IDE_USUA_BOT        = 32  // Usuario bot (cotización automática)
IDE_VGVEN_DEFAULT   = 3   // Vendedor por defecto
```

### Teléfono formato local
`+593983113543` → `0983113543` (función `toLocalPhone`, equivale a SQL `f_phone_number`)

### Variables de estado (wha_bot_sesion.datos_sesion JSONB)
```typescript
{
  texto_inicial?: string
  cliente?: {
    ide_geper?: number          // PK gen_persona (cliente registrado)
    ide_getid?: number          // Tipo de identificación
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
    cantidad: number
    siglas_unidad: string
    en_catalogo: boolean
    precio_unitario?: number
    precio_total?: number
    tiene_precio?: boolean
  }]
  envio?: {
    direccion?: string
    provincia?: string
    latitud?: number
    longitud?: number
    pendiente_campo?: 'usar_direccion_existente' | 'tipo_direccion' |
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
| `BotService` | Máquina de estados, orquestación |
| `BotConfigService` | Config bot desde wha_bot_config (Redis 60s) |
| `BotSessionService` | Sesiones TTL 4h en wha_bot_sesion |
| `BotToolsService` | Queries BD: clientes (con dirección), productos (búsqueda 3 niveles), precios |
| `BotGptService` | OpenAI: clasificación intenciones, extracción, generación |
| `BotProformaService` | Creación proforma + precios + totales cabecera |
| `YcloudService` | Envío mensajes/botones/documentos, geocodificación inversa (Nominatim) |
| `FileTempService` | Guardado PDF en whatsapp_media/ |

---

## Mejoras sugeridas

### Corto plazo
1. **Template aprobado**: reemplazar mensaje de texto bienvenida por template WhatsApp Business cuando esté aprobado (pendiente en `handleInicio`).
2. **Botones interactivos en más pasos**: el paso de provincia podría tener botones con las provincias más frecuentes (Pichincha, Guayas, etc.).
3. **Resumen previo a pago**: mostrar dirección + provincia + forma de pago antes de crear proforma para que el cliente confirme todo.
4. **Historial de cotizaciones**: en clientes registrados, mostrar "tu última cotización fue #XXX" para reorden rápido.

### Mediano plazo
5. **Actualizar gen_persona**: cuando un cliente registrado cambia su dirección via bot, ofrecer actualizar la BD.
6. **Imágenes de productos**: en selección múltiple, enviar foto del producto si existe en el catálogo.
7. **Stock en tiempo real**: informar disponibilidad inmediata al mostrar el producto.
8. **Notificación al cliente**: cuando el asesor completa la cotización borrador, notificar al cliente via WhatsApp automáticamente.
9. **GPT con RAG**: alimentar el modelo con fichas técnicas de productos para respuestas más precisas sobre composición, usos y aplicaciones.

### Largo plazo
10. **Pedido automático**: cuando el cliente confirma y paga, generar orden de venta directamente.
11. **Dashboard analítico**: tasa de conversión, productos más cotizados, abandono por estado, tiempo promedio de respuesta.
12. **Multi-idioma**: soporte básico para inglés (clientes de importación/exportación).
13. **Integración pagos**: link de pago directo en el mensaje de cotización (Payphone, Kushki).
